<div align="center">

# 📌 OpenTask

**Persistent task memory for AI coding agents — as an MCP server + OpenCode skill**

[![Node](https://img.shields.io/badge/node-%E2%89%A518-green)](https://nodejs.org)
[![OpenCode](https://img.shields.io/badge/for-OpenCode-blue)](https://opencode.ai)
[![MCP](https://img.shields.io/badge/protocol-MCP-purple)](https://modelcontextprotocol.io)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow)](LICENSE)
[![Version](https://img.shields.io/badge/version-0.2.0-orange)]()

*New session? Your agent reads a few files and picks up exactly where it left off — no chat memory required.*

**English** | [简体中文](README.zh-CN.md)

</div>

---

## What is OpenTask?

OpenTask is a **task-persistence system for AI coding agents**. It stores every dev task's goal, progress, file changes, decisions and next steps as plain markdown on disk, with an MCP server managing the index and lifecycle. In any new conversation, the agent reads a few files and resumes work with full context.

**Core capabilities:**

| Capability | What it does |
|---|---|
| 🗂 **Task lifecycle** | Create / open / pause / resume / archive tasks — README and index stay in sync automatically |
| 📁 **Projects** *(new in v0.2.0)* | Group related tasks (e.g. UI, gameplay) under one project; the agent reads cross-task coupling notes and shared decisions before touching common code |
| 🔍 **Instant search** | Keyword queries over a `tasks.json` index — no directory scanning |
| 🧠 **Knowledge base** | Turn hard-won fixes into reusable, searchable entries (`_knowledge/`) |
| 📝 **Layered memory** | `progress / changes / decisions / next / memory` files, each with a clear job, auto-archived monthly |
| 🔌 **Standard stdio MCP** | 19 tools, works with any MCP client — mechanics handled by the server, the model only writes prose |

## Quick Start

### 1️⃣ Clone & build

```bash
git clone https://github.com/liujie2345/OpenTask.git
cd OpenTask/server
npm install && npm run build
```

### 2️⃣ Register the MCP server

Edit your OpenCode global config `~/.config/opencode/opencode.jsonc`:

```jsonc
{
  "mcp": {
    "opentask": {
      "type": "local",
      "command": ["node", "/path/to/OpenTask/server/dist/index.js"],
      "enabled": true
    }
  }
}
```

> Replace `/path/to/OpenTask` with your actual clone path. Restart OpenCode and the `opentask` tools are live.

### 3️⃣ Register the skill (teaches the agent the workflows)

In the same config, add the repo path to skills:

```jsonc
{
  "skills": {
    "paths": ["/path/to/OpenTask"]
  }
}
```

The repo-root [`SKILL.md`](SKILL.md) defines the full command workflows: when you say things like *"create a task"* or *"continue where I left off"*, the agent knows which tools to call and in what order.

### 4️⃣ (Optional) Slash commands

Copy the bundled command templates into your OpenCode config:

```bash
cp command/*.md ~/.config/opencode/command/   # macOS / Linux
```

Restart OpenCode, type `/`, and you'll see `/createtask`, `/opentask`, `/recordtask`, `/tasklist`, `/createproject`…

### 🔌 Other MCP clients

OpenTask is a standard stdio MCP server — any MCP client works (the skill workflows are an OpenCode bonus, the tools themselves are universal):

```bash
# Claude Code
claude mcp add opentask -- node /path/to/OpenTask/server/dist/index.js
```

```jsonc
// Claude Desktop / Cursor (mcp.json)
{
  "mcpServers": {
    "opentask": {
      "command": "node",
      "args": ["/path/to/OpenTask/server/dist/index.js"]
    }
  }
}
```

---

## Commands

Natural-language triggers and slash commands are equivalent — the agent routes automatically:

| Command | Trigger examples | What it does |
|---|---|---|
| `CreateTask` | "新建任务 / CreateTask deploy-script" | Create a `YYYYMMDD-<name>` directory, fill six templates, set as active task |
| `OpenTask` | "continue last time / 打开任务" | Load the task summary (goal / memory / progress / next steps) and resume |
| `RecordTask` | "log this / 记一下" | Distill the conversation into progress / changes / decisions / memory / next |
| `ArchiveTask` | "finish task / 归档" | Mark done, seal `next.md`, archive logs, clear active state |
| `PauseTask` / `ResumeTask` | "put it aside / 恢复任务" | Pause or resume, status synced everywhere |
| `SearchTask` | "find that task about…" | Keyword search over the index (name / goal / tags) |
| `TaskList` / `TaskAll` | "recent tasks / all tasks" | Quick pick list: title + created date + status; pick one to open |
| `LinkTask` | "put B under A" | Build task-parent hierarchy |
| 🆕 `CreateProject` | "创建项目 / create a project" | Project container (README / progress / decisions); asks for the project goal |
| 🆕 `OpenProject` | "打开项目 / open project" | Project goal, member task statuses, cross-task decisions |
| 🆕 `ProjectList` | "项目列表 / project list" | Recent projects with task counts |
| `KnowledgeAdd` / `KnowledgeSearch` | "save to KB / 查知识库" | Store and retrieve reusable experience |

## Directory Layout

```
TaskRoot/                     # default ~/Documents/Task (Windows: E:\Task)
├── _config.json              # active task, tracking settings (server-managed)
├── tasks.json                # index: hierarchy / status / tags / kind (server-managed)
├── INDEX.md                  # human-readable index incl. 📁 Projects section (server-rendered)
├── _knowledge/               # global knowledge base
│
├── 20260828-roblox-tools/    # a regular task
│   ├── README.md             # task card: goal / status / focus / resume guide
│   ├── progress.md           # chronological log (append-only)
│   ├── changes.md            # file-change ledger
│   ├── decisions.md          # key decisions
│   ├── next.md               # next actions
│   ├── memory.md             # key facts & learnings
│   └── archive/              # drafts, references
│
└── 20260830-game-dev/        # a project (v0.2.0)
    ├── README.md             # project goal + auto-maintained member task table
    ├── progress.md           # project-level milestones
    └── decisions.md          # cross-task decisions (with "impact" field)
```

Tasks and projects **stay flat on disk** — hierarchy lives only in the index. No nested directories, paths are always guessable.

## Typical Workflows

**Build a game as one project with several tasks**

```
You: create a project "game-dev" — it's a 2D platformer
AI:  project_create → project created, goal recorded

You: new task "ui-development", put it in game-dev
AI:  task_create(project=…) → task attached; the project README's
     task table updates in real time

You: continue that task
AI:  task_open loads the task summary + the project's coupling notes
     and shared decisions, checks shared interfaces before touching them

You: log progress
AI:  task-level detail goes into task files; milestones and cross-task
     impacts also go into the project's progress.md / decisions.md
```

**Coming back a week later**

```
You: what was I working on?
AI:  reads the active task's README + memory.md + next.md,
     summarizes the state in three lines, asks: continue as planned?
```

## Design Principles

- **Server owns mechanics, model owns prose** — index, state machine, rendering all go through MCP tools; no hand-edited JSON inconsistencies
- **Files are the truth** — every state is `cat`-able, `grep`-able, git-friendly; no database
- **Append-only history** — progress / changes / decisions are never rewritten, preserving the decision chain
- **Backwards compatible** — legacy data migrates automatically; `index_rebuild` can reconstruct the whole index from READMEs

## Repo Structure

```
OpenTask/
├── SKILL.md        # OpenCode skill: command workflow definitions (the agent reads this)
├── command/        # slash command templates → ~/.config/opencode/command/
├── templates/      # task/project file templates with placeholders (server fills them)
└── server/         # opentask-mcp: TypeScript MCP server (19 tools)
```

---

<div align="center">

*AI writes your code — don't let it lose its memory.*

</div>
