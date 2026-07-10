# 快捷键

T3 Code 从以下位置读取快捷键：

- `~/.t3/keybindings.json`

该文件必须是由规则组成的 JSON 数组：

```json
[
  { "key": "mod+g", "command": "terminal.toggle" },
  { "key": "mod+shift+g", "command": "terminal.new", "when": "terminalFocus" }
]
```

完整模式详见：[`packages/contracts/src/keybindings.ts`](../../../packages/contracts/src/keybindings.ts)

## 默认值

```json
[
  { "key": "mod+j", "command": "terminal.toggle" },
  { "key": "mod+d", "command": "terminal.split", "when": "terminalFocus" },
  { "key": "mod+n", "command": "terminal.new", "when": "terminalFocus" },
  { "key": "mod+w", "command": "terminal.close", "when": "terminalFocus" },
  { "key": "mod+shift+j", "command": "preview.toggle" },
  { "key": "mod+r", "command": "preview.refresh", "when": "previewFocus" },
  { "key": "mod+l", "command": "preview.focusUrl", "when": "previewFocus" },
  { "key": "mod+=", "command": "preview.zoomIn", "when": "previewFocus" },
  { "key": "mod+-", "command": "preview.zoomOut", "when": "previewFocus" },
  { "key": "mod+0", "command": "preview.resetZoom", "when": "previewFocus" },
  { "key": "mod+k", "command": "commandPalette.toggle", "when": "!terminalFocus" },
  { "key": "mod+n", "command": "chat.new", "when": "!terminalFocus" },
  { "key": "mod+shift+o", "command": "chat.new", "when": "!terminalFocus" },
  { "key": "mod+shift+n", "command": "chat.newLocal", "when": "!terminalFocus" },
  { "key": "mod+o", "command": "editor.openFavorite" }
]
```

最新的默认值请参阅 [`apps/server/src/keybindings.ts` 中的 `DEFAULT_KEYBINDINGS`](../../../apps/server/src/keybindings.ts)。

## 配置

### 规则结构

每个条目支持：

- `key`（必填）：快捷键字符串，例如 `mod+j`、`ctrl+k`、`cmd+shift+d`
- `command`（必填）：操作 ID
- `when`（可选）：控制快捷键何时生效的布尔表达式

无效规则会被忽略。无效配置文件也会被忽略。服务器会记录警告。

### 可用命令

- `terminal.toggle`：打开或关闭终端抽屉
- `terminal.split`：拆分终端（默认在聚焦的终端上下文中）
- `terminal.new`：创建新终端（默认在聚焦的终端上下文中）
- `terminal.close`：关闭或终止聚焦的终端（默认在聚焦的终端上下文中）
- `preview.toggle`：打开或关闭应用内浏览器预览面板（仅限桌面应用）
- `preview.refresh`：重新加载活动预览标签页（默认在聚焦的预览上下文中）
- `preview.focusUrl`：聚焦预览面板的 URL 输入框（默认在聚焦的预览上下文中）
- `preview.zoomIn`：将预览视口放大一级（默认在聚焦的预览上下文中）
- `preview.zoomOut`：将预览视口缩小一级（默认在聚焦的预览上下文中）
- `preview.resetZoom`：将预览缩放重置为 100%（默认在聚焦的预览上下文中）
- `commandPalette.toggle`：打开或关闭全局命令面板
- `chat.new`：保留活动会话分支和 worktree 状态，创建新的聊天会话
- `chat.newLocal`：在新环境中为活动项目创建新的聊天会话（由应用设置决定使用本地环境还是 worktree，默认使用 `local`）
- `editor.openFavorite`：在上次使用的编辑器中打开当前项目或 worktree
- `script.{id}.run`：按 ID 运行项目脚本（例如 `script.test.run`）

### 按键语法

支持的修饰键：

- `mod`（macOS 上为 `cmd`，非 macOS 上为 `ctrl`）
- `cmd` / `meta`
- `ctrl` / `control`
- `shift`
- `alt` / `option`

示例：

- `mod+j`
- `mod+shift+d`
- `ctrl+l`
- `cmd+k`

### `when` 条件

当前可用的上下文键：

- `terminalFocus`
- `terminalOpen`
- `previewFocus`
- `previewOpen`

支持的运算符：

- `!`（非）
- `&&`（与）
- `||`（或）
- 圆括号：`(` `)`

示例：

- `"when": "terminalFocus"`
- `"when": "terminalOpen && !terminalFocus"`
- `"when": "terminalFocus || terminalOpen"`

未知条件键求值为 `false`。

### 优先级

- 规则按数组顺序求值。
- 对于一次按键事件，最后一条同时满足 `key` 匹配且 `when` 求值为 `true` 的规则生效。
- 这意味着优先级跨命令生效，而不只是在同一命令内部生效。
