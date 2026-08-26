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

## Custom Model Providers (BYOK)

Instead of GitHub Copilot auth, a provider instance can point the bundled runtime at any
OpenAI-, Azure-, or Anthropic-compatible endpoint. Configure these fields on the instance:

```text
API base URL       https://your-gateway.example.com/v1
Provider type      openai | azure | anthropic   (defaults to openai)
API key            <provider-api-key>           (optional for local providers)
Wire API           completions | responses      (openai/azure only, defaults to completions)
Azure API version  2024-10-21                   (azure only; blank uses the GA v1 route)
```

With an API base URL set, sessions bypass GitHub Copilot authentication entirely and the GitHub
token is not required. T3 Code fetches the available models from the provider's `/models` endpoint.
You can still add model slugs manually when an API does not list every supported model.

Use the model settings action to override a model's context window, supported reasoning efforts,
and default reasoning effort. These overrides apply to both fetched and manually added models.
Changing models starts a new thread so the selected context-window limit is applied when the SDK
session is created.

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
- **No models appear**: for GitHub Copilot, confirm the token's account has Copilot access. For
  BYOK, confirm the base URL exposes a compatible `/models` endpoint.
- **The SDK runtime cannot start**: reinstall or update T3 Code. The platform runtime is part of the
  T3 Code package, not a separately installed CLI.
