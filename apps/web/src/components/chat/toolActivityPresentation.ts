import {
  collectToolGroupSummaryParts,
  normalizeCompactToolLabel,
  type ToolGroupAction,
  type WorkLogPresentationEntry,
} from "@t3tools/client-runtime/work-log/presentation";
import type { MessageKey, Translate } from "../../i18n/messages";
import type { WorkLogEntry } from "../../session-logic";
import { formatWorkspaceRelativePath } from "../../filePathDisplay";

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
  "mcp-elicitation": "chat.toolActivity.toolCall",
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

function toolActivityHeadingKey(entry: WorkLogEntry): MessageKey | null {
  const toolTitle = entry.toolTitle?.trim();
  const toolNameKey = toolTitle ? TOOL_NAME_KEYS[normalizedKnownLabel(toolTitle)] : undefined;
  if (toolNameKey) return toolNameKey;

  if (entry.requestKind) return REQUEST_KIND_KEYS[entry.requestKind];

  const itemTypeKey = entry.itemType ? ITEM_TYPE_KEYS[entry.itemType] : undefined;
  if (itemTypeKey) return itemTypeKey;

  const rawHeading = toolTitle || entry.label;
  return LEGACY_LABEL_KEYS[normalizedKnownLabel(rawHeading)] ?? null;
}

export function toolActivityHeading(entry: WorkLogEntry, t: Translate): string {
  const headingKey = toolActivityHeadingKey(entry);
  if (headingKey) return t(headingKey);

  const rawHeading = entry.toolTitle?.trim() || entry.label;
  return capitalizePhrase(
    normalizeCompactToolLabel(rawHeading).replace(LIFECYCLE_SUFFIX, "").trim(),
  );
}

const TOOL_SUMMARY_SENTENCE_KEYS: Partial<Record<MessageKey, MessageKey>> = {
  "chat.toolActivity.readFile": "chat.toolSummary.read",
  "chat.toolActivity.writeFile": "chat.toolSummary.write",
  "chat.toolActivity.editFile": "chat.toolSummary.edit",
  "chat.toolActivity.listDirectory": "chat.toolSummary.listDirectory",
  "chat.toolActivity.searchFiles": "chat.toolSummary.search",
};

/** Completed single-tool row title: command echo or a sentence with its target path. */
export function toolSummaryLabel(
  entry: WorkLogEntry,
  t: Translate,
  workspaceRoot: string | undefined,
): string {
  const command = entry.command?.trim();
  if (command) return t("chat.toolSummary.command", { command });

  const headingKey = toolActivityHeadingKey(entry);
  const firstPath = entry.changedFiles?.[0];
  const sentenceKey = headingKey ? TOOL_SUMMARY_SENTENCE_KEYS[headingKey] : undefined;
  if (sentenceKey && firstPath) {
    return t(sentenceKey, { path: formatWorkspaceRelativePath(firstPath, workspaceRoot) });
  }
  return toolActivityHeading(entry, t);
}

const TOOL_GROUP_SUMMARY_KEYS: Record<
  ToolGroupAction,
  { readonly one: MessageKey; readonly many: MessageKey }
> = {
  "link-pr": {
    one: "chat.timeline.summary.linkPrs.one",
    many: "chat.timeline.summary.linkPrs.many",
  },
  "unlink-pr": {
    one: "chat.timeline.summary.unlinkPrs.one",
    many: "chat.timeline.summary.unlinkPrs.many",
  },
  "list-prs": {
    one: "chat.timeline.summary.listPrs.one",
    many: "chat.timeline.summary.listPrs.many",
  },
  read: { one: "chat.timeline.summary.read.one", many: "chat.timeline.summary.read.many" },
  edit: { one: "chat.timeline.summary.edit.one", many: "chat.timeline.summary.edit.many" },
  command: {
    one: "chat.timeline.summary.command.one",
    many: "chat.timeline.summary.command.many",
  },
  device: { one: "chat.timeline.summary.device.one", many: "chat.timeline.summary.device.many" },
  browser: {
    one: "chat.timeline.summary.browser.one",
    many: "chat.timeline.summary.browser.many",
  },
  search: { one: "chat.timeline.summary.search.one", many: "chat.timeline.summary.search.many" },
  "code-search": {
    one: "chat.timeline.summary.codeSearch.one",
    many: "chat.timeline.summary.codeSearch.many",
  },
  other: { one: "chat.timeline.summary.other.one", many: "chat.timeline.summary.other.many" },
  update: { one: "chat.timeline.summary.update.one", many: "chat.timeline.summary.update.many" },
};

function lowercaseFirst(value: string): string {
  return value.charAt(0).toLowerCase() + value.slice(1);
}

function joinPhrase(
  labels: ReadonlyArray<string>,
  t: Translate,
  keys: { pair: MessageKey; separator: MessageKey; list: MessageKey },
): string {
  if (labels.length < 2) return labels[0] ?? "";
  if (labels.length === 2) return t(keys.pair, { first: labels[0] ?? "", second: labels[1] ?? "" });
  return t(keys.list, {
    rest: labels.slice(0, -1).join(t(keys.separator)),
    last: labels.at(-1) ?? "",
  });
}

/** Localized counterpart of client-runtime's English-only summarizeToolGroup. */
export function toolGroupSummaryText(
  entries: ReadonlyArray<WorkLogPresentationEntry>,
  t: Translate,
): string {
  const parts = collectToolGroupSummaryParts(entries);
  const labels = parts.actions.map(({ action, count }) =>
    t(TOOL_GROUP_SUMMARY_KEYS[action][count === 1 ? "one" : "many"], { count }),
  );
  if (parts.sourceCount > 0) {
    const names = joinPhrase(parts.sourceNames, t, {
      pair: "chat.timeline.summary.namesJoinPair",
      separator: "chat.timeline.summary.namesJoinSeparator",
      list: "chat.timeline.summary.namesJoinList",
    });
    labels.unshift(
      parts.allIntegrations
        ? t(
            parts.sourceCount === 1
              ? "chat.timeline.summary.usedSourceIntegrations.one"
              : "chat.timeline.summary.usedSourceIntegrations.many",
            { names },
          )
        : t("chat.timeline.summary.usedSource", { names }),
    );
  }
  const sentenceLabels = labels.map((label, index) =>
    index === 0 ? label : lowercaseFirst(label),
  );
  return joinPhrase(sentenceLabels, t, {
    pair: "chat.timeline.summary.joinPair",
    separator: "chat.timeline.summary.joinSeparator",
    list: "chat.timeline.summary.joinList",
  });
}
