---
description: SearchTaskContent — 全文搜索任务内容（README/progress/changes/next/memory）
agent: build
---

Full-content search inside OpenTask task memory files (slower than index search; read-only).

1. First call `task_find` with keyword = $ARGUMENTS to find candidate tasks. If none match, say so and stop.
2. Tell the user this is a slower full-content scan across task memory files.
3. Grep the keyword case-insensitively across the candidate tasks' `README.md`, `progress.md`, `changes.md`, `decisions.md`, `next.md`, `memory.md` (skip `archive`).
4. Report matches grouped by task and file, showing trimmed matching lines.
5. Read-only — never modify any file.