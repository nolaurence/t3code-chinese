# Pi Agent Integration and Tool Activity Localization Design

## Goal

Add Pi Coding Agent as a complete first-class desktop provider and localize the known, currently hard-coded tool activity labels in the conversation timeline for English and Simplified Chinese.

Mobile applications are out of scope.

## Decisions

- Pi runs as the user's externally installed `pi` CLI. The desktop package does not bundle Pi.
- T3 discovers `pi` from the environment and supports an explicit executable path in provider settings.
- T3 launches Pi with `--mode rpc` and communicates using strict LF-delimited JSONL.
- Each active T3 provider session owns one long-lived Pi RPC subprocess.
- Pi keeps its native trusted-workspace behavior: built-in tools execute without a T3 approval round trip.
- Pi extension UI requests for confirmation, selection, text input, and editor input are surfaced through T3's existing user-input flow when representable.
- Known tool activity semantics are translated in the Web presentation layer. Commands, paths, outputs, model text, and unknown extension tool names remain unchanged.

## Provider Architecture

The server adds a `piAgent` built-in driver following the existing provider-driver boundary. The driver owns settings decoding, executable discovery, provider status, model discovery, session creation, and adapter construction.

The runtime is split into focused units:

1. A Pi RPC process client owns spawning, LF-only JSONL framing, request correlation, event streaming, graceful abort, and process-exit handling.
2. A Pi event mapper converts Pi agent events into existing provider-neutral runtime events for assistant text, reasoning, tool lifecycle, errors, usage, and user-input requests.
3. A Pi adapter implements the existing `ProviderAdapter` contract and manages active Pi sessions by T3 thread ID.
4. A Pi driver registers the adapter and provider snapshot with the built-in registry.

The Web application must not branch on Pi when rendering conversations. It consumes the same provider-neutral activities used by Codex, Claude, OpenCode, Cursor, and Grok.

## Session Lifecycle

Starting a new T3 thread launches `pi --mode rpc` in the project working directory. Provider configuration may add an explicit binary path, agent home path, model, and environment variables. The process otherwise inherits the user's Pi configuration under `~/.pi/agent`.

After startup, T3 requests Pi state and available models. Sending a turn issues an RPC `prompt`. Steering or follow-up messages use the corresponding Pi RPC behavior when the existing T3 command indicates that intent. Stopping a turn sends `abort`; stopping a session closes stdin and terminates the process after a bounded graceful period.

T3 persists the Pi session identity in the existing provider-session binding. Rehydrating a thread starts Pi with the saved session selector and rebuilds the visible thread snapshot from Pi messages when necessary. A stale or missing Pi session produces a recoverable provider error instead of silently starting an unrelated conversation.

## Models and Capabilities

The provider exposes models returned by Pi's `get_available_models` RPC command. Model keys preserve both Pi provider and model ID so duplicate model IDs from different providers remain distinct. T3 maps supported Pi thinking levels to existing reasoning-effort options.

Pi advertises text, image input, session resume, stop, tool activity, and model selection capabilities when available. It does not advertise command/file approval capabilities because Pi built-in tools execute directly. The provider settings UI explains this trusted-workspace behavior.

## Event Mapping

Pi message and agent lifecycle events are mapped as follows:

- Assistant text deltas and final text become existing assistant message events.
- Thinking deltas become existing reasoning events.
- `tool_execution_start`, updates, and completion become provider-neutral tool lifecycle activities with stable tool call IDs.
- Pi `read`, `write`, `edit`, `bash`, `grep`, `find`, and `ls` calls carry canonical request kinds and structured data so the current timeline can choose icons, previews, and changed-file presentation.
- Agent completion closes the T3 turn and records usage when Pi provides it.
- Agent errors and unexpected process exits become runtime errors associated with the active turn.
- Supported extension UI requests become T3 user-input requests and the answer is returned with `extension_ui_response`.
- Unsupported presentational extension UI methods such as widgets and title changes are ignored or logged without failing the turn.

Raw Pi RPC payloads remain server-side diagnostic data and are not rendered directly as trusted UI text.

## Tool Activity Localization

The localization boundary is a pure Web presentation helper. It receives a work-log entry plus the translation function and returns a localized heading for known semantics.

Localization covers:

- Built-in actions: read file, write file, edit file, run command, search files, find files, list directory, web search, view image, and generic tool call.
- Lifecycle suffixes and fallback labels: running, completed, failed, declined, and stopped.
- Generic expanded-body labels such as MCP call where they are UI-owned text.

The helper first uses structured fields such as request kind, item type, lifecycle status, and canonical Pi tool name. It only falls back to matching known provider-generated English labels for compatibility with existing stored activities. Arbitrary model-generated summaries and unknown extension tool names are not translated.

English remains the source locale and Simplified Chinese receives equivalent keys. Translation must not change collapse keys or activity identity, so switching languages cannot split or merge tool lifecycle rows differently.

## Errors and Recovery

- Missing Pi binary: provider status is unavailable and includes the configured installation command.
- Invalid executable path or unsupported Pi version: provider status includes the probe failure without crashing server startup.
- Invalid JSONL: the malformed line is logged and the active request fails with a protocol error; subsequent process state is not trusted.
- Request timeout: the correlated RPC request fails and the session is stopped.
- Unexpected exit: all pending RPC requests fail, the active turn receives one terminal error, and the adapter removes the dead session.
- Resume target missing: T3 reports a recoverable session error and does not create a new unrelated Pi history.
- Abort timeout: T3 terminates the child process and marks the turn stopped.

## Testing

Development follows test-first cycles.

- Contract tests cover Pi settings and model/provider identifiers.
- RPC client tests use a deterministic child-process fixture to cover LF framing, correlation, malformed messages, abort, timeout, and process exit.
- Event mapper tests cover text, reasoning, every built-in tool category, completion, error, usage, and extension input.
- Adapter tests cover start, continue, prompt, stop, resume, session cleanup, and model selection.
- Driver/provider tests cover discovery, explicit binary path, status, capabilities, and model snapshots.
- Web tests cover English and Chinese headings, lifecycle states, unknown-tool passthrough, and language-independent collapse behavior.
- Repository completion gates are `vp check` and `vp run typecheck`; focused tests run through `vp test`.

## Out of Scope

- Bundling or automatically installing Pi in the desktop artifact.
- Adding a T3 approval layer around Pi built-in tools.
- Mobile UI or mobile provider support.
- Translating model output, shell commands, paths, file contents, tool output, or third-party extension names.
- Reimplementing Pi's model authentication or configuration UI inside T3.
