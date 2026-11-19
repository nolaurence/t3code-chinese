---
name: midscene-preview
description: Control, inspect, query, and verify the T3 Code built-in browser with deterministic preview tools and optional Midscene visual reasoning. Use Midscene only when its provider model is configured; otherwise continue with deterministic preview tools.
---

# Midscene Preview

Use the T3 Code preview tools to operate the browser that is visible to the user.

## Workflow

1. Call `preview_status` first. If no automation-capable tab is attached, call `preview_open`.
2. Prefer deterministic `preview_*` tools with snapshot-provided locators for navigation, clicks, typing, keyboard input, scrolling, and waits.
3. Use `preview_midscene_*` tools only when Midscene is known to be configured through T3 Code provider settings. If configuration is unknown, do not call Midscene merely to probe it; continue with deterministic tools.
4. When configured, use `preview_midscene_act` only for a visually grounded interaction or a short semantic workflow that deterministic locators cannot express reliably.
5. When configured, use `preview_midscene_query` for structured extraction from the visible page and `preview_midscene_assert` for one observable visual condition.
6. If a Midscene call reports missing configuration or an unavailable runtime, do not retry it during the current task. Continue in the same built-in browser with deterministic `preview_*` tools. Mention the unavailable optional enhancement only when the deterministic fallback cannot complete the requested work.
7. Run one browser operation at a time. Inspect the result before choosing the next operation.
8. Call `preview_snapshot` after completing the task to capture final evidence.

## Guardrails

- Keep all browser work in the built-in preview. Do not run `npx`, a browser CLI, Playwright, an external Chrome instance, a browser bridge, or raw CDP.
- Midscene sends the current preview screenshot to the configured model provider. Prefer deterministic preview tools when visual reasoning is unnecessary.
- Prefer a focused Midscene prompt with one clear outcome. Split unrelated actions and assertions into separate calls.
- Treat a false Midscene assertion as a valid observed result, not a tool failure.
- Midscene is an optional enhancement. Missing Midscene model settings must not block deterministic browser work. Configuration requires an API key, model name, model family, and base URL in T3 Code provider settings or the corresponding server environment variables.
- Summarize the completed interaction or extracted result and cite the final preview state.
