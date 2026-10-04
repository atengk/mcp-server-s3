/**
 * 对象检索、探索与内容直读服务单元测试
 *
 * @author Ateng
 * @since 2026-10-04
 */

import {
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it } from "vitest";
import { ContentTruncator } from "../security/content-truncator.js";
import {
  listObjects,
  readObjectRange,
  readObjectText,
  resolveBucket,
  searchObjects,
  statObject,
} from "./object-service.js";

const s3Mock = mockClient(S3Client);

describe("对象检索与内容分块直读服务测试 (object-service)", () => {
  const client = new S3Client({ region: "us-east-1" });
  const truncator = new ContentTruncator({ maxBytes: 1024 });

  beforeEach(() => {
    s3Mock.reset();
  });

  describe("resolveBucket", () => {
    it("优先使用显式传入的 bucket 参数", () => {
      expect(resolveBucket("explicit-bucket", "default-bucket")).toBe("explicit-bucket");
    });

    it("未传参时自动回退降级为 defaultBucket", () => {
      expect(resolveBucket(undefined, "default-bucket")).toBe("default-bucket");
    });

    it("两者均未指定时抛出明确的异常", () => {
      expect(() => resolveBucket(undefined, undefined)).toThrow("必须指定存储桶名称");
    });
  });

  describe("listObjects - 虚拟目录树与分页", () => {
    it("默认使用 '/' 定界符并正确解析 CommonPrefixes 虚拟子目录", async () => {
      s3Mock.on(ListObjectsV2Command).resolves({
        Contents: [{ Key: "docs/readme.txt", Size: 100, LastModified: new Date() }],
        CommonPrefixes: [{ Prefix: "docs/images/" }, { Prefix: "docs/api/" }],
        IsTruncated: false,
      });

      const result = await listObjects(client, { bucket: "test-bucket", prefix: "docs/" });
      expect(result.bucket).toBe("test-bucket");
      expect(result.prefix).toBe("docs/");
      expect(result.delimiter).toBe("/");
      expect(result.objects).toHaveLength(1);
      expect(result.objects[0].key).toBe("docs/readme.txt");
      expect(result.commonPrefixes).toEqual(["docs/images/", "docs/api/"]);
      expect(result.isTruncated).toBe(false);
    });
  });

  describe("searchObjects - 关键字与正则搜索", () => {
    it("根据 query 进行大小写不敏感子串匹配", async () => {
      s3Mock.on(ListObjectsV2Command).resolves({
        Contents: [
          { Key: "reports/financial_2026.pdf", Size: 200 },
          { Key: "reports/annual_summary.docx", Size: 300 },
          { Key: "logs/app.log", Size: 400 },
        ],
        IsTruncated: false,
      });

      const matched = await searchObjects(client, { bucket: "test-bucket", query: "FINANCIAL" });
      expect(matched).toHaveLength(1);
      expect(matched[0].key).toBe("reports/financial_2026.pdf");
    });

    it("支持使用正则表达式进行模式匹配", async () => {
      s3Mock.on(ListObjectsV2Command).resolves({
        Contents: [
          { Key: "logs/2026-01-01.log" },
          { Key: "logs/2026-02-15.log" },
          { Key: "logs/archive.tar.gz" },
        ],
        IsTruncated: false,
      });

      const matched = await searchObjects(client, { bucket: "test-bucket", query: "\\d{4}-\\d{2}-\\d{2}\\.log$" });
      expect(matched).toHaveLength(2);
      expect(matched.map((m) => m.key)).toEqual(["logs/2026-01-01.log", "logs/2026-02-15.log"]);
    });
  });

  describe("statObject - 对象元数据检视", () => {
    it("获取并结构化返回对象的 Head 元数据", async () => {
      const now = new Date();
      s3Mock.on(HeadObjectCommand).resolves({
        ContentLength: 1024,
        ContentType: "application/json",
        LastModified: now,
        ETag: '"etag-123"',
        Metadata: { author: "ateng" },
      });

      const meta = await statObject(client, { bucket: "test-bucket", key: "config.json" });
      expect(meta.bucket).toBe("test-bucket");
      expect(meta.key).toBe("config.json");
      expect(meta.size).toBe(1024);
      expect(meta.contentType).toBe("application/json");
      expect(meta.lastModified).toEqual(now);
      expect(meta.etag).toBe('"etag-123"');
      expect(meta.metadata).toEqual({ author: "ateng" });
    });
  });

  describe("readObjectText - 文本直读与截断防护", () => {
    it("正常流式读取纯文本对象", async () => {
      const text = "Hello MCP S3";
      s3Mock.on(GetObjectCommand).resolves({
        ContentLength: Buffer.byteLength(text),
        ContentType: "text/plain",
        Body: [Buffer.from(text, "utf-8")] as any,
      });

      const result = await readObjectText(
        client,
        { bucket: "test-bucket", key: "hello.txt" },
        truncator
      );
      expect(result.content).toBe(text);
      expect(result.truncated).toBe(false);
      expect(result.totalBytes).toBe(Buffer.byteLength(text));
    });

    it("根据 Content-Type (image/png) 前置拦截二进制文件", async () => {
      s3Mock.on(GetObjectCommand).resolves({
        ContentLength: 50000,
        ContentType: "image/png",
        Body: [] as any,
      });

      const result = await readObjectText(
        client,
        { bucket: "test-bucket", key: "logo.png" },
        truncator
      );
      expect(result.truncated).toBe(true);
      expect(result.content).toBe("");
      expect(result.warning).toContain("二进制文件");
      expect(result.warning).toContain("image/png");
    });
  });

  describe("readObjectRange - 字节范围读取", () => {
    it("发起带有 Range 头的请求并返回文本与 Base64", async () => {
      const rangeSlice = Buffer.from("world");
      s3Mock.on(GetObjectCommand).resolves({
        Body: {
          transformToByteArray: async () => rangeSlice,
        } as any,
      });

      const result = await readObjectRange(client, {
        bucket: "test-bucket",
        key: "large.log",
        start_byte: 6,
        end_byte: 10,
      });

      expect(result.bucket).toBe("test-bucket");
      expect(result.key).toBe("large.log");
      expect(result.startByte).toBe(6);
      expect(result.endByte).toBe(10);
      expect(result.contentLength).toBe(5);
      expect(result.text).toBe("world");
      expect(result.dataBase64).toBe(rangeSlice.toString("base64"));

      const calls = s3Mock.commandCalls(GetObjectCommand);
      expect(calls[0].args[0].input.Range).toBe("bytes=6-10");
    });
  });
});
