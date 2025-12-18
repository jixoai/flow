# Memory MCP

记忆存储和检索。

## 工具

| 工具            | 说明         |
| --------------- | ------------ |
| `memory_record` | 记录新记忆   |
| `memory_search` | 搜索记忆     |
| `memory_list`   | 列出所有记忆 |

## 程序调用

```typescript
import {
  listMemories,
  recordMemory,
  searchMemories,
} from "../mcps/memory.mcp.ts";

// 记录
await recordMemory("TypeScript 5.0 发布", ["typescript"]);

// 搜索
const results = await searchMemories("typescript");

// 列表
const all = await listMemories();
```

## AI 调用

```typescript
const result = await createAiQueryBuilder()
  .prompt("搜索 TypeScript 相关记忆")
  .mcpServers({ memory: await getMcpServerConfig("memory") })
  .allowTools(["mcp__memory__*"])
  .executeWithSession();
```

## 存储格式

```
<cwd>/.claude/.memories/
├── 2024-01-15_typescript-tips.md
├── 2024-01-16_react-hooks.md
└── ...
```

```markdown
---
source: user
tags: [typescript, tips]
createdAt: 2024-01-15T10:30:00Z
---

TypeScript 4.9 引入了 satisfies 操作符...
```
