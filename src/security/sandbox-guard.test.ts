/**
 * 工作区路径沙箱守卫单元测试
 *
 * @author Ateng
 * @since 2026-10-04
 */

import path from "node:path";
import { describe, expect, it } from "vitest";
import { SecurityError } from "../types/security.js";
import { SandboxGuard } from "./sandbox-guard.js";

describe("工作区路径沙箱守卫测试 (SandboxGuard)", () => {
  const baseDir = path.resolve("./test-sandbox");
  const guard = new SandboxGuard(baseDir);

  it("允许沙箱内的相对路径并返回规范化绝对路径", () => {
    const resolved = guard.validatePath("data/test.txt");
    expect(resolved).toBe(path.join(baseDir, "data", "test.txt"));

    const resolvedCurrent = guard.validatePath("./test.txt");
    expect(resolvedCurrent).toBe(path.join(baseDir, "test.txt"));
  });

  it("允许沙箱内的合法绝对路径", () => {
    const insidePath = path.join(baseDir, "subfolder", "file.json");
    const resolved = guard.validatePath(insidePath);
    expect(resolved).toBe(insidePath);
  });

  it("严厉阻断 ../ 相对路径遍历逃逸", () => {
    expect(() => guard.validatePath("../escape.txt")).toThrow(SecurityError);
    expect(() => guard.validatePath("data/../../escape.txt")).toThrow("超出受管本地工作区沙箱目录范围");
  });

  it("阻断沙箱外部的绝对路径访问", () => {
    const outsidePath = path.resolve("./another-dir/secret.pem");
    try {
      guard.validatePath(outsidePath);
      expect.unreachable("应当抛出 SecurityError");
    } catch (err) {
      expect(err).toBeInstanceOf(SecurityError);
      expect((err as SecurityError).code).toBe("SANDBOX_VIOLATION");
      expect((err as SecurityError).message).toContain("超出受管本地工作区沙箱目录范围");
    }
  });

  it("同名前缀相似目录攻击防护 (如 sandbox-evil 不得匹配 sandbox)", () => {
    const evilSiblingDir = path.resolve(`${baseDir}-evil/malicious.txt`);
    expect(() => guard.validatePath(evilSiblingDir)).toThrow(SecurityError);
  });

  it("空路径直接拒绝", () => {
    expect(() => guard.validatePath("")).toThrow("路径不能为空");
    expect(() => guard.validatePath("   ")).toThrow("路径不能为空");
  });
});
