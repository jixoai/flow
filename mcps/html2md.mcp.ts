#!/usr/bin/env -S deno run -A --no-config
/**
 * HTML to Markdown MCP Server
 *
 * Converts HTML content to Markdown using turndown library with optional AI transcription.
 *
 * Usage:
 *   deno run -A html2md.mcp.ts                    # stdio mode
 *   deno run -A html2md.mcp.ts --transport=sse   # SSE mode
 */

import {
  createMcpServer,
  defineTool,
  parseCliArgs,
  printMcpHelp,
  z,
} from "./shared/base-mcp.ts";

// =============================================================================
// Types
// =============================================================================

// deno-lint-ignore no-explicit-any
type TurndownNode = any;

interface TurndownService {
  turndown(html: string): string;
  addRule(name: string, rule: {
    filter: string | string[] | ((node: TurndownNode) => boolean);
    replacement: (
      content: string,
      node: TurndownNode,
      options: unknown,
    ) => string;
  }): TurndownService;
  remove(filter: string | string[]): TurndownService;
}

// =============================================================================
// Core Functions (Exported for programmatic use)
// =============================================================================

/** Create a configured TurndownService instance */
async function createTurndown(): Promise<TurndownService> {
  const TurndownModule = await import("npm:turndown");
  const TurndownService = TurndownModule.default || TurndownModule;

  const turndown = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    strongDelimiter: "**",
    emDelimiter: "*",
    linkStyle: "inlined",
  });

  turndown.remove(["script", "style", "noscript", "iframe"]);

  turndown.addRule("codeBlock", {
    filter: (node: TurndownNode) =>
      node.nodeName === "PRE" && node.firstChild?.nodeName === "CODE",
    replacement: (_content: string, node: TurndownNode) => {
      const code = node.firstChild;
      const language = code.className?.replace(/^language-/, "") || "";
      return `\n\`\`\`${language}\n${code.textContent || ""}\n\`\`\`\n`;
    },
  });

  turndown.addRule("table", {
    filter: "table",
    replacement: (_content: string, node: TurndownNode) => {
      const rows = node.querySelectorAll("tr");
      if (rows.length === 0) return "";

      const headerCells = rows[0].querySelectorAll("th, td");
      let result = "\n| " + Array.from(headerCells)
        .map((cell: TurndownNode) => cell.textContent?.trim() || "")
        .join(" | ") +
        " |\n";
      result += "| " + Array.from(headerCells).map(() => "---").join(" | ") +
        " |\n";

      for (let i = 1; i < rows.length; i++) {
        const cells = rows[i].querySelectorAll("td, th");
        result += "| " + Array.from(cells)
          .map((cell: TurndownNode) => cell.textContent?.trim() || "")
          .join(" | ") +
          " |\n";
      }
      return result + "\n";
    },
  });

  return turndown;
}

/** Convert HTML to Markdown using turndown */
export async function convertWithTurndown(html: string): Promise<string> {
  const turndown = await createTurndown();
  return turndown.turndown(html);
}

/** Convert HTML to Markdown using AI (codex) */
export async function convertWithAi(
  html: string,
  effort: "minimal" | "low" | "medium" = "low",
): Promise<string> {
  const prompt = `Convert the following HTML to clean, well-formatted Markdown.
Requirements:
- Preserve the structure and meaning
- Use proper Markdown syntax for headings, lists, code blocks, links, etc.
- Remove any unnecessary HTML artifacts
- Output only the Markdown, no explanations

HTML:
${html.slice(0, 50000)}`;

  const cmd = new Deno.Command("codex", {
    args: [
      "exec",
      "--dangerously-bypass-approvals-and-sandbox",
      "--config",
      `model_reasoning_effort=${effort}`,
      prompt,
    ],
    stdout: "piped",
    stderr: "piped",
  });

  const { stdout, stderr, success } = await cmd.output();
  if (!success) {
    throw new Error(`Codex failed: ${new TextDecoder().decode(stderr)}`);
  }
  return new TextDecoder().decode(stdout);
}

/** Fetch HTML from a URL */
export async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return await response.text();
}

// =============================================================================
// Tool Definitions
// =============================================================================

/** HTML to Markdown conversion tool */
export const htmlToMarkdownTool = defineTool({
  name: "html_to_markdown",
  description:
    "Convert HTML content to Markdown. Can fetch from URL or convert provided HTML string directly.",
  inputSchema: z.object({
    url: z.string().url().optional().describe("URL to fetch and convert"),
    html: z.string().optional().describe("HTML string to convert directly"),
    useAi: z.boolean().optional().default(false).describe(
      "Use AI for intelligent conversion",
    ),
    aiEffort: z.enum(["minimal", "low", "medium"]).optional().default("low")
      .describe("AI reasoning effort level"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    markdown: z.string().optional(),
    source: z.string(),
    method: z.enum(["turndown", "codex-ai"]),
    error: z.string().optional(),
  }),
  handler: async ({ url, html, useAi, aiEffort }) => {
    if (!url && !html) {
      return {
        success: false,
        source: "none",
        method: "turndown" as const,
        error: "Either 'url' or 'html' is required",
      };
    }

    try {
      const content = html || await fetchHtml(url!);
      const source = url || "string";
      const method = useAi ? "codex-ai" as const : "turndown" as const;
      const markdown = useAi
        ? await convertWithAi(content, aiEffort)
        : await convertWithTurndown(content);

      return { success: true, markdown, source, method };
    } catch (error) {
      return {
        success: false,
        source: url || "unknown",
        method: useAi ? "codex-ai" as const : "turndown" as const,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
});

/** Fetch raw HTML tool */
export const fetchHtmlTool = defineTool({
  name: "fetch_html",
  description:
    "Fetch raw HTML content from a URL without converting to Markdown.",
  inputSchema: z.object({
    url: z.string().url().describe("URL to fetch HTML from"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    html: z.string().optional(),
    error: z.string().optional(),
  }),
  handler: async ({ url }) => {
    try {
      const html = await fetchHtml(url);
      return { success: true, html };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
});

// =============================================================================
// Server Setup
// =============================================================================

const args = parseCliArgs();
if (args.help) {
  printMcpHelp("html2md", "HTML to Markdown conversion MCP server");
  Deno.exit(0);
}

export const server = createMcpServer({
  name: "html2md",
  version: "2.0.0",
  tools: [htmlToMarkdownTool, fetchHtmlTool],
  autoStart: import.meta.main,
  debug: true,
});
