# 脚本

- `bun run dev`：以 `turbo watch` 模式启动 contracts、server 和 web。
- `bun run dev:server`：只启动 WebSocket 服务端，使用 Bun 执行 TypeScript。
- `bun run dev:web`：只启动 Web 应用的 Vite 开发服务器。
- 开发命令默认将 `T3CODE_STATE_DIR` 设为 `~/.t3/dev`，使开发状态与桌面端及生产状态隔离。
- 可以在根目录开发命令后使用 `--` 覆盖等效的服务端 CLI 参数，例如：
  `bun run dev -- --base-dir ~/.t3-2`
- `bun run start`：运行生产服务端，将构建后的 Web 应用作为静态文件提供。
- `bun run build`：通过 Turbo 构建 contracts、Web 应用和服务端。
- `bun run typecheck`：对所有包执行严格 TypeScript 检查。
- `bun run test`：运行工作区测试。
- `bun run dist:desktop:artifact -- --platform <mac|linux|win> --target <target> --arch <arch>`：为指定平台、目标和架构构建桌面产物。
- `bun run dist:desktop:dmg`：将可分发的 macOS `.dmg` 构建到 `./release`。
- `bun run dist:desktop:dmg:x64`：构建 Intel macOS `.dmg`。
- `bun run dist:desktop:linux`：将 Linux AppImage 构建到 `./release`。
- `bun run dist:desktop:win`：将 Windows NSIS 安装包构建到 `./release`。

## 桌面端 `.dmg` 打包说明

- 默认构建未签名，也未经过公证，适合本地分发。
- DMG 构建使用 `assets/macos-icon-1024.png` 作为生产应用图标源。
- 桌面生产窗口从 `t3code://app/index.html` 加载打包后的界面，而不是 `127.0.0.1` 文档 URL。
- 桌面打包内容包含 `apps/server/dist`（`t3` 后端），并使用 WebSocket/API 流量的身份验证 Token 在 loopback 地址启动它。
- 测试人员首次在 macOS 上启动时，仍可右键点击应用并选择**打开**。
- 如需保留暂存文件以调试打包内容，请运行：`bun run dist:desktop:dmg -- --keep-stage`
- 配置好 CI/Secret 后，如需允许代码签名和公证，请增加：`--signed`。
- 已签名的 macOS 构建还需要 `T3CODE_APPLE_TEAM_ID` 和
  `T3CODE_MACOS_PROVISIONING_PROFILE`。Passkey RP 域名从
  `T3CODE_CLERK_PUBLISHABLE_KEY` 推导，除非使用 `T3CODE_CLERK_PASSKEY_RP_DOMAINS` 覆盖。
- Windows 的 `--signed` 使用 Azure Trusted Signing，并需要：
  `AZURE_TRUSTED_SIGNING_ENDPOINT`、`AZURE_TRUSTED_SIGNING_ACCOUNT_NAME`、
  `AZURE_TRUSTED_SIGNING_CERTIFICATE_PROFILE_NAME` 和 `AZURE_TRUSTED_SIGNING_PUBLISHER_NAME`。
- 还需要 Azure 身份验证环境变量，例如使用 Secret 的服务主体：
  `AZURE_TENANT_ID`、`AZURE_CLIENT_ID`、`AZURE_CLIENT_SECRET`。

## 运行多个开发实例

将 `T3CODE_DEV_INSTANCE` 设为任意值，可以按确定方式整体偏移所有开发端口。

- 默认端口：服务端 `3773`、Web `5733`
- 偏移后的端口：`base + offset`，其中 offset 根据 `T3CODE_DEV_INSTANCE` 计算哈希
- 示例：`T3CODE_DEV_INSTANCE=branch-a bun run dev:desktop`

如果不使用哈希而希望完全控制端口，请将 `T3CODE_PORT_OFFSET` 设为数字偏移量。
