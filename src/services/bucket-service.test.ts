/**
 * 存储桶生命周期服务单元测试
 *
 * @author Ateng
 * @since 2026-10-04
 */

import {
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectsCommand,
  GetBucketLocationCommand,
  ListBucketsCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it } from "vitest";
import {
  createBucket,
  deleteBucket,
  getBucketLocation,
  listBuckets,
} from "./bucket-service.js";

const s3Mock = mockClient(S3Client);

describe("存储桶生命周期服务测试 (bucket-service)", () => {
  const client = new S3Client({ region: "us-east-1" });

  beforeEach(() => {
    s3Mock.reset();
  });

  describe("listBuckets", () => {
    it("正常返回存储桶列表", async () => {
      const now = new Date();
      s3Mock.on(ListBucketsCommand).resolves({
        Buckets: [
          { Name: "bucket-a", CreationDate: now },
          { Name: "bucket-b", CreationDate: now },
        ],
      });

      const buckets = await listBuckets(client);
      expect(buckets).toHaveLength(2);
      expect(buckets[0].name).toBe("bucket-a");
      expect(buckets[1].name).toBe("bucket-b");
    });

    it("空存储桶列表时返回空数组而不是 null", async () => {
      s3Mock.on(ListBucketsCommand).resolves({ Buckets: undefined });
      const buckets = await listBuckets(client);
      expect(buckets).toEqual([]);
    });
  });

  describe("createBucket", () => {
    it("成功创建存储桶", async () => {
      s3Mock.on(CreateBucketCommand).resolves({});

      const result = await createBucket(client, "my-new-bucket", "ap-southeast-1");
      expect(result.success).toBe(true);
      expect(result.bucket).toBe("my-new-bucket");
      expect(result.message).toContain("创建成功");
    });

    it("在 us-east-1 区域创建存储桶时不传递 LocationConstraint", async () => {
      s3Mock.on(CreateBucketCommand).resolves({});

      await createBucket(client, "my-us-bucket", "us-east-1");
      const calls = s3Mock.commandCalls(CreateBucketCommand);
      expect(calls[0].args[0].input.CreateBucketConfiguration).toBeUndefined();
    });
  });

  describe("deleteBucket", () => {
    it("直接删除空存储桶", async () => {
      s3Mock.on(DeleteBucketCommand).resolves({});

      const result = await deleteBucket(client, "empty-bucket", false);
      expect(result.success).toBe(true);
      expect(result.bucket).toBe("empty-bucket");
      expect(result.message).toContain("删除成功");
    });

    it("force=true 时先清空对象再删除存储桶", async () => {
      s3Mock.on(ListObjectsV2Command).resolvesOnce({
        Contents: [{ Key: "file1.txt" }, { Key: "file2.txt" }],
        IsTruncated: false,
      });
      s3Mock.on(DeleteObjectsCommand).resolves({});
      s3Mock.on(DeleteBucketCommand).resolves({});

      const result = await deleteBucket(client, "non-empty-bucket", true);
      expect(result.success).toBe(true);
      expect(s3Mock.commandCalls(DeleteObjectsCommand)).toHaveLength(1);
      expect(s3Mock.commandCalls(DeleteBucketCommand)).toHaveLength(1);
    });
  });

  describe("getBucketLocation", () => {
    it("获取并返回存储桶物理部署地域", async () => {
      s3Mock.on(GetBucketLocationCommand).resolves({
        LocationConstraint: "ap-northeast-1",
      });

      const result = await getBucketLocation(client, "my-bucket");
      expect(result.bucket).toBe("my-bucket");
      expect(result.region).toBe("ap-northeast-1");
    });

    it("当 LocationConstraint 为空时缺省返回 us-east-1 (AWS 标准行为)", async () => {
      s3Mock.on(GetBucketLocationCommand).resolves({
        LocationConstraint: undefined,
      });

      const result = await getBucketLocation(client, "default-region-bucket");
      expect(result.region).toBe("us-east-1");
    });
  });
});
