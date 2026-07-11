# 发布清单

本文档涵盖稳定版与每夜版桌面发布的统一工作流。

## 工作流执行的工作

- 工作流：`.github/workflows/release.yml`
- 触发条件：
  - 推送匹配 `v*.*.*` 的标签以发布稳定版
  - 每三小时运行一次每夜检查
  - 为任一频道手动执行 `workflow_dispatch`
- 首先运行质量门禁：lint、typecheck、test。
- 为两个频道并行构建四种产物：
  - macOS `arm64` DMG
  - macOS `x64` DMG
  - Linux `x64` AppImage
  - Windows `x64` NSIS 安装程序
- 发布一个包含全部生成文件的 GitHub Release。
  - `X.Y.Z` 后带后缀的稳定标签（例如 `1.2.3-alpha.1`）会发布为 GitHub 预发布版本。
  - 只有普通稳定版 `X.Y.Z` 会标记为仓库的最新版本。
  - 每夜构建始终是 GitHub 预发布版本，绝不会标记为最新版本。
  - 自动生成的发布说明固定比较同一频道中的上一个标签，因此稳定版与上一个稳定标签比较，每夜版与上一个每夜标签比较。
- 在发布产物中包含 Electron 自动更新元数据（例如 `latest*.yml`、`nightly*.yml` 和 `*.blockmap`）。
- 签名是可选的，并根据每个平台的机密自动检测。

## T3 Connect Relay 部署

Relay 是与客户端版本分开管理版本的共享控制平面。稳定版和每夜版客户端必须指向同一 Relay，确保用户切换发布频道时看到相同的已关联环境。

每次推送到 `main` 时，`.github/workflows/deploy-relay.yml` 都会部署 Alchemy `prod` 阶段。桌面发布独立构建，不需要 Relay 部署凭据或 `production` GitHub Actions 环境。

Relay 部署共享的必需仓库变量：

- `CLOUDFLARE_ACCOUNT_ID`
- `PLANETSCALE_ORGANIZATION`
- `AXIOM_ORG_ID`

Relay 部署共享的必需仓库机密：

- `CLOUDFLARE_API_TOKEN`
- `PLANETSCALE_API_TOKEN_ID`
- `PLANETSCALE_API_TOKEN`
- `AXIOM_TOKEN`

必需的 `production` 环境变量：

- `RELAY_API_ZONE_NAME`
- `RELAY_TUNNEL_ZONE_NAME`
- `CLERK_PUBLISHABLE_KEY`
- `CLERK_JWT_AUDIENCE`
- `CLERK_JWT_TEMPLATE`
- `CLERK_CLI_OAUTH_CLIENT_ID`
- `APNS_ENVIRONMENT`
- `APNS_TEAM_ID`
- `APNS_KEY_ID`
- `APNS_BUNDLE_ID`

可选的 `production` 环境变量：

- 覆盖派生的 `relay.<RELAY_API_ZONE_NAME>` 域名时使用 `RELAY_DOMAIN`

必需的 `production` 环境机密：

- `CLERK_SECRET_KEY`
- `APNS_PRIVATE_KEY`

Alchemy 在预置 Relay 阶段时使用账户范围的仓库凭据；它们不会绑定到 Relay Worker。生产部署使用 Axiom 个人访问令牌，因此 `AXIOM_TOKEN` 必须与 `AXIOM_ORG_ID` 一起提供。`prod` 阶段拥有保留的 PlanetScale 数据库。本地个人阶段从中预置隔离分支，绝不会由 CI 部署。生产环境将配置的 Relay API 和隧道 DNS 区域作为保留的 Cloudflare 资源接管。个人阶段引用生产环境拥有的区域。

开发人员在本地部署个人阶段，而不是通过拉取请求自动化：

```sh
vp run --filter t3code-relay deploy -- --stage "$USER" --env-file .env.local
```

## 每夜构建

- 工作流：`.github/workflows/release.yml`
- 触发条件：
  - 每三小时进行一次计划检查
  - 使用 `channel=nightly` 手动执行 `workflow_dispatch`
- 运行与标签发布流程相同的桌面质量门禁和产物矩阵。
- 仅发布 GitHub 预发布版本：
  - 标签格式：`nightly-vX.Y.Z-nightly.YYYYMMDD.<run_number>`
  - 发布名称包含短提交 SHA
  - `make_latest` 始终为 `false`
- 使用下一个稳定补丁版本作为每夜版基础。例如，`0.0.17` 会生成基于 `0.0.18-nightly.*` 的每夜版。
- 将 Electron 自动更新元数据发布到专用的 `nightly` 更新频道，使桌面用户能够独立于稳定版选择该轨道。
- 不将版本变更提交回 `main`。

## 桌面自动更新说明

- 运行时更新器：`apps/desktop/src/main.ts` 中的 `electron-updater`。
- 更新 UX：
  - 后台检查在启动延迟后运行，并按间隔重复。
  - 不自动下载或安装。
  - 有更新时，桌面 UI 显示火箭更新按钮；点击一次下载，下载完成后再次点击以重启并安装。
- 供应商：构建时配置的 GitHub Releases（`provider: github`）。
- 仓库 slug 来源：
  - 如果设置，使用 `T3CODE_DESKTOP_UPDATE_REPOSITORY`（格式为 `owner/repo`）。
  - 否则使用 GitHub Actions 的 `GITHUB_REPOSITORY`。
- 私有仓库临时认证变通方案：
  - 在桌面应用运行时环境中设置 `T3CODE_DESKTOP_UPDATE_GITHUB_TOKEN`（或 `GH_TOKEN`）。
  - 应用将其作为 `Authorization: Bearer <token>` 请求头传给更新器 HTTP 调用。
- 更新器要求的发布产物：
  - 平台安装程序（`.exe`、`.dmg`、`.AppImage`，以及作为 Squirrel.Mac 更新负载的 macOS `.zip`）
  - 频道元数据：稳定版使用 `latest*.yml`，每夜版使用 `nightly*.yml`
  - `*.blockmap` 文件（用于差分下载）
- macOS 元数据说明：
  - `electron-updater` 在稳定版读取 `latest-mac.yml`，在每夜版读取 `nightly-mac.yml`，两者都同时用于 Intel 和 Apple Silicon。
  - 工作流在发布 GitHub Release 前，将各架构的 Mac 清单合并为一个频道专用 Mac 清单。

## 0）无签名发布试运行

首先用此流程验证发布管线。

1. 确认此次测试不需要任何签名机密。
2. 创建测试标签：
   - `git tag v0.0.0-test.1`
   - `git push origin v0.0.0-test.1`
3. 等待 `.github/workflows/release.yml` 完成。
4. 验证 GitHub Release 包含所有平台产物。
5. 下载每个产物，并在各操作系统上进行基本安装检查。

## 1）Apple 签名和公证配置（macOS）

工作流使用的必需机密：

- `CSC_LINK`
- `CSC_KEY_PASSWORD`
- `APPLE_API_KEY`
- `APPLE_API_KEY_ID`
- `APPLE_API_ISSUER`
- `MACOS_PROVISIONING_PROFILE`（包含 Associated Domains、使用 base64 编码的预置描述文件）

必需的仓库变量：

- `APPLE_TEAM_ID`

可选的仓库变量：

- `CLERK_PASSKEY_RP_DOMAINS`：以逗号分隔的 RP 域覆盖值。默认情况下，构建会从生产 Clerk 可发布密钥推导域名。

清单：

1. Apple Developer 账户访问权限：
   - 团队有权创建 Developer ID 证书。
2. 为 `com.t3tools.t3code` 创建显式 App ID 并启用 Associated Domains。
3. 创建 `Developer ID Application` 证书，以及为该 App ID 启用 Associated Domains 的兼容预置描述文件。
4. 从钥匙串将证书和私钥导出为 `.p12`。
5. 对 `.p12` 进行 base64 编码，并存储为 `CSC_LINK`。
6. 对预置描述文件进行 base64 编码，并存储为 `MACOS_PROVISIONING_PROFILE`。
7. 将 `.p12` 导出密码存储为 `CSC_KEY_PASSWORD`，并将 `APPLE_TEAM_ID` 设置为 10 个字符的 Apple Developer Team ID。
8. 在 App Store Connect 中创建 API 密钥（团队密钥）。
9. 添加 API 密钥值：
   - `APPLE_API_KEY`：下载的 `.p8` 内容
   - `APPLE_API_KEY_ID`：Key ID
   - `APPLE_API_ISSUER`：Issuer ID
10. 按照 [T3 Connect Clerk 配置](../cloud/t3-connect-clerk.md#桌面通行密钥)完成 Clerk Native API 和 AASA 配置。
11. 重新运行标签发布，确认 macOS 产物已签名和公证，并包含预期的 `com.apple.developer.associated-domains` 权限。

说明：

- `APPLE_API_KEY` 以原始密钥文本形式存储在机密中。
- 工作流在运行时将其写入临时 `AuthKey_<id>.p8` 文件。
- 工作流解码 `MACOS_PROVISIONING_PROFILE`、使用 `security cms` 验证，并将其传递给桌面打包器。

## 2）Azure Trusted Signing 配置（Windows）

工作流使用的必需机密：

- `AZURE_TENANT_ID`
- `AZURE_CLIENT_ID`
- `AZURE_CLIENT_SECRET`
- `AZURE_TRUSTED_SIGNING_ENDPOINT`
- `AZURE_TRUSTED_SIGNING_ACCOUNT_NAME`
- `AZURE_TRUSTED_SIGNING_CERTIFICATE_PROFILE_NAME`
- `AZURE_TRUSTED_SIGNING_PUBLISHER_NAME`

清单：

1. 创建 Azure Trusted Signing 账户和证书配置文件。
2. 记录 ATS 值：
   - 端点
   - 账户名称
   - 证书配置文件名称
   - 发布者名称
3. 创建或选择 Entra 应用注册（服务主体）。
4. 向服务主体授予 Trusted Signing 所需权限。
5. 为服务主体创建客户端密钥。
6. 将上述 Azure 机密添加到 GitHub Actions 机密中。
7. 重新运行标签发布，确认 Windows 安装程序已签名。

## 3）持续发布清单

1. 确保 `main` 在 CI 中为绿色。
2. 按需增加应用版本。
3. 创建发布标签：`vX.Y.Z`。
4. 推送标签。
5. 验证工作流步骤：
   - 预检通过
   - 所有矩阵构建通过
   - 发布作业上传预期文件
6. 对下载的产物进行冒烟测试。

## 4）故障排除

- macOS 构建应签名但未签名：
  - 检查所有 Apple 机密和 `APPLE_TEAM_ID` 均已填充且非空。
  - 确认预置描述文件属于 `APPLE_TEAM_ID.com.t3tools.t3code` 且包含 Associated Domains。
- Windows 构建应签名但未签名：
  - 检查所有 Azure ATS 和认证机密均已填充且非空。
- 构建因签名错误失败：
  - 移除机密后重试，确认无签名路径仍可工作。
  - 再次检查证书或配置文件名称以及租户或客户端凭据。
