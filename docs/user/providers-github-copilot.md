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
- **No models appear**: confirm the token's account has GitHub Copilot access.
- **The SDK runtime cannot start**: reinstall or update T3 Code. The platform runtime is part of the
  T3 Code package, not a separately installed CLI.
