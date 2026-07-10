# 可观测性

T3 Code 使用一套服务器端可观测性模型：

- 面向人的美化日志写入标准输出
- 已完成的 span 写入本地 NDJSON 链路追踪文件
- 链路和指标也可以通过 OTLP 导出到 Grafana LGTM 等真实后端

本地链路追踪文件是持久化的真实来源，不再单独持久化服务器日志文件。

## 内容位置

### 日志

日志只面向人：

- 目标：标准输出
- 格式：`Logger.consolePretty()`
- 持久化：无

如果希望一条日志消息出现在链路追踪文件中，请在活动 span 内使用 `Effect.log...` 发出。`Logger.tracerLogger` 会将其附加为 span 事件。

### 链路追踪

已完成的 span 以 NDJSON 记录形式写入 `serverTracePath`（默认为 `~/.t3/userdata/logs/server.trace.ndjson`）。

每条记录中的重要字段：

- `name`：span 名称
- `traceId`、`spanId`、`parentSpanId`：关联标识
- `durationMs`：耗时
- `attributes`：结构化上下文
- `events`：嵌入的日志和自定义事件
- `exit`：`Success`、`Failure` 或 `Interrupted`

模式位于 `apps/server/src/observability/TraceRecord.ts`。

### 指标

指标不会写入本地文件。

- 本地持久化：无
- 远程导出：仅在配置时通过 OTLP
- 当前定义：`apps/server/src/observability/Metrics.ts`

未配置 OTLP 时，指标仍存在于进程中，但没有可供检查的本地产物。

### 相关产物

供应商运行时流仍有供应商事件 NDJSON 文件。它们与主服务器链路追踪文件彼此独立。

## 以插桩模式运行服务器

有两种实用模式：

- 仅本地：标准输出 + 本地 `server.trace.ndjson`
- 完整本地可观测性：标准输出 + 本地链路文件 + 通过 OTLP 导出到 Grafana/Tempo/Prometheus

本地链路追踪文件始终启用。OTLP 导出需要主动配置。

### 选项 1：仅本地链路追踪

不需要额外的环境变量。正常运行应用并检查 `server.trace.ndjson` 即可。

示例：

```bash
npx t3
```

```bash
node --run dev
```

```bash
node --run dev:desktop
```

### 选项 2：使用本地 LGTM 栈运行

#### 1. 启动 Grafana LGTM

```bash
docker run --name lgtm \
  -p 3000:3000 \
  -p 4317:4317 \
  -p 4318:4318 \
  --rm -ti \
  grafana/otel-lgtm
```

然后打开 `http://localhost:3000`。

默认 Grafana 登录信息：

- 用户名：`admin`
- 密码：`admin`

#### 2. 导出 OTLP 环境变量

```bash
export T3CODE_OTLP_TRACES_URL=http://localhost:4318/v1/traces
export T3CODE_OTLP_METRICS_URL=http://localhost:4318/v1/metrics
export T3CODE_OTLP_SERVICE_NAME=t3-local
```

可选：

```bash
export T3CODE_TRACE_MIN_LEVEL=Info
export T3CODE_TRACE_TIMING_ENABLED=true
```

#### 3. 从同一 Shell 启动应用

CLI：

```bash
npx t3
```

Monorepo Web/服务器开发：

```bash
node --run dev
```

Monorepo 桌面开发：

```bash
node --run dev:desktop
```

打包的桌面应用：

从同一 Shell 启动实际应用可执行文件，使桌面应用和嵌入式后端继承 `T3CODE_OTLP_*`。

macOS 应用包示例：

```bash
T3CODE_OTLP_TRACES_URL=http://localhost:4318/v1/traces \
T3CODE_OTLP_METRICS_URL=http://localhost:4318/v1/metrics \
T3CODE_OTLP_SERVICE_NAME=t3-desktop \
"/Applications/T3 Code.app/Contents/MacOS/T3 Code"
```

直接运行二进制文件示例：

```bash
T3CODE_OTLP_TRACES_URL=http://localhost:4318/v1/traces \
T3CODE_OTLP_METRICS_URL=http://localhost:4318/v1/metrics \
T3CODE_OTLP_SERVICE_NAME=t3-desktop \
./path/to/your/desktop-app-binary
```

设置 Shell 环境变量后，不要依赖从 Finder、Spotlight、程序坞或开始菜单启动。此类启动通常无法获取这些变量。

#### 4. 更改环境变量后完全重启

后端在进程启动时读取可观测性配置。更改 OTLP 环境变量后，请完全停止应用并重新启动。

## 使用链路追踪和指标调试服务器

### 从本地链路追踪文件开始

链路追踪文件是检查原始 span 数据最快的方式。

持续查看：

```bash
tail -f "$T3CODE_HOME/userdata/logs/server.trace.ndjson"
```

在 Monorepo 开发环境中使用：

```bash
tail -f ./dev/logs/server.trace.ndjson
```

显示失败的 span：

```bash
jq -c 'select(.exit._tag != "Success") | {
  name,
  durationMs,
  exit,
  attributes
}' "$T3CODE_HOME/userdata/logs/server.trace.ndjson"
```

显示耗时较长的 span：

```bash
jq -c 'select(.durationMs > 1000) | {
  name,
  durationMs,
  traceId,
  spanId
}' "$T3CODE_HOME/userdata/logs/server.trace.ndjson"
```

检查嵌入的日志事件：

```bash
jq -c 'select(any(.events[]?; .attributes["effect.logLevel"] != null)) | {
  name,
  durationMs,
  events: [
    .events[]
    | select(.attributes["effect.logLevel"] != null)
    | {
        message: .name,
        level: .attributes["effect.logLevel"]
      }
  ]
}' "$T3CODE_HOME/userdata/logs/server.trace.ndjson"
```

跟踪一条链路：

```bash
jq -r 'select(.traceId == "TRACE_ID_HERE") | [
  .name,
  .spanId,
  (.parentSpanId // "-"),
  .durationMs
] | @tsv' "$T3CODE_HOME/userdata/logs/server.trace.ndjson"
```

筛选编排命令：

```bash
jq -c 'select(.attributes["orchestration.command_type"] != null) | {
  name,
  durationMs,
  commandType: .attributes["orchestration.command_type"],
  aggregateKind: .attributes["orchestration.aggregate_kind"]
}' "$T3CODE_HOME/userdata/logs/server.trace.ndjson"
```

筛选 Git 活动：

```bash
jq -c 'select(.attributes["git.operation"] != null) | {
  name,
  durationMs,
  operation: .attributes["git.operation"],
  cwd: .attributes["git.cwd"],
  hookEvents: [
    .events[]
    | select(.name == "git.hook.started" or .name == "git.hook.finished")
  ]
}' "$T3CODE_HOME/userdata/logs/server.trace.ndjson"
```

### 需要真正的链路查看器时使用 Tempo

在以下场景中，Tempo 比原始 NDJSON 更适合：

- 跨多条链路搜索
- 直观检查父子关系
- 比较多条慢链路
- 无需手动按 `traceId` 连接即可深入查看一个失败请求

Grafana 中的推荐流程：

1. 打开 `Explore`。
2. 选择 `Tempo` 数据源。
3. 将时间范围设置为近期，例如 `Last 15 minutes`。
4. 从宽泛条件开始，不要一开始就使用非常窄的查询。
5. 查找来自已配置服务名称的 span，再按 span 名称或属性缩小范围。

适合作为起点的搜索：

- `t3-local`、`t3-dev` 或 `t3-desktop` 等服务名称
- `sql.execute`、`git.runCommand`、`provider.sendTurn` 等 span 名称
- 带有 `orchestration.command_type` 等属性的编排 span

确认链路到达后，`name = "sql.execute"` 等更窄的 TraceQL 查询就会很有用。

### 使用指标发现系统性问题

链路追踪最适合单个请求，指标最适合趋势。

值得关注的指标系列：

- `t3_rpc_request_duration`
- `t3_orchestration_command_duration`
- `t3_orchestration_command_ack_duration`
- `t3_provider_turn_duration`
- `t3_git_command_duration`
- `t3_db_query_duration`

计数器可以反映流量和失败率：

- `t3_rpc_requests_total`
- `t3_orchestration_commands_total`
- `t3_provider_turns_total`
- `t3_git_commands_total`
- `t3_db_queries_total`

以下问题使用指标：

- “它一直这么慢吗？”
- “某次更改后是否变慢？”
- “哪种命令类型最常失败？”

以下问题使用链路追踪：

- “这个具体请求中发生了什么？”
- “哪个子 span 导致这次交互变慢？”
- “失败流程中发出了哪些日志？”

### 新确认指标的含义

`t3_orchestration_command_ack_duration` 测量：

- 开始：命令分派进入编排引擎
- 结束：服务器发布该命令的第一个已提交领域事件

这是服务器端确认指标，不测量：

- 传输到浏览器的 WebSocket 时间
- 客户端接收时间
- React 渲染时间

如果以后需要这些数据，请添加客户端插桩或专用服务器扇出指标。

## 常见工作流

### “为什么这个请求失败了？”

1. 从本地 NDJSON 文件开始。
2. 查找 `exit._tag != "Success"` 的 span。
3. 按 `traceId` 分组。
4. 检查同级 span 和 span 事件。
5. 如有需要，转到 Tempo 查看完整链路树。

### “为什么 UI 感觉很慢？”

1. 在链路文件或 Tempo 中搜索慢的顶层 span。
2. 检查 sqlite、Git、供应商或终端工作的子 span。
3. 查看匹配的耗时指标，判断是否为系统性变慢。

### “这个命令是否花了太长时间才确认？”

1. 按 `commandType` 检查 `t3_orchestration_command_ack_duration`。
2. 如果数值很高，检查对应的编排链路。
3. 查看投影、sqlite、供应商或 Git 工作的子 span。

### “Git Hook 是否导致延迟？”

1. 筛选 `git.operation` span。
2. 检查 `git.hook.started` 和 `git.hook.finished` 事件。
3. 将 Hook 耗时与外层 Git span 耗时比较。

### “为什么本地有 span，但 Grafana 中没有？”

通常是以下原因之一：

- 未设置 `T3CODE_OTLP_TRACES_URL`
- 应用启动环境与导出变量的环境不同
- 更改环境变量后没有完全重启应用
- Grafana 正在查看错误的时间范围或服务名称

如果本地 NDJSON 文件正在更新，说明本地链路追踪正常。问题几乎总在 OTLP 导出配置或进程启动上。

## 如何为未来代码添加链路追踪

### 优先对边界插桩，而不是细小辅助函数

适合的 span 边界：

- RPC 方法
- 编排命令处理
- 供应商适配器调用
- 外部进程调用
- 持久化写入
- 队列交接

避免追踪每个细小辅助函数。大多数辅助函数应继承活动 span，而不是新建 span。

### 在已经使用 `Effect.fn(...)` 的位置复用它

代码库大量使用 `Effect.fn("name")`，通常应将它作为首选链路边界。

对于临时工作：

```ts
import { Effect } from "effect";

const runThing = Effect.gen(function* () {
  yield* Effect.annotateCurrentSpan({
    "thing.id": "abc123",
    "thing.kind": "example",
  });

  yield* Effect.logInfo("starting thing");
  return yield* doWork();
}).pipe(Effect.withSpan("thing.run"));
```

### 将高基数细节放在 span 上

使用 span 注解记录 ID、路径和其他详细上下文：

```ts
yield *
  Effect.annotateCurrentSpan({
    "provider.thread_id": input.threadId,
    "provider.request_id": input.requestId,
    "git.cwd": input.cwd,
  });
```

### 保持指标标签低基数

适合的指标标签：

- 操作类型
- 方法名称
- 供应商类型
- 聚合类型
- 结果

不适合的指标标签：

- 原始会话 ID
- 命令 ID
- 文件路径
- cwd
- 完整提示词
- 可以使用规范化系列标签时的完整模型字符串

详细上下文应放在 span 上，而不是指标中。

### 将日志用作 span 事件

span 内的日志会成为链路故事的一部分：

```ts
yield * Effect.logInfo("starting provider turn");
yield * Effect.logDebug("waiting for approval response");
```

由于安装了 `Logger.tracerLogger`，这些消息会显示为 span 事件。

### 使用可管道化指标 API

`withMetrics(...)` 是为 Effect 附加计数器和计时器的默认方式：

```ts
import { someCounter, someDuration, withMetrics } from "../observability/Metrics.ts";

const program = doWork().pipe(
  withMetrics({
    counter: someCounter,
    timer: someDuration,
    attributes: {
      operation: "work",
    },
  }),
);
```

## 详细 API 参考

### 运行时接线

服务器可观测性层在 `apps/server/src/observability/Layers/Observability.ts` 中组装。

它提供：

- 美化的标准输出日志器
- `Logger.tracerLogger`
- 本地 NDJSON 追踪器
- 可选的 OTLP 链路导出器
- 可选的 OTLP 指标导出器
- Effect 链路级别和计时引用

### 环境变量

本地链路追踪文件：

- `T3CODE_TRACE_FILE`：覆盖链路追踪文件路径
- `T3CODE_TRACE_MAX_BYTES`：单文件轮转大小，默认为 `10485760`
- `T3CODE_TRACE_MAX_FILES`：轮转文件数量，默认为 `10`
- `T3CODE_TRACE_BATCH_WINDOW_MS`：刷新窗口，默认为 `200`
- `T3CODE_TRACE_MIN_LEVEL`：最低链路级别，默认为 `Info`
- `T3CODE_TRACE_TIMING_ENABLED`：启用计时元数据，默认为 `true`

OTLP 导出：

- `T3CODE_OTLP_TRACES_URL`：OTLP 链路端点
- `T3CODE_OTLP_METRICS_URL`：OTLP 指标端点
- `T3CODE_OTLP_EXPORT_INTERVAL_MS`：导出间隔，默认为 `10000`
- `T3CODE_OTLP_SERVICE_NAME`：服务名称，默认为 `t3-server`

未设置 OTLP URL 时，本地链路追踪仍会工作，指标只保留在进程中。

### 当前插桩范围

当前高价值 span 和指标边界包括：

- 来自 `effect/rpc` 的 Effect RPC WebSocket 请求 span
- `apps/server/src/observability/RpcInstrumentation.ts` 中的 RPC 请求指标
- 启动阶段
- 编排命令处理
- 编排命令确认延迟
- 供应商会话和 Turn 操作
- Git 命令执行和 Git Hook 事件
- 终端会话生命周期
- sqlite 查询执行

### 当前限制

- span 外的日志不会持久化
- 指标不会在本地生成快照
- 旧的 `serverLogPath` 仍保留在配置中以兼容旧版本，但真正重要的持久化产物是链路追踪文件
