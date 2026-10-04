/**
 * S3 核心领域数据模型契约 (严格遵循 CONTEXT.md 统一领域语言)
 *
 * @author Ateng
 * @since 2026-10-04
 */

import { z } from "zod";

/**
 * 统一错误返回契约 Schema
 */
export const ErrorResultSchema = z.object({
  status: z.literal("error"),
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});
export type ErrorResult = z.infer<typeof ErrorResultSchema>;

/**
 * 存储桶 (Bucket) 基础信息契约
 */
export interface BucketItem {
  name: string;
  creationDate?: Date;
}

/**
 * 对象 (Object) 摘要契约
 */
export interface S3ObjectItem {
  key: string;
  size?: number;
  lastModified?: Date;
  etag?: string;
  storageClass?: string;
}

/**
 * 虚拟目录公共前缀契约
 */
export interface CommonPrefixItem {
  prefix: string;
}

/**
 * 对象列表分页查询结果契约
 */
export interface ListObjectsResult {
  bucket: string;
  prefix?: string;
  delimiter?: string;
  objects: S3ObjectItem[];
  commonPrefixes: string[];
  nextContinuationToken?: string;
  isTruncated: boolean;
}

/**
 * 对象元数据与属性契约
 */
export interface ObjectMetadata {
  bucket: string;
  key: string;
  size?: number;
  contentType?: string;
  lastModified?: Date;
  etag?: string;
  metadata?: Record<string, string>;
}

/**
 * 文本直读响应契约 (含截断警示)
 */
export interface ReadObjectTextResult {
  bucket: string;
  key: string;
  content: string;
  truncated: boolean;
  totalBytes?: number;
  readBytes: number;
  warning?: string;
}

/**
 * HTTP Range 字节范围读取响应契约
 */
export interface RangeReadResult {
  bucket: string;
  key: string;
  startByte: number;
  endByte: number;
  contentLength: number;
  dataBase64?: string;
  text?: string;
}

/**
 * 预签名 URL 直链结果契约
 */
export interface PresignedUrlResult {
  bucket: string;
  key: string;
  url: string;
  expiresIn: number;
  method: "GET" | "PUT";
}

/**
 * 连通性自省探针 (s3_ping) 诊断结果契约
 */
export const ConnectivityProbeResultSchema = z.object({
  status: z.enum(["ok", "error"]),
  endpoint: z.string().optional(),
  region: z.string(),
  accessKeyIdMasked: z.string().optional(),
  rttMs: z.number().int().nonnegative(),
  message: z.string(),
});
export type ConnectivityProbeResult = z.infer<typeof ConnectivityProbeResultSchema>;

/**
 * 对象键值标签项
 */
export interface TagItem {
  key: string;
  value: string;
}

/**
 * 对象标签字典映射
 */
export type ObjectTags = Record<string, string>;
