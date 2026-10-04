/**
 * MCP 工具输入输出契约与 Zod 运行时校验 Schema
 *
 * @author Ateng
 * @since 2026-10-04
 */

import { z } from "zod";

/**
 * 0. 连通性自省探针工具入参 Schema
 */
export const S3PingSchema = z.object({});
export type S3PingInput = z.infer<typeof S3PingSchema>;

/**
 * 1. 存储桶生命周期工具入参 Schemas
 */
export const ListBucketsSchema = z.object({});
export type ListBucketsInput = z.infer<typeof ListBucketsSchema>;

export const CreateBucketSchema = z.object({
  bucket: z.string().min(1, "存储桶名称不能为空"),
  region: z.string().optional(),
});
export type CreateBucketInput = z.infer<typeof CreateBucketSchema>;

export const DeleteBucketSchema = z.object({
  bucket: z.string().min(1, "存储桶名称不能为空"),
  force: z.boolean().optional(),
});
export type DeleteBucketInput = z.infer<typeof DeleteBucketSchema>;

export const GetBucketLocationSchema = z.object({
  bucket: z.string().min(1, "存储桶名称不能为空"),
});
export type GetBucketLocationInput = z.infer<typeof GetBucketLocationSchema>;

/**
 * 2. 检索探索定位工具入参 Schemas
 */
export const ListObjectsSchema = z.object({
  bucket: z.string().optional(),
  prefix: z.string().optional(),
  delimiter: z.string().optional(),
  max_keys: z.number().int().min(1).max(1000).optional(),
  continuation_token: z.string().optional(),
});
export type ListObjectsInput = z.infer<typeof ListObjectsSchema>;

export const SearchObjectsSchema = z.object({
  bucket: z.string().optional(),
  query: z.string().min(1, "搜索关键词不能为空"),
  prefix: z.string().optional(),
  max_results: z.number().int().min(1).max(1000).optional(),
});
export type SearchObjectsInput = z.infer<typeof SearchObjectsSchema>;

export const StatObjectSchema = z.object({
  bucket: z.string().optional(),
  key: z.string().min(1, "对象键 (Key) 不能为空"),
});
export type StatObjectInput = z.infer<typeof StatObjectSchema>;

/**
 * 3. 内容检视分块工具入参 Schemas
 */
export const ReadObjectTextSchema = z.object({
  bucket: z.string().optional(),
  key: z.string().min(1, "对象键 (Key) 不能为空"),
  max_bytes: z.number().int().min(1).optional(),
  encoding: z.string().optional(),
});
export type ReadObjectTextInput = z.infer<typeof ReadObjectTextSchema>;

export const ReadObjectRangeSchema = z.object({
  bucket: z.string().optional(),
  key: z.string().min(1, "对象键 (Key) 不能为空"),
  start_byte: z.number().int().min(0, "起始字节偏移必须为非负整数"),
  end_byte: z.number().int().min(0, "结束字节偏移必须为非负整数"),
});
export type ReadObjectRangeInput = z.infer<typeof ReadObjectRangeSchema>;

/**
 * 4. 双向流式传输工具入参 Schemas
 */
export const PutObjectTextSchema = z.object({
  bucket: z.string().optional(),
  key: z.string().min(1, "对象键 (Key) 不能为空"),
  content: z.string(),
  content_type: z.string().optional(),
});
export type PutObjectTextInput = z.infer<typeof PutObjectTextSchema>;

export const UploadFileSchema = z.object({
  bucket: z.string().optional(),
  key: z.string().min(1, "对象键 (Key) 不能为空"),
  local_path: z.string().min(1, "本地文件路径不能为空"),
  content_type: z.string().optional(),
});
export type UploadFileInput = z.infer<typeof UploadFileSchema>;

export const DownloadFileSchema = z.object({
  bucket: z.string().optional(),
  key: z.string().min(1, "对象键 (Key) 不能为空"),
  local_path: z.string().min(1, "本地保存路径不能为空"),
});
export type DownloadFileInput = z.infer<typeof DownloadFileSchema>;

export const GetPresignedUrlSchema = z.object({
  bucket: z.string().optional(),
  key: z.string().min(1, "对象键 (Key) 不能为空"),
  expires_in: z.number().int().min(1).max(604800).optional(),
  method: z.enum(["GET", "PUT"]).optional(),
});
export type GetPresignedUrlInput = z.infer<typeof GetPresignedUrlSchema>;

/**
 * 5. 批处理与标签治理工具入参 Schemas
 */
export const CopyObjectSchema = z.object({
  source_bucket: z.string().optional(),
  source_key: z.string().min(1, "源对象键不能为空"),
  target_bucket: z.string().optional(),
  target_key: z.string().min(1, "目标对象键不能为空"),
});
export type CopyObjectInput = z.infer<typeof CopyObjectSchema>;

export const MoveObjectSchema = z.object({
  source_bucket: z.string().optional(),
  source_key: z.string().min(1, "源对象键不能为空"),
  target_bucket: z.string().optional(),
  target_key: z.string().min(1, "目标对象键不能为空"),
});
export type MoveObjectInput = z.infer<typeof MoveObjectSchema>;

export const DeleteObjectSchema = z.object({
  bucket: z.string().optional(),
  key: z.string().min(1, "对象键 (Key) 不能为空"),
});
export type DeleteObjectInput = z.infer<typeof DeleteObjectSchema>;

export const DeleteObjectsBatchSchema = z.object({
  bucket: z.string().optional(),
  keys: z.array(z.string().min(1, "对象键不能为空")).min(1, "删除列表不能为空").max(1000, "单批次最多支持 1000 个对象"),
});
export type DeleteObjectsBatchInput = z.infer<typeof DeleteObjectsBatchSchema>;

export const DeleteObjectsByPrefixSchema = z.object({
  bucket: z.string().optional(),
  prefix: z.string().min(1, "递归删除前缀不能为空且严禁根路径"),
  confirm_recursive_delete: z.boolean({
    required_error: "必须显式确认 confirm_recursive_delete 为 true 才能执行前缀递归清理",
  }),
});
export type DeleteObjectsByPrefixInput = z.infer<typeof DeleteObjectsByPrefixSchema>;

export const GetObjectTagsSchema = z.object({
  bucket: z.string().optional(),
  key: z.string().min(1, "对象键 (Key) 不能为空"),
});
export type GetObjectTagsInput = z.infer<typeof GetObjectTagsSchema>;

export const SetObjectTagsSchema = z.object({
  bucket: z.string().optional(),
  key: z.string().min(1, "对象键 (Key) 不能为空"),
  tags: z.record(z.string()),
});
export type SetObjectTagsInput = z.infer<typeof SetObjectTagsSchema>;
