# 0003. Stdio 与 HTTP SSE 双模通信引擎及 tsup 极速单文件打包

## 背景与决策 (Context & Decision)

不同宿主环境对 MCP 服务的网络与部署要求存在显著分歧：
- **桌面端 IDE（Claude Desktop / Cursor / Antigravity）**：倾向于使用零网络端口、通过标准输入输出交互的 `stdio` 管道，免去网络监听与端口占用；
- **云原生 / 多 Agent 共享集群（Dify / Coze / WebUI）**：倾向于将对象存储 MCP 服务常驻在微服务容器内，通过网络长轮询（SSE）对外提供统一服务，避免每个客户端各自持有敏感密钥。

我们决定采纳以下核心通信与分发决策：
1. **双模通信传输引擎 (Stdio + SSE)**：默认使用 `stdio` 传输模式；支持通过 `MCP_S3_TRANSPORT=sse` 启动轻量原生 HTTP 服务，暴露 `/sse`（长轮询事件流）、`/message`（JSON-RPC 交互）及 `/health`（服务就绪探针）端点；
2. **`tsup` 生产单文件极速构建**：使用 esbuild / tsup 将 TypeScript 源码打包为自包含的单文件 `dist/index.js`，注入 `#!/usr/bin/env node` 执行头并生成类型定义 `dist/index.d.ts`。

## 权衡考量 (Considered Options)

- **通信协议选型**：
  - 仅支持 `stdio`：无法满足云原生容器化常驻与内网多智能体共享调用的需求；
  - 仅支持 `sse`：在本地桌面端使用时需占用本地端口并配置网络转发，门槛较高；
  - `stdio`（默认）+ `sse`（可选）双模（已采纳）：一套代码无缝两栖适配本地桌面与云端容器。
- **构建工具选型**：
  - 传统 `tsc` 多文件编译：生成零散目录结构，运行时严重依赖外部 `node_modules` 解析；
  - `tsup` 单文件打包（已采纳）：产物高度轻量、启动时间缩短至毫秒级，极其适合通过 `npx` 即时拉取。

## 后果与影响 (Consequences)

- 优势：
  - 本地用户 `npx -y @atengk/mcp-server-s3` 秒级启动，零端口冲突；
  - 企业用户可轻松将服务打包为 Docker 容器并入 K8s/Docker Compose 集群；
  - `/health` 探针提供了对容器探活的工业级支持。
- 代价：
  - 需在服务入口处维护基于传输模式的条件装配分支逻辑。
