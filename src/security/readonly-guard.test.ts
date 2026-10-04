/**
 * 全局只读门禁守卫单元测试
 *
 * @author Ateng
 * @since 2026-10-04
 */

import { describe, expect, it } from "vitest";
import { SecurityError } from "../types/security.js";
import { ReadOnlyGuard } from "./readonly-guard.js";

describe("全局只读门禁守卫测试 (ReadOnlyGuard)", () => {
  it("非只读模式下放行所有工具", () => {
    const guard = new ReadOnlyGuard(false);
    expect(guard.isToolAllowed("s3_ping")).toBe(true);
    expect(guard.isToolAllowed("list_buckets")).toBe(true);
    expect(guard.isToolAllowed("delete_bucket")).toBe(true);
    expect(guard.isToolAllowed("delete_objects_by_prefix")).toBe(true);

    expect(() => guard.assertToolAllowed("delete_bucket")).not.toThrow();
  });

  it("只读模式下仅放行只读探索工具", () => {
    const guard = new ReadOnlyGuard(true);
    expect(guard.isToolAllowed("s3_ping")).toBe(true);
    expect(guard.isToolAllowed("list_buckets")).toBe(true);
    expect(guard.isToolAllowed("list_objects")).toBe(true);
    expect(guard.isToolAllowed("read_object_text")).toBe(true);
    expect(guard.isToolAllowed("stat_object")).toBe(true);
    expect(guard.isToolAllowed("get_object_tags")).toBe(true);

    // 阻断写/删高危工具
    expect(guard.isToolAllowed("create_bucket")).toBe(false);
    expect(guard.isToolAllowed("delete_bucket")).toBe(false);
    expect(guard.isToolAllowed("put_object_text")).toBe(false);
    expect(guard.isToolAllowed("upload_file")).toBe(false);
    expect(guard.isToolAllowed("delete_object")).toBe(false);
    expect(guard.isToolAllowed("delete_objects_by_prefix")).toBe(false);
    expect(guard.isToolAllowed("set_object_tags")).toBe(false);
  });

  it("只读模式下断言写工具时抛出 SecurityError 语义化异常", () => {
    const guard = new ReadOnlyGuard(true);
    expect(() => guard.assertToolAllowed("delete_objects_batch")).toThrow(SecurityError);
    expect(() => guard.assertToolAllowed("delete_objects_batch")).toThrow("全局只读门禁模式");
  });

  it("只读模式下禁止生成 PUT 预签名上传链接", () => {
    const guard = new ReadOnlyGuard(true);
    expect(() => guard.assertPresignedUrlMethodAllowed("GET")).not.toThrow();
    expect(() => guard.assertPresignedUrlMethodAllowed("PUT")).toThrow(SecurityError);
    expect(() => guard.assertPresignedUrlMethodAllowed("PUT")).toThrow("禁止生成带有上传写入权限 (PUT)");
  });

  it("filterTools 在只读模式下物理过滤排除高危工具", () => {
    const guard = new ReadOnlyGuard(true);
    const mockTools = [
      { name: "list_buckets" },
      { name: "create_bucket" },
      { name: "delete_bucket" },
      { name: "read_object_text" },
    ];

    const filtered = guard.filterTools(mockTools);
    expect(filtered.map((t) => t.name)).toEqual(["list_buckets", "read_object_text"]);
  });
});
