// opentask-mcp: stdio MCP server for the OpenTask skill.
// Owns mechanical task-root operations; the skill/model supplies judgment.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as fs from "node:fs";
import {
  archiveTask,
  configPath,
  createTask,
  ensureInit,
  knowledgeAdd,
  knowledgeSearch,
  linkTask,
  listRecent,
  loadIndex,
  logArchive,
  platformDefaultRoot,
  rebuildIndex,
  refreshTask,
  resolveTask,
  saveConfig,
  searchIndex,
  setTaskStatus,
  taskSummary,
  today,
} from "./lib/store.js";
import type { Config, TaskEntry, TaskIndex } from "./lib/store.js";

const server = new McpServer({ name: "opentask", version: "0.1.0" });

// ---------- helpers ----------

function ok(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof data === "string" ? data : JSON.stringify(data, null, 2),
      },
    ],
  };
}

function err(message: string) {
  return { content: [{ type: "text" as const, text: `opentask: ${message}` }], isError: true };
}

type Args = Record<string, unknown>;
type Handler = (args: Args) => unknown;

function tool(
  name: string,
  description: string,
  schema: Record<string, z.ZodType>,
  fn: Handler,
): void {
  server.registerTool(name, { description, inputSchema: schema }, async (args) => {
    try {
      return ok(await fn(args as Args));
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e));
    }
  });
}

const rootSchema = z.string().optional().describe("Task root override for this call (defaults to config / platform default)");

interface Ctx {
  root: string;
  config: Config;
  index: TaskIndex;
}

function ctx(args: Args): Ctx {
  const { root, config } = ensureInit(args.root as string | undefined);
  const index = loadIndex(root);
  return { root, config, index };
}

type Resolved = { task: TaskEntry; children: TaskEntry[] };

/** Resolve a task reference; throws with a helpful message when ambiguous/missing. */
function resolveOne(ctx: Ctx, ref: string): Resolved {
  const res = resolveTask(ctx.index, ref);
  if (res === null) {
    throw new Error(`未找到任务 "${ref}"。可用 task_find 检索。`);
  }
  if (Array.isArray(res)) {
    const names = res.map((t) => t.path).join(", ");
    throw new Error(`"${ref}" 匹配多个任务: ${names}。请用精确目录名。`);
  }
  const children = res.children
    .map((c) => ctx.index.tasks[c])
    .filter((t): t is TaskEntry => Boolean(t));
  return { task: res, children };
}

function requireActive(ctx: Ctx): TaskEntry {
  if (!ctx.config.active_task) {
    throw new Error("没有活动任务。先 task_open 或 task_create。");
  }
  return resolveOne(ctx, ctx.config.active_task).task;
}

function taskMeta(ctx: Ctx, task: TaskEntry) {
  return {
    task,
    children: task.children
      .map((c) => ctx.index.tasks[c])
      .filter((t): t is TaskEntry => Boolean(t))
      .map((t) => ({ path: t.path, goal: t.goal, status: t.status })),
    active_task: ctx.config.active_task,
  };
}

// ---------- config & init ----------

tool(
  "init",
  "Ensure the OpenTask task root exists (create directory + copy templates on first use). Returns the effective config and root. Call before any other opentask tool.",
  { root: rootSchema },
  (args) => {
    const probeRoot = (args.root as string | undefined)?.trim() || platformDefaultRoot();
    const before = fs.existsSync(configPath(probeRoot));
    const { root, config } = ensureInit(args.root as string | undefined);
    return { root, config, created: !before };
  },
);

tool(
  "config_get",
  "Read the OpenTask _config.json (normalized).",
  { root: rootSchema },
  (args) => {
    const { root, config } = ensureInit(args.root as string | undefined);
    return { root, config };
  },
);

tool(
  "config_set",
  "Update OpenTask config fields. Only provided fields change; config is normalized on save.",
  {
    root: rootSchema,
    active_task: z.string().optional().describe("Directory name of the active task, or empty string to clear"),
    auto_track_changes: z.boolean().optional(),
    change_log_level: z.enum(["step", "feature", "manual"]).optional(),
    auto_update_progress: z.boolean().optional(),
    log_archive_threshold: z.number().int().positive().optional(),
    knowledge_enabled: z.boolean().optional(),
  },
  (args) => {
    const { root, config } = ensureInit(args.root as string | undefined);
    if (args.active_task !== undefined) config.active_task = args.active_task as string;
    if (args.auto_track_changes !== undefined) config.auto_track_changes = args.auto_track_changes as boolean;
    if (args.change_log_level !== undefined) config.change_log_level = args.change_log_level as Config["change_log_level"];
    if (args.auto_update_progress !== undefined) config.auto_update_progress = args.auto_update_progress as boolean;
    if (args.log_archive_threshold !== undefined) config.log_archive_threshold = args.log_archive_threshold as number;
    if (args.knowledge_enabled !== undefined) config.knowledge_enabled = args.knowledge_enabled as boolean;
    saveConfig(root, config);
    return { root, config };
  },
);

// ---------- tasks ----------

tool(
  "task_create",
  "Create a task: YYYYMMDD-<name> directory (deduped with -2/-3), six templates with placeholders filled, active_task set, index and INDEX.md updated. Use for CreateTask.",
  {
    root: rootSchema,
    name: z.string().min(1).describe("Task name (used in the directory name)"),
    tags: z.array(z.string()).optional().describe("Space-separated tags"),
    goal: z.string().optional().describe("Concise goal; omitted -> '<待补充>' placeholder"),
  },
  (args) => {
    const c = ctx(args);
    const created = createTask(
      c.root,
      c.config,
      (args.name as string).trim(),
      (args.tags as string[] | undefined) ?? [],
      (args.goal as string | undefined) ?? undefined,
    );
    return {
      dir: created.dir,
      path: created.path,
      active_task: created.config.active_task,
      index: created.index,
    };
  },
);

tool(
  "task_find",
  "Search the task index by keyword (matches name, goal, tags; exact directory name wins). Without a keyword, lists the latest five tasks by creation date.",
  { root: rootSchema, keyword: z.string().optional() },
  (args) => {
    const c = ctx(args);
    const kw = args.keyword as string | undefined;
    const tasks = kw ? searchIndex(c.index, kw) : listRecent(c.index);
    return {
      tasks: tasks.map((t) => ({
        path: t.path,
        name: t.name,
        status: t.status,
        goal: t.goal,
        tags: t.tags,
        children: t.children.length,
        created: t.created,
        updated: t.updated,
      })),
      count: tasks.length,
    };
  },
);

tool(
  "task_open",
  "Open a task: set it active, refresh its updated date, and return its full structured summary (README, memory, next, progress tail, recent changes, decisions). Use for OpenTask.",
  { root: rootSchema, task: z.string().min(1).describe("Directory name or keyword") },
  (args) => {
    const c = ctx(args);
    const { task, children } = resolveOne(c, args.task as string);
    c.config.active_task = task.path;
    task.updated = today();
    c.index.tasks[task.path]!.updated = today();
    saveConfig(c.root, c.config);
    return {
      ...taskMeta(c, task),
      summary: taskSummary(c.root, task),
      children,
    };
  },
);

tool(
  "task_status",
  "Transition a task's lifecycle status: active (resume), paused (pause), done (complete). Keeps README status line, index, INDEX.md, and active_task consistent. Use for PauseTask / ResumeTask / completing a task.",
  {
    root: rootSchema,
    task: z.string().min(1).describe("Directory name or keyword"),
    status: z.enum(["active", "paused", "done"]),
  },
  (args) => {
    const c = ctx(args);
    const { task } = resolveOne(c, args.task as string);
    setTaskStatus(c.root, c.config, c.index, task, args.status as TaskEntry["status"]);
    return taskMeta(c, c.index.tasks[task.path]!);
  },
);

tool(
  "task_archive",
  "Full archive of a task: status done, '# 已完成' header on next.md, archive entry appended to progress.md, index/INDEX.md updated, active_task cleared if it was active. Use for ArchiveTask.",
  { root: rootSchema, task: z.string().min(1).describe("Directory name or keyword") },
  (args) => {
    const c = ctx(args);
    const { task, children } = resolveOne(c, args.task as string);
    archiveTask(c.root, c.config, c.index, task);
    return { ...taskMeta(c, c.index.tasks[task.path]!), children };
  },
);

tool(
  "task_link",
  "Link two tasks as parent/child in the index and write **父任务** on the child README. Use for LinkTask.",
  { root: rootSchema, parent: z.string().min(1), child: z.string().min(1) },
  (args) => {
    const c = ctx(args);
    const { task: parent } = resolveOne(c, args.parent as string);
    const { task: child } = resolveOne(c, args.child as string);
    if (parent.path === child.path) throw new Error("父任务和子任务不能是同一个");
    linkTask(c.root, c.index, parent, child);
    return {
      parent: parent.path,
      child: child.path,
      children: parent.children.concat(child.path),
    };
  },
);

tool(
  "task_refresh",
  "Sync index fields after model-side prose edits: refresh the task's updated date, and set/update the goal (README ## 目标 first line + index). Use after RecordTask.",
  {
    root: rootSchema,
    task: z.string().min(1).describe("Directory name or keyword"),
    goal: z.string().optional().describe("New goal text"),
  },
  (args) => {
    const c = ctx(args);
    const { task } = resolveOne(c, args.task as string);
    refreshTask(c.root, c.index, task, args.goal as string | undefined);
    return { task: c.index.tasks[task.path]! };
  },
);

tool(
  "task_log_archive",
  "Rolling archive: if progress.md/changes.md exceed log_archive_threshold lines, move older entries (by month) into archive/ and add a marker. Returns what was archived.",
  {
    root: rootSchema,
    task: z.string().optional().describe("Directory name or keyword; defaults to active_task"),
  },
  (args) => {
    const c = ctx(args);
    const task = args.task ? resolveOne(c, args.task as string).task : requireActive(c);
    const archived = logArchive(c.root, task, c.config.log_archive_threshold);
    return { task: task.path, archived };
  },
);

tool(
  "index_rebuild",
  "Rebuild tasks.json and INDEX.md by scanning the task root (YYYYMMDD-* directories, README status/goal/parent/tags), preserving known hierarchy where possible.",
  { root: rootSchema },
  (args) => {
    const c = ctx(args);
    const index = rebuildIndex(c.root);
    return {
      root: c.root,
      count: Object.keys(index.tasks).length,
      tasks: Object.keys(index.tasks).sort(),
    };
  },
);

// ---------- knowledge base ----------

tool(
  "knowledge_add",
  "Write a knowledge-base entry to _knowledge/KB-YYYYMMDD-<slug>.md (dedupe by title: updates the existing entry). Body sections: ## 场景 / ## 步骤 / ## 命令 / ## 注意事项. Use for KnowledgeAdd.",
  {
    root: rootSchema,
    title: z.string().min(1).describe("Entry title"),
    tags: z.array(z.string()).optional(),
    body: z.string().min(1).describe("Markdown body with the four ## sections"),
  },
  (args) => {
    const c = ctx(args);
    const res = knowledgeAdd(
      c.root,
      c.config,
      args.title as string,
      (args.tags as string[] | undefined) ?? [],
      args.body as string,
    );
    return { file: res.file, created: res.created };
  },
);

tool(
  "knowledge_search",
  "Keyword search across _knowledge entries (title, tags, body). Returns matching lines per entry. Use for KnowledgeSearch.",
  { root: rootSchema, keyword: z.string().min(1) },
  (args) => {
    const c = ctx(args);
    const hits = knowledgeSearch(c.root, args.keyword as string);
    return { root: c.root, hits, count: hits.length };
  },
);

// ---------- main ----------

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("opentask-mcp 0.1.0 ready");