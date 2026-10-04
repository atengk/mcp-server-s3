# 0001. 统一 MCP_S3 规范环境变量中枢与 TypeScript 运行时

## 背景与决策 (Context & Decision)

在多 MCP 服务端并存与跨云对象存储（MinIO / AWS S3 / 阿里云 OSS / Cloudflare R2 / 腾讯云 COS）交互的场景下，宿主机通常存在全局 `AWS_*` 环境变量或 `~/.aws/credentials` 文件，极易对不同 MCP 实例造成凭证混淆与污染。同时，MCP 官方生态对于 TypeScript SDK 的维护支持最为活跃，`npx` 是各大 AI 客户端免安装运行的事实标准。

我们决定采纳以下核心架构决策：
1. **建立 12-Factor App 规范环境变量中枢**：以 `MCP_S3_*` 为主命名空间（如 `MCP_S3_ENDPOINT`、`MCP_S3_REGION`、`MCP_S3_ACCESS_KEY_ID`、`MCP_S3_SECRET_ACCESS_KEY`、`MCP_S3_FORCE_PATH_STYLE` 等），并向下 100% 透明兼容标准 `AWS_*` 环境变量；
2. **宽容类型解析与防御**：支持对布尔值（`1`, `true`, `yes`, `on`）与端口数值进行宽容解析与安全容错；
3. **技术栈与运行时选择**：基于 Node.js 20+ 与 TypeScript 5.7+ 构建，依托官方 `@modelcontextprotocol/sdk` 与模块化 `@aws-sdk/client-s3` 提供最高水准的稳定性。

## 权衡考量 (Considered Options)

- **环境变量前缀设计**：
  - 纯非标前缀（如 `S3_ACCESS_KEY_ID`）：破坏了行业惯例，且无法继承标准 AWS SDK 的凭据链生态；
  - 纯原生 `AWS_*` 变量：当宿主机存在多个不同云厂商的 S3 MCP 实例时，极易发生全局变量相互覆盖冲突；
  - `MCP_S3_*` 主命名空间 + `AWS_*` 自动降级兼容（已采纳）：既保证了各 MCP 实例在客户端 JSON 中的配置隔离性，又保留了云原生环境继承既有凭证的能力。
- **开发语言选型**：
  - Python (FastMCP)：语法简洁，但分发依赖 `uvx`，在部分未安装 Python 的前端/纯桌面环境中门槛较高；
  - TypeScript / Node.js（已采纳）：MCP 官方 SDK 原生首选，分发通过 `npx` 零依赖即开即用，对二进制流与异步高并发支持更优。

## 后果与影响 (Consequences)

- 优势：
  - 实现了完全隔离的多实例多云对象存储配置能力；
  - 客户端配置极其清晰自解释，降低了用户的配置认知负担；
  - 借助 `npx` 实现了毫秒级免安装拉取运行。
- 代价：
  - 需要在配置解析层维护 `MCP_S3_*` 优先与 `AWS_*` 降级的双层键值映射逻辑。
