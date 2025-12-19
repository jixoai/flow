# 贡献指南

本章介绍如何参与 JixoFlow 项目开发，包括分支管理、PR 流程和常用 GitHub CLI
命令。

## 分支保护规则

`main` 分支已启用保护，所有更改必须通过 Pull Request 合并：

- **必须通过 CI 检查**：Lint & Type Check、Test
- **必须至少 1 人 Review**
- **过时的 Review 会自动失效**
- **管理员也受规则约束**

## 开发流程

```bash
# 1. 克隆仓库
gh repo clone jixoai/flow
cd flow

# 2. 创建功能分支
git checkout -b feature/my-feature

# 3. 开发并提交
git add .
git commit -m "feat: add my feature"

# 4. 推送并创建 PR
git push -u origin feature/my-feature
gh pr create --title "feat: add my feature" --body "描述你的更改"

# 5. 等待 CI 通过和 Review，然后合并
gh pr merge --squash --delete-branch
```

## GitHub CLI 常用命令

### 仓库操作

```bash
# 克隆仓库
gh repo clone jixoai/flow

# 查看仓库信息
gh repo view

# Fork 仓库
gh repo fork jixoai/flow
```

### Pull Request 操作

```bash
# 创建 PR
gh pr create --title "标题" --body "描述"

# 创建 PR（交互式）
gh pr create

# 创建草稿 PR
gh pr create --draft

# 查看 PR 列表
gh pr list

# 查看 PR 详情
gh pr view <number>

# 在浏览器中打开 PR
gh pr view <number> --web

# 检出 PR 到本地
gh pr checkout <number>

# Review PR
gh pr review <number> --approve
gh pr review <number> --request-changes --body "请修改..."
gh pr review <number> --comment --body "看起来不错"

# 合并 PR
gh pr merge <number> --squash --delete-branch

# 关闭 PR
gh pr close <number>
```

### Issue 操作

```bash
# 创建 Issue
gh issue create --title "标题" --body "描述"

# 查看 Issue 列表
gh issue list

# 查看 Issue 详情
gh issue view <number>

# 关闭 Issue
gh issue close <number>

# 给 Issue 添加标签
gh issue edit <number> --add-label "bug"
```

### CI/CD 操作

```bash
# 查看 workflow 运行状态
gh run list

# 查看特定运行详情
gh run view <run-id>

# 查看运行日志
gh run view <run-id> --log

# 重新运行失败的 workflow
gh run rerun <run-id>

# 手动触发 workflow
gh workflow run deploy-docs.yml
```

### 分支保护查看

```bash
# 查看分支保护规则
gh api repos/jixoai/flow/branches/main/protection

# 查看必需的状态检查
gh api repos/jixoai/flow/branches/main/protection/required_status_checks
```

## 代码质量检查

提交前请确保通过所有检查：

```bash
# 格式化代码
deno fmt

# 代码检查
deno lint

# 类型检查
deno check **/*.ts

# 运行测试
deno test --allow-all
```

## 文档贡献

文档使用 VitePress 构建，位于 `docs/` 目录：

```bash
# 本地预览
deno task docs:dev

# 构建
cd docs && npm run build
```

文档会在 `main` 分支更新时自动部署到 GitHub Pages。

## 提交规范

使用 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

| 类型     | 说明            |
| -------- | --------------- |
| feat     | 新功能          |
| fix      | Bug 修复        |
| docs     | 文档更新        |
| style    | 代码格式调整    |
| refactor | 重构            |
| test     | 测试相关        |
| chore    | 构建/工具链调整 |

示例：

```
feat: add memory search workflow
fix: resolve MCP connection timeout
docs: update contributing guide
```
