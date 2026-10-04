/**
 * 安全防御与防灾体系契约模型
 *
 * @author Ateng
 * @since 2026-10-04
 */

import { z } from "zod";

/**
 * 安全拦截检查结果契约
 */
export interface SecurityCheckResult {
  /**
   * 是否允许继续执行目标操作
   */
  isAllowed: boolean;
  /**
   * 拦截或放行的业务/安全原因说明
   */
  reason?: string;
}

/**
 * 文本内容截断与二进制检视结果契约
 */
export interface ContentTruncationResult {
  /**
   * 最终呈现的文本内容 (超量时包含截断警示 notice)
   */
  content: string;
  /**
   * 是否触发了防爆截断或拦截
   */
  isTruncated: boolean;
  /**
   * 原始字节流的总字节数
   */
  totalBytes: number;
  /**
   * 本次实际读取并保留的字节数
   */
  readBytes: number;
  /**
   * 是否判定为二进制文件
   */
  isBinary: boolean;
  /**
   * 截断或二进制拦截诊断警告说明
   */
  warning?: string;
}

/**
 * 安全违规错误类型枚举
 */
export const SecurityErrorCodeSchema = z.enum([
  "READONLY_VIOLATION",
  "SANDBOX_VIOLATION",
  "PREFIX_DELETION_VIOLATION",
  "BINARY_CONTENT_DETECTED",
]);
export type SecurityErrorCode = z.infer<typeof SecurityErrorCodeSchema>;

/**
 * 安全防御违规专用业务异常
 */
export class SecurityError extends Error {
  public readonly code: SecurityErrorCode;

  public constructor(code: SecurityErrorCode, message: string) {
    super(`[MCP-S3 安全防御拦截] ${message}`);
    this.name = "SecurityError";
    this.code = code;
  }
}
