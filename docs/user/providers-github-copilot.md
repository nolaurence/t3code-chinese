# GitHub Copilot

T3 Code runs GitHub Copilot through the bundled GitHub Copilot SDK. You do not need to install a
separate Copilot CLI.

## Configure Authentication

Open **Settings**, add or enable a **GitHub Copilot** provider, then add one of these environment
variables to that provider instance:

```text
COPILOT_GITHUB_TOKEN   <github-token>   Sensitive
```

`GH_TOKEN` and `GITHUB_TOKEN` are also supported. If more than one is present, T3 Code uses
`COPILOT_GITHUB_TOKEN`, then `GH_TOKEN`, then `GITHUB_TOKEN`.

Mark the token as sensitive. T3 Code stores sensitive values as server secrets and does not send
them back to the client after saving.

The token must belong to an account that can use GitHub Copilot. Refresh the provider after saving
it; the provider is ready when Settings shows an authenticated account and a model list.

## Custom LLM Providers (BYOK)

A GitHub Copilot provider instance can use the official Copilot models and multiple custom LLM
providers at the same time. In the instance settings, choose **Add LLM provider**, then configure:

```text
Provider name      Work OpenAI
Provider type      openai | azure | anthropic
API base URL       https://your-gateway.example.com/v1
API key            <provider-api-key>           (optional for local providers)
Wire API           completions | responses      (openai/azure only)
Azure API version  2024-10-21                   (azure only)
```

Choose **Fetch from API** to import the models reported by the configured endpoint, or add model IDs
manually. Existing model metadata overrides are preserved when models are fetched again. Each model
can have its own display name, context window, supported reasoning efforts, and default reasoning
effort. The API key is stored as plain text in the server's local settings file.

Custom providers do not require GitHub authentication. When GitHub authentication is also
available, the model picker includes both official Copilot models and models from every configured
custom provider. The provider name distinguishes models with the same display name.

Changing models within one custom LLM provider reuses the current session. Changing between custom
providers, or between a custom provider and the official Copilot service, requires a new thread.

Existing installations that used the earlier single-provider BYOK fields continue to work, but new
custom provider configuration uses the LLM provider list.

## Reasoning and Autopilot

Models with configured reasoning efforts show a reasoning selector in the conversation controls.
Choose **Auto** to send the turn using Copilot SDK Autopilot mode. Plan and interactive modes remain
available alongside it.

## Remote Environments

Configure the token on the T3 Code server that owns the environment. A token stored on your phone,
browser, or another desktop does not authenticate a remote server.

Each GitHub Copilot provider instance can have its own token, display name, and model list. Existing
threads continue with the provider instance that created them.

## Permission Modes

In **Full access**, Copilot commands and file changes proceed without approval prompts. In
**Auto-accept edits**, file writes proceed automatically while commands and other permission
requests still ask. **Supervised** asks for all protected actions. Plan mode allows inspection but
rejects write and command permissions.

## Troubleshooting

- **Provider is unauthenticated**: confirm the token is on the GitHub Copilot provider instance and
  refresh its status.
- **No models appear**: for GitHub Copilot, confirm the token's account has Copilot access. For a
  custom LLM provider, confirm that at least one model ID is configured.
- **The SDK runtime cannot start**: reinstall or update T3 Code. The platform runtime is part of the
  T3 Code package, not a separately installed CLI.
