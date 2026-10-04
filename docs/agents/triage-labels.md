# 分流标签规范 (Triage Labels)

技能体系采用五个标准的分流角色。此映射表记录了本仓库问题追踪器中对应的真实标签字符串：

| 技能内置角色 | 仓库实际标签 | 业务含义 |
| :--- | :--- | :--- |
| `needs-triage` | `needs-triage` | 待维护者评估与分流 |
| `needs-info` | `needs-info` | 等待提交者补充更多信息 |
| `ready-for-agent` | `ready-for-agent` | 需求已明确，可由自主 Agent 执行 |
| `ready-for-human` | `ready-for-human` | 需由人工工程师实现或决策 |
| `wontfix` | `wontfix` | 经评估不予处理/关闭 |

当技能指明角色（例如“应用可由 Agent 执行标签”）时，使用本表中右侧对应的标签字符串。

如需调整项目使用的标签命名，直接修改本表右侧列即可。
