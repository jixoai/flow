# 内置 Workflow

Framework 提供以下内置 Workflow：

| Workflow                         | 用途               | 驱动模式    |
| -------------------------------- | ------------------ | ----------- |
| [coder](./coder)                 | 编程任务、OpenSpec | AI + 多模式 |
| [research](./research)           | 研究调查           | AI 驱动     |
| [memory](./memory)               | 记忆管理           | 多模式      |
| [git-committer](./git-committer) | Git 提交           | AI 驱动     |
| [user-proxy](./user-proxy)       | 用户偏好           | 多模式      |

## 快速使用

```bash
# 编程任务
deno run -A workflows/coder.workflow.ts -p "实现 LRU Cache"

# 研究
deno run -A workflows/research.workflow.ts -p "Deno 2.0 新特性"

# 记忆
deno run -A workflows/memory.workflow.ts list
deno run -A workflows/memory.workflow.ts search -q "typescript"

# Git 提交
deno run -A workflows/git-committer.workflow.ts

# 用户偏好
deno run -A workflows/user-proxy.workflow.ts consult -p "测试框架偏好"
```

## 会话恢复

所有 AI 驱动的 Workflow 都支持会话恢复：

```bash
# 首次执行
deno run -A workflows/coder.workflow.ts -p "实现功能 X"
# => Session: claude-abc123

# 恢复
deno run -A workflows/coder.workflow.ts --resume claude-abc123 -p "修复测试"
```
