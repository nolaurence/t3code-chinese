# Claude

本指南面向希望在 T3 Code 中使用多套 Claude 配置的用户。

常见原因：

- 分别使用工作和个人 Claude 账户
- 在不干扰主配置的情况下尝试另一套 Claude Code 配置
- 通过 Claude Code Router 等路由器运行 Claude
- 通过兼容 Claude 的工作流使用外部供应商

## 我只使用一个 Claude 账户

使用默认供应商。

按常规方式登录 Claude Code：

```bash
claude auth login
```

在 T3 Code 设置中，Claude 供应商可以保持如下配置：

```text
显示名称：Claude
二进制路径：claude
Claude HOME 路径：留空
```

`Claude HOME 路径`留空表示 T3 Code 使用常规主目录。

## 我想使用工作和个人 Claude 账户

为每个账户使用不同的 Claude 主目录。

示例：

```text
默认主目录                    工作账户
~/.claude_personal_home       个人账户
```

### 配置第一个账户

按常规方式登录：

```bash
claude auth login
```

在 T3 Code 设置中：

```text
显示名称：Claude Work
二进制路径：claude
Claude HOME 路径：留空
```

### 配置第二个账户

使用独立主目录登录：

```bash
mkdir -p ~/.claude_personal_home
HOME=~/.claude_personal_home claude auth login
```

然后在 T3 Code 中添加另一个 Claude 供应商：

```text
显示名称：Claude Personal
二进制路径：claude
Claude HOME 路径：~/.claude_personal_home
```

使用设置中显示的电子邮件确认每个供应商都在使用预期账户。电子邮件默认模糊显示；点击模糊的电子邮件即可查看。

## 可以在现有会话中切换 Claude 账户吗？

通常不可以。

对于现有会话，T3 Code 只会提供使用相同 Claude 主目录的 Claude 供应商。不同的 Claude 主目录会被视为不同的 Claude 环境。

这与推荐的 Codex 配置不同。Claude Code 会在其主目录下的多个文件中保存账户和本地状态，因此 T3 Code 会隔离不同的 Claude 主目录，而不是尝试只共享一部分状态。

## 我想使用 OpenRouter

如果希望 Claude Code 直接与 OpenRouter 通信，而不运行本地路由器，请使用此配置。这是最简单的外部供应商配置。

OpenRouter 通过 Claude 的 Anthropic 兼容环境变量提供 Claude Code 集成。

### 配置 Claude OpenRouter 供应商

在 T3 Code 设置中添加或编辑 Claude 供应商：

```text
显示名称：Claude OpenRouter
二进制路径：claude
Claude HOME 路径：~/.claude_openrouter_home
```

在该供应商的`环境变量`区域添加：

```text
ANTHROPIC_BASE_URL   https://openrouter.ai/api
ANTHROPIC_AUTH_TOKEN sk-or-...                敏感
ANTHROPIC_API_KEY                              空值
```

将 `ANTHROPIC_AUTH_TOKEN` 标记为敏感。T3 Code 会将其值作为服务器机密存储，保存后不会再发送回应用。

如果希望该配置与常规 Claude 账户隔离，请先创建该主目录：

```bash
mkdir -p ~/.claude_openrouter_home
```

如果之前使用同一 Claude 主目录进行过常规 Anthropic 登录，请先在该主目录的 Claude Code 会话中运行 `/logout`，再使用 OpenRouter。否则 Claude Code 可能继续使用缓存的 Anthropic 凭据，而不是 OpenRouter 令牌。

### 选择 OpenRouter 模型

OpenRouter 可以将 Claude Code 的默认模型角色路由到 OpenRouter 模型 ID。

示例：

```text
ANTHROPIC_DEFAULT_OPUS_MODEL    anthropic/claude-opus-4.6
ANTHROPIC_DEFAULT_SONNET_MODEL  anthropic/claude-sonnet-4.6
ANTHROPIC_DEFAULT_HAIKU_MODEL   anthropic/claude-haiku-4.5
CLAUDE_CODE_SUBAGENT_MODEL      anthropic/claude-sonnet-4.6
```

如果需要稳定的模型选择，请将这些变量添加到同一供应商的`环境变量`区域。

### 验证正在使用 OpenRouter

打开 Claude 会话并运行：

```text
/status
```

你应该看到 Anthropic 基础 URL 设置为：

```text
https://openrouter.ai/api
```

还可以在 OpenRouter 活动仪表板中查看来自该 API 密钥的请求。

### 常见 OpenRouter 错误

- Claude Code 应使用 `https://openrouter.ai/api`，而不是 `https://openrouter.ai/api/v1`。
- 将 `ANTHROPIC_AUTH_TOKEN` 设置为 OpenRouter API 密钥。
- 将 `ANTHROPIC_API_KEY` 设为空字符串，避免 Claude Code 尝试使用 Anthropic 登录。
- 将这些变量放在 Claude 供应商实例上，而不是全局 Shell 启动文件中。

OpenRouter 的配置可能随时间变化。最新细节请参阅其上游 Claude Code 指南：<https://openrouter.ai/docs/guides/guides/claude-code-integration>。

## 我想使用 Claude Code Router

如果需要比直接 OpenRouter 配置更强的本地路由控制，可以使用 Claude Code Router。

T3 Code 不需要专用的 Claude Code Router 供应商。将路由器视为一个 Claude 环境即可。

当希望由 Claude Code Router 决定哪个上游模型或供应商处理 Claude 请求时，请使用此方案。

大致流程：

1. 启动 Claude Code Router。
2. 在 T3 Code 中添加或配置 Claude 供应商。
3. 将路由器要求的变量设置到该供应商实例上。

配置 Claude 供应商：

```text
显示名称：Claude Router
二进制路径：claude
Claude HOME 路径：~/.claude_router_home
```

然后将 `ccr activate` 会导出的变量复制到供应商的`环境变量`区域。将令牌和 API 密钥标记为敏感。

如果希望路由器配置与常规 Claude 账户隔离，请先创建并使用专用主目录登录：

```bash
mkdir -p ~/.claude_router_home
ccr start
ccr activate
HOME=~/.claude_router_home claude auth login
```

Claude Code Router 的配置可能随时间变化。最新安装和配置步骤请参阅其上游 README：<https://github.com/musistudio/claude-code-router>。

## 我想使用不同的 Claude 设置，而不是不同账户

如果需要命名的预设，请为同一账户创建另一个 Claude 供应商。

示例：

- “Claude Default”
- “Claude Router”
- “Claude Experimental”

如果预设需要不同的 Claude 文件，请为其设置不同的 `Claude HOME 路径`。如果需要不同的 API 密钥、基础 URL 或路由器设置，请使用`环境变量`。

不要在`启动参数`中填写环境变量赋值。
