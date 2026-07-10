# 运行模式

T3 Code 在聊天工具栏中提供全局运行模式开关：

- **完全访问**（默认）：使用 `approvalPolicy: never` 和 `sandboxMode: danger-full-access` 启动会话。
- **受监督**：使用 `approvalPolicy: on-request` 和 `sandboxMode: workspace-write` 启动会话，然后在应用内请求命令和文件操作批准。
