---
description: TaskList — 列出最近五条任务供快速选择
agent: build
---

List recent OpenTask tasks using the opentask skill workflow (SKILL.md at /Users/Admin/Documents/Task/OpenTask/SKILL.md).

1. Call the `tasklist` tool (no arguments).
2. Present the returned tasks one per line as `seq. 标题（创建日期，状态）`, marking which one is the active task.
3. Ask the user to pick one by number or name. When they choose, call `task_open` with the listed `path` and follow the OpenTask flow.

$ARGUMENTS is ignored for this command.
