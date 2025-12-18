# Coder Workflow

AI 驱动的编程工作流，支持代码生成、重构和 OpenSpec 变更管理。

## 使用方式

```bash
# 基本执行
deno run -A coder.workflow.ts --prompt "实现快速排序"

# 使用 OpenSpec
deno run -A coder.workflow.ts proposal --prompt "添加用户认证"
deno run -A coder.workflow.ts apply CHANGE-001
deno run -A coder.workflow.ts archive CHANGE-001

# 恢复会话
deno run -A coder.workflow.ts --resume abc123 --prompt "修复测试"
```

## 参数

| 参数       | 别名 | 说明            |
| ---------- | ---- | --------------- |
| `--prompt` | `-p` | 任务描述 (必填) |
| `--resume` | `-r` | 恢复会话 ID     |

## Subflows

| 子流程     | 说明                   |
| ---------- | ---------------------- |
| `run`      | 执行编程任务（默认）   |
| `proposal` | 创建 OpenSpec 变更提案 |
| `apply`    | 应用变更提案           |
| `archive`  | 归档完成的变更         |

## 使用的 MCP

- `memory` - 搜索相关上下文
- `openspec` - 管理变更规格

## 示例场景

### 实现新功能

```bash
deno run -A coder.workflow.ts -p "实现 JWT 认证中间件"
```

### 大型变更（OpenSpec）

```bash
# 创建提案
deno run -A coder.workflow.ts proposal -p "数据库迁移到 PostgreSQL"

# 审核后应用
deno run -A coder.workflow.ts apply CHANGE-001

# 完成后归档
deno run -A coder.workflow.ts archive CHANGE-001
```
