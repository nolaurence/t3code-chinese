## 1. Runtime Contracts And Dependency

- [x] 1.1 Add schema-only Midscene preview inputs, results, and classified errors to `packages/contracts`
- [x] 1.2 Add a pinned `@midscene/core` server production dependency and verify the lockfile/native dependency set

## 2. Midscene Preview Runtime

- [x] 2.1 Implement the invocation-bound Midscene custom interface over `PreviewAutomationBroker`
- [x] 2.2 Implement lazy Midscene Agent loading, complete model endpoint diagnostics, cancellation, and per-target serialization
- [x] 2.3 Add focused unit tests for action mapping, semantic results, errors, and concurrency
- [x] 2.4 Preserve ordinary negative assertions as `pass: false` while classifying model/runtime assertion failures as execution errors

## 3. MCP Integration

- [x] 3.1 Define and register `preview_midscene_act`, `preview_midscene_query`, and `preview_midscene_assert`
- [x] 3.2 Implement handlers and layer wiring through the existing preview capability boundary
- [x] 3.3 Add MCP toolkit and handler tests for success and failure behavior

## 4. Bundled Skill

- [x] 4.1 Initialize and author the `midscene-preview` Skill with matching Codex interface metadata
- [x] 4.2 Copy bundled Skill resources into the server distribution and validate them during tests
- [x] 4.3 Register the bundled Skill root in Codex provider probes and live app-server sessions with discovery tests

## 5. Packaging And Verification

- [x] 5.1 Add a pre-packaging stage gate that resolves the bundled Skill, Midscene entrypoints, Photon WASM, and target native sharp/libvips modules, including universal macOS and Windows+WSL layouts
- [x] 5.2 Forward only configured Midscene model profiles and compatibility variables into WSL with focused tests
- [x] 5.3 Dispatch coordinate scrolling as a negotiated CDP wheel feature and reject incompatible legacy hosts
- [x] 5.4 Run Skill validation, OpenSpec validation, focused tests, `vp check`, and `vp run typecheck`
- [x] 5.5 Review the final diff for unrelated changes and document residual cross-platform packaging risk
