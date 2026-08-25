import type { MessageKey, Translate } from "../../i18n/messages";
import type { WorkLogEntry } from "../../session-logic";
import { normalizeCompactToolLabel } from "./MessagesTimeline.logic";

const TOOL_NAME_KEYS: Readonly<Record<string, MessageKey>> = {
  read: "chat.toolActivity.readFile",
  "read file": "chat.toolActivity.readFile",
  write: "chat.toolActivity.writeFile",
  "write file": "chat.toolActivity.writeFile",
  edit: "chat.toolActivity.editFile",
  "edit file": "chat.toolActivity.editFile",
  apply_patch: "chat.toolActivity.editFile",
  bash: "chat.toolActivity.runCommand",
  command: "chat.toolActivity.runCommand",
  shell: "chat.toolActivity.runCommand",
  grep: "chat.toolActivity.searchFiles",
  search: "chat.toolActivity.searchFiles",
  "search files": "chat.toolActivity.searchFiles",
  find: "chat.toolActivity.findFiles",
  glob: "chat.toolActivity.findFiles",
  "find files": "chat.toolActivity.findFiles",
  ls: "chat.toolActivity.listDirectory",
  list: "chat.toolActivity.listDirectory",
  "list directory": "chat.toolActivity.listDirectory",
};

const REQUEST_KIND_KEYS: Readonly<Record<NonNullable<WorkLogEntry["requestKind"]>, MessageKey>> = {
  command: "chat.toolActivity.runCommand",
  "file-read": "chat.toolActivity.readFile",
  "file-change": "chat.toolActivity.editFile",
};

const ITEM_TYPE_KEYS: Partial<Record<NonNullable<WorkLogEntry["itemType"]>, MessageKey>> = {
  command_execution: "chat.toolActivity.runCommand",
  file_change: "chat.toolActivity.editFile",
  web_search: "chat.toolActivity.webSearch",
  image_view: "chat.toolActivity.viewImage",
  mcp_tool_call: "chat.toolActivity.mcpToolCall",
  collab_agent_tool_call: "chat.toolActivity.subagentTask",
  dynamic_tool_call: "chat.toolActivity.toolCall",
};

const LEGACY_LABEL_KEYS: Readonly<Record<string, MessageKey>> = {
  "command run": "chat.toolActivity.runCommand",
  "ran command": "chat.toolActivity.runCommand",
  "run command": "chat.toolActivity.runCommand",
  "file change": "chat.toolActivity.editFile",
  "read file": "chat.toolActivity.readFile",
  "write file": "chat.toolActivity.writeFile",
  "edit file": "chat.toolActivity.editFile",
  "search files": "chat.toolActivity.searchFiles",
  "find files": "chat.toolActivity.findFiles",
  "list directory": "chat.toolActivity.listDirectory",
  "web search": "chat.toolActivity.webSearch",
  "image view": "chat.toolActivity.viewImage",
  "view image": "chat.toolActivity.viewImage",
  "mcp tool call": "chat.toolActivity.mcpToolCall",
  "subagent task": "chat.toolActivity.subagentTask",
  "tool call": "chat.toolActivity.toolCall",
};

const LIFECYCLE_SUFFIX = /\s+(?:running|complete|completed|failed|declined|stopped)\s*$/i;

function normalizedKnownLabel(value: string): string {
  return normalizeCompactToolLabel(value).replace(LIFECYCLE_SUFFIX, "").trim().toLowerCase();
}

function capitalizePhrase(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) return value;
  return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`;
}

export function toolActivityHeading(entry: WorkLogEntry, t: Translate): string {
  const toolTitle = entry.toolTitle?.trim();
  const toolNameKey = toolTitle ? TOOL_NAME_KEYS[normalizedKnownLabel(toolTitle)] : undefined;
  if (toolNameKey) return t(toolNameKey);

  if (entry.requestKind) return t(REQUEST_KIND_KEYS[entry.requestKind]);

  const itemTypeKey = entry.itemType ? ITEM_TYPE_KEYS[entry.itemType] : undefined;
  if (itemTypeKey) return t(itemTypeKey);

  const rawHeading = toolTitle || entry.label;
  const legacyKey = LEGACY_LABEL_KEYS[normalizedKnownLabel(rawHeading)];
  return legacyKey
    ? t(legacyKey)
    : capitalizePhrase(normalizeCompactToolLabel(rawHeading).replace(LIFECYCLE_SUFFIX, "").trim());
}
