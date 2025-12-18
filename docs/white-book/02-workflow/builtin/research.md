# Research Workflow

AI 驱动的研究工作流，支持网络搜索和报告生成。

## 使用方式

```bash
deno run -A research.workflow.ts --prompt "Deno 2.0 新特性"
```

## 参数

| 参数       | 别名 | 说明            |
| ---------- | ---- | --------------- |
| `--prompt` | `-p` | 研究主题 (必填) |
| `--resume` | `-r` | 恢复会话 ID     |

## 使用的 MCP

- `search-duckduckgo` - 网络搜索
- `html2md` - 网页转 Markdown

## 示例场景

```bash
# 技术调研
deno run -A research.workflow.ts -p "React vs Vue vs Svelte 对比"

# 最佳实践
deno run -A research.workflow.ts -p "TypeScript monorepo 最佳实践"

# 问题排查
deno run -A research.workflow.ts -p "Node.js 内存泄漏排查方法"
```
