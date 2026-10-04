# 0004. 作用域包命名、Provenance 软件供应链溯源与极简发版体系

> ⚠️ **演进说明**：关于发版日志生成机制，已在 [ADR-0007](0007-oss-template-and-release-pipeline.md) 中全面演进为由 Conventional Commits 与 `.cliff.toml` 自动化提取，彻底物理移除了手工维护的 `CHANGELOG.md`。

## 背景与决策 (Context & Decision)

为了使全球开发者和各类 AI 宿主客户端能够无缝发现、一键免安装运行并安全接入 `mcp-server-s3`，我们需要确立生产发布渠道与发版质量标准。未经 Scope 的包名存在被抢注与供应链仿冒的重大风险，且发版过程必须具备防伪凭证。

我们决定采纳以下核心分发与发布决策：
1. **统一作用域包命名**：在 NPM 官方注册表采用 `@atengk/mcp-server-s3`，与 GitHub 官方仓库强一致绑定；
2. **三位一体立体分发矩阵**：
   - **底座运行层**：发布至 NPM 公共注册表，支持 `npx -y @atengk/mcp-server-s3` 零依赖即开即用；
   - **源码与交付层**：GitHub 主干管理，配合语义化版本自动创建 GitHub Releases；
   - **生态收录层**：主动接入 Model Context Protocol 官方生态目录与主流 MCP Catalog（PulseMCP、Glama、Awesome MCP Servers）；
3. **自动化发布流水线与 Provenance 溯源防伪**：配置 GitHub Actions 工作流，在推送版本 Tag（`v*`）时执行类型检查、全量单元测试与打包，利用 GitHub Actions 原生 OIDC 签发不可篡改的 SLSA Provenance 软件供应链防伪凭证以 `npm publish --access public --provenance` 形式发布；
4. **权威 CHANGELOG.md 驱动的极简 GitHub Release**：直接将权威的 `CHANGELOG.md` 作为发版正文（`body_path: CHANGELOG.md`），彻底免除脆弱复杂的内联解析脚本。

## 权衡考量 (Considered Options)

- **Release 发版说明生成方式**：
  - 在 Actions 中维护 40 行 Node.js 正则提取脚本：反模式且易因 Markdown 格式微调崩溃，属于过度设计；
  - 引入第三方切片 Action：增加了额外的外部非可控供应链依赖；
  - 直接复用 `body_path: CHANGELOG.md`（已采纳）：`CHANGELOG.md` 本就是权威的单一事实来源，最新版本天然置顶，流水线清爽优雅零开销。
- **包命名策略**：
  - 纯无前缀名 `mcp-server-s3`：极易遭遇抢注，且缺乏组织所有权标识；
  - 组织作用域包名 `@atengk/mcp-server-s3`（已采纳）：品牌一致性高，彻底阻断包名抢注与供应链投毒。

## 后果与影响 (Consequences)

- 优势：
  - 确立了清晰的品牌标识与供应链安全溯源体系；
  - 自动化发版流水线极致清爽，零维护负担；
  - 每次发布的包均经过 100% 单元测试检验并附带 SLSA Provenance 签名。
- 代价：
  - 发布作用域公开包需配置 `"publishConfig": { "access": "public" }`；
  - 需要在 GitHub 仓库中配置 `NPM_TOKEN` Secret 凭据。
