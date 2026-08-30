---
description: ProjectList — 列出最近五个项目供快速选择
agent: build
---

List recent OpenTask projects using the opentask skill workflow (SKILL.md at /Users/Admin/Documents/Task/OpenTask/SKILL.md).

1. Call the `projectlist` tool (no arguments).
2. Present the projects one per line as `seq. 标题（创建日期，状态，N 个任务）`.
3. Ask the user to pick one. When they choose, call `project_open` with the listed `path`.

$ARGUMENTS is ignored for this command.
