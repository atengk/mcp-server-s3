/**
 * 全局只读门禁守卫 (Read-Only Guard)
 *
 * 当启用只读门禁模式时，在 MCP 协议层完全隐藏并阻断写/删类高危工具
 *
 * @author Ateng
 * @since 2026-10-04
 */

import { SecurityError } from "../types/security.js";

/**
 * 只读门禁守卫
 */
export class ReadOnlyGuard {
  /**
   * 允许在只读模式下调用的只读/探索类工具列表
   */
  public static readonly READ_ONLY_TOOLS = new Set([
    "s3_ping",
    "list_buckets",
    "get_bucket_location",
    "list_objects",
    "search_objects",
    "stat_object",
    "read_object_text",
    "read_object_range",
    "download_file",
    "get_presigned_url",
    "get_object_tags",
  ]);

  /**
   * 写/改/删高危工具清单
   */
  public static readonly MUTATING_TOOLS = new Set([
    "create_bucket",
    "delete_bucket",
    "put_object_text",
    "upload_file",
    "copy_object",
    "move_object",
    "delete_object",
    "delete_objects_batch",
    "delete_objects_by_prefix",
    "set_object_tags",
  ]);

  private isReadOnly: boolean;

  public constructor(isReadOnly = false) {
    this.isReadOnly = isReadOnly;
  }

  /**
   * 判定目标工具是否属于写/改/删高危工具
   *
   * @param toolName 工具名称
   * @return 是否为变更操作类工具
   */
  public static isMutatingTool(toolName: string): boolean {
    return ReadOnlyGuard.MUTATING_TOOLS.has(toolName);
  }

  /**
   * 判断目标工具在当前门禁状态下是否被允许调用
   *
   * @param toolName 工具名称
   * @return 是否允许调用
   */
  public isToolAllowed(toolName: string): boolean {
    if (!this.isReadOnly) {
      return true;
    }
    return ReadOnlyGuard.READ_ONLY_TOOLS.has(toolName);
  }

  /**
   * 断言目标工具在当前门禁状态下可调用；若属于写/删高危工具且处于只读模式则抛出异常
   *
   * @param toolName 工具名称
   * @throws 当处于只读模式且尝试调用高危工具时抛出 SecurityError
   */
  public assertToolAllowed(toolName: string): void {
    if (this.isReadOnly && !ReadOnlyGuard.READ_ONLY_TOOLS.has(toolName)) {
      throw new SecurityError(
        "READONLY_VIOLATION",
        `当前服务处于全局只读门禁模式 (MCP_S3_READ_ONLY=true)，已阻断对写/删高危工具 "${toolName}" 的调用`
      );
    }
  }

  /**
   * 校验预签名 URL 方法；只读模式下严禁生成 PUT 上传直链
   *
   * @param method HTTP 请求方法
   * @throws 当只读模式下请求 PUT 链接时抛出 SecurityError
   */
  public assertPresignedUrlMethodAllowed(method?: "GET" | "PUT"): void {
    if (this.isReadOnly && method === "PUT") {
      throw new SecurityError(
        "READONLY_VIOLATION",
        "当前处于全局只读门禁模式 (MCP_S3_READ_ONLY=true)，禁止生成带有上传写入权限 (PUT) 的预签名 URL"
      );
    }
  }

  /**
   * 在 MCP 协议握手层物理过滤工具集合，在只读模式下隐藏所有写/删类工具
   *
   * @param tools 原始工具定义列表
   * @return 过滤后的安全工具定义列表
   */
  public filterTools<T extends { name: string }>(tools: T[]): T[] {
    if (!this.isReadOnly) {
      return tools;
    }
    return tools.filter((tool) => this.isToolAllowed(tool.name));
  }
}
