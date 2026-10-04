# ADR-0007: 开源工程化模板合流、自动化发版与 CI/CD 规范

## 状态 (Status)
已通过 (Accepted)

## 日期 (Date)
2026-10-04

## 上下文 (Context)
随着 `@atengk/mcp-server-s3` 走向标准化开源发布，项目不仅需要提供高质量的运行时与原子工具能力，更需要建立与工业级开源项目对齐的社区工程化基线（OSS Baseline）。此前项目的发版流水线相对独立，缺少统一的变更日志规范、PR 标题自动化语义检查、跨平台换行归一化控制，以及对多架构云原生镜像发布的支持。

为吸纳最佳工程实践，我们参考了团队标准开源模板仓库 `oss-template`（`https://github.com/atengk/oss-template`），需要决定如何将其核心工程化配置与现有 S3 MCP 服务进行深度融合，并解决发版自动化与社区治理的协同问题。

## 决策 (Decision)

我们决定深度合流 `oss-template` 的开源基础设施规范，形成面向 `@atengk/mcp-server-s3` 的三维一体工程流水线：

1. **跨平台协作与代码风格统一**：
   - 引入 `.editorconfig`：强制各 IDE/编辑器使用 UTF-8 编码、LF 换行符与 2 空格缩进；
   - 引入 `.gitattributes`：全量声明 Git 文本文件自动转换为 LF 换行，杜绝 Windows CRLF 导致跨平台 Diff 杂音或 Linux 脚本运行故障；
   - 引入规范的 `CONTRIBUTING.md`、结构化 Issue 模板（`bug_report.md`、`feature_request.md`）及 `PULL_REQUEST_TEMPLATE.md`，深度适配 S3 兼容对象存储与 MCP 协议测试要求。

2. **严格的 CI 持续集成门禁 (`ci.yml`)**：
   - 接入 `amannn/action-semantic-pull-request@v5`：在 PR 阶段强制校验标题严格符合 Conventional Commits 规范，为下游全自动发布日志提取奠定规范数据源；
   - 针对当前项目技术栈（Node.js 20 + pnpm）激活全量质量门禁：自动执行依赖锁定安装、类型检查 (`pnpm typecheck`)、单元测试 (`pnpm test`) 及单文件打包 (`pnpm build`)。

3. **双轨发版流水线与 git-cliff 自动化变更日志 (`release.yml`)**：
   - **完全自动化 Release Notes**：引入 `.cliff.toml` 配置文件，在推送语义化 Tag（`v*`）时通过 `git-cliff-action` 自动解析提交历史，分类生成 Markdown 格式的发布说明。**此方案彻底替代 ADR-0004 中手动维护 `CHANGELOG.md` 并作为发版正文的设计，代码库物理删除手写静态文件，以 GitHub Releases 作为唯一权威发布日志展示**；
   - **软件供应链防伪发版 (NPM + SLSA Provenance)**：在质量门禁全部通过后，读取 GitHub Secrets 中的 `NPM_TOKEN`，并通过 GitHub OIDC 签发 `--provenance` 防伪证书，完成 `@atengk/mcp-server-s3` 官方注册表发布；
   - **多架构容器镜像分发 (GHCR)**：利用内置 `GITHUB_TOKEN`，通过 Docker Buildx 并发编译 `linux/amd64` 与 `linux/arm64` 双架构轻量容器镜像，自动推送至 `ghcr.io/atengk/mcp-server-s3`，提供免安装一键运行体验。

## 后果与影响 (Consequences)

### 积极影响 (Positive)
- **发版完全自动化**：开发者仅需运行 `git tag vX.Y.Z && git push origin vX.Y.Z`，流水线自动完成测试打包、日志生成、npm 发包、GitHub Release 创建及 GHCR 镜像构建。
- **供应链安全性提升**：保留了 SLSA Provenance 软件供应链溯源，杜绝恶意篡改风险。
- **多端开箱即用**：同时向生态交付 npm CLI 包、单文件独立 Bundle 附件和 GHCR 多架构 Docker 镜像。
- **社区协作规范化**：清晰的贡献指南、Issue 模板和 PR 标题校验降低了开源协作成本。

### 潜在代价与权衡 (Trade-offs)
- **多架构镜像编译时间**：交叉编译 `linux/arm64` 镜像会略微增加 GitHub Actions 的发版耗时（通常在 3~5 分钟内完成）；
- **Conventional Commits 强约束**：所有合并至 `main` 的 PR 标题与 Commit 必须严格遵循规范，否则将被 CI 门禁直接拦截。
