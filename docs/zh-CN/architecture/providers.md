# 供应商架构

Web 应用通过 WebSocket，使用简单的 JSON-RPC 风格协议与服务端通信：

- **请求/响应**：`{ id, method, params }` → `{ id, result }` 或 `{ id, error }`
- **推送事件**：带有 `channel`、`sequence`（每个连接内单调递增）以及通道专属 `data` 的类型化信封

推送通道包括：`server.welcome`、`server.configUpdated`、`terminal.event`、`orchestration.domainEvent`。负载会在传输边界（`wsTransport.ts`）通过 Schema 校验。解码失败时会生成结构化的 `WsDecodeDiagnostic`，其中包含 `code`、`reason` 和路径信息。

方法与 `@t3tools/contracts` 中定义的 `NativeApi` 接口一致：

- `providers.startSession`、`providers.sendTurn`、`providers.interruptTurn`
- `providers.respondToRequest`、`providers.stopSession`
- `shell.openInEditor`、`server.getConfig`

Codex 是唯一已经实现的供应商。`claudeCode` 在合约和界面中预留。

## 客户端传输

`wsTransport.ts` 管理连接状态：`connecting` → `open` → `reconnecting` → `closed` → `disposed`。断开连接时，出站请求进入队列，并在重新连接后发送。入站推送在边界处解码和校验，然后按通道缓存。订阅者可以选择 `replayLatest`，在订阅时接收最近一次推送。

## 服务端编排层

供应商运行时事件通过基于队列的 Worker 流转：

1. **ProviderRuntimeIngestion**：消费供应商运行时流并发出编排命令
2. **ProviderCommandReactor**：响应编排意图事件并分发供应商调用
3. **CheckpointReactor**：在 Turn 开始和完成时捕获 Git 检查点，并发布运行时回执

三者内部都使用 `DrainableWorker`，并暴露 `drain()` 以支持确定性的测试同步。
