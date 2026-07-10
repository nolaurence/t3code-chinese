# Desktop Bilingual UI and Chinese Documentation Design

## Summary

Add an English and Simplified Chinese language switch to the desktop application, translate all desktop product copy, publish a mirrored Simplified Chinese documentation tree, and make repository-facing README links point to this fork.

This change applies to the desktop application UI implemented in `apps/web`. It does not include `apps/mobile` or `apps/marketing`.

## Goals

- Let users switch the desktop UI between English and Simplified Chinese from Settings.
- Apply language changes immediately and preserve the selection across restarts.
- Translate all product-owned, user-visible desktop copy, including accessibility labels.
- Preserve the existing English documentation and add a complete Chinese mirror under `docs/zh-CN/`.
- Preserve the English root README, add `README.zh-CN.md`, and link both language versions together.
- Update repository links in the root README files to target `nolaurence/t3code-chinese` instead of the upstream fork source.

## Non-Goals

- Translating the native mobile application.
- Translating the marketing site.
- Supporting locales other than `en` and `zh-CN`.
- Automatically detecting the operating system language.
- Translating user content, model names, paths, branch names, commands, command output, Git content, or raw provider/server errors.
- Building a general-purpose localization framework for future languages.

## Localization Architecture

The Web application will own a small, internal localization module under `apps/web/src/i18n/`. It will expose:

- a fixed `Locale` union containing `en` and `zh-CN`;
- pure functions for locale parsing, message lookup, interpolation, and persistence;
- a React provider that owns the active locale;
- a hook for components that need translated messages;
- an imperative translation function for product copy created outside React components.

Message catalogs will be split by product domain, such as common UI, settings, chat, source control, terminal, preview, connections, and errors. English resources define the complete message-key contract. Simplified Chinese resources must satisfy the same TypeScript shape so missing or extra keys fail type checking.

Only the currently required interpolation behavior will be implemented. Dynamic values will be passed separately from translated message templates. No pluralization framework, locale negotiation, or remote resource loading will be added.

If a lookup cannot resolve a Chinese message, it will return the English message. Localization failures must not prevent the application from rendering.

## Locale Lifecycle

The default locale is English. The selected locale will be stored as a client-only local preference using the repository's safe browser persistence conventions.

At application startup:

1. Read the persisted locale.
2. Accept only `en` or `zh-CN`.
3. Fall back to `en` when storage is unavailable, corrupted, or contains an unknown value.
4. Set the active locale before the routed application renders.
5. Synchronize the document root `lang` attribute with the active locale.

When the user selects another language, the provider updates immediately, persists the new value, and updates `document.documentElement.lang`. A storage write failure is logged but does not roll back the visible language change.

## Settings Experience

Add an "Interface language" row to Settings > General near the theme and time-format preferences. The row uses the existing Select component and offers:

- English
- 简体中文

The option labels remain recognizable in either active language. The setting participates in the existing Restore defaults behavior; restoring defaults selects English.

All surrounding Settings navigation, titles, descriptions, controls, dialogs, notifications, and accessibility labels will use the localization layer.

## Desktop Copy Migration

All product-owned desktop copy in `apps/web` will move to the message catalogs. This includes:

- navigation and settings;
- project and thread actions;
- chat composer controls and status text;
- approvals and user-input prompts;
- Git, diff, review, and pull-request UI;
- terminal and preview UI;
- provider, connection, authentication, and update flows;
- empty, loading, warning, and failure states;
- tooltips, placeholders, confirmation prompts, toast messages, and accessibility labels.

Values supplied by users, tools, providers, Git, the file system, or server processes remain unchanged. Product-owned framing around those values is translated. For example, a translated failure title may be shown beside an unchanged raw provider error.

Migration will favor shared messages for genuinely identical concepts while retaining distinct keys when context changes meaning. Translation logic will not be implemented through DOM text replacement or mutation observers.

## Chinese Documentation

Create `docs/zh-CN/` as a path-for-path mirror of the existing documentation set. Every Markdown and HTML document currently under `docs/` will have a Chinese counterpart, excluding generated planning artifacts under `docs/superpowers/`.

Translations will preserve:

- shell commands and code blocks;
- package, API, type, symbol, environment-variable, and configuration names;
- file-system paths and URLs;
- relative link targets, adjusted only when needed to remain inside the Chinese documentation tree;
- Mermaid participant and node identifiers required by diagram syntax.

Headings, prose, list descriptions, callouts, table labels, and visible diagram text will be translated. The Chinese documentation index will link only to Chinese counterparts when one exists.

## README Structure and Repository Links

Keep `README.md` as the English entry point and add `README.zh-CN.md` as the Simplified Chinese entry point. Each file will contain a language link at the top that points to the other version.

The English README will continue to link to English documentation. The Chinese README will link to `docs/zh-CN/` documents. Repository-owned GitHub links, including Releases, will target:

`https://github.com/nolaurence/t3code-chinese`

Third-party product, installer, documentation, and community links will remain unchanged unless they incorrectly refer to the upstream repository.

## Reliability and Error Handling

- Invalid locale values fall back to English.
- Missing translations fall back to the matching English message.
- Storage read and write failures are non-fatal.
- Dynamic interpolation values are converted safely and must not be evaluated as markup.
- Translation catalogs are bundled with the application; language switching does not require network access.
- Locale changes do not reset session, editor, terminal, or connection state.

## Testing and Verification

Implementation follows test-driven development for runtime behavior:

1. Add failing unit tests for locale validation, persistence fallback, message fallback, interpolation, and document-language synchronization.
2. Add catalog-contract tests that prove English and Chinese resources contain matching keys.
3. Add a failing React test proving that changing locale rerenders translated product copy.
4. Add a failing Settings test proving the language selector is exposed and persists changes.
5. Implement the minimum localization runtime and UI integration needed to pass those tests.
6. Migrate product copy by domain, running targeted Web tests after each group.
7. Verify links in both documentation trees and both README files.

Before completion, run:

```bash
vp test
vp check
vp run typecheck
```

Native mobile code is not changed, so `vp run lint:mobile` is not required.

## Acceptance Criteria

- A desktop user can select English or Simplified Chinese in Settings > General.
- The complete product-owned desktop interface changes language without reloading.
- The selected language survives an application restart.
- English remains the reliable default and runtime fallback.
- All existing non-localized dynamic content remains byte-for-byte unchanged.
- `docs/zh-CN/` contains a Chinese counterpart for every in-scope English documentation file.
- `README.md` and `README.zh-CN.md` link to each other and to the correct documentation language.
- Repository links no longer point to `pingdotgg/t3code` where this fork should be the target.
- Required tests, `vp check`, and `vp run typecheck` pass.
