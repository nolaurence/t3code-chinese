# 连接运行时

连接运行时由 Web 和移动端共享。它负责连接、身份验证、重试、传输生命周期、缓存的环境数据以及限定于环境的操作。

Web 和移动端都只在应用根节点挂载一次此运行时。不存在旧版连接所有者，也不支持混合模式。

## 所有权

每个已注册环境都有一个限定作用域的 Effect `Context`，其中包含职责明确的服务：

- `EnvironmentSupervisor` 负责期望状态、重试调度和活动会话作用域。
- `ConnectionBroker` 为主连接、Bearer、Relay 和 SSH 目标准备凭据与端点。
- `RpcSessionFactory` 执行一次传输尝试，不负责重试。
- `EnvironmentRpc` 暴露活动会话，但不泄漏传输对象。
- `EnvironmentProjectCommands` 和 `EnvironmentThreadCommands` 构造编排命令、ID 和时间戳。
- `EnvironmentShell` 和 `EnvironmentThreads` 负责实时订阅和缓存快照。

`EnvironmentServicesFactory` 组装该 Context，`EnvironmentRegistry` 负责它的作用域。系统中没有聚合式环境运行时门面。React 组件不会创建连接、传输、重试循环或 RPC 客户端。

## 连接状态

Supervisor 是唯一的重试所有者。

1. 持久化注册或平台注册将环境标记为期望连接。
2. 如果设备离线，Supervisor 会释放活动会话，并在不消耗重试次数的情况下等待。
3. 设备上线后，Supervisor 向 Broker 请求一个准备好的连接，再向 Session Factory 请求一个 RPC 会话。
4. 瞬时故障会使用指数退避无限重试，最长等待时间限制为 16 秒。
5. 网络状态变化、应用激活、凭据变化和用户显式重试都会中断当前等待并触发新尝试。
6. 身份验证或配置故障会保持阻塞，直到外部唤醒改变相关输入。
7. 非主动会话关闭会保留注册和缓存，然后进行重试。
8. 显式移除会关闭会话，并删除注册、凭据、Shell 缓存和任务缓存。

界面根据 Supervisor 状态和显式数据同步状态推导 `available`、`offline`、`connecting`、`reconnecting`、`connected` 和 `error`。它不会根据缓存数据或传输对象是否存在来推断连接健康状况。Socket 打开并且初始配置 RPC 成功后，环境才进入 `connected`，这可以证明服务端能够响应。Shell 与任务同步是相互独立的数据状态。健康的 RPC 传输如果发生 Shell 订阅失败，会显示为已连接并附带同步错误，而不是显示成实际上并未调度的重连。

## 数据边界

有限请求、持久订阅和命令是相互独立的 API：

- RPC Generation 变化时，Query Atom 重新校验。
- Subscription Atom 切换到替代会话。
- 预期内的订阅失败会更新领域同步状态并等待替代会话，不会关闭健康的传输。
- Mutation 在执行时解析当前环境运行时。
- 离线时仍可使用 Shell 和任务快照。
- 已连接的传输，其 Shell 和任务数据可分别处于 `empty`、`cached`、`synchronizing`、`live` 或失败状态。
- 快速重连过程中，缓存的 Shell 和任务投影绝不允许覆盖更新的实时数据。
- 领域 Atom 工厂通过环境注册表路由 Effect，并在执行时解析当前作用域服务。
- Web 和移动端分别拥有自己的 Atom 运行时、React Hook 和功能组合。

Promise Bridge 只存在于 React/Atom 边界。运行时与业务逻辑保持 Effect 原生实现。

## 平台层

Web 和移动端提供：

- 网络状态和网络变化流；
- 应用生命周期唤醒；
- 云会话凭据；
- 设备身份；
- 平台注册；
- 持久化目录、凭据、Shell 和任务存储；
- HTTP、加密和遥测层。

平台层用于适配操作系统能力，不实现连接策略。

## 源码边界

公开包子路径与运行时层一一对应：

- `connection/core` 包含状态、目录、重试策略和网络状态。
- `connection/transport` 包含连接代理、授权、尝试和 RPC 会话。
- `connection/platform` 声明能力和持久化合约。
- `connection/services` 包含限定于环境的数据服务。
- `connection/application` 组装注册表、发现与启动流程。
- `connection/atoms` 将共享服务适配到应用拥有的 Atom 运行时。
- `connection/presentation` 包含纯界面投影。

其他可复用状态位于 `shell`、`threads`、`terminal` 和 `vcs` 等领域子路径中。应用必须显式导入包子路径；该包有意不提供根导出。

## 应用边界

应用根节点挂载共享连接应用层，创建自己的 Atom 运行时，并选择该平台所需的领域 Atom 工厂。Web 和移动端可以暴露不同的 Hook 和功能，而无需改变连接所有权。

应用代码不得构造 `WsTransport`、RPC 客户端、重试循环或原始编排命令。持久化路径属于平台注册和缓存存储，并具有明确的迁移或失效策略。

## 验证

核心状态机测试使用 `@effect/vitest` 和确定性的服务层。要求覆盖：

- 离线启动和上线唤醒；
- 使用 16 秒上限无限重试；
- 显式重试中断退避；
- 身份验证唤醒；
- 非主动关闭和重新连接；
- 显式移除清理所有自有状态；
- Relay Token 复用和刷新；
- 渐进式 Relay 发现；
- Shell 和任务缓存水合；
- 持久订阅切换会话；
- 命令元数据和幂等的排队命令元数据。
