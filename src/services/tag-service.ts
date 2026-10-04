/**
 * S3 对象业务标签治理服务 (Tag Service)
 *
 * 提供 S3 对象的业务 Key-Value 标签查询与全量覆盖设置
 *
 * @author Ateng
 * @since 2026-10-04
 */

import {
  GetObjectTaggingCommand,
  PutObjectTaggingCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import type { ObjectTags } from "../types/s3.js";
import type {
  GetObjectTagsInput,
  SetObjectTagsInput,
} from "../types/tools.js";
import { resolveBucket } from "./object-service.js";

/**
 * 查询对象关联的 Key-Value 业务标签字典
 *
 * @param client S3 客户端实例
 * @param params 标签查询入参
 * @param defaultBucket 默认存储桶
 * @return 对象标签映射字典 (无标签时返回空对象)
 */
export async function getObjectTags(
  client: S3Client,
  params: GetObjectTagsInput,
  defaultBucket?: string
): Promise<ObjectTags> {
  const bucket = resolveBucket(params.bucket, defaultBucket);

  const response = await client.send(
    new GetObjectTaggingCommand({
      Bucket: bucket,
      Key: params.key,
    })
  );

  const tags: ObjectTags = {};
  if (response.TagSet) {
    for (const tag of response.TagSet) {
      if (tag.Key) {
        tags[tag.Key] = tag.Value || "";
      }
    }
  }

  return tags;
}

/**
 * 写入或全量覆盖对象业务标签
 *
 * @param client S3 客户端实例
 * @param params 标签设置入参
 * @param defaultBucket 默认存储桶
 * @return 标签设置结果
 */
export async function setObjectTags(
  client: S3Client,
  params: SetObjectTagsInput,
  defaultBucket?: string
): Promise<{ success: boolean; bucket: string; key: string; tags: ObjectTags; message: string }> {
  const bucket = resolveBucket(params.bucket, defaultBucket);

  const tagSet = Object.entries(params.tags).map(([Key, Value]) => ({ Key, Value }));

  await client.send(
    new PutObjectTaggingCommand({
      Bucket: bucket,
      Key: params.key,
      Tagging: {
        TagSet: tagSet,
      },
    })
  );

  return {
    success: true,
    bucket,
    key: params.key,
    tags: params.tags,
    message: `对象 "${params.key}" 成功设置 ${tagSet.length} 个业务标签`,
  };
}
