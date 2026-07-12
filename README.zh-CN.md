# T3 Code

[简体中文](./README.md) | [English](./README.en.md)

T3 Code 是一个供编程智能体使用的简洁 Web 图形界面，目前支持 Codex、Claude、Cursor、OpenCode 和 Pi，后续还会支持更多智能体。

## 安装

> [!WARNING]
> T3 Code 目前支持 Codex、Claude、Cursor、OpenCode 和 Pi。
> 使用前，请至少安装并登录一个供应商：
>
> - Codex：安装 [Codex CLI](https://developers.openai.com/codex/cli)，然后运行 `codex login`
> - Claude：安装 [Claude Code](https://claude.com/product/claude-code)，然后运行 `claude auth login`
> - Cursor：安装 [Cursor CLI](https://cursor.com/cli)，然后运行 `cursor-agent login`
> - OpenCode：安装 [OpenCode](https://opencode.ai)，然后运行 `opencode auth login`
> - Pi：运行 `npm install -g @earendil-works/pi-coding-agent`，然后按 [Pi 供应商指南](./docs/zh-CN/providers/pi.md) 配置模型和认证

### 无需安装直接运行

```bash
npx t3@latest
```

提示：运行 `npx t3@latest --help` 可查看完整 CLI 参考。

### 桌面应用

从 [GitHub Releases](https://github.com/nolaurence/t3code-chinese/releases) 安装最新桌面应用，也可以使用常用的软件包管理器：

#### Windows（`winget`）

```bash
winget install T3Tools.T3Code
```

#### macOS（Homebrew）

```bash
brew install --cask t3-code
```

#### Arch Linux（AUR）

```bash
yay -S t3code-bin
```

## 说明

本项目仍处于非常早期的开发阶段，使用时可能遇到问题。

目前暂不接受外部贡献。

公开文档站点尚未上线，请查看 [docs/zh-CN](./docs/zh-CN/) 中的 Markdown 文档。

## 文档

- [快速开始](./docs/zh-CN/getting-started/quick-start.md)
- [架构概览](./docs/zh-CN/architecture/overview.md)
- 供应商指南：[Codex](./docs/zh-CN/providers/codex.md)、[Claude](./docs/zh-CN/providers/claude.md)、[Pi](./docs/zh-CN/providers/pi.md)
- [运维](./docs/zh-CN/operations/ci.md)
- [参考手册](./docs/zh-CN/reference/encyclopedia.md)

## 仍然希望参与贡献时，请先阅读以下内容

### 安装 `vp`

T3 Code 使用 Vite+，因此需要安装全局 `vp` 命令行工具。

#### macOS / Linux

```bash
curl -fsSL https://vite.plus | bash
```

#### Windows

```bash
irm https://vite.plus/ps1 | iex
```

更多信息请查看 Vite+ 的入门指南：https://viteplus.dev/guide/

### 安装依赖

```bash
vp i
```

提交 Issue 或 PR 前，请阅读 [CONTRIBUTING.md](./CONTRIBUTING.md)。

需要支持时，可以加入 [Discord](https://discord.gg/jn4EGJjrvv)。
