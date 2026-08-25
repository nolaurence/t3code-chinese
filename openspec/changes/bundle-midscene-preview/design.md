## Context

T3's built-in browser is owned by Electron `PreviewManager` and is already exposed to coding agents through authenticated MCP tools, `PreviewAutomationBroker`, a connected renderer host, and desktop IPC. Midscene 1.10 no longer publishes an MCP server, but its core SDK supports arbitrary interfaces defined by screenshots, dimensions, and an action space. The integration therefore belongs behind T3's MCP server rather than in an external CLI or CDP connection.

The server build externalizes ordinary third-party production dependencies and the desktop release stages and unpacks those dependencies. Midscene's shared runtime includes platform-specific `sharp`/libvips packages and Photon WASM, so preserving the normal package layout is important.

## Goals / Non-Goals

**Goals:**

- Provide Midscene semantic action, structured query, and visual assertion against the exact T3 preview tab assigned to the provider session.
- Preserve T3's authentication, tab routing, action serialization, human interruption, diagnostics, and packaging model.
- Ship a concise, version-matched Skill that teaches Codex when to use Midscene and when to prefer deterministic preview tools.
- Keep missing model configuration and Midscene loading failures isolated to semantic tool calls.

**Non-Goals:**

- Do not expose Electron remote debugging, raw CDP, `WebContents`, or browser-level target identifiers.
- Do not bundle `@midscene/web`, Puppeteer, Playwright browsers, the Chrome extension, Bridge mode, Playground, or the Midscene CLI.
- Do not replace the existing `preview_*` tools or add a model-configuration settings UI in the first increment.
- Do not write Midscene reports or caches into the user's working directory.

## Decisions

### Use `@midscene/core` as an external production dependency

Pin one exact Midscene version in `apps/server` and leave it external to `bin.mjs`. The desktop build's existing production install and ASAR-unpack path will distribute its JavaScript, native optional packages, and WASM. Load the Agent module dynamically on first semantic invocation. This avoids startup cost and preserves resource resolution.

Alternatives rejected:

- `@midscene/web`: duplicates browser ownership and adds Puppeteer, server, socket, and playground dependencies.
- Runtime `npx`: requires network access, permits version drift, and moves lifecycle outside T3.
- Bundler inlining: risks breaking native/WASM resource resolution and makes failures harder to diagnose.

### Run Midscene inside the T3 MCP server

Add a server service that constructs an invocation-bound Midscene custom interface. The interface captures the MCP invocation scope and optional `tabId`, and calls `PreviewAutomationBroker.invoke` for `status`, `snapshot`, `click`, `type`, `press`, and `scroll`. An input action uses coordinate click followed by focused typing under one semantic-operation lock.

The service exposes action, query, and assertion methods to focused MCP handlers. Each handler remains capability-scoped through the existing `preview` permission and returns schema-validated results or a dedicated Midscene error family.

An alternative child CLI was rejected because it would need to re-enter T3 over HTTP, duplicate authorization/session setup, and complicate cancellation and packaging.

### Advertise only actions T3 can execute safely

The custom action space initially exposes tap, input, keyboard press, and scroll. Hover, drag, file chooser, touch gestures, and arbitrary JavaScript are omitted until T3 has explicit, bounded operations for them. Midscene must plan within the advertised action space.

Coordinate scrolling uses a CDP `mouseWheel` input event so browser hit testing, iframe routing, and wheel listeners retain native semantics. Because older renderer hosts implement coordinate scrolling with different DOM behavior, the host advertises `coordinateScrollWheel` separately from the base `scroll` operation and the broker requires that feature before routing coordinate requests.

### Serialize semantic operations by environment and tab

Maintain a keyed semaphore for the lifetime of the server service. The key combines environment and the resolved tab identity, which already uniquely identifies the provider session's assigned target. The entire inner Midscene loop holds the permit, while existing `PreviewManager` serialization continues to protect each low-level control operation. Cancellation flows from the MCP request into Midscene and broker calls.

### Use environment configuration and T3-owned artifacts

The first increment uses Midscene's documented model environment variables. The default model requires API key, name, family, and base URL; the canonical `MIDSCENE_MODEL_BASE_URL` follows Midscene's precedence over legacy `OPENAI_BASE_URL`. Windows desktop launches copy only non-empty model-scoped variables into `WSLENV`, including planning and insight profiles, so the WSL server sees the same configuration without advertising unset names. Agent construction disables default reports unless T3 provides an explicit artifact path under application state. Errors redact secrets and report only missing variable names or provider diagnostics safe for the agent timeline. Assertion model or transport failures remain execution errors; only a completed negative observation becomes `pass: false`.

### Bundle the Skill as an immutable server resource

Keep the Skill source under `apps/server/src/bundled-skills/midscene-preview`. The server build copies it into `dist/bundled-skills`, which is included by the server package and unpacked in desktop artifacts. Register the resolved real path with Codex using `skills/extraRoots/set` after app-server initialization in both the provider-probe and conversation-session paths. Do not copy resources into `CODEX_HOME`.

The Skill contains only `SKILL.md` and `agents/openai.yaml`. It calls T3 MCP tools and does not execute scripts.

### Validate the staged runtime before electron-builder

After the staged production install, resolve Midscene's actual runtime chain from the stage: core entrypoints, shared image utilities, Photon Node and its adjacent WASM payload, sharp, and the exported native addon/libvips subpaths for every target architecture. Universal macOS checks both architectures. Windows checks its native addon plus the matching glibc Linux addon and libvips used by WSL. Validate the copied Skill at the same point. This catches missing pnpm optional dependencies or resource copies before ASAR assembly rather than relying only on broad unpack globs.

## Risks / Trade-offs

- **Native dependency packaging grows each platform artifact** -> Keep only `@midscene/core`, pin versions, and add target-platform smoke checks for module import and image processing.
- **Vision inference adds latency and model cost** -> Prefer deterministic preview tools, expose metrics where available, and keep one semantic request focused.
- **Screenshots leave the machine through the configured model provider** -> Require explicit model configuration, document this in tool/Skill descriptions, and never send T3 credentials or host state.
- **Custom interfaces do not receive every web-specific XPath/DOM optimization** -> Accept the trade-off for exact tab ownership; retain native locator tools for DOM-friendly tasks.
- **Bundled Skill visibility can differ between provider probe and live session** -> Register the same root in both initialization paths and test both.
- **Midscene API changes can break the adapter** -> Pin the exact core version and update runtime, adapter tests, and Skill together.

## Migration Plan

1. Add the dependency, adapter, tools, tests, and bundled Skill behind normal MCP tool availability.
2. Verify server typecheck/tests and target desktop packaging smoke tests.
3. Release without removing or changing existing preview tools; rollback removes only the new dependency, tools, and extra Skill root.

## Open Questions

- Whether a later settings UI should manage named Midscene model profiles rather than environment variables.
- Whether report generation should become a first-class browser artifact after the initial runtime path is stable.
