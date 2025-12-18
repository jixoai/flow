#!/usr/bin/env -S deno run -A --no-config
/**
 * Example MCP Server - Advanced Patterns
 *
 * Demonstrates:
 * 1. Basic tool definition with type-safe input/output
 * 2. Extending an existing tool (adding fields to input/output)
 * 3. Composing multiple tools into one unified tool
 * 4. autoStart pattern for import-safe modules
 *
 * Usage:
 *   # As MCP server
 *   deno run -A example.mcp.ts
 *
 *   # As library (tools are directly callable)
 *   import { greetTool, extendedGreetTool, unifiedTool } from "./example.mcp.ts";
 *   const result = await greetTool.call({ name: "World" });
 */

import {
  createMcpServer,
  defineTool,
  parseCliArgs,
  printMcpHelp,
  z,
} from "./base-mcp.ts";

// =============================================================================
// PATTERN 1: Basic Tool Definition
// =============================================================================

/** Basic greeting tool */
export const greetTool = defineTool({
  name: "greet",
  description: "Generate a greeting message",
  inputSchema: z.object({
    name: z.string().describe("Name to greet"),
  }),
  outputSchema: z.object({
    message: z.string(),
  }),
  handler: async ({ name }) => ({
    message: `Hello, ${name}!`,
  }),
});

/** Basic calculation tool */
export const calculateTool = defineTool({
  name: "calculate",
  description: "Perform arithmetic",
  inputSchema: z.object({
    op: z.enum(["add", "sub", "mul", "div"]).describe("Operation"),
    a: z.number(),
    b: z.number(),
  }),
  outputSchema: z.object({
    result: z.number(),
  }),
  handler: async ({ op, a, b }) => {
    const ops = {
      add: a + b,
      sub: a - b,
      mul: a * b,
      div: b !== 0 ? a / b : NaN,
    };
    return { result: ops[op] };
  },
});

// =============================================================================
// PATTERN 2: Extending an Existing Tool
// =============================================================================

/**
 * Extend greetTool by:
 * - Adding `formal` and `language` to input
 * - Adding `timestamp` and `language` to output
 *
 * The extended tool wraps the original handler and adds functionality.
 */
export const extendedGreetTool = defineTool({
  name: "greet_extended",
  description: "Extended greeting with formality and language options",
  // Extend input schema
  inputSchema: greetTool.inputSchema.extend({
    formal: z.boolean().optional().default(false).describe(
      "Use formal greeting",
    ),
    language: z.enum(["en", "zh", "ja", "es"]).optional().default("en")
      .describe("Language"),
  }),
  // Extend output schema
  outputSchema: greetTool.outputSchema.extend({
    timestamp: z.string(),
    language: z.string(),
  }),
  handler: async ({ name, formal, language }) => {
    // Greeting templates by language
    const templates: Record<string, { casual: string; formal: string }> = {
      en: { casual: `Hello, ${name}!`, formal: `Good day, ${name}.` },
      zh: { casual: `你好, ${name}!`, formal: `${name}，您好。` },
      ja: {
        casual: `こんにちは、${name}！`,
        formal: `${name}様、ご機嫌いかがでしょうか。`,
      },
      es: { casual: `¡Hola, ${name}!`, formal: `Buenos días, ${name}.` },
    };

    const template = templates[language] || templates.en;
    return {
      message: formal ? template.formal : template.casual,
      timestamp: new Date().toISOString(),
      language,
    };
  },
});

/**
 * Extend calculateTool by:
 * - Adding `precision` to input
 * - Adding `expression` and `formatted` to output
 */
export const extendedCalculateTool = defineTool({
  name: "calculate_extended",
  description: "Extended calculation with precision and formatting",
  inputSchema: calculateTool.inputSchema.extend({
    precision: z.number().min(0).max(10).optional().default(2).describe(
      "Decimal precision",
    ),
  }),
  outputSchema: calculateTool.outputSchema.extend({
    expression: z.string(),
    formatted: z.string(),
  }),
  handler: async ({ op, a, b, precision }) => {
    const symbols = { add: "+", sub: "-", mul: "×", div: "÷" };
    const ops = {
      add: a + b,
      sub: a - b,
      mul: a * b,
      div: b !== 0 ? a / b : NaN,
    };
    const result = ops[op];
    const formatted = Number.isNaN(result)
      ? "Error: Division by zero"
      : result.toFixed(precision);

    return {
      result,
      expression: `${a} ${symbols[op]} ${b}`,
      formatted,
    };
  },
});

// =============================================================================
// PATTERN 3: Composing Multiple Tools into One
// =============================================================================

/**
 * Unified tool that combines multiple operations into a single interface.
 * This is useful when you want to expose one tool that can do multiple things.
 *
 * Benefits:
 * - Single entry point for related operations
 * - Shared context/state if needed
 * - Easier discovery for users
 */
export const unifiedTool = defineTool({
  name: "unified_operations",
  description:
    "Unified tool combining greeting, calculation, and text operations",
  inputSchema: z.object({
    operation: z.enum(["greet", "calculate", "echo", "transform"]).describe(
      "Operation to perform",
    ),
    // Greet params
    name: z.string().optional().describe("Name for greeting"),
    formal: z.boolean().optional().describe("Formal greeting"),
    // Calculate params
    calcOp: z.enum(["add", "sub", "mul", "div"]).optional().describe(
      "Calculation operation",
    ),
    a: z.number().optional().describe("First number"),
    b: z.number().optional().describe("Second number"),
    // Text params
    text: z.string().optional().describe("Text to echo or transform"),
    transform: z.enum(["upper", "lower", "reverse", "base64"]).optional()
      .describe("Transform type"),
  }),
  outputSchema: z.object({
    operation: z.string(),
    success: z.boolean(),
    result: z.union([z.string(), z.number(), z.object({})]),
    error: z.string().optional(),
  }),
  handler: async (
    { operation, name, formal, calcOp, a, b, text, transform },
  ) => {
    try {
      switch (operation) {
        case "greet": {
          if (!name) throw new Error("Name required for greet operation");
          const greeting = formal ? `Good day, ${name}.` : `Hello, ${name}!`;
          return { operation, success: true, result: greeting };
        }

        case "calculate": {
          if (calcOp === undefined || a === undefined || b === undefined) {
            throw new Error(
              "calcOp, a, and b required for calculate operation",
            );
          }
          const ops = {
            add: a + b,
            sub: a - b,
            mul: a * b,
            div: b !== 0 ? a / b : NaN,
          };
          return { operation, success: true, result: ops[calcOp] };
        }

        case "echo": {
          if (!text) throw new Error("Text required for echo operation");
          return { operation, success: true, result: text };
        }

        case "transform": {
          if (!text || !transform) {
            throw new Error("Text and transform required");
          }
          const transforms: Record<string, (s: string) => string> = {
            upper: (s) => s.toUpperCase(),
            lower: (s) => s.toLowerCase(),
            reverse: (s) => s.split("").reverse().join(""),
            base64: (s) => btoa(s),
          };
          return {
            operation,
            success: true,
            result: transforms[transform](text),
          };
        }

        default:
          throw new Error(`Unknown operation: ${operation}`);
      }
    } catch (error) {
      return {
        operation,
        success: false,
        result: "",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
});

// =============================================================================
// PATTERN 4: Tool Factory (Create tools dynamically)
// =============================================================================

/**
 * Factory function to create a specialized greeting tool for a specific language.
 * This pattern is useful for generating tools programmatically.
 */
export function createLanguageGreetTool(
  language: string,
  templates: { casual: string; formal: string },
) {
  return defineTool({
    name: `greet_${language}`,
    description: `Greeting in ${language}`,
    inputSchema: z.object({
      name: z.string(),
      formal: z.boolean().optional().default(false),
    }),
    outputSchema: z.object({
      message: z.string(),
      language: z.literal(language),
    }),
    handler: async ({ name, formal }) => ({
      message: (formal ? templates.formal : templates.casual).replace(
        "{name}",
        name,
      ),
      language: language as typeof language,
    }),
  });
}

// Example: Create language-specific tools using the factory
export const greetFrenchTool = createLanguageGreetTool("french", {
  casual: "Bonjour, {name}!",
  formal: "Bonjour Monsieur/Madame {name}.",
});

export const greetGermanTool = createLanguageGreetTool("german", {
  casual: "Hallo, {name}!",
  formal: "Guten Tag, {name}.",
});

// =============================================================================
// Server Setup
// =============================================================================

const args = parseCliArgs();
if (args.help) {
  printMcpHelp(
    "example",
    `Example MCP demonstrating advanced patterns:
- Basic tool definition
- Extending tools (adding input/output fields)
- Composing multiple tools into one
- Tool factories for dynamic creation`,
  );
  Deno.exit(0);
}

export const server = createMcpServer({
  name: "example-mcp",
  version: "2.0.0",
  description: "Example MCP with advanced patterns",
  tools: [
    // Basic tools
    greetTool,
    calculateTool,
    // Extended tools
    extendedGreetTool,
    extendedCalculateTool,
    // Unified/composed tool
    unifiedTool,
    // Factory-created tools
    greetFrenchTool,
    greetGermanTool,
  ],
  autoStart: import.meta.main,
  debug: true,
});

// =============================================================================
// Usage Examples (Documentation)
// =============================================================================

/**
 * USAGE EXAMPLES:
 *
 * 1. Basic tool call:
 *    const result = await greetTool.call({ name: "Alice" });
 *    // { message: "Hello, Alice!" }
 *
 * 2. Extended tool call:
 *    const result = await extendedGreetTool.call({ name: "Bob", formal: true, language: "zh" });
 *    // { message: "Bob，您好。", timestamp: "2024-...", language: "zh" }
 *
 * 3. Unified tool call:
 *    const result = await unifiedTool.call({ operation: "transform", text: "hello", transform: "upper" });
 *    // { operation: "transform", success: true, result: "HELLO" }
 *
 * 4. Factory-created tool:
 *    const result = await greetFrenchTool.call({ name: "Marie", formal: true });
 *    // { message: "Bonjour Monsieur/Madame Marie.", language: "french" }
 */
