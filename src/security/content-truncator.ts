/**
 * 文本直读智能截断器与二进制拦截器 (Content Truncator)
 *
 * 限制 read_object_text 单次读取安全阈值 (默认 256KB)，防止大日志撑爆上下文，智能拦截二进制文件并提供安全操作引导
 *
 * @author Ateng
 * @since 2026-10-04
 */

import type { ContentTruncationResult } from "../types/security.js";

/**
 * 默认文本直读最大安全阈值：256KB (262144 字节)
 */
export const DEFAULT_MAX_READ_BYTES = 262144;

/**
 * 采样检查二进制的最大探测字节数 (前 4096 字节)
 */
const BINARY_PROBE_BYTES = 4096;

/**
 * 计算安全的 UTF-8 切割点，防止截断多字节字符引发乱码
 *
 * @param buf 待切片 Buffer
 * @param limit 期望的截断字节数上限
 * @return 确保 UTF-8 字符序列完整性的安全切割索引
 */
export function findSafeUtf8CutPoint(buf: Buffer, limit: number): number {
  if (limit <= 0 || limit >= buf.length) {
    return Math.min(Math.max(0, limit), buf.length);
  }

  // 从期望切点 limit - 1 向前最多回退 3 个字节寻找前导字节
  for (let i = 0; i < 4 && limit - 1 - i >= 0; i++) {
    const byte = buf[limit - 1 - i];
    // 命中单字节 ASCII (0x00 ~ 0x7F)
    if (byte < 0x80) {
      return limit;
    }
    // 命中多字节前导字节 (>= 0xC0)
    if (byte >= 0xc0) {
      let expectedBytes = 1;
      if (byte >= 0xf0) {
        expectedBytes = 4;
      } else if (byte >= 0xe0) {
        expectedBytes = 3;
      } else if (byte >= 0xc0) {
        expectedBytes = 2;
      }
      const actualContinuationBytes = i;
      // 若包含的前导字节 + 后续延续字节数量充足，字符完整
      if (actualContinuationBytes + 1 >= expectedBytes) {
        return limit;
      }
      // 否则字符被切断，回退到此前导字节之前
      return limit - 1 - i;
    }
    // 字节为 0x80 ~ 0xBF，为延续字节，继续往前寻找前导字节
  }

  return limit;
}

/**
 * 截断器构造配置项
 */
export interface ContentTruncatorOptions {
  maxBytes?: number;
}

/**
 * 内容截断与二进制防护处理器
 */
export class ContentTruncator {
  private defaultMaxBytes: number;

  public constructor(options?: ContentTruncatorOptions) {
    this.defaultMaxBytes = options?.maxBytes ?? DEFAULT_MAX_READ_BYTES;
  }

  /**
   * 智能检测 Buffer 是否为二进制数据
   *
   * @param buffer 输入字节流
   * @return 是否为二进制数据
   */
  public isBinary(buffer: Buffer): boolean {
    if (!buffer || buffer.length === 0) {
      return false;
    }

    const checkLength = Math.min(buffer.length, BINARY_PROBE_BYTES);
    let controlCharCount = 0;

    for (let i = 0; i < checkLength; i++) {
      const byte = buffer[i];

      // 1. 若出现空字节 (0x00)，几乎确定为二进制文件
      if (byte === 0x00) {
        return true;
      }

      // 2. 统计非标准文本控制字符 (排除换行 \n, 回车 \r, 制表符 \t, 换页 \f 等常见文本排版符)
      if (byte < 0x09 || (byte > 0x0d && byte < 0x20) || byte === 0x7f) {
        controlCharCount++;
      }
    }

    // 若控制字符占比超过 10%，判定为二进制数据
    return controlCharCount / checkLength > 0.1;
  }

  /**
   * 对字节流执行安全文本转换、二进制检测与防爆截断
   *
   * @param buffer 原始对象数据流
   * @param overrideMaxBytes 可选覆盖的单次读取阈值大小
   * @return 经过安全处理后的截断结果
   */
  public process(buffer: Buffer, overrideMaxBytes?: number): ContentTruncationResult {
    const totalBytes = buffer.length;

    if (totalBytes === 0) {
      return {
        content: "",
        isTruncated: false,
        totalBytes: 0,
        readBytes: 0,
        isBinary: false,
      };
    }

    // 1. 二进制文件识别与拦截引导
    if (this.isBinary(buffer)) {
      return {
        content: "",
        isTruncated: true,
        totalBytes,
        readBytes: 0,
        isBinary: true,
        warning:
          `[... ⚠️ MCP-S3 安全拦截：检测到对象内容为二进制数据 (总大小: ${totalBytes} 字节)，已智能拦截文本直读。` +
          "建议使用 stat_object 查询元数据、download_file 下载至受管本地沙箱、或使用 get_presigned_url 生成带有时效的预签名访问链接 ...]",
      };
    }

    const limit = overrideMaxBytes ?? this.defaultMaxBytes;

    // 2. 文本未超出限制，原样返回
    if (totalBytes <= limit) {
      return {
        content: buffer.toString("utf-8"),
        isTruncated: false,
        totalBytes,
        readBytes: totalBytes,
        isBinary: false,
      };
    }

    // 3. 超出阈值，计算 UTF-8 安全字符切割边界
    const safeCutPoint = findSafeUtf8CutPoint(buffer, limit);
    const sliceBuf = buffer.subarray(0, safeCutPoint);
    const textSlice = sliceBuf.toString("utf-8");

    const warningNotice =
      `\n\n[... ⚠️ MCP-S3 内容截断提示：对象体积 (${totalBytes} 字节) 超出单次直读安全阈值 (${limit} 字节)，已自动安全截断并保留前 ${safeCutPoint} 字节。` +
      "如需阅读更多内容，请使用 read_object_range 进行字节范围分块读取，或使用 download_file 下载到本地沙箱 ...]";

    return {
      content: `${textSlice}${warningNotice}`,
      isTruncated: true,
      totalBytes,
      readBytes: safeCutPoint,
      isBinary: false,
      warning: `对象文本体积 (${totalBytes} 字节) 超出最大读取阈值 (${limit} 字节)，已截断并注入分块指引`,
    };
  }
}
