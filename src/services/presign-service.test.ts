/**
 * S3 预签名直链服务单元测试
 *
 * @author Ateng
 * @since 2026-10-04
 */

import { S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReadOnlyGuard } from "../security/readonly-guard.js";
import { SecurityError } from "../types/security.js";
import { getPresignedUrl } from "./presign-service.js";

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn(),
}));

describe("预签名直链服务测试 (presign-service)", () => {
  const client = new S3Client({ region: "us-east-1" });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("默认生成 GET 预签名直链且默认过期时间为 3600 秒", async () => {
    vi.mocked(getSignedUrl).mockResolvedValue("https://s3.example.com/test-bucket/doc.pdf?signature=xxx");

    const result = await getPresignedUrl(client, {
      bucket: "test-bucket",
      key: "doc.pdf",
    });

    expect(result.url).toBe("https://s3.example.com/test-bucket/doc.pdf?signature=xxx");
    expect(result.bucket).toBe("test-bucket");
    expect(result.key).toBe("doc.pdf");
    expect(result.method).toBe("GET");
    expect(result.expiresIn).toBe(3600);
    expect(getSignedUrl).toHaveBeenCalledTimes(1);
  });

  it("成功生成 PUT 预签名上传直链并指定有效时间", async () => {
    vi.mocked(getSignedUrl).mockResolvedValue("https://s3.example.com/test-bucket/upload.bin?signature=yyy");

    const result = await getPresignedUrl(client, {
      bucket: "test-bucket",
      key: "upload.bin",
      method: "PUT",
      expires_in: 3600,
    });

    expect(result.url).toBe("https://s3.example.com/test-bucket/upload.bin?signature=yyy");
    expect(result.method).toBe("PUT");
    expect(result.expiresIn).toBe(3600);
  });

  it("只读门禁模式下生成 PUT 预签名外链会被拦截并抛出 SecurityError", async () => {
    const readOnlyGuard = new ReadOnlyGuard(true);

    await expect(
      getPresignedUrl(
        client,
        {
          bucket: "test-bucket",
          key: "upload.bin",
          method: "PUT",
        },
        readOnlyGuard
      )
    ).rejects.toThrow(SecurityError);
  });

  it("只读门禁模式下允许生成 GET 预签名下载外链", async () => {
    const readOnlyGuard = new ReadOnlyGuard(true);
    vi.mocked(getSignedUrl).mockResolvedValue("https://s3.example.com/test-bucket/read.txt?signature=zzz");

    const result = await getPresignedUrl(
      client,
      {
        bucket: "test-bucket",
        key: "read.txt",
        method: "GET",
      },
      readOnlyGuard
    );

    expect(result.method).toBe("GET");
    expect(result.url).toContain("signature=zzz");
  });

  it("使用默认绑定的存储桶", async () => {
    vi.mocked(getSignedUrl).mockResolvedValue("https://s3.example.com/default-bucket/read.txt?signature=zzz");

    const result = await getPresignedUrl(
      client,
      {
        key: "read.txt",
      },
      undefined,
      "default-bucket"
    );

    expect(result.bucket).toBe("default-bucket");
  });
});
