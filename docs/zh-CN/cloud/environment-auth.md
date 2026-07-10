# 环境认证配置

环境服务器与 Relay 使用彼此独立的凭据、签发者和信任边界。两者有意采用相似的 OAuth 形态，以便依据成熟概念审计权限检查和令牌交换行为。

## 授权模型

环境授权基于能力。一个会话携带零个或多个 OAuth 风格的作用域字符串：

| 作用域                  | 权限                                               |
| ----------------------- | -------------------------------------------------- |
| `orchestration:read`    | 读取快照、状态、事件、配置以及文件系统/VCS 状态。  |
| `orchestration:operate` | 分派用户操作并修改环境侧工作区状态。               |
| `terminal:operate`      | 创建、附加、输入、调整大小、清空、重启和终止终端。 |
| `review:write`          | 读取用于编写审查反馈的审查差异预览。               |
| `access:read`           | 查看配对链接和客户端会话。                         |
| `access:write`          | 创建或撤销配对链接和客户端会话。                   |
| `relay:read`            | 查看托管 Relay 连接。                              |
| `relay:write`           | 关联、配置或取消关联托管 Relay 连接。              |

普通配对链接授予四个客户端操作作用域，以及对托管 Relay 连接的读取权限：`orchestration:read orchestration:operate terminal:operate review:write relay:read`。桌面引导凭据和命令行管理引导凭据还会授予 `access:read access:write relay:write`。

## 认证流程

### 浏览器会话

`POST /api/auth/browser-session` 消耗一次性引导凭据并创建浏览器会话 Cookie。该 Cookie 是同一作用域会话模型的 HTTP 传输适配器；响应绝不会向浏览器 JavaScript 暴露会话密钥。

### Bearer 访问令牌

非浏览器客户端使用 `POST /oauth/token`，并发送 `application/x-www-form-urlencoded` 请求体：

```text
grant_type=urn:ietf:params:oauth:grant-type:token-exchange
subject_token=<bootstrap credential>
subject_token_type=urn:t3:params:oauth:token-type:environment-bootstrap
requested_token_type=urn:ietf:params:oauth:token-type:access_token
scope=orchestration:read orchestration:operate terminal:operate review:write relay:read
```

客户端还可以提交 `client_label`、`client_device_type` 和 `client_os` 扩展参数，让已授权客户端 UI 能够识别建立会话的设备。这些参数只用于展示；环境会从请求中获取 IP 地址和用户代理等传输元数据，不会使用这些字段进行授权。

响应采用令牌交换格式：

```json
{
  "access_token": "<opaque session token>",
  "issued_token_type": "urn:ietf:params:oauth:token-type:access_token",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "orchestration:read orchestration:operate terminal:operate review:write relay:read"
}
```

请求的作用域必须是一次性引导凭据授权范围的子集。因此，普通配对客户端无法将其授权交换为 `access:read`、`access:write` 或 `relay:write`。

### WebSocket 票据

`POST /api/auth/websocket-ticket` 接受任意已认证会话，并返回一个短期、单用途的 WebSocket 票据。这样既能让套接字握手完成认证，又能避免 Bearer 令牌和浏览器 Cookie 出现在 WebSocket URL 中。票据携带所属会话的作用域；之后每个 RPC 方法会按需强制要求 `orchestration:read`、`orchestration:operate`、`terminal:operate`、`review:write` 或 `access:read`。提交审查反馈目前会分派编排操作，因此执行该操作的客户端还需要 `orchestration:operate`。能够创建票据并不代表有权调用所有 RPC 方法。

## 标准一致性

- Bearer 访问令牌通过 RFC 6750 定义的 `Authorization: Bearer` 方案使用。
- 令牌端点采用 OAuth 2.0 Token Exchange（RFC 8693）的请求和响应词汇，包括 `subject_token`、`requested_token_type`、`access_token`、`issued_token_type` 和 `token_type`。
- 作用域值遵循 RFC 6749 的 OAuth 2.0 作用域模型：使用空格分隔、无顺序的能力集合，并在交换时执行子集检查。

这有意不做成通用 OAuth 授权服务器。环境引导令牌类型是私有的，引导 Cookie 和 WebSocket 连接令牌路由是产品专用适配器，API 返回自身类型化的 `HttpApi` 错误，而不是实现 OAuth 的全部错误响应面。

## 升级行为

迁移 `031_AuthAuthorizationScopes` 会从携带角色的认证记录硬切换到作用域记录。它会删除已有配对链接和会话，同时保持非认证环境状态不变。升级后的客户端必须重新配对；旧的 `owner` 或 `client` 凭据绝不会被静默映射到新能力。

## Relay 边界

Relay 管理的隧道使用自己的令牌和密钥。Relay 可以复用作用域解析和令牌交换约定，但环境访问令牌不是 Relay 令牌，不能提交给 Relay。
