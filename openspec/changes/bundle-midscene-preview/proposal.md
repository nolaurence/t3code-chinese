## Why

T3 Code already owns a reliable, authenticated automation path for its built-in browser, but coding agents can only drive that path with low-level preview operations. Bundling Midscene as a native semantic layer adds visual action, extraction, and assertion without launching another browser or exposing Electron CDP.

## What Changes

- Bundle a pinned `@midscene/core` runtime with the server production dependencies and load it only when a Midscene preview tool is called.
- Add a Midscene custom interface that maps screenshots, viewport size, clicks, input, keyboard presses, and scrolling onto `PreviewAutomationBroker` operations.
- Expose `preview_midscene_act`, `preview_midscene_query`, and `preview_midscene_assert` through the existing authenticated `t3-code` MCP server.
- Ship a T3-owned `midscene-preview` Skill and register its immutable resource directory with Codex app-server discovery.
- Keep the existing deterministic `preview_*` tools as the default path and use Midscene for visual grounding, Canvas-like interfaces, semantic extraction, and visual assertions.
- Add cancellation, per-tab serialization, configuration diagnostics, packaging coverage, and focused tests for the new runtime boundary.

## Capabilities

### New Capabilities

- `midscene-preview-automation`: Semantic visual interaction, extraction, and assertion against the T3-owned browser tab.
- `bundled-provider-skills`: Versioned T3-owned Skills distributed with the application and exposed to provider runtimes without modifying user Skill directories.

### Modified Capabilities

None.

## Impact

- `packages/contracts`: schema-only Midscene preview MCP inputs, outputs, and errors.
- `apps/server`: Midscene adapter/service, MCP tools and handlers, Codex Skill root registration, build resource copying, and production dependency.
- Desktop distribution: additional Midscene runtime dependencies and immutable Skill resources in the unpacked server artifact.
- Runtime configuration: uses Midscene's existing model environment variables; missing or invalid configuration remains isolated to Midscene tool calls.
- Compliance: Midscene and transitive image-processing license notices must remain covered by the desktop dependency distribution process.
