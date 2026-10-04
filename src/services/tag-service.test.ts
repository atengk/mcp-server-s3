/**
 * S3 对象业务标签治理服务单元测试
 *
 * @author Ateng
 * @since 2026-10-04
 */

import {
  GetObjectTaggingCommand,
  PutObjectTaggingCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it } from "vitest";
import { getObjectTags, setObjectTags } from "./tag-service.js";

const s3Mock = mockClient(S3Client);

describe("对象标签治理服务测试 (tag-service)", () => {
  const client = new S3Client({ region: "us-east-1" });

  beforeEach(() => {
    s3Mock.reset();
  });

  describe("getObjectTags - 查询标签", () => {
    it("成功返回对象对应的 Key-Value 标签映射", async () => {
      s3Mock.on(GetObjectTaggingCommand).resolves({
        TagSet: [
          { Key: "env", Value: "production" },
          { Key: "project", Value: "mcp-server-s3" },
        ],
      });

      const tags = await getObjectTags(client, {
        bucket: "test-bucket",
        key: "config.json",
      });

      expect(tags).toEqual({
        env: "production",
        project: "mcp-server-s3",
      });
    });

    it("当 TagSet 为空或未设置时，安全返回空对象而不是 null", async () => {
      s3Mock.on(GetObjectTaggingCommand).resolves({
        TagSet: [],
      });

      const tags = await getObjectTags(client, {
        bucket: "test-bucket",
        key: "untagged.txt",
      });

      expect(tags).toEqual({});
    });
  });

  describe("setObjectTags - 设置业务标签", () => {
    it("成功设置多个业务标签并返回结果", async () => {
      s3Mock.on(PutObjectTaggingCommand).resolves({});

      const result = await setObjectTags(client, {
        bucket: "test-bucket",
        key: "data.csv",
        tags: {
          tier: "hot",
          owner: "analytics",
        },
      });

      expect(result.success).toBe(true);
      expect(result.bucket).toBe("test-bucket");
      expect(result.key).toBe("data.csv");
      expect(result.tags).toEqual({ tier: "hot", owner: "analytics" });
      expect(result.message).toContain("2 个业务标签");
    });
  });
});
