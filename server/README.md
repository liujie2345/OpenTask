# opentask-mcp

MCP server backing the [OpenTask](../SKILL.md) skill. It owns the deterministic
parts of the workflow — config, `tasks.json` index, `INDEX.md` rendering, task
lifecycle transitions, log archival, and the knowledge base — so the model never
has to hand-maintain state.

## Build

```bash
cd server
npm install
npm run build   # bundles to dist/index.js (self-contained, no runtime deps)
```

## Register in opencode

Add to your opencode config (`~/.config/opencode/opencode.jsonc`):

```jsonc
{
  "mcp": {
    "opentask": {
      "type": "local",
      "command": ["node", "/absolute/path/to/OpenTask/server/dist/index.js"],
      "enabled": true
    }
  },
  "skills": {
    "paths": ["/absolute/path/to/OpenTask"]
  }
}
```

Restart opencode for both to take effect.

## Tools

| Tool | Purpose |
|---|---|
| `init` | Ensure task root exists (copy templates if missing), return config |
| `config_get` / `config_set` | Read / update `_config.json` with normalization |
| `task_create` | Create `YYYYMMDD-<name>` dir + templates, update index/INDEX.md |
| `task_find` | Search index by name/goal/tags, or list latest five |
| `task_open` | Set active task, return structured summary (README/memory/next/…) |
| `task_status` | Pause / resume / complete transition (README + index + INDEX.md) |
| `task_archive` | Full archive: status done, `next.md` header, progress entry |
| `task_link` | Parent/child relation in index + child README |
| `task_refresh` | Sync `goal` / `updated` after model-side prose edits |
| `task_log_archive` | Rolling archive of progress/changes over threshold |
| `index_rebuild` | Rebuild `tasks.json` + `INDEX.md` from the filesystem |
| `knowledge_add` | Write/update a `_knowledge` entry (dedupe by title) |
| `knowledge_search` | Keyword search across `_knowledge` entries |

Every tool accepts an optional `root` parameter to override the task root for
that call (used when the user names an explicit location in conversation).