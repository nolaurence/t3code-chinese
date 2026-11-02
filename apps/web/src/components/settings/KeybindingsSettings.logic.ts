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
  parseKeybindingShortcut,
  parseKeybindingWhenExpression,
  US_SHIFTED_TO_UNSHIFTED_KEYS,
} from "@t3tools/shared/keybindings";

import { shortcutConflictKey, shortcutKeyFromEvent } from "../../keybindings";
import { isMacPlatform } from "../../lib/utils";
import { METRIC_OPTIONS, WINDOW_OPTIONS } from "../usage/usageShortcuts";
import { type MessageKey, type Translate } from "../../i18n";


// Rank every usage command; mixing rank and alphabetical comparisons makes order input-dependent.
const usageCommandOrder = new Map<KeybindingCommand, number>(
  [
    "usage.open" as const,
    ...[...METRIC_OPTIONS, ...WINDOW_OPTIONS].map((option) => option.command),
  ].map((command, index) => [command, index]),
);

const firstUsageCommand = METRIC_OPTIONS[0].command;

function compareCommands(
  left: KeybindingCommand,
  right: KeybindingCommand,
  key: (command: KeybindingCommand) => string,
): number {
  const leftRank = usageCommandOrder.get(left);
  const rightRank = usageCommandOrder.get(right);
  if (leftRank !== undefined && rightRank !== undefined) return leftRank - rightRank;
  return key(leftRank === undefined ? left : firstUsageCommand).localeCompare(
    key(rightRank === undefined ? right : firstUsageCommand),
  );
}

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

const CORE_WHEN_VARIABLES = [
  "terminalFocus",
  "terminalOpen",
  "isWeb",
  "isDesktop",
  "true",
  "false",
] as const;

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

export function whenNodeRemoveLabel(node: KeybindingWhenNode, depth: number, t?: Translate): string {
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
  expression: string, t?: Translate,
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
  platform = navigator.platform,
  t?: Translate,
): ReadonlyArray<string> {
  if (input.key.trim().length === 0) return [];
  const shortcut = parseKeybindingShortcut(input.key);
  if (!shortcut) return [];
  // Compare resolved chords so mod+k and ctrl+k collide where mod is Ctrl.
  const conflictKey = shortcutConflictKey(shortcut, platform);
  const conflicts: Array<string> = [];
  for (const candidate of rows) {
    if (
      candidate.id !== input.rowId &&
      shortcutConflictKey(candidate.binding.shortcut, platform) === conflictKey &&
      conflictsWithWhen(candidate.when, input.when)
    ) {
      conflicts.push(t ? localizedCommandLabel(candidate.command, t) : commandLabel(candidate.command));
    }
  }
  return [...new Set(conflicts)].toSorted();
}

export interface KeybindingGroup {
  readonly id: string;
  readonly title: string;
  readonly rows: ReadonlyArray<KeybindingRow>;
}

const KEYBINDING_GROUPS = [
  {
    id: "navigation",
    title: "Navigation",
    prefixes: ["sidebar", "rightPanel", "commandPalette", "filePicker", "projectSearch", "editor"],
  },
  { id: "threads", title: "Threads", prefixes: ["thread", "chat", "pullRequest"] },
  { id: "composer", title: "Composer", prefixes: ["composer", "modelPicker"] },
  { id: "terminal", title: "Terminal", prefixes: ["terminal"] },
  { id: "preview", title: "Preview & diff", prefixes: ["preview", "diff"] },
  { id: "appearance", title: "Appearance", prefixes: ["theme", "appearance", "themeEditor"] },
  { id: "scripts", title: "Project scripts", prefixes: ["script"] },
] as const;
const OTHER_KEYBINDING_GROUP = { id: "other", title: "Other" } as const;

function keybindingGroupFor(command: KeybindingCommand): { id: string; title: string } {
  const prefix = String(command).split(".")[0] ?? "";
  return (
    KEYBINDING_GROUPS.find((group) => (group.prefixes as ReadonlyArray<string>).includes(prefix)) ??
    OTHER_KEYBINDING_GROUP
  );
}

export function groupKeybindingRows(
  rows: ReadonlyArray<KeybindingRow>,
): ReadonlyArray<KeybindingGroup> {
  const rowsByGroup = new Map<string, Array<KeybindingRow>>();
  for (const row of rows) {
    const group = keybindingGroupFor(row.command);
    const bucket = rowsByGroup.get(group.id);
    if (bucket) bucket.push(row);
    else rowsByGroup.set(group.id, [row]);
  }
  return [...KEYBINDING_GROUPS, OTHER_KEYBINDING_GROUP].flatMap((group) => {
    const groupRows = rowsByGroup.get(group.id);
    return groupRows ? [{ id: group.id, title: group.title, rows: groupRows }] : [];
  });
}

export function buildKeybindingRows(
  keybindings: ResolvedKeybindingsConfig,
  platform = navigator.platform,
): ReadonlyArray<KeybindingRow> {
  const rowsById = new Map<string, KeybindingRow>();
  for (const binding of keybindings) {
    const defaultBinding = defaultBindingForBinding(binding);
    const key = shortcutToKeybindingInput(binding.shortcut);
    const when = whenAstToExpression(binding.whenAst);
    const id = keybindingRowId(binding.command, key, when);
    rowsById.set(id, {
      id,
      command: binding.command,
      key,
      when,
      source: sourceForBinding(binding),
      defaultKey: defaultBinding ? shortcutToKeybindingInput(defaultBinding.shortcut) : null,
      defaultWhen: whenAstToExpression(defaultBinding?.whenAst),
      binding,
      conflicts: [],
    });
  }
  const rows = [...rowsById.values()];

  const rowsWithConflicts = rows.map((row) => {
    const conflicts = keybindingConflictLabels(
      rows,
      {
        rowId: row.id,
        key: row.key,
        when: row.when,
      },
      platform,
    );
    return conflicts.length > 0
      ? Object.assign({}, row, { conflicts: [...new Set(conflicts)].toSorted() })
      : row;
  });

  rowsWithConflicts.sort((left, right) => {
    const commandCompare = compareCommands(left.command, right.command, (command) => command);
    if (commandCompare !== 0) return commandCompare;
    return left.key.localeCompare(right.key);
  });

  return rowsWithConflicts;
}

export function filterKeybindingRows(
  rows: ReadonlyArray<KeybindingRow>,
  query: string,
  t?: Translate,
): ReadonlyArray<KeybindingRow> {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery.length === 0) return rows;
  return rows.filter((row) => {
    const sourceLabel =
      row.source === "Custom"
        ? (t?.("keybindings.source.custom") ?? "Custom")
        : row.source === "Project"
          ? (t?.("keybindings.source.project") ?? "Project")
          : row.source;
    const label = (t ? localizedCommandLabel(row.command, t) : commandLabel(row.command)).toLowerCase();
    return (
      row.command.toLowerCase().includes(normalizedQuery) ||
      label.includes(normalizedQuery) ||
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
  return [...commands].toSorted((left, right) => compareCommands(left, right, label));
}

export function commandLabel(command: KeybindingCommand): string {
  if (command === "workspace.focusNext") return "Focus Next Workspace Area";
  if (command === "workspace.focusPrevious") return "Focus Previous Workspace Area";
  if (command === "composer.sendAlternate") return "Composer: Opposite Queue or Steer Action";
  if (command === "composer.sendBackground") return "Composer: Start in Background";
  if (command === "composer.sendAndNewThread") return "Composer: Send and Start New Thread";
  if (command === "thread.steerQueuedMessage") return "Queue: Send First Queued Message";
  if (command === "thread.editQueuedMessage") return "Queue: Edit Last Queued Message";
  if (command === "thread.copyReference") return "Pull Request: Copy Link or Thread";
  const usageMetric = METRIC_OPTIONS.find((option) => option.command === command);
  if (usageMetric) return `Usage: ${usageMetric.label}`;
  const usagePeriod = WINDOW_OPTIONS.find((option) => option.command === command);
  if (usagePeriod) return `Usage: Period: ${usagePeriod.label}`;
  if (command === "view.reopenClosed") return "Reopen Closed Tab";
  if (command === "preview.focusUrl") return "Preview: Focus URL";
  const raw = String(command);
  if (raw.startsWith("script.") && raw.endsWith(".run")) {
    return `Run Script: ${titleCaseCommandSegment(raw.slice("script.".length, -".run".length))}`;
  }
  return raw.split(".").map(titleCaseCommandSegment).join(": ");
}

const STATIC_COMMAND_LABELS = {
  "sidebar.toggle": ["keybindings.command.sidebarToggle", "Sidebar: Toggle"],
  "terminal.toggle": ["keybindings.command.terminalToggle", "Terminal: Toggle"],
  "terminal.split": ["keybindings.command.terminalSplit", "Terminal: Split"],
  "terminal.splitVertical": ["keybindings.command.terminalSplitVertical", "Terminal: Split Vertical"],
  "terminal.new": ["keybindings.command.terminalNew", "Terminal: New"],
  "terminal.close": ["keybindings.command.terminalClose", "Terminal: Close"],
  "rightPanel.toggle": ["keybindings.command.rightPanelToggle", "Right Panel: Toggle"],
  "rightPanel.toggleMaximized": [
    "keybindings.command.rightPanelToggleMaximized",
    "Right Panel: Toggle Maximized",
  ],
  "rightPanel.close": ["keybindings.command.rightPanelClose", "Right Panel: Close"],
  "pullRequest.copyNumber": ["keybindings.command.pullRequestCopyNumber", "Pull Request: Copy Number"],
  "diff.toggle": ["keybindings.command.diffToggle", "Diff: Toggle"],
  "preview.toggle": ["keybindings.command.previewToggle", "Preview: Toggle"],
  "preview.refresh": ["keybindings.command.previewRefresh", "Preview: Refresh"],
  "preview.focusUrl": ["keybindings.command.previewFocusUrl", "Preview: Focus URL"],
  "preview.zoomIn": ["keybindings.command.previewZoomIn", "Preview: Zoom In"],
  "preview.zoomOut": ["keybindings.command.previewZoomOut", "Preview: Zoom Out"],
  "preview.resetZoom": ["keybindings.command.previewResetZoom", "Preview: Reset Zoom"],
  "commandPalette.toggle": ["keybindings.command.commandPaletteToggle", "Command Palette: Toggle"],
  "filePicker.toggle": ["keybindings.command.filePickerToggle", "File Picker: Toggle"],
  "projectSearch.toggle": ["keybindings.command.projectSearchToggle", "Project Search: Toggle"],
  "themeEditor.toggle": ["keybindings.command.themeEditorToggle", "Theme Editor: Toggle"],
  "composer.stash": ["keybindings.command.composerStash", "Composer: Stash"],
  "composer.host": ["keybindings.command.composerHost", "Composer: Host"],
  "composer.effort": ["keybindings.command.composerEffort", "Composer: Effort"],
  "composer.mode": ["keybindings.command.composerMode", "Composer: Mode"],
  "composer.workspace": ["keybindings.command.composerWorkspace", "Composer: Workspace"],
  "composer.previousWorktree": [
    "keybindings.command.composerPreviousWorktree",
    "Composer: Previous Worktree",
  ],
  "composer.branch": ["keybindings.command.composerBranch", "Composer: Branch"],
  "chat.new": ["keybindings.command.chatNew", "Chat: New"],
  "chat.newLocal": ["keybindings.command.chatNewLocal", "Chat: New Local"],
  "editor.openFavorite": ["keybindings.command.editorOpenFavorite", "Editor: Open Favorite"],
  "modelPicker.toggle": ["keybindings.command.modelPickerToggle", "Model Picker: Toggle"],
  "modelPicker.previousProvider": [
    "keybindings.command.modelPickerPreviousProvider",
    "Model Picker: Previous Provider",
  ],
  "modelPicker.nextProvider": [
    "keybindings.command.modelPickerNextProvider",
    "Model Picker: Next Provider",
  ],
  "thread.stop": ["keybindings.command.threadStop", "Thread: Stop"],
  "thread.steerQueuedMessage": [
    "keybindings.command.threadSteerQueuedMessage",
    "Thread: Steer Queued Message",
  ],
  "thread.previous": ["keybindings.command.threadPrevious", "Thread: Previous"],
  "thread.next": ["keybindings.command.threadNext", "Thread: Next"],
  "thread.copyReference": [
    "keybindings.command.threadCopyReference",
    "Pull Request: Copy Link or Thread ID",
  ],
  "thread.settle": ["keybindings.command.threadSettle", "Thread: Settle"],
  "thread.pin": ["keybindings.command.threadPin", "Thread: Pin"],
} as const satisfies Readonly<Record<string, readonly [MessageKey, string]>>;

/** Translate a command label when the catalog still matches the upstream English wording. */
export function localizedCommandLabel(command: KeybindingCommand, t: Translate): string {
  const english = commandLabel(command);
  const raw = String(command);
  if (raw.startsWith("script.") && raw.endsWith(".run")) {
    const name = titleCaseCommandSegment(raw.slice("script.".length, -".run".length));
    if (english === `Run Script: ${name}`) return t("keybindings.command.runScript", { name });
  }
  const entry = STATIC_COMMAND_LABELS[raw as keyof typeof STATIC_COMMAND_LABELS];
  if (entry && entry[1] === english) return t(entry[0]);
  return english;
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

function recordedLayoutShortcutKey(
  event: Pick<KeyboardEvent, "key" | "code" | "shiftKey" | "altKey">,
): string {
  const physicalKey = shortcutKeyFromEvent(event);
  const layoutKey = event.key.toLowerCase();
  if (event.altKey || layoutKey.length !== 1) return physicalKey;
  // Normalize only US shifted glyphs at their US position. Other layouts can
  // produce the same glyph without Shift or at a different position.
  const unshiftedKey = event.shiftKey ? US_SHIFTED_TO_UNSHIFTED_KEYS.get(layoutKey) : undefined;
  return unshiftedKey === physicalKey ? physicalKey : layoutKey;
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
  options?: {
    readonly layoutCharacter?: boolean;
  },
): string | null {
  const keyToken = normalizeShortcutKeyToken(
    options?.layoutCharacter ? recordedLayoutShortcutKey(event) : shortcutKeyFromEvent(event),
  );
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
  parts.push(keyToken);
  return parts.join("+");
}
