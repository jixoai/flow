/**
 * Inventory - Build inventory of workflows and MCPs
 *
 * Uses multi-source-scanner for unified directory scanning with priority-based merging.
 */

import {
  ARCHIVE_MCPS_DIR,
  ARCHIVE_WORKFLOWS_DIR,
  MCPS_DIR,
  USER_MCPS_DIR,
  USER_WORKFLOWS_DIR,
  WORKFLOWS_DIR,
} from "../../common/paths.ts";
import {
  extractDescription,
  extractMcpDependencies,
  extractMcpTools,
} from "./scanner.ts";
import {
  createStandardSources,
  scanAndMerge,
  type ScanSource,
  type SourceType as ScannerSourceType,
} from "./multi-source-scanner.ts";

// Re-export SourceType for backward compatibility
export type SourceType = ScannerSourceType;

export interface WorkflowInfo {
  name: string;
  file: string;
  path: string;
  description: string;
  mcpDependencies: string[];
  archived: boolean;
  source: SourceType;
  overrides?: SourceType;
}

export interface McpInfo {
  name: string;
  file: string;
  path: string;
  tools: string[];
  description: string;
  referencedBy: string[];
  archived: boolean;
  source: SourceType;
  overrides?: SourceType;
}

export interface Inventory {
  workflows: WorkflowInfo[];
  mcpScripts: McpInfo[];
}

/** Options for building inventory */
export interface BuildInventoryOptions {
  /** Additional custom sources for workflows */
  customWorkflowSources?: ScanSource[];
  /** Additional custom sources for MCPs */
  customMcpSources?: ScanSource[];
  /** Project directory (for future project-level support) */
  projectDir?: string;
}

/**
 * Build inventory of workflows and MCPs from all sources
 */
export async function buildInventory(
  options: BuildInventoryOptions = {},
): Promise<Inventory> {
  const {
    customWorkflowSources = [],
    customMcpSources = [],
    projectDir,
  } = options;

  // Create standard sources for workflows
  const workflowSources = createStandardSources({
    builtin: WORKFLOWS_DIR,
    user: USER_WORKFLOWS_DIR,
    archived: ARCHIVE_WORKFLOWS_DIR,
    project: projectDir ? `${projectDir}/.jixoflow/workflows` : undefined,
  });

  // Add custom sources
  workflowSources.push(...customWorkflowSources);

  // Scan workflows
  const workflowResult = await scanAndMerge({
    suffix: ".workflow.ts",
    sources: workflowSources,
  });

  // Create standard sources for MCPs
  const mcpSources = createStandardSources({
    builtin: MCPS_DIR,
    user: USER_MCPS_DIR,
    archived: ARCHIVE_MCPS_DIR,
    project: projectDir ? `${projectDir}/.jixoflow/mcps` : undefined,
  });

  // Add custom sources
  mcpSources.push(...customMcpSources);

  // Scan MCPs
  const mcpResult = await scanAndMerge({
    suffix: ".mcp.ts",
    sources: mcpSources,
  });

  // Build workflow info with metadata extraction
  const workflows: WorkflowInfo[] = await Promise.all(
    workflowResult.items.map(async (item) => ({
      name: item.name,
      file: item.filename,
      path: item.path,
      description: await extractDescription(item.path),
      mcpDependencies: await extractMcpDependencies(item.path),
      archived: item.source === "archived",
      source: item.source,
      overrides: item.overrides,
    })),
  );

  // Build MCP info with metadata extraction
  const mcpScripts: McpInfo[] = await Promise.all(
    mcpResult.items.map(async (item) => ({
      name: item.name,
      file: item.filename,
      path: item.path,
      tools: await extractMcpTools(item.path),
      description: await extractDescription(item.path),
      referencedBy: [],
      archived: item.source === "archived",
      source: item.source,
      overrides: item.overrides,
    })),
  );

  // Build dependency references
  for (const w of workflows.filter((w) => !w.archived)) {
    for (const dep of w.mcpDependencies) {
      const mcp = mcpScripts.find((m) => m.name === dep && !m.archived);
      if (mcp) mcp.referencedBy.push(w.name);
    }
  }

  return { workflows, mcpScripts };
}

export function getActiveWorkflows(inv: Inventory): WorkflowInfo[] {
  return inv.workflows.filter((w) => !w.archived);
}

export function getActiveMcps(inv: Inventory): McpInfo[] {
  return inv.mcpScripts.filter((m) => !m.archived);
}

export function getUnusedMcps(inv: Inventory): McpInfo[] {
  return getActiveMcps(inv).filter((m) => m.referencedBy.length === 0);
}
