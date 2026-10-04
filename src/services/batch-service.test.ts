/**
 * S3 对象批处理与移动删除服务单元测试
 *
 * @author Ateng
 * @since 2026-10-04
 */

import {
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it } from "vitest";
import { BusinessError, SecurityError } from "../types/security.js";
import {
  copyObject,
  deleteObject,
  deleteObjectsBatch,
  deleteObjectsByPrefix,
  moveObject,
} from "./batch-service.js";

const s3Mock = mockClient(S3Client);

describe("对象批处理与移动删除服务测试 (batch-service)", () => {
  const client = new S3Client({ region: "us-east-1" });

  beforeEach(() => {
    s3Mock.reset();
  });

  describe("copyObject - 对象复制", () => {
    it("成功跨桶复制且保持正斜杠未被编码为 %2F", async () => {
      s3Mock.on(CopyObjectCommand).resolves({});

      const result = await copyObject(client, {
        source_bucket: "src-bucket",
        source_key: "folder/sub/data file.txt",
        target_bucket: "dst-bucket",
        target_key: "archived/data file.txt",
      });

      expect(result.success).toBe(true);
      expect(result.sourceBucket).toBe("src-bucket");
      expect(result.targetBucket).toBe("dst-bucket");

      const calls = s3Mock.commandCalls(CopyObjectCommand);
      expect(calls).toHaveLength(1);
      const callInput = calls[0].args[0].input;
      expect(callInput.Bucket).toBe("dst-bucket");
      expect(callInput.Key).toBe("archived/data file.txt");
      // 正斜杠应当保留为 /，空格应编码为 %20
      expect(callInput.CopySource).toBe("src-bucket/folder/sub/data%20file.txt");
    });

    it("同桶复制省略 target_bucket 时自动回退继承 source_bucket", async () => {
      s3Mock.on(CopyObjectCommand).resolves({});

      const result = await copyObject(client, {
        source_bucket: "same-bucket",
        source_key: "a.txt",
        target_key: "b.txt",
      });

      expect(result.success).toBe(true);
      expect(result.sourceBucket).toBe("same-bucket");
      expect(result.targetBucket).toBe("same-bucket");
    });
  });

  describe("moveObject - 对象移动与重命名 (含防自毁保护)", () => {
    it("同桶同键移动时主动拦截并抛出 BusinessError，防止自毁丢失数据", async () => {
      await expect(
        moveObject(client, {
          source_bucket: "bucket-a",
          source_key: "same-key.txt",
          target_bucket: "bucket-a",
          target_key: "same-key.txt",
        })
      ).rejects.toThrow(BusinessError);
    });

    it("同桶移动省略 target_bucket 时自动回退并拦截同名自毁", async () => {
      await expect(
        moveObject(client, {
          source_bucket: "bucket-a",
          source_key: "same-key.txt",
          target_key: "same-key.txt",
        })
      ).rejects.toThrow(BusinessError);
    });

    it("正常移动时先复制到目标路径再安全删除源对象", async () => {
      s3Mock.on(CopyObjectCommand).resolves({});
      s3Mock.on(DeleteObjectCommand).resolves({});

      const result = await moveObject(client, {
        source_bucket: "bucket-a",
        source_key: "old.txt",
        target_bucket: "bucket-b",
        target_key: "new.txt",
      });

      expect(result.success).toBe(true);
      expect(s3Mock.commandCalls(CopyObjectCommand)).toHaveLength(1);
      expect(s3Mock.commandCalls(DeleteObjectCommand)).toHaveLength(1);
      expect(s3Mock.commandCalls(DeleteObjectCommand)[0].args[0].input).toEqual({
        Bucket: "bucket-a",
        Key: "old.txt",
      });
    });
  });

  describe("deleteObject - 单对象删除", () => {
    it("成功删除指定的单个对象", async () => {
      s3Mock.on(DeleteObjectCommand).resolves({});

      const result = await deleteObject(client, {
        bucket: "test-bucket",
        key: "obsolete.log",
      });

      expect(result.success).toBe(true);
      expect(result.bucket).toBe("test-bucket");
      expect(result.key).toBe("obsolete.log");
    });
  });

  describe("deleteObjectsBatch - 批量删除多个对象", () => {
    it("成功删除指定的一批对象", async () => {
      s3Mock.on(DeleteObjectsCommand).resolves({
        Deleted: [{ Key: "a.txt" }, { Key: "b.txt" }],
      });

      const result = await deleteObjectsBatch(client, {
        bucket: "test-bucket",
        keys: ["a.txt", "b.txt"],
      });

      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(2);
    });

    it("当列表为空时抛出 SecurityError", async () => {
      await expect(
        deleteObjectsBatch(client, {
          bucket: "test-bucket",
          keys: [],
        })
      ).rejects.toThrow(SecurityError);
    });

    it("当列表超出 1000 时由防灾守卫抛出 SecurityError", async () => {
      const keys = Array.from({ length: 1001 }, (_, i) => `key-${i}.txt`);
      await expect(
        deleteObjectsBatch(client, {
          bucket: "test-bucket",
          keys,
        })
      ).rejects.toThrow(SecurityError);
    });
  });

  describe("deleteObjectsByPrefix - 递归清理虚拟目录树 (单批 1000 截断防灾)", () => {
    it("未传递 confirm_recursive_delete=true 时抛出 SecurityError", async () => {
      await expect(
        deleteObjectsByPrefix(client, {
          bucket: "test-bucket",
          prefix: "logs/",
          confirm_recursive_delete: false,
        })
      ).rejects.toThrow(SecurityError);
    });

    it("空字符串或纯斜杠根路径抛出 SecurityError", async () => {
      await expect(
        deleteObjectsByPrefix(client, {
          bucket: "test-bucket",
          prefix: "   ",
          confirm_recursive_delete: true,
        })
      ).rejects.toThrow(SecurityError);

      await expect(
        deleteObjectsByPrefix(client, {
          bucket: "test-bucket",
          prefix: "///",
          confirm_recursive_delete: true,
        })
      ).rejects.toThrow(SecurityError);
    });

    it("正常清理前缀并安全截断", async () => {
      s3Mock.on(ListObjectsV2Command).resolves({
        Contents: [{ Key: "logs/2026/01.log" }, { Key: "logs/2026/02.log" }],
        IsTruncated: true,
      });
      s3Mock.on(DeleteObjectsCommand).resolves({});

      const result = await deleteObjectsByPrefix(client, {
        bucket: "test-bucket",
        prefix: "logs/2026/",
        confirm_recursive_delete: true,
      });

      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(2);
      expect(result.isTruncated).toBe(true);
      expect(result.message).toContain("截断");
    });

    it("当删除返回局部失败时抛出 BusinessError", async () => {
      s3Mock.on(ListObjectsV2Command).resolves({
        Contents: [{ Key: "logs/fail.log" }],
      });
      s3Mock.on(DeleteObjectsCommand).resolves({
        Errors: [{ Key: "logs/fail.log", Message: "Access Denied" }],
      });

      await expect(
        deleteObjectsByPrefix(client, {
          bucket: "test-bucket",
          prefix: "logs/",
          confirm_recursive_delete: true,
        })
      ).rejects.toThrow(BusinessError);
    });
  });
});
