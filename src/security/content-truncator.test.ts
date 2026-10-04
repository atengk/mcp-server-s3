/**
 * 文本直读防爆截断器与二进制拦截单元测试
 *
 * @author Ateng
 * @since 2026-10-04
 */

import { describe, expect, it } from "vitest";
import { ContentTruncator } from "./content-truncator.js";

describe("文本直读智能截断器测试 (ContentTruncator)", () => {
  const truncator = new ContentTruncator({ maxBytes: 1024 }); // 设为 1KB 方便测试

  describe("二进制文件智能拦截引导", () => {
    it("检测包含 null 字节的二进制 Buffer 并拦截", () => {
      const binaryBuf = Buffer.from([0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x00, 0x57, 0x6f, 0x72, 0x6c, 0x64]);
      const result = truncator.process(binaryBuf);

      expect(result.isBinary).toBe(true);
      expect(result.isTruncated).toBe(true);
      expect(result.content).toBe("");
      expect(result.warning).toContain("二进制数据");
      expect(result.warning).toContain("download_file");
      expect(result.warning).toContain("get_presigned_url");
    });

    it("常见图像格式头魔数 (PNG/JPEG/GIF) 自动判定为二进制", () => {
      const pngBuf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const result = truncator.process(pngBuf);
      expect(result.isBinary).toBe(true);
    });
  });

  describe("正常文本读取与截断处理", () => {
    it("体积在阈值内的常规文本原样放行且不截断", () => {
      const text = "这是一段标准的纯文本测试内容，包含中英文和数字 12345。";
      const buf = Buffer.from(text, "utf-8");
      const result = truncator.process(buf);

      expect(result.isBinary).toBe(false);
      expect(result.isTruncated).toBe(false);
      expect(result.content).toBe(text);
      expect(result.totalBytes).toBe(buf.length);
      expect(result.readBytes).toBe(buf.length);
      expect(result.warning).toBeUndefined();
    });

    it("体积超出阈值的文本实施安全截断并注入警示通知", () => {
      const longText = "a".repeat(2048);
      const buf = Buffer.from(longText, "utf-8");
      const result = truncator.process(buf);

      expect(result.isBinary).toBe(false);
      expect(result.isTruncated).toBe(true);
      expect(result.totalBytes).toBe(2048);
      expect(result.readBytes).toBe(1024);
      expect(result.content).toContain("[... ⚠️ MCP-S3 内容截断提示");
      expect(result.content).toContain("read_object_range");
      expect(result.warning).toContain("已截断");
    });

    it("UTF-8 多字节中文在切片边界处不会产生乱码 (自动对齐字符边界)", () => {
      // 每个汉字 3 字节，"你好世界" 共 12 字节
      const chineseText = "你好世界";
      const buf = Buffer.from(chineseText, "utf-8");

      // 截断阈值设为 4 字节：刚好跨越第二个字 "好" 的首字节，安全算法应回退到 3 字节 ("你")
      const result = truncator.process(buf, 4);
      expect(result.isTruncated).toBe(true);
      expect(result.readBytes).toBe(3);
      expect(result.content.startsWith("你\n\n")).toBe(true);
      expect(result.content).not.toContain("\uFFFD");
    });

    it("支持通过调用参数动态覆盖单次阈值", () => {
      const text = "x".repeat(500);
      const buf = Buffer.from(text, "utf-8");

      // 覆盖为 200 字节
      const result = truncator.process(buf, 200);
      expect(result.isTruncated).toBe(true);
      expect(result.readBytes).toBe(200);
    });

    it("空 Buffer 安全处理", () => {
      const result = truncator.process(Buffer.alloc(0));
      expect(result.isBinary).toBe(false);
      expect(result.isTruncated).toBe(false);
      expect(result.content).toBe("");
      expect(result.totalBytes).toBe(0);
      expect(result.readBytes).toBe(0);
    });
  });
});
