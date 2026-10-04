/**
 * 原生 HTTP SSE 服务与健康检查探针单元测试
 *
 * @author Ateng
 * @since 2026-10-04
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startSSEServer, type SSEServerInstance } from "./sse-server.js";

describe("HTTP SSE 传输服务与健康检查探针测试 (sse-server)", () => {
  let serverInstance: SSEServerInstance | undefined;
  let baseUrl: string;

  beforeEach(async () => {
    // 监听随机空闲端口 (port: 0)，使用工厂函数模拟多会话解耦
    serverInstance = await startSSEServer(
      () =>
        new McpServer({
          name: "test-mcp-s3",
          version: "1.0.0",
        }),
      "127.0.0.1",
      0
    );
    baseUrl = `http://127.0.0.1:${serverInstance.port}`;
  });

  afterEach(async () => {
    if (serverInstance) {
      await serverInstance.close();
      serverInstance = undefined;
    }
  });

  it("GET /health 能够正确返回 200 状态与健康探针元数据", async () => {
    const response = await fetch(`${baseUrl}/health`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");

    const data = (await response.json()) as {
      status: string;
      uptime: number;
      service: string;
      activeConnections: number;
    };
    expect(data.status).toBe("ok");
    expect(data.service).toBe("mcp-server-s3");
    expect(typeof data.uptime).toBe("number");
    expect(data.activeConnections).toBe(0);
  });

  it("访问未知路径应返回 404 状态码", async () => {
    const response = await fetch(`${baseUrl}/unknown-route`);
    expect(response.status).toBe(404);
  });

  it("POST /message 缺失 sessionId 参数时应返回 400 校验拦截", async () => {
    const response = await fetch(`${baseUrl}/message`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ jsonrpc: "2.0", method: "ping", id: 1 }),
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { message: string } };
    expect(body.error.message).toContain("Missing sessionId");
  });

  it("POST /message 在会话不存在或已过期时应返回 404", async () => {
    const response = await fetch(`${baseUrl}/message?sessionId=invalid-session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ jsonrpc: "2.0", method: "ping", id: 1 }),
    });

    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: { message: string } };
    expect(body.error.message).toContain("Session not found");
  });

  it("GET /sse 能成功建立长连接并支持多客户端并发隔离接入", async () => {
    const c1 = new AbortController();
    const c2 = new AbortController();
    const t1 = setTimeout(() => c1.abort(), 1200);
    const t2 = setTimeout(() => c2.abort(), 1200);

    try {
      const [res1, res2] = await Promise.all([
        fetch(`${baseUrl}/sse`, { signal: c1.signal }),
        fetch(`${baseUrl}/sse`, { signal: c2.signal }),
      ]);

      expect(res1.status).toBe(200);
      expect(res1.headers.get("content-type")).toContain("text/event-stream");
      expect(res2.status).toBe(200);
      expect(res2.headers.get("content-type")).toContain("text/event-stream");

      // 验证探针连接数统计
      const healthRes = await fetch(`${baseUrl}/health`);
      const healthData = (await healthRes.json()) as { activeConnections: number };
      expect(healthData.activeConnections).toBe(2);
    } catch (err: unknown) {
      if ((err as Error).name !== "AbortError") {
        throw err;
      }
    } finally {
      clearTimeout(t1);
      clearTimeout(t2);
    }
  });
});
