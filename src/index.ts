/**
 * MCP Server 核心装配入口 (Coordinator)
 *
 * @author Ateng
 * @since 2026-10-04
 */

import { type S3Client } from "@aws-sdk/client-s3";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import dotenv from "dotenv";
import { printHelp, resolveConfigWithCli } from "./config/cli.js";
import { parseEnv } from "./config/env.js";
import { getS3Client } from "./connection/s3-client-factory.js";
import { ContentTruncator } from "./security/content-truncator.js";
import { ReadOnlyGuard } from "./security/readonly-guard.js";
import { SandboxGuard } from "./security/sandbox-guard.js";
import {
  copyObject,
  deleteObject,
  deleteObjectsBatch,
  deleteObjectsByPrefix,
  moveObject,
} from "./services/batch-service.js";
import {
  createBucket,
  deleteBucket,
  getBucketLocation,
  listBuckets,
} from "./services/bucket-service.js";
import {
  listObjects,
  readObjectRange,
  readObjectText,
  searchObjects,
  statObject,
} from "./services/object-service.js";
import { getPresignedUrl } from "./services/presign-service.js";
import { executeS3Ping } from "./services/probe-service.js";
import { getObjectTags, setObjectTags } from "./services/tag-service.js";
import {
  downloadFile,
  putObjectText,
  uploadFile,
} from "./services/transfer-service.js";
import type { AppConfig } from "./types/config.js";
import {
  CopyObjectSchema,
  CreateBucketSchema,
  DeleteBucketSchema,
  DeleteObjectSchema,
  DeleteObjectsBatchSchema,
  DeleteObjectsByPrefixSchema,
  DownloadFileSchema,
  GetBucketLocationSchema,
  GetObjectTagsSchema,
  GetPresignedUrlSchema,
  ListBucketsSchema,
  ListObjectsSchema,
  MoveObjectSchema,
  PutObjectTextSchema,
  ReadObjectRangeSchema,
  ReadObjectTextSchema,
  S3PingSchema,
  SearchObjectsSchema,
  SetObjectTagsSchema,
  StatObjectSchema,
  UploadFileSchema,
} from "./types/tools.js";

import { startSSEServer } from "./server/sse-server.js";

// 1. 初始化环境变量配置
dotenv.config();

// 2. 导出所有核心契约、配置中枢、连接工厂、安全守卫与服务
export * from "./types/index.js";
export * from "./config/env.js";
export * from "./connection/s3-client-factory.js";
export * from "./security/index.js";
export * from "./services/probe-service.js";
export * from "./services/bucket-service.js";
export * from "./services/object-service.js";
export * from "./services/transfer-service.js";
export * from "./services/presign-service.js";
export * from "./services/batch-service.js";
export * from "./services/tag-service.js";
export * from "./server/sse-server.js";

/**
 * 通用工具执行函数包装器 (统一错误捕获与响应格式化，消除重复样板代码)
 *
 * @param handler 业务执行函数
 * @return 符合 MCP 协议的工具回调包装函数
 */
function wrapToolHandler<T>(handler: (args: T) => Promise<unknown>) {
  return async (args: T) => {
    try {
      const result = await handler(args);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (error: unknown) {
      return {
        isError: true,
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                status: "error",
                message: error instanceof Error ? error.message : String(error),
              },
              null,
              2
            ),
          },
        ],
      };
    }
  };
}

declare const __APP_VERSION__: string | undefined;

export const SERVER_VERSION = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";

/**
 * 组装并配置 MCP Server 实例
 *
 * @param config 应用全局配置
 * @param customClient 可选自定义 S3Client 实例 (主要用于单测与依赖注入)
 * @return 配置完成的 McpServer 实例
 */
export function createMCPServer(config: AppConfig = parseEnv(), customClient?: S3Client): McpServer {
  const server = new McpServer({
    name: "mcp-server-s3",
    version: SERVER_VERSION,
  });

  const client = customClient ?? getS3Client(config);
  const readOnlyGuard = new ReadOnlyGuard(config.readOnly);
  const sandboxGuard = new SandboxGuard(config.allowedLocalDir);
  const contentTruncator = new ContentTruncator({ maxBytes: config.maxReadBytes });

  // -------------------------------------------------------------
  // 套件 0: 自省诊断 (s3_ping)
  // -------------------------------------------------------------
  if (readOnlyGuard.isToolAllowed("s3_ping")) {
    server.tool(
      "s3_ping",
      "毫秒级自检端点连通性、网络 RTT、生效 Region 与脱敏鉴权身份",
      S3PingSchema.shape,
      wrapToolHandler(async () => executeS3Ping(client, config))
    );
  }

  // -------------------------------------------------------------
  // 套件 1: 存储桶生命周期 (list_buckets, create_bucket, delete_bucket, get_bucket_location)
  // -------------------------------------------------------------
  if (readOnlyGuard.isToolAllowed("list_buckets")) {
    server.tool(
      "list_buckets",
      "列出所有存储桶名称及创建时间列表",
      ListBucketsSchema.shape,
      wrapToolHandler(async () => listBuckets(client))
    );
  }

  if (readOnlyGuard.isToolAllowed("create_bucket")) {
    server.tool(
      "create_bucket",
      "创建新存储桶（支持指定部署区域）",
      CreateBucketSchema.shape,
      wrapToolHandler(async (args) => {
        readOnlyGuard.assertToolAllowed("create_bucket");
        return createBucket(client, args.bucket, args.region);
      })
    );
  }

  if (readOnlyGuard.isToolAllowed("delete_bucket")) {
    server.tool(
      "delete_bucket",
      "删除存储桶（支持 force 参数强制清理桶内对象后删除）",
      DeleteBucketSchema.shape,
      wrapToolHandler(async (args) => {
        readOnlyGuard.assertToolAllowed("delete_bucket");
        return deleteBucket(client, args.bucket, args.force);
      })
    );
  }

  if (readOnlyGuard.isToolAllowed("get_bucket_location")) {
    server.tool(
      "get_bucket_location",
      "查询存储桶的物理实际部署地域",
      GetBucketLocationSchema.shape,
      wrapToolHandler(async (args) => getBucketLocation(client, args.bucket))
    );
  }

  // -------------------------------------------------------------
  // 套件 2: 检索探索定位 (list_objects, search_objects, stat_object)
  // -------------------------------------------------------------
  if (readOnlyGuard.isToolAllowed("list_objects")) {
    server.tool(
      "list_objects",
      "模拟分层虚拟目录树（Delimiter 默认为 /），支持游标分页",
      ListObjectsSchema.shape,
      wrapToolHandler(async (args) => listObjects(client, args, config.defaultBucket))
    );
  }

  if (readOnlyGuard.isToolAllowed("search_objects")) {
    server.tool(
      "search_objects",
      "在前缀路径树中执行关键字匹配与正则搜索",
      SearchObjectsSchema.shape,
      wrapToolHandler(async (args) => searchObjects(client, args, config.defaultBucket))
    );
  }

  if (readOnlyGuard.isToolAllowed("stat_object")) {
    server.tool(
      "stat_object",
      "提取对象大小、Content-Type、最后修改时间、ETag 及元数据",
      StatObjectSchema.shape,
      wrapToolHandler(async (args) => statObject(client, args, config.defaultBucket))
    );
  }

  // -------------------------------------------------------------
  // 套件 3: 内容检视分块 (read_object_text, read_object_range)
  // -------------------------------------------------------------
  if (readOnlyGuard.isToolAllowed("read_object_text")) {
    server.tool(
      "read_object_text",
      "文本直读，受 256KB 阈值截断保护，二进制文件智能拦截引导",
      ReadObjectTextSchema.shape,
      wrapToolHandler(async (args) =>
        readObjectText(client, args, contentTruncator, config.defaultBucket)
      )
    );
  }

  if (readOnlyGuard.isToolAllowed("read_object_range")) {
    server.tool(
      "read_object_range",
      "HTTP Range 字节范围读取（适用于大对象末尾排障与对象头检视）",
      ReadObjectRangeSchema.shape,
      wrapToolHandler(async (args) =>
        readObjectRange(client, args, config.defaultBucket, contentTruncator)
      )
    );
  }

  // -------------------------------------------------------------
  // 套件 4: 双向流式传输与预签名直链 (put_object_text, upload_file, download_file, get_presigned_url)
  // -------------------------------------------------------------
  if (readOnlyGuard.isToolAllowed("put_object_text")) {
    server.tool(
      "put_object_text",
      "文本直接写入或覆盖对象",
      PutObjectTextSchema.shape,
      wrapToolHandler(async (args) => {
        readOnlyGuard.assertToolAllowed("put_object_text");
        return putObjectText(client, args, config.defaultBucket);
      })
    );
  }

  if (readOnlyGuard.isToolAllowed("upload_file")) {
    server.tool(
      "upload_file",
      "本地文件流式上传至 S3（受本地工作区沙箱严格约束保护）",
      UploadFileSchema.shape,
      wrapToolHandler(async (args) => {
        readOnlyGuard.assertToolAllowed("upload_file");
        return uploadFile(client, args, sandboxGuard, config.defaultBucket);
      })
    );
  }

  if (readOnlyGuard.isToolAllowed("download_file")) {
    server.tool(
      "download_file",
      "S3 对象流式保存为本地文件（受本地工作区沙箱保护）",
      DownloadFileSchema.shape,
      wrapToolHandler(async (args) => downloadFile(client, args, sandboxGuard, config.defaultBucket))
    );
  }

  if (readOnlyGuard.isToolAllowed("get_presigned_url")) {
    server.tool(
      "get_presigned_url",
      "生成带有时效的预签名 HTTP(S) 直链（支持 GET 下载与 PUT 上传）",
      GetPresignedUrlSchema.shape,
      wrapToolHandler(async (args) =>
        getPresignedUrl(client, args, readOnlyGuard, config.defaultBucket, config.presignedExpires)
      )
    );
  }

  // -------------------------------------------------------------
  // 套件 5: 批处理与标签治理 (copy_object, move_object, delete_object, delete_objects_batch, delete_objects_by_prefix, get_object_tags, set_object_tags)
  // -------------------------------------------------------------
  if (readOnlyGuard.isToolAllowed("copy_object")) {
    server.tool(
      "copy_object",
      "同桶或跨桶对象复制",
      CopyObjectSchema.shape,
      wrapToolHandler(async (args) => {
        readOnlyGuard.assertToolAllowed("copy_object");
        return copyObject(client, args, config.defaultBucket);
      })
    );
  }

  if (readOnlyGuard.isToolAllowed("move_object")) {
    server.tool(
      "move_object",
      "原子化移动与重命名对象（复制成功后自动删除源对象）",
      MoveObjectSchema.shape,
      wrapToolHandler(async (args) => {
        readOnlyGuard.assertToolAllowed("move_object");
        return moveObject(client, args, config.defaultBucket);
      })
    );
  }

  if (readOnlyGuard.isToolAllowed("delete_object")) {
    server.tool(
      "delete_object",
      "删除指定的单个对象",
      DeleteObjectSchema.shape,
      wrapToolHandler(async (args) => {
        readOnlyGuard.assertToolAllowed("delete_object");
        return deleteObject(client, args, config.defaultBucket);
      })
    );
  }

  if (readOnlyGuard.isToolAllowed("delete_objects_batch")) {
    server.tool(
      "delete_objects_batch",
      "批量删除指定的多个对象键列表（单批上限 1000 个对象）",
      DeleteObjectsBatchSchema.shape,
      wrapToolHandler(async (args) => {
        readOnlyGuard.assertToolAllowed("delete_objects_batch");
        return deleteObjectsBatch(client, args, config.defaultBucket);
      })
    );
  }

  if (readOnlyGuard.isToolAllowed("delete_objects_by_prefix")) {
    server.tool(
      "delete_objects_by_prefix",
      "递归清理虚拟子目录树，内置三重防灾熔断守卫",
      DeleteObjectsByPrefixSchema.shape,
      wrapToolHandler(async (args) => {
        readOnlyGuard.assertToolAllowed("delete_objects_by_prefix");
        return deleteObjectsByPrefix(client, args, config.defaultBucket);
      })
    );
  }

  if (readOnlyGuard.isToolAllowed("get_object_tags")) {
    server.tool(
      "get_object_tags",
      "查询对象关联的 Key-Value 标签字典",
      GetObjectTagsSchema.shape,
      wrapToolHandler(async (args) => getObjectTags(client, args, config.defaultBucket))
    );
  }

  if (readOnlyGuard.isToolAllowed("set_object_tags")) {
    server.tool(
      "set_object_tags",
      "写入或全量覆盖对象业务标签",
      SetObjectTagsSchema.shape,
      wrapToolHandler(async (args) => {
        readOnlyGuard.assertToolAllowed("set_object_tags");
        return setObjectTags(client, args, config.defaultBucket);
      })
    );
  }

  return server;
}

export { printHelp, resolveConfigWithCli } from "./config/cli.js";

/**
 * 启动 MCP 传输服务引擎 (根据配置自动分流 Stdio 或 SSE 双模，CLI Flags 优先于环境变量)
 *
 * @param customConfig 可选覆盖应用全局配置
 * @param argv 可选命令行参数 (默认 process.argv.slice(2))
 * @return 运行模式元数据与关闭句柄
 */
export async function runServer(
  customConfig?: AppConfig,
  argv?: string[]
): Promise<{ mode: "stdio" | "sse"; close?: () => Promise<void> }> {
  let config: AppConfig;

  if (customConfig) {
    config = customConfig;
  } else {
    const { config: resolvedConfig, isHelp, isVersion } = resolveConfigWithCli(argv);
    if (isHelp) {
      printHelp();
      process.exit(0);
    }
    if (isVersion) {
      process.stdout.write(`${SERVER_VERSION}\n`);
      process.exit(0);
    }
    config = resolvedConfig;
  }

  if (config.transport === "sse") {
    const sseInstance = await startSSEServer(
      () => createMCPServer(config),
      config.serverHost,
      config.serverPort,
      config.apiKey
    );
    process.stderr.write(
      `[mcp-server-s3] HTTP SSE 传输服务已启动，监听地址: http://${config.serverHost}:${sseInstance.port}\n` +
      `  - SSE 事件流端点: http://${config.serverHost}:${sseInstance.port}/sse\n` +
      `  - 消息交互端点: http://${config.serverHost}:${sseInstance.port}/message\n` +
      `  - 容器就绪探针: http://${config.serverHost}:${sseInstance.port}/health\n`
    );

    const onSignal = async () => {
      await sseInstance.close();
      process.exit(0);
    };
    process.once("SIGINT", onSignal);
    process.once("SIGTERM", onSignal);

    return { mode: "sse", close: sseInstance.close };
  }

  const server = createMCPServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  return { mode: "stdio" };
}

// 主模块直接启动时执行
const isDirectRun =
  process.env.NODE_ENV !== "test" &&
  process.argv[1] &&
  (process.argv[1].endsWith("index.js") || process.argv[1].endsWith("index.ts"));

if (isDirectRun) {
  runServer().catch((error: unknown) => {
    process.stderr.write(
      `[mcp-server-s3] 服务启动失败: ${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exit(1);
  });
}
