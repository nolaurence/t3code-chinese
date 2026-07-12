# Pi Coding Agent

T3 Code 桌面端可以将外部 [Pi Coding Agent](https://github.com/badlogic/pi-mono) 作为一等供应商使用。T3 Code 不会把 Pi 打包进应用，而是在本机启动 `pi --mode rpc`，并复用 Pi 自己的模型、认证、扩展、技能和会话目录。

## 安装

先在运行 T3 Code 的电脑上安装 Pi：

```bash
npm install -g @earendil-works/pi-coding-agent
pi --version
```

然后直接运行一次 `pi`，按 Pi 的说明配置模型供应商和认证。可以用下面的命令确认模型已经可用：

```bash
pi --list-models
```

T3 Code 会通过 RPC 读取同一份模型清单，无需在 T3 Code 中重复填写 API Key。

## 在 T3 Code 中启用

打开 `设置 -> 供应商`。默认 Pi 实例使用以下配置：

```text
可执行文件路径：pi
Pi Agent 主目录：留空
```

- `可执行文件路径` 保留为 `pi` 时，T3 Code 从 `PATH` 自动查找。也可以填写绝对路径，例如 `/opt/homebrew/bin/pi`。
- `Pi Agent 主目录` 留空时，Pi 使用默认的 `~/.pi/agent`。
- 填写自定义目录时，T3 Code 会把它作为 `PI_CODING_AGENT_DIR` 传给 Pi。该目录中的认证、模型、扩展、技能和会话与默认目录隔离。

供应商状态刷新成功后，模型选择器会显示 Pi RPC 返回的所有已配置模型。模型 slug 使用 `供应商/模型` 格式，例如 `openai/gpt-5.4`。

## 会话和恢复

每个 T3 Code 任务对应一个独立的 Pi RPC 进程。Pi 生成的 session 文件仍由 Pi 管理，T3 Code 保存 session 文件路径，并在恢复任务时重新传给 Pi。

以下能力会通过现有对话流显示：

- 文本和思考过程流式输出
- `read`、`write`、`edit`、`bash`、`grep`、`find`、`ls` 及扩展工具的生命周期
- 图片附件
- Pi 扩展发起的确认、选择、输入和编辑器请求
- Token 用量、停止、进程退出和错误状态

Pi 的模型与 thinking level 可以在发送下一轮消息前切换。已经保存的 Pi 会话文件不存在或不可读时，恢复会失败并显示供应商错误；T3 Code 不会静默创建一个看似恢复成功的新会话。

## 权限模型

> [!WARNING]
> Pi 的原生工具由 Pi 直接执行，不经过 T3 Code 的命令或文件修改批准界面。只应在你信任的工作区中使用 Pi。

T3 Code 不会为 Pi 增加一层并不存在的“虚假审批”。选择 T3 Code 的 `需要批准` 运行模式，不会改变 Pi 内部工具的执行方式。需要限制工具时，应在 Pi 自己的配置、扩展或启动环境中完成。

Pi 扩展主动发起的交互请求仍会显示在 T3 Code 对话中。这类请求来自扩展协议，不等同于 T3 Code 对每个原生工具调用进行审批。

## 后台文本生成

当 Pi 被选为提交信息、分支名、PR 文案或任务标题的文本生成供应商时，T3 Code 会启动临时 Pi RPC 会话。该临时会话禁用工具、扩展、技能、提示模板、上下文文件和会话持久化，避免后台文案生成修改工作区。

正常对话会话不受这一限制，仍使用完整的 Pi 配置。

## 故障排查

### 显示“未找到”

在启动 T3 Code 的同一终端环境中运行：

```bash
command -v pi
pi --version
```

如果桌面应用读不到 Shell 的 `PATH`，请在 Pi 供应商设置中填写 `command -v pi` 返回的绝对路径。

### 没有可选模型

运行：

```bash
pi --list-models
```

如果 Pi 自己也没有模型，请先完成 Pi 的认证和模型配置。使用自定义 `Pi Agent 主目录` 时，确认认证与模型文件确实位于该目录，而不是默认的 `~/.pi/agent`。

### RPC 启动或运行中退出

先在目标项目目录运行：

```bash
pi --mode rpc
```

若 Pi 立即退出，请检查 Pi 配置、扩展加载错误和 Node.js 版本。T3 Code 会把进程退出标记为不可恢复的供应商错误，并保留错误状态，不会把失败会话误显示为就绪。

### 恢复旧任务失败

确认错误信息中对应的 Pi session 文件仍然存在，并且当前用户有读取权限。移动、清理或切换 `PI_CODING_AGENT_DIR` 后，旧路径可能不再有效。

### 工具没有出现批准按钮

这是预期行为。Pi 原生工具直接执行；请使用可信工作区，并通过 Pi 自己的工具配置限制能力。
