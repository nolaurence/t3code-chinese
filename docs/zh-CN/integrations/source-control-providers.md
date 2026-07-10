# 源代码管理集成

T3 Code 直接连接 Git 托管供应商，让你无需离开编辑器即可创建拉取请求、审查代码和管理仓库。工作流程不会被打断，不必再在浏览器标签页和终端窗口之间来回切换。

## 支持的供应商

T3 Code 支持团队已在使用的平台：

- **GitHub** - 拉取请求、创建仓库和克隆集成
- **GitLab** - 合并请求、发布仓库和托管仓库克隆
- **Bitbucket** - 拉取请求工作流（通过 API 令牌认证）
- **Azure DevOps** - 支持 Microsoft 托管仓库的拉取请求

## 可以完成的工作

### 从任何位置开始项目

**直接克隆仓库**

- 打开命令面板（`Cmd/Ctrl + K`）→ **添加项目**
- 选择 **GitHub 仓库**、**GitLab 仓库**、**Bitbucket 仓库**、**Azure DevOps 仓库**，或粘贴任意 **Git URL**
- 输入仓库路径（`owner/repo`、`group/project`、`workspace/repository` 或 `project/repository`）或完整 Git URL，选择目标位置，然后开始编码

**将本地项目发布到云端**

- 有一个尚未配置远程仓库的本地 Git 仓库？
- 使用**发布仓库**操作创建新的托管仓库（GitHub、GitLab、Bitbucket 或 Azure DevOps），将它添加为 `origin` 远程仓库并推送，整个过程一次完成
- 非常适合将周末原型变成真正的项目

### 管理代码审查而不中断上下文

**工作时创建拉取请求**

- 从 Git 面板推送分支并创建拉取请求
- T3 Code 可以根据提交建议标题和说明
- 支持 GitHub Pull Requests、GitLab Merge Requests 和 Bitbucket Pull Requests

**及时掌握待处理的审查**

- 查看当前分支是否已有打开的 PR/MR
- 一键在浏览器中直接打开审查
- 检出团队成员的分支，在本地审查代码

### 一眼了解配置状态

**源代码管理设置**页面会准确显示已连接的内容：

- ✅ 哪些供应商已认证并可用
- ⚠️ 缺少哪些配置，以及如何修复
- 👤 当前登录了哪个账户（如果可以获取）

配置新计算机或更改凭据后，执行一次快速的**重新扫描**。

## 开始使用

### GitHub（推荐大多数用户使用）

1. 在运行 T3 Code 的计算机上安装 GitHub CLI：
   ```bash
   brew install gh
   ```
2. 登录：
   ```bash
   gh auth login
   ```
3. 在 T3 Code 中打开**设置 → 源代码管理**，确认 GitHub 显示为已认证

现在就可以克隆、发布和创建拉取请求了。

### GitLab

1. 安装 GitLab CLI：
   ```bash
   brew install glab
   ```
2. 认证：
   ```bash
   glab auth login
   ```
3. 检查**设置 → 源代码管理**以确认连接

### Bitbucket

Bitbucket 使用 API 令牌而不是 CLI 工具：

1. 在 Atlassian 账户中创建对拉取请求和仓库具有读写权限的 API 令牌
2. 在运行 T3 Code 的环境中添加以下环境变量：
   ```bash
   export T3CODE_BITBUCKET_EMAIL="you@example.com"
   export T3CODE_BITBUCKET_API_TOKEN="your-token"
   ```
3. 重启 T3 Code，并在**源代码管理设置**中验证连接

### Azure DevOps

1. 安装 Azure CLI：
   ```bash
   brew install azure-cli
   ```
2. 添加 DevOps 扩展：
   ```bash
   az extension add --name azure-devops
   ```
3. 登录：
   ```bash
   az login
   ```

---

## 要求与故障排除

**必须安装 Git** - T3 Code 使用 Git 执行所有本地操作。请确保服务器上已安装 `git`。

**服务器端配置** - 认证发生在运行 T3 Code 的计算机（服务器）上，而不是本地浏览器中。如果使用托管实例或团队实例，管理员可能已配置好供应商。

**常见问题：**

- **供应商显示“未认证”** - 在服务器终端中运行相应供应商的登录命令（例如 `gh auth login`），然后在设置中重新扫描
- **Bitbucket 无法连接** - 再次确认环境变量已在正确的 Shell 配置文件中设置，并且服务器已经重启
- **无法推送到远程仓库** - 确认 Git 远程 URL 与已认证的供应商匹配（SSH 和 HTTPS 远程地址可能需要不同的凭据）

**需要更多帮助？**请查看供应商的 CLI 文档：

- [GitHub CLI](https://cli.github.com/)
- [GitLab CLI](https://gitlab.com/gitlab-org/cli)
- [Azure CLI](https://docs.microsoft.com/en-us/cli/azure/)
