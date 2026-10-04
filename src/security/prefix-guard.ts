/**
 * 前缀删除防灾熔断守卫 (Prefix Deletion Guard)
 *
 * 实施三重防灾熔断：非空非根前缀防护、显式二次确认校验与千级单批次安全上限
 *
 * @author Ateng
 * @since 2026-10-04
 */

import { SecurityError } from "../types/security.js";

/**
 * 递归前缀清理防灾守卫
 */
export class PrefixDeletionGuard {
  /**
   * S3 标准单批次批量删除上限 (1000 个对象)
   */
  public static readonly MAX_BATCH_DELETE_LIMIT = 1000;

  /**
   * 检验递归删除前缀并校验显式确认标记
   *
   * @param prefix 目标前缀字符串
   * @param confirmRecursiveDelete 二次确认布尔标识
   * @return 经过校验与规范化的安全前缀
   * @throws 当缺少确认标记、前缀为空或为根斜杠时抛出 SecurityError
   */
  public static validate(prefix: string, confirmRecursiveDelete: boolean): string {
    // 1. 第一重防灾：二次确认参数必须严格显式传入 true
    if (confirmRecursiveDelete !== true) {
      throw new SecurityError(
        "PREFIX_DELETION_VIOLATION",
        "递归清理虚拟目录属于高危操作，必须显式传递 confirm_recursive_delete 为 true 才能执行"
      );
    }

    // 2. 第二重防灾：严禁根前缀 (空字符串或纯空白字符)
    if (!prefix || prefix.trim() === "") {
      throw new SecurityError(
        "PREFIX_DELETION_VIOLATION",
        "严禁使用空字符串作为递归删除前缀，该操作将清空整个存储桶！"
      );
    }

    const trimmed = prefix.trim();

    // 3. 第二重防灾强化：严禁纯斜杠根路径 (/ 或 // 或 /\)
    if (/^[/\\]+$/.test(trimmed)) {
      throw new SecurityError(
        "PREFIX_DELETION_VIOLATION",
        `严禁使用纯斜杠根路径 ("${trimmed}") 作为递归删除前缀，该操作将清空整个存储桶！`
      );
    }

    return trimmed;
  }

  /**
   * 校验批量删除的对象键列表上限 (第三重防灾熔断)
   *
   * @param keys 待批量删除的对象键列表
   * @return 校验通过的对象键列表
   * @throws 当列表为空或元素数量超过 1000 时抛出 SecurityError
   */
  public static validateBatchKeys(keys: string[]): string[] {
    if (!keys || keys.length === 0) {
      throw new SecurityError("PREFIX_DELETION_VIOLATION", "待删除的对象键列表不能为空");
    }

    if (keys.length > PrefixDeletionGuard.MAX_BATCH_DELETE_LIMIT) {
      throw new SecurityError(
        "PREFIX_DELETION_VIOLATION",
        `单次批量删除数量 (${keys.length}) 超出 S3 安全限制上限 (${PrefixDeletionGuard.MAX_BATCH_DELETE_LIMIT})`
      );
    }

    return keys;
  }
}
