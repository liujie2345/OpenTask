---
description: RecordTask — 记录/更新当前任务的进度、变更与记忆
agent: build
---

Run the OpenTask RecordTask flow (SKILL.md at /Users/Admin/Documents/Task/OpenTask/SKILL.md) for the active task.

1. Call `config_get` to confirm an active task exists; if none, ask the user to open or create one first.
2. Review the conversation since the last RecordTask (or since this conversation began).
3. Append only real, observed work:
   - Progress → `progress.md` with a timestamp
   - File changes → `changes.md` rows (`| YYYY-MM-DD HH:MM | <absolute path> | <新增|修改|删除> | <reason> |`), aggregating repeated edits to one final-state row
   - Decisions → `decisions.md` only when a real decision was made
4. Distill key facts and learnings into `memory.md` (dedupe by topic, keep bounded ~30 entries).
5. Update `next.md` with unresolved/new next steps; never drop unfinished work.
6. Call `task_refresh` (goal / updated date) and `task_log_archive` (rolling archive over threshold).
7. If a reusable pattern emerged, propose a `knowledge_add` entry and write it only on user confirmation.
8. Tell the user which files were updated and how many meaningful entries were added.