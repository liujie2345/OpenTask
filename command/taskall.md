---
description: TaskAll — 列出全部任务
agent: build
---

List all OpenTask tasks using the opentask skill workflow (SKILL.md at /Users/Admin/Documents/Task/OpenTask/SKILL.md).

1. Call the `taskall` tool (no arguments).
2. Present every returned task as `seq. 标题（创建日期，状态）`; if the list is long, group by status (进行中 / 暂停 / 已完成) instead of one flat list.
3. Ask the user to pick one by number or name. When they choose, call `task_open` with the listed `path` and follow the OpenTask flow.

$ARGUMENTS is ignored for this command.
