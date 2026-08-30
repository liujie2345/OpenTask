<div align="center">

# 📌 OpenTask

**让 OpenCode 跨会话记住你的开发任务 — MCP 驱动的任务持久化系统**

[![Node](https://img.shields.io/badge/node-%E2%89%A518-green)](https://nodejs.org)
[![OpenCode](https://img.shields.io/badge/for-OpenCode-blue)](https://opencode.ai)
[![MCP](https://img.shields.io/badge/protocol-MCP-purple)](https://modelcontextprotocol.io)
[![Version](https://img.shields.io/badge/version-0.2.0-orange)]()

*下次打开新对话，AI 读文件就能续接工作，而不是靠聊天记录的记忆。*

</div>

---

## English TL;DR

**OpenTask** is a task-persistence system for AI coding agents, shipped as an **MCP server + OpenCode skill**. It stores every dev task's goal, progress, file changes, decisions and next steps as plain markdown on disk, so any new agent session resumes work instantly — no chat memory required.

- 🗂 **Task lifecycle** — create / open / pause / resume / archive, with a JSON index kept in sync automatically
- 📁 **Projects** — group related tasks; the agent reads cross-task coupling notes and shared decisions before touching common code
- 🧠 **Knowledge base** — turn hard-won fixes into reusable, searchable entries
- 🔍 **Instant search** — keyword queries over the index, no directory scanning
- 📝 **Layered memory** — progress / changes / decisions / next / memory files with automatic monthly archiving
- 🔌 **Standard stdio MCP** — works with OpenCode, Claude Code, Claude Desktop, Cursor, or any MCP client

## 这是什么

OpenTask 是一套给 [OpenCode](https://opencode.ai) 用的**开发任务记忆系统**。它把每个任务的目标、进度、改动、决策、下一步全部落盘成结构化文件，并配一个 MCP 服务器管理索引与生命周期。AI 在任何新对话里读几个文件，就能恢复完整上下文继续干活。

核心能力一览：

| 能力 | 说明 |
|---|---|
| 🗂 **任务生命周期** | 创建 / 打开 / 暂停 / 恢复 / 归档任务，状态自动同步 README 与索引 |
| 📁 **项目容器**（v0.2.0 新增） | 把多个相关任务（如 UI 开发、gameplay）收进一个项目，AI 做任务时会自动参考项目级的耦合备忘与跨任务决策 |
| 🔍 **秒级检索** | 基于 `tasks.json` 索引的关键词搜索、最近任务、全量列表，不做目录扫描 |
| 🧠 **知识库** | 把踩坑经验沉淀为可复用的知识条目（`_knowledge/`），跨任务复用 |
| 📝 **记忆分层** | `progress / changes / decisions / next / memory` 五类文件各司其职，日志自动按月归档 |
| 🔌 **纯 MCP** | 19 个工具全部走 Model Context Protocol，机械操作由服务器保证一致性，模型只写散文 |

---

## 快速开始（关联到 OpenCode）

### 1️⃣ 克隆并构建

```bash
git clone https://github.com/liujie2345/OpenTask.git
cd OpenTask/server
npm install && npm run build
```

### 2️⃣ 注册 MCP 服务器

编辑 OpenCode 全局配置 `~/.config/opencode/opencode.jsonc`（Windows 为 `%USERPROFILE%\.config\opencode\opencode.jsonc`），加入：

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

> 把 `/path/to/OpenTask` 换成你的实际克隆路径。重启 OpenCode 后，`opentask` 工具即可用。

### 3️⃣ 注册 Skill（教 AI 怎么用这些工具）

在同一个配置文件里把本仓库路径加入 skills：

```jsonc
{
  "skills": {
    "paths": ["/path/to/OpenTask"]
  }
}
```

仓库根目录的 [`SKILL.md`](SKILL.md) 定义了完整的命令工作流：AI 看到你说"新建任务"、"继续上次的"、"记一下进度"等触发词，就会按 Skill 里的流程调用正确的工具组合。

### 4️⃣（可选）安装 Slash 命令

把仓库工作流封装成快捷命令，复制到 OpenCode 命令目录即可：

```bash
# 把本项目适配过的命令模板拷进你的 OpenCode 配置
cp command/*.md ~/.config/opencode/command/   # macOS / Linux
```

重启 OpenCode，输入 `/` 就能看到：`/createtask`、`/opentask`、`/recordtask`、`/tasklist`、`/createproject`……

### 🔌 在其他 MCP 客户端中使用

OpenTask 是标准 stdio MCP 服务器，任何 MCP 客户端都能直接挂载（Skill 工作流是 OpenCode 特色的加分项，工具本身通用）：

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

## 命令一览

自然语言触发词和 slash 命令等价，AI 会自动路由：

| 命令 | 触发词示例 | 做什么 |
|---|---|---|
| `CreateTask` | "新建任务 / CreateTask 部署脚本" | 创建 `YYYYMMDD-名称` 任务目录，填充六份模板，设为活动任务 |
| `OpenTask` | "继续上次 / 打开任务" | 读取任务摘要（目标/记忆/进度/下一步），无缝续接 |
| `RecordTask` | "记一下 / 保存进度" | 把本轮对话的工作沉淀进 progress / changes / decisions / memory / next |
| `ArchiveTask` | "完成任务 / 归档" | 标记完成、封存 next.md、归档日志、清理活动状态 |
| `PauseTask` / `ResumeTask` | "先放着 / 恢复任务" | 暂停或恢复任务，状态全链路同步 |
| `SearchTask` | "查一下之前那个" | 关键词搜任务索引（名称/目标/标签） |
| `TaskList` / `TaskAll` | "最近任务 / 所有任务" | 快速选择列表：标题 + 创建时间 + 状态，选中即打开 |
| `LinkTask` | "把 B 挂到 A 下面" | 建立任务父子层级 |
| 🆕 `CreateProject` | "创建项目" | 建项目容器（README / progress / decisions），询问项目目标 |
| 🆕 `OpenProject` | "打开项目" | 查看项目目标、成员任务状态、跨任务决策 |
| 🆕 `ProjectList` | "项目列表" | 最近项目选择列表（含任务数量） |
| `KnowledgeAdd` / `KnowledgeSearch` | "存入知识库 / 查知识库" | 沉淀与检索可复用经验 |

---

## 目录结构

```
TaskRoot/                     # 默认 ~/Documents/Task（Windows: E:\Task）
├── _config.json              # 活动任务、追踪设置（服务器管理）
├── tasks.json                # 任务索引：层级/状态/标签/类型（服务器管理）
├── INDEX.md                  # 人类可读索引，含 📁 项目 区段（服务器渲染）
├── _knowledge/               # 全局知识库
│
├── 20260828-roblox工具开发/   # 普通任务
│   ├── README.md             # 任务卡：目标/状态/当前焦点/续接指引
│   ├── progress.md           # 进度日志（仅追加）
│   ├── changes.md            # 文件改动台账
│   ├── decisions.md          # 关键决策
│   ├── next.md               # 下一步行动
│   ├── memory.md             # 关键事实与经验
│   └── archive/              # 归档素材
│
└── 20260830-游戏开发/         # 项目（v0.2.0）
    ├── README.md             # 项目目标 + 自动维护的成员任务表
    ├── progress.md           # 项目级里程碑
    └── decisions.md          # 跨任务决策（含"影响"字段）
```

任务与项目**在磁盘上保持扁平**，层级关系只存在索引里 —— 不嵌套目录，路径永远好猜。

---

## 典型工作流

**场景：做一个游戏，拆成多个任务开发**

```
你：创建项目 游戏开发，主要是做一款 2D 平台跳跃游戏
AI：调用 project_create → 建好项目，记录目标

你：新建任务 UI界面开发，放进 游戏开发 项目里
AI：调用 task_create(project=…) → 任务自动挂进项目，
    项目 README 的任务表实时更新

你：继续 上次那个任务
AI：task_open 读取任务摘要 + 所属项目的耦合备忘/跨任务决策，
    确认改公共接口不会影响其他任务后再动手

你：记一下进度
AI：任务细节写进任务文件；里程碑/跨任务影响同步写进项目的
    progress.md 和 decisions.md（带"影响哪些任务"字段）
```

**场景：隔了一周回来**

```
你：我上次在干嘛？
AI：读取活动任务的 README + memory.md + next.md，
    三句话汇报状态，问你是按计划继续还是调整
```

---

## 设计原则

- **服务器管机制，模型管散文** — 索引、状态机、渲染全部走 MCP 工具，杜绝手改 JSON 导致的不一致
- **文件即真相** — 一切状态可 `cat`、可 `grep`、可进 git，不依赖数据库
- **仅追加历史** — progress / changes / decisions 只加不改，保留完整决策链
- **开箱兼容** — 旧版数据自动迁移，`index_rebuild` 可从 README 重建整个索引

## 仓库结构

```
OpenTask/
├── SKILL.md        # OpenCode Skill：命令工作流定义（AI 读这个）
├── command/        # Slash 命令模板，可拷入 ~/.config/opencode/command/
├── templates/      # 任务/项目文件模板（含占位符，服务器自动填充）
└── server/         # opentask-mcp：TypeScript MCP 服务器（19 个工具）
```

---

<div align="center">

*用 AI 写代码，别让 AI 失忆。*

</div>
