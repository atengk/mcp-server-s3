/**
 * S3 客户端单例工厂与连接管理器
 *
 * @author Ateng
 * @since 2026-10-04
 */

import { S3Client } from "@aws-sdk/client-s3";
import { parseEnv } from "../config/env.js";
import type { AppConfig, S3ClientConfig } from "../types/config.js";

/**
 * 模块内部缓存的全局单例客户端
 */
let singletonClient: S3Client | null = null;
let lastConfigHash = "";

/**
 * 计算配置核心特征哈希，用于单例配置变更自动感知与重建
 */
function computeConfigHash(config: AppConfig): string {
  return `${config.endpoint || ""}|${config.region}|${config.accessKeyId || ""}|${config.secretAccessKey || ""}|${config.sessionToken || ""}|${config.forcePathStyle}`;
}

/**
 * 根据应用配置装配 S3ClientConfig 选项 (包含重试与寻址策略)
 *
 * @param config 应用全局配置
 * @return 组装后的底层客户端选项
 */
export function getS3ClientConfig(config: AppConfig): S3ClientConfig {
  const clientConfig: S3ClientConfig = {
    region: config.region,
    forcePathStyle: config.forcePathStyle,
  };

  if (config.endpoint) {
    clientConfig.endpoint = config.endpoint;
  }

  if (config.accessKeyId && config.secretAccessKey) {
    clientConfig.credentials = {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      sessionToken: config.sessionToken,
    };
  }

  return clientConfig;
}

/**
 * 根据应用配置创建全新的 S3Client 实例 (支持默认 3 次重试策略)
 *
 * @param config 应用全局配置
 * @return 全新实例化的 S3Client 对象
 */
export function createS3Client(config: AppConfig): S3Client {
  const options = getS3ClientConfig(config);
  return new S3Client({
    ...options,
    maxAttempts: 3,
  });
}

/**
 * 获取或创建全局单例 S3Client 实例 (具备配置变动感知重建能力)
 *
 * @param config 可选应用配置，缺失时直接复用既有单例或加载当前环境变量解析
 * @return 缓存或新创建的单例 S3Client 实例
 */
export function getS3Client(config?: AppConfig): S3Client {
  // 1. 若未显式传入新配置且单例已存在，直接返回当前单例
  if (config === undefined && singletonClient !== null) {
    return singletonClient;
  }

  const effectiveConfig = config ?? parseEnv();
  const currentHash = computeConfigHash(effectiveConfig);

  // 2. 若单例存在且显式传入了不同配置，主动销毁旧实例并重建
  if (singletonClient !== null && lastConfigHash !== currentHash) {
    resetS3Client();
  }

  if (singletonClient === null) {
    singletonClient = createS3Client(effectiveConfig);
    lastConfigHash = currentHash;
  }

  return singletonClient;
}

/**
 * 销毁并重置当前的单例客户端
 */
export function resetS3Client(): void {
  if (singletonClient !== null) {
    try {
      singletonClient.destroy();
    } catch {
      // 忽略销毁异常
    }
    singletonClient = null;
    lastConfigHash = "";
  }
}
