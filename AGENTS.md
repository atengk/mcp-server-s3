# Agent 行为准则与项目工程规范 (mcp-server-s3)

本项目为通过标准 S3 协议深度连接并管理兼容对象存储（MinIO、AWS S3、阿里云 OSS、Cloudflare R2、腾讯云 COS 等）的 Model Context Protocol (MCP) 服务。所有在此仓库工作的 Agent 必须严格遵守以下工程规范与架构准则。

## 1. 核心架构与设计准则 (Architecture & Principles)

- **多云 S3 兼容协议统一驱动**：基于标准 S3 API 构建，无缝抹平私有化 MinIO 与各公有云（AWS / OSS / R2 / COS）差异，支持 Path-style 路径寻址与 Virtual-hosted 寻址自适应切换。决策背景见 [ADR-0001](docs/adr/0001-mcp-s3-configuration-and-runtime.md)。
- **双模通信传输引擎**：
  - 默认采用本地轻量 Stdio 管道传输，零网络端口占用，专为桌面端 IDE（Claude Desktop / Cursor）打造；
  - 支持通过 `MCP_S3_TRANSPORT=sse` 启动轻量 HTTP 远程长轮询服务，暴露 `/sse`、`/message` 与容器探活 `/health` 端点。决策背景见 [ADR-0003](docs/adr/0003-transport-and-bundling.md)。
- **三位一体安全防灾铁律**：
  - **前置只读门禁 (`Read-Only Guard`)**：`MCP_S3_READ_ONLY=true` 时在协议握手层物理隐藏所有写/删类工具；
  - **工作区沙箱隔离 (`Sandbox Guard`)**：基于 `MCP_S3_ALLOWED_LOCAL_DIR` 严格校验本地路径，强力阻断路径遍历逃逸（`../`）与宿主机敏感文件泄露；
  - **前缀删除三重防灾 (`Prefix Deletion Guard`)**：递归前缀清理强制禁止根路径、强制显式布尔确认参数、单批次严格上限 1000 个对象；
  - **文本直读智能截断 (`Content Truncator`)**：单次文本直读严格限制 256KB 阈值，超量注入截断警示，二进制文件智能拦截引导。决策背景见 [ADR-0002](docs/adr/0002-tiered-toolsets-and-safety-guards.md)。
- **毫秒级自省探针 (`s3_ping`)**：向底层发送极轻量请求，快速诊断端点连通性、当前生效 Region、脱敏 AK 及网络往返 RTT 时延。决策背景见 [ADR-0005](docs/adr/0005-connectivity-probe-and-containerization.md)。
- **极简自动化发布体系**：集成 GitHub Actions，利用 GitHub OIDC 原生签发 `--provenance` 软件供应链溯源防伪凭证，由 `CHANGELOG.md` 权威驱动发布 GitHub Releases。决策背景见 [ADR-0004](docs/adr/0004-distribution-and-registry-strategy.md)。

## 2. 统一领域术语约束 (Ubiquitous Language)

严格遵守 [CONTEXT.md](CONTEXT.md) 锁定的通用领域语言，代码标识符、日志与接口命名严禁使用禁用同义词：
- **`Bucket` (存储桶)**：存储对象的顶级容器与命名空间（严禁混称为 Folder, Directory, Database）；
- **`Object` (对象)**：存储在 Bucket 中的基本数据单元（严禁混称为 File, Blob, Document）；
- **`Key` (对象键)**：Object 在 Bucket 中的唯一绝对标识符路径（不以 `/` 开头，严禁混称为 File Path, URL）；
- **`Prefix` (前缀)** 与 **`Delimiter` (定界符)**：用于筛选与折叠虚拟子目录层级（严禁混称为 Subdirectory, Separator）；
- **`Presigned URL` (预签名链接)**：具有预设生命周期的直接 HTTP(S) 访问直链（严禁混称为 Temporary Link, Share Link）；
- **`Range Read` (字节范围读取)**：指定字节区间局部读取操作；
- **`Sandbox Path` (沙箱安全路径)**：本地受管安全目录边界。

## 3. 技术栈与模块架构 (Tech Stack & Modules)

- **基础依赖栈**：Node.js (>= 20) + TypeScript 5.7+ + `@modelcontextprotocol/sdk` + `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` + `zod`。
- **打包与分发**：使用 `tsup` 单文件独立打包 Bundle，配置 CLI `bin` 入口 `mcp-server-s3`，发布包名为 `@atengk/mcp-server-s3`。
- **模块解耦职责划分**：
  - `src/index.ts`：装配入口（Coordinator），启动调度、工具注册、Stdio/SSE 双模分流；
  - `src/config/`：12-Factor App 规范环境变量中枢（`MCP_S3_*` 优先，向下透明兼容 `AWS_*`）；
  - `src/connection/`：`s3-client-factory.ts` S3 客户端单例工厂与凭据探测；
  - `src/security/`：前置只读门禁、工作区沙箱守卫、前缀递归删除三重熔断、文本防爆截断器；
  - `src/services/`：核心领域服务分治（自省探针、存储桶、对象检索、流式互传、预签名直链、标签治理）；
  - `src/server/`：HTTP SSE 服务与 `/health` 探针实现；
  - `src/types/`：统一的数据模型契约与 Zod 校验 Schema。

## 4. Agent 技能与协作规范 (Agent skills)

### 问题跟踪器 (Issue tracker)
本项目所有需求、缺陷与任务卡片均基于 GitHub Issues 进行全流程跟踪与管理。详见 [docs/agents/issue-tracker.md](docs/agents/issue-tracker.md)。

### 分流标签 (Triage labels)
采用标准五位分流标签规范（`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`）。详见 [docs/agents/triage-labels.md](docs/agents/triage-labels.md)。

### 领域架构文档 (Domain docs)
采用单上下文规范（Single-context 架构：根目录 [CONTEXT.md](CONTEXT.md) 与 [docs/adr/](docs/adr/) 架构决策记录）。详见 [docs/agents/domain.md](docs/agents/domain.md)。
