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
import { createS3Client } from "./connection/s3-client-factory.js";
import { executeS3Ping } from "./services/probe-service.js";
import type { AppConfig } from "./types/config.js";
import { S3PingSchema } from "./types/tools.js";

// 1. 初始化环境变量配置
dotenv.config();

// 2. 导出所有核心契约、配置中枢与连接工厂
export * from "./types/index.js";
export * from "./config/env.js";
export * from "./connection/s3-client-factory.js";
export * from "./services/probe-service.js";

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

  const client = customClient ?? createS3Client(config);

  // 注册 s3_ping 自省探针工具 (ADR-0005)
  server.tool(
    "s3_ping",
    "毫秒级自检端点连通性、网络 RTT、生效 Region 与脱敏鉴权身份",
    S3PingSchema.shape,
    async () => {
      const result = await executeS3Ping(client, config);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }
  );

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
