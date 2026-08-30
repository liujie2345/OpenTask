---
description: SearchTask — 按名称/目标/标签搜索任务（索引秒查）
agent: build
---

Search the OpenTask index using the opentask skill workflow (SKILL.md at /Users/Admin/Documents/Task/OpenTask/SKILL.md).

1. Call `task_find` with keyword = $ARGUMENTS. Without a keyword, list the latest five tasks by creation date.
2. Report matches grouped by status: directory name, goal, tags, children count.
3. If nothing matches, say so and suggest `OpenTask` with a directory-name keyword instead.
4. Read-only — never modify task files during a search.