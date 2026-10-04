# 问题追踪器：GitHub

本项目的问题跟踪与技术规范统一使用 GitHub Issues，并通过 `gh` 命令行工具进行所有操作。

## 常用操作规范

- **创建 Issue**：`gh issue create --title "..." --body "..."`
- **查看 Issue**：`gh issue view <编号> --comments`（配合 `jq` 过滤评论并提取标签）
- **列出 Issue**：`gh issue list --state open --json number,title,body,labels,comments`
- **评论 Issue**：`gh issue comment <编号> --body "..."`
- **添加/移除标签**：`gh issue edit <编号> --add-label "..."` / `--remove-label "..."`
- **关闭 Issue**：`gh issue close <编号> --comment "..."`

仓库上下文可自动通过当前工作区的 `git remote -v` 解析。

## Pull Request 作为分流入口

**将 PR 作为需求来源：否**。（若项目未来需要将外部贡献者的 PR 作为功能需求纳入分流，可在此改为 `是`；`/triage` 技能会读取此标识）

## 技能协作契约

- 当技能指明 **“发布到问题追踪器 (publish to the issue tracker)”** 时：创建一个 GitHub Issue。
- 当技能指明 **“获取关联工单 (fetch the relevant ticket)”** 时：执行 `gh issue view <编号> --comments`。

## 路线图与任务编排规范 (Wayfinding)

供 `/wayfinder` 技能调度：以单一 Issue 作为**全景图 (Map)**，关联的子 Issue 作为任务工单。

- **全景图 (Map)**：单个标记为 `wayfinder:map` 的 Issue，包含核心备忘、已决决策与待定迷雾。`gh issue create --label wayfinder:map`。
- **子任务工单 (Child ticket)**：通过 GitHub sub-issue 关联至 Map，或在 Map 正文任务列表引用并在子工单顶部标注 `Part of #<map>`。标签格式为 `wayfinder:<type>`（如 `research` / `prototype` / `grilling` / `task`）。
- **依赖阻塞机制**：优先使用 GitHub 原生 issue dependencies API（`gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`），或在工单正文顶部声明 `Blocked by: #<n>`。
- **前沿就绪查询**：查询 Map 下所有无阻塞且未被领取的开放工单。
- **认领任务**：执行 `gh issue edit <n> --add-assignee @me`。
- **闭环归档**：在工单中留言评论后执行 `gh issue close <n>`，并将决策要点回填至 Map 的 Decisions 区块。
