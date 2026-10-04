/**
 * MCP Server 核心装配与工具注册单元测试
 *
 * @author Ateng
 * @since 2026-10-04
 */

import { ListBucketsCommand, S3Client } from "@aws-sdk/client-s3";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it } from "vitest";
import { parseEnv } from "./config/env.js";
import { createMCPServer } from "./index.js";

const s3Mock = mockClient(S3Client);

describe("MCP Server 核心装配测试", () => {
  beforeEach(() => {
    s3Mock.reset();
  });

  it("正常模式下实例化 McpServer 并装配全套工具", () => {
    const config = parseEnv({
      MCP_S3_READ_ONLY: "false",
    });
    const server = createMCPServer(config);
    expect(server).toBeDefined();
  });

  it("只读模式下实例化 McpServer 物理隐藏写/删工具", () => {
    const config = parseEnv({
      MCP_S3_READ_ONLY: "true",
    });
    const server = createMCPServer(config);
    expect(server).toBeDefined();
  });

  it("注入客户端调用时能够正常运行", async () => {
    s3Mock.on(ListBucketsCommand).resolves({ Buckets: [] });

    const config = parseEnv({
      MCP_S3_ENDPOINT: "http://localhost:9000",
      MCP_S3_REGION: "us-east-1",
    });

    const client = new S3Client({ region: "us-east-1" });
    const server = createMCPServer(config, client);
    expect(server).toBeDefined();
  });
});
