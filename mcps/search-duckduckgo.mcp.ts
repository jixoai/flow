#!/usr/bin/env -S deno run -A --no-config
/**
 * DuckDuckGo Search MCP Server
 *
 * Provides DuckDuckGo search functionality using mcporter + chrome-devtools.
 *
 * Usage:
 *   deno run -A search-duckduckgo.mcp.ts
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

interface McpRuntime {
  close(): Promise<void>;
}
interface ChromeDevToolsProxy {
  newTab(options: { url: string }): Promise<{ json(): { tabId: string } }>;
  getAccessibilityTree(options: { tabId: string }): Promise<{ text(): string }>;
  closeTab(options: { tabId: string }): Promise<void>;
}

export interface SearchResult {
  title: string;
  url: string;
  description: string;
}

export interface SearchResponse {
  success: boolean;
  query: string;
  results: SearchResult[];
  rawA11yTree?: string;
  error?: string;
}

// =============================================================================
// Core Functions (Exported for programmatic use)
// =============================================================================

/** Parse DuckDuckGo accessibility tree to extract search results */
export function parseA11yTreeToResults(a11yContent: string): SearchResult[] {
  const results: SearchResult[] = [];
  const lines = a11yContent.split("\n");
  let currentResult: Partial<SearchResult> | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    const linkMatch = trimmed.match(
      /link\s+"([^"]+)"\s+url:\s*(https?:\/\/[^\s]+)/i,
    );
    if (linkMatch) {
      if (currentResult?.title && currentResult?.url) {
        results.push(currentResult as SearchResult);
      }
      currentResult = {
        title: linkMatch[1],
        url: linkMatch[2],
        description: "",
      };
      continue;
    }

    const headingLinkMatch = trimmed.match(/heading.*link\s+"([^"]+)"/i);
    if (headingLinkMatch && currentResult === null) {
      currentResult = { title: headingLinkMatch[1], url: "", description: "" };
      continue;
    }

    if (currentResult && !currentResult.url) {
      const urlMatch = trimmed.match(/(https?:\/\/[^\s"]+)/);
      if (urlMatch) {
        currentResult.url = urlMatch[1];
        continue;
      }
    }

    if (currentResult && currentResult.url) {
      const textMatch = trimmed.match(/text\s+"([^"]+)"/i);
      if (textMatch && textMatch[1].length > 20) {
        currentResult.description = currentResult.description
          ? currentResult.description + " " + textMatch[1]
          : textMatch[1];
      }
    }

    if (results.length >= 10) break;
  }

  if (currentResult?.title && currentResult?.url) {
    results.push(currentResult as SearchResult);
  }
  return results.slice(0, 10);
}

/** Format search results as Markdown */
export function formatResultsAsMarkdown(response: SearchResponse): string {
  if (!response.success) {
    return `## Search Failed\n\n**Query:** ${response.query}\n**Error:** ${response.error}\n`;
  }

  if (response.results.length === 0) {
    let output = `## No Results Found\n\n**Query:** ${response.query}\n`;
    if (response.rawA11yTree) {
      output +=
        `\n### Raw A11y Tree\n\`\`\`\n${response.rawA11yTree}\n\`\`\`\n`;
    }
    return output;
  }

  let md = `## Search Results: ${response.query}\n\n`;
  response.results.forEach((r, i) => {
    md += `### ${i + 1}. ${r.title}\n\n**URL:** ${r.url}\n\n${
      r.description || "(No description)"
    }\n\n---\n\n`;
  });
  return md;
}

/** Main search function using mcporter and chrome-devtools */
export async function searchDuckDuckGo(query: string): Promise<SearchResponse> {
  let runtime: McpRuntime | null = null;

  try {
    const { createRuntime, createServerProxy } = await import("npm:mcporter");
    // deno-lint-ignore no-explicit-any
    runtime = (await createRuntime()) as any;
    const chrome = createServerProxy(
      // deno-lint-ignore no-explicit-any
      runtime as any,
      "chrome-devtools",
    ) as unknown as ChromeDevToolsProxy;

    const searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
    console.error(`[search-duckduckgo] Opening: ${searchUrl}`);

    const tab = await chrome.newTab({ url: searchUrl });
    const tabId = tab.json().tabId;
    console.error(`[search-duckduckgo] Tab: ${tabId}`);

    await new Promise((r) => setTimeout(r, 3000));

    const a11y = await chrome.getAccessibilityTree({ tabId });
    const a11yContent = a11y.text();
    console.error(`[search-duckduckgo] A11y size: ${a11yContent.length}`);

    const results = parseA11yTreeToResults(a11yContent);
    try {
      await chrome.closeTab({ tabId });
    } catch { /* ignore */ }

    return {
      success: true,
      query,
      results,
      rawA11yTree: results.length === 0
        ? a11yContent.slice(0, 5000)
        : undefined,
    };
  } catch (error) {
    return {
      success: false,
      query,
      results: [],
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    if (runtime) {
      try {
        await runtime.close();
      } catch { /* ignore */ }
    }
  }
}

// =============================================================================
// Tool Definitions
// =============================================================================

/** DuckDuckGo search tool */
export const searchTool = defineTool({
  name: "search_duckduckgo",
  description: "Search the web using DuckDuckGo via real browser automation.",
  inputSchema: z.object({
    query: z.string().describe("The search query"),
    maxResults: z.number().min(1).max(10).optional().default(10).describe(
      "Max results (1-10)",
    ),
    format: z.enum(["markdown", "json"]).optional().default("markdown")
      .describe("Output format"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    query: z.string(),
    results: z.array(z.object({
      title: z.string(),
      url: z.string(),
      description: z.string(),
    })),
    formatted: z.string().optional(),
    error: z.string().optional(),
  }),
  handler: async ({ query, maxResults, format }) => {
    console.error(`[search-duckduckgo] Query: "${query}"`);
    const response = await searchDuckDuckGo(query);

    if (response.results.length > maxResults) {
      response.results = response.results.slice(0, maxResults);
    }

    return {
      success: response.success,
      query: response.query,
      results: response.results,
      formatted: format === "markdown"
        ? formatResultsAsMarkdown(response)
        : JSON.stringify(response, null, 2),
      error: response.error,
    };
  },
});

// =============================================================================
// Server Setup
// =============================================================================

const args = parseCliArgs();
if (args.help) {
  printMcpHelp(
    "search-duckduckgo",
    "DuckDuckGo search MCP server via browser automation",
  );
  Deno.exit(0);
}

export const server = createMcpServer({
  name: "search-duckduckgo",
  version: "2.0.0",
  tools: [searchTool],
  autoStart: import.meta.main,
  debug: true,
});
