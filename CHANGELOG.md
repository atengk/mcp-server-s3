# 更新日志 (Changelog)

本项目所有显著变更均记录于此文件。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/) 规范，版本号遵循 [语义化版本 2.0.0](https://semver.org/lang/zh-CN/)。

---

## [Unreleased]

### 规划与演进 (Roadmap)
- 阶段 1：工程基座、类型契约与规范配置中枢（[#2](https://github.com/atengk/mcp-server-s3/issues/2)）
- 阶段 2：S3 连接工厂、只读门禁与安全沙箱熔断套件（[#3](https://github.com/atengk/mcp-server-s3/issues/3)）
- 阶段 3：存储桶检索、虚拟目录树分页与内容分块直读（[#4](https://github.com/atengk/mcp-server-s3/issues/4)）
- 阶段 4：双向流式文件互传、时效外链与对象批处理/标签（[#5](https://github.com/atengk/mcp-server-s3/issues/5)）
- 阶段 5：双模通信引擎、云原生常驻容器化与极简发版流水线（[#6](https://github.com/atengk/mcp-server-s3/issues/6)）

---

## [v1.0.0] - 2026-10-04

### 新增 (Added)
- **12-Factor 标准环境变量中枢**：引入统一规范前缀 `MCP_S3_*` 环境变量矩阵，提供强类型校验与宽容解析，同时 100% 透明向下兼容标准 `AWS_*` 环境变量凭证链。
- **19 项生产级对象存储工具矩阵**：
  - 连通自省探针：`s3_ping`（毫秒级网络与身份诊断）；
  - 存储桶生命周期：`list_buckets`、`create_bucket`、`delete_bucket`、`get_bucket_location`；
  - 检索与内容检视：`list_objects`（虚拟目录折叠/分页）、`search_objects`（模式匹配）、`stat_object`、`read_object_text`（256KB 截断保护）、`read_object_range`（字节范围读取）；
  - 双向文件传输：`put_object_text`、`upload_file`（本地流式上传）、`download_file`（S3 流式落盘）、`get_presigned_url`（时效外链 GET/PUT）；
  - 批处理与标签：`copy_object`、`move_object`（原子重命名）、`delete_object`、`delete_objects_batch`、`delete_objects_by_prefix`（前缀目录清理）、`get_object_tags` / `set_object_tags`。
- **三位一体安全防灾体系**：
  - `Read-Only Guard`：只读门禁模式下在 MCP 协议层物理隐藏所有写/删类工具；
  - `Sandbox Guard`：将本地文件读写严格限制在 `MCP_S3_ALLOWED_LOCAL_DIR` 工作区沙箱内，阻断 `../` 越权逃逸；
  - `Prefix Deletion Guard`：递归清理前缀强制禁止根路径、强制显式布尔确认参数、单批限制 1000 个上限；
  - `Content Truncator`：文本读取 256KB 智能截断与警告提示。
- **双模通信传输引擎 (Stdio + HTTP SSE)**：支持本地进程间标准输入输出管道（`stdio`）与远程长轮询事件流（`sse`，暴露 `/sse`、`/message` 及 `/health` 健康检查端点）。
- **云原生轻量容器化编排**：提供 Alpine 多阶段构建 `Dockerfile`（非 root 用户 `node` 运行）与开箱即用的 `docker-compose.yaml`（一键编排 MinIO + S3 MCP）。
- **软件供应链安全与自动化发版**：配置 GitHub Actions 原生 OIDC `--provenance` SLSA 安全溯源，由 `CHANGELOG.md` 直接驱动发布 GitHub Releases。
