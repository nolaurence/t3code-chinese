## ADDED Requirements

### Requirement: T3-owned Skills ship with the application

The desktop and server distributions SHALL include versioned, immutable T3-owned Skill resources required by bundled capabilities.

#### Scenario: Build a release artifact

- **WHEN** the server and desktop release artifacts are built
- **THEN** the `midscene-preview` Skill files SHALL be present on a real filesystem path readable by provider processes

### Requirement: Bundled capability runtime dependencies are validated before packaging

The desktop build MUST fail before invoking electron-builder when the staged Midscene capability is incomplete.

#### Scenario: Validate a desktop stage

- **WHEN** production dependencies and server resources have been copied into the desktop stage
- **THEN** the build SHALL resolve the bundled Skill, all imported `@midscene/core` entrypoints, `@midscene/shared`, Photon Node with its adjacent `photon_rs_bg.wasm`, `sharp`, and the target platform's native sharp and libvips modules from the staged layout

#### Scenario: Validate a Windows stage with WSL support

- **WHEN** a Windows artifact is staged
- **THEN** validation SHALL require both the target Windows sharp addon and the matching glibc Linux sharp addon and libvips runtime used by the WSL backend

#### Scenario: Validate a universal macOS stage

- **WHEN** a universal macOS artifact is staged
- **THEN** validation SHALL require both arm64 and x64 sharp addons and libvips runtimes

### Requirement: Bundled Skills are discovered without modifying user directories

The system MUST register bundled Skill roots with supported provider runtimes and MUST NOT copy or install them into user-managed Skill directories.

#### Scenario: Probe Codex capabilities

- **WHEN** T3 starts a Codex provider probe and lists Skills
- **THEN** the bundled Skill root SHALL be registered before `skills/list` so `midscene-preview` appears in the provider snapshot

#### Scenario: Start a Codex conversation

- **WHEN** T3 starts a Codex app-server session
- **THEN** the same bundled Skill root SHALL be registered before the thread is opened so explicit or implicit Skill invocation can load its content

#### Scenario: Upgrade T3

- **WHEN** the application is upgraded or rolled back
- **THEN** provider discovery SHALL use the Skill resources from that application version without leaving stale copies in `CODEX_HOME`

### Requirement: Bundled Skill metadata is valid

Every bundled Skill MUST contain valid `SKILL.md` metadata and matching Codex interface metadata.

#### Scenario: Validate the Skill during development

- **WHEN** repository validation runs for the bundled Skill
- **THEN** its name, description, interface display name, short description, and default prompt SHALL satisfy the Codex Skill format
