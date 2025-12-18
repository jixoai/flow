# defineTool

定义一个 MCP 工具。

## 签名

```typescript
function defineTool<TInput, TOutput>(
  config: ToolConfig<TInput, TOutput>,
): TypedTool<TInput, TOutput>;
```

## ToolConfig

```typescript
interface ToolConfig<TInput, TOutput> {
  name: string;
  description: string;
  inputSchema: ZodSchema<TInput>;
  outputSchema: ZodSchema<TOutput>;
  handler: (input: TInput) => Promise<TOutput>;
}
```

## 返回值

```typescript
interface TypedTool<TInput, TOutput> {
  name: string;
  description: string;
  inputSchema: ZodSchema<TInput>;
  outputSchema: ZodSchema<TOutput>;
  call: (input: TInput) => Promise<TOutput>; // 直接调用
  handler: (input: TInput) => Promise<TOutput>;
}
```

## 示例

```typescript
import { defineTool, z } from "./shared/base-mcp.ts";

export const searchTool = defineTool({
  name: "search",
  description: "Search for items",
  inputSchema: z.object({
    query: z.string().describe("Search query"),
    limit: z.number().optional().default(10),
  }),
  outputSchema: z.object({
    results: z.array(z.object({
      id: z.string(),
      title: z.string(),
    })),
  }),
  handler: async (input) => {
    const results = await doSearch(input.query, input.limit);
    return { results };
  },
});

// 直接调用
const result = await searchTool.call({ query: "test" });

// 导出便捷函数
export async function search(query: string, limit = 10) {
  return searchTool.call({ query, limit });
}
```

## createMcpServer

```typescript
import { createMcpServer } from "./shared/base-mcp.ts";

export const server = createMcpServer({
  name: "my-mcp",
  version: "1.0.0",
  tools: [searchTool, otherTool],
  autoStart: import.meta.main,
});
```
