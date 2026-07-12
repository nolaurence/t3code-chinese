# Pi Agent 与工具活动中文化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标：** 完成对话流工具活动文案的中英文切换，并将外部 Pi CLI 通过 RPC 作为完整的一等桌面端供应商接入。

**架构：** Web 展示层使用结构化工作日志字段生成本地化标题，不修改活动身份或折叠逻辑。服务端新增独立的 Pi RPC 客户端、事件映射器、适配器和驱动；RPC 子进程事件统一转换为现有 `ProviderRuntimeEvent`，前端不增加 Pi 专用对话渲染分支。

**技术栈：** TypeScript、React、Effect、Vite+ Test、Pi JSONL RPC、Electron 桌面端。

---

### 任务 1：工具活动展示文案中文化

**文件：**

- 新建：`apps/web/src/components/chat/toolActivityPresentation.ts`
- 新建：`apps/web/src/components/chat/toolActivityPresentation.test.ts`
- 修改：`apps/web/src/components/chat/MessagesTimeline.tsx`
- 修改：`apps/web/src/i18n/messages.ts`

- [ ] **步骤 1：编写失败测试**

覆盖结构化 `requestKind`、`itemType`、生命周期状态、兼容的已知英文标签和未知工具原样显示：

```ts
expect(toolActivityHeading(entry({ requestKind: "file-read" }), zh)).toBe("读取文件");
expect(toolActivityHeading(entry({ itemType: "command_execution" }), zh)).toBe("运行命令");
expect(toolActivityHeading(entry({ toolTitle: "custom_extension" }), zh)).toBe("Custom_extension");
```

- [ ] **步骤 2：运行测试确认失败**

运行：`vp test apps/web/src/components/chat/toolActivityPresentation.test.ts`

预期：因模块不存在而失败。

- [ ] **步骤 3：实现纯展示辅助函数和翻译键**

```ts
export function toolActivityHeading(entry: WorkLogEntry, t: Translate): string {
  const key = structuredToolHeadingKey(entry) ?? knownLegacyToolHeadingKey(entry);
  return key ? t(key) : capitalizePhrase(normalizeCompactToolLabel(entry.toolTitle ?? entry.label));
}
```

为英文和简体中文增加读取、写入、编辑、运行、搜索、查找、列目录、网页搜索、查看图片、通用工具调用、运行中、完成、失败、拒绝和停止等键；在 `MessagesTimeline.tsx` 使用辅助函数，并将展开内容中的 `MCP call` 改为翻译键。

- [ ] **步骤 4：运行测试确认通过**

运行：`vp test apps/web/src/components/chat/toolActivityPresentation.test.ts apps/web/src/i18n/messages.test.ts`

预期：全部通过。

- [ ] **步骤 5：提交**

```bash
git add apps/web/src/components/chat/toolActivityPresentation.ts apps/web/src/components/chat/toolActivityPresentation.test.ts apps/web/src/components/chat/MessagesTimeline.tsx apps/web/src/i18n/messages.ts
git commit -m "feat(web): localize tool activity labels"
```

### 任务 2：增加 Pi 设置与运行时原始来源契约

**文件：**

- 修改：`packages/contracts/src/settings.ts`
- 修改：`packages/contracts/src/settings.test.ts`
- 修改：`packages/contracts/src/providerRuntime.ts`
- 修改：`packages/contracts/src/providerRuntime.test.ts`
- 修改：`packages/contracts/src/model.ts`
- 新建：`packages/contracts/src/model.pi.test.ts`

- [ ] **步骤 1：编写失败测试**

```ts
const pi = Schema.decodeSync(PiAgentSettings)({});
expect(pi.binaryPath).toBe("pi");
expect(pi.homePath).toBe("");
expect(Schema.is(RuntimeEventRawSource)("pi.rpc.event")).toBe(true);
expect(PROVIDER_DISPLAY_NAMES[ProviderDriverKind.make("piAgent")]).toBe("Pi");
```

- [ ] **步骤 2：运行测试确认失败**

运行：`vp test packages/contracts/src/settings.test.ts packages/contracts/src/providerRuntime.test.ts`

预期：`PiAgentSettings` 和 `pi.rpc.event` 尚不存在。

- [ ] **步骤 3：实现最小契约**

新增 `PiAgentSettings`，字段为隐藏的 `enabled`、默认 `pi` 的 `binaryPath`、可选 `homePath` 和隐藏的 `customModels`；在原始事件来源中加入 `pi.rpc.event`，并加入 Pi 默认展示名。

- [ ] **步骤 4：运行测试确认通过**

运行：`vp test packages/contracts/src/settings.test.ts packages/contracts/src/providerRuntime.test.ts packages/contracts/src/model.pi.test.ts`

预期：全部通过。

- [ ] **步骤 5：提交**

```bash
git add packages/contracts/src/settings.ts packages/contracts/src/settings.test.ts packages/contracts/src/providerRuntime.ts packages/contracts/src/providerRuntime.test.ts packages/contracts/src/model.ts packages/contracts/src/model.pi.test.ts
git commit -m "feat(contracts): add pi agent provider settings"
```

### 任务 3：实现 Pi RPC 协议解码和 LF 分帧

**文件：**

- 新建：`apps/server/src/provider/pi/PiRpcProtocol.ts`
- 新建：`apps/server/src/provider/pi/PiRpcProtocol.test.ts`

- [ ] **步骤 1：编写失败测试**

测试关联响应、agent 事件、扩展 UI 请求和严格 LF 分帧，确保 JSON 字符串内的 `U+2028` 不被拆分：

```ts
const decoder = makePiRpcLineDecoder();
expect(decoder.push('{"type":"agent_start"}\n')).toEqual([{ type: "agent_start" }]);
expect(decoder.push('{"type":"message_update","message":{"text":"a\u2028b"}}\n')).toHaveLength(1);
```

- [ ] **步骤 2：运行测试确认失败**

运行：`vp test apps/server/src/provider/pi/PiRpcProtocol.test.ts`

预期：模块不存在。

- [ ] **步骤 3：实现协议类型和解码器**

定义 T3 使用的 RPC 命令、响应、事件和扩展 UI 请求最小联合类型；实现仅按 `\n` 切分、去除行尾 `\r`、保留尾部残片并对无效 JSON 返回带原始行摘要的协议错误。

- [ ] **步骤 4：运行测试确认通过**

运行：`vp test apps/server/src/provider/pi/PiRpcProtocol.test.ts`

预期：全部通过。

- [ ] **步骤 5：提交**

```bash
git add apps/server/src/provider/pi/PiRpcProtocol.ts apps/server/src/provider/pi/PiRpcProtocol.test.ts
git commit -m "feat(server): add pi rpc protocol decoder"
```

### 任务 4：实现 Pi RPC 子进程客户端

**文件：**

- 新建：`apps/server/src/provider/pi/PiRpcClient.ts`
- 新建：`apps/server/src/provider/pi/PiRpcClient.test.ts`

- [ ] **步骤 1：编写失败测试**

使用注入的 `ChildProcessSpawner` 句柄验证启动参数、请求 ID 关联、事件广播、失败响应、进程退出时清理待处理请求以及关闭时终止会话。

```ts
const client = yield * makePiRpcClient({ binaryPath: "pi", cwd: "/repo" });
const state = yield * client.request({ type: "get_state" });
expect(state.command).toBe("get_state");
```

- [ ] **步骤 2：运行测试确认失败**

运行：`vp test apps/server/src/provider/pi/PiRpcClient.test.ts`

预期：模块不存在。

- [ ] **步骤 3：实现客户端**

通过 `ChildProcessSpawner` 启动 `pi --mode rpc`，使用 `Stream.run(..., child.stdin)` 写入 JSONL，用任务作用域读取 stdout/stderr；以递增请求 ID 管理 `Deferred`，事件通过 `PubSub` 广播。作用域结束时发送 `abort`、关闭 stdin，并确保所有等待请求失败。

- [ ] **步骤 4：运行测试确认通过**

运行：`vp test apps/server/src/provider/pi/PiRpcClient.test.ts`

预期：全部通过且没有遗留 fiber。

- [ ] **步骤 5：提交**

```bash
git add apps/server/src/provider/pi/PiRpcClient.ts apps/server/src/provider/pi/PiRpcClient.test.ts
git commit -m "feat(server): add pi rpc process client"
```

### 任务 5：实现 Pi 事件映射器

**文件：**

- 新建：`apps/server/src/provider/pi/PiRuntimeEvents.ts`
- 新建：`apps/server/src/provider/pi/PiRuntimeEvents.test.ts`

- [ ] **步骤 1：编写失败测试**

逐项覆盖 `agent_start/end`、文本和 thinking delta、七种内置工具、工具更新/失败、用量、错误和扩展输入请求。断言每个工具调用保持相同 `ProviderItemId` 和规范的 `itemType`、`requestKind`、标题及结构化数据。

- [ ] **步骤 2：运行测试确认失败**

运行：`vp test apps/server/src/provider/pi/PiRuntimeEvents.test.ts`

预期：映射器不存在。

- [ ] **步骤 3：实现有状态映射器**

映射器持有当前 turn ID、内容流 item ID 和工具调用表；输出已有 `session.*`、`thread.*`、`turn.*`、`item.*`、`content.delta`、`user-input.*` 事件。`bash` 映射为 `command_execution`，`write/edit` 为 `file_change`，`read/grep/find/ls` 为只读工具；未知工具为 `dynamic_tool_call`。

- [ ] **步骤 4：运行测试确认通过**

运行：`vp test apps/server/src/provider/pi/PiRuntimeEvents.test.ts`

预期：全部通过。

- [ ] **步骤 5：提交**

```bash
git add apps/server/src/provider/pi/PiRuntimeEvents.ts apps/server/src/provider/pi/PiRuntimeEvents.test.ts
git commit -m "feat(server): map pi rpc runtime events"
```

### 任务 6：实现 Pi 适配器与会话恢复

**文件：**

- 新建：`apps/server/src/provider/Services/PiAdapter.ts`
- 新建：`apps/server/src/provider/Layers/PiAdapter.ts`
- 新建：`apps/server/src/provider/Layers/PiAdapter.test.ts`

- [ ] **步骤 1：编写失败测试**

通过假的 Pi RPC 客户端覆盖新建会话、恢复 session 文件、设置模型和 thinking level、发送图片和文本、停止 turn、停止会话、读取消息快照、扩展输入响应以及死进程清理。

- [ ] **步骤 2：运行测试确认失败**

运行：`vp test apps/server/src/provider/Layers/PiAdapter.test.ts`

预期：适配器不存在。

- [ ] **步骤 3：实现适配器**

实现完整 `ProviderAdapterShape`。每个 T3 thread 保存客户端、Pi session ID/file、活跃 turn、事件映射器和事件 fiber；`sendTurn` 先应用模型选择再发送 `prompt`；`interruptTurn` 发送 `abort`；`respondToUserInput` 转换为 `extension_ui_response`；不支持审批和 rollback 时返回明确的 `ProviderAdapterRequestError`。

- [ ] **步骤 4：运行测试确认通过**

运行：`vp test apps/server/src/provider/Layers/PiAdapter.test.ts`

预期：全部通过。

- [ ] **步骤 5：提交**

```bash
git add apps/server/src/provider/Services/PiAdapter.ts apps/server/src/provider/Layers/PiAdapter.ts apps/server/src/provider/Layers/PiAdapter.test.ts
git commit -m "feat(server): add pi provider adapter"
```

### 任务 7：注册 Pi 驱动、状态探测和模型清单

**文件：**

- 新建：`apps/server/src/provider/Drivers/PiDriver.ts`
- 新建：`apps/server/src/provider/Layers/PiProvider.ts`
- 新建：`apps/server/src/provider/Layers/PiProvider.test.ts`
- 修改：`apps/server/src/provider/builtInDrivers.ts`
- 修改：`apps/server/src/provider/providerMaintenance.ts`

- [ ] **步骤 1：编写失败测试**

验证默认 `pi` 和显式路径探测、版本解析、缺失命令状态、安装/更新命令、RPC 模型清单映射，以及内置驱动注册表中存在 `piAgent`。

- [ ] **步骤 2：运行测试确认失败**

运行：`vp test apps/server/src/provider/Layers/PiProvider.test.ts apps/server/src/provider/Layers/ProviderInstanceRegistryLive.test.ts`

预期：Pi 驱动尚未注册。

- [ ] **步骤 3：实现驱动和状态**

使用 `pi --version` 探测 CLI；维护信息使用 npm 包 `@earendil-works/pi-coding-agent`；驱动解码 `PiAgentSettings`，合并实例环境，构造托管快照和适配器，并将 `PiDriver` 加入 `BUILT_IN_DRIVERS`。

- [ ] **步骤 4：运行测试确认通过**

运行：`vp test apps/server/src/provider/Layers/PiProvider.test.ts apps/server/src/provider/Layers/ProviderInstanceRegistryLive.test.ts`

预期：全部通过。

- [ ] **步骤 5：提交**

```bash
git add apps/server/src/provider/Drivers/PiDriver.ts apps/server/src/provider/Layers/PiProvider.ts apps/server/src/provider/Layers/PiProvider.test.ts apps/server/src/provider/builtInDrivers.ts apps/server/src/provider/providerMaintenance.ts
git commit -m "feat(server): register pi agent provider"
```

### 任务 8：启用 Pi 设置和模型选择界面

**文件：**

- 修改：`apps/web/src/components/settings/AddProviderInstanceDialog.tsx`
- 修改：`apps/web/src/components/settings/providerDriverMeta.ts`
- 修改：`apps/web/src/components/settings/ProviderSettingsForm.test.ts`
- 修改：`apps/web/src/components/chat/providerIconUtils.ts`
- 修改：`apps/web/src/providerModels.ts`
- 新建：`apps/web/src/providerModels.test.ts`
- 修改：`apps/web/src/session-logic.ts`
- 修改：`apps/web/src/i18n/messages.ts`

- [ ] **步骤 1：编写失败测试**

验证 Pi 从“即将推出”移动到可选驱动、使用 `PiAgentIcon`、展示二进制路径和 agent 主目录设置、显示受信任工作区提示，并可选择 Pi RPC 返回的模型。

- [ ] **步骤 2：运行测试确认失败**

运行：`vp test apps/web/src/components/settings/ProviderSettingsForm.test.ts apps/web/src/providerModels.test.ts apps/web/src/session-logic.test.ts`

预期：Pi 尚未列为可用供应商。

- [ ] **步骤 3：实现客户端元数据**

将 `PiAgentSettings` 和 `PiAgentIcon` 注册到 `PROVIDER_CLIENT_DEFINITIONS`，从即将推出列表移除 Pi，加入名称、图标、默认模型展示和中英文安全说明；让 provider picker 从服务端快照展示 Pi。

- [ ] **步骤 4：运行测试确认通过**

运行：`vp test apps/web/src/components/settings/ProviderSettingsForm.test.ts apps/web/src/providerModels.test.ts apps/web/src/session-logic.test.ts apps/web/src/i18n/messages.test.ts`

预期：全部通过。

- [ ] **步骤 5：提交**

```bash
git add apps/web/src/components/settings/AddProviderInstanceDialog.tsx apps/web/src/components/settings/providerDriverMeta.ts apps/web/src/components/settings/ProviderSettingsForm.test.ts apps/web/src/components/chat/providerIconUtils.ts apps/web/src/providerModels.ts apps/web/src/providerModels.test.ts apps/web/src/session-logic.ts apps/web/src/i18n/messages.ts
git commit -m "feat(web): enable pi agent provider"
```

### 任务 9：端到端验证和文档更新

**文件：**

- 修改：`docs/zh-CN/` 下相关供应商文档
- 修改：`README.zh-CN.md`（仅在已有供应商清单需要更新时）

- [ ] **步骤 1：运行全部聚焦测试**

运行：`vp test packages/contracts/src apps/server/src/provider/pi apps/server/src/provider/Layers/PiAdapter.test.ts apps/server/src/provider/Layers/PiProvider.test.ts apps/web/src/components/chat/toolActivityPresentation.test.ts apps/web/src/components/settings/ProviderSettingsForm.test.ts`

预期：全部通过。

- [ ] **步骤 2：运行真实 Pi 冒烟测试**

使用本机 `pi 0.80.3` 启动服务，在临时仓库创建 Pi 对话，发送只读提示，确认文本流、工具活动、停止和恢复均可用；不得改动当前仓库业务文件。

- [ ] **步骤 3：更新中文文档**

记录 Pi 安装要求、可执行文件路径、复用 `~/.pi/agent`、工具直接执行的权限模型和故障排查方式。

- [ ] **步骤 4：运行仓库完成门槛**

运行：`vp check && vp run typecheck`

预期：退出码均为 0；仓库既有警告可以保留，但不得增加错误。

- [ ] **步骤 5：检查最终差异**

运行：`git diff --check && git status --short`

预期：无空白错误，只有本功能相关文件。
