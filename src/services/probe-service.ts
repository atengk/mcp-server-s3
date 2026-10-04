/**
 * S3 连通性自省探针核心服务 (s3_ping)
 *
 * @author Ateng
 * @since 2026-10-04
 */

import { HeadBucketCommand, ListBucketsCommand, type S3Client } from "@aws-sdk/client-s3";
import { maskAccessKey } from "../config/env.js";
import type { AppConfig } from "../types/config.js";
import type { ConnectivityProbeResult } from "../types/s3.js";

/**
 * 构建规范化的探针结果对象，避免多分支重复构造
 *
 * @param config 应用全局配置
 * @param status 诊断状态 ("ok" | "error")
 * @param rttMs 网络往返时延毫秒数
 * @param message 诊断提示信息
 * @return 组装后的自省探针契约对象
 */
function buildProbeResult(
  config: AppConfig,
  status: "ok" | "error",
  rttMs: number,
  message: string
): ConnectivityProbeResult {
  return {
    status,
    endpoint: config.endpoint,
    region: config.region,
    accessKeyIdMasked: maskAccessKey(config.accessKeyId),
    rttMs,
    message,
  };
}

/**
 * 执行轻量连通性自省探针诊断
 *
 * 向目标对象存储发起极轻量的探测请求，测试端点连通性、网络往返时延 (RTT) 并自省鉴权状态
 *
 * @param client S3 客户端实例
 * @param config 应用全局配置
 * @return 连通性诊断结果
 */
export async function executeS3Ping(
  client: S3Client,
  config: AppConfig
): Promise<ConnectivityProbeResult> {
  const startTime = performance.now();

  try {
    // 1. 若配置了默认存储桶，优先针对目标存储桶执行 HeadBucket 轻量探活；否则发起全局 ListBuckets 探测
    if (config.defaultBucket) {
      await client.send(new HeadBucketCommand({ Bucket: config.defaultBucket }));
    } else {
      await client.send(new ListBucketsCommand({}));
    }

    const rttMs = Math.round(performance.now() - startTime);
    return buildProbeResult(config, "ok", rttMs, "S3 端点连通性检测正常");
  } catch (err: unknown) {
    // 2. 空安全前置防御与错误属性安全解析
    const rttMs = Math.round(performance.now() - startTime);

    const isObject = typeof err === "object" && err !== null;
    const errorObj = isObject ? (err as Record<string, unknown>) : {};
    const errName =
      typeof errorObj.name === "string"
        ? errorObj.name
        : typeof errorObj.Code === "string"
        ? errorObj.Code
        : "";
    const errMsg =
      err instanceof Error
        ? err.message
        : typeof errorObj.message === "string"
        ? errorObj.message
        : String(err);

    // 若触发鉴权拒绝 (AccessDenied / Forbidden)，说明网络链路与端点完全可达，但凭据未通过鉴权或缺乏权限
    if (
      errName === "AccessDenied" ||
      errName === "Forbidden" ||
      errName === "Unauthorized" ||
      errMsg.includes("Access Denied")
    ) {
      return buildProbeResult(
        config,
        "error",
        rttMs,
        `S3 端点可达，但鉴权失败或权限受限 (${errName}): ${errMsg}`.trim()
      );
    }

    return buildProbeResult(config, "error", rttMs, `S3 端点连接失败: ${errMsg}`);
  }
}
