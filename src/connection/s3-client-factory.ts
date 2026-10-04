/**
 * S3 客户端工厂与连接装配器
 *
 * @author Ateng
 * @since 2026-10-04
 */

import { S3Client } from "@aws-sdk/client-s3";
import type { AppConfig, S3ClientConfig } from "../types/config.js";

/**
 * 根据应用配置装配 S3ClientConfig 选项
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
 * 根据应用配置创建并返回 S3Client 实例
 *
 * @param config 应用全局配置
 * @return 实例化的 S3Client 对象
 */
export function createS3Client(config: AppConfig): S3Client {
  return new S3Client(getS3ClientConfig(config));
}
