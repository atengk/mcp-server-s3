/**
 * S3 客户端单例工厂单元测试
 *
 * @author Ateng
 * @since 2026-10-04
 */

import { S3Client } from "@aws-sdk/client-s3";
import { beforeEach, describe, expect, it } from "vitest";
import { parseEnv } from "../config/env.js";
import {
  createS3Client,
  getS3Client,
  getS3ClientConfig,
  resetS3Client,
} from "./s3-client-factory.js";

describe("S3 客户端工厂测试 (s3-client-factory)", () => {
  beforeEach(() => {
    resetS3Client();
  });

  it("createS3Client 每次创建全新客户端实例", () => {
    const config = parseEnv({
      MCP_S3_REGION: "us-west-2",
      MCP_S3_ENDPOINT: "http://localhost:9000",
    });

    const client1 = createS3Client(config);
    const client2 = createS3Client(config);

    expect(client1).toBeInstanceOf(S3Client);
    expect(client2).toBeInstanceOf(S3Client);
    expect(client1).not.toBe(client2);
  });

  it("getS3Client 实现单例缓存与复用", () => {
    const config = parseEnv({
      MCP_S3_REGION: "us-west-2",
    });

    const client1 = getS3Client(config);
    const client2 = getS3Client();

    expect(client1).toBeInstanceOf(S3Client);
    expect(client1).toBe(client2);
  });

  it("resetS3Client 销毁并重置单例实例", () => {
    const config = parseEnv({
      MCP_S3_REGION: "us-west-2",
    });

    const client1 = getS3Client(config);
    resetS3Client();
    const client2 = getS3Client(config);

    expect(client1).not.toBe(client2);
  });

  it("当配置特征发生变更时，getS3Client 自动感知并重建客户端", () => {
    const config1 = parseEnv({
      MCP_S3_REGION: "us-west-2",
    });
    const client1 = getS3Client(config1);

    const config2 = parseEnv({
      MCP_S3_REGION: "eu-central-1",
    });
    const client2 = getS3Client(config2);

    expect(client1).not.toBe(client2);
  });

  it("getS3ClientConfig 准确提取配置参数", () => {
    const config = parseEnv({
      MCP_S3_REGION: "ap-southeast-1",
      MCP_S3_ENDPOINT: "https://oss-ap-southeast-1.aliyuncs.com",
      MCP_S3_ACCESS_KEY_ID: "ak123",
      MCP_S3_SECRET_ACCESS_KEY: "sk123",
      MCP_S3_FORCE_PATH_STYLE: "true",
    });

    const clientConfig = getS3ClientConfig(config);
    expect(clientConfig.region).toBe("ap-southeast-1");
    expect(clientConfig.endpoint).toBe("https://oss-ap-southeast-1.aliyuncs.com");
    expect(clientConfig.forcePathStyle).toBe(true);
    expect(clientConfig.credentials).toEqual({
      accessKeyId: "ak123",
      secretAccessKey: "sk123",
      sessionToken: undefined,
    });
  });
});
