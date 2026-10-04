# @atengk/mcp-server-s3

[![NPM Version](https://img.shields.io/npm/v/@atengk/mcp-server-s3.svg?style=flat-square)](https://www.npmjs.com/package/@atengk/mcp-server-s3)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](./LICENSE)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg?style=flat-square)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg?style=flat-square)](https://www.typescriptlang.org/)
[![Model Context Protocol](https://img.shields.io/badge/MCP-1.x-orange.svg?style=flat-square)](https://modelcontextprotocol.io/)

基于标准 **S3 协议** 深度连接与管控兼容对象存储（**RustFS、MinIO、AWS S3、阿里云 OSS、Cloudflare R2、腾讯云 COS** 等）的生产级 **Model Context Protocol (MCP)** 服务。为大语言模型（LLM）与 AI 智能体（Claude Desktop、Cursor、Antigravity、Cline、Dify、Coze 等）提供安全、可控、高内聚的对象存储全生命周期管理与数据流动基础设施。

---

## 🌟 核心特性 (Features)

- **🌐 多云协议统一驱动**：严格基于工业级标准 S3 API 构建，无缝抹平私有化 RustFS、MinIO 与各大公有云差异，支持 Path-style 路径寻址与 Virtual-hosted 虚拟主机寻址自动切换（[ADR-0001](docs/adr/0001-mcp-s3-configuration-and-runtime.md)）。
- **⚡ 双模通信与安全接入**：
  - **Stdio 本地默认**：桌面端 IDE（Claude Desktop / Cursor）开箱即用，标准输入输出管道交互，零网络端口占用；
  - **HTTP SSE 远程长轮询**：常驻容器化部署，暴露 `/sse`、`/message` 与 `/health` 探针，支持全量 CORS 跨域与可选 Bearer Token 访问控制（[ADR-0003](docs/adr/0003-transport-and-bundling.md), [ADR-0006](docs/adr/0006-sse-security-multipart-upload-and-content-probing.md)）。
- **🛡️ 三位一体安全防灾铁律**（[ADR-0002](docs/adr/0002-tiered-toolsets-and-safety-guards.md)）：
  - **前置只读门禁 (`Read-Only Guard`)**：开启 `MCP_S3_READ_ONLY=true` 时，在 MCP 握手层物理隐藏所有破坏性写/删类工具；
  - **工作区沙箱隔离 (`Sandbox Guard`)**：基于 `MCP_S3_ALLOWED_LOCAL_DIR` 严格限定本地文件读写边界，彻底阻断路径遍历（`../`）逃逸与宿主机敏感凭证泄露；
  - **前缀递归删除三重熔断 (`Prefix Deletion Guard`)**：强制拦截根前缀、强制要求显式布尔确认参数、单批次严格限制 1000 上限，防止误删整个存储桶；
  - **文本直读智能截断 (`Content Truncator`)**：限制 256KB 文本直读上限，自动截断超量日志并注入警示，彻底杜绝上下文风暴。
- **🚀 大对象分段上传与纯文本深度探测**（[ADR-0006](docs/adr/0006-sse-security-multipart-upload-and-content-probing.md)）：
  - **自适应 Multipart Upload**：大文件（>32MB）自动启用 8MB 分片并发分段上传，彻底突破 5GB 单流上限并增强网络波动抗重试韧性；
  - **仿 Git Null Byte 探测**：对未显式打标 MIME 的对象检测前 512 字节空字节，宽容放行纯文本与日志，杜绝 `application/octet-stream` 误伤阻断。
- **🛠️ 19 项生产级工具矩阵**：覆盖自省探针、存储桶生命周期、虚拟目录树浏览与游标分页、模式搜索、文本与 Range 范围读取、本地磁盘双向流式互传、时效预签名直链、对象原子移动与标签治理。
- **🔍 毫秒级自省探针 (`s3_ping`)**：发送极轻量校验请求，以毫秒级时延返回当前生效 Endpoint、脱敏 AccessKey、Region、网络往返 RTT 及连通状态（[ADR-0005](docs/adr/0005-connectivity-probe-and-containerization.md)）。
- **🐳 生产级轻量容器化**：提供 Alpine 多阶段构建 `Dockerfile`（非 root 用户运行）与开箱即用的 `docker-compose.yaml`（一键拉起 MinIO + S3 MCP 集群）。
- **📦 免安装一键即用**：发布至 npm 官方注册表 `@atengk/mcp-server-s3`，由 GitHub Actions 原生 OIDC 签发不可篡改的 SLSA Provenance 防伪溯源凭证（[ADR-0004](docs/adr/0004-distribution-and-registry-strategy.md)）。

---

## 🌟 多数据源与多实例并存配置 (Multi-Instance Configuration)

> ### 💡 核心机制：为什么环境变量配置天然支持多个不同实例？
> 在 MCP 架构中，客户端（如 Claude Desktop 或 Cursor）为配置文件中的**每一个服务项启动一个独立的操作系统子进程 (Child Process)**。
> 每个服务项各自持有独立的 `env` 环境变量字典，**进程间完全物理隔离，互不干扰、互不覆盖**。
> 因此，您完全可以在同一个 AI 客户端中同时挂载多个指向不同云存储、不同权限边界的对象存储服务！

### 完整多实例并存配置范例 (以 `claude_desktop_config.json` 为例)

在同一个配置文件中，同时挂载 **RustFS (公网)**、**MinIO (本地开发)** 以及 **AWS S3 (生产只读)**：

```json
{
  "mcpServers": {
    "s3-rustfs": {
      "command": "npx",
      "args": ["-y", "@atengk/mcp-server-s3"],
      "env": {
        "MCP_S3_ENDPOINT": "http://103.236.97.210:47875",
        "MCP_S3_REGION": "us-east-1",
        "MCP_S3_ACCESS_KEY_ID": "admin",
        "MCP_S3_SECRET_ACCESS_KEY": "Admin@123",
        "MCP_S3_FORCE_PATH_STYLE": "true"
      }
    },
    "s3-local-minio": {
      "command": "npx",
      "args": ["-y", "@atengk/mcp-server-s3"],
      "env": {
        "MCP_S3_ENDPOINT": "http://127.0.0.1:9000",
        "MCP_S3_REGION": "us-east-1",
        "MCP_S3_ACCESS_KEY_ID": "minioadmin",
        "MCP_S3_SECRET_ACCESS_KEY": "minioadmin",
        "MCP_S3_FORCE_PATH_STYLE": "true",
        "MCP_S3_DEFAULT_BUCKET": "dev-bucket"
      }
    },
    "s3-prod-aws": {
      "command": "npx",
      "args": ["-y", "@atengk/mcp-server-s3"],
      "env": {
        "MCP_S3_REGION": "us-west-2",
        "MCP_S3_ACCESS_KEY_ID": "AKIAIOSFODNN7EXAMPLE",
        "MCP_S3_SECRET_ACCESS_KEY": "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
        "MCP_S3_READ_ONLY": "true",
        "MCP_S3_DEFAULT_BUCKET": "company-prod-data"
      }
    }
  }
}
```

- **调用效果**：在与 Claude 或 Cursor 对话时，AI 可以同时感知并调度这三个服务：
  - `s3-rustfs:s3_ping` 诊断 RustFS 公网连通性；
  - `s3-local-minio:upload_file` 向本地开发桶上传数据；
  - `s3-prod-aws:read_object_text` 只读检视生产环境日志（写删操作被物理门禁阻断保护）。

---

## ⚡ 命令行参数快速启动 (CLI Flags & Options)

除了在配置文件的 `env` 块中配置环境变量，`@atengk/mcp-server-s3` 原生支持**双模配置体系**：**命令行参数 (CLI Flags) 优先级高于环境变量**。在不支持设置 `env` 字典的受限环境或终端即时调试时，可直接通过命令行参数启动：

### 终端单行命令启动示例

```bash
# 连接公网 RustFS / MinIO (Path-Style 模式)
npx -y @atengk/mcp-server-s3 --endpoint http://103.236.97.210:47875 --access-key-id admin --secret-access-key Admin@123 --path-style

# 启动只读受限模式并指定默认存储桶
npx -y @atengk/mcp-server-s3 --region us-east-1 --bucket my-bucket --read-only

# 启动 HTTP SSE 远程微服务并启用 Bearer Token 访问控制
npx -y @atengk/mcp-server-s3 --transport sse --port 8000 --api-key secret-token-888
```

### 命令行常用选项速查表

| 命令行选项 | 对应规范环境变量 | 说明 |
| :--- | :--- | :--- |
| `--endpoint <url>` | `MCP_S3_ENDPOINT` | S3 API 兼容接入点 |
| `--region <region>` | `MCP_S3_REGION` | 目标物理地域 (默认: `us-east-1`) |
| `--access-key-id <ak>` | `MCP_S3_ACCESS_KEY_ID` | S3 Access Key ID |
| `--secret-access-key <sk>` | `MCP_S3_SECRET_ACCESS_KEY` | S3 Secret Access Key |
| `--session-token <token>` | `MCP_S3_SESSION_TOKEN` | STS 临时会话令牌 (可选) |
| `--path-style`, `--force-path-style` | `MCP_S3_FORCE_PATH_STYLE` | 强制使用路径寻址 (MinIO / RustFS 必填) |
| `--bucket <name>`, `--default-bucket` | `MCP_S3_DEFAULT_BUCKET` | 默认绑定的存储桶名称 |
| `--read-only` | `MCP_S3_READ_ONLY` | 开启只读门禁模式 |
| `--allowed-local-dir <dir>` | `MCP_S3_ALLOWED_LOCAL_DIR` | 本地文件沙箱基准目录 (默认: `./`) |
| `--transport <mode>` | `MCP_S3_TRANSPORT` | 通信传输模式 (`stdio` 或 `sse`) |
| `--host <host>` | `MCP_S3_SERVER_HOST` | SSE 监听主机地址 (默认: `0.0.0.0`) |
| `--port <port>` | `MCP_S3_SERVER_PORT` | SSE 监听端口号 (默认: `8000`) |
| `--api-key <token>` | `MCP_S3_API_KEY` | HTTP SSE 接入鉴权 Bearer Token |
| `-h, --help` | — | 打印详细中文帮助文档 |
| `-v, --version` | — | 打印当前版本号 |

---

## ⚙️ 常见单源场景独立配置 (Scenarios)

### 场景 1：RustFS 公网对象存储
```json
{
  "mcpServers": {
    "rustfs": {
      "command": "npx",
      "args": ["-y", "@atengk/mcp-server-s3"],
      "env": {
        "MCP_S3_ENDPOINT": "http://103.236.97.210:47875",
        "MCP_S3_REGION": "us-east-1",
        "MCP_S3_ACCESS_KEY_ID": "admin",
        "MCP_S3_SECRET_ACCESS_KEY": "Admin@123",
        "MCP_S3_FORCE_PATH_STYLE": "true"
      }
    }
  }
}
```

### 场景 2：MinIO 本地私有化环境
```json
{
  "mcpServers": {
    "minio": {
      "command": "npx",
      "args": ["-y", "@atengk/mcp-server-s3"],
      "env": {
        "MCP_S3_ENDPOINT": "http://127.0.0.1:9000",
        "MCP_S3_REGION": "us-east-1",
        "MCP_S3_ACCESS_KEY_ID": "minioadmin",
        "MCP_S3_SECRET_ACCESS_KEY": "minioadmin",
        "MCP_S3_FORCE_PATH_STYLE": "true"
      }
    }
  }
}
```

### 场景 3：AWS S3 原生环境 (公有云)
```json
{
  "mcpServers": {
    "aws-s3": {
      "command": "npx",
      "args": ["-y", "@atengk/mcp-server-s3"],
      "env": {
        "MCP_S3_REGION": "us-west-2",
        "MCP_S3_ACCESS_KEY_ID": "AKIAIOSFODNN7EXAMPLE",
        "MCP_S3_SECRET_ACCESS_KEY": "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
      }
    }
  }
}
```

### 场景 4：阿里云 OSS (S3 兼容模式)
```json
{
  "mcpServers": {
    "aliyun-oss": {
      "command": "npx",
      "args": ["-y", "@atengk/mcp-server-s3"],
      "env": {
        "MCP_S3_ENDPOINT": "https://oss-cn-hangzhou.aliyuncs.com",
        "MCP_S3_REGION": "oss-cn-hangzhou",
        "MCP_S3_ACCESS_KEY_ID": "LTAI5txxxxxxxxxxxx",
        "MCP_S3_SECRET_ACCESS_KEY": "your_aliyun_secret",
        "MCP_S3_FORCE_PATH_STYLE": "false"
      }
    }
  }
}
```

### 场景 5：Cloudflare R2 边缘存储
```json
{
  "mcpServers": {
    "cloudflare-r2": {
      "command": "npx",
      "args": ["-y", "@atengk/mcp-server-s3"],
      "env": {
        "MCP_S3_ENDPOINT": "https://<account_id>.r2.cloudflarestorage.com",
        "MCP_S3_REGION": "auto",
        "MCP_S3_ACCESS_KEY_ID": "your_r2_access_key_id",
        "MCP_S3_SECRET_ACCESS_KEY": "your_r2_secret_access_key"
      }
    }
  }
}
```

---

## 🛠️ 19 项核心工具矩阵清单 (Tools Matrix)

| 套件分类 | 工具名称 | 参数契约概览 | 核心职责与安全行为 |
| :--- | :--- | :--- | :--- |
| **0. 自省诊断** | **`s3_ping`** | 无入参 | 毫秒级自检端点连通性、网络 RTT、生效 Region 与脱敏鉴权身份 |
| **1. 存储桶生命周期** | `list_buckets` | 无入参 | 列出所有存储桶名称及创建时间列表 |
| | `create_bucket` | `bucket`, `region?` | 创建新存储桶（支持指定部署区域） |
| | `delete_bucket` | `bucket`, `force?` | 删除存储桶（只读门禁下物理隐藏，支持 force 强制清理后删桶） |
| | `get_bucket_location` | `bucket` | 查询存储桶的物理实际部署地域 |
| **2. 检索探索定位** | `list_objects` | `bucket?`, `prefix?`, `delimiter?`, `max_keys?`, `continuation_token?` | 模拟分层虚拟目录树（Delimiter 默认为 `/`），支持游标分页 |
| | `search_objects` | `bucket?`, `query`, `prefix?`, `max_results?` | 在前缀路径树中执行关键字匹配与正则搜索 |
| | `stat_object` | `bucket?`, `key` | 提取对象大小、Content-Type、最后修改时间、ETag 及元数据 |
| **3. 内容检视分块** | `read_object_text` | `bucket?`, `key`, `max_bytes?`, `encoding?` | 文本直读，256KB 阈值截断保护；**支持仿 Git Null Byte 纯文本深度探测** |
| | `read_object_range` | `bucket?`, `key`, `start_byte`, `end_byte` | HTTP Range 字节范围读取（适用于大日志尾部排障与大文件头检视） |
| **4. 双向流式传输** | `put_object_text` | `bucket?`, `key`, `content`, `content_type?` | 文本/JSON 上传与直接覆盖 |
| | `upload_file` | `bucket?`, `key`, `local_path`, `content_type?` | 本地磁盘文件流式上传，受沙箱保护；**>32MB 自动自适应分段上传 (Multipart)** |
| | `download_file` | `bucket?`, `key`, `local_path` | S3 对象流式保存为本地文件，受工作区沙箱保护 |
| | `get_presigned_url` | `bucket?`, `key`, `expires_in?`, `method?` | 为大文件或多媒体生成有时效的预签名 HTTP 直链（GET/PUT） |
| **5. 批处理与标签** | `copy_object` | `source_bucket?`, `source_key`, `target_bucket?`, `target_key` | 同桶与跨桶对象复制 |
| | `move_object` | `source_bucket?`, `source_key`, `target_bucket?`, `target_key` | 原子化移动与重命名（复制成功后安全删除源对象） |
| | `delete_object` | `bucket?`, `key` | 删除指定的单个对象 |
| | `delete_objects_batch` | `bucket?`, `keys: string[]` | 批量删除指定的多个对象键列表（单批上限 1000） |
| | `delete_objects_by_prefix` | `bucket?`, `prefix`, `confirm_recursive_delete` | 递归清理虚拟子目录，内置三重防灾熔断守卫 |
| | `get_object_tags` | `bucket?`, `key` | 查询对象关联的 Key-Value 标签字典 |
| | `set_object_tags` | `bucket?`, `key`, `tags` | 写入或全量覆盖对象业务标签 |

---

## 📋 12-Factor 规范环境变量矩阵 (Configuration)

| 规范主环境变量 (`MCP_S3_*`) | 兼容备用变量 (`AWS_*`) | 默认值 | 作用与规范说明 |
| :--- | :--- | :--- | :--- |
| **`MCP_S3_ENDPOINT`** | `AWS_ENDPOINT_URL_S3` / `AWS_ENDPOINT_URL` | 无 | S3 兼容接入点（如 `http://127.0.0.1:9000`） |
| **`MCP_S3_REGION`** | `AWS_REGION` / `AWS_DEFAULT_REGION` | `us-east-1` | 目标区域（MinIO/RustFS/R2 通常为 `us-east-1`） |
| **`MCP_S3_ACCESS_KEY_ID`** | `AWS_ACCESS_KEY_ID` | 无 | S3 访问密钥 ID |
| **`MCP_S3_SECRET_ACCESS_KEY`** | `AWS_SECRET_ACCESS_KEY` | 无 | S3 访问密钥 Secret |
| **`MCP_S3_SESSION_TOKEN`** | `AWS_SESSION_TOKEN` | 无 | STS 临时会话令牌（可选） |
| **`MCP_S3_FORCE_PATH_STYLE`** | `AWS_S3_FORCE_PATH_STYLE` | `false` | 是否强制使用路径寻址（MinIO/RustFS 设为 `true`） |
| **`MCP_S3_DEFAULT_BUCKET`** | 无 | 无 | 默认绑定存储桶（配置后所有 Tool 的 `bucket` 参数变为可选） |
| **`MCP_S3_READ_ONLY`** | 无 | `false` | **只读门禁模式**：为 `true` 时在 MCP 协议层完全隐藏写/删类工具 |
| **`MCP_S3_ALLOWED_LOCAL_DIR`**| 无 | `./` | **本地文件沙箱基准目录**：严格阻断沙箱外路径读写 |
| **`MCP_S3_MAX_READ_BYTES`** | 无 | `262144` (256KB) | **文本读取最大安全阈值**：超出部分强制截断防爆 |
| **`MCP_S3_PRESIGNED_EXPIRES`**| 无 | `3600` (1小时) | 预签名 URL 默认有效生命周期（秒） |
| **`MCP_S3_TRANSPORT`** | 无 | `stdio` | 通信传输模式：`stdio`（标准管道）或 `sse`（HTTP长轮询） |
| **`MCP_S3_SERVER_HOST`** | 无 | `0.0.0.0` | `sse` 模式下 HTTP 服务监听地址 |
| **`MCP_S3_SERVER_PORT`** | 无 | `8000` | `sse` 模式下 HTTP 服务监听端口 |
| **`MCP_S3_API_KEY`** | `MCP_S3_AUTH_TOKEN` | 无 | **HTTP SSE 接入鉴权 Token**：配置后强制 Bearer Token / URL 校验 |

---

## 🐳 云原生轻量容器化部署与 HTTP SSE 鉴权 (Docker & SSE)

对于希望在内网或微服务集群中集中提供 S3 MCP 服务的团队，可使用项目附带的 Docker 配置启动常驻守护服务：

### 1. 使用 Docker Compose 一键拉起微服务集群

```bash
# 启动常驻微服务 (MinIO + S3 MCP)
docker compose up -d

# 检查服务就绪探针 (健康检查公开免鉴权)
curl http://localhost:8000/health
```

### 2. 远程 HTTP SSE 访问与鉴权规范

当配置了 `MCP_S3_API_KEY=your-secret-token` 时，服务自动启用全量 CORS 跨域支持与双栈安全鉴权：

```bash
# 方式 1: 通过标准 Authorization Bearer 请求头连接 SSE (推荐桌面/网关客户端)
curl -N -H "Authorization: Bearer your-secret-token" http://localhost:8000/sse

# 方式 2: 通过 URL 查询参数连接 SSE (适配原生浏览器 EventSource API)
curl -N "http://localhost:8000/sse?token=your-secret-token"

# 发送 JSON-RPC 消息 (带 Bearer Token)
curl -X POST -H "Authorization: Bearer your-secret-token" \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","method":"ping","id":1}' \
     "http://localhost:8000/message?sessionId=<SESSION_ID>"
```

---

## 🛡️ 三位一体安全防灾体系 (Security Guardrails)

```
                            AI Agent 发起请求
                                    │
                  ┌─────────────────┴─────────────────┐
                  │                                   │
            [写/删高危操作]                      [文件读写操作]
                  │                                   │
                  ▼                                   ▼
       【Read-Only Guard 检查】              【Sandbox Guard 校验】
       (若开启只读则协议层隐藏/阻断)         (判断是否处于受管本地工作区内)
                  │                                   │
                  ▼                                   ▼
    【Prefix Deletion Guard 检查】          【Content Truncator 过滤】
    • 严禁根前缀 ("" 或 "/")                • 限制最大单次读取 256KB
    • 强制显式 confirm 参数                 • 超出部分截断并注入警示
    • 单批次强制截断上限 1000               • 二进制 Null Byte 智能拦截
```

---

## 📊 架构设计与工程分层 (Architecture)

```
src/
├── config/             # 12-Factor App 强类型环境配置与 CLI 命令行解析 (env.ts, cli.ts)
├── connection/         # S3Client 连接单例工厂与凭据链管理 (s3-client-factory.ts)
├── security/           # 只读门禁、沙箱验证、递归删除三重防御、文本截断器 (readonly-guard.ts, sandbox-guard.ts, prefix-guard.ts, content-truncator.ts)
├── services/           # 领域服务分治（Bucket、Object、Transfer、Presign、Tagging、Probe 逻辑）
├── server/             # Stdio 与 HTTP SSE 双模服务实现与安全门禁 (sse-server.ts)
├── types/              # 领域接口契约与 Zod 运行时校验 Schema
└── index.ts            # 装配入口、CLI 调度与进程信号优雅退出管理
```

---

## 📝 统一领域模型与架构决策 (Domain Model & ADRs)

- **统一领域语言与术语表**：详见 [CONTEXT.md](CONTEXT.md)
- **核心架构决策记录 (ADRs)**：
  - [ADR-0001: 统一 MCP_S3 规范环境变量中枢与 TypeScript 运行时](docs/adr/0001-mcp-s3-configuration-and-runtime.md)
  - [ADR-0002: 分层工具套件矩阵、本地路径沙箱与递归删除三重防御体系](docs/adr/0002-tiered-toolsets-and-safety-guards.md)
  - [ADR-0003: Stdio 与 HTTP SSE 双模通信引擎及 tsup 极速单文件打包](docs/adr/0003-transport-and-bundling.md)
  - [ADR-0004: 作用域包命名、Provenance 软件供应链溯源与极简发版体系](docs/adr/0004-distribution-and-registry-strategy.md)
  - [ADR-0005: 轻量连通性自省探针 s3_ping 与云原生多阶段容器化](docs/adr/0005-connectivity-probe-and-containerization.md)
  - [ADR-0006: HTTP SSE 访问控制、透明分段上传与纯文本深度探测](docs/adr/0006-sse-security-multipart-upload-and-content-probing.md)

---

## 🤝 贡献与开源许可 (License)

本项目采用 [MIT License](./LICENSE) 开源协议。

Copyright (c) 2026 Ateng.
