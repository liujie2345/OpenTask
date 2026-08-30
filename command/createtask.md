---
description: CreateTask — 新建一个开发任务
agent: build
---

Create a new OpenTask task using the opentask skill workflow (SKILL.md at /Users/Admin/Documents/Task/OpenTask/SKILL.md).

1. Parse $ARGUMENTS for the task name, optional space-separated tags, and goal (e.g. "部署脚本 infra deploy" → name=部署脚本, tags=[infra, deploy]).
2. Call `task_create` with name, tags, and goal if provided.
3. If the goal is unknown, ask the user for a concise goal, then call `task_refresh` with it so README and index stay in sync.
4. Report the task path and confirm it is now active.