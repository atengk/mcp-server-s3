/**
 * 双向流式文件互传服务单元测试
 *
 * @author Ateng
 * @since 2026-10-04
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { mockClient } from "aws-sdk-client-mock";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SandboxGuard } from "../security/sandbox-guard.js";
import { BusinessError, SecurityError } from "../types/security.js";
import {
  downloadFile,
  putObjectText,
  uploadFile,
} from "./transfer-service.js";

const s3Mock = mockClient(S3Client);

describe("双向流式互传服务测试 (transfer-service)", () => {
  const client = new S3Client({ region: "us-east-1" });
  let tempDir: string;
  let sandboxGuard: SandboxGuard;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-s3-transfer-test-"));
    sandboxGuard = new SandboxGuard(tempDir);
  });

  afterAll(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // 忽略清理临时目录异常
    }
  });

  beforeEach(() => {
    s3Mock.reset();
  });

  describe("putObjectText - 文本直接写入", () => {
    it("成功写入文本并返回 ETag", async () => {
      s3Mock.on(PutObjectCommand).resolves({
        ETag: '"etag-put-123"',
      });

      const result = await putObjectText(client, {
        bucket: "test-bucket",
        key: "notes.txt",
        content: "Hello S3 text content",
        content_type: "text/plain",
      });

      expect(result.success).toBe(true);
      expect(result.bucket).toBe("test-bucket");
      expect(result.key).toBe("notes.txt");
      expect(result.etag).toBe('"etag-put-123"');
      expect(result.message).toContain("写入成功");
    });
  });

  describe("uploadFile - 本地文件流式上传 (带沙箱保护)", () => {
    it("沙箱内的文件成功流式上传", async () => {
      const localFilePath = path.join(tempDir, "sample.txt");
      fs.writeFileSync(localFilePath, "Sample file content for upload");

      s3Mock.on(PutObjectCommand).resolves({
        ETag: '"etag-upload-sample"',
      });

      const result = await uploadFile(
        client,
        {
          bucket: "test-bucket",
          key: "remote-sample.txt",
          local_path: localFilePath,
        },
        sandboxGuard
      );

      expect(result.success).toBe(true);
      expect(result.bucket).toBe("test-bucket");
      expect(result.key).toBe("remote-sample.txt");
      expect(result.size).toBeGreaterThan(0);
      expect(result.message).toContain("上传成功");
    });

    it("沙箱外的路径直接被 SandboxGuard 拦截并抛出 SecurityError", async () => {
      await expect(
        uploadFile(
          client,
          {
            bucket: "test-bucket",
            key: "escaped.txt",
            local_path: "../../escape.txt",
          },
          sandboxGuard
        )
      ).rejects.toThrow(SecurityError);
    });
  });

  describe("downloadFile - S3 对象流式保存到本地 (带沙箱保护)", () => {
    it("成功将对象保存到沙箱内部目标路径", async () => {
      const destPath = path.join(tempDir, "downloads", "downloaded.txt");
      const fileData = "Downloaded stream content";

      s3Mock.on(GetObjectCommand).resolves({
        Body: {
          transformToByteArray: async () => Buffer.from(fileData, "utf-8"),
        } as any,
        ContentLength: Buffer.byteLength(fileData),
      });

      const result = await downloadFile(
        client,
        {
          bucket: "test-bucket",
          key: "remote-doc.txt",
          local_path: destPath,
        },
        sandboxGuard
      );

      expect(result.success).toBe(true);
      expect(result.size).toBe(Buffer.byteLength(fileData));
      expect(fs.existsSync(destPath)).toBe(true);
      expect(fs.readFileSync(destPath, "utf-8")).toBe(fileData);
    });

    it("本地文件不存在时抛出 BusinessError", async () => {
      const nonExistentPath = path.join(tempDir, "missing.txt");
      await expect(
        uploadFile(
          client,
          {
            bucket: "test-bucket",
            key: "missing.txt",
            local_path: nonExistentPath,
          },
          sandboxGuard
        )
      ).rejects.toThrow(BusinessError);
    });

    it("下载路径若逃逸出沙箱直接被拦截", async () => {
      await expect(
        downloadFile(
          client,
          {
            bucket: "test-bucket",
            key: "remote.txt",
            local_path: "../escape.txt",
          },
          sandboxGuard
        )
      ).rejects.toThrow(SecurityError);
    });

    it("下载对象 Body 为空时抛出 BusinessError", async () => {
      const destPath = path.join(tempDir, "empty.txt");
      s3Mock.on(GetObjectCommand).resolves({
        Body: undefined,
      });

      await expect(
        downloadFile(
          client,
          {
            bucket: "test-bucket",
            key: "empty.txt",
            local_path: destPath,
          },
          sandboxGuard
        )
      ).rejects.toThrow(BusinessError);
    });
  });
});
