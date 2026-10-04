/**
 * CLI 命令行参数解析与双模配置中枢
 *
 * 基于 Node 原生 parseArgs 提供命令行参数支持，CLI Flags 优先级高于环境变量
 *
 * @author Ateng
 * @since 2026-10-04
 */

import { parseArgs } from "node:util";
import type { AppConfig, TransportMode } from "../types/config.js";
import { parseEnv } from "./env.js";

/**
 * 命令行参数选项规范
 */
const CLI_OPTIONS = {
  endpoint: { type: "string" as const },
  region: { type: "string" as const },
  "access-key-id": { type: "string" as const },
  "secret-access-key": { type: "string" as const },
  "session-token": { type: "string" as const },
  "force-path-style": { type: "boolean" as const },
  "path-style": { type: "boolean" as const },
  bucket: { type: "string" as const },
  "default-bucket": { type: "string" as const },
  "read-only": { type: "boolean" as const },
  "allowed-local-dir": { type: "string" as const },
  "max-read-bytes": { type: "string" as const },
  "presigned-expires": { type: "string" as const },
  transport: { type: "string" as const },
  host: { type: "string" as const },
  "server-host": { type: "string" as const },
  port: { type: "string" as const },
  "server-port": { type: "string" as const },
  "api-key": { type: "string" as const },
  help: { type: "boolean" as const, short: "h" },
  version: { type: "boolean" as const, short: "v" },
};

/**
 * 打印命令行使用帮助信息
 */
export function printHelp(): void {
  const helpText = `
@atengk/mcp-server-s3 - 生产级 S3 对象存储 Model Context Protocol (MCP) 服务

使用方式:
  npx @atengk/mcp-server-s3 [选项]

通用连接选项:
  --endpoint <url>              S3 API 兼容接入点 (如 http://103.236.97.210:47875)
  --region <region>             目标地域 (默认: us-east-1)
  --access-key-id <ak>          S3 Access Key ID
  --secret-access-key <sk>      S3 Secret Access Key
  --session-token <token>       STS 临时会话令牌 (可选)
  --force-path-style, --path-style
                                强制使用路径寻址 (MinIO / RustFS 等私有存储必选)
  --default-bucket, --bucket <name>
                                默认绑定的存储桶名称

安全与防灾选项:
  --read-only                   开启只读门禁模式 (协议层完全隐藏写/删类工具)
  --allowed-local-dir <dir>     本地文件流传输受管沙箱目录 (默认: ./)
  --max-read-bytes <bytes>      文本直读最大字节阈值 (默认: 262144, 256KB)
  --presigned-expires <seconds> 预签名直链有效生命周期秒数 (默认: 3600)

通信传输与网络选项:
  --transport <mode>            通信模式: stdio (默认标准管道) 或 sse (HTTP 长轮询)
  --host, --server-host <host>  HTTP SSE 监听主机地址 (默认: 0.0.0.0)
  --port, --server-port <port>  HTTP SSE 监听端口号 (默认: 8000)
  --api-key <token>             HTTP SSE 访问控制 Bearer Token

辅助选项:
  -h, --help                    显示此帮助信息
  -v, --version                 显示当前版本号

优先级说明:
  命令行参数 (CLI Flags) > 规范环境变量 (MCP_S3_*) > 兼容环境变量 (AWS_*)
`;
  process.stdout.write(helpText + "\n");
}

/**
 * 解析并合并命令行参数与环境变量，输出最终生效的 AppConfig
 *
 * @param args 命令行参数数组 (缺省使用 process.argv.slice(2))
 * @param env 环境变量字典 (缺省使用 process.env)
 * @return 合并覆盖后的强类型应用配置
 */
export function resolveConfigWithCli(
  args: string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env
): { config: AppConfig; isHelp: boolean; isVersion: boolean } {
  const { values } = parseArgs({
    args,
    options: CLI_OPTIONS,
    strict: false,
    allowPositionals: true,
  });

  const isHelp = Boolean(values.help);
  const isVersion = Boolean(values.version);

  // 1. 基于环境变量加载基础配置
  const baseConfig = parseEnv(env);

  // 2. 使用 CLI 命令行参数显式覆盖对应环境变量配置
  const merged: AppConfig = {
    ...baseConfig,
    endpoint: (values.endpoint as string | undefined) ?? baseConfig.endpoint,
    region: (values.region as string | undefined) ?? baseConfig.region,
    accessKeyId: (values["access-key-id"] as string | undefined) ?? baseConfig.accessKeyId,
    secretAccessKey: (values["secret-access-key"] as string | undefined) ?? baseConfig.secretAccessKey,
    sessionToken: (values["session-token"] as string | undefined) ?? baseConfig.sessionToken,
    forcePathStyle:
      values["force-path-style"] !== undefined
        ? Boolean(values["force-path-style"])
        : values["path-style"] !== undefined
        ? Boolean(values["path-style"])
        : baseConfig.forcePathStyle,
    defaultBucket:
      (values["default-bucket"] as string | undefined) ??
      (values.bucket as string | undefined) ??
      baseConfig.defaultBucket,
    readOnly: values["read-only"] !== undefined ? Boolean(values["read-only"]) : baseConfig.readOnly,
    allowedLocalDir: (values["allowed-local-dir"] as string | undefined) ?? baseConfig.allowedLocalDir,
    maxReadBytes:
      values["max-read-bytes"] !== undefined
        ? parseInt(values["max-read-bytes"] as string, 10)
        : baseConfig.maxReadBytes,
    presignedExpires:
      values["presigned-expires"] !== undefined
        ? parseInt(values["presigned-expires"] as string, 10)
        : baseConfig.presignedExpires,
    transport:
      values.transport !== undefined
        ? (values.transport as string).toLowerCase() === "sse"
          ? ("sse" as TransportMode)
          : ("stdio" as TransportMode)
        : baseConfig.transport,
    serverHost:
      (values["server-host"] as string | undefined) ??
      (values.host as string | undefined) ??
      baseConfig.serverHost,
    serverPort:
      values["server-port"] !== undefined
        ? parseInt(values["server-port"] as string, 10)
        : values.port !== undefined
        ? parseInt(values.port as string, 10)
        : baseConfig.serverPort,
    apiKey: (values["api-key"] as string | undefined) ?? baseConfig.apiKey,
  };

  return {
    config: merged,
    isHelp,
    isVersion,
  };
}
