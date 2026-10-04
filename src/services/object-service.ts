/**
 * S3 对象检索探索与内容直读服务 (Object Service)
 *
 * 提供虚拟目录树分页、关键字与正则匹配搜索、对象元数据检视、安全内存流式截断直读与 Range 范围读取
 *
 * @author Ateng
 * @since 2026-10-04
 */

import {
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  type S3Client,
} from "@aws-sdk/client-s3";
import type { ContentTruncator } from "../security/content-truncator.js";
import type {
  ListObjectsResult,
  ObjectMetadata,
  RangeReadResult,
  ReadObjectTextResult,
  S3ObjectItem,
} from "../types/s3.js";
import type {
  ListObjectsInput,
  ReadObjectRangeInput,
  ReadObjectTextInput,
  SearchObjectsInput,
  StatObjectInput,
} from "../types/tools.js";

/**
 * 常见二进制多媒体与归档 MIME 前缀列表
 */
const BINARY_MIME_PREFIXES = [
  "image/",
  "video/",
  "audio/",
  "application/zip",
  "application/pdf",
  "application/octet-stream",
  "application/x-gzip",
  "application/x-tar",
  "application/vnd.",
];

/**
 * 搜索对象时的最大连续扫描分页上限 (防海量对象桶无界扫描引发超时)
 */
const MAX_SEARCH_PAGES = 10;

/**
 * 解析并决议生效的存储桶名称
 *
 * @param bucket 接口显式传入的存储桶
 * @param defaultBucket 全局默认绑定的存储桶
 * @return 决议后的非空存储桶名称
 * @throws 当两者皆未指定时抛出语义化异常
 */
export function resolveBucket(bucket?: string, defaultBucket?: string): string {
  const resolved = bucket || defaultBucket;
  if (!resolved || resolved.trim() === "") {
    throw new Error(
      "[mcp-server-s3] 操作必须指定存储桶名称 (bucket)，或配置 MCP_S3_DEFAULT_BUCKET 默认存储桶"
    );
  }
  return resolved.trim();
}

/**
 * 基于流式迭代安全读取，防止全量缓冲大对象引发 Node.js OOM
 *
 * @param stream 底层可读流
 * @param byteLimit 内存最大读取上限
 * @return 收集到的 Buffer 与截断标识
 */
async function readStreamWithLimit(
  stream: unknown,
  byteLimit: number
): Promise<{ buffer: Buffer; isStreamTruncated: boolean }> {
  const chunks: Buffer[] = [];
  let bytesRead = 0;
  let isStreamTruncated = false;

  const readable = stream as AsyncIterable<Uint8Array | Buffer> & { destroy?: () => void };

  for await (const chunk of readable) {
    const chunkBuf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    if (bytesRead + chunkBuf.length > byteLimit) {
      const needed = byteLimit - bytesRead;
      if (needed > 0) {
        chunks.push(chunkBuf.subarray(0, needed));
        bytesRead += needed;
      }
      isStreamTruncated = true;
      if (typeof readable.destroy === "function") {
        readable.destroy();
      }
      break;
    }
    chunks.push(chunkBuf);
    bytesRead += chunkBuf.length;
  }

  return { buffer: Buffer.concat(chunks), isStreamTruncated };
}

/**
 * 查询虚拟分层目录树与分页对象列表 (Delimiter 默认为 '/')
 *
 * @param client S3 客户端实例
 * @param params 分页查询入参
 * @param defaultBucket 默认存储桶
 * @return 虚拟目录列表与对象聚合响应
 */
export async function listObjects(
  client: S3Client,
  params: ListObjectsInput,
  defaultBucket?: string
): Promise<ListObjectsResult> {
  const bucket = resolveBucket(params.bucket, defaultBucket);
  const delimiter = params.delimiter ?? "/";

  const response = await client.send(
    new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: params.prefix,
      Delimiter: delimiter,
      MaxKeys: params.max_keys ?? 1000,
      ContinuationToken: params.continuation_token,
    })
  );

  const objects: S3ObjectItem[] = (response.Contents ?? []).map((item) => ({
    key: item.Key || "",
    size: item.Size,
    lastModified: item.LastModified,
    etag: item.ETag,
    storageClass: item.StorageClass,
  }));

  const commonPrefixes: string[] = (response.CommonPrefixes ?? [])
    .map((cp) => cp.Prefix || "")
    .filter((p) => p !== "");

  return {
    bucket,
    prefix: params.prefix,
    delimiter,
    objects,
    commonPrefixes,
    nextContinuationToken: response.NextContinuationToken,
    isTruncated: response.IsTruncated ?? false,
  };
}

/**
 * 在前缀路径树中执行对象关键字或正则匹配搜索 (受扫描页数上限保护)
 *
 * @param client S3 客户端实例
 * @param params 搜索入参
 * @param defaultBucket 默认存储桶
 * @return 匹配的对象列表
 */
export async function searchObjects(
  client: S3Client,
  params: SearchObjectsInput,
  defaultBucket?: string
): Promise<S3ObjectItem[]> {
  const bucket = resolveBucket(params.bucket, defaultBucket);
  const maxResults = params.max_results ?? 100;

  // 1. 构建匹配器 (优先支持正则表达式，若格式不合法降级为不区分大小写的子串包含匹配)
  let matcher: (key: string) => boolean;
  try {
    const regex = new RegExp(params.query, "i");
    matcher = (key: string) => regex.test(key);
  } catch {
    const queryLower = params.query.toLowerCase();
    matcher = (key: string) => key.toLowerCase().includes(queryLower);
  }

  const matched: S3ObjectItem[] = [];
  let continuationToken: string | undefined;
  let pageCount = 0;

  do {
    pageCount++;
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: params.prefix,
        ContinuationToken: continuationToken,
        MaxKeys: 1000,
      })
    );

    if (response.Contents) {
      for (const item of response.Contents) {
        const key = item.Key || "";
        if (matcher(key)) {
          matched.push({
            key,
            size: item.Size,
            lastModified: item.LastModified,
            etag: item.ETag,
            storageClass: item.StorageClass,
          });

          if (matched.length >= maxResults) {
            return matched;
          }
        }
      }
    }

    continuationToken = response.NextContinuationToken;
  } while (continuationToken && pageCount < MAX_SEARCH_PAGES);

  return matched;
}

/**
 * 获取指定对象的元数据与属性 (HeadObject)
 *
 * @param client S3 客户端实例
 * @param params 对象属性检视入参
 * @param defaultBucket 默认存储桶
 * @return 对象元数据
 */
export async function statObject(
  client: S3Client,
  params: StatObjectInput,
  defaultBucket?: string
): Promise<ObjectMetadata> {
  const bucket = resolveBucket(params.bucket, defaultBucket);

  const response = await client.send(
    new HeadObjectCommand({
      Bucket: bucket,
      Key: params.key,
    })
  );

  return {
    bucket,
    key: params.key,
    size: response.ContentLength,
    contentType: response.ContentType,
    lastModified: response.LastModified,
    etag: response.ETag,
    metadata: response.Metadata,
  };
}

/**
 * 文本直读服务 (具备流式 OOM 防护、MIME 二进制前置拦截与编码适配)
 *
 * @param client S3 客户端实例
 * @param params 文本读取入参
 * @param truncator 截断器实例
 * @param defaultBucket 默认存储桶
 * @return 文本读取与截断结果
 */
export async function readObjectText(
  client: S3Client,
  params: ReadObjectTextInput,
  truncator: ContentTruncator,
  defaultBucket?: string
): Promise<ReadObjectTextResult> {
  const bucket = resolveBucket(params.bucket, defaultBucket);
  const maxBytes = params.max_bytes ?? 262144;

  const response = await client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: params.key,
    })
  );

  const totalBytes = response.ContentLength ?? 0;
  const contentType = response.ContentType || "";

  // 1. 基于 MIME 类型的前置二进制拦截
  const isBinaryMime = BINARY_MIME_PREFIXES.some((prefix) =>
    contentType.toLowerCase().startsWith(prefix)
  );

  if (isBinaryMime) {
    return {
      bucket,
      key: params.key,
      content: "",
      truncated: true,
      totalBytes,
      readBytes: 0,
      warning:
        `[... ⚠️ MCP-S3 安全拦截：根据 Content-Type (${contentType})，该对象为二进制文件。` +
        "已智能拦截文本直读，建议使用 stat_object 查询元数据、download_file 下载到沙箱、或使用 get_presigned_url 生成临时直链 ...]",
    };
  }

  if (!response.Body) {
    return {
      bucket,
      key: params.key,
      content: "",
      truncated: false,
      totalBytes: 0,
      readBytes: 0,
    };
  }

  // 2. 流式安全读取：最多读取 maxBytes + 1024 字节，超量即时销毁流，彻底防范 OOM
  const safeBufferLimit = maxBytes + 1024;
  const { buffer } = await readStreamWithLimit(response.Body, safeBufferLimit);

  // 3. 经过智能截断器校验二进制与字符边界
  const processed = truncator.process(buffer, maxBytes);
  const effectiveTotalBytes = Math.max(totalBytes, buffer.length);

  return {
    bucket,
    key: params.key,
    content: processed.content,
    truncated: processed.isTruncated || effectiveTotalBytes > maxBytes,
    totalBytes: effectiveTotalBytes,
    readBytes: processed.readBytes,
    warning: processed.warning,
  };
}

/**
 * 局部字节区间读取 (Range Read)
 *
 * @param client S3 客户端实例
 * @param params 字节区间读取入参
 * @param defaultBucket 默认存储桶
 * @param truncator 可选截断器 (复用二进制判定能力)
 * @return 范围读取结果
 */
export async function readObjectRange(
  client: S3Client,
  params: ReadObjectRangeInput,
  defaultBucket?: string,
  truncator?: ContentTruncator
): Promise<RangeReadResult> {
  const bucket = resolveBucket(params.bucket, defaultBucket);

  const response = await client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: params.key,
      Range: `bytes=${params.start_byte}-${params.end_byte}`,
    })
  );

  let buffer = Buffer.alloc(0);
  if (response.Body) {
    const rawBytes = await response.Body.transformToByteArray();
    buffer = Buffer.from(rawBytes);
  }

  // 复用 ContentTruncator 的二进制判别能力
  const isBinary = truncator ? truncator.isBinary(buffer) : buffer.includes(0x00);
  const text = isBinary ? undefined : buffer.toString("utf-8");

  return {
    bucket,
    key: params.key,
    startByte: params.start_byte,
    endByte: params.end_byte,
    contentLength: buffer.length,
    dataBase64: buffer.toString("base64"),
    text,
  };
}
