/**
 * 应用配置与环境契约模型定义
 *
 * @author Ateng
 * @since 2026-10-04
 */

import { z } from "zod";

/**
 * MCP 通信传输模式枚举
 */
export const TransportModeSchema = z.enum(["stdio", "sse"]);
export type TransportMode = z.infer<typeof TransportModeSchema>;

/**
 * S3 访问密钥凭证契约
 */
export const S3CredentialsConfigSchema = z.object({
  accessKeyId: z.string().min(1, "AccessKeyId 不能为空"),
  secretAccessKey: z.string().min(1, "SecretAccessKey 不能为空"),
  sessionToken: z.string().optional(),
});
export type S3CredentialsConfig = z.infer<typeof S3CredentialsConfigSchema>;

/**
 * S3 客户端底层连接配置契约
 */
export const S3ClientConfigSchema = z.object({
  endpoint: z.string().url("Endpoint 必须为合法 URL").optional(),
  region: z.string().min(1, "Region 不能为空"),
  credentials: S3CredentialsConfigSchema.optional(),
  forcePathStyle: z.boolean(),
});
export type S3ClientConfig = z.infer<typeof S3ClientConfigSchema>;

/**
 * 12-Factor App 全局集中配置运行时校验 Schema
 */
export const AppConfigSchema = z.object({
  transport: TransportModeSchema,
  serverHost: z.string().min(1),
  serverPort: z.number().int().min(1).max(65535),
  endpoint: z.string().url().optional(),
  region: z.string().min(1),
  accessKeyId: z.string().optional(),
  secretAccessKey: z.string().optional(),
  sessionToken: z.string().optional(),
  forcePathStyle: z.boolean(),
  defaultBucket: z.string().optional(),
  readOnly: z.boolean(),
  allowedLocalDir: z.string().min(1),
  maxReadBytes: z.number().int().positive(),
  presignedExpires: z.number().int().positive(),
});
export type AppConfig = z.infer<typeof AppConfigSchema>;
