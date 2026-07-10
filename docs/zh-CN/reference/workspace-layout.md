# 工作区布局

- `/apps/server`：Node.js WebSocket 服务端。封装 Codex app-server、托管构建后的 Web 应用，并在启动时打开浏览器。
- `/apps/web`：React + Vite 界面。负责会话控制、对话和供应商事件渲染，通过 WebSocket 连接服务端。
- `/apps/desktop`：Electron 外壳。启动桌面端专用的 `t3` 后端进程并加载共享 Web 应用。
- `/packages/contracts`：供应商事件、WebSocket 协议以及模型和会话类型所使用的共享 Effect/Schema 架构与 TypeScript 合约。
- `/packages/shared`：服务端和 Web 共同使用的运行时工具。使用显式子路径导出，例如 `@t3tools/shared/git`、`@t3tools/shared/DrainableWorker`，不提供 barrel index。
