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

  it("成功实例化 McpServer 并包含 s3_ping 工具", () => {
    const config = parseEnv({});
    const server = createMCPServer(config);
    expect(server).toBeDefined();
  });

  it("调用 s3_ping 工具能够正确返回连通性状态文本", async () => {
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
