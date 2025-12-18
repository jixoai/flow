# Git Committer Workflow

AI 驱动的 Git 提交工作流，自动分析变更并生成规范提交信息。

## 使用方式

```bash
# 分析变更并生成提交
deno run -A git-committer.workflow.ts

# 预览模式
deno run -A git-committer.workflow.ts --dry-run

# 只提交指定文件
deno run -A git-committer.workflow.ts --files "src/*.ts"
```

## 参数

| 参数        | 别名 | 说明           |
| ----------- | ---- | -------------- |
| `--files`   | `-f` | 文件 glob 模式 |
| `--staged`  | `-s` | 只提交暂存区   |
| `--dry-run` | `-n` | 预览不执行     |

## 提交格式

遵循 Conventional Commits：

```
<type>(<scope>): <description>

[body]

[footer]
```

| 类型       | 说明      |
| ---------- | --------- |
| `feat`     | 新功能    |
| `fix`      | Bug 修复  |
| `refactor` | 重构      |
| `docs`     | 文档      |
| `test`     | 测试      |
| `chore`    | 构建/工具 |
