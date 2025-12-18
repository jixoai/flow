# Create MCP Server Prompt

You are creating a new MCP (Model Context Protocol) server in `mcps/`.

## MCP Core Concepts

MCP servers expose three types of capabilities to AI clients:

| Capability    | Purpose                             | Invoked By          |
| ------------- | ----------------------------------- | ------------------- |
| **Tools**     | Execute actions, perform operations | LLM autonomously    |
| **Resources** | Provide data/content via URI        | Client reads        |
| **Prompts**   | Reusable prompt templates           | User selects via UI |

## Requirements

1. **File Naming**: `<name>.mcp.ts`
2. **Runtime**: Deno with `--no-config -A` flags
3. **Shebang**: `#!/usr/bin/env -S deno run -A --no-config`
4. **API**: Use `defineTool()`, `definePrompt()`, `createResource()` from
   `shared/base-mcp.ts`

## Template Structure

```typescript
#!/usr/bin/env -S deno run -A --no-config
/**
 * <Name> MCP - <Brief description>
 */

import {
  type AnyMcpPromptTemplate,
  type AnyTypedTool,
  createMcpServer,
  createResource,
  definePrompt,
  defineTool,
  type McpResource,
  parseCliArgs,
  printMcpHelp,
  z,
} from "./shared/base-mcp.ts";

const MCP_NAME = "<name>";

// =============================================================================
// Tool Definitions
// =============================================================================

const myTool = defineTool({
  name: "<name>_do_something",
  description: "What this tool does",
  inputSchema: z.object({
    query: z.string().describe("Search query"),
    limit: z.number().optional().default(10).describe("Max results"),
  }),
  outputSchema: z.object({
    results: z.array(z.string()),
    count: z.number(),
  }),
  handler: async ({ query, limit }) => {
    const results = [`Result for: ${query}`];
    return { results, count: results.length };
  },
});

// =============================================================================
// Prompt Definitions (Optional)
// =============================================================================

const reviewPrompt = definePrompt({
  name: "<name>_review",
  description: "Review content with specific criteria",
  argsSchema: {
    content: z.string().describe("Content to review"),
    criteria: z.string().optional().describe("Review criteria"),
  },
  handler: async ({ content, criteria }) => {
    return `Please review the following content${
      criteria ? ` based on: ${criteria}` : ""
    }:\n\n${content}`;
  },
});

// =============================================================================
// Resource Definitions (Optional)
// =============================================================================

const configResource = createResource(
  "config://app/settings",
  "App Settings",
  "Application configuration settings",
  async (_uri) => {
    return JSON.stringify({ theme: "dark", language: "en" }, null, 2);
  },
  "application/json",
);

// =============================================================================
// Collect All
// =============================================================================

export const allTools: AnyTypedTool[] = [myTool];
export const allPrompts: AnyMcpPromptTemplate[] = [reviewPrompt];
export const allResources: McpResource[] = [configResource];

// =============================================================================
// Server Setup
// =============================================================================

export const server = createMcpServer({
  name: MCP_NAME,
  version: "1.0.0",
  description: "<Full description>",
  tools: allTools,
  prompts: allPrompts,
  resources: allResources,
  autoStart: import.meta.main,
  debug: true,
});

// CLI help
if (import.meta.main) {
  const args = parseCliArgs();
  if (args.help) {
    printMcpHelp(MCP_NAME, "<Description for help>");
    Deno.exit(0);
  }
}

// =============================================================================
// Exports for programmatic use
// =============================================================================

export { myTool, reviewPrompt };

export async function doSomething(query: string, limit = 10) {
  return myTool.call({ query, limit });
}
```

---

## Key APIs

### defineTool()

Tools are actions the LLM can invoke autonomously.

```typescript
const tool = defineTool({
  name: "tool_name",             // snake_case, prefix with mcp name
  description: "...",            // Clear description for AI
  inputSchema: z.object({...}),  // Zod schema - MUST use z.object()
  outputSchema: z.object({...}), // Zod schema - MUST use z.object()
  handler: async (input) => output,
});

// Direct call (works without MCP server)
const result = await tool.call({ query: "test" });
```

**Schema Notes**:

- `inputSchema` and `outputSchema` MUST be `z.object({...})`
- Use `.describe()` on fields to help AI understand parameters
- Use `.optional()` for optional fields
- Use `.default(value)` for default values

### definePrompt()

Prompts are reusable templates that users select via UI (not called by LLM).

```typescript
const prompt = definePrompt({
  name: "prompt_name",
  description: "What this prompt does",
  argsSchema: { // Direct object - NOT z.object()!
    code: z.string().describe("Code to review"),
    language: z.string().optional().describe("Programming language"),
  },
  handler: async ({ code, language }) => {
    return `Please review this ${language || ""} code:\n\n${code}`;
  },
});
```

**IMPORTANT**: `argsSchema` uses ZodRawShape (plain object), NOT `z.object()`:

```typescript
// CORRECT
argsSchema: {
  code: z.string(),
  language: z.string().optional(),
}

// WRONG - DO NOT USE z.object()
argsSchema: z.object({
  code: z.string(),
})
```

### createResource()

Resources provide data that clients can read.

```typescript
const resource = createResource(
  "file://docs/{name}", // URI template
  "Documentation", // Display name
  "Access documentation files", // Description
  async (uri) => { // Handler receives full URI
    const name = uri.split("/").pop();
    return await Deno.readTextFile(`./docs/${name}.md`);
  },
  "text/markdown", // MIME type (optional)
);
```

### createMcpServer()

```typescript
const server = createMcpServer({
  name: "my-mcp",
  version: "1.0.0",
  description: "...",
  tools: [tool1, tool2],
  prompts: [prompt1, prompt2],
  resources: [resource1],
  autoStart: import.meta.main,
  debug: true,
  transport: "stdio", // "stdio" | "sse" | "http"
  port: 3000, // For sse/http
  host: "localhost", // For sse/http
});
```

---

## Best Practices

### Naming Conventions

| Type     | Pattern               | Example                                |
| -------- | --------------------- | -------------------------------------- |
| Tool     | `<mcp>_<action>`      | `memory_search`, `github_create_issue` |
| Prompt   | `<mcp>_<purpose>`     | `memory_recall`, `code_review`         |
| Resource | `<protocol>://<path>` | `file://config/settings`               |

### Tool Design

1. **Single Responsibility**: One tool = one action
2. **Clear Description**: Describe what, when, and how to use
3. **Typed I/O**: Always use Zod schemas with `.describe()`
4. **Error in Output**: Return errors in response, don't throw

```typescript
// Good: Error in output
handler: (async ({ id }) => {
  const item = await db.find(id);
  if (!item) {
    return { success: false, error: `Item ${id} not found` };
  }
  return { success: true, data: item };
});

// Bad: Throwing
handler: (async ({ id }) => {
  const item = await db.find(id);
  if (!item) throw new Error(`Not found`); // Don't do this
  return item;
});
```

### Prompt Design

1. **User-Triggered**: Prompts are for humans to select, not LLM to call
2. **Template Output**: Return formatted text for LLM context
3. **Optional Args**: Use `.optional()` for non-required parameters

### Resource Design

1. **URI Templates**: Use `{param}` for dynamic segments
2. **MIME Types**: Specify for proper content handling
3. **Caching**: Resources can be cached by clients

---

## Error Handling Pattern

```typescript
import { z } from "./shared/base-mcp.ts";

// Define error output schema
const ResultSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.boolean(),
    data: dataSchema.optional(),
    error: z.string().optional(),
  });

const myTool = defineTool({
  name: "safe_operation",
  description: "...",
  inputSchema: z.object({ param: z.string() }),
  outputSchema: ResultSchema(z.object({ value: z.string() })),
  handler: async ({ param }) => {
    try {
      const result = await doSomething(param);
      return { success: true, data: { value: result } };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
});
```

---

## System Prompt Pattern

Export a system prompt for workflows using this MCP:

```typescript
export const MY_MCP_SYSTEM_PROMPT = `You have access to <name> MCP tools:

## Tools
- <name>_search: Search for items by query
- <name>_create: Create a new item
- <name>_update: Update an existing item
- <name>_delete: Delete an item

## Usage Guidelines
1. Always search before creating to avoid duplicates
2. Use specific queries for better results
3. Handle errors gracefully

Use these tools to accomplish the task.`;
```

---

## 自动发现

MCP 文件放在 `mcps/` 目录下，命名为 `<name>.mcp.ts`，会被 Gateway 自动发现。

无需在 `paths.ts` 中手动注册。使用时：

```typescript
import { getMcpServerConfig } from "../common/paths.ts";

// 获取 MCP 配置（自动通过 HTTP Gateway）
const config = await getMcpServerConfig("my-mcp");
```

---

## Testing

### Type Check

```bash
deno check mcps/<name>.mcp.ts
```

### Run Server

```bash
deno run -A --no-config mcps/<name>.mcp.ts
```

### Direct Tool Call (in test file)

```typescript
import { myTool } from "./my.mcp.ts";

const result = await myTool.call({ query: "test" });
console.log(result);
```

---

## API Comparison

| Feature     | Tool              | Prompt                | Resource       |
| ----------- | ----------------- | --------------------- | -------------- |
| Schema Type | `z.object({...})` | `{...}` (ZodRawShape) | N/A            |
| Called By   | LLM               | User via UI           | Client read    |
| Returns     | Structured data   | String (message)      | String content |
| Use Case    | Actions           | Templates             | Data access    |
