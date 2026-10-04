# 0005. 轻量连通性自省探针 s3_ping 与云原生多阶段容器化

## 背景与决策 (Context & Decision)

在多云对象存储实际运维过程中，由于涉及 Endpoint 拼写、地域 Region、AKSK 签名有效性及路径风格等多重配置，一旦环境变量存在细微失误，Agent 调用昂贵的业务工具将触发海量晦涩的 SDK 异常堆栈，难以快速自省定位。此外，许多研发团队需要将 MinIO 与 MCP 服务作为私有微服务快速拉起。

我们决定采纳以下核心探针与容器化决策：
1. **轻量连通性探针工具 `s3_ping`**：提供无入参的极速诊断工具，底层向目标存储发送轻量校验请求，以毫秒级时延返回当前生效的 Endpoint、脱敏 AccessKey、Region、网络往返 RTT 及存活状态；
2. **多阶段构建生产级 Dockerfile**：基于 `node:20-alpine` 实施多阶段构建（Builder 负责 pnpm 编译，Runner 仅包含生产单文件），切换内置非 root 用户 `node` 运行，暴露 `/health` 健康检查端点；
3. **开箱即用的 docker-compose.yaml 与 GHCR 镜像消费**：一键编排并挂载 MinIO 与 `mcp-server-s3`。随着 CI/CD 自动发布 GHCR 多架构镜像（见 [ADR-0007](0007-oss-template-and-release-pipeline.md)），Compose 编排文件默认直接消费官方预编译镜像 `ghcr.io/atengk/mcp-server-s3:${MCP_S3_IMAGE_TAG:-latest}`，实现脱离源码的单文件秒级拉起，同时保留本地 `build` 注释供二开切换。

## 权衡考量 (Considered Options)

- **连通性校验手段**：
  - 由 Agent 盲目调用 `list_buckets`：在部分受限权限（如仅拥有特定 Bucket 权限）场景下会报错 `AccessDenied`，无法准确诊断基础网络连通性；
  - 专用 `s3_ping` 探针（已采纳）：统一抽象连通性逻辑，具备优雅降级与清晰的诊断报告。
- **容器化形态**：
  - 传统重型单镜像：镜像体积高达几百 MB，且以 root 用户运行存在提权漏洞；
  - Alpine 极简多阶段构建（已采纳）：镜像体积极致压缩至百兆以内，非 root 运行保障容器安全合规。

## 后果与影响 (Consequences)

- 优势：
  - Agent 在任务初始化或遇到网络抖动时可主动自我诊断；
  - 支持 `docker compose up -d` 零依赖一键拉起完整的 S3 模拟环境；
  - 容器自带 `/health` 探针，完美适配 Kubernetes Liveness/Readiness 巡检。
- 代价：
  - 需额外维护 Dockerfile 与 docker-compose.yaml 编排模板。
