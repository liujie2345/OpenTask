---
description: CreateProject — 创建一个项目容器（含 README/progress/decisions）
agent: build
---

Create a new OpenTask project using the opentask skill workflow (SKILL.md at /Users/Admin/Documents/Task/OpenTask/SKILL.md).

1. Require a project name ($ARGUMENTS when provided). Always ask what the project is mainly about — the goal is required.
2. Call `project_create` with `name`, `goal`, and optional `tags`.
3. Report the project path and suggest adding tasks via CreateTask (with the project) or LinkTask.
