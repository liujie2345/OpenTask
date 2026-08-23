---
name: opentask
description: Task persistence workflow for OpenCode. Use when the user says CreateTask, OpenTask, ArchiveTask, RecordTask, 新建/继续/打开/完成/归档 task, 记一下, 保存当前进度, 更新进度, 设置记录密度, 打开或关闭自动追踪, asks what they were doing last time, mentions historical work under E:\Task\, or wants a development task remembered across OpenCode conversations.
---

# OpenTask

Persist development-task context on disk so future OpenCode conversations can resume work by reading files instead of relying on chat memory.

OpenTask stores all state under a task root, defaulting to `E:\Task`. Each task is a directory named `YYYYMMDD-<name>` and contains:

```text
README.md     task card: goal, status, current focus, resume guide
progress.md   chronological progress log, append-only
changes.md    file-change ledger, append-only table
decisions.md  key decisions, append-only
next.md       next actions; rewrite as needed, preserving unresolved work
archive\      drafts, references, temporary material
```

Global files at the task root:

```text
_config.json  active task and tracking settings
INDEX.md      task index grouped by status
```

## First Rule

Before any OpenTask command, read `<task_root>\_config.json`. If it does not exist, create `E:\Task`, copy `templates/_config.json` and `templates/INDEX.md` into it, then read the config. Use `task_root` from config after that, unless the user explicitly changes it.

Normalize old config files:

```json
{
  "task_root": "E:\\Task",
  "active_task": "",
  "auto_track_changes": true,
  "change_log_level": "feature",
  "auto_update_progress": true
}
```

If `change_log_level` is missing, infer it from `auto_track_changes`: `true` means `feature`, `false` means `manual`. Add the missing field the next time the config is written.

## Commands

### CreateTask `<name>`

Use for `CreateTask`, `新建 task`, `创建任务`, `开个任务`, or similar.

1. Require a user-provided name. If missing, ask for it.
2. Read config.
3. Create a task directory under `task_root` named `YYYYMMDD-<name>`, using the local current date. If it already exists, append `-2`, `-3`, etc.
4. Create `archive\`.
5. Copy the five task templates from `templates/`: `README.md`, `progress.md`, `changes.md`, `decisions.md`, `next.md`.
6. Replace placeholders:
   - `{{TASK_ID}}`: full directory name
   - `{{TASK_NAME}}`: user-provided name
   - `{{CREATED_DATE}}`: local date, `YYYY-MM-DD`
   - `{{GOAL}}`: use `<待补充>` if the user has not supplied a goal yet
7. Update `_config.json.active_task` to the new directory name.
8. Add the task to the `🟡 进行中` section in `INDEX.md` and update the index timestamp.
9. Report the task path. If the goal is still unknown, ask for a concise goal and, after the user answers, write it into `README.md`.

### OpenTask `[name-or-keyword]`

Use for `OpenTask`, `继续 task`, `打开任务`, `续接任务`, `接着上次`, or similar.

Without an argument:

1. Read config.
2. Scan `task_root` for directories matching `YYYYMMDD-*`.
3. Sort by the first eight date digits descending and list the latest five.
4. Show each task's directory name, README goal first line, and status.
5. Ask the user to choose; do not auto-open the newest task.

With an argument:

1. Read config.
2. Match a task directory by exact directory name first, then case-insensitive substring.
3. If one match exists, open it. If multiple matches exist, list choices. If none exists, say so and suggest `CreateTask` or plain `OpenTask`.
4. Set `_config.json.active_task` to the selected directory.
5. Read, in order: `README.md`, `next.md`, the end of `progress.md`, recent rows of `changes.md`, and `decisions.md` only when needed.
6. Summarize for the user: goal, status/current focus, recent progress, recent changes, next actions.
7. Ask whether to continue with the recorded plan or adjust it.

### RecordTask

Use for `RecordTask`, `记一下`, `记录一下`, `保存进度`, `更新进度`, `总结一下`, or similar.

1. Read config and require a non-empty `active_task`. If none exists, ask the user to run `OpenTask` or `CreateTask`.
2. Review the current conversation since the last RecordTask, or since this conversation began.
3. Append only real, observed work:
   - Progress goes to `progress.md` with a timestamp.
   - File changes go to `changes.md`; aggregate repeated edits to the same file into one final-state row.
   - Decisions go to `decisions.md` only when an actual decision was made.
4. Update `next.md` with unresolved or newly identified next steps. It may be rewritten, but do not drop unfinished work.
5. Update `README.md` last-updated date and current focus when stale.
6. Tell the user which files were updated and how many meaningful entries were added.

### ArchiveTask `[name-or-keyword]`

Use for `ArchiveTask`, `完成 task`, `归档任务`, `结束这个任务`, or similar.

1. Read config.
2. Use the argument to find a task, or use `active_task` when no argument is supplied.
3. Change the task README status from `🟡 进行中` to `✅ 已完成` and add a completion date.
4. Add `# 已完成（YYYY-MM-DD）` at the top of `next.md`.
5. Append an archive entry to `progress.md`.
6. Move the task entry in `INDEX.md` from `🟡 进行中` to `✅ 已完成`.
7. If the archived task is active, set `_config.json.active_task` to `""`.
8. Do not move the task directory.
9. Confirm completion to the user.

### Tracking Settings

Use for `设置记录密度`, `记详细点`, `只记阶段进度`, `别每步都记`, `打开自动追踪`, `关闭自动追踪`, or similar.

After reading config, update fields by intent:

```text
记详细点 / 每步都记        -> auto_track_changes=true,  change_log_level=step
只记阶段进度 / 别每步都记 -> auto_track_changes=true,  change_log_level=feature
关闭自动追踪 / 手动记     -> auto_track_changes=false, change_log_level=manual
打开自动追踪              -> auto_track_changes=true; if manual, promote to feature
```

Write the config and confirm the new behavior in one sentence.

## Change Tracking

Always use this row format in `changes.md`:

```markdown
| YYYY-MM-DD HH:MM | <absolute path> | <新增|修改|删除> | <brief reason> |
```

Apply tracking only to user/project work. Do not recursively log OpenTask bookkeeping edits to `_config.json`, `INDEX.md`, or task memory files unless the user explicitly asks to track those files as project changes.

Respect `change_log_level`:

- `step`: after each meaningful file edit, append a row immediately.
- `feature`: remember touched files during the phase, then append aggregated rows when a feature, bug fix, design decision, RecordTask, or work segment completes.
- `manual`: do not auto-write `changes.md`; only write it during `RecordTask` or explicit user recording.

If `active_task` is empty, do not write task files. Briefly tell the user the change was not recorded because no task is active.

## Progress Tracking

When `auto_update_progress=true`, append to `progress.md` after meaningful milestones:

- a feature/module is completed
- a bug is fixed
- a design or technical decision is made
- a multi-turn blockage is resolved

Do not record routine questions, pure discussion, or every small edit as progress.

## Session Start

If the first user message in a conversation asks about previous work, last time, yesterday, continuing a task, or names `E:\Task`, perform OpenTask self-check:

1. Read config.
2. If `active_task` exists, read its README and `next.md`, then summarize current state.
3. If no task is active, list the latest five tasks for selection.

Do not start this flow when the user is not talking about tasks.

## Templates

Use `templates/` as bundled resources:

| Template | Destination | Notes |
|---|---|---|
| `README.md` | task directory | Replace `{{TASK_ID}}`, `{{TASK_NAME}}`, `{{CREATED_DATE}}`, `{{GOAL}}` |
| `progress.md` | task directory | Replace `{{CREATED_DATE}}` |
| `changes.md` | task directory | Table header only |
| `decisions.md` | task directory | Decision format guide |
| `next.md` | task directory | Starting plan structure |
| `_config.json` | task root | Copy only when missing |
| `INDEX.md` | task root | Copy only when missing |

## Guardrails

- Use absolute paths for task-file operations.
- Preserve history: append to `progress.md`, `changes.md`, and `decisions.md`; never rewrite old entries except to fix formatting when explicitly requested.
- Do not invent progress, changes, or decisions.
- Do not auto-open a task when plain `OpenTask` has multiple possible tasks; ask the user to choose.
- Do not create task directories outside configured `task_root`.
- Keep task records concise; record facts and next actions, not full chat transcripts.
