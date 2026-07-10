# CI 质量门禁

- `.github/workflows/ci.yml` 会在 Pull Request 以及推送到 `main` 时运行 `bun run lint`、`bun run typecheck` 和 `bun run test`。
- `.github/workflows/release.yml` 从单个 `v*.*.*` 标签构建 macOS（`arm64` 和 `x64`）、Linux（`x64`）与 Windows（`x64`）桌面产物，并发布一个 GitHub Release。
- 发布工作流只会在相应平台凭据存在时自动启用签名。macOS Passkey 构建还需要 `APPLE_TEAM_ID` 和 `MACOS_PROVISIONING_PROFILE` Secret；Windows 使用 Azure Trusted Signing。如果没有核心签名凭据，仍会发布未签名产物。
- 完整的发布和签名设置清单请参阅[发布检查清单](./release.md)。
