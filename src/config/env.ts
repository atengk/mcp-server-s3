/**
 * 环境变量解析器与集中配置管理中枢 (12-Factor App)
 *
 * @author Ateng
 * @since 2026-10-04
 */

import { AppConfigSchema, type AppConfig, type TransportMode } from "../types/config.js";

/**
 * 从环境变量映射中按优先级提取值
 *
 * 优先读取 MCP_S3_* 规范前缀，缺失时依次降级尝试备选键名
 *
 * @param env 环境变量键值对
 * @param canonicalKey 官方标准主键名 (如 MCP_S3_REGION)
 * @param fallbackKeys 备选向下兼容键名列表 (如 AWS_REGION)
 * @return 命中的非空字符串，未命中时返回 undefined
 */
export function getEnvValue(
  env: NodeJS.ProcessEnv,
  canonicalKey: string,
  fallbackKeys: string[] = []
): string | undefined {
  const canonical = env[canonicalKey];
  if (canonical !== undefined && canonical.trim() !== "") {
    return canonical.trim();
  }

  for (const fallback of fallbackKeys) {
    const val = env[fallback];
    if (val !== undefined && val.trim() !== "") {
      return val.trim();
    }
  }

  return undefined;
}

/**
 * 宽容布尔值转换器
 *
 * 支持 1, true, yes, on, t (大小写不敏感) 为 true；
 * 0, false, no, off, f, 空字符串 为 false；其余情况返回 defaultValue。
 *
 * @param value 环境变量原始值
 * @param defaultValue 缺省默认值
 * @return 解析后的布尔值
 */
export function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) {
    return defaultValue;
  }
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on", "t"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off", "f", ""].includes(normalized)) {
    return false;
  }
  return defaultValue;
}

/**
 * 通用安全整数数值解析器 (支持边界校验)
 *
 * @param value 原始环境变量字符串
 * @param defaultValue 默认数值
 * @param fieldName 字段名称 (用于友好错误提示)
 * @param min 允许的最小值 (包含，缺省为 0)
 * @param max 允许的最大值 (包含，缺省为 Number.MAX_SAFE_INTEGER)
 * @return 解析后的有效整数数值
 * @throws 当输入非整数或超出 [min, max] 区间时抛出语义化异常
 */
export function parseNumber(
  value: string | undefined,
  defaultValue: number,
  fieldName: string,
  min = 0,
  max = Number.MAX_SAFE_INTEGER
): number {
  if (value === undefined) {
    return defaultValue;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`[mcp-server-s3] 配置解析错误: ${fieldName} 必须为数字，收到无效值 "${value}"`);
  }

  if (parsed < min || parsed > max) {
    throw new Error(
      `[mcp-server-s3] 配置解析错误: ${fieldName} 数值超出有效范围 (${min}~${max})，收到 "${value}"`
    );
  }

  return parsed;
}

/**
 * 校验并解析有效网络端口号 (1-65535)
 *
 * @param value 原始环境变量字符串
 * @param defaultPort 默认端口
 * @param fieldName 字段名称
 * @return 解析后的有效端口号
 */
export function parsePort(value: string | undefined, defaultPort: number, fieldName: string): number {
  return parseNumber(value, defaultPort, fieldName, 1, 65535);
}

/**
 * 校验并解析正整数数值 (>= 1)
 *
 * @param value 原始环境变量字符串
 * @param defaultValue 默认数值
 * @param fieldName 字段名称
 * @return 解析后的正整数
 */
export function parsePositiveInt(value: string | undefined, defaultValue: number, fieldName: string): number {
  return parseNumber(value, defaultValue, fieldName, 1, Number.MAX_SAFE_INTEGER);
}

/**
 * 解析并生成全局类型化应用配置
 *
 * @param env 输入的环境变量字典，缺省默认使用当前 process.env
 * @return 结构完整且经过强校验的 AppConfig 对象
 */
export function parseEnv(env: NodeJS.ProcessEnv = process.env): AppConfig {
  // 1. 通信协议与服务监听配置
  const transportRaw = getEnvValue(env, "MCP_S3_TRANSPORT", ["S3_TRANSPORT", "MCP_TRANSPORT"])?.toLowerCase();
  const transport: TransportMode = transportRaw === "sse" ? "sse" : "stdio";

  const serverHost = getEnvValue(env, "MCP_S3_SERVER_HOST", ["S3_SERVER_HOST", "HOST"]) || "0.0.0.0";
  const serverPort = parsePort(
    getEnvValue(env, "MCP_S3_SERVER_PORT", ["S3_SERVER_PORT", "PORT"]),
    8000,
    "MCP_S3_SERVER_PORT"
  );

  // 2. S3 接入点与区域配置
  const endpoint = getEnvValue(env, "MCP_S3_ENDPOINT", ["AWS_ENDPOINT_URL_S3", "AWS_ENDPOINT_URL"]);
  const region = getEnvValue(env, "MCP_S3_REGION", ["AWS_REGION", "AWS_DEFAULT_REGION"]) || "us-east-1";

  // 3. S3 身份凭证配置
  const accessKeyId = getEnvValue(env, "MCP_S3_ACCESS_KEY_ID", ["AWS_ACCESS_KEY_ID"]);
  const secretAccessKey = getEnvValue(env, "MCP_S3_SECRET_ACCESS_KEY", ["AWS_SECRET_ACCESS_KEY"]);
  const sessionToken = getEnvValue(env, "MCP_S3_SESSION_TOKEN", ["AWS_SESSION_TOKEN"]);

  // 4. 寻址风格与默认绑定存储桶
  const forcePathStyle = parseBoolean(
    getEnvValue(env, "MCP_S3_FORCE_PATH_STYLE", ["AWS_S3_FORCE_PATH_STYLE"]),
    false
  );
  const defaultBucket = getEnvValue(env, "MCP_S3_DEFAULT_BUCKET", ["AWS_S3_DEFAULT_BUCKET"]);

  // 5. 安全门禁与本地沙箱约束
  const readOnly = parseBoolean(getEnvValue(env, "MCP_S3_READ_ONLY", ["S3_READ_ONLY"]), false);
  const allowedLocalDir = getEnvValue(env, "MCP_S3_ALLOWED_LOCAL_DIR", ["S3_ALLOWED_LOCAL_DIR"]) || "./";
  const maxReadBytes = parsePositiveInt(
    getEnvValue(env, "MCP_S3_MAX_READ_BYTES", ["S3_MAX_READ_BYTES"]),
    262144,
    "MCP_S3_MAX_READ_BYTES"
  );
  const presignedExpires = parsePositiveInt(
    getEnvValue(env, "MCP_S3_PRESIGNED_EXPIRES", ["S3_PRESIGNED_EXPIRES"]),
    3600,
    "MCP_S3_PRESIGNED_EXPIRES"
  );
  const apiKey = getEnvValue(env, "MCP_S3_API_KEY", ["MCP_S3_AUTH_TOKEN", "S3_API_KEY"]);

  const rawConfig: AppConfig = {
    transport,
    serverHost,
    serverPort,
    endpoint,
    region,
    accessKeyId,
    secretAccessKey,
    sessionToken,
    forcePathStyle,
    defaultBucket,
    readOnly,
    allowedLocalDir,
    maxReadBytes,
    presignedExpires,
    apiKey,
  };

  // 通过 Zod 强类型 Schema 进行终态运行时断言校验
  return AppConfigSchema.parse(rawConfig);
}

/**
 * 敏感凭证数据安全脱敏 (强类型浅拷贝，保护明文密钥)
 *
 * @param config 原始应用配置对象
 * @return 字段已脱敏的安全配置对象
 */
export function maskSensitiveConfig(config: AppConfig): AppConfig {
  return {
    ...config,
    secretAccessKey: config.secretAccessKey ? "***" : undefined,
    sessionToken: config.sessionToken ? "***" : undefined,
    apiKey: config.apiKey ? "***" : undefined,
  };
}

/**
 * 对 AccessKeyId 进行掩码脱敏 (保留前后四位)
 *
 * @param accessKeyId 原始 AccessKey 字符串
 * @return 脱敏后的字符串
 */
export function maskAccessKey(accessKeyId?: string): string | undefined {
  if (!accessKeyId) {
    return undefined;
  }
  if (accessKeyId.length <= 8) {
    return "***";
  }
  return `${accessKeyId.slice(0, 4)}...${accessKeyId.slice(-4)}`;
}
