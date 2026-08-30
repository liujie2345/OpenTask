---
description: OpenProject — 打开项目查看目标、成员任务与项目级上下文
agent: build
---

Open an OpenTask project using the opentask skill workflow (SKILL.md at /Users/Admin/Documents/Task/OpenTask/SKILL.md).

1. With $ARGUMENTS, call `project_open` with it; without, call `projectlist` and ask the user to choose.
2. Present the project goal, member task statuses, and the summary (README with auto task table, progress tail, decisions).
3. Read-only: active_task is unchanged. Note cross-task coupling/decisions relevant to ongoing work.
