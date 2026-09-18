import {
  STATIC_KEYBINDING_COMMANDS,
  type KeybindingCommand,
  type KeybindingShortcut,
  type KeybindingWhenNode,
  type ResolvedKeybindingRule,
  type ResolvedKeybindingsConfig,
} from "@t3tools/contracts";
import {
  DEFAULT_RESOLVED_KEYBINDINGS,
  parseKeybindingWhenExpression,
} from "@t3tools/shared/keybindings";

import { shortcutKeyFromEvent } from "../../keybindings";
import { isMacPlatform } from "../../lib/utils";
import type { MessageKey, Translate } from "../../i18n";

export type KeybindingSource = "Default" | "Custom" | "Project";

export interface KeybindingRow {
  readonly id: string;
  readonly command: KeybindingCommand;
  readonly key: string;
  readonly when: string;
  readonly source: KeybindingSource;
  readonly defaultKey: string | null;
  readonly defaultWhen: string;
  readonly binding: ResolvedKeybindingRule;
  readonly conflicts: ReadonlyArray<string>;
}

export type WhenVariableOption = string;
export type KeybindingCommandOption = KeybindingCommand;

const CORE_WHEN_VARIABLES = ["terminalFocus", "terminalOpen", "true", "false"] as const;

const DEFAULT_WHEN_VARIABLES = new Set<string>(CORE_WHEN_VARIABLES);
for (const binding of DEFAULT_RESOLVED_KEYBINDINGS) {
  collectWhenIdentifiersFromNode(binding.whenAst, DEFAULT_WHEN_VARIABLES);
}

export const DEFAULT_WHEN_VARIABLE =
  [...DEFAULT_WHEN_VARIABLES].find(
    (identifier) => identifier !== "true" && identifier !== "false",
  ) ?? "terminalFocus";
const KNOWN_WHEN_VARIABLES = new Set(DEFAULT_WHEN_VARIABLES);

export function shortcutToKeybindingInput(shortcut: KeybindingShortcut): string {
  const parts: string[] = [];
  if (shortcut.modKey) parts.push("mod");
  if (shortcut.metaKey) parts.push("meta");
  if (shortcut.ctrlKey) parts.push("ctrl");
  if (shortcut.altKey) parts.push("alt");
  if (shortcut.shiftKey) parts.push("shift");
  parts.push(shortcut.key === " " ? "space" : shortcut.key === "escape" ? "esc" : shortcut.key);
  return parts.join("+");
}

export function whenAstToExpression(node: KeybindingWhenNode | undefined): string {
  if (!node) return "";
  switch (node.type) {
    case "identifier":
      return node.name;
    case "not":
      return `!${wrapWhenExpression(node.node)}`;
    case "and":
      return `${wrapWhenExpression(node.left)} && ${wrapWhenExpression(node.right)}`;
    case "or":
      return `${wrapWhenExpression(node.left)} || ${wrapWhenExpression(node.right)}`;
  }
}

export function whenNodeRemoveLabel(
  node: KeybindingWhenNode,
  depth: number,
  t?: Translate,
): string {
  if (depth === 0) return t?.("keybindings.clearAllConditions") ?? "Clear all conditions";
  if (node.type === "identifier" || (node.type === "not" && node.node.type === "identifier")) {
    return t?.("keybindings.removeCondition") ?? "Remove condition";
  }
  return t?.("keybindings.removeGroupAndConditions") ?? "Remove group and its conditions";
}

function wrapWhenExpression(node: KeybindingWhenNode): string {
  if (node.type === "identifier" || node.type === "not") return whenAstToExpression(node);
  return `(${whenAstToExpression(node)})`;
}

export function parseWhenExpressionDraft(
  expression: string,
  t?: Translate,
): { ok: true; value: KeybindingWhenNode | undefined } | { ok: false; message: string } {
  const trimmed = expression.trim();
  if (trimmed.length === 0) return { ok: true, value: undefined };

  const ast = parseKeybindingWhenExpression(trimmed);
  if (!ast) {
    return {
      ok: false,
      message: t?.("keybindings.whenInvalid") ?? "Use variables with !, &&, ||, and parentheses.",
    };
  }

  return { ok: true, value: ast };
}

function sourceForBinding(binding: ResolvedKeybindingRule): KeybindingSource {
  if (String(binding.command).startsWith("script.")) {
    return "Project";
  }

  const bindingKey = shortcutToKeybindingInput(binding.shortcut);
  const bindingWhen = whenAstToExpression(binding.whenAst);
  const isDefault = DEFAULT_RESOLVED_KEYBINDINGS.some(
    (entry) =>
      entry.command === binding.command &&
      shortcutToKeybindingInput(entry.shortcut) === bindingKey &&
      whenAstToExpression(entry.whenAst) === bindingWhen,
  );

  return isDefault ? "Default" : "Custom";
}

function defaultBindingForBinding(
  binding: ResolvedKeybindingRule,
): ResolvedKeybindingRule | undefined {
  const bindingKey = shortcutToKeybindingInput(binding.shortcut);
  const bindingWhen = whenAstToExpression(binding.whenAst);

  return (
    DEFAULT_RESOLVED_KEYBINDINGS.find(
      (entry) =>
        entry.command === binding.command &&
        shortcutToKeybindingInput(entry.shortcut) === bindingKey &&
        whenAstToExpression(entry.whenAst) === bindingWhen,
    ) ??
    DEFAULT_RESOLVED_KEYBINDINGS.find(
      (entry) =>
        entry.command === binding.command && whenAstToExpression(entry.whenAst) === bindingWhen,
    ) ??
    DEFAULT_RESOLVED_KEYBINDINGS.find((entry) => entry.command === binding.command)
  );
}

function keybindingRowId(command: KeybindingCommand, key: string, when: string): string {
  return `${command}\u0000${key}\u0000${when}`;
}

function conflictsWithWhen(leftWhen: string, rightWhen: string): boolean {
  return leftWhen.length === 0 || rightWhen.length === 0 || leftWhen === rightWhen;
}

export function keybindingConflictLabels(
  rows: ReadonlyArray<KeybindingRow>,
  input: { readonly rowId: string; readonly key: string; readonly when: string },
  formatCommand: (command: KeybindingCommand) => string = commandLabel,
): ReadonlyArray<string> {
  if (input.key.trim().length === 0) return [];
  const conflicts: Array<string> = [];
  for (const candidate of rows) {
    if (
      candidate.id !== input.rowId &&
      candidate.key === input.key &&
      conflictsWithWhen(candidate.when, input.when)
    ) {
      conflicts.push(formatCommand(candidate.command));
    }
  }
  return [...new Set(conflicts)].toSorted();
}

export function buildKeybindingRows(
  keybindings: ResolvedKeybindingsConfig,
  query: string,
  t?: Translate,
): ReadonlyArray<KeybindingRow> {
  const normalizedQuery = query.trim().toLowerCase();
  const rows = keybindings.map((binding, index) => {
    const defaultBinding = defaultBindingForBinding(binding);
    const key = shortcutToKeybindingInput(binding.shortcut);
    const when = whenAstToExpression(binding.whenAst);
    return {
      id: `${keybindingRowId(binding.command, key, when)}\u0000${index}`,
      command: binding.command,
      key,
      when,
      source: sourceForBinding(binding),
      defaultKey: defaultBinding ? shortcutToKeybindingInput(defaultBinding.shortcut) : null,
      defaultWhen: whenAstToExpression(defaultBinding?.whenAst),
      binding,
      conflicts: [],
    } satisfies KeybindingRow;
  });

  const rowsWithConflicts = rows.map((row) => {
    const conflicts = keybindingConflictLabels(rows, {
      rowId: row.id,
      key: row.key,
      when: row.when,
    });
    return conflicts.length > 0
      ? Object.assign({}, row, { conflicts: [...new Set(conflicts)].toSorted() })
      : row;
  });

  rowsWithConflicts.sort((left, right) => {
    const commandCompare = left.command.localeCompare(right.command);
    if (commandCompare !== 0) return commandCompare;
    return left.key.localeCompare(right.key);
  });

  if (normalizedQuery.length === 0) {
    return rowsWithConflicts;
  }

  return rowsWithConflicts.filter((row) => {
    const sourceLabel =
      row.source === "Custom"
        ? (t?.("keybindings.source.custom") ?? "Custom")
        : row.source === "Project"
          ? (t?.("keybindings.source.project") ?? "Project")
          : row.source;
    return (
      row.command.toLowerCase().includes(normalizedQuery) ||
      commandLabel(row.command).toLowerCase().includes(normalizedQuery) ||
      (t ? localizedCommandLabel(row.command, t).toLowerCase().includes(normalizedQuery) : false) ||
      row.key.toLowerCase().includes(normalizedQuery) ||
      row.when.toLowerCase().includes(normalizedQuery) ||
      row.source.toLowerCase().includes(normalizedQuery) ||
      sourceLabel.toLowerCase().includes(normalizedQuery)
    );
  });
}

function collectWhenIdentifiersFromNode(
  node: KeybindingWhenNode | undefined,
  identifiers: Set<string>,
): void {
  if (!node) return;
  switch (node.type) {
    case "identifier":
      identifiers.add(node.name);
      return;
    case "not":
      collectWhenIdentifiersFromNode(node.node, identifiers);
      return;
    case "and":
    case "or":
      collectWhenIdentifiersFromNode(node.left, identifiers);
      collectWhenIdentifiersFromNode(node.right, identifiers);
      return;
  }
}

export function isKnownWhenVariable(identifier: string): boolean {
  return KNOWN_WHEN_VARIABLES.has(identifier);
}

export function unknownWhenVariables(node: KeybindingWhenNode | undefined): ReadonlyArray<string> {
  const identifiers = new Set<string>();
  collectWhenIdentifiersFromNode(node, identifiers);
  return [...identifiers].filter((identifier) => !isKnownWhenVariable(identifier)).toSorted();
}

export function buildWhenVariableOptions(): ReadonlyArray<WhenVariableOption> {
  return [...KNOWN_WHEN_VARIABLES].toSorted((left, right) => {
    const leftCoreIndex = CORE_WHEN_VARIABLES.indexOf(left as (typeof CORE_WHEN_VARIABLES)[number]);
    const rightCoreIndex = CORE_WHEN_VARIABLES.indexOf(
      right as (typeof CORE_WHEN_VARIABLES)[number],
    );
    if (leftCoreIndex !== -1 || rightCoreIndex !== -1) {
      return (
        (leftCoreIndex === -1 ? Number.MAX_SAFE_INTEGER : leftCoreIndex) -
        (rightCoreIndex === -1 ? Number.MAX_SAFE_INTEGER : rightCoreIndex)
      );
    }
    return left.localeCompare(right);
  });
}

export function buildKeybindingCommandOptions(
  keybindings: ResolvedKeybindingsConfig,
  t?: Translate,
): ReadonlyArray<KeybindingCommandOption> {
  const commands = new Set<KeybindingCommand>(STATIC_KEYBINDING_COMMANDS);
  for (const binding of keybindings) {
    commands.add(binding.command);
  }
  const label = (command: KeybindingCommand) =>
    t ? localizedCommandLabel(command, t) : commandLabel(command);
  return [...commands].toSorted((left, right) => label(left).localeCompare(label(right)));
}

export function commandLabel(command: KeybindingCommand): string {
  if (command === "thread.copyReference") return "Pull Request: Copy Link or Thread ID";
  const raw = String(command);
  if (raw.startsWith("script.") && raw.endsWith(".run")) {
    return `Run Script: ${titleCaseCommandSegment(raw.slice("script.".length, -".run".length))}`;
  }
  return raw.split(".").map(titleCaseCommandSegment).join(": ");
}

const STATIC_COMMAND_LABEL_KEYS = {
  "sidebar.toggle": "keybindings.command.sidebarToggle",
  "terminal.toggle": "keybindings.command.terminalToggle",
  "terminal.split": "keybindings.command.terminalSplit",
  "terminal.splitVertical": "keybindings.command.terminalSplitVertical",
  "terminal.new": "keybindings.command.terminalNew",
  "terminal.close": "keybindings.command.terminalClose",
  "rightPanel.toggle": "keybindings.command.rightPanelToggle",
  "rightPanel.toggleMaximized": "keybindings.command.rightPanelToggleMaximized",
  "rightPanel.close": "keybindings.command.rightPanelClose",
  "pullRequest.copyNumber": "keybindings.command.pullRequestCopyNumber",
  "diff.toggle": "keybindings.command.diffToggle",
  "preview.toggle": "keybindings.command.previewToggle",
  "preview.refresh": "keybindings.command.previewRefresh",
  "preview.focusUrl": "keybindings.command.previewFocusUrl",
  "preview.zoomIn": "keybindings.command.previewZoomIn",
  "preview.zoomOut": "keybindings.command.previewZoomOut",
  "preview.resetZoom": "keybindings.command.previewResetZoom",
  "commandPalette.toggle": "keybindings.command.commandPaletteToggle",
  "filePicker.toggle": "keybindings.command.filePickerToggle",
  "projectSearch.toggle": "keybindings.command.projectSearchToggle",
  "themeEditor.toggle": "keybindings.command.themeEditorToggle",
  "composer.stash": "keybindings.command.composerStash",
  "composer.host": "keybindings.command.composerHost",
  "composer.effort": "keybindings.command.composerEffort",
  "composer.mode": "keybindings.command.composerMode",
  "composer.workspace": "keybindings.command.composerWorkspace",
  "composer.previousWorktree": "keybindings.command.composerPreviousWorktree",
  "composer.branch": "keybindings.command.composerBranch",
  "chat.new": "keybindings.command.chatNew",
  "chat.newLocal": "keybindings.command.chatNewLocal",
  "editor.openFavorite": "keybindings.command.editorOpenFavorite",
  "modelPicker.toggle": "keybindings.command.modelPickerToggle",
  "modelPicker.previousProvider": "keybindings.command.modelPickerPreviousProvider",
  "modelPicker.nextProvider": "keybindings.command.modelPickerNextProvider",
  "thread.stop": "keybindings.command.threadStop",
  "thread.steerQueuedMessage": "keybindings.command.threadSteerQueuedMessage",
  "thread.previous": "keybindings.command.threadPrevious",
  "thread.next": "keybindings.command.threadNext",
  "thread.copyReference": "keybindings.command.threadCopyReference",
  "thread.settle": "keybindings.command.threadSettle",
  "thread.pin": "keybindings.command.threadPin",
} as const satisfies Readonly<Record<string, MessageKey>>;

export function localizedCommandLabel(command: KeybindingCommand, t: Translate): string {
  const raw = String(command);
  if (raw.startsWith("script.") && raw.endsWith(".run")) {
    return t("keybindings.command.runScript", {
      name: titleCaseCommandSegment(raw.slice("script.".length, -".run".length)),
    });
  }

  const threadJumpMatch = /^thread\.jump\.(\d+)$/u.exec(raw);
  if (threadJumpMatch) {
    return t("keybindings.command.threadJump", { number: threadJumpMatch[1] ?? "" });
  }

  const modelJumpMatch = /^modelPicker\.jump\.(\d+)$/u.exec(raw);
  if (modelJumpMatch) {
    return t("keybindings.command.modelPickerJump", { number: modelJumpMatch[1] ?? "" });
  }

  const key = STATIC_COMMAND_LABEL_KEYS[raw as keyof typeof STATIC_COMMAND_LABEL_KEYS];
  return key ? t(key) : commandLabel(command);
}

function titleCaseCommandSegment(segment: string): string {
  const words: Array<string> = [];
  for (const part of segment.replace(/([a-z0-9])([A-Z])/g, "$1 $2").split(/[-_\s]+/)) {
    if (part.length > 0) {
      words.push(part.slice(0, 1).toUpperCase() + part.slice(1));
    }
  }
  return words.join(" ");
}

function normalizeShortcutKeyToken(key: string): string | null {
  const normalized = key.toLowerCase();
  if (
    normalized === "meta" ||
    normalized === "control" ||
    normalized === "ctrl" ||
    normalized === "shift" ||
    normalized === "alt" ||
    normalized === "option"
  ) {
    return null;
  }
  if (normalized === " ") return "space";
  if (normalized === "escape") return "esc";
  if (normalized === "arrowup") return "arrowup";
  if (normalized === "arrowdown") return "arrowdown";
  if (normalized === "arrowleft") return "arrowleft";
  if (normalized === "arrowright") return "arrowright";
  if (normalized.length === 1) return normalized;
  if (/^f\d{1,2}$/.test(normalized)) return normalized;
  if (normalized === "enter" || normalized === "tab" || normalized === "backspace") {
    return normalized;
  }
  if (normalized === "delete" || normalized === "home" || normalized === "end") {
    return normalized;
  }
  if (normalized === "pageup" || normalized === "pagedown") return normalized;
  return null;
}

export function keybindingFromKeyboardEvent(
  event: Pick<KeyboardEvent, "key" | "code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">,
  platform: string,
): string | null {
  const keyToken = normalizeShortcutKeyToken(shortcutKeyFromEvent(event));
  if (!keyToken) return null;

  const parts: string[] = [];
  if (isMacPlatform(platform)) {
    if (event.metaKey) parts.push("mod");
    if (event.ctrlKey) parts.push("ctrl");
  } else {
    if (event.ctrlKey) parts.push("mod");
    if (event.metaKey) parts.push("meta");
  }
  if (event.altKey) parts.push("alt");
  if (event.shiftKey) parts.push("shift");
  if (parts.length === 0) {
    return null;
  }
  parts.push(keyToken);
  return parts.join("+");
}
