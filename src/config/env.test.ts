/**
 * 环境变量解析器与配置中枢单元测试
 *
 * @author Ateng
 * @since 2026-10-04
 */

import { describe, expect, it } from "vitest";
import { getS3ClientConfig } from "../connection/s3-client-factory.js";
import {
  getEnvValue,
  maskAccessKey,
  maskSensitiveConfig,
  parseBoolean,
  parseEnv,
  parseNumber,
  parsePort,
  parsePositiveInt,
} from "./env.js";

describe("env 配置解析中枢测试", () => {
  describe("getEnvValue - 规范优先级与向下兼容", () => {
    it("优先读取规范前缀 (MCP_S3_*)", () => {
      const env = {
        MCP_S3_REGION: "ap-southeast-1",
        AWS_REGION: "us-west-2",
      };
      const result = getEnvValue(env, "MCP_S3_REGION", ["AWS_REGION"]);
      expect(result).toBe("ap-southeast-1");
    });

    it("规范前缀缺失时降级读取兼容键 (AWS_*)", () => {
      const env = {
        AWS_REGION: "us-west-2",
      };
      const result = getEnvValue(env, "MCP_S3_REGION", ["AWS_REGION", "AWS_DEFAULT_REGION"]);
      expect(result).toBe("us-west-2");
    });

    it("规范前缀为空白字符时自动跳过并读取备选键", () => {
      const env = {
        MCP_S3_REGION: "   ",
        AWS_REGION: "cn-north-1",
      };
      const result = getEnvValue(env, "MCP_S3_REGION", ["AWS_REGION"]);
      expect(result).toBe("cn-north-1");
    });

    it("均无配置时返回 undefined", () => {
      const env = {};
      const result = getEnvValue(env, "MCP_S3_REGION", ["AWS_REGION"]);
      expect(result).toBeUndefined();
    });
  });

  describe("parseBoolean - 宽容布尔值转换", () => {
    it("正确识别真值 (1, true, yes, on, t) 且大小写不敏感", () => {
      expect(parseBoolean("1", false)).toBe(true);
      expect(parseBoolean("true", false)).toBe(true);
      expect(parseBoolean("TRUE", false)).toBe(true);
      expect(parseBoolean("yes", false)).toBe(true);
      expect(parseBoolean("YES", false)).toBe(true);
      expect(parseBoolean("on", false)).toBe(true);
      expect(parseBoolean("t", false)).toBe(true);
    });

    it("正确识别假值 (0, false, no, off, f, 空串) 且大小写不敏感", () => {
      expect(parseBoolean("0", true)).toBe(false);
      expect(parseBoolean("false", true)).toBe(false);
      expect(parseBoolean("FALSE", true)).toBe(false);
      expect(parseBoolean("no", true)).toBe(false);
      expect(parseBoolean("off", true)).toBe(false);
      expect(parseBoolean("f", true)).toBe(false);
      expect(parseBoolean("", true)).toBe(false);
      expect(parseBoolean("  ", true)).toBe(false);
    });

    it("未定义或无法识别时返回默认值", () => {
      expect(parseBoolean(undefined, true)).toBe(true);
      expect(parseBoolean(undefined, false)).toBe(false);
      expect(parseBoolean("unknown_value", true)).toBe(true);
      expect(parseBoolean("unknown_value", false)).toBe(false);
    });
  });

  describe("parseNumber - 通用数值安全解析", () => {
    it("正确解析有效数值", () => {
      expect(parseNumber("100", 50, "TEST_FIELD")).toBe(100);
      expect(parseNumber(undefined, 50, "TEST_FIELD")).toBe(50);
      expect(parseNumber("0", 50, "TEST_FIELD", 0)).toBe(0);
    });

    it("非数字抛出异常", () => {
      expect(() => parseNumber("invalid", 50, "TEST_FIELD")).toThrow("必须为数字");
    });

    it("超出上下限区间抛出异常", () => {
      expect(() => parseNumber("-1", 50, "TEST_FIELD", 0, 100)).toThrow("超出有效范围");
      expect(() => parseNumber("101", 50, "TEST_FIELD", 0, 100)).toThrow("超出有效范围");
    });
  });

  describe("parsePort - 端口校验与解析", () => {
    it("正确解析有效端口号", () => {
      expect(parsePort("9000", 8000, "MCP_S3_SERVER_PORT")).toBe(9000);
      expect(parsePort(undefined, 8000, "MCP_S3_SERVER_PORT")).toBe(8000);
    });

    it("非法非数字抛出异常", () => {
      expect(() => parsePort("abc", 8000, "MCP_S3_SERVER_PORT")).toThrow("必须为数字");
    });

    it("超出有效区间 (1-65535) 抛出异常", () => {
      expect(() => parsePort("0", 8000, "MCP_S3_SERVER_PORT")).toThrow("超出有效范围");
      expect(() => parsePort("65536", 8000, "MCP_S3_SERVER_PORT")).toThrow("超出有效范围");
    });
  });

  describe("parsePositiveInt - 正整数解析", () => {
    it("正确解析有效正整数", () => {
      expect(parsePositiveInt("5000", 1000, "TEST_PARAM")).toBe(5000);
      expect(parsePositiveInt(undefined, 1000, "TEST_PARAM")).toBe(1000);
    });

    it("非法数字或小于等于 0 抛出异常", () => {
      expect(() => parsePositiveInt("abc", 1000, "TEST_PARAM")).toThrow("必须为数字");
      expect(() => parsePositiveInt("0", 1000, "TEST_PARAM")).toThrow("超出有效范围");
      expect(() => parsePositiveInt("-5", 1000, "TEST_PARAM")).toThrow("超出有效范围");
    });
  });

  describe("parseEnv - 集中环境解析", () => {
    it("在全空环境变量下解析默认配置", () => {
      const config = parseEnv({});
      expect(config.transport).toBe("stdio");
      expect(config.serverHost).toBe("0.0.0.0");
      expect(config.serverPort).toBe(8000);
      expect(config.region).toBe("us-east-1");
      expect(config.forcePathStyle).toBe(false);
      expect(config.readOnly).toBe(false);
      expect(config.allowedLocalDir).toBe("./");
      expect(config.maxReadBytes).toBe(262144);
      expect(config.presignedExpires).toBe(3600);
      expect(config.endpoint).toBeUndefined();
      expect(config.accessKeyId).toBeUndefined();
      expect(config.secretAccessKey).toBeUndefined();
      expect(config.sessionToken).toBeUndefined();
      expect(config.defaultBucket).toBeUndefined();
    });

    it("完整解析 MCP_S3_* 规范配置", () => {
      const env = {
        MCP_S3_TRANSPORT: "sse",
        MCP_S3_SERVER_HOST: "127.0.0.1",
        MCP_S3_SERVER_PORT: "9000",
        MCP_S3_ENDPOINT: "http://127.0.0.1:9000",
        MCP_S3_REGION: "cn-northwest-1",
        MCP_S3_ACCESS_KEY_ID: "minioadmin",
        MCP_S3_SECRET_ACCESS_KEY: "minioadmin123",
        MCP_S3_SESSION_TOKEN: "token123",
        MCP_S3_FORCE_PATH_STYLE: "true",
        MCP_S3_DEFAULT_BUCKET: "my-bucket",
        MCP_S3_READ_ONLY: "yes",
        MCP_S3_ALLOWED_LOCAL_DIR: "/data/sandbox",
        MCP_S3_MAX_READ_BYTES: "524288",
        MCP_S3_PRESIGNED_EXPIRES: "7200",
      };
      const config = parseEnv(env);
      expect(config.transport).toBe("sse");
      expect(config.serverHost).toBe("127.0.0.1");
      expect(config.serverPort).toBe(9000);
      expect(config.endpoint).toBe("http://127.0.0.1:9000");
      expect(config.region).toBe("cn-northwest-1");
      expect(config.accessKeyId).toBe("minioadmin");
      expect(config.secretAccessKey).toBe("minioadmin123");
      expect(config.sessionToken).toBe("token123");
      expect(config.forcePathStyle).toBe(true);
      expect(config.defaultBucket).toBe("my-bucket");
      expect(config.readOnly).toBe(true);
      expect(config.allowedLocalDir).toBe("/data/sandbox");
      expect(config.maxReadBytes).toBe(524288);
      expect(config.presignedExpires).toBe(7200);
    });

    it("透明降级兼容标准 AWS_* 环境变量", () => {
      const env = {
        AWS_ENDPOINT_URL_S3: "https://oss-cn-hangzhou.aliyuncs.com",
        AWS_REGION: "oss-cn-hangzhou",
        AWS_ACCESS_KEY_ID: "LTAI_COMPAT",
        AWS_SECRET_ACCESS_KEY: "SECRET_COMPAT",
        AWS_SESSION_TOKEN: "STS_COMPAT",
        AWS_S3_FORCE_PATH_STYLE: "false",
      };
      const config = parseEnv(env);
      expect(config.endpoint).toBe("https://oss-cn-hangzhou.aliyuncs.com");
      expect(config.region).toBe("oss-cn-hangzhou");
      expect(config.accessKeyId).toBe("LTAI_COMPAT");
      expect(config.secretAccessKey).toBe("SECRET_COMPAT");
      expect(config.sessionToken).toBe("STS_COMPAT");
      expect(config.forcePathStyle).toBe(false);
    });

    it("MCP_S3_* 优先级高于 AWS_*", () => {
      const env = {
        MCP_S3_ENDPOINT: "http://minio:9000",
        AWS_ENDPOINT_URL_S3: "http://aws:9000",
        MCP_S3_REGION: "auto",
        AWS_REGION: "us-east-1",
      };
      const config = parseEnv(env);
      expect(config.endpoint).toBe("http://minio:9000");
      expect(config.region).toBe("auto");
    });
  });

  describe("maskSensitiveConfig - 凭证安全脱敏", () => {
    it("将 secretAccessKey 与 sessionToken 脱敏为 ***", () => {
      const config = parseEnv({
        MCP_S3_ACCESS_KEY_ID: "AKIAIOSFODNN7EXAMPLE",
        MCP_S3_SECRET_ACCESS_KEY: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
        MCP_S3_SESSION_TOKEN: "session-token-xyz",
      });

      const masked = maskSensitiveConfig(config);
      expect(masked.secretAccessKey).toBe("***");
      expect(masked.sessionToken).toBe("***");
      expect(masked.accessKeyId).toBe("AKIAIOSFODNN7EXAMPLE");

      // 保证原配置不被原地篡改
      expect(config.secretAccessKey).toBe("wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY");
    });
  });

  describe("maskAccessKey - 访问密钥脱敏显示", () => {
    it("正确脱敏常规 AccessKey", () => {
      expect(maskAccessKey("AKIAIOSFODNN7EXAMPLE")).toBe("AKIA...MPLE");
    });

    it("处理短键或未定义键", () => {
      expect(maskAccessKey(undefined)).toBeUndefined();
      expect(maskAccessKey("short")).toBe("***");
    });
  });

  describe("getS3ClientConfig - 客户端配置装配", () => {
    it("包含凭据时正确组装 S3ClientConfig", () => {
      const appConfig = parseEnv({
        MCP_S3_ENDPOINT: "http://localhost:9000",
        MCP_S3_REGION: "us-east-1",
        MCP_S3_ACCESS_KEY_ID: "ak",
        MCP_S3_SECRET_ACCESS_KEY: "sk",
        MCP_S3_SESSION_TOKEN: "token",
        MCP_S3_FORCE_PATH_STYLE: "true",
      });
      const clientConfig = getS3ClientConfig(appConfig);
      expect(clientConfig.endpoint).toBe("http://localhost:9000");
      expect(clientConfig.region).toBe("us-east-1");
      expect(clientConfig.forcePathStyle).toBe(true);
      expect(clientConfig.credentials).toEqual({
        accessKeyId: "ak",
        secretAccessKey: "sk",
        sessionToken: "token",
      });
    });

    it("无凭据时不装配 credentials 属性，允许使用默认凭据链", () => {
      const appConfig = parseEnv({});
      const clientConfig = getS3ClientConfig(appConfig);
      expect(clientConfig.credentials).toBeUndefined();
    });

    it("正确解析并脱敏 apiKey 访问令牌", () => {
      const appConfig = parseEnv({
        MCP_S3_API_KEY: "secret-token-123456",
      });
      expect(appConfig.apiKey).toBe("secret-token-123456");

      const masked = maskSensitiveConfig(appConfig);
      expect(masked.apiKey).toBe("***");
    });
  });
});
