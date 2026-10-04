/**
 * 原生 HTTP SSE 服务与健康检查探针中枢 (SSE Server)
 *
 * 暴露 /sse 长轮询流式通道、/message 客户端双向交互端点以及 /health 容器存活就绪探针
 * 内置全量 CORS 跨域响应头与可选 Bearer Token 接入安全鉴权
 *
 * @author Ateng
 * @since 2026-10-04
 */

import http, { type IncomingMessage, type ServerResponse } from "node:http";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";

/**
 * 全局标准 CORS 跨域响应头定义
 */
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

/**
 * MCP 服务端实例工厂类型
 */
export type McpServerFactory = () => McpServer | Promise<McpServer>;

/**
 * SSE 服务运行实例契约
 */
export interface SSEServerInstance {
  /**
   * 底层 Node 原生 HTTP 服务实例
   */
  server: http.Server;
  /**
   * 优雅安全关闭服务器函数
   */
  close: () => Promise<void>;
  /**
   * 实际监听的端口号
   */
  port: number;
}

/**
 * 会话上下文持有契约
 */
interface SessionContext {
  server: McpServer;
  transport: SSEServerTransport;
}

/**
 * 提取客户端请求中的鉴权令牌 (支持 Authorization 请求头优先，URL 查询参数回退)
 *
 * @param req 原生 HTTP 请求对象
 * @param url 已解析的 URL 对象
 * @return 提取出的令牌字符串，若未提供则为 undefined
 */
function extractAuthToken(req: IncomingMessage, url: URL): string | undefined {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }
  return url.searchParams.get("token") || url.searchParams.get("api_key") || undefined;
}

/**
 * 启动原生 HTTP SSE 传输服务并暴露探活端点
 *
 * @param serverOrFactory MCP 服务端单例实例或会话级工厂函数 (支持并发多会话隔离)
 * @param host 监听主机地址 (默认 0.0.0.0)
 * @param port 监听网络端口 (默认 8000)
 * @param apiKey 可选接入鉴权令牌 (配置后强制校验 Bearer Token 或 URL Token)
 * @return 运行中的服务实例与控制接口
 */
export async function startSSEServer(
  serverOrFactory: McpServer | McpServerFactory,
  host = "0.0.0.0",
  port = 8000,
  apiKey?: string
): Promise<SSEServerInstance> {
  const sessions = new Map<string, SessionContext>();

  const server = http.createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const pathname = url.pathname;

    // 0. 全局 OPTIONS 预检请求拦截与 CORS 放行
    if (req.method === "OPTIONS") {
      res.writeHead(204, CORS_HEADERS);
      res.end();
      return;
    }

    // 1. /health 容器就绪与存活无状态探针 (公开免鉴权，供容器管理平台健康检查)
    if (req.method === "GET" && pathname === "/health") {
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-cache",
        ...CORS_HEADERS,
      });
      res.end(
        JSON.stringify({
          status: "ok",
          service: "mcp-server-s3",
          uptime: process.uptime(),
          timestamp: new Date().toISOString(),
          activeConnections: sessions.size,
        })
      );
      return;
    }

    // 安全鉴权前置防御门禁 (若配置了 apiKey，对 /sse 与 /message 强制校验)
    if (apiKey && (pathname === "/sse" || pathname === "/message")) {
      const token = extractAuthToken(req, url);
      if (!token || token !== apiKey) {
        res.writeHead(401, {
          "Content-Type": "application/json; charset=utf-8",
          ...CORS_HEADERS,
        });
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            error: {
              code: -32002,
              message: "Unauthorized: Invalid or missing Bearer token / api_key",
            },
          })
        );
        return;
      }
    }

    // 2. /sse 长轮询事件流建立通道
    if (req.method === "GET" && pathname === "/sse") {
      const sessionServer =
        typeof serverOrFactory === "function"
          ? await serverOrFactory()
          : serverOrFactory;

      // 注入 CORS 头部到 SSE 响应流
      for (const [key, val] of Object.entries(CORS_HEADERS)) {
        res.setHeader(key, val);
      }

      const transport = new SSEServerTransport("/message", res);
      sessions.set(transport.sessionId, { server: sessionServer, transport });

      transport.onclose = async () => {
        const session = sessions.get(transport.sessionId);
        sessions.delete(transport.sessionId);
        if (session) {
          try {
            await session.server.close();
          } catch {
            // 忽略会话关闭过程中的异常
          }
        }
      };

      await sessionServer.connect(transport);
      return;
    }

    // 3. /message 接收客户端发送的 JSON-RPC 消息
    if (req.method === "POST" && pathname === "/message") {
      const sessionId = url.searchParams.get("sessionId");

      // 前置卫语句防御拦截：缺失 sessionId
      if (!sessionId) {
        res.writeHead(400, {
          "Content-Type": "application/json; charset=utf-8",
          ...CORS_HEADERS,
        });
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            error: {
              code: -32600,
              message: "Missing sessionId query parameter",
            },
          })
        );
        return;
      }

      // 前置卫语句防御拦截：会话不存在或已过期
      const session = sessions.get(sessionId);
      if (!session) {
        res.writeHead(404, {
          "Content-Type": "application/json; charset=utf-8",
          ...CORS_HEADERS,
        });
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            error: {
              code: -32001,
              message: `Session not found: ${sessionId}`,
            },
          })
        );
        return;
      }

      // 附加 CORS 响应头
      for (const [key, val] of Object.entries(CORS_HEADERS)) {
        res.setHeader(key, val);
      }

      await session.transport.handlePostMessage(req, res);
      return;
    }

    // 4. 其余未知路由返回 404
    res.writeHead(404, {
      "Content-Type": "application/json; charset=utf-8",
      ...CORS_HEADERS,
    });
    res.end(
      JSON.stringify({
        status: "error",
        message: `Not Found: ${req.method} ${pathname}`,
      })
    );
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(port, host, () => {
      resolve();
    });
    server.once("error", reject);
  });

  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;

  const close = async (): Promise<void> => {
    // 级联关闭所有活跃传输与对应的 MCP 独立服务实例
    for (const session of sessions.values()) {
      try {
        await session.transport.close();
      } catch {
        // 忽略传输关闭异常
      }
      try {
        await session.server.close();
      } catch {
        // 忽略服务端关闭异常
      }
    }
    sessions.clear();

    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  };

  return {
    server,
    close,
    port: actualPort,
  };
}
