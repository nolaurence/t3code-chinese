# Relay 可观测性

Relay Alchemy 栈管理一套专注的 Axiom 链路追踪配置：

- `t3-code-relay-traces-prod`：Worker 请求的 OpenTelemetry 链路追踪数据集
- `t3-code-relay-otel-ingest-prod`：绑定到 Worker、限定于该数据集的摄取令牌
- `t3-code-relay-recent-spans-prod`：最近请求和端点 span 的视图

Alchemy 阶段会追加经过清理的阶段名称以隔离资源，例如个人阶段使用的 `t3-code-relay-traces-dev-julius`。

在 `infra/relay` 中使用常规 Alchemy 工作流部署：

```sh
vp run deploy
```

Alchemy 通过其供应商解析 Axiom 部署凭据。运行时，Worker 只会收到限定范围的摄取令牌，不会收到诊断查询令牌。

Worker 会发出 Effect 内置的 HTTP 服务器 span，以及端点和数据库子 span。Effect 的 OpenTelemetry 导出器将语义 HTTP 属性存放在 `attributes.` 前缀下。例如：

```apl
['t3-code-relay-traces-prod']
| where name startswith 'http.server'
| project _time, name, trace_id, duration,
    ['attributes.http.request.method'],
    ['attributes.url.path'],
    ['attributes.http.response.status_code']
| order by _time desc
| limit 200
```

如果 span 中存在端点失败注解和其他 Relay 专用属性，它们也会出现在 `attributes.custom` 映射中，例如 `['attributes.custom']['relay.endpoint']`。

对于已经结束的故障事件，智能体应优先使用预置视图或 APL 查询，而不是持续跟踪 Cloudflare Worker。脚本访问需要使用只读查询令牌；摄取令牌应仅供 Worker 使用。
