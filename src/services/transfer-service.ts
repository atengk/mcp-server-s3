/**
 * S3 双向流式文件互传服务 (Transfer Service)
 *
 * 提供文本写入覆盖、本地磁盘与 S3 双向流式互传 (受 SandboxGuard 沙箱严格约束)
 *
 * @author Ateng
 * @since 2026-10-04
 */

import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import {
  GetObjectCommand,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import type { SandboxGuard } from "../security/sandbox-guard.js";
import { BusinessError } from "../types/security.js";
import { resolveBucket } from "./object-service.js";
import type {
  DownloadFileInput,
  PutObjectTextInput,
  UploadFileInput,
} from "../types/tools.js";

/**
 * 自动触发分段上传的单文件大小阈值 (32MB)
 */
export const MULTIPART_UPLOAD_THRESHOLD_BYTES = 32 * 1024 * 1024;

/**
 * 分段上传单分片大小 (8MB)
 */
export const MULTIPART_PART_SIZE_BYTES = 8 * 1024 * 1024;

/**
 * 分段上传并发队列大小
 */
export const MULTIPART_QUEUE_SIZE = 4;

/**
 * 文本直接写入或覆盖对象
 *
 * @param client S3 客户端实例
 * @param params 文本写入入参
 * @param defaultBucket 默认存储桶
 * @return 写入操作响应结果
 */
export async function putObjectText(
  client: S3Client,
  params: PutObjectTextInput,
  defaultBucket?: string
): Promise<{ success: boolean; bucket: string; key: string; etag?: string; message: string }> {
  const bucket = resolveBucket(params.bucket, defaultBucket);
  const contentType = params.content_type || "text/plain; charset=utf-8";

  const response = await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: params.key,
      Body: Buffer.from(params.content, "utf-8"),
      ContentType: contentType,
    })
  );

  return {
    success: true,
    bucket,
    key: params.key,
    etag: response.ETag,
    message: `对象 "${params.key}" 文本内容写入成功`,
  };
}

/**
 * 本地文件流式上传至 S3 (受工作区路径沙箱守卫严格约束，支持大文件透明分段上传)
 *
 * @param client S3 客户端实例
 * @param params 上传参数
 * @param sandboxGuard 沙箱守卫实例
 * @param defaultBucket 默认存储桶
 * @return 上传结果
 * @throws 当文件不存在、不是有效文件、读取流出错或沙箱越权时抛出 BusinessError 或 SecurityError
 */
export async function uploadFile(
  client: S3Client,
  params: UploadFileInput,
  sandboxGuard: SandboxGuard,
  defaultBucket?: string
): Promise<{ success: boolean; bucket: string; key: string; localPath: string; size: number; message: string }> {
  const bucket = resolveBucket(params.bucket, defaultBucket);

  // 通过沙箱守卫校验并规范化本地文件绝对路径
  const safeLocalPath = sandboxGuard.validatePath(params.local_path);

  if (!fs.existsSync(safeLocalPath)) {
    throw new BusinessError("FILE_NOT_FOUND", `本地待上传文件不存在: "${safeLocalPath}"`);
  }

  const stats = fs.statSync(safeLocalPath);
  if (!stats.isFile()) {
    throw new BusinessError("INVALID_FILE_TYPE", `目标路径不是有效文件: "${safeLocalPath}"`);
  }

  // 采用真正的文件可读流上传，防止超大文件导致内存溢出
  const readStream = fs.createReadStream(safeLocalPath);
  let streamError: Error | null = null;
  readStream.on("error", (err) => {
    streamError = err;
  });

  try {
    // 超过 32MB 时自动升级为分段并发上传 (Multipart Upload)，低于阈值采用极速单次流式 PutObject
    if (stats.size > MULTIPART_UPLOAD_THRESHOLD_BYTES) {
      const parallelUpload = new Upload({
        client,
        params: {
          Bucket: bucket,
          Key: params.key,
          Body: readStream,
          ContentType: params.content_type,
        },
        partSize: MULTIPART_PART_SIZE_BYTES,
        queueSize: MULTIPART_QUEUE_SIZE,
        leavePartsOnError: false,
      });

      await parallelUpload.done();
    } else {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: params.key,
          Body: readStream,
          ContentLength: stats.size,
          ContentType: params.content_type,
        })
      );
    }

    if (streamError) {
      throw new BusinessError("STREAM_READ_ERROR", `读取本地文件发生错误: ${(streamError as Error).message}`);
    }
  } finally {
    if (!readStream.destroyed) {
      readStream.destroy();
    }
  }

  return {
    success: true,
    bucket,
    key: params.key,
    localPath: safeLocalPath,
    size: stats.size,
    message: `本地文件 "${path.basename(safeLocalPath)}" (大小: ${stats.size} 字节) 上传成功 (目标键: "${params.key}")`,
  };
}

/**
 * S3 对象流式保存为本地文件 (受工作区路径沙箱守卫保护)
 *
 * @param client S3 客户端实例
 * @param params 下载参数
 * @param sandboxGuard 沙箱守卫实例
 * @param defaultBucket 默认存储桶
 * @return 下载结果
 * @throws 当对象内容流为空、写入磁盘失败或沙箱越权时抛出 BusinessError 或 SecurityError
 */
export async function downloadFile(
  client: S3Client,
  params: DownloadFileInput,
  sandboxGuard: SandboxGuard,
  defaultBucket?: string
): Promise<{ success: boolean; bucket: string; key: string; localPath: string; size: number; message: string }> {
  const bucket = resolveBucket(params.bucket, defaultBucket);

  // 1. 沙箱守卫校验保存路径并确保父级目录存在
  const safeDestPath = sandboxGuard.validatePath(params.local_path);
  const destDir = path.dirname(safeDestPath);
  fs.mkdirSync(destDir, { recursive: true });

  const response = await client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: params.key,
    })
  );

  if (!response.Body) {
    throw new BusinessError("EMPTY_OBJECT_BODY", `对象 "${params.key}" 内容数据流为空`);
  }

  // 2. 将数据流安全流式写入本地磁盘
  if (typeof (response.Body as any).pipe === "function") {
    const writeStream = fs.createWriteStream(safeDestPath);
    await pipeline(response.Body as any, writeStream);
  } else {
    const rawBytes = await response.Body.transformToByteArray();
    fs.writeFileSync(safeDestPath, Buffer.from(rawBytes));
  }

  const fileSize = fs.statSync(safeDestPath).size;

  return {
    success: true,
    bucket,
    key: params.key,
    localPath: safeDestPath,
    size: fileSize,
    message: `S3 对象 "${params.key}" 成功保存到本地路径 "${safeDestPath}" (大小: ${fileSize} 字节)`,
  };
}
