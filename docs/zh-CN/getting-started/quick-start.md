# 快速开始

```bash
# 开发模式（支持热重载）
bun run dev

# 桌面端开发
bun run dev:desktop

# 在一组隔离端口上运行桌面端开发环境
T3CODE_DEV_INSTANCE=feature-xyz bun run dev:desktop

# 生产构建
bun run build
bun run start

# 构建可分发的 macOS .dmg（默认 arm64）
bun run dist:desktop:dmg

# 发布后，也可以从任意项目目录运行
npx t3
```
