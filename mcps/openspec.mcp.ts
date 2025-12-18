#!/usr/bin/env -S deno run -A --no-config
/**
 * OpenSpec MCP Server
 *
 * Atomic operations for OpenSpec workflow:
 * - List changes and specs
 * - Validate changes
 * - Archive completed changes
 * - Show change details
 */

import {
  type AnyTypedTool,
  createMcpServer,
  defineTool,
  parseCliArgs,
  printMcpHelp,
  z,
} from "./shared/base-mcp.ts";

const MCP_NAME = "openspec";

// =============================================================================
// Command Execution
// =============================================================================

async function runOpenSpec(
  args: string[],
  cwd?: string,
): Promise<{ success: boolean; stdout: string; stderr: string }> {
  const cmd = new Deno.Command("openspec", {
    args,
    cwd: cwd || Deno.cwd(),
    stdout: "piped",
    stderr: "piped",
  });
  const output = await cmd.output();
  return {
    success: output.success,
    stdout: new TextDecoder().decode(output.stdout),
    stderr: new TextDecoder().decode(output.stderr),
  };
}

// =============================================================================
// Core Functions
// =============================================================================

export async function listChanges(
  cwd?: string,
): Promise<{ success: boolean; output: string; error?: string }> {
  const result = await runOpenSpec(["list"], cwd);
  return {
    success: result.success,
    output: result.stdout,
    error: result.stderr || undefined,
  };
}

export async function listSpecs(
  cwd?: string,
): Promise<{ success: boolean; output: string; error?: string }> {
  const result = await runOpenSpec(["list", "--specs"], cwd);
  return {
    success: result.success,
    output: result.stdout,
    error: result.stderr || undefined,
  };
}

export async function validateChange(
  changeId: string,
  options: { strict?: boolean; cwd?: string } = {},
): Promise<{ success: boolean; output: string; error?: string }> {
  const args = ["validate", changeId];
  if (options.strict) args.push("--strict");
  const result = await runOpenSpec(args, options.cwd);
  return {
    success: result.success,
    output: result.stdout,
    error: result.stderr || undefined,
  };
}

export async function archiveChange(
  changeId: string,
  options: { skipSpecs?: boolean; cwd?: string } = {},
): Promise<{ success: boolean; output: string; error?: string }> {
  const args = ["archive", changeId, "--yes"];
  if (options.skipSpecs) args.push("--skip-specs");
  const result = await runOpenSpec(args, options.cwd);
  return {
    success: result.success,
    output: result.stdout,
    error: result.stderr || undefined,
  };
}

export async function showChange(
  changeId: string,
  options: { json?: boolean; deltasOnly?: boolean; cwd?: string } = {},
): Promise<{ success: boolean; output: string; error?: string }> {
  const args = ["show", changeId];
  if (options.json) args.push("--json");
  if (options.deltasOnly) args.push("--deltas-only");
  const result = await runOpenSpec(args, options.cwd);
  return {
    success: result.success,
    output: result.stdout,
    error: result.stderr || undefined,
  };
}

export async function showSpec(
  specName: string,
  cwd?: string,
): Promise<{ success: boolean; output: string; error?: string }> {
  const result = await runOpenSpec(["show", specName, "--type", "spec"], cwd);
  return {
    success: result.success,
    output: result.stdout,
    error: result.stderr || undefined,
  };
}

export async function updateOpenSpec(
  cwd?: string,
): Promise<{ success: boolean; output: string; error?: string }> {
  const result = await runOpenSpec(["update"], cwd);
  return {
    success: result.success,
    output: result.stdout,
    error: result.stderr || undefined,
  };
}

// =============================================================================
// System Prompts (exported for workflows)
// =============================================================================

export const OPENSPEC_PROPOSAL_PROMPT = `Create an OpenSpec proposal.

**Guardrails**
- Favor straightforward, minimal implementations first
- Keep changes tightly scoped
- Identify vague details and ask follow-up questions
- Do NOT write code during proposal - only design documents

**Steps**
1. Review project structure with openspec_list and openspec_list_specs
2. Choose unique verb-led change-id
3. Scaffold proposal.md, tasks.md, design.md under openspec/changes/<id>/
4. Map change into concrete capabilities/requirements
5. Draft spec deltas in changes/<id>/specs/<capability>/spec.md
6. Draft tasks.md as ordered, verifiable work items
7. Validate with openspec_validate (strict mode)`;

export const OPENSPEC_APPLY_PROMPT = `Apply an approved OpenSpec change.

**Steps**
1. Read proposal.md, design.md, tasks.md using openspec_show
2. Work through tasks sequentially with minimal, focused edits
3. Confirm completion before updating statuses
4. Mark tasks as done in tasks.md
5. Reference openspec_show for context as needed`;

export const OPENSPEC_ARCHIVE_PROMPT = `Archive a completed OpenSpec change.

**Steps**
1. Confirm change ID with openspec_list
2. Validate change is ready with openspec_validate
3. Archive with openspec_archive
4. Review output confirming specs updated
5. Final validate with openspec_validate`;

// =============================================================================
// Tool Definitions
// =============================================================================

const listChangesTool = defineTool({
  name: "openspec_list",
  description: "List all OpenSpec changes in the project.",
  inputSchema: z.object({
    cwd: z.string().optional().describe("Working directory"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    output: z.string(),
    error: z.string().optional(),
  }),
  handler: async ({ cwd }) => listChanges(cwd),
});

const listSpecsTool = defineTool({
  name: "openspec_list_specs",
  description: "List all OpenSpec specs in the project.",
  inputSchema: z.object({
    cwd: z.string().optional(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    output: z.string(),
    error: z.string().optional(),
  }),
  handler: async ({ cwd }) => listSpecs(cwd),
});

const validateTool = defineTool({
  name: "openspec_validate",
  description: "Validate an OpenSpec change.",
  inputSchema: z.object({
    changeId: z.string().describe("Change ID to validate"),
    strict: z.boolean().optional().default(true).describe(
      "Use strict validation",
    ),
    cwd: z.string().optional(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    output: z.string(),
    error: z.string().optional(),
  }),
  handler: async ({ changeId, strict, cwd }) =>
    validateChange(changeId, { strict, cwd }),
});

const archiveTool = defineTool({
  name: "openspec_archive",
  description:
    "Archive a completed OpenSpec change. Moves change to archive and applies spec updates.",
  inputSchema: z.object({
    changeId: z.string().describe("Change ID to archive"),
    skipSpecs: z.boolean().optional().default(false).describe(
      "Skip spec updates (for tooling-only changes)",
    ),
    cwd: z.string().optional(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    output: z.string(),
    error: z.string().optional(),
  }),
  handler: async ({ changeId, skipSpecs, cwd }) =>
    archiveChange(changeId, { skipSpecs, cwd }),
});

const showChangeTool = defineTool({
  name: "openspec_show",
  description: "Show details of an OpenSpec change.",
  inputSchema: z.object({
    changeId: z.string().describe("Change ID to show"),
    json: z.boolean().optional().default(false).describe(
      "Output in JSON format",
    ),
    deltasOnly: z.boolean().optional().default(false).describe(
      "Show only spec deltas",
    ),
    cwd: z.string().optional(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    output: z.string(),
    error: z.string().optional(),
  }),
  handler: async ({ changeId, json, deltasOnly, cwd }) =>
    showChange(changeId, { json, deltasOnly, cwd }),
});

const showSpecTool = defineTool({
  name: "openspec_show_spec",
  description: "Show details of an OpenSpec spec.",
  inputSchema: z.object({
    specName: z.string().describe("Spec name to show"),
    cwd: z.string().optional(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    output: z.string(),
    error: z.string().optional(),
  }),
  handler: async ({ specName, cwd }) => showSpec(specName, cwd),
});

const updateTool = defineTool({
  name: "openspec_update",
  description: "Update OpenSpec CLI and configurations.",
  inputSchema: z.object({
    cwd: z.string().optional(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    output: z.string(),
    error: z.string().optional(),
  }),
  handler: async ({ cwd }) => updateOpenSpec(cwd),
});

const searchRequirementsTool = defineTool({
  name: "openspec_search_requirements",
  description: "Search for existing requirements and scenarios in specs.",
  inputSchema: z.object({
    pattern: z.string().describe(
      "Search pattern (e.g., 'authentication', 'Requirement:')",
    ),
    cwd: z.string().optional(),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    output: z.string(),
    error: z.string().optional(),
  }),
  handler: async ({ pattern, cwd }) => {
    const cmd = new Deno.Command("sh", {
      args: [
        "-c",
        `rg -n "${pattern}" openspec/specs 2>/dev/null || grep -rn "${pattern}" openspec/specs 2>/dev/null || echo "No matches found"`,
      ],
      cwd: cwd || Deno.cwd(),
      stdout: "piped",
      stderr: "piped",
    });
    const output = await cmd.output();
    return {
      success: output.success,
      output: new TextDecoder().decode(output.stdout),
      error: output.success
        ? undefined
        : new TextDecoder().decode(output.stderr),
    };
  },
});

export const allTools: AnyTypedTool[] = [
  listChangesTool,
  listSpecsTool,
  validateTool,
  archiveTool,
  showChangeTool,
  showSpecTool,
  updateTool,
  searchRequirementsTool,
];

// =============================================================================
// Server Setup
// =============================================================================

export const server = createMcpServer({
  name: MCP_NAME,
  version: "1.0.0",
  description: "OpenSpec MCP - change management and specification workflow",
  tools: allTools,
  autoStart: false,
  debug: true,
});

if (import.meta.main) {
  const args = parseCliArgs();
  if (args.help) {
    printMcpHelp(MCP_NAME, "OpenSpec MCP Server");
    Deno.exit(0);
  }
  server.start();
}
