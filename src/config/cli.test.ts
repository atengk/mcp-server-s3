/**
 * CLI 命令行参数解析与覆盖优先级单元测试
 *
 * @author Ateng
 * @since 2026-10-04
 */

import { describe, expect, it } from "vitest";
import { resolveConfigWithCli } from "./cli.js";

describe("CLI 命令行参数解析器测试 (cli.ts)", () => {
  it("无命令行参数时默认采用环境变量基准配置", () => {
    const { config, isHelp, isVersion } = resolveConfigWithCli([], {
      MCP_S3_REGION: "ap-northeast-1",
      MCP_S3_SERVER_PORT: "9000",
    });

    expect(config.region).toBe("ap-northeast-1");
    expect(config.serverPort).toBe(9000);
    expect(isHelp).toBe(false);
    expect(isVersion).toBe(false);
  });

  it("命令行参数应成功覆盖同名环境变量", () => {
    const args = [
      "--endpoint",
      "http://103.236.97.210:47875",
      "--region",
      "us-east-1",
      "--access-key-id",
      "cli-ak",
      "--secret-access-key",
      "cli-sk",
      "--path-style",
      "--bucket",
      "my-cli-bucket",
      "--read-only",
      "--transport",
      "sse",
      "--port",
      "8888",
      "--api-key",
      "my-token",
    ];

    const { config } = resolveConfigWithCli(args, {
      MCP_S3_ENDPOINT: "http://old-endpoint.com",
      MCP_S3_ACCESS_KEY_ID: "env-ak",
      MCP_S3_REGION: "eu-west-1",
      MCP_S3_READ_ONLY: "false",
      MCP_S3_TRANSPORT: "stdio",
      MCP_S3_SERVER_PORT: "8000",
    });

    expect(config.endpoint).toBe("http://103.236.97.210:47875");
    expect(config.region).toBe("us-east-1");
    expect(config.accessKeyId).toBe("cli-ak");
    expect(config.secretAccessKey).toBe("cli-sk");
    expect(config.forcePathStyle).toBe(true);
    expect(config.defaultBucket).toBe("my-cli-bucket");
    expect(config.readOnly).toBe(true);
    expect(config.transport).toBe("sse");
    expect(config.serverPort).toBe(8888);
    expect(config.apiKey).toBe("my-token");
  });

  it("正确识别 -h / --help 与 -v / --version 参数", () => {
    const resHelp = resolveConfigWithCli(["-h"]);
    expect(resHelp.isHelp).toBe(true);

    const resVersion = resolveConfigWithCli(["--version"]);
    expect(resVersion.isVersion).toBe(true);
  });
});
