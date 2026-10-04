/**
 * S3 连通性自省探针单元测试
 *
 * @author Ateng
 * @since 2026-10-04
 */

import { HeadBucketCommand, ListBucketsCommand, S3Client } from "@aws-sdk/client-s3";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it } from "vitest";
import { parseEnv } from "../config/env.js";
import { executeS3Ping } from "./probe-service.js";

const s3Mock = mockClient(S3Client);

describe("S3 自省连通性探针 (s3_ping)", () => {
  beforeEach(() => {
    s3Mock.reset();
  });

  it("当无默认存储桶且 S3 响应正常时，发起 ListBuckets 并返回状态为 ok 及测量 RTT", async () => {
    s3Mock.on(ListBucketsCommand).resolves({
      Buckets: [{ Name: "test-bucket", CreationDate: new Date() }],
    });

    const config = parseEnv({
      MCP_S3_ENDPOINT: "http://127.0.0.1:9000",
      MCP_S3_REGION: "us-east-1",
      MCP_S3_ACCESS_KEY_ID: "AKIAIOSFODNN7EXAMPLE",
      MCP_S3_SECRET_ACCESS_KEY: "secret123",
    });

    const client = new S3Client({ region: "us-east-1" });
    const result = await executeS3Ping(client, config);

    expect(result.status).toBe("ok");
    expect(result.endpoint).toBe("http://127.0.0.1:9000");
    expect(result.region).toBe("us-east-1");
    expect(result.accessKeyIdMasked).toBe("AKIA...MPLE");
    expect(result.rttMs).toBeGreaterThanOrEqual(0);
    expect(result.message).toContain("正常");
  });

  it("当配置了默认存储桶时，优先针对目标存储桶发起 HeadBucket 探活", async () => {
    s3Mock.on(HeadBucketCommand).resolves({});

    const config = parseEnv({
      MCP_S3_ENDPOINT: "http://127.0.0.1:9000",
      MCP_S3_REGION: "us-east-1",
      MCP_S3_DEFAULT_BUCKET: "my-target-bucket",
    });

    const client = new S3Client({ region: "us-east-1" });
    const result = await executeS3Ping(client, config);

    expect(result.status).toBe("ok");
    expect(result.message).toContain("正常");
    expect(s3Mock.commandCalls(HeadBucketCommand)).toHaveLength(1);
    expect(s3Mock.commandCalls(ListBucketsCommand)).toHaveLength(0);
  });

  it("当遇到 AccessDenied 权限拦截时，返回 status 为 error 并清晰诊断权限受限", async () => {
    const error = new Error("Access Denied");
    error.name = "AccessDenied";
    s3Mock.on(ListBucketsCommand).rejects(error);

    const config = parseEnv({
      MCP_S3_ENDPOINT: "https://s3.amazonaws.com",
      MCP_S3_REGION: "us-east-1",
      MCP_S3_ACCESS_KEY_ID: "AKIAIOSFODNN7EXAMPLE",
      MCP_S3_SECRET_ACCESS_KEY: "secret123",
    });

    const client = new S3Client({ region: "us-east-1" });
    const result = await executeS3Ping(client, config);

    expect(result.status).toBe("error");
    expect(result.message).toContain("权限受限");
    expect(result.rttMs).toBeGreaterThanOrEqual(0);
  });

  it("当网络连接拒绝或不可达时，返回 status 为 error 与错误描述", async () => {
    const networkError = new Error("connect ECONNREFUSED 127.0.0.1:9000");
    s3Mock.on(ListBucketsCommand).rejects(networkError);

    const config = parseEnv({
      MCP_S3_ENDPOINT: "http://127.0.0.1:9000",
      MCP_S3_REGION: "us-east-1",
    });

    const client = new S3Client({ region: "us-east-1" });
    const result = await executeS3Ping(client, config);

    expect(result.status).toBe("error");
    expect(result.message).toContain("ECONNREFUSED");
    expect(result.rttMs).toBeGreaterThanOrEqual(0);
  });

  it("当捕获非对象类型或 null 异常时，防御性安全处理不抛出 NPE", async () => {
    s3Mock.on(ListBucketsCommand).rejects("裸字符串网络超时错误");

    const config = parseEnv({});
    const client = new S3Client({ region: "us-east-1" });
    const result = await executeS3Ping(client, config);

    expect(result.status).toBe("error");
    expect(result.message).toContain("裸字符串网络超时错误");
  });
});
