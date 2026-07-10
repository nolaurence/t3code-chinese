# 桌面端中英文界面与中文文档实施计划

> **供智能体执行：** 必须使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans` 按任务逐项实施。本计划使用复选框（`- [ ]`）跟踪进度。

**目标：** 为桌面端 Web 界面提供可持久化的英文/简体中文切换，完整迁移产品文案，并新增中文文档树和中文 README。

**架构：** 在 `apps/web/src/i18n/` 内实现固定双语词典、纯翻译函数和 React 上下文；英文词典定义键集合，中文词典由 TypeScript 保证键一致。语言选择保存在本地存储，默认和异常回退均为英文；界面组件只翻译产品文案，不改写外部动态内容。

**技术栈：** TypeScript、React 19、`useSyncExternalStore`/Context、Effect Schema、Vite+ Test、Markdown、HTML。

---

## 文件结构

- 新建 `apps/web/src/i18n/locale.ts`：语言类型、解析、存储和 `<html lang>` 同步。
- 新建 `apps/web/src/i18n/messages.ts`：双语词典定义辅助函数、分区词典合并和键类型。
- 新建 `apps/web/src/i18n/I18nProvider.tsx`：React 上下文、`useI18n()` 和语言更新。
- 新建 `apps/web/src/i18n/index.ts`：国际化模块的稳定导出面。
- 新建 `apps/web/src/i18n/locale.test.ts`、`messages.test.ts`、`I18nProvider.test.tsx`：运行时行为测试。
- 修改 `apps/web/src/AppRoot.tsx`、`AppRoot.test.tsx`：为整个桌面渲染树安装 Provider。
- 修改 `apps/web/src/components/settings/*` 和 `apps/web/src/routes/settings.tsx`：增加语言选择并翻译设置区域。
- 修改 `apps/web/src/components`、`apps/web/src/browser`、`apps/web/src/cloud`、`apps/web/src/routes` 中含产品文案的文件：按功能域接入词典。
- 新建 `docs/zh-CN/`：镜像翻译现有产品文档。
- 修改 `README.md`，新建 `README.zh-CN.md`：增加语言入口并修正仓库链接。

### 任务 1：国际化核心运行时

**文件：**

- 新建：`apps/web/src/i18n/locale.test.ts`
- 新建：`apps/web/src/i18n/messages.test.ts`
- 新建：`apps/web/src/i18n/locale.ts`
- 新建：`apps/web/src/i18n/messages.ts`
- 新建：`apps/web/src/i18n/index.ts`

- [ ] **步骤 1：先编写语言解析、存储回退和文档语言同步测试**

测试必须覆盖：未知值返回 `en`、`zh-CN` 保持不变、读取异常返回 `en`、写入异常不抛出、同步后 `document.documentElement.lang` 等于目标语言。

```ts
expect(parseLocale("zh-CN")).toBe("zh-CN");
expect(parseLocale("fr")).toBe("en");
expect(readLocalePreference(failingStorage)).toBe("en");
expect(() => writeLocalePreference("zh-CN", failingStorage)).not.toThrow();
syncDocumentLocale("zh-CN", documentStub);
expect(documentStub.documentElement.lang).toBe("zh-CN");
```

- [ ] **步骤 2：运行测试并确认因模块不存在而失败**

运行：`vp test apps/web/src/i18n/locale.test.ts apps/web/src/i18n/messages.test.ts`

预期：测试失败，错误指出 `./locale` 或 `./messages` 不存在。

- [ ] **步骤 3：实现固定双语语言模型和安全持久化**

核心接口固定为：

```ts
export type Locale = "en" | "zh-CN";
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_STORAGE_KEY = "t3code:locale";
export function parseLocale(value: unknown): Locale;
export function readLocalePreference(storage?: Pick<Storage, "getItem">): Locale;
export function writeLocalePreference(locale: Locale, storage?: Pick<Storage, "setItem">): boolean;
export function syncDocumentLocale(
  locale: Locale,
  target?: Pick<Document, "documentElement">,
): void;
```

读取和写入失败使用 `console.error` 记录不含存储内容的固定错误描述，函数保持非抛出行为。

- [ ] **步骤 4：实现类型安全词典和安全插值**

`defineMessages()` 在每个功能域内接收英文对象和键完全一致的中文对象；`translate(locale, key, values)` 只替换 `{name}` 形式的占位符，并用 `String(value)` 转换动态值。

```ts
const common = defineMessages(
  { "common.cancel": "Cancel", "common.save": "Save" },
  { "common.cancel": "取消", "common.save": "保存" },
);

expect(translate("zh-CN", "common.cancel")).toBe("取消");
expect(translate("zh-CN", "common.files", { count: 2 })).toContain("2");
```

模块同时导出供 Provider 和组件复用的函数类型：

```ts
export type TranslateValues = Readonly<Record<string, string | number>>;
export type Translate = (key: MessageKey, values?: TranslateValues) => string;
```

- [ ] **步骤 5：运行核心测试并确认通过**

运行：`vp test apps/web/src/i18n/locale.test.ts apps/web/src/i18n/messages.test.ts`

预期：全部通过，输出无未处理异常。

- [ ] **步骤 6：提交核心运行时**

```bash
git add apps/web/src/i18n
git commit -m "feat(web): add bilingual localization runtime"
```

### 任务 2：React Provider 与应用根节点

**文件：**

- 新建：`apps/web/src/i18n/I18nProvider.test.tsx`
- 新建：`apps/web/src/i18n/I18nProvider.tsx`
- 修改：`apps/web/src/i18n/index.ts`
- 修改：`apps/web/src/AppRoot.tsx`
- 修改：`apps/web/src/AppRoot.test.tsx`

- [ ] **步骤 1：先编写 Provider 双语渲染和根节点安装测试**

使用 `renderToStaticMarkup` 分别传入 `initialLocale="en"` 和 `initialLocale="zh-CN"`，子组件通过 `useI18n().t("common.cancel")` 渲染，断言输出分别包含 `Cancel` 和 `取消`。更新 `AppRoot.test.tsx`，断言最外层为 `I18nProvider`，其内部仍只有一个 `AppAtomRegistryProvider`，并保持路由与桌面 Host 的共享注册表关系。

- [ ] **步骤 2：运行测试并确认 Provider 尚不存在**

运行：`vp test apps/web/src/i18n/I18nProvider.test.tsx apps/web/src/AppRoot.test.tsx`

预期：失败并指出 `I18nProvider` 尚未导出或根节点类型不匹配。

- [ ] **步骤 3：实现 Provider 和 Hook**

```ts
export interface I18nValue {
  readonly locale: Locale;
  readonly setLocale: (locale: Locale) => void;
  readonly t: Translate;
}

export function I18nProvider(props: {
  readonly children: ReactNode;
  readonly initialLocale?: Locale;
}): ReactElement;

export function useI18n(): I18nValue;
```

Provider 初始化时读取持久化语言；`setLocale` 先更新状态，再写存储并同步 `<html lang>`。`initialLocale` 仅供测试和受控启动使用。

- [ ] **步骤 4：包裹整个应用渲染树并通过测试**

`AppRoot` 的结构应为：

```tsx
<I18nProvider>
  <AppAtomRegistryProvider>
    <RouterProvider router={router} />
    <PreviewAutomationHosts />
    <ElectronBrowserHost />
  </AppAtomRegistryProvider>
</I18nProvider>
```

运行：`vp test apps/web/src/i18n/I18nProvider.test.tsx apps/web/src/AppRoot.test.tsx`

预期：全部通过。

- [ ] **步骤 5：提交 Provider 集成**

```bash
git add apps/web/src/i18n apps/web/src/AppRoot.tsx apps/web/src/AppRoot.test.tsx
git commit -m "feat(web): install localization provider"
```

### 任务 3：语言设置与设置区域翻译

**文件：**

- 新建：`apps/web/src/components/settings/LanguageSettings.test.tsx`
- 新建：`apps/web/src/components/settings/LanguageSettings.tsx`
- 修改：`apps/web/src/components/settings/SettingsPanels.tsx`
- 修改：`apps/web/src/components/settings/SettingsSidebarNav.tsx`
- 修改：`apps/web/src/components/settings/settingsLayout.tsx`
- 修改：`apps/web/src/components/settings/AddProviderInstanceDialog.tsx`
- 修改：`apps/web/src/components/settings/ConnectionsSettings.tsx`
- 修改：`apps/web/src/components/settings/DiagnosticsSettings.tsx`
- 修改：`apps/web/src/components/settings/KeybindingsSettings.tsx`
- 修改：`apps/web/src/components/settings/ProviderAccentColorPicker.tsx`
- 修改：`apps/web/src/components/settings/ProviderInstanceCard.tsx`
- 修改：`apps/web/src/components/settings/ProviderModelsSection.tsx`
- 修改：`apps/web/src/components/settings/SourceControlSettings.tsx`
- 修改：`apps/web/src/routes/settings.tsx`
- 修改：`apps/web/src/i18n/messages.ts`

- [ ] **步骤 1：先编写语言设置渲染测试**

测试 `LanguageSettings` 在英文环境渲染 `Interface language`，在中文环境渲染 `界面语言`，并验证选项值固定为 `en` 和 `zh-CN`。导出纯函数 `applyLanguageSelection(value, setLocale)`，断言传入 `zh-CN` 时调用 `setLocale("zh-CN")`，传入未知值时不调用。

- [ ] **步骤 2：运行测试并确认组件不存在**

运行：`vp test apps/web/src/components/settings/LanguageSettings.test.tsx`

预期：失败并指出 `LanguageSettings` 尚不存在。

- [ ] **步骤 3：实现语言设置行并接入恢复默认设置**

组件复用 `SettingsRow`、`Select`、`SelectItem` 和 `useI18n()`；英文选项显示 `English`，中文选项显示 `简体中文`。`useSettingsRestore()` 将当前语言纳入 `changedSettingLabels`，执行恢复时调用 `setLocale("en")`。

- [ ] **步骤 4：迁移设置区域全部产品文案**

将本任务文件中标题、说明、按钮、占位符、确认提示、Toast、工具提示和 `aria-label` 迁入 `settings.*`、`providers.*`、`connections.*`、`sourceControl.*` 词典。动态路径、供应商名称、模型名称和原始错误保持原样，通过插值值传入。

- [ ] **步骤 5：运行设置和国际化测试**

运行：`vp test apps/web/src/components/settings/LanguageSettings.test.tsx apps/web/src/i18n`

预期：全部通过。

- [ ] **步骤 6：提交设置区域**

```bash
git add apps/web/src/components/settings apps/web/src/routes/settings.tsx apps/web/src/i18n
git commit -m "feat(web): add language setting and translate settings"
```

### 任务 4：应用外壳、侧栏和通用操作翻译

**文件：**

- 修改：`apps/web/src/routes/__root.tsx`
- 修改：`apps/web/src/components/Sidebar.tsx`
- 修改：`apps/web/src/components/NoActiveThreadState.tsx`
- 修改：`apps/web/src/components/CommandPalette.tsx`
- 修改：`apps/web/src/components/BranchToolbar.tsx`
- 修改：`apps/web/src/components/BranchToolbarBranchSelector.tsx`
- 修改：`apps/web/src/components/BranchToolbarEnvModeSelector.tsx`
- 修改：`apps/web/src/components/BranchToolbarEnvironmentSelector.tsx`
- 修改：`apps/web/src/components/ProjectScriptsControl.tsx`
- 修改：`apps/web/src/components/sidebar/SidebarProviderUpdatePill.tsx`
- 修改：`apps/web/src/components/sidebar/SidebarUpdatePill.tsx`
- 修改：`apps/web/src/i18n/messages.ts`

- [ ] **步骤 1：先为通用状态格式化函数增加失败测试**

为命令面板、侧栏更新状态和路由错误的纯格式化函数增加语言参数测试，断言 `zh-CN` 返回中文产品文案，插入的项目名、版本号和原始错误不变。

- [ ] **步骤 2：确认新增断言在迁移前失败**

运行：`vp test apps/web/src/components/CommandPalette.logic.test.ts apps/web/src/components/ProviderUpdateLaunchNotification.logic.test.ts`

预期：中文断言失败，当前函数仍返回英文。

- [ ] **步骤 3：迁移应用外壳和侧栏文案**

组件内通过 `useI18n()` 获取 `t`；模块级静态数组改为接收 `t` 的工厂函数，避免在 Hook 之外读取当前语言。所有按键 ID、路由、项目名和服务器错误作为动态值保留。

- [ ] **步骤 4：运行相关单元测试并提交**

运行：`vp test apps/web/src/components/CommandPalette.logic.test.ts apps/web/src/components/Sidebar.logic.test.ts apps/web/src/components/ProviderUpdateLaunchNotification.logic.test.ts`

```bash
git add apps/web/src/routes/__root.tsx apps/web/src/components apps/web/src/i18n/messages.ts
git commit -m "feat(web): translate desktop shell and navigation"
```

### 任务 5：聊天、审批和计划界面翻译

**文件：**

- 修改：`apps/web/src/components/ChatMarkdown.tsx`
- 修改：`apps/web/src/components/PlanSidebar.tsx`
- 修改：`apps/web/src/components/chat/ChangedFilesTree.tsx`
- 修改：`apps/web/src/components/chat/ChatComposer.tsx`
- 修改：`apps/web/src/components/chat/ChatHeader.tsx`
- 修改：`apps/web/src/components/chat/CompactComposerControlsMenu.tsx`
- 修改：`apps/web/src/components/chat/ComposerPendingApprovalActions.tsx`
- 修改：`apps/web/src/components/chat/ComposerPendingApprovalPanel.tsx`
- 修改：`apps/web/src/components/chat/ComposerPendingUserInputPanel.tsx`
- 修改：`apps/web/src/components/chat/ContextWindowMeter.tsx`
- 修改：`apps/web/src/components/chat/MessageCopyButton.tsx`
- 修改：`apps/web/src/components/chat/MessagesTimeline.tsx`
- 修改：`apps/web/src/components/chat/OpenInPicker.tsx`
- 修改：`apps/web/src/components/chat/ProposedPlanCard.tsx`
- 修改：`apps/web/src/components/chat/TraitsPicker.tsx`
- 修改：`apps/web/src/i18n/messages.ts`

- [ ] **步骤 1：先扩展已有聊天渲染测试**

在 `MessagesTimeline.test.tsx`、`ChangedFilesTree.test.tsx` 和对应逻辑测试中增加中文环境断言，覆盖状态标签、复制操作、审批按钮、计划状态和文件计数；消息正文、文件名和工具输出保持原样。

- [ ] **步骤 2：运行新增测试并确认中文断言失败**

运行：`vp test apps/web/src/components/chat`

预期：新增中文断言失败，既有英文断言继续通过。

- [ ] **步骤 3：迁移聊天区域产品文案**

将静态文案迁入 `chat.*`、`approval.*`、`plan.*` 词典。数量文本使用显式的单数键和复数键，不引入通用复数框架。工具调用内容、代码块、用户消息和助手消息不得传入 `t()`。

- [ ] **步骤 4：运行聊天测试并提交**

运行：`vp test apps/web/src/components/chat apps/web/src/components/ChatView.logic.test.ts apps/web/src/proposedPlan.test.ts`

```bash
git add apps/web/src/components/chat apps/web/src/components/ChatMarkdown.tsx apps/web/src/components/PlanSidebar.tsx apps/web/src/i18n/messages.ts
git commit -m "feat(web): translate chat and approval workflows"
```

### 任务 6：Git、差异、终端、文件和预览界面翻译

**文件：**

- 修改：`apps/web/src/components/DiffPanel.tsx`
- 修改：`apps/web/src/components/GitActionsControl.tsx`
- 修改：`apps/web/src/components/PullRequestThreadDialog.tsx`
- 修改：`apps/web/src/components/RightPanelTabs.tsx`
- 修改：`apps/web/src/components/ThreadTerminalDrawer.tsx`
- 修改：`apps/web/src/components/files/FilePreviewPanel.tsx`
- 修改：`apps/web/src/components/files/LocalCommentAnnotation.tsx`
- 修改：`apps/web/src/browser/BrowserDeviceToolbar.tsx`
- 修改：`apps/web/src/browser/HostedBrowserWebview.tsx`
- 修改：`apps/web/src/components/preview/PreviewAutomationHosts.tsx`
- 修改：`apps/web/src/components/preview/PreviewChromeRow.tsx`
- 修改：`apps/web/src/components/preview/PreviewEmptyState.tsx`
- 修改：`apps/web/src/components/preview/PreviewMoreMenu.tsx`
- 修改：`apps/web/src/components/preview/PreviewUnreachable.tsx`
- 修改：`apps/web/src/i18n/messages.ts`

- [ ] **步骤 1：先增加格式化与渲染失败测试**

扩展 `GitActionsControl.logic.test.ts`、`ThreadTerminalDrawer.test.ts` 和浏览器预览逻辑测试，断言中文操作标签和状态说明，同时确认分支名、提交哈希、终端内容、URL 与原始网络错误保持不变。

- [ ] **步骤 2：运行目标测试并确认中文断言失败**

运行：`vp test apps/web/src/components/GitActionsControl.logic.test.ts apps/web/src/components/ThreadTerminalDrawer.test.ts apps/web/src/browser`

- [ ] **步骤 3：迁移本任务所有产品文案**

使用 `git.*`、`diff.*`、`terminal.*`、`files.*`、`preview.*` 词典分区。只翻译应用提供的标签和说明，不翻译代码、文件内容、URL、设备尺寸或命令输出。

- [ ] **步骤 4：运行测试并提交**

运行：`vp test apps/web/src/components/GitActionsControl.logic.test.ts apps/web/src/components/ThreadTerminalDrawer.test.ts apps/web/src/browser apps/web/src/components/files`

```bash
git add apps/web/src/browser apps/web/src/components apps/web/src/i18n/messages.ts
git commit -m "feat(web): translate git terminal and preview surfaces"
```

### 任务 7：连接、登录、桌面提示与剩余文案审计

**文件：**

- 修改：`apps/web/src/cloud/managedAuth.tsx`
- 修改：`apps/web/src/components/clerk/MobileClientsUserProfilePage.tsx`
- 修改：`apps/web/src/components/clerk/T3ConnectSidebarSignIn.tsx`
- 修改：`apps/web/src/components/cloud/ConnectOnboardingDialog.tsx`
- 修改：`apps/web/src/components/cloud/RelayClientInstallDialog.tsx`
- 修改：`apps/web/src/components/desktop/SshPasswordPromptDialog.tsx`
- 修改：`apps/web/src/i18n/messages.ts`

- [ ] **步骤 1：先为登录和连接状态增加中文断言**

在现有 `managedAuth.test.ts`、`relayClientInstallDialog.test.ts` 和连接逻辑测试中验证中文标题、操作和错误框架，保留设备名、主机名、命令及原始错误。

- [ ] **步骤 2：迁移登录、连接和桌面提示文案**

使用 `auth.*`、`cloud.*` 和 `desktop.*` 词典分区；不得翻译 Clerk、T3 Connect、SSH、URL、二维码内容和安装命令。

- [ ] **步骤 3：执行剩余硬编码文案审计**

运行以下查询，并逐项判断命中是否为产品文案：

```bash
rg -n '>[[:space:]]*[A-Za-z][^<{]*<' apps/web/src -g '*.tsx'
rg -n '(aria-label|placeholder|title|description)=["`][A-Za-z]' apps/web/src -g '*.tsx'
rg -n 'window\.(confirm|prompt)\(' apps/web/src -g '*.ts' -g '*.tsx'
```

剩余命中只允许是测试夹具、代码标识、协议值、第三方品牌、外部动态内容或开发日志；所有产品文案继续迁入对应词典。

- [ ] **步骤 4：运行 Web 测试并提交**

运行：`vp test apps/web/src`

```bash
git add apps/web/src
git commit -m "feat(web): complete desktop Chinese translation"
```

### 任务 8：中文 README 与仓库链接

**文件：**

- 修改：`README.md`
- 新建：`README.zh-CN.md`

- [ ] **步骤 1：更新英文 README**

在标题下增加 `[English](./README.md) | [简体中文](./README.zh-CN.md)`，将 Releases 链接改为 `https://github.com/nolaurence/t3code-chinese/releases`，保留第三方链接。

- [ ] **步骤 2：创建完整中文 README**

逐段翻译安装、运行、说明、文档和贡献章节；命令保持原样。中文文档链接分别指向：

```text
./docs/zh-CN/getting-started/quick-start.md
./docs/zh-CN/architecture/overview.md
./docs/zh-CN/providers/codex.md
./docs/zh-CN/operations/ci.md
./docs/zh-CN/reference/encyclopedia.md
```

- [ ] **步骤 3：验证上游仓库链接已移除并提交**

运行：`rg -n 'pingdotgg/t3code' README.md README.zh-CN.md`

预期：无输出。

```bash
git add README.md README.zh-CN.md
git commit -m "docs: add Chinese README and fix repository links"
```

### 任务 9：镜像翻译全部产品文档

**文件：**

- 新建：`docs/zh-CN/README.md`
- 新建：`docs/zh-CN/architecture/*.md`
- 新建：`docs/zh-CN/cloud/*.md`
- 新建：`docs/zh-CN/cloud/t3-code-connect-auth-flow.html`
- 新建：`docs/zh-CN/getting-started/*.md`
- 新建：`docs/zh-CN/integrations/*.md`
- 新建：`docs/zh-CN/operations/*.md`
- 新建：`docs/zh-CN/project/*.md`
- 新建：`docs/zh-CN/providers/*.md`
- 新建：`docs/zh-CN/reference/*.md`
- 新建：`docs/zh-CN/user/*.md`

- [ ] **步骤 1：创建与英文产品文档一致的目录和文件集合**

范围为 `docs/` 下除 `docs/superpowers/` 和 `docs/zh-CN/` 外的全部 `.md`、`.html` 文件，共 24 个文件。

- [ ] **步骤 2：翻译 Markdown 文档**

翻译标题、正文、表格、提示和 Mermaid 可见标签；保持代码围栏、命令、路径、API、配置键、环境变量和 URL 原样。中文索引移除当前不存在对应文件的 `docs/mobile/app.md` 链接。

- [ ] **步骤 3：翻译认证流程 HTML**

保留 HTML/CSS/脚本、元素 ID、类名和 Mermaid 标识符，只翻译 `<title>`、标题、说明、图例和图中可见标签。

- [ ] **步骤 4：校验文档镜像集合和相对链接**

使用 `find` 对比英文产品文档和去掉 `zh-CN/` 前缀后的中文文件集合；使用 Markdown 链接查询逐个确认所有本地相对目标存在。英文索引中原有但不存在的 `docs/mobile/app.md` 不在中文索引中保留。

- [ ] **步骤 5：提交中文文档**

```bash
git add docs/zh-CN
git commit -m "docs: add Simplified Chinese documentation"
```

### 任务 10：最终质量门禁

**文件：**

- 检查：本计划涉及的全部文件

- [ ] **步骤 1：运行格式、静态检查和完整测试**

```bash
vp test
vp check
vp run typecheck
```

预期：三个命令均以状态码 0 结束。

- [ ] **步骤 2：复查工作区和差异**

运行：

```bash
git status --short
git diff --check 280c12d0..HEAD
```

确认不存在未提交的实现文件、空白错误、意外移动或 `.repos/` 改动。

- [ ] **步骤 3：复核验收标准**

确认语言切换立即生效并持久化，英文回退可用，桌面产品文案审计无遗漏，中文文档镜像完整，两份 README 互链且仓库链接正确。
