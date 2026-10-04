/**
 * S3 对象批处理与移动删除服务 (Batch Service)
 *
 * 提供跨桶与同桶对象复制、原子化移动重命名、单对象与千级批量删除以及前缀递归清理三重防灾熔断
 *
 * @author Ateng
 * @since 2026-10-04
 */

import {
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  type S3Client,
} from "@aws-sdk/client-s3";
import { PrefixDeletionGuard } from "../security/prefix-guard.js";
import { BusinessError } from "../types/security.js";
import type {
  CopyObjectInput,
  DeleteObjectInput,
  DeleteObjectsBatchInput,
  DeleteObjectsByPrefixInput,
  MoveObjectInput,
} from "../types/tools.js";
import { resolveBucket } from "./object-service.js";

/**
 * 同桶或跨桶对象复制
 *
 * @param client S3 客户端实例
 * @param params 复制参数
 * @param defaultBucket 默认存储桶
 * @return 复制结果
 * @throws 当存储桶未指定时抛出异常
 */
export async function copyObject(
  client: S3Client,
  params: CopyObjectInput,
  defaultBucket?: string
): Promise<{ success: boolean; sourceBucket: string; sourceKey: string; targetBucket: string; targetKey: string; message: string }> {
  const sourceBucket = resolveBucket(params.source_bucket, defaultBucket);
  // 若未指定目标桶，同桶复制默认回退继承源存储桶
  const targetBucket = params.target_bucket
    ? resolveBucket(params.target_bucket, defaultBucket)
    : sourceBucket;

  // S3 CopySource 需要对键进行 URL 编码但必须保留正斜杠定界符
  const encodedSourceKey = encodeURIComponent(params.source_key).replace(/%2F/g, "/");
  const copySource = `${sourceBucket}/${encodedSourceKey}`;

  await client.send(
    new CopyObjectCommand({
      Bucket: targetBucket,
      Key: params.target_key,
      CopySource: copySource,
    })
  );

  return {
    success: true,
    sourceBucket,
    sourceKey: params.source_key,
    targetBucket,
    targetKey: params.target_key,
    message: `对象成功从 "${sourceBucket}/${params.source_key}" 复制到 "${targetBucket}/${params.target_key}"`,
  };
}

/**
 * 原子化移动与重命名对象 (复制成功后自动删除源对象，内置同源防自毁检测)
 *
 * @param client S3 客户端实例
 * @param params 移动参数
 * @param defaultBucket 默认存储桶
 * @return 移动结果
 * @throws 当源对象与目标对象路径完全相同时抛出 BusinessError
 */
export async function moveObject(
  client: S3Client,
  params: MoveObjectInput,
  defaultBucket?: string
): Promise<{ success: boolean; sourceBucket: string; sourceKey: string; targetBucket: string; targetKey: string; message: string }> {
  const sourceBucket = resolveBucket(params.source_bucket, defaultBucket);
  // 若未指定目标桶，同桶移动默认回退继承源存储桶
  const targetBucket = params.target_bucket
    ? resolveBucket(params.target_bucket, defaultBucket)
    : sourceBucket;

  // 防自毁断言：严禁向完全相同的桶与键执行移动，避免覆盖删除自身导致数据丢失
  if (sourceBucket === targetBucket && params.source_key === params.target_key) {
    throw new BusinessError(
      "IDENTICAL_SOURCE_TARGET",
      `移动源对象与目标对象不能完全相同: "${sourceBucket}/${params.source_key}"`
    );
  }

  // 1. 先将源对象完整复制到目标路径 (直接传入解析后的存储桶，避免重复解析)
  const copyResult = await copyObject(
    client,
    {
      source_bucket: sourceBucket,
      source_key: params.source_key,
      target_bucket: targetBucket,
      target_key: params.target_key,
    },
    defaultBucket
  );

  // 2. 复制成功后安全删除源对象
  await deleteObject(
    client,
    {
      bucket: copyResult.sourceBucket,
      key: copyResult.sourceKey,
    },
    defaultBucket
  );

  return {
    success: true,
    sourceBucket: copyResult.sourceBucket,
    sourceKey: copyResult.sourceKey,
    targetBucket: copyResult.targetBucket,
    targetKey: copyResult.targetKey,
    message: `对象成功从 "${copyResult.sourceBucket}/${copyResult.sourceKey}" 移动重命名为 "${copyResult.targetBucket}/${copyResult.targetKey}"`,
  };
}

/**
 * 删除指定的单个对象
 *
 * @param client S3 客户端实例
 * @param params 删除参数
 * @param defaultBucket 默认存储桶
 * @return 删除结果
 * @throws 当存储桶未指定时抛出异常
 */
export async function deleteObject(
  client: S3Client,
  params: DeleteObjectInput,
  defaultBucket?: string
): Promise<{ success: boolean; bucket: string; key: string; message: string }> {
  const bucket = resolveBucket(params.bucket, defaultBucket);

  await client.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: params.key,
    })
  );

  return {
    success: true,
    bucket,
    key: params.key,
    message: `对象 "${params.key}" 删除成功`,
  };
}

/**
 * 批量删除多个指定对象 (单批上限 1000)
 *
 * @param client S3 客户端实例
 * @param params 批量删除参数
 * @param defaultBucket 默认存储桶
 * @return 批量删除结果
 * @throws 当对象键列表为空、超过上限或部分删除失败时抛出 SecurityError 或 BusinessError
 */
export async function deleteObjectsBatch(
  client: S3Client,
  params: DeleteObjectsBatchInput,
  defaultBucket?: string
): Promise<{ success: boolean; bucket: string; deletedCount: number; message: string }> {
  const bucket = resolveBucket(params.bucket, defaultBucket);

  // 经由防灾守卫校验单批次数量上限 (<= 1000)
  const validatedKeys = PrefixDeletionGuard.validateBatchKeys(params.keys);

  const deleteResp = await client.send(
    new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: {
        Objects: validatedKeys.map((key) => ({ Key: key })),
        Quiet: false,
      },
    })
  );

  if (deleteResp.Errors && deleteResp.Errors.length > 0) {
    const failedDetails = deleteResp.Errors.map((e) => `${e.Key}: ${e.Message || e.Code || "未知错误"}`).join("; ");
    throw new BusinessError("BATCH_DELETE_FAILED", `批量删除存储桶 "${bucket}" 中部分对象失败: ${failedDetails}`);
  }

  return {
    success: true,
    bucket,
    deletedCount: validatedKeys.length,
    message: `成功批量删除存储桶 "${bucket}" 中的 ${validatedKeys.length} 个对象`,
  };
}

/**
 * 依据前缀递归清理虚拟目录树 (内置三重防灾熔断守卫与单批 1000 截断保护)
 *
 * @param client S3 客户端实例
 * @param params 前缀递归删除参数
 * @param defaultBucket 默认存储桶
 * @return 递归删除统计结果及截断标识
 * @throws 当缺少确认参数、前缀为根目录或部分删除失败时抛出 SecurityError 或 BusinessError
 */
export async function deleteObjectsByPrefix(
  client: S3Client,
  params: DeleteObjectsByPrefixInput,
  defaultBucket?: string
): Promise<{ success: boolean; bucket: string; prefix: string; deletedCount: number; isTruncated: boolean; message: string }> {
  const bucket = resolveBucket(params.bucket, defaultBucket);

  // 1. 执行前缀三重防灾校验 (严禁根前缀、强制显式布尔确认)
  const validPrefix = PrefixDeletionGuard.validate(params.prefix, params.confirm_recursive_delete);

  // 2. 检视单批次待删除对象 (单批次严格上限 1000 个，严禁无界跨页全量删除)
  const listResp = await client.send(
    new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: validPrefix,
      MaxKeys: PrefixDeletionGuard.MAX_BATCH_DELETE_LIMIT,
    })
  );

  const keysToDelete = (listResp.Contents || [])
    .map((obj) => obj.Key || "")
    .filter((k) => k !== "");

  // 3. 执行批量删除并判定是否触发截断保护
  let deletedCount = 0;
  if (keysToDelete.length > 0) {
    const deleteResp = await client.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: {
          Objects: keysToDelete.map((k) => ({ Key: k })),
          Quiet: false,
        },
      })
    );

    if (deleteResp.Errors && deleteResp.Errors.length > 0) {
      const failedDetails = deleteResp.Errors.map((e) => `${e.Key}: ${e.Message || e.Code || "未知错误"}`).join("; ");
      throw new BusinessError("PREFIX_DELETE_PARTIAL_FAILURE", `递归清理前缀 "${validPrefix}" 时部分对象删除失败: ${failedDetails}`);
    }

    deletedCount = keysToDelete.length;
  }

  const isTruncated = Boolean(listResp.IsTruncated);
  const truncatedTip = isTruncated
    ? `（已达到单批次 ${PrefixDeletionGuard.MAX_BATCH_DELETE_LIMIT} 个对象防灾上限并安全截断，仍有剩余对象，请再次调用继续清理）`
    : "";

  return {
    success: true,
    bucket,
    prefix: validPrefix,
    deletedCount,
    isTruncated,
    message: `递归前缀 "${validPrefix}" 清理完成，本批次安全清理 ${deletedCount} 个对象${truncatedTip}`,
  };
}
