# GitHub Copilot

T3 Code 通过随包提供的 GitHub Copilot SDK 运行 Copilot，无需另外安装 Copilot CLI。

## 配置认证

打开 **设置**，添加或启用 **GitHub Copilot** 供应商，然后在该供应商实例中添加以下任一环境变量：

```text
COPILOT_GITHUB_TOKEN   <github-token>   敏感
```

也支持 `GH_TOKEN` 和 `GITHUB_TOKEN`。同时配置多个变量时，T3 Code 会依次优先使用
`COPILOT_GITHUB_TOKEN`、`GH_TOKEN`、`GITHUB_TOKEN`。

请将 token 标记为敏感值。T3 Code 会把敏感值保存为服务端密钥，保存后不会再把明文发送到客户端。

token 所属账号需要具备 GitHub Copilot 使用权限。保存后刷新供应商状态；设置页显示已认证账号和模型列表时即可使用。

## 自定义模型供应商（BYOK）

除了 GitHub Copilot 官方认证，供应商实例也可以把内置运行时指向任何兼容 OpenAI、Azure 或
Anthropic 的接口。在该实例上配置以下字段：

```text
API 地址           https://your-gateway.example.com/v1
供应商类型         openai | azure | anthropic   （默认为 openai）
API 密钥           <provider-api-key>           （本地供应商可留空）
Wire API           completions | responses      （仅 openai/azure，默认 completions）
Azure API 版本     2024-10-21                   （仅 azure；留空使用 GA 无版本 v1 路由）
```

配置了 API 地址后，会话会完全绕过 GitHub Copilot 认证，不再需要 GitHub token。T3 Code 会从
供应商的 `/models` 接口拉取可用模型；如果接口未列出全部模型，仍可手动添加模型 slug。

通过模型设置可以覆盖每个模型的上下文长度、支持的推理强度和默认推理强度。API 拉取的模型与
手动添加的模型都支持这些配置。切换模型时会创建新线程，以便 SDK 创建会话时应用对应的上下文限制。

## 推理与 Autopilot

配置了推理强度的模型会在对话控制栏中显示推理强度选项。选择**自动**后，该轮消息会使用
Copilot SDK 的 Autopilot 模式发送；计划模式和交互模式仍可正常使用。

## 远程环境

token 必须配置在拥有该环境的 T3 Code 服务端。手机、浏览器或另一台电脑本地保存的 token，不能认证远程服务端。

每个 GitHub Copilot 供应商实例可以使用独立的 token、显示名称和模型列表。已有线程会继续使用创建它的供应商实例。

## 权限模式

在**完全访问**模式下，Copilot 的命令和文件修改无需批准即可继续。**自动接受编辑**会自动允许文件写入，命令和其他权限请求仍需确认。**监督**模式会询问所有受保护操作。计划模式只允许检查，会拒绝写入和命令权限。

## 故障排查

- **供应商显示未认证**：确认 token 配置在 GitHub Copilot 供应商实例中，然后刷新状态。
- **没有模型**：使用 GitHub Copilot 时确认 token 所属账号具备 Copilot 权限；使用 BYOK 时确认
  API 地址提供兼容的 `/models` 接口。
- **SDK 运行时无法启动**：重新安装或更新 T3 Code。平台运行时随 T3 Code 一起提供，不需要单独安装 CLI。
