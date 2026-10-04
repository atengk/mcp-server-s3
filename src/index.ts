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
import { parseEnv } from "./config/env.js";
import { getS3Client } from "./connection/s3-client-factory.js";
import { ContentTruncator } from "./security/content-truncator.js";
import { ReadOnlyGuard } from "./security/readonly-guard.js";
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
import { executeS3Ping } from "./services/probe-service.js";
import type { AppConfig } from "./types/config.js";
import {
  CreateBucketSchema,
  DeleteBucketSchema,
  GetBucketLocationSchema,
  ListBucketsSchema,
  ListObjectsSchema,
  ReadObjectRangeSchema,
  ReadObjectTextSchema,
  S3PingSchema,
  SearchObjectsSchema,
  StatObjectSchema,
} from "./types/tools.js";

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
    version: "1.0.0",
  });

  const client = customClient ?? getS3Client(config);
  const readOnlyGuard = new ReadOnlyGuard(config.readOnly);
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

  return server;
}

/**
 * 启动默认 Stdio 传输通道
 */
export async function runServer(): Promise<void> {
  const config = parseEnv();
  const server = createMCPServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
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
