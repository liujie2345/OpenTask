---
description: OpenTask — 打开/新建/继续开发任务（任务持久化工作流）
agent: build
---

Follow the OpenTask skill workflow (skill name: opentask, SKILL.md at /Users/Admin/Documents/Task/OpenTask/SKILL.md).

1. Call the opentask MCP tools for all mechanical operations: `init` / `config_get` first, then `task_find`, `task_create`, `task_open`, `task_status`, `task_archive`, `task_link`, `task_refresh`, `task_log_archive`, `knowledge_add`, `knowledge_search`.
2. If $ARGUMENTS is empty: perform the Session Start self-check — if an active task exists, summarize its state (README + memory.md + next.md); otherwise list the latest five tasks and ask what to do.
3. If $ARGUMENTS is given, interpret it as the user's OpenTask intent, e.g.:
   - "新建 task <名称> [tags...]" → `task_create`, then ask for a goal if unknown
   - "<名称或关键词>" → `task_open` (or `task_find` if ambiguous)
   - "暂停/恢复/归档 <名称>" → `task_status` / `task_archive`
   - "搜索 <关键词>" → `task_find` / `knowledge_search`
   - "记一下 / 保存进度" → RecordTask flow
4. Use the default task root (~/Documents/Task on macOS, E:\Task on Windows) unless the user names a different one — then pass it as the `root` parameter on every tool call.