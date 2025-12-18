/**
 * Tests for base-mcp.ts framework utilities
 */

import {
  assertEquals,
  assertExists,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { describe, it } from "https://deno.land/std@0.224.0/testing/bdd.ts";
import {
  createPrompt,
  createResource,
  defineSimpleTool,
  defineTool,
  imageContent,
  parseCliArgs,
  textContent,
  z,
  zodToJsonSchema,
} from "./base-mcp.ts";

// =============================================================================
// zodToJsonSchema Tests
// =============================================================================

describe("zodToJsonSchema", () => {
  it("should convert schema and return object", () => {
    const schema = z.object({
      name: z.string(),
      count: z.number(),
    });
    const jsonSchema = zodToJsonSchema(schema);
    assertExists(jsonSchema);
    assertEquals(typeof jsonSchema, "object");
  });
});

// =============================================================================
// parseCliArgs Tests
// =============================================================================

describe("parseCliArgs", () => {
  it("should return default values with empty args", () => {
    const args = parseCliArgs([]);
    assertEquals(args, {
      transport: "stdio",
      port: 3000,
      host: "localhost",
      help: false,
    });
  });

  it("should parse --transport=stdio", () => {
    const args = parseCliArgs(["--transport=stdio"]);
    assertEquals(args.transport, "stdio");
  });

  it("should parse --transport=sse", () => {
    const args = parseCliArgs(["--transport=sse"]);
    assertEquals(args.transport, "sse");
  });

  it("should parse --transport=http", () => {
    const args = parseCliArgs(["--transport=http"]);
    assertEquals(args.transport, "http");
  });

  it("should fallback to stdio for unknown transport", () => {
    const args = parseCliArgs(["--transport=unknown"]);
    assertEquals(args.transport, "stdio");
  });

  it("should parse --port", () => {
    const args = parseCliArgs(["--port=8080"]);
    assertEquals(args.port, 8080);
  });

  it("should parse --host", () => {
    const args = parseCliArgs(["--host=0.0.0.0"]);
    assertEquals(args.host, "0.0.0.0");
  });

  it("should parse --help", () => {
    const args = parseCliArgs(["--help"]);
    assertEquals(args.help, true);
  });

  it("should parse -h", () => {
    const args = parseCliArgs(["-h"]);
    assertEquals(args.help, true);
  });

  it("should parse multiple args", () => {
    const args = parseCliArgs([
      "--transport=sse",
      "--port=9000",
      "--host=127.0.0.1",
    ]);
    assertEquals(args.transport, "sse");
    assertEquals(args.port, 9000);
    assertEquals(args.host, "127.0.0.1");
  });
});

// =============================================================================
// defineTool Tests
// =============================================================================

describe("defineTool", () => {
  it("should create a tool with correct properties", () => {
    const tool = defineTool({
      name: "test_tool",
      description: "A test tool",
      inputSchema: z.object({ query: z.string() }),
      outputSchema: z.object({ result: z.string() }),
      handler: async (input) => ({ result: `Hello, ${input.query}!` }),
    });

    assertEquals(tool.name, "test_tool");
    assertEquals(tool.description, "A test tool");
    assertExists(tool.inputSchema);
    assertExists(tool.outputSchema);
    assertExists(tool.call);
    assertExists(tool.handler);
    assertExists(tool._mcpHandler);
  });

  it("should call handler directly via call()", async () => {
    const tool = defineTool({
      name: "greet",
      description: "Greet someone",
      inputSchema: z.object({ name: z.string() }),
      outputSchema: z.object({ greeting: z.string() }),
      handler: async (input) => ({ greeting: `Hello, ${input.name}!` }),
    });

    const result = await tool.call({ name: "World" });
    assertEquals(result, { greeting: "Hello, World!" });
  });

  it("should validate input schema", async () => {
    const tool = defineTool({
      name: "typed",
      description: "Type checked",
      inputSchema: z.object({ count: z.number().min(0) }),
      outputSchema: z.object({ doubled: z.number() }),
      handler: async (input) => ({ doubled: input.count * 2 }),
    });

    await assertRejects(
      () => tool.call({ count: -1 }),
      Error,
    );
  });

  it("should validate output schema", async () => {
    const tool = defineTool({
      name: "bad_output",
      description: "Returns wrong type",
      inputSchema: z.object({}),
      outputSchema: z.object({ value: z.number() }),
      handler: async () => ({ value: "not a number" as unknown as number }),
    });

    await assertRejects(
      () => tool.call({}),
      Error,
    );
  });

  it("should return MCP content via _mcpHandler", async () => {
    const tool = defineTool({
      name: "mcp_test",
      description: "Test MCP handler",
      inputSchema: z.object({ x: z.number() }),
      outputSchema: z.object({ y: z.number() }),
      handler: async (input) => ({ y: input.x * 2 }),
    });

    const result = await tool._mcpHandler({ x: 5 });
    assertEquals(result.isError, undefined);
    assertEquals(result.content.length, 1);
    assertEquals(result.content[0].type, "text");

    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    assertEquals(parsed, { y: 10 });
  });

  it("should handle errors in _mcpHandler", async () => {
    const tool = defineTool({
      name: "error_test",
      description: "Test error handling",
      inputSchema: z.object({ x: z.number() }),
      outputSchema: z.object({ y: z.number() }),
      handler: async () => {
        throw new Error("Test error");
      },
    });

    const result = await tool._mcpHandler({ x: 5 });
    assertEquals(result.isError, true);
    assertEquals(result.content[0].type, "text");
    assertEquals(
      (result.content[0] as { text: string }).text.includes("Test error"),
      true,
    );
  });
});

// =============================================================================
// defineSimpleTool Tests
// =============================================================================

describe("defineSimpleTool", () => {
  it("should create a tool with string output schema", async () => {
    const tool = defineSimpleTool({
      name: "simple",
      description: "Simple tool",
      inputSchema: z.object({ text: z.string() }),
      handler: async (input) => `Processed: ${input.text}`,
    });

    const result = await tool.call({ text: "hello" });
    assertEquals(result, "Processed: hello");
  });
});

// =============================================================================
// Utility Function Tests
// =============================================================================

describe("textContent", () => {
  it("should create text content", () => {
    const content = textContent("Hello, World!");
    assertEquals(content, { type: "text", text: "Hello, World!" });
  });
});

describe("imageContent", () => {
  it("should create image content", () => {
    const content = imageContent("base64data", "image/png");
    assertEquals(content, {
      type: "image",
      data: "base64data",
      mimeType: "image/png",
    });
  });
});

describe("createResource", () => {
  it("should create a resource", () => {
    const handler = async () => "content";
    const resource = createResource(
      "file:///{path}",
      "file",
      "File resource",
      handler,
      "text/plain",
    );

    assertEquals(resource.uriTemplate, "file:///{path}");
    assertEquals(resource.name, "file");
    assertEquals(resource.description, "File resource");
    assertEquals(resource.mimeType, "text/plain");
    assertEquals(resource.handler, handler);
  });
});

describe("createPrompt", () => {
  it("should create a prompt", () => {
    const handler = async () => "prompt content";
    const prompt = createPrompt("test_prompt", "Test prompt", handler, [
      { name: "arg1", description: "Arg 1", required: true },
    ]);

    assertEquals(prompt.name, "test_prompt");
    assertEquals(prompt.description, "Test prompt");
    assertEquals(prompt.arguments?.length, 1);
    assertEquals(prompt.arguments?.[0].name, "arg1");
    assertEquals(prompt.handler, handler);
  });
});
