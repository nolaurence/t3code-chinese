# Effect.fn 重构清单

本清单由仓库扫描生成，列出非测试代码中匹配 `=> Effect.gen(function* ...)` 或 `return Effect.gen(function* ...)` 的包装器风格候选项。

重构方式：

```ts
// 旧写法
function old () {
    return Effect.gen(function* () {
        ...
    });
}

const old2 = () => Effect.gen(function* () {
    ...
});
```

```ts
// 新写法
const new = Effect.fn('functionName')(function* () {
    ...
})
```

- 如果需要，可以使用 `Effect.fn('name')(function* (input: Input): Effect.fn.Return<A, E, R> {})` 标注函数返回类型。

- 第二个参数的作用类似管道，它接收 Effect 和输入作为参数：

```ts
Effect.fn("name")(
  function* (input: Input): Effect.fn.Return<A, E, R> {},
  (effect, input) => Effect.catch(effect, (reason) => Effect.logWarning("Err", { input, reason })),
);
```

## 摘要

- 非测试候选项总数：`322`

## 建议顺序

- [ ] `apps/server/src/provider/Layers/ProviderService.ts`
- [x] `apps/server/src/provider/Layers/ClaudeAdapter.ts`
- [x] `apps/server/src/provider/Layers/CodexAdapter.ts`
- [x] `apps/server/src/git/Layers/GitCore.ts`
- [x] `apps/server/src/git/Layers/GitManager.ts`
- [x] `apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.ts`
- [x] `apps/server/src/orchestration/Layers/ProjectionPipeline.ts`
- [ ] `apps/server/src/orchestration/Layers/OrchestrationEngine.ts`
- [ ] `apps/server/src/provider/Layers/EventNdjsonLogger.ts`
- [ ] 其他所有文件

## 清单

### `apps/server/src/provider/Layers/ClaudeAdapter.ts`（`62`）

- [x] [buildUserMessageEffect](/Users/julius/Development/Work/codething-mvp/apps/server/src/provider/Layers/ClaudeAdapter.ts#L554)
- [x] [makeClaudeAdapter](/Users/julius/Development/Work/codething-mvp/apps/server/src/provider/Layers/ClaudeAdapter.ts#L913)
- [x] [startSession](/Users/julius/Development/Work/codething-mvp/apps/server/src/provider/Layers/ClaudeAdapter.ts#L2414)
- [x] [sendTurn](/Users/julius/Development/Work/codething-mvp/apps/server/src/provider/Layers/ClaudeAdapter.ts#L2887)
- [x] [interruptTurn](/Users/julius/Development/Work/codething-mvp/apps/server/src/provider/Layers/ClaudeAdapter.ts#L2975)
- [x] [readThread](/Users/julius/Development/Work/codething-mvp/apps/server/src/provider/Layers/ClaudeAdapter.ts#L2984)
- [x] [rollbackThread](/Users/julius/Development/Work/codething-mvp/apps/server/src/provider/Layers/ClaudeAdapter.ts#L2990)
- [x] [stopSession](/Users/julius/Development/Work/codething-mvp/apps/server/src/provider/Layers/ClaudeAdapter.ts#L3039)
- [x] 本文件中的内部辅助函数和回调包装器

### `apps/server/src/git/Layers/GitCore.ts`（`58`）

- [x] [makeGitCore](/Users/julius/Development/Work/codething-mvp/apps/server/src/git/Layers/GitCore.ts#L513)
- [x] [handleTraceLine](/Users/julius/Development/Work/codething-mvp/apps/server/src/git/Layers/GitCore.ts#L324)
- [x] [emitCompleteLines](/Users/julius/Development/Work/codething-mvp/apps/server/src/git/Layers/GitCore.ts#L455)
- [x] [commit](/Users/julius/Development/Work/codething-mvp/apps/server/src/git/Layers/GitCore.ts#L1190)
- [x] [pushCurrentBranch](/Users/julius/Development/Work/codething-mvp/apps/server/src/git/Layers/GitCore.ts#L1223)
- [x] [pullCurrentBranch](/Users/julius/Development/Work/codething-mvp/apps/server/src/git/Layers/GitCore.ts#L1323)
- [x] [checkoutBranch](/Users/julius/Development/Work/codething-mvp/apps/server/src/git/Layers/GitCore.ts#L1727)
- [x] 本文件中的服务方法和回调包装器

### `apps/server/src/git/Layers/GitManager.ts`（`28`）

- [x] [configurePullRequestHeadUpstream](/Users/julius/Development/Work/codething-mvp/apps/server/src/git/Layers/GitManager.ts#L387)
- [x] [materializePullRequestHeadBranch](/Users/julius/Development/Work/codething-mvp/apps/server/src/git/Layers/GitManager.ts#L428)
- [x] [findOpenPr](/Users/julius/Development/Work/codething-mvp/apps/server/src/git/Layers/GitManager.ts#L576)
- [x] [findLatestPr](/Users/julius/Development/Work/codething-mvp/apps/server/src/git/Layers/GitManager.ts#L602)
- [x] [runCommitStep](/Users/julius/Development/Work/codething-mvp/apps/server/src/git/Layers/GitManager.ts#L728)
- [x] [runPrStep](/Users/julius/Development/Work/codething-mvp/apps/server/src/git/Layers/GitManager.ts#L842)
- [x] [runFeatureBranchStep](/Users/julius/Development/Work/codething-mvp/apps/server/src/git/Layers/GitManager.ts#L1106)
- [x] 本文件中其余辅助函数和嵌套回调包装器

### `apps/server/src/orchestration/Layers/ProjectionPipeline.ts`（`25`）

- [x] [runProjectorForEvent](/Users/julius/Development/Work/codething-mvp/apps/server/src/orchestration/Layers/ProjectionPipeline.ts#L1161)
- [x] [applyProjectsProjection](/Users/julius/Development/Work/codething-mvp/apps/server/src/orchestration/Layers/ProjectionPipeline.ts#L357)
- [x] [applyThreadsProjection](/Users/julius/Development/Work/codething-mvp/apps/server/src/orchestration/Layers/ProjectionPipeline.ts#L415)
- [x] `L250` 附近的 `Effect.forEach(..., threadId => Effect.gen(...))` 回调
- [x] `L264` 附近的 `Effect.forEach(..., entry => Effect.gen(...))` 回调
- [x] `L305` 附近的 `Effect.forEach(..., entry => Effect.gen(...))` 回调
- [x] 本文件中其余 apply 辅助函数

### `apps/server/src/provider/Layers/ProviderService.ts`（`24`）

- [ ] [makeProviderService](/Users/julius/Development/Work/codething-mvp/apps/server/src/provider/Layers/ProviderService.ts#L134)
- [ ] [recoverSessionForThread](/Users/julius/Development/Work/codething-mvp/apps/server/src/provider/Layers/ProviderService.ts#L196)
- [ ] [resolveRoutableSession](/Users/julius/Development/Work/codething-mvp/apps/server/src/provider/Layers/ProviderService.ts#L255)
- [ ] [startSession](/Users/julius/Development/Work/codething-mvp/apps/server/src/provider/Layers/ProviderService.ts#L284)
- [ ] [sendTurn](/Users/julius/Development/Work/codething-mvp/apps/server/src/provider/Layers/ProviderService.ts#L347)
- [ ] [interruptTurn](/Users/julius/Development/Work/codething-mvp/apps/server/src/provider/Layers/ProviderService.ts#L393)
- [ ] [respondToRequest](/Users/julius/Development/Work/codething-mvp/apps/server/src/provider/Layers/ProviderService.ts#L411)
- [ ] [respondToUserInput](/Users/julius/Development/Work/codething-mvp/apps/server/src/provider/Layers/ProviderService.ts#L430)
- [ ] [stopSession](/Users/julius/Development/Work/codething-mvp/apps/server/src/provider/Layers/ProviderService.ts#L445)
- [ ] [listSessions](/Users/julius/Development/Work/codething-mvp/apps/server/src/provider/Layers/ProviderService.ts#L466)
- [ ] [rollbackConversation](/Users/julius/Development/Work/codething-mvp/apps/server/src/provider/Layers/ProviderService.ts#L516)
- [ ] [runStopAll](/Users/julius/Development/Work/codething-mvp/apps/server/src/provider/Layers/ProviderService.ts#L538)

### `apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.ts`（`14`）

- [x] [finalizeAssistantMessage](/Users/julius/Development/Work/codething-mvp/apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.ts#L680)
- [x] [upsertProposedPlan](/Users/julius/Development/Work/codething-mvp/apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.ts#L722)
- [x] [finalizeBufferedProposedPlan](/Users/julius/Development/Work/codething-mvp/apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.ts#L761)
- [x] [clearTurnStateForSession](/Users/julius/Development/Work/codething-mvp/apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.ts#L800)
- [x] [processRuntimeEvent](/Users/julius/Development/Work/codething-mvp/apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.ts#L908)
- [x] 本文件中的嵌套回调包装器

### `apps/server/src/provider/Layers/CodexAdapter.ts`（`12`）

- [x] [makeCodexAdapter](/Users/julius/Development/Work/codething-mvp/apps/server/src/provider/Layers/CodexAdapter.ts#L1317)
- [x] [sendTurn](/Users/julius/Development/Work/codething-mvp/apps/server/src/provider/Layers/CodexAdapter.ts#L1399)
- [x] [writeNativeEvent](/Users/julius/Development/Work/codething-mvp/apps/server/src/provider/Layers/CodexAdapter.ts#L1546)
- [x] [listener](/Users/julius/Development/Work/codething-mvp/apps/server/src/provider/Layers/CodexAdapter.ts#L1555)
- [x] 本文件中其余嵌套回调包装器

### `apps/server/src/checkpointing/CheckpointStore.ts`（`10`）

- [ ] [captureCheckpoint](/Users/julius/Development/Work/codething-mvp/apps/server/src/checkpointing/CheckpointStore.ts#L123)
- [ ] [restoreCheckpoint](/Users/julius/Development/Work/codething-mvp/apps/server/src/checkpointing/CheckpointStore.ts#L137)
- [ ] [diffCheckpoints](/Users/julius/Development/Work/codething-mvp/apps/server/src/checkpointing/CheckpointStore.ts#L144)
- [ ] [deleteCheckpointRefs](/Users/julius/Development/Work/codething-mvp/apps/server/src/checkpointing/CheckpointStore.ts#L151)
- [ ] 嵌套回调包装器

### `apps/server/src/provider/Layers/EventNdjsonLogger.ts`（`9`）

- [ ] [toLogMessage](/Users/julius/Development/Work/codething-mvp/apps/server/src/provider/Layers/EventNdjsonLogger.ts#L77)
- [ ] [makeThreadWriter](/Users/julius/Development/Work/codething-mvp/apps/server/src/provider/Layers/EventNdjsonLogger.ts#L102)
- [ ] [makeEventNdjsonLogger](/Users/julius/Development/Work/codething-mvp/apps/server/src/provider/Layers/EventNdjsonLogger.ts#L174)
- [ ] [write](/Users/julius/Development/Work/codething-mvp/apps/server/src/provider/Layers/EventNdjsonLogger.ts#L231)
- [ ] [close](/Users/julius/Development/Work/codething-mvp/apps/server/src/provider/Layers/EventNdjsonLogger.ts#L247)
- [ ] 刷新和写入器解析回调包装器

### `apps/server/scripts/cli.ts`（`8`）

- [ ] [cli.ts](/Users/julius/Development/Work/codething-mvp/apps/server/scripts/cli.ts#L125) 中约 `L125` 的命令处理器
- [ ] [cli.ts](/Users/julius/Development/Work/codething-mvp/apps/server/scripts/cli.ts#L170) 中约 `L170` 的命令处理器
- [ ] [cli.ts](/Users/julius/Development/Work/codething-mvp/apps/server/scripts/cli.ts#L221) 中约 `L221` 的资源回调
- [ ] [cli.ts](/Users/julius/Development/Work/codething-mvp/apps/server/scripts/cli.ts#L239) 中约 `L239` 的资源回调

### `apps/server/src/orchestration/Layers/OrchestrationEngine.ts`（`7`）

- [ ] [processEnvelope](/Users/julius/Development/Work/codething-mvp/apps/server/src/orchestration/Layers/OrchestrationEngine.ts#L64)
- [ ] [dispatch](/Users/julius/Development/Work/codething-mvp/apps/server/src/orchestration/Layers/OrchestrationEngine.ts#L218)
- [ ] [OrchestrationEngine.ts](/Users/julius/Development/Work/codething-mvp/apps/server/src/orchestration/Layers/OrchestrationEngine.ts#L162) 中约 `L162` 的 catch/stream 回调包装器
- [ ] [OrchestrationEngine.ts](/Users/julius/Development/Work/codething-mvp/apps/server/src/orchestration/Layers/OrchestrationEngine.ts#L200) 中约 `L200` 的 catch/stream 回调包装器

### `apps/server/src/orchestration/projector.ts`（`5`）

- [ ] [projector.ts](/Users/julius/Development/Work/codething-mvp/apps/server/src/orchestration/projector.ts#L242) 中约 `L242` 的 `switch` 分支包装器
- [ ] [projector.ts](/Users/julius/Development/Work/codething-mvp/apps/server/src/orchestration/projector.ts#L336) 中约 `L336` 的 `switch` 分支包装器
- [ ] [projector.ts](/Users/julius/Development/Work/codething-mvp/apps/server/src/orchestration/projector.ts#L397) 中约 `L397` 的 `switch` 分支包装器
- [ ] [projector.ts](/Users/julius/Development/Work/codething-mvp/apps/server/src/orchestration/projector.ts#L446) 中约 `L446` 的 `switch` 分支包装器
- [ ] [projector.ts](/Users/julius/Development/Work/codething-mvp/apps/server/src/orchestration/projector.ts#L478) 中约 `L478` 的 `switch` 分支包装器

### 较小的候选组

- [ ] [packages/shared/src/DrainableWorker.ts](/Users/julius/Development/Work/codething-mvp/packages/shared/src/DrainableWorker.ts)（`4`）
- [ ] [apps/server/src/wsServer/pushBus.ts](/Users/julius/Development/Work/codething-mvp/apps/server/src/wsServer/pushBus.ts)（`4`）
- [ ] [apps/server/src/wsServer.ts](/Users/julius/Development/Work/codething-mvp/apps/server/src/wsServer.ts)（`4`）
- [ ] [apps/server/src/provider/Layers/ProviderRegistry.ts](/Users/julius/Development/Work/codething-mvp/apps/server/src/provider/Layers/ProviderRegistry.ts)（`4`）
- [ ] [apps/server/src/persistence/Layers/Sqlite.ts](/Users/julius/Development/Work/codething-mvp/apps/server/src/persistence/Layers/Sqlite.ts)（`4`）
- [ ] [apps/server/src/orchestration/Layers/ProviderCommandReactor.ts](/Users/julius/Development/Work/codething-mvp/apps/server/src/orchestration/Layers/ProviderCommandReactor.ts)（`4`）
- [ ] [apps/server/src/main.ts](/Users/julius/Development/Work/codething-mvp/apps/server/src/main.ts)（`4`）
- [ ] [apps/server/src/keybindings.ts](/Users/julius/Development/Work/codething-mvp/apps/server/src/keybindings.ts)（`4`）
- [ ] [apps/server/src/git/Layers/CodexTextGeneration.ts](/Users/julius/Development/Work/codething-mvp/apps/server/src/git/Layers/CodexTextGeneration.ts)（`4`）
- [ ] [apps/server/src/serverLayers.ts](/Users/julius/Development/Work/codething-mvp/apps/server/src/serverLayers.ts)（`3`）
- [ ] [apps/server/src/telemetry/Layers/AnalyticsService.ts](/Users/julius/Development/Work/codething-mvp/apps/server/src/telemetry/Layers/AnalyticsService.ts)（`2`）
- [ ] [apps/server/src/telemetry/Identify.ts](/Users/julius/Development/Work/codething-mvp/apps/server/src/telemetry/Identify.ts)（`2`）
- [ ] [apps/server/src/provider/Layers/ProviderAdapterRegistry.ts](/Users/julius/Development/Work/codething-mvp/apps/server/src/provider/Layers/ProviderAdapterRegistry.ts)（`2`）
- [ ] [apps/server/src/provider/Layers/CodexProvider.ts](/Users/julius/Development/Work/codething-mvp/apps/server/src/provider/Layers/CodexProvider.ts)（`2`）
- [ ] [apps/server/src/provider/Layers/ClaudeProvider.ts](/Users/julius/Development/Work/codething-mvp/apps/server/src/provider/Layers/ClaudeProvider.ts)（`2`）
- [ ] [apps/server/src/persistence/NodeSqliteClient.ts](/Users/julius/Development/Work/codething-mvp/apps/server/src/persistence/NodeSqliteClient.ts)（`2`）
- [ ] [apps/server/src/persistence/Migrations.ts](/Users/julius/Development/Work/codething-mvp/apps/server/src/persistence/Migrations.ts)（`2`）
- [ ] [apps/server/src/open.ts](/Users/julius/Development/Work/codething-mvp/apps/server/src/open.ts)（`2`）
- [ ] [apps/server/src/git/Layers/ClaudeTextGeneration.ts](/Users/julius/Development/Work/codething-mvp/apps/server/src/git/Layers/ClaudeTextGeneration.ts)（`2`）
- [ ] [apps/server/src/checkpointing/CheckpointDiffQuery.ts](/Users/julius/Development/Work/codething-mvp/apps/server/src/checkpointing/CheckpointDiffQuery.ts)（`2`）
- [ ] [apps/server/src/provider/makeManagedServerProvider.ts](/Users/julius/Development/Work/codething-mvp/apps/server/src/provider/makeManagedServerProvider.ts)（`1`）

```

```
