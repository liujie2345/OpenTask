// opentask-mcp store: deterministic task-root operations.
// Owns: config normalization, tasks.json index, INDEX.md rendering,
// task lifecycle transitions, log archival, knowledge base.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const TEMPLATES_DIR = path.resolve(__dirname, "..", "..", "templates");

export type TaskStatus = "active" | "paused" | "done";
export type LogLevel = "step" | "feature" | "manual";
export type TaskKind = "task" | "project";

export interface Config {
  version: number;
  task_root: string;
  active_task: string;
  auto_track_changes: boolean;
  change_log_level: LogLevel;
  auto_update_progress: boolean;
  log_archive_threshold: number;
  knowledge_enabled: boolean;
}

export interface TaskEntry {
  name: string;
  path: string;
  parent: string | null;
  children: string[];
  status: TaskStatus;
  created: string; // YYYY-MM-DD
  updated: string; // YYYY-MM-DD
  goal: string;
  tags: string[];
  kind?: TaskKind; // 项目标记；缺省视为 "task"
}

export function entryKind(t: TaskEntry): TaskKind {
  return t.kind ?? "task";
}

export interface TaskIndex {
  version: number;
  tasks: Record<string, TaskEntry>;
}

// ---------- time helpers (local timezone) ----------

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function nowStamp(): string {
  const d = new Date();
  return `${today()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function ymdKey(d = new Date()): string {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

function fmtDateFromKey(key: string): string {
  // "20260824" -> "2026-08-24"
  return key.replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3");
}

// ---------- io helpers ----------

export function readJson(p: string): unknown {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

export function writeJson(p: string, value: unknown): void {
  fs.writeFileSync(p, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function readText(p: string): string {
  return fs.readFileSync(p, "utf8");
}

function writeText(p: string, content: string): void {
  fs.writeFileSync(p, content, "utf8");
}

// ---------- config ----------

export function platformDefaultRoot(): string {
  return process.platform === "win32"
    ? "E:\\Task"
    : path.join(os.homedir(), "Documents", "Task");
}

export function normalizeConfig(raw: unknown): Config {
  const c = (raw ?? {}) as Record<string, unknown>;
  const rawLevel = c.change_log_level;
  let level: LogLevel;
  if (rawLevel === "step" || rawLevel === "feature" || rawLevel === "manual") {
    level = rawLevel;
  } else {
    level = c.auto_track_changes === false ? "manual" : "feature";
  }
  return {
    version: 2,
    task_root: typeof c.task_root === "string" ? c.task_root : "",
    active_task: typeof c.active_task === "string" ? c.active_task : "",
    auto_track_changes: c.auto_track_changes !== false,
    change_log_level: level,
    auto_update_progress: c.auto_update_progress !== false,
    log_archive_threshold:
      typeof c.log_archive_threshold === "number" && c.log_archive_threshold > 0
        ? c.log_archive_threshold
        : 500,
    knowledge_enabled: c.knowledge_enabled !== false,
  };
}

export function resolveRoot(config: Config, explicit?: string): string {
  if (explicit && explicit.trim()) return explicit.trim();
  let root = config.task_root;
  // Legacy template default on non-Windows: treat as platform default.
  if (process.platform !== "win32" && root === "E:\\Task") root = "";
  if (!root.trim()) root = platformDefaultRoot();
  return root;
}

export function configPath(root: string): string {
  return path.join(root, "_config.json");
}

export function loadConfig(root: string): Config | null {
  const p = configPath(root);
  if (!fs.existsSync(p)) return null;
  return normalizeConfig(readJson(p));
}

export function saveConfig(root: string, config: Config): void {
  const normalized = normalizeConfig(config);
  // Legacy rewrite: persisted form drops the stale Windows default on non-Windows.
  if (process.platform !== "win32" && normalized.task_root === "E:\\Task") {
    normalized.task_root = "";
  }
  writeJson(configPath(root), normalized);
}

/** Ensure the task root exists; copy templates on first use. Returns {root, config}. */
export function ensureInit(explicit?: string): { root: string; config: Config } {
  const probeRoot = explicit?.trim() || platformDefaultRoot();
  const existing = loadConfig(probeRoot);
  if (!existing) {
    fs.mkdirSync(probeRoot, { recursive: true });
    for (const tpl of ["_config.json", "tasks.json", "INDEX.md"]) {
      const src = path.join(TEMPLATES_DIR, tpl);
      const dst = path.join(probeRoot, tpl);
      if (fs.existsSync(src) && !fs.existsSync(dst)) {
        fs.copyFileSync(src, dst);
      }
    }
    fs.mkdirSync(path.join(probeRoot, "_knowledge"), { recursive: true });
  }
  const config = loadConfig(probeRoot) ?? normalizeConfig(null);
  const root = resolveRoot(config, explicit);
  fs.mkdirSync(path.join(root, "_knowledge"), { recursive: true });
  return { root, config: loadConfig(root) ?? config };
}

// ---------- task index ----------

export function loadIndex(root: string): TaskIndex {
  const p = path.join(root, "tasks.json");
  if (!fs.existsSync(p)) return rebuildIndex(root);
  try {
    const idx = readJson(p) as TaskIndex;
    if (idx && idx.version === 2 && idx.tasks && typeof idx.tasks === "object") {
      return idx;
    }
  } catch {
    // fall through to rebuild
  }
  return rebuildIndex(root);
}

export function saveIndex(root: string, index: TaskIndex): void {
  writeJson(path.join(root, "tasks.json"), index);
  writeText(path.join(root, "INDEX.md"), renderIndex(index));
}

export function renderIndex(index: TaskIndex): string {
  const lines = [
    "# Task 索引",
    "",
    "> 由 opentask skill 自动维护。每次 CreateTask / LinkTask / PauseTask / ResumeTask / ArchiveTask 时更新。",
    "",
    `**最后更新**: ${nowStamp()}`,
    "",
  ];
  const projects = Object.values(index.tasks)
    .filter((t) => entryKind(t) === "project")
    .sort((a, b) => b.created.localeCompare(a.created));
  if (projects.length) {
    lines.push("## 📁 项目", "");
    for (const p of projects) {
      lines.push(`- \`${p.path}\` — ${p.goal || p.name}（${p.children.length} 个任务）`);
    }
    lines.push("");
  }
  const sections: Array<[TaskStatus, string]> = [
    ["active", "🟡 进行中"],
    ["paused", "⏸ 暂停"],
    ["done", "✅ 已完成"],
  ];
  for (const [status, title] of sections) {
    lines.push(`## ${title}`, "");
    const list = Object.values(index.tasks)
      .filter((t) => t.status === status && entryKind(t) === "task")
      .sort((a, b) => b.created.localeCompare(a.created));
    if (list.length === 0) {
      lines.push("（无）", "");
      continue;
    }
    for (const t of list) {
      const suffix = t.children.length ? `（${t.children.length} 个子任务）` : "";
      lines.push(`- \`${t.path}\` — ${t.goal || t.name}${suffix}`);
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd() + "\n";
}

export function rebuildIndex(root: string): TaskIndex {
  const index: TaskIndex = { version: 2, tasks: {} };
  const dirs = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^\d{8}-/.test(d.name));
  for (const d of dirs) {
    const readmePath = path.join(root, d.name, "README.md");
    let status: TaskStatus = "active";
    let goal = "";
    let parent: string | null = null;
    let tags: string[] = [];
    let kind: TaskKind = "task";
    if (fs.existsSync(readmePath)) {
      const text = readText(readmePath);
      status = text.includes("✅ 已完成")
        ? "done"
        : text.includes("⏸ 暂停")
          ? "paused"
          : "active";
      goal = firstLineAfter(text, "## 目标") ?? "";
      parent = fieldValue(text, "**父任务**") || null;
      tags = (fieldValue(text, "**标签**") ?? "")
        .split(/[\\s,，]+/)
        .filter(Boolean);
      if (fieldValue(text, "**类型**") === "项目") kind = "project";
    }
    const created = fmtDateFromKey(d.name.slice(0, 8));
    const entry: TaskEntry = {
      name: d.name.slice(9),
      path: d.name,
      parent,
      children: [],
      status,
      created,
      updated: created,
      goal,
      tags,
    };
    if (kind === "project") entry.kind = "project";
    index.tasks[d.name] = entry;
  }
  // Preserve hierarchy/tags the previous index knew (README may not carry all).
  const oldPath = path.join(root, "tasks.json");
  if (fs.existsSync(oldPath)) {
    try {
      const old = readJson(oldPath) as TaskIndex;
      if (old?.tasks) {
        for (const [key, e] of Object.entries(old.tasks)) {
          const cur = index.tasks[key];
          if (!cur) continue;
          if (e.parent && index.tasks[e.parent]) cur.parent = e.parent;
          if (Array.isArray(e.children)) {
            cur.children = e.children.filter((c) => index.tasks[c]);
          }
          if (e.kind && !cur.kind) cur.kind = e.kind;
        }
      }
    } catch {
      // ignore corrupt old index
    }
  }
  saveIndex(root, index);
  return index;
}

function firstLineAfter(text: string, heading: string): string | null {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]?.trim() === heading) {
      for (let j = i + 1; j < lines.length; j++) {
        const line = lines[j]!.trim();
        if (line) return line;
      }
    }
  }
  return null;
}

function fieldValue(text: string, field: string): string | null {
  const m = text.match(new RegExp(`^${escapeRegExp(field)}\\s*[:：]\\s*(.*)$`, "m"));
  if (!m) return null;
  const v = m[1]!.trim();
  return v === "-" ? null : v;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------- task lookup ----------

export function listRecent(index: TaskIndex, n = 5, kind?: TaskKind): TaskEntry[] {
  return Object.values(index.tasks)
    .filter((t) => !kind || entryKind(t) === kind)
    .sort((a, b) => b.created.localeCompare(a.created))
    .slice(0, n);
}

export function listAll(index: TaskIndex, kind?: TaskKind): TaskEntry[] {
  return Object.values(index.tasks)
    .filter((t) => !kind || entryKind(t) === kind)
    .sort((a, b) => b.created.localeCompare(a.created));
}

export function searchIndex(index: TaskIndex, keyword: string): TaskEntry[] {
  const kw = keyword.toLowerCase();
  const exact = Object.values(index.tasks).filter((t) => t.path.toLowerCase() === kw);
  if (exact.length) return exact;
  return Object.values(index.tasks).filter(
    (t) =>
      t.name.toLowerCase().includes(kw) ||
      t.goal.toLowerCase().includes(kw) ||
      t.tags.some((g) => g.toLowerCase().includes(kw)),
  );
}

/** Resolve a task reference. Returns the entry, or the ambiguous list, or null. */
export function resolveTask(
  index: TaskIndex,
  keyword: string,
): TaskEntry | TaskEntry[] | null {
  const exact = Object.values(index.tasks).filter(
    (t) => t.path.toLowerCase() === keyword.toLowerCase(),
  );
  if (exact.length === 1) {
    const hit = exact[0];
    if (hit) return hit;
  }
  const subs = searchIndex(index, keyword);
  if (subs.length === 1) {
    const hit = subs[0];
    if (hit) return hit;
  }
  return subs.length > 1 ? subs : null;
}

// ---------- task lifecycle ----------

export function createTask(
  root: string,
  config: Config,
  name: string,
  tags: string[],
  goal?: string,
  project?: TaskEntry,
): { dir: string; path: string; config: Config; index: TaskIndex } {
  const index = loadIndex(root);
  const ymd = ymdKey();
  let dir = `${ymd}-${name}`;
  let n = 2;
  while (fs.existsSync(path.join(root, dir))) {
    dir = `${ymd}-${name}-${n++}`;
  }
  const taskDir = path.join(root, dir);
  fs.mkdirSync(path.join(taskDir, "archive"), { recursive: true });

  const created = today();
  const goalText = goal?.trim() || "<待补充>";
  const replacements: Record<string, string> = {
    "{{TASK_ID}}": dir,
    "{{TASK_NAME}}": name,
    "{{CREATED_DATE}}": created,
    "{{GOAL}}": goalText,
  };
  for (const tpl of ["README.md", "progress.md", "changes.md", "decisions.md", "next.md", "memory.md"]) {
    const src = path.join(TEMPLATES_DIR, tpl);
    if (!fs.existsSync(src)) continue;
    let content = readText(src);
    for (const [k, v] of Object.entries(replacements)) {
      content = content.split(k).join(v);
    }
    writeText(path.join(taskDir, tpl), content);
  }

  config.active_task = dir;
  index.tasks[dir] = {
    name,
    path: dir,
    parent: null,
    children: [],
    status: "active",
    created,
    updated: created,
    goal: goal?.trim() || "",
    tags: tags ?? [],
  };
  if (project) {
    if (entryKind(project) !== "project") {
      throw new Error(`"${project.path}" 不是项目，不能作为容器`);
    }
    index.tasks[dir]!.parent = project.path;
    const projEntry = index.tasks[project.path]!;
    if (!projEntry.children.includes(dir)) projEntry.children.push(dir);
  }
  saveConfig(root, config);
  if (project) syncProjectReadme(root, index, project.path);
  saveIndex(root, index);
  return { dir, path: taskDir, config, index };
}

// ---------- projects ----------

const CHILDREN_BEGIN = "<!-- opentask:children:auto -->";
const CHILDREN_END = "<!-- /opentask:children:auto -->";

function renderChildrenTable(index: TaskIndex, project: TaskEntry): string {
  const rows = project.children
    .map((c) => index.tasks[c])
    .filter((t): t is TaskEntry => Boolean(t))
    .map(
      (t) =>
        `- ${{ active: "🟡", paused: "⏸", done: "✅" }[t.status]} \`${t.path}\` — ${t.goal || t.name}`,
    );
  return [
    CHILDREN_BEGIN,
    ...(rows.length ? rows : ["<暂无任务，用 CreateTask 创建并加入此项目>"]),
    CHILDREN_END,
  ].join("\n");
}

/** Regenerate the auto-maintained task table in a project README. */
export function syncProjectReadme(
  root: string,
  index: TaskIndex,
  projectPath: string,
): void {
  const project = index.tasks[projectPath];
  if (!project || entryKind(project) !== "project") return;
  const readmePath = path.join(root, projectPath, "README.md");
  if (!fs.existsSync(readmePath)) return;
  const text = readText(readmePath);
  const table = renderChildrenTable(index, project);
  const begin = text.indexOf(CHILDREN_BEGIN);
  const end = text.indexOf(CHILDREN_END);
  const next =
    begin !== -1 && end !== -1 && end > begin
      ? text.slice(0, begin) + table + text.slice(end + CHILDREN_END.length)
      : text.trimEnd() + "\n\n## 任务列表\n\n" + table + "\n";
  writeText(readmePath, next);
}

export function createProject(
  root: string,
  config: Config,
  name: string,
  goal: string,
  tags: string[],
): { dir: string; path: string; config: Config; index: TaskIndex } {
  const index = loadIndex(root);
  const ymd = ymdKey();
  let dir = `${ymd}-${name}`;
  let n = 2;
  while (fs.existsSync(path.join(root, dir))) {
    dir = `${ymd}-${name}-${n++}`;
  }
  const projDir = path.join(root, dir);
  fs.mkdirSync(projDir, { recursive: true });

  const created = today();
  const goalText = goal.trim() || "<待补充>";
  const replacements: Record<string, string> = {
    "{{TASK_ID}}": dir,
    "{{TASK_NAME}}": name,
    "{{CREATED_DATE}}": created,
    "{{GOAL}}": goalText,
  };
  for (const tpl of ["PROJECT_README.md", "PROJECT_PROGRESS.md", "PROJECT_DECISIONS.md"]) {
    const src = path.join(TEMPLATES_DIR, tpl);
    if (!fs.existsSync(src)) continue;
    let content = readText(src);
    for (const [k, v] of Object.entries(replacements)) {
      content = content.split(k).join(v);
    }
    writeText(path.join(projDir, tpl.replace(/^PROJECT_/, "").toLowerCase()), content);
  }

  index.tasks[dir] = {
    name,
    path: dir,
    parent: null,
    children: [],
    status: "active",
    created,
    updated: created,
    goal: goal.trim(),
    tags: tags ?? [],
    kind: "project",
  };
  saveIndex(root, index);
  return { dir, path: projDir, config, index };
}

/** Transition active/paused/done, keeping README + index + INDEX.md consistent. */
export function setTaskStatus(
  root: string,
  config: Config,
  index: TaskIndex,
  task: TaskEntry,
  status: TaskStatus,
): void {
  const readmePath = path.join(root, task.path, "README.md");
  if (fs.existsSync(readmePath)) {
    let text = readText(readmePath);
    const emoji = { active: "🟡 进行中", paused: "⏸ 暂停", done: "✅ 已完成" }[status];
    text = text.replace(/\*\*状态\*\*\s*[:：]\s*[^\n]*/, `**状态**: ${emoji}`);
    if (status === "paused") {
      text = text.replace(/^\*\*暂停\*\*\s*[:：]\s*[^\n]*\n?/m, "");
      text = text.replace(
        /^(\*\*状态\*\*\s*[:：]\s*[^\n]*\n)/m,
        `$1**暂停**: ${today()}\n`,
      );
    } else {
      text = text.replace(/^\*\*暂停\*\*\s*[:：]\s*[^\n]*\n?/gm, "");
    }
    if (status === "done") {
      text = text.replace(/^\*\*完成\*\*\s*[:：]\s*[^\n]*\n?/m, "");
      text = text.replace(
        /^(\*\*状态\*\*\s*[:：]\s*[^\n]*\n)/m,
        `$1**完成**: ${today()}\n`,
      );
    }
    if (status === "active") {
      text = text.replace(/\*\*最后更新\*\*\s*[:：]\s*[^\n]*/, `**最后更新**: ${today()}`);
    }
    writeText(readmePath, text);
  }

  const entry = index.tasks[task.path];
  if (entry) {
    entry.status = status;
    entry.updated = today();
  }
  const parentEntry = task.parent ? index.tasks[task.parent] : undefined;
  if (parentEntry && entryKind(parentEntry) === "project") {
    syncProjectReadme(root, index, parentEntry.path);
  }
  if (status === "paused" || status === "done") {
    if (config.active_task === task.path) config.active_task = "";
  } else {
    config.active_task = task.path;
  }
  saveConfig(root, config);
  saveIndex(root, index);
}

export function archiveTask(
  root: string,
  config: Config,
  index: TaskIndex,
  task: TaskEntry,
): void {
  setTaskStatus(root, config, index, task, "done");
  const nextPath = path.join(root, task.path, "next.md");
  if (fs.existsSync(nextPath)) {
    const text = readText(nextPath);
    if (!text.startsWith("# 已完成")) {
      writeText(nextPath, `# 已完成（${today()}）\n\n${text}`);
    }
  }
  const progPath = path.join(root, task.path, "progress.md");
  if (fs.existsSync(progPath)) {
    fs.appendFileSync(progPath, `\n## ${nowStamp()}\n- 任务归档。\n`, "utf8");
  }
}

export function linkTask(
  root: string,
  index: TaskIndex,
  parent: TaskEntry,
  child: TaskEntry,
): void {
  if (entryKind(child) === "project") {
    throw new Error("项目不能挂到其他任务或项目下面");
  }
  index.tasks[child.path]!.parent = parent.path;
  const siblings = index.tasks[parent.path]!.children;
  if (!siblings.includes(child.path)) siblings.push(child.path);
  saveIndex(root, index);
  if (entryKind(parent) === "project") syncProjectReadme(root, index, parent.path);

  const readmePath = path.join(root, child.path, "README.md");
  if (fs.existsSync(readmePath)) {
    let text = readText(readmePath);
    if (/\*\*父任务\*\*/.test(text)) {
      text = text.replace(/\*\*父任务\*\*\s*[:：]\s*[^\n]*/, `**父任务**: ${parent.path}`);
    } else {
      text = text.replace(
        /^(\*\*状态\*\*\s*[:：]\s*[^\n]*\n)/m,
        `$1**父任务**: ${parent.path}\n`,
      );
    }
    writeText(readmePath, text);
  }
}

export function refreshTask(
  root: string,
  index: TaskIndex,
  task: TaskEntry,
  goal?: string,
): void {
  const entry = index.tasks[task.path];
  if (!entry) throw new Error(`task not in index: ${task.path}`);
  if (goal !== undefined && goal !== null && goal.trim()) {
    entry.goal = goal.trim();
    const readmePath = path.join(root, task.path, "README.md");
    if (fs.existsSync(readmePath)) {
      const text = readText(readmePath);
      writeText(
        readmePath,
        text.replace(/^(## 目标\s*\n+)[^\n]*/m, `$1${goal.trim()}`),
      );
    }
  }
  entry.updated = today();
  saveIndex(root, index);
}

// ---------- log archival ----------

function entryDate(line: string): string | null {
  const m = line.match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[0] : null;
}

/** Move older entries of progress.md/changes.md to archive/ once over threshold. */
export function logArchive(
  root: string,
  task: TaskEntry,
  threshold: number,
): string[] {
  const results: string[] = [];
  const curMonth = today().slice(0, 7);
  for (const file of ["progress.md", "changes.md"]) {
    const p = path.join(root, task.path, file);
    if (!fs.existsSync(p)) continue;
    const lines = readText(p).split("\n");
    if (lines.length <= threshold) continue;

    // Split before the first entry of the current month; if still over,
    // keep a tail of ~80% of the threshold.
    let split = lines.length;
    for (let i = 0; i < lines.length; i++) {
      const d = entryDate(lines[i]!);
      if (d && d.slice(0, 7) < curMonth) {
        split = i;
        break;
      }
    }
    const tail = lines.slice(split);
    if (tail.length > threshold) {
      split = tail.length - Math.floor(threshold * 0.8);
    }
    const archived = lines.slice(0, split).filter((l) => l.trim() !== "");
    if (archived.length === 0) continue;

    const month = (entryDate(archived[0]!) ?? today()).slice(0, 7);
    const base = file.replace(/\.md$/, "");
    const destName = `${base}-${month}.md`;
    const dest = path.join(root, task.path, "archive", destName);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const header = `# ${file} 归档（${month}）\n\n`;
    const existing = fs.existsSync(dest) ? readText(dest) : header;
    const separator = existing.endsWith("\n") ? "" : "\n";
    writeText(dest, existing + separator + archived.join("\n") + "\n");
    const marker = `<!-- 已归档 ${archived.length} 行至 archive/${destName} -->`;
    writeText(p, marker + "\n" + tail.join("\n"));
    results.push(`${file}: 归档 ${archived.length} 行 → archive/${destName}`);
  }
  return results;
}

// ---------- summaries ----------

function tail(text: string, n: number): string {
  const lines = text.split("\n");
  return lines.slice(-n).join("\n");
}

export function taskSummary(root: string, task: TaskEntry): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of ["README.md", "memory.md", "next.md", "progress.md", "changes.md", "decisions.md"]) {
    const p = path.join(root, task.path, f);
    if (!fs.existsSync(p)) {
      out[f] = "";
      continue;
    }
    const text = readText(p);
    out[f] = f === "progress.md" ? tail(text, 40) : f === "changes.md" ? tail(text, 15) : text;
  }
  return out;
}

// ---------- knowledge base ----------

export function knowledgeAdd(
  root: string,
  config: Config,
  title: string,
  tags: string[],
  body: string,
): { file: string; created: boolean } {
  const kbDir = path.join(root, "_knowledge");
  fs.mkdirSync(kbDir, { recursive: true });
  const cleanTitle = title.trim();
  const slug = cleanTitle.replace(/[\s/\\:：，。,.;;]+/g, "-");
  let file = path.join(kbDir, `KB-${ymdKey()}-${slug}.md`);
  let created = true;
  // Dedupe by exact title across existing entries.
  for (const f of fs.readdirSync(kbDir)) {
    if (!f.endsWith(".md")) continue;
    try {
      const text = readText(path.join(kbDir, f));
      const t = text.match(/^title:\s*(.+)$/m)?.[1]?.trim();
      if (t && t === cleanTitle) {
        file = path.join(kbDir, f);
        created = false;
        break;
      }
    } catch {
      // skip unreadable
    }
  }
  const front = `---\ntitle: ${cleanTitle}\ntags: [${(tags ?? []).join(", ")}]\nsource_task: ${config.active_task || "-"}\ncreated: ${today()}\n---\n\n`;
  writeText(file, front + (body.trim() ? body.trim() + "\n" : ""));
  return { file, created };
}

export interface KnowledgeHit {
  file: string;
  title: string;
  tags: string;
  source_task: string;
  line: string;
}

export function knowledgeSearch(root: string, keyword: string): KnowledgeHit[] {
  const kbDir = path.join(root, "_knowledge");
  if (!fs.existsSync(kbDir)) return [];
  const kw = keyword.toLowerCase();
  const hits: KnowledgeHit[] = [];
  for (const f of fs.readdirSync(kbDir)) {
    if (!f.endsWith(".md")) continue;
    const p = path.join(kbDir, f);
    let text: string;
    try {
      text = readText(p);
    } catch {
      continue;
    }
    const title = text.match(/^title:\s*(.+)$/m)?.[1]?.trim() ?? f;
    const tags = text.match(/^tags:\s*\[(.*)\]$/m)?.[1] ?? "";
    const source = text.match(/^source_task:\s*(.+)$/m)?.[1]?.trim() ?? "-";
    for (const line of text.split("\n")) {
      if (line.toLowerCase().includes(kw)) {
        hits.push({ file: f, title, tags, source_task: source, line: line.trim().slice(0, 200) });
      }
    }
  }
  return hits;
}