# 远程访问

当你想从手机、平板电脑或另一台桌面应用等其他设备连接 T3 Code 服务器时，请使用本指南。

## 推荐配置

使用能够将设备连接成网状网络的可信私有网络，例如 Tailnet。

这样可以获得：

- 稳定的连接地址
- 网络层的传输安全
- 比将服务器暴露到公共互联网更小的暴露面

## 启用网络访问

可以通过两种方式公开服务器以供远程连接：桌面应用或 CLI。

### 选项 1：桌面应用

如果桌面应用已经运行，并且希望其他设备可以访问它：

1. 打开**设置** → **连接**。
2. 在**管理本地后端**下启用**网络访问**。应用将重启，并让后端监听所有网络接口。
3. 设置面板会显示默认可访问端点；存在更多端点时会显示 `+N` 控件。展开后可查看回环、局域网、私有网络或 HTTPS 等备选端点。
4. 使用**创建链接**生成可与其他设备共享的配对链接。

默认端点控制配对链接的二维码和主要复制操作。你可以在展开的端点列表中更改它。偏好按端点类型存储，因此即使在不同网络间移动导致 IP 地址正常变化，选择的本地局域网端点仍会保留。

未保存用户默认值时，如果内置局域网端点可用，应用会使用它生成配对链接。你可以在展开的端点列表中将其他端点设为默认值。

- 兼容 HTTPS/WSS 的端点可在 `https://app.t3.codes` 中使用，但不会自动设为默认值。
- 非回环 HTTP 端点适用于直接局域网配对。
- 除非设备就是同一台计算机，否则仅限回环的端点对其他设备没有用处。

如果复制的链接直接指向 `http://192.168.x.y:3773`，请从能够访问该局域网地址的客户端打开。如果链接指向 `https://app.t3.codes/pair?...`，托管 Web 应用会保存环境，并直接连接到链接中的后端 URL。

### Tailscale 端点

桌面应用检测到 Tailscale 时，会将 Tailnet 端点添加到可访问端点列表。

根据 Tailscale 配置，可能包括：

- 计算机的 `100.x.y.z` Tailnet IP
- MagicDNS 名称
- 为该后端配置 Tailscale Serve 后提供的 HTTPS MagicDNS 端点

Tailscale HTTPS 端点使用简洁的 MagicDNS URL，例如 `https://machine.tailnet.ts.net/`。应用验证该 URL 能访问当前后端之前，此端点处于禁用状态。使用 Tailscale HTTPS 行中的**设置**主动启用。桌面应用会以和 `t3 serve --tailscale-serve` 相同的服务器端行为重启后端，之后服务器会要求 Tailscale Serve 将 HTTPS 流量代理到本地后端。

Tailscale 支持是一个端点供应商附加组件。核心远程模型在没有 Tailscale 时仍可工作：局域网 HTTP 端点、自定义 HTTPS 端点、未来隧道和 SSH 启动的环境均使用同一套已保存环境与配对流程。

对于 `https://app.t3.codes`，优先使用 HTTPS Tailnet 或其他 HTTPS 端点。普通 `http://100.x.y.z:3773` 端点仍可在桌面客户端或通过 HTTP 提供的其他浏览器页面中使用，但由于浏览器混合内容规则，它无法在托管 HTTPS 应用中工作。

### 选项 2：无界面服务器（CLI）

当希望在没有 GUI 的情况下运行服务器，例如通过 SSH 在远程计算机上运行时，请使用此方式。

使用 `t3 serve` 运行服务器。

```bash
npx t3 serve --host "$(tailscale ip -4)"
```

`t3 serve` 启动服务器但不打开浏览器，并输出：

- 连接字符串
- 配对令牌
- 配对 URL
- 配对 URL 的二维码

之后可以通过以下任一方式从其他设备连接：

- 使用手机扫描二维码
- 在桌面应用中输入完整配对 URL
- 在桌面应用中分别输入主机和令牌
- 后端可通过 HTTPS 访问时，在托管 Web 应用中打开托管配对 URL

使用 `t3 serve --help` 查看完整参数参考。它支持与常规服务器命令相同的通用启动选项，包括可选的 `cwd` 参数。

要通过 Tailscale HTTPS 进行托管 Web 配对，请主动启用 Tailscale Serve：

```bash
npx t3 serve --tailscale-serve
```

默认情况下，这会在 HTTPS 端口 443 上配置 Tailscale Serve，并发布 `https://machine.tailnet.ts.net/`。高级用户可以选择其他 HTTPS 端口：

```bash
npx t3 serve --tailscale-serve --tailscale-serve-port 8443
```

> 注意
> GUI 目前不支持向远程环境添加项目。
> 现在请改为在服务器计算机上使用 `t3 project ...`。
> 远程项目管理的完整 GUI 支持即将推出。

### 选项 3：桌面管理的 SSH 启动

当希望桌面应用通过 SSH 在另一台计算机上启动或复用 T3 Code 时，请使用此方式。

1. 打开**设置** → **连接**。
2. 在**远程环境**下选择**添加环境**。
3. 选择 SSH 启动流程。
4. 输入 SSH 目标，例如 `user@example.com`。
5. 确认启动。桌面应用会探测主机、启动或复用远程 T3 服务器、打开本地端口转发并保存环境。

配置完成后，渲染器连接到本地转发的 HTTP/WebSocket 端点。远程主机仍拥有实际的 T3 服务器、项目、文件、Git 状态、终端和供应商会话。

SSH 启动是桌面功能，因为它需要本地进程和 SSH 访问权限。环境配对并保存后，会与直接局域网、Tailscale、HTTPS 或未来由隧道支持的环境使用相同的环境列表和连接模型。

#### SSH 启动故障排除

桌面 SSH 启动器使用非交互式 `sh` 会话连接，在 `~/.t3/ssh-launch/<host-key>/` 下写入一个小型启动脚本，启动或复用远程 T3 服务器，并将远程回环端口转发回桌面。

远程主机必须安装兼容的 Node.js 运行时。T3 Code 使用服务器包的 `engines.node` 要求：

```text
^22.16 || ^23.11 || >=24.10
```

SSH 启动期间，T3 Code 首先检查 `PATH` 中是否已有 `node`。如果没有，启动器会尝试常见的非交互式 Shell 位置以及版本管理器 shim 或激活钩子：

- `~/.local/bin`、`~/bin`、`/opt/homebrew/bin`、`/usr/local/bin`、`/usr/bin`、`/bin`
- 通过 `~/.volta/bin` 使用 Volta
- 通过 `~/.asdf/shims`、`~/.asdf/bin` 或 `~/.asdf/asdf.sh` 使用 asdf
- 通过 `~/.local/share/mise/shims`、`~/.mise/shims` 或 `mise activate sh` 使用 mise
- 通过 `fnm env --use-on-cd --shell sh` 或 `fnm env --shell sh` 使用 fnm
- 通过 `~/.nodenv/bin`、`~/.nodenv/shims` 或 `nodenv init -` 使用 nodenv
- 通过 `$NVM_DIR/nvm.sh` 使用 nvm，然后执行 `nvm use default`、`nvm use node` 或 `nvm use --lts`
- `$NVM_DIR/versions/node/*/bin` 下已安装的 nvm 版本

如果启动失败并显示 `node: command not found`、端口扫描失败，或提示远程 Node 版本不满足要求，请通过 SSH 登录主机，并检查 T3 Code 使用的同一非交互式 Shell 路径：

```bash
ssh user@example.com 'sh -lc "command -v node && node --version"'
```

如果该命令没有输出兼容的 Node 版本，请为非交互式 Shell 配置版本管理器，或将兼容的 Node 二进制文件安装到上述搜索位置之一。例如使用 nvm 时，可能需要配置默认别名：

```bash
nvm alias default 24
```

使用 mise/asdf/fnm/nodenv 时，请确保工具的 shim 目录已安装，并指向满足上述范围的 Node 版本。

如果应用更新后重新连接失败，请重试一次 SSH 启动。启动器现在会比较生成的运行脚本、停止由启动器管理的过期远程服务器、清除 SSH 启动 PID/端口状态，并启动新的远程服务器。通常无需手动删除 `~/.t3/ssh-launch` 或终止 `t3` 进程。

## 配对工作原理

远程设备一开始不需要长期密钥。

流程如下：

1. `t3 serve` 签发一次性所有者配对令牌。
2. 远程设备与服务器交换该令牌。
3. 服务器为该设备创建已认证会话。

配对后，后续访问以会话为基础。除非要配对新设备，否则无需持续重复使用原始令牌。

## 托管 Web 应用配对

`https://app.t3.codes` 上的托管 Web 应用可以通过以下 URL 将远程后端保存到浏览器本地存储：

```text
https://app.t3.codes/pair?host=https://backend.example.com:3773#token=PAIRCODE
```

当后端可由浏览器通过 HTTPS/WSS 访问时，请使用托管配对。这包括位于可信 HTTPS 隧道或你管理的其他 HTTPS 端点之后的后端。

不要对 `http://192.168.x.y:3773` 等普通 HTTP 局域网 URL 使用托管配对。浏览器会阻止 HTTPS 页面连接不安全的 HTTP 或 WS 后端。对于这些端点，请从能够直接打开该 HTTP URL 的客户端使用桌面应用或 CLI 显示的直接配对 URL。

托管配对不会通过 T3 Code 代理流量。浏览器仍会直接连接配对链接中的后端 URL。

## 后续管理访问权限

初始配对后，使用 `t3 auth` 管理访问权限。

常见用途：

- 签发额外的配对凭据
- 查看活动会话
- 撤销旧配对链接或会话

使用 `t3 auth --help` 和嵌套子命令的帮助页面查看完整参考。

## 安全说明

- 将配对 URL 和配对令牌视为密码。
- 优先将 `--host` 绑定到可信私有地址，例如 Tailnet IP，而不是广泛暴露服务器。
- 任何拥有有效配对凭据的人都能创建会话，直到该凭据过期或被撤销。
- 托管配对链接将凭据放在 URL 哈希中，因此不会发送给托管应用服务器，但仍可能通过浏览器历史记录、屏幕截图、日志或复制粘贴暴露。
- 使用 `t3 auth` 撤销不再信任的凭据或会话。
