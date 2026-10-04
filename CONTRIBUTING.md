# 贡献指南 (Contributing Guide)

感谢你关注并愿意为 `@atengk/mcp-server-s3` 项目贡献力量！为了保持高效协作与高质量的代码维护，请在提交代码前阅读以下规范。

---

## 1. 协作与分支模型

本项目遵循标准的 **GitHub Flow** 工作流：

1. **Fork 本仓库** 到你个人的 GitHub 账号；
2. **基于 `main` 分支拉取新的特性分支**：
   ```bash
   git checkout -b feat/your-feature-name
   # 或者缺陷修复分支
   git checkout -b fix/issue-description
   ```
3. **本地开发与构建调试**：
   ```bash
   # 安装项目依赖 (锁定版本)
   pnpm install --frozen-lockfile

   # 严格类型检查
   pnpm typecheck

   # 运行全量单元测试与安全门禁
   pnpm test

   # 生产编译打包
   pnpm build
   ```
4. 在本地完成修改，确保单测与类型检查全部 100% 通过（绿灯）；
5. 提交更改并推送到你的远程分支：
   ```bash
   git push origin feat/your-feature-name
   ```
6. 在 GitHub 上向本仓库的 `main` 分支发起 **Pull Request**。

---

## 2. Commit 提交信息规范

本项目严格遵循 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/) 规范，CI 流水线会对 PR 标题和 Commit 信息执行自动化格式校验：

```text
<type>(<scope>): <subject>
```

### 常用类型说明

| 类型 | 说明 | 示例 |
| :--- | :--- | :--- |
| `feat` | 新增 MCP 工具或系统特性 | `feat(transfer): 支持自适应分段上传与时效直链` |
| `fix` | 缺陷与 Bug 修复 | `fix(security): 修复沙箱相对路径解析绕过漏洞` |
| `docs` | 仅文档更新或修改 | `docs(readme): 优化多实例配置与场景排版` |
| `style` | 代码格式调整（空格、分号等，不影响逻辑） | `style: 规范导入顺序与空格排版` |
| `refactor` | 代码重构（既非新增特性也非修复缺陷） | `refactor(client): 优化 S3 客户端单例工厂生命周期` |
| `perf` | 性能优化 | `perf(stream): 优化流式管道吞吐量与背压控制` |
| `test` | 增加或重构单元测试与集成测试 | `test: 补充路径寻址与前缀删除三重熔断测试` |
| `build` | 构建系统、外部依赖或脚手架调整 | `build: 升级 AWS SDK 与 tsup 依赖版本` |
| `ci` | CI/CD 流水线与 GitHub Actions 脚本修改 | `ci: 集成 git-cliff 与 GHCR 多架构镜像流水线` |
| `chore` | 其他琐碎杂项（不改动源码与测试） | `chore: 更新 .gitignore 忽略规则` |
| `revert` | 恢复或回滚此前的某次历史提交 | `revert: feat(sse): 回退长轮询心跳间隔修改` |

---

## 3. 代码与质量规范

- **单例与无状态设计**：Service 服务层保持无状态（Stateless），不得使用成员变量共享可变状态；
- **空安全与前置防御**：查询列表统一返回空数组 `[]`，严禁返回 `null`；单个实体必须做前置卫语句判空防御；
- **注释三要素**：新建源码文件需包含标准 Doc 注释（职责说明、`@author Ateng`、`@since YYYY-MM-DD`）；
- **沙箱与安全防灾**：涉及文件读写需受 `Sandbox Guard` 保护；删除操作需受 `Prefix Deletion Guard` 保护；文本读取受 `Content Truncator` 截断保护。

---

## 4. Pull Request 流程

- 发起 PR 时，请按模版完整填写变更背景、解决的问题以及关联的 Issue（如 `close #12`）；
- 确保 CI 流水线测试全部处于通过（绿灯）状态；
- 代码审查（Code Review）提出修改意见后，在原分支继续提交即可自动同步至 PR；
- PR 合并后，特性分支将被删除。

---

## 5. 版本发版机制与发布说明

本项目通过 GitHub Actions 实现了全自动化的软件供应链发版体系：

1. **自动归纳**：合并至 `main` 分支的提交由 `git-cliff` 自动按类型归类；
2. **触发发版**：当需要正式发布新版本时，仅需打上符合语义化版本规范的 Git Tag 并推送：
   ```bash
   git tag v1.0.1
   git push origin v1.0.1
   ```
3. **自动化双轨分发**：
   - **NPM 注册表**：利用 `NPM_TOKEN` 与 GitHub OIDC 原生签发不可篡改的 `--provenance` 软件供应链溯源凭证，自动发布 `@atengk/mcp-server-s3`；
   - **GitHub Release**：基于 `.cliff.toml` 动态生成增量 Release Notes，并挂载 `dist/` 单文件产物作为附件；
   - **GHCR Docker 镜像**：自动构建 `linux/amd64` 与 `linux/arm64` 双架构轻量容器镜像并发布至 `ghcr.io/atengk/mcp-server-s3`。
