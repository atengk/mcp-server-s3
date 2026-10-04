/**
 * S3 预签名直链服务 (Presigned URL Service)
 *
 * 生成有时效性的 HTTP(S) 下载与上传预签名外链，支持只读门禁安全校验
 *
 * @author Ateng
 * @since 2026-10-04
 */

import {
  GetObjectCommand,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { ReadOnlyGuard } from "../security/readonly-guard.js";
import type { GetPresignedUrlInput } from "../types/tools.js";
import { resolveBucket } from "./object-service.js";

/**
 * 默认预签名 URL 有效期 (1 小时 / 3600 秒，遵循 MCP_S3_PRESIGNED_EXPIRES 规约)
 */
const DEFAULT_EXPIRES_IN_SECONDS = 3600;

/**
 * 生成具备时效性的预签名直链 (支持下载 GET 与上传 PUT)
 *
 * @param client S3 客户端实例
 * @param params 预签名参数
 * @param readOnlyGuard 只读门禁守卫 (可选)
 * @param defaultBucket 默认存储桶
 * @param defaultExpiresIn 全局默认有效秒数
 * @return 预签名直链与配置元信息
 * @throws 当只读模式下尝试生成 PUT 上传直链时抛出 SecurityError
 */
export async function getPresignedUrl(
  client: S3Client,
  params: GetPresignedUrlInput,
  readOnlyGuard?: ReadOnlyGuard,
  defaultBucket?: string,
  defaultExpiresIn?: number
): Promise<{ url: string; bucket: string; key: string; method: "GET" | "PUT"; expiresIn: number }> {
  const method = params.method || "GET";

  // 若处于只读门禁模式，校验是否允许生成该方法的预签名外链
  if (readOnlyGuard) {
    readOnlyGuard.assertPresignedUrlMethodAllowed(method);
  }

  const bucket = resolveBucket(params.bucket, defaultBucket);
  const expiresIn = params.expires_in ?? defaultExpiresIn ?? DEFAULT_EXPIRES_IN_SECONDS;

  const command =
    method === "PUT"
      ? new PutObjectCommand({ Bucket: bucket, Key: params.key })
      : new GetObjectCommand({ Bucket: bucket, Key: params.key });

  const url = await getSignedUrl(client, command, { expiresIn });

  return {
    url,
    bucket,
    key: params.key,
    method,
    expiresIn,
  };
}
