# 百科全书

这是 T3 Code 的持续更新术语表，用于解释本代码库中常见术语的含义。

## 目录

- [项目和工作区](#项目和工作区)
- [会话时间线](#会话时间线)
- [编排](#编排)
- [供应商运行时](#供应商运行时)
- [检查点](#检查点)

## 概念

### 项目和工作区

#### 项目

应用中的顶层工作区记录。在[编排合约][1]中，项目包含一个 `workspaceRoot`、标题和一个或多个会话。参阅 [workspace-layout.md][2]。

#### 工作区根目录

项目的文件系统根路径。在[编排模型][1]中，它是分支和可选 worktree 的基础目录。参阅 [workspace-layout.md][2]。

#### Worktree

作为会话隔离工作区使用的 Git worktree。如果会话在[合约][1]中包含 `worktreePath`，它会在该目录而不是主工作树中运行。Git 操作位于 [GitCore.ts][3]。

### 会话时间线

#### 会话

对话和工作区历史的主要持久化单元。在[编排合约][1]中，会话包含消息、活动、检查点和会话相关状态。参阅 [projector.ts][4]。

#### Turn

会话中的一次用户到助手工作周期。它从用户输入开始，在检查点等后续工作稳定后结束。参阅[合约][1]、[ProviderRuntimeIngestion.ts][5] 和 [CheckpointReactor.ts][6]。

#### 活动

附加到会话的用户可见日志条目。在[合约][1]中，活动涵盖审批、工具操作和失败等重要的非消息事件。它们在 [projector.ts][4] 中投影到会话状态。

### 编排

编排是服务器端领域层，它将运行时活动转换为稳定的应用状态。主要入口为 [OrchestrationEngine.ts][7]，核心逻辑位于 [decider.ts][8] 和 [projector.ts][4]。

#### 聚合

命令或事件所属的领域对象。在[合约][1]中，它通常是 `project` 或 `thread`。参阅 [decider.ts][8]。

#### 命令

请求更改领域状态的类型化请求。在[合约][1]中，命令由 [commandInvariants.ts][9] 验证，再由 [decider.ts][8] 转换为事件。例如 `thread.create`、`thread.turn.start` 和 `thread.checkpoint.revert`。

#### 领域事件

某件事已经发生的持久化事实。在[合约][1]中，事件是真实来源，[projector.ts][4] 展示了如何应用事件。例如 `thread.created`、`thread.message-sent` 和 `thread.turn-diff-completed`。

#### 决策器

将命令和当前状态转换为事件的纯编排逻辑。核心实现在 [decider.ts][8] 中，前置条件位于 [commandInvariants.ts][9]。

#### 投影

从事件派生、针对读取优化的视图。参阅 [projector.ts][4]、[ProjectionPipeline.ts][11] 和 [ProjectionSnapshotQuery.ts][10]。

#### 投影器

将领域事件应用到读取模型或投影表的逻辑。参阅 [projector.ts][4] 和 [ProjectionPipeline.ts][11]。

#### 读取模型

编排状态当前的物化视图。在[合约][1]中，它包含项目、会话、消息、活动、检查点和会话状态。参阅 [ProjectionSnapshotQuery.ts][10] 和 [OrchestrationEngine.ts][7]。

#### 响应器

在事件或运行时信号之后处理后续工作的有副作用服务。例如 [CheckpointReactor.ts][6]、[ProviderCommandReactor.ts][12] 和 [ProviderRuntimeIngestion.ts][5]。

#### 回执

异步里程碑完成时发出的轻量类型化运行时信号。参阅 [RuntimeReceiptBus.ts][13]。例如 `checkpoint.baseline.captured`、`checkpoint.diff.finalized` 和 `turn.processing.quiesced`，它们由 [CheckpointReactor.ts][6] 等流程发出。

#### 静止

“静止”表示一次 Turn 已经安静且稳定。在[回执模式][13]中，它表示后续工作已经稳定，包括 [CheckpointReactor.ts][6] 中的工作。

### 供应商运行时

活动的后端智能体实现及其事件流。主要服务为 [ProviderService.ts][14]，适配器合约为 [ProviderAdapter.ts][15]，概览位于 [providers.md][16]。

#### 供应商

实际执行工作的后端智能体运行时。参阅 [ProviderService.ts][14]、[ProviderAdapter.ts][15] 和 [CodexAdapter.ts][17]。

#### 会话运行时

附加到会话的活动供应商运行时。其结构位于[编排合约][1]中，生命周期由 [ProviderService.ts][14] 管理。

#### 运行模式

会话或会话运行时的安全和访问模式。在[合约][1]中，主要值为 `approval-required` 和 `full-access`。参阅 [runtime-modes.md][18]。

#### 交互模式

会话的智能体交互风格。在[合约][1]中，主要值为 `default` 和 `plan`。参阅 [runtime-modes.md][18]。

#### 助手交付模式

控制助手文本如何进入会话时间线。在[合约][1]中，`streaming` 增量更新，`buffered` 交付完整结果。参阅 [ProviderService.ts][14]。

#### 快照

某一时刻的状态视图。该词用于编排、供应商和检查点等多个层。参阅 [ProjectionSnapshotQuery.ts][10]、[ProviderAdapter.ts][15] 和 [CheckpointStore.ts][19]。

### 检查点

检查点会随时间捕获工作区状态，使应用能够比较 Turn 并恢复到早期状态。主要组件为 [CheckpointStore.ts][19]、[CheckpointDiffQuery.ts][20] 和 [CheckpointReactor.ts][6]。

#### 检查点

会话工作区在特定 Turn 的已保存快照。实际形式是 [CheckpointStore.ts][19] 中的隐藏 Git 引用，加上 [ProjectionCheckpoints.ts][21] 投影的摘要。捕获和生命周期工作在 [CheckpointReactor.ts][6] 中进行。

#### 检查点引用

文件系统检查点的持久标识符，以 Git 引用形式存储。它在[合约][1]中定义类型，由 [Utils.ts][22] 构造，并由 [CheckpointStore.ts][19] 使用。

#### 检查点基线

比较会话时间线时使用的起始检查点。该流程通过 [RuntimeReceiptBus.ts][13] 暴露、由 [CheckpointReactor.ts][6] 协调，并由 [Utils.ts][22] 支持。

#### 检查点差异

两个检查点之间的补丁差异。查询逻辑位于 [CheckpointDiffQuery.ts][20]，差异解析位于 [Diffs.ts][23]，最终确定由 [CheckpointReactor.ts][6] 协调。

#### Turn 差异

一次 Turn 的文件补丁和已更改文件摘要。它通常由 [CheckpointDiffQuery.ts][20] 计算、在[合约][1]中表示，并由 [projector.ts][4] 记录到会话状态。

## 实用速记

- 看到 `requested` 时，将其理解为“意图已记录”。
- 看到 `completed` 时，将其理解为“结果已应用”。
- 看到 `receipt` 时，将其理解为“异步里程碑信号”。
- 看到 `checkpoint` 时，将其理解为“用于比较或恢复的工作区快照”。
- 看到 `quiesced` 时，将其理解为“所有相关后续工作均已空闲”。

## 相关文档

- [overview.md][24]
- [providers.md][16]
- [runtime-modes.md][18]
- [workspace-layout.md][2]

[1]: ../../../packages/contracts/src/orchestration.ts
[2]: ./workspace-layout.md
[3]: ../../../apps/server/src/git/GitManager.ts
[4]: ../../../apps/server/src/orchestration/projector.ts
[5]: ../../../apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.ts
[6]: ../../../apps/server/src/orchestration/Layers/CheckpointReactor.ts
[7]: ../../../apps/server/src/orchestration/Layers/OrchestrationEngine.ts
[8]: ../../../apps/server/src/orchestration/decider.ts
[9]: ../../../apps/server/src/orchestration/commandInvariants.ts
[10]: ../../../apps/server/src/orchestration/Layers/ProjectionSnapshotQuery.ts
[11]: ../../../apps/server/src/orchestration/Layers/ProjectionPipeline.ts
[12]: ../../../apps/server/src/orchestration/Layers/ProviderCommandReactor.ts
[13]: ../../../apps/server/src/orchestration/Services/RuntimeReceiptBus.ts
[14]: ../../../apps/server/src/provider/Layers/ProviderService.ts
[15]: ../../../apps/server/src/provider/Services/ProviderAdapter.ts
[16]: ../architecture/providers.md
[17]: ../../../apps/server/src/provider/Layers/CodexAdapter.ts
[18]: ../architecture/runtime-modes.md
[19]: ../../../apps/server/src/checkpointing/CheckpointStore.ts
[20]: ../../../apps/server/src/checkpointing/CheckpointDiffQuery.ts
[21]: ../../../apps/server/src/persistence/Services/ProjectionCheckpoints.ts
[22]: ../../../apps/server/src/checkpointing/Utils.ts
[23]: ../../../apps/server/src/checkpointing/Diffs.ts
[24]: ../architecture/overview.md
