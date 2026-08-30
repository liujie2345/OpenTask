---
name: opentask
description: Task persistence workflow for OpenCode, backed by the opentask MCP server. Use when the user says CreateTask, OpenTask, ArchiveTask, RecordTask, SearchTask, TaskList, TaskAll, CreateProject, OpenProject, ProjectList, PauseTask, ResumeTask, LinkTask, KnowledgeAdd, KnowledgeSearch, 新建/继续/打开/完成/归档/暂停/恢复/搜索/关联/列出 task, 最近任务, 任务列表, 所有任务, 创建项目, 打开项目, 项目列表, 父子任务, 挂起任务, 查一下任务, 存入知识库, 查知识库, 记一条知识, 记一下, 保存当前进度, 更新进度, 设置记录密度, 打开或关闭自动追踪, asks what they were doing last time, mentions historical work under E:\Task\ or ~/Documents/Task, or wants a development task remembered across OpenCode conversations.
---

# OpenTask

Persist development-task context on disk so future OpenCode conversations can resume work by reading files instead of relying on chat memory.

**Runtime**: OpenTask is driven by the `opentask` MCP server (repo `server/`, registered in the opencode global config as `mcp.opentask`). The server owns every mechanical operation: config, the `tasks.json` index, `INDEX.md` rendering, task lifecycle transitions, log archival, and the knowledge base. The model writes prose files (`progress.md`, `changes.md`, `decisions.md`, `next.md`, `memory.md`) directly and calls server tools to keep state consistent. If the opentask tools are missing, tell the user to restart opencode and check the global config.

OpenTask stores all state under a task root, defaulting to `E:\Task` on Windows and `~/Documents/Task` on macOS/Linux. Each task is a directory named `YYYYMMDD-<name>` and contains:

```text
README.md     task card: goal, status, parent, tags, current focus, resume guide
progress.md   chronological progress log, append-only
changes.md    file-change ledger, append-only table
decisions.md  key decisions, append-only
next.md       next actions; rewrite as needed, preserving unresolved work
memory.md     key facts and learnings, deduplicated, bounded
archive       drafts, references, temporary material, archived log segments
```

A project is the same kind of directory but holds only `README.md`, `progress.md`, and `decisions.md` — project-level coordination files, no task working files. Its README carries `**类型**: 项目` and an auto-maintained task table between `<!-- opentask:children:auto -->` markers, listing member tasks and their statuses.

Global files at the task root:

```text
_config.json  active task, tracking settings, log archive threshold (managed by the server)
tasks.json    machine-readable task index: hierarchy, status, tags (managed by the server)
INDEX.md      human-readable index rendered from tasks.json (managed by the server)
_knowledge\   global knowledge base entries (KB-YYYYMMDD-<slug>.md)
```

## First Rule

Before any OpenTask command, call the `init` tool (or `config_get` if the root is already known). It ensures the task root exists — creating the directory and copying `_config.json` / `tasks.json` / `INDEX.md` from `templates/` on first use — and returns the effective config.

Resolve `task_root` in this order:

1. An explicit path the user gives in the current conversation takes precedence over everything. Pass it as the `root` parameter on every tool call while it applies.
2. A non-empty `task_root` in `_config.json` is used as-is.
3. An empty `task_root` (`""`, the template default) resolves at read time to the platform default — the server never writes the resolved path back:
   - Windows (`win32`): `E:\Task`
   - macOS / Linux: `$HOME/Documents/Task`

Config normalization is handled entirely by the server (v2 shape, `change_log_level` inference from `auto_track_changes`, legacy `E:\Task` rewrite on non-Windows). Do not hand-edit `_config.json`; use `config_get` / `config_set`.

## Task Index

- `tasks.json` is the single query source for tasks. It is maintained **exclusively by server tools** (`task_create`, `task_open`, `task_status`, `task_archive`, `task_link`, `task_refresh`) — never hand-edit it.
- `INDEX.md` is re-rendered by the server on every index write; never hand-edit it either.
- `status` is one of `active` (`🟡 进行中`), `paused` (`⏸ 暂停`), `done` (`✅ 已完成`). Hierarchy (`parent` / `children`) lives only in the index: the filesystem layout stays flat (`YYYYMMDD-*` directly under `task_root`). Index entries carry an optional `kind` (`task` default, `project`) — projects render in the `📁 项目` section of `INDEX.md` and are excluded from `tasklist` / `taskall` / `task_find` listings (use `projectlist` instead).
- Call `index_rebuild` when the index is missing or visibly stale (the server also auto-rebuilds on a stale version). It scans the task root, reads README fields (`**状态**`, `## 目标` first line, `**父任务**`, `**标签**`), and preserves known hierarchy where possible.

## Commands

Command-to-tool map:

| Command | MCP tools |
|---|---|
| CreateTask | `task_create`, `task_refresh` |
| OpenTask | `task_find`, `task_open` |
| RecordTask | `task_refresh`, `task_log_archive`, `knowledge_add` |
| ArchiveTask | `task_archive`, `knowledge_add` |
| PauseTask / ResumeTask | `task_status` |
| SearchTask | `task_find` |
| TaskList | `tasklist` |
| TaskAll | `taskall` |
| ProjectCreate | `project_create` |
| OpenProject | `project_open` |
| ProjectList | `projectlist` |
| LinkTask | `task_link` |
| KnowledgeAdd / KnowledgeSearch | `knowledge_add`, `knowledge_search` |
| Tracking Settings | `config_set` |

### CreateTask `<name> [tags...]`

Use for `CreateTask`, `新建 task`, `创建任务`, `开个任务`, or similar.

1. Require a user-provided name. If missing, ask for it. Optional space-separated tags (e.g. `CreateTask 部署脚本 infra deploy`) are passed through.
2. If projects exist, ask whether the task belongs to one; when the user names one, pass it as `project` (directory name or keyword). If the user wants a new project instead, create it first with ProjectCreate (asking what the project is mainly about).
3. Call `task_create` with `name`, `tags`, and `goal` if the user supplied one.
4. If the goal is still unknown, ask for a concise goal, then call `task_refresh` with the goal so README and index stay in sync.
5. Report the task path.

### OpenTask `[name-or-keyword]`

Use for `OpenTask`, `继续 task`, `打开任务`, `续接任务`, `接着上次`, or similar.

Without an argument:

1. Call `task_find` (no keyword) — the server returns the latest five tasks with goal and status.
2. Ask the user to choose; do not auto-open the newest task.

With an argument:

1. Call `task_open` with the directory name or keyword — the server sets the active task and returns the structured summary (README, memory, next, progress tail, recent changes, decisions).
2. If the task has children, summarize each child's goal and status.
3. If the task has a parent project, read the project README (goal, member tasks, coupling notes) and the project decisions for cross-task context before summarizing.
4. Present: goal, status/current focus, key facts, recent progress, recent changes, next actions.
5. Read more of `progress.md` / `changes.md` only when the tail is insufficient.
6. Ask whether to continue with the recorded plan or adjust it.

### RecordTask

Use for `RecordTask`, `记一下`, `记录一下`, `保存进度`, `更新进度`, `总结一下`, or similar.

1. If no task is active, ask the user to run `OpenTask` or `CreateTask` first.
2. Review the current conversation since the last RecordTask, or since this conversation began.
3. Append only real, observed work:
   - Progress goes to `progress.md` with a timestamp.
   - File changes go to `changes.md` (row format below); aggregate repeated edits to the same file into one final-state row.
   - Decisions go to `decisions.md` only when an actual decision was made.
4. Distill into `memory.md`: add key facts and learnings from this session, overwriting same-topic entries; keep the file bounded (~30 entries), merging or dropping the oldest low-value facts when over.
5. Update `next.md` with unresolved or newly identified next steps. It may be rewritten, but do not drop unfinished work.
6. If the task belongs to a project, also append project-level progress (milestones, cross-task impacts) to the project's `progress.md`, and record cross-task decisions with an `**影响**` field in the project's `decisions.md`.
7. Update `README.md` last-updated date and current focus when stale.
8. Call `task_refresh` with the task and any changed goal.
9. If a reusable pattern emerged (a tool installed/configured, a non-obvious setup, a hard-won solution), propose a knowledge-base entry to the user and call `knowledge_add` on confirmation — see Knowledge Base.
10. Call `task_log_archive` so the server moves entries over `log_archive_threshold` (default 500) into `archive/` by month.
11. Tell the user which files were updated and how many meaningful entries were added.

### ArchiveTask `[name-or-keyword]`

Use for `ArchiveTask`, `完成 task`, `归档任务`, `结束这个任务`, or similar.

1. Use the argument to find the task, or the active task when no argument is supplied.
2. If the task has children in the index, tell the user the children remain open and confirm before archiving the parent.
3. Call `task_archive` — the server marks the README `✅ 已完成` with a completion date, prepends `# 已完成（YYYY-MM-DD）` to `next.md`, appends an archive entry to `progress.md`, moves the index entry to `done`, and clears `active_task` if it was active.
4. If reusable patterns emerged, propose knowledge-base entries — see Knowledge Base.
5. Confirm completion to the user.

### PauseTask `[name-or-keyword]`

Use for `PauseTask`, `暂停 task`, `挂起任务`, `先放着`, or similar.

1. Use the argument to find the task, or the active task when no argument is supplied.
2. Call `task_status` with `status: "paused"` — the server updates the README (`⏸ 暂停` + pause date), moves the index entry, and clears `active_task` if it was active.
3. Confirm to the user.

### ResumeTask `[name-or-keyword]`

Use for `ResumeTask`, `恢复 task`, `继续暂停的任务`, or similar.

1. Use the argument to find the task. Without an argument, call `task_find` for paused tasks and ask the user to choose.
2. Call `task_status` with `status: "active"` — the server restores the README (`🟡 进行中`, refreshed date), moves the index entry back, and sets `active_task`.
3. Read `next.md` and `memory.md`, then confirm to the user with a summary.

### SearchTask `<keyword> [more keywords...]`

Use for `SearchTask`, `搜索任务`, `查一下任务`, `找找之前那个`, or similar.

1. Require at least one keyword; call `task_find` — the server matches against task `name`, `goal`, and `tags` in the index (exact directory name wins). No directory scanning.
2. Report matches grouped by status, showing directory name, goal, tags, and children count.
3. If nothing matches, say so and suggest `OpenTask` with a directory-name keyword instead.
4. If the user asks to search inside task memory files (README/progress/changes/decisions/next/memory), read the matching tasks' files directly — tell the user this is a slower full-content scan.
5. Read-only: never modify task files during a search.

### TaskList

Use for `TaskList`, `最近任务`, `任务列表`, `列出任务`, or similar — the user wants a quick pick list.

1. Call `tasklist` — the server returns the five most recent tasks (newest first) as `seq` / `title` / `path` / `created` / `status` / `is_active`.
2. Present the list as `seq. 标题（创建日期，状态）`, marking the active task. Keep it to one line per task.
3. Ask the user to pick one by number or name. When they choose, call `task_open` with the listed `path` and follow the OpenTask flow.
4. Read-only: do not open or modify anything until the user picks.

### TaskAll

Use for `TaskAll`, `所有任务`, `任务全列表`, `全部任务`, or similar — same presentation as TaskList but across the whole task root.

1. Call `taskall` — the server returns every task, newest first, in the same shape.
2. Present the list the same way; if it is long, group by status (进行中 / 暂停 / 已完成) instead of one flat list.
3. When the user picks one, call `task_open` with the listed `path` and follow the OpenTask flow.
4. Read-only: do not open or modify anything until the user picks.

### ProjectCreate `<name> [tags...]`

Use for `CreateProject`, `创建项目`, `新建项目`, `开个项目`, or similar — a long-lived container grouping related tasks (e.g. a game project with UI/gameplay tasks).

1. Require a name. Always ask what the project is mainly about — `project_create` requires a `goal`.
2. Call `project_create` with `name`, `goal`, and optional `tags`. The server creates a `YYYYMMDD-<name>` directory with README/progress/decisions templates and a `kind: project` index entry; `active_task` is not changed.
3. Report the project path and suggest adding tasks via `CreateTask` (with the project) or `LinkTask`.

### OpenProject `<name-or-keyword>`

Use for `OpenProject`, `打开项目`, `看下项目`, or similar.

1. Without an argument, call `projectlist` and ask the user to choose. With an argument, call `project_open` with the directory name or keyword.
2. Present: project goal, each member task's status (the README task table), and the summary (README, progress tail, decisions). Read-only — `active_task` is unchanged.
3. When working on one of its tasks afterwards, treat the project README/decisions as cross-task context: check interface agreements and coupling notes before changing shared behavior.

### ProjectList

Use for `ProjectList`, `项目列表`, `最近项目`, or similar — quick pick list of projects, same style as TaskList.

1. Call `projectlist` — the server returns the five most recent projects (newest first) with `seq` / `title` / `path` / `created` / `status` / `tasks` count.
2. Present one per line as `seq. 标题（创建日期，状态，N 个任务）`.
3. When the user picks one, call `project_open` with the listed `path`.
4. Read-only: do not open or modify anything until the user picks.

### LinkTask `<parent-name> <child-name>`

Use for `LinkTask`, `建立父子任务`, `把 task 挂到`, or similar.

1. Resolve both names (exact directory name first, then substring). If either is ambiguous or missing, list choices.
2. Call `task_link` — the server writes `parent`/`children` in the index and the `**父任务**` line in the child README.
3. Confirm. Hierarchy is display-only: tasks stay flat on disk and keep their own status/lifecycle. Opening a parent shows its children; archiving a parent asks about open children first.

### KnowledgeAdd `<title> [tags...]`

Use for `KnowledgeAdd`, `存入知识库`, `记一条知识`, `沉淀经验`, or similar.

1. Require a title; if missing, ask for it.
2. Draft the body from the current conversation with sections `## 场景`, `## 步骤`, `## 命令`, `## 注意事项`.
3. Call `knowledge_add` with `title`, `tags`, `body`. The server writes `_knowledge\KB-YYYYMMDD-<slug>.md` (dedupe by title: updates the existing entry) and records `source_task` from the active task.
4. Confirm and give the entry path.

### KnowledgeSearch `<keyword> [more keywords...]`

Use for `KnowledgeSearch`, `查知识库`, or similar.

1. Require at least one keyword; call `knowledge_search`.
2. Report matching entries: title, tags, source_task, and the matching line (trimmed).
3. If no matches, say so. Read-only.

### Tracking Settings

Use for `设置记录密度`, `记详细点`, `只记阶段进度`, `别每步都记`, `打开自动追踪`, `关闭自动追踪`, or similar.

Call `config_set` with fields by intent:

```text
记详细点 / 每步都记        -> auto_track_changes=true,  change_log_level=step
只记阶段进度 / 别每步都记 -> auto_track_changes=true,  change_log_level=feature
关闭自动追踪 / 手动记     -> auto_track_changes=false, change_log_level=manual
打开自动追踪              -> auto_track_changes=true; if manual, promote to feature
```

Confirm the new behavior in one sentence.

## Change Tracking

Always use this row format in `changes.md`:

```markdown
| YYYY-MM-DD HH:MM | <absolute path> | <新增|修改|删除> | <brief reason> |
```

Apply tracking only to user/project work. Do not recursively log OpenTask bookkeeping edits to `_config.json`, `tasks.json`, `INDEX.md`, or task memory files unless the user explicitly asks to track those files as project changes.

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

If the first user message in a conversation asks about previous work, last time, yesterday, continuing a task, or names the task root (`E:\Task` on Windows, `~/Documents/Task` on macOS/Linux), perform OpenTask self-check:

1. Call `init` (or `config_get`).
2. If `active_task` exists, read its README, `memory.md`, and `next.md`, then summarize current state.
3. If no task is active, call `task_find` (latest five) for selection.

Do not start this flow when the user is not talking about tasks.

## Knowledge Base

`_knowledge\` at the task root accumulates reusable experience across tasks. Entries are plain markdown, hand-editable:

```markdown
---
title: GitHub MCP 安装配置
tags: [github, mcp, setup]
source_task: 20260824-xxx
created: 2026-08-24
---

## 场景
## 步骤
## 命令
## 注意事项
```

Entry lifecycle:

- Suggested during `RecordTask` / `ArchiveTask` when a reusable pattern appears (a tool installed and configured, a non-obvious setup, a hard-won solution). Write only on user confirmation — never silently.
- Added directly via `KnowledgeAdd` (`knowledge_add`).
- Searched via `KnowledgeSearch` (`knowledge_search`).
- Keep entries actionable and specific; skip one-off trivia. Entries may be edited or deleted by the user at any time.

## Templates

`templates/` are bundled resources copied by the server — the model never edits them:

| Template | Destination | Notes |
|---|---|---|
| `README.md` | task directory | `{{TASK_ID}}`, `{{TASK_NAME}}`, `{{CREATED_DATE}}`, `{{GOAL}}`; maintain `**父任务**` / `**标签**` |
| `progress.md` | task directory | `{{CREATED_DATE}}` |
| `changes.md` | task directory | Table header only |
| `decisions.md` | task directory | Decision format guide |
| `next.md` | task directory | Starting plan structure |
| `memory.md` | task directory | Key-facts template |
| `PROJECT_README.md` | project directory | Same placeholders plus `**类型**: 项目` and the auto task-table markers |
| `PROJECT_PROGRESS.md` | project directory | Project-level milestone log |
| `PROJECT_DECISIONS.md` | project directory | Decision format with `**影响**` field |
| `_config.json` | task root | Copy only when missing |
| `tasks.json` | task root | Copy only when missing |
| `INDEX.md` | task root | Copy only when missing |

## Guardrails

- Index and config mutations go through MCP tools only — never hand-edit `tasks.json`, `INDEX.md`, or `_config.json`.
- Use absolute paths for task-file operations.
- Preserve history: append to `progress.md`, `changes.md`, and `decisions.md`; never rewrite old entries except to fix formatting when explicitly requested.
- Do not invent progress, changes, or decisions.
- Do not auto-open a task when plain `OpenTask` has multiple possible tasks; ask the user to choose.
- Do not create task directories outside the configured `task_root`.
- Keep task records concise; record facts and next actions, not full chat transcripts.
- If the opentask MCP tools are unavailable, do not improvise file operations: tell the user to restart opencode and verify `mcp.opentask` in the global config.