/**
 * 存储桶生命周期服务 (Bucket Service)
 *
 * 管理存储桶的列出、创建、删除及物理地域查询
 *
 * @author Ateng
 * @since 2026-10-04
 */

import {
  BucketLocationConstraint,
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectsCommand,
  GetBucketLocationCommand,
  ListBucketsCommand,
  ListObjectsV2Command,
  type S3Client,
} from "@aws-sdk/client-s3";
import type { BucketItem } from "../types/s3.js";

/**
 * 查询全量存储桶列表
 *
 * @param client S3 客户端实例
 * @return 存储桶信息数组 (无数据时返回空数组，绝不返回 null)
 */
export async function listBuckets(client: S3Client): Promise<BucketItem[]> {
  const response = await client.send(new ListBucketsCommand({}));
  if (!response.Buckets || response.Buckets.length === 0) {
    return [];
  }

  return response.Buckets.map((b) => ({
    name: b.Name || "",
    creationDate: b.CreationDate,
  }));
}

/**
 * 创建新存储桶
 *
 * @param client S3 客户端实例
 * @param bucket 待创建的存储桶名称
 * @param region 可选部署地域 (us-east-1 以外区域需传入 LocationConstraint)
 * @return 创建结果
 */
export async function createBucket(
  client: S3Client,
  bucket: string,
  region?: string
): Promise<{ success: boolean; bucket: string; message: string }> {
  const isUsEast1 = !region || region.toLowerCase() === "us-east-1";

  await client.send(
    new CreateBucketCommand({
      Bucket: bucket,
      CreateBucketConfiguration: isUsEast1
        ? undefined
        : { LocationConstraint: region as BucketLocationConstraint },
    })
  );

  return {
    success: true,
    bucket,
    message: `存储桶 "${bucket}" 创建成功${region ? ` (区域: ${region})` : ""}`,
  };
}

/**
 * 删除指定存储桶 (支持 force=true 强制级联清空对象后删除)
 *
 * @param client S3 客户端实例
 * @param bucket 待删除的存储桶名称
 * @param force 是否强制清理桶内所有对象后删除
 * @return 删除结果
 */
export async function deleteBucket(
  client: S3Client,
  bucket: string,
  force = false
): Promise<{ success: boolean; bucket: string; message: string }> {
  // 1. 若开启 force 强制删除，循环分页清空桶内所有对象
  if (force) {
    let continuationToken: string | undefined;
    do {
      const listResp = await client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          ContinuationToken: continuationToken,
        })
      );

      if (listResp.Contents && listResp.Contents.length > 0) {
        const objectsToDelete = listResp.Contents.map((obj) => ({ Key: obj.Key || "" })).filter(
          (item) => item.Key !== ""
        );

        if (objectsToDelete.length > 0) {
          await client.send(
            new DeleteObjectsCommand({
              Bucket: bucket,
              Delete: { Objects: objectsToDelete, Quiet: true },
            })
          );
        }
      }

      continuationToken = listResp.NextContinuationToken;
    } while (continuationToken);
  }

  // 2. 执行最终删除存储桶操作
  await client.send(new DeleteBucketCommand({ Bucket: bucket }));

  return {
    success: true,
    bucket,
    message: `存储桶 "${bucket}" 删除成功${force ? " (已清理桶内所有关联对象)" : ""}`,
  };
}

/**
 * 查询存储桶实际物理部署地域
 *
 * @param client S3 客户端实例
 * @param bucket 存储桶名称
 * @return 地域结果
 */
export async function getBucketLocation(
  client: S3Client,
  bucket: string
): Promise<{ bucket: string; region: string }> {
  const response = await client.send(new GetBucketLocationCommand({ Bucket: bucket }));
  const region = response.LocationConstraint || "us-east-1";

  return {
    bucket,
    region,
  };
}
