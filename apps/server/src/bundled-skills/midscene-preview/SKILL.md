---
name: midscene-preview
description: Control, inspect, query, and verify the T3 Code built-in browser with Midscene visual reasoning. Use for visually grounded interactions, Canvas or other non-semantic UI, structured page extraction, and visual assertions when deterministic preview locators are unavailable or insufficient.
---

# Midscene Preview

Use the T3 Code preview tools to operate the browser that is visible to the user.

## Workflow

1. Call `preview_status` first. If no automation-capable tab is attached, call `preview_open`.
2. Prefer deterministic `preview_*` tools with snapshot-provided locators for navigation, clicks, typing, keyboard input, scrolling, and waits.
3. Use `preview_midscene_act` only for a visually grounded interaction or a short semantic workflow that deterministic locators cannot express reliably.
4. Use `preview_midscene_query` for structured extraction from the visible page and `preview_midscene_assert` for one observable visual condition.
5. Run one browser operation at a time. Inspect the result before choosing the next operation.
6. Call `preview_snapshot` after completing the task to capture final evidence.

## Guardrails

- Keep all browser work in the built-in preview. Do not run `npx`, a browser CLI, Playwright, an external Chrome instance, a browser bridge, or raw CDP.
- Midscene sends the current preview screenshot to the configured model provider. Prefer deterministic preview tools when visual reasoning is unnecessary.
- Prefer a focused Midscene prompt with one clear outcome. Split unrelated actions and assertions into separate calls.
- Treat a false Midscene assertion as a valid observed result, not a tool failure.
- Report Midscene configuration errors directly, including missing model environment variables. The default model requires `MIDSCENE_MODEL_API_KEY`, `MIDSCENE_MODEL_NAME`, `MIDSCENE_MODEL_FAMILY`, and `MIDSCENE_MODEL_BASE_URL`; legacy `OPENAI_BASE_URL` is also accepted when the canonical variable is unset. A whitespace-only canonical value is invalid and overrides legacy. Do not work around configuration errors by launching another browser system.
- Summarize the completed interaction or extracted result and cite the final preview state.
