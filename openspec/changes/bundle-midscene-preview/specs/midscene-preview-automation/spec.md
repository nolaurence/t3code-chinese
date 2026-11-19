## ADDED Requirements

### Requirement: Semantic preview operations target the assigned T3 browser tab

The system SHALL expose semantic action, query, and assertion operations that execute against the same thread- and provider-session-scoped browser tab used by the existing `preview_*` tools.

#### Scenario: Execute a visual action

- **WHEN** an authenticated agent calls `preview_midscene_act` with a natural-language goal
- **THEN** Midscene SHALL observe and interact with the assigned T3 preview through `PreviewAutomationBroker` without launching or attaching to another browser

#### Scenario: Query visible page state

- **WHEN** an authenticated agent calls `preview_midscene_query` with a natural-language data request
- **THEN** the tool SHALL return a JSON-serializable result derived from the assigned preview

#### Scenario: Assert visible page state

- **WHEN** an authenticated agent calls `preview_midscene_assert` with a natural-language condition
- **THEN** the tool SHALL return Midscene's boolean observation and diagnostic reason, including `pass: false` as a successful tool result when the condition is not satisfied

#### Scenario: Assertion execution fails

- **WHEN** the model provider, network, or Midscene runtime fails while evaluating an assertion
- **THEN** the tool SHALL return a classified execution error rather than converting the failure into `pass: false` or exposing the raw upstream error as an assertion reason

### Requirement: Midscene uses the existing browser control boundary

The system MUST obtain screenshots and viewport dimensions and perform input through the existing broker, renderer host, IPC, and `PreviewManager` control path.

#### Scenario: Perform supported input

- **WHEN** Midscene invokes tap, text input, keyboard press, or scroll
- **THEN** the adapter SHALL translate the action to the corresponding existing preview automation operation

#### Scenario: Scroll at a visual coordinate

- **WHEN** Midscene requests scrolling at viewport coordinates
- **THEN** the desktop host SHALL dispatch a hit-tested CDP wheel event at those coordinates rather than guessing a DOM scroll container
- **AND** the server SHALL route the request only to a host that advertises the `coordinateScrollWheel` feature

#### Scenario: Coordinate wheel feature is unavailable

- **WHEN** a coordinate scroll targets a legacy host that advertises `scroll` but not `coordinateScrollWheel`
- **THEN** the server SHALL reject the request with an actionable capability error and SHALL NOT silently use legacy viewport scrolling

#### Scenario: Unsupported action

- **WHEN** Midscene requests an action that the adapter does not advertise
- **THEN** the system SHALL reject or re-plan the action rather than bypassing the broker with raw CDP

### Requirement: Semantic operations are isolated and cancellable

The system MUST prevent concurrent Midscene operations from interleaving on the same provider session and browser tab, and MUST stop an operation when its request scope is interrupted.

#### Scenario: Concurrent requests on one tab

- **WHEN** two semantic operations target the same provider session and tab concurrently
- **THEN** the system SHALL serialize their execution

#### Scenario: Invocation is interrupted

- **WHEN** the MCP invocation is cancelled, the host disconnects, the tab is replaced, or human control interrupts the browser action
- **THEN** the active Midscene operation SHALL terminate and return a classified diagnostic error

### Requirement: Midscene configuration failures do not affect T3 startup

The system SHALL lazily load and configure Midscene only when a semantic preview tool is invoked.

#### Scenario: Model configuration is missing

- **WHEN** a semantic preview tool is invoked without valid Midscene model configuration
- **THEN** that tool SHALL return an actionable configuration error while the server and deterministic preview tools remain available

#### Scenario: Resolve the default model endpoint

- **WHEN** the default Midscene model is configured
- **THEN** `MIDSCENE_MODEL_API_KEY`, `MIDSCENE_MODEL_NAME`, `MIDSCENE_MODEL_FAMILY`, and a non-empty `MIDSCENE_MODEL_BASE_URL` SHALL be required
- **AND** legacy `OPENAI_BASE_URL` SHALL satisfy the endpoint requirement only when the canonical variable is unset
- **AND** a whitespace-only canonical value SHALL remain invalid rather than falling back to the legacy value

#### Scenario: Run the backend in WSL

- **WHEN** a Windows desktop launches the server backend in WSL
- **THEN** every non-empty main, planning, and insight `MIDSCENE_*MODEL_*` setting plus the supported OpenAI and Anthropic compatibility variables SHALL cross the `wsl.exe` boundary through `WSLENV`
- **AND** unset or empty variables SHALL NOT be added to `WSLENV`

### Requirement: Deterministic preview tools remain preferred

The system SHALL preserve existing deterministic preview operations and SHALL describe Midscene as a visual or semantic fallback rather than a replacement for locator-based interaction.

#### Scenario: Stable locator is available

- **WHEN** the page snapshot provides a stable locator sufficient for the task
- **THEN** the bundled Skill SHALL direct the coding agent to prefer the existing focused preview operation
