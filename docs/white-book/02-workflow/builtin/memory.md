# Memory Workflow

记忆管理工作流，支持编程和 AI 两种模式。

## 使用方式

```bash
# 列出所有
deno run -A memory.workflow.ts list

# 搜索
deno run -A memory.workflow.ts search --query "typescript"

# 记录
deno run -A memory.workflow.ts record --content "使用 zod 验证类型"

# AI 模式
deno run -A memory.workflow.ts ai --prompt "整理 TypeScript 相关记忆"
```

## Subflows

| 子流程   | 驱动模式 | 说明         |
| -------- | -------- | ------------ |
| `list`   | 编程     | 列出所有记忆 |
| `search` | 编程     | 搜索记忆     |
| `record` | 编程     | 记录新记忆   |
| `ai`     | AI       | 智能管理记忆 |

## 参数

### search

| 参数      | 别名 | 说明              |
| --------- | ---- | ----------------- |
| `--query` | `-q` | 搜索关键词 (必填) |
| `--limit` | `-l` | 结果数量          |

### record

| 参数        | 别名 | 说明             |
| ----------- | ---- | ---------------- |
| `--content` | `-c` | 记忆内容 (必填)  |
| `--tags`    | `-t` | 标签（逗号分隔） |

### ai

| 参数       | 别名 | 说明               |
| ---------- | ---- | ------------------ |
| `--prompt` | `-p` | AI 任务描述 (必填) |

## 使用的 MCP

- `memory` - 记忆存储和检索
