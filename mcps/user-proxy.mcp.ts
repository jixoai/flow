#!/usr/bin/env -S deno run -A --no-config
/**
 * User Proxy MCP Server
 *
 * Atomic operations for user preferences:
 * - Get user technical preferences
 * - Get coding style guidelines
 * - Validate decisions against user preferences
 */

import {
  type AnyTypedTool,
  createMcpServer,
  defineTool,
  parseCliArgs,
  printMcpHelp,
  z,
} from "./shared/base-mcp.ts";

const MCP_NAME = "user-proxy";

// =============================================================================
// User Preferences Data
// =============================================================================

export const USER_PREFERENCES = {
  typescript: {
    strict: true,
    noAny: true,
    noTsIgnore: true,
    typeFirst: true,
    config: {
      strict: true,
      noUnusedLocals: true,
      noUnusedParameters: true,
      noFallthroughCasesInSwitch: true,
      noImplicitOverride: true,
    },
  },
  testing: {
    unit: "vitest@4+",
    e2e: "playwright",
    stories: "storybook@10+",
    environment: "jsdom",
  },
  frontend: {
    framework: "react@19+",
    ui: "shadcn/ui",
    icons: "lucide-react",
    animation: "motion/react",
    styling: "tailwindcss@4",
    router: "@tanstack/react-router",
    state: "@tanstack/react-store",
    query: "@tanstack/react-query",
    table: "@tanstack/react-table",
  },
  backend: {
    http: "hono",
    rpc: "trpc",
  },
  build: {
    packageManager: "pnpm",
    monorepo: "lerna",
    bundler: "vite@7+",
    scriptRunner: "bun",
    tsRunner: "tsx",
    packager: "rolldown/tsdown",
  },
  validation: {
    schema: "zod@4",
    patternMatching: "ts-pattern",
  },
  formatting: {
    formatter: "prettier",
    plugins: ["organize-imports", "tailwindcss"],
  },
  standardLibraries: {
    util: "@gaubee/util",
    node: "@gaubee/node",
    nodekit: "@gaubee/nodekit",
  },
  storage: {
    indexedDB: ["idb", "idb-keyval", "Dexie.js"],
  },
  services: {
    messaging: "nats",
    search: "meilisearch",
  },
};

export const CODING_STYLE = {
  fileSize: {
    target: 200,
    max: 300,
    action: "refactor into folder when exceeded",
  },
  comments: {
    language: "match existing",
    style: "concise for high-level engineers",
    required: ["external interfaces", "http/rpc endpoints", "package exports"],
    markers: ["TODO", "FIXME for shortcomings"],
  },
  naming: {
    files: "kebab-case",
    components: "PascalCase",
    functions: "camelCase",
    constants: "UPPER_SNAKE_CASE",
  },
  architecture: {
    principle: "modular-first",
    splitThreshold: "300 lines",
    abstractToStd: "common patterns go to @gaubee/util or @gaubee/node",
  },
};

export const THINKING_HABITS = {
  humanCentered: "Design from human perception, laziness, and creativity",
  firstPrinciples: "Think from physical fundamentals",
  costAware:
    "Respect facts, find appropriate step size, never compromise for short-term gains",
};

// =============================================================================
// Validation Functions
// =============================================================================

export function validateTechChoice(technology: string, category: string): {
  approved: boolean;
  preferred?: string;
  reason?: string;
} {
  const prefs = USER_PREFERENCES as Record<string, Record<string, unknown>>;
  const categoryPrefs = prefs[category];

  if (!categoryPrefs) {
    return {
      approved: true,
      reason: "Category not in preferences, user discretion",
    };
  }

  const values = Object.values(categoryPrefs);
  const techLower = technology.toLowerCase();

  for (const value of values) {
    if (typeof value === "string" && value.toLowerCase().includes(techLower)) {
      return { approved: true };
    }
    if (
      Array.isArray(value) &&
      value.some((v) => v.toLowerCase().includes(techLower))
    ) {
      return { approved: true };
    }
  }

  // Check for known anti-patterns
  const antiPatterns: Record<string, { preferred: string; reason: string }> = {
    "any": {
      preferred: "proper types",
      reason: "Violates type-safety principle",
    },
    "redux": {
      preferred: "@tanstack/react-query or @tanstack/react-store",
      reason: "TanStack preferred",
    },
    "axios": {
      preferred: "fetch or trpc",
      reason: "Native fetch or type-safe trpc preferred",
    },
    "moment": {
      preferred: "date-fns or native Date",
      reason: "Moment is deprecated",
    },
    "lodash": {
      preferred: "@gaubee/util or native methods",
      reason: "Standard library preferred",
    },
    "jest": { preferred: "vitest", reason: "Vitest is faster and more modern" },
    "webpack": {
      preferred: "vite",
      reason: "Vite preferred for dev experience",
    },
    "npm": {
      preferred: "pnpm",
      reason: "pnpm is the standard package manager",
    },
  };

  const anti = antiPatterns[techLower];
  if (anti) {
    return { approved: false, preferred: anti.preferred, reason: anti.reason };
  }

  return { approved: true, reason: "Not in preferences, user discretion" };
}

export function validateCodeStyle(issue: string): {
  violation: boolean;
  guideline?: string;
  suggestion?: string;
} {
  const issueLower = issue.toLowerCase();

  if (issueLower.includes("file") && issueLower.includes("line")) {
    const match = issue.match(/(\d+)\s*lines?/i);
    if (match) {
      const lines = parseInt(match[1]);
      if (lines > CODING_STYLE.fileSize.max) {
        return {
          violation: true,
          guideline:
            `File size target: ${CODING_STYLE.fileSize.target} lines, max: ${CODING_STYLE.fileSize.max}`,
          suggestion: "Refactor into a folder with multiple files",
        };
      }
    }
  }

  if (
    issueLower.includes("any") || issueLower.includes("ts-ignore") ||
    issueLower.includes("ts-nocheck")
  ) {
    return {
      violation: true,
      guideline:
        "TypeScript must be strictly typed, no any/ts-ignore/ts-nocheck",
      suggestion: "Define proper types or use unknown with type guards",
    };
  }

  if (issueLower.includes("comment") && issueLower.includes("chinese")) {
    return {
      violation: false,
      guideline: "Comments should match existing file language",
      suggestion:
        "Check existing comments in the file for language consistency",
    };
  }

  return { violation: false };
}

// =============================================================================
// System Prompts (exported for workflows)
// =============================================================================

export const USER_PROXY_SYSTEM_PROMPT =
  `You are User-Proxy - representing user consciousness.

## ROLE
You know the user's:
- Technical preferences and stack
- Behavioral habits and patterns
- Thinking approaches

## CONSULTATION
When asked for advice:
1. Check against user preferences
2. Identify any violations
3. Suggest aligned alternatives
4. Provide verdict: Approve / Approve with changes / Reject

## KEY PRINCIPLES
- TypeScript strict, no any
- React 19 + shadcn/ui + TanStack ecosystem
- pnpm + vite + vitest
- File size ~200 lines
- Human-centered design
- First principles thinking`;

export const USER_RULES_MARKDOWN = `
## Technical Preferences

- **TypeScript**: Strict mode, no \`any\`, type-safe = runtime-safe
- **Testing**: vitest + jsdom (unit), playwright (e2e), storybook (stories)
- **Frontend**: React 19, shadcn/ui, lucide-react, motion/react, tailwindcss v4
- **State**: @tanstack/react-store, react-query, react-router
- **Backend**: hono (HTTP), trpc (RPC)
- **Build**: pnpm + lerna, vite, bun for scripts, tsx for execution
- **Validation**: zod v4, ts-pattern
- **Formatting**: prettier with organize-imports and tailwindcss plugins

## Coding Style

- File size: ~200 lines target, 300 max, then refactor to folder
- Comments: Concise, match existing language, required for external APIs
- Use TODO/FIXME for shortcomings

## Thinking

- Human-centered: Design from perception, laziness, creativity
- First principles: Think from fundamentals
- Cost-aware: Respect facts, appropriate step size
`;

// =============================================================================
// Tool Definitions
// =============================================================================

const getPreferencesTool = defineTool({
  name: "user_get_preferences",
  description: "Get user's technical preferences for a category.",
  inputSchema: z.object({
    category: z.enum([
      "typescript",
      "testing",
      "frontend",
      "backend",
      "build",
      "validation",
      "formatting",
      "all",
    ]).optional().default("all"),
  }),
  outputSchema: z.object({
    preferences: z.unknown(),
  }),
  handler: async ({ category }) => {
    if (category === "all") {
      return { preferences: USER_PREFERENCES };
    }
    return {
      preferences: (USER_PREFERENCES as Record<string, unknown>)[category] ||
        {},
    };
  },
});

const getCodingStyleTool = defineTool({
  name: "user_get_coding_style",
  description: "Get user's coding style guidelines.",
  inputSchema: z.object({}),
  outputSchema: z.object({
    style: z.unknown(),
  }),
  handler: async () => ({ style: CODING_STYLE }),
});

const getThinkingHabitsTool = defineTool({
  name: "user_get_thinking_habits",
  description: "Get user's thinking habits and principles.",
  inputSchema: z.object({}),
  outputSchema: z.object({
    habits: z.unknown(),
  }),
  handler: async () => ({ habits: THINKING_HABITS }),
});

const validateTechChoiceTool = defineTool({
  name: "user_validate_tech",
  description: "Validate a technology choice against user preferences.",
  inputSchema: z.object({
    technology: z.string().describe("Technology name to validate"),
    category: z.string().describe(
      "Category: typescript, testing, frontend, backend, build, etc.",
    ),
  }),
  outputSchema: z.object({
    approved: z.boolean(),
    preferred: z.string().optional(),
    reason: z.string().optional(),
  }),
  handler: async ({ technology, category }) =>
    validateTechChoice(technology, category),
});

const validateStyleTool = defineTool({
  name: "user_validate_style",
  description: "Validate code against user's style guidelines.",
  inputSchema: z.object({
    issue: z.string().describe(
      "Description of the code style issue to validate",
    ),
  }),
  outputSchema: z.object({
    violation: z.boolean(),
    guideline: z.string().optional(),
    suggestion: z.string().optional(),
  }),
  handler: async ({ issue }) => validateCodeStyle(issue),
});

const getUserRulesTool = defineTool({
  name: "user_get_rules_markdown",
  description: "Get user rules in markdown format for system prompts.",
  inputSchema: z.object({}),
  outputSchema: z.object({
    markdown: z.string(),
  }),
  handler: async () => ({ markdown: USER_RULES_MARKDOWN }),
});

const consultTool = defineTool({
  name: "user_consult",
  description: "Get consultation result for a technical decision.",
  inputSchema: z.object({
    question: z.string().describe("Technical decision or question"),
    context: z.string().optional().describe("Additional context"),
  }),
  outputSchema: z.object({
    assessment: z.string(),
    verdict: z.enum(["approve", "approve_with_changes", "reject"]),
    suggestions: z.array(z.string()),
  }),
  handler: async ({ question, context: _context }) => {
    const qLower = question.toLowerCase();
    const suggestions: string[] = [];
    let verdict: "approve" | "approve_with_changes" | "reject" = "approve";

    // Check for common anti-patterns
    if (qLower.includes("any") && qLower.includes("type")) {
      verdict = "reject";
      suggestions.push("Use proper TypeScript types instead of any");
    }
    if (qLower.includes("redux")) {
      verdict = "approve_with_changes";
      suggestions.push(
        "Consider @tanstack/react-query or @tanstack/react-store instead",
      );
    }
    if (qLower.includes("jest")) {
      verdict = "approve_with_changes";
      suggestions.push("Consider vitest for better performance and DX");
    }

    const assessment = verdict === "approve"
      ? "Decision aligns with user preferences"
      : verdict === "reject"
      ? "Decision violates user preferences"
      : "Decision acceptable with suggested changes";

    return { assessment, verdict, suggestions };
  },
});

export const allTools: AnyTypedTool[] = [
  getPreferencesTool,
  getCodingStyleTool,
  getThinkingHabitsTool,
  validateTechChoiceTool,
  validateStyleTool,
  getUserRulesTool,
  consultTool,
];

// =============================================================================
// Server Setup
// =============================================================================

export const server = createMcpServer({
  name: MCP_NAME,
  version: "1.0.0",
  description: "User Proxy MCP - user preferences and style validation",
  tools: allTools,
  autoStart: false,
  debug: true,
});

if (import.meta.main) {
  const args = parseCliArgs();
  if (args.help) {
    printMcpHelp(MCP_NAME, "User Proxy MCP Server");
    Deno.exit(0);
  }
  server.start();
}
