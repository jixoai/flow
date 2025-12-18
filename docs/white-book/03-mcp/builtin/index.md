# 内置 MCP

Framework 提供以下内置 MCP：

| MCP                    | 工具                       | 用途             |
| ---------------------- | -------------------------- | ---------------- |
| [memory](./memory)     | record, search, list       | 记忆管理         |
| [openspec](./openspec) | create, show, list, update | 变更规格         |
| [ai](./ai)             | query, resume              | AI 查询统一接口  |
| [meta](./meta)         | workflow, list_workflows   | Workflow 聚合    |
| html2md                | convert                    | HTML 转 Markdown |
| search-duckduckgo      | search                     | 网络搜索         |
| user-proxy             | get_preferences            | 用户偏好         |

## 调用方式

### 程序直接调用

```typescript
import { recordMemory, searchMemories } from "../mcps/memory.mcp.ts";

const results = await searchMemories("typescript");
await recordMemory("TypeScript is awesome");
```

### AI 通过 MCP 协议

```typescript
const result = await createAiQueryBuilder()
  .mcpServers({
    memory: await getMcpServerConfig("memory"),
  })
  .allowTools(["mcp__memory__memory_search"])
  .executeWithSession();
```
