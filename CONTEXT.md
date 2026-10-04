# S3 MCP 领域模型与统一语言 (S3 MCP Context)

本领域上下文定义了通过 Model Context Protocol (MCP) 驱动与管理兼容 S3 协议对象存储（MinIO、AWS S3、阿里云 OSS、Cloudflare R2 等）的核心概念与通用语言，确保所有设计、代码符号与 Agent 交互使用一致的术语。

## 统一领域语言 (Language)

### 对象存储核心概念 (Storage & Data Hierarchy)

**Bucket (存储桶)**:
存储对象的顶级容器与独立全局命名空间。
_Avoid_: Folder (文件夹), Directory (目录), Database (数据库)

**Object (对象)**:
存储在 Bucket 中的基本数据单元，包含数据流、元数据及用户标签。
_Avoid_: File (文件), Blob (二进制块), Document (文档), 散落文件

**Key (对象键)**:
Object 在 Bucket 中的唯一绝对标识符路径（不以正斜杠 `/` 开头）。
_Avoid_: File Path (文件路径), File Name (文件名), URL, 相对路径

**Prefix (前缀)**:
用于筛选 Object 与模拟分层虚拟目录结构的对象键起始字符串。
_Avoid_: Subdirectory (子目录), Folder Path (目录路径)

**Delimiter (定界符)**:
用于折叠虚拟分层目录结构的字符（标准 S3 实践中固定为正斜杠 `/`）。
_Avoid_: Separator (分隔符), Splitter (切分符)

**Common Prefix (公共前缀 / 虚拟目录)**:
在指定 Delimiter 下根据当前 Prefix 计算得出的虚拟子目录聚合列表。
_Avoid_: Subfolder (子文件夹), Directory List (目录列表)

**Presigned URL (预签名链接)**:
使用客户端凭据签名、具有预设生命周期的直接 HTTP(S) 访问（GET）或上传（PUT）链接。
_Avoid_: Temporary Link (临时链接), Download URL (下载地址), Share Link (分享链接)

**Range Read (字节范围读取)**:
通过指定字节区间（起始与结束字节偏移量）按需读取对象局部内容的操作（适用于日志末尾与大文件头排查）。
_Avoid_: Chunk Read (分块直读), Partial Download (部分下载)

### 安全与防灾防护 (Security & Guardrails)

**Sandbox Path (沙箱安全路径)**:
允许与 S3 对象进行上传/下载双向传输的本地受管安全目录边界，由 `MCP_S3_ALLOWED_LOCAL_DIR` 约束。
_Avoid_: Absolute Host Path (宿主机任意路径), Raw Path

**Read-Only Guard (只读门禁守卫)**:
当 `MCP_S3_READ_ONLY=true` 时，在 MCP 握手协议层物理隐藏所有写/删类工具的防灾机制。
_Avoid_: Permission Filter (权限过滤器), Error Interceptor (错误拦截器)

**Prefix Deletion Guard (前缀删除防灾熔断)**:
在执行递归前缀清理时，强制校验非空前缀、显式二次确认参数及千级批次上限的三重防御机制。
_Avoid_: Bulk Cleaner (批量清理器), Force Delete (强制删除)

**Content Truncator (内容截断器)**:
负责监控文本直读体积，在内容超出 `MCP_S3_MAX_READ_BYTES`（默认 256KB）时进行安全截断并保留元数据警示的处理器。
_Avoid_: Size Limiter (体积限制器), Buffer Trimmer

### 连接探针与多厂商兼容 (Connection & Multi-Vendor)

**Connectivity Probe (连通性探针)**:
通过 `s3_ping` 工具向目标对象存储发送极轻量请求，用于测量往返网络时延（RTT）并自省当前鉴权身份与连通性。
_Avoid_: Healthcheck Ping, Netstat, Keepalive

**Canonical Environment Variable (规范环境变量)**:
遵循 12-Factor App 体系、以 `MCP_S3_*` 为主命名空间的一等公民环境变量，具备最高解析优先级并向下兼容 `AWS_*`。
_Avoid_: Raw Env, Config Key, Config Flag

**Path-Style Addressing (路径寻址风格)**:
对象存储 URL 组织形式采用 `endpoint/bucket/key`（如 MinIO、自建 Ceph），区别于公有云默认的虚拟主机风格 `bucket.endpoint/key`。
_Avoid_: URL Mode, Slash Mode

### 通信传输与分发生态 (Transport & Distribution)

**Transport Mode (传输模式)**:
MCP 服务端与 AI 客户端之间进行 JSON-RPC 消息交换的底层协议承载形态。本项目支持进程间标准输入输出管道 (`stdio`) 与网络长轮询事件流 (`sse`) 两种模式。
_Avoid_: Protocol (协议混称), Communication Method (通信方式)

**SSE Endpoint (SSE 网络端点)**:
在 `sse` 传输模式下，轻量 HTTP 服务对外暴露的标准接口，专指用于建立长轮询事件流的 `/sse` 路由与用于接收客户端 JSON-RPC 消息的 `/message` 路由。
_Avoid_: HTTP API, Webhook, REST Route

**Health Probe Endpoint (健康检查端点)**:
在 `sse` 传输模式下由 HTTP 服务在 `/health` 暴露的轻量无状态检测端点，供 Docker、K8s 或负载均衡器探测服务就绪（Readiness）与存活（Liveness）状态。
_Avoid_: Status Page, Ping Route

**Scoped Package (作用域包)**:
专指在 NPM 官方公共注册表下以 `@atengk/` 命名空间为前缀的唯一发布包名（`@atengk/mcp-server-s3`），确立组织唯一所有权并防范供应链混淆。
_Avoid_: Global Unscoped Package (无作用域全局包), Bare Package
