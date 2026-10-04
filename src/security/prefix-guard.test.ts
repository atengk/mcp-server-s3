/**
 * 前缀删除防灾熔断守卫单元测试
 *
 * @author Ateng
 * @since 2026-10-04
 */

import { describe, expect, it } from "vitest";
import { SecurityError } from "../types/security.js";
import { PrefixDeletionGuard } from "./prefix-guard.js";

describe("前缀删除防灾熔断守卫测试 (PrefixDeletionGuard)", () => {
  describe("validate - 递归前缀与确认校验", () => {
    it("合法前缀与显式 confirm=true 时成功放行并规范化前缀", () => {
      const valid = PrefixDeletionGuard.validate("logs/2026-10/", true);
      expect(valid).toBe("logs/2026-10/");
    });

    it("未显式确认 (confirm=false 或未定义) 时直接熔断拦截", () => {
      expect(() => PrefixDeletionGuard.validate("logs/", false)).toThrow(SecurityError);
      expect(() => PrefixDeletionGuard.validate("logs/", false)).toThrow("必须显式传递 confirm_recursive_delete 为 true");
    });

    it("严禁空字符串或纯空白作为根前缀 (清桶防御)", () => {
      expect(() => PrefixDeletionGuard.validate("", true)).toThrow("严禁使用空字符串作为递归删除前缀");
      expect(() => PrefixDeletionGuard.validate("   ", true)).toThrow("严禁使用空字符串作为递归删除前缀");
    });

    it("严禁纯斜杠根路径作为递归删除前缀 (清桶防御)", () => {
      expect(() => PrefixDeletionGuard.validate("/", true)).toThrow("严禁使用纯斜杠根路径");
      expect(() => PrefixDeletionGuard.validate("//", true)).toThrow("严禁使用纯斜杠根路径");
      expect(() => PrefixDeletionGuard.validate("/\\", true)).toThrow("严禁使用纯斜杠根路径");
    });
  });

  describe("validateBatchKeys - 批量删除千级上限校验", () => {
    it("合法范围内的键列表放行", () => {
      const keys = ["a.txt", "b.txt", "c.txt"];
      const validated = PrefixDeletionGuard.validateBatchKeys(keys);
      expect(validated).toEqual(keys);
    });

    it("空列表直接拦截", () => {
      expect(() => PrefixDeletionGuard.validateBatchKeys([])).toThrow("待删除的对象键列表不能为空");
    });

    it("超出 1000 上限时触发熔断截断拦截", () => {
      const tooManyKeys = Array.from({ length: 1001 }, (_, i) => `key_${i}`);
      expect(() => PrefixDeletionGuard.validateBatchKeys(tooManyKeys)).toThrow("超出 S3 安全限制上限 (1000)");
    });
  });
});
