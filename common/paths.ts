/**
 * Common path constants for the workflow module
 *
 * All paths are resolved relative to the project root directory.
 * Use these constants instead of hardcoding paths.
 */

import { basename, dirname, fromFileUrl, join } from "jsr:@std/path";

// Base directory: project root (parent of common/)
const __dirname = dirname(fromFileUrl(import.meta.url));
export const ROOT_DIR = dirname(__dirname);

// Main directories
export const MCPS_DIR = join(ROOT_DIR, "mcps");
export const WORKFLOWS_DIR = join(ROOT_DIR, "workflows");
export const COMMON_DIR = join(ROOT_DIR, "common");
export const ARCHIVE_DIR = join(ROOT_DIR, "archive");

// User directories (for customization, takes priority over builtin)
export const USER_DIR = join(ROOT_DIR, "user");
export const USER_WORKFLOWS_DIR = join(USER_DIR, "workflows");
export const USER_MCPS_DIR = join(USER_DIR, "mcps");
export const USER_PROMPTS_DIR = join(USER_DIR, "prompts");

// MCP subdirectories
export const SHARED_DIR = join(MCPS_DIR, "shared");

// Archive subdirectories
export const ARCHIVE_WORKFLOWS_DIR = join(ARCHIVE_DIR, "workflows");
export const ARCHIVE_MCPS_DIR = join(ARCHIVE_DIR, "mcps");

// Meta directory
export const META_DIR = join(ROOT_DIR, "meta");

// Output directories (relative to cwd, can be overridden by env)
export function getResearchDir(): string {
  return Deno.env.get("RESEARCH_DIR") || join(Deno.cwd(), ".research");
}

export function getSessionsDir(): string {
  return Deno.env.get("SESSIONS_DIR") || join(Deno.cwd(), ".claude/.sessions");
}

// =============================================================================
// MCP Server Config (HTTP Gateway)
// =============================================================================

export type McpServerConfig =
  | {
    type?: "stdio";
    command: string;
    args?: string[];
    env?: Record<string, string>;
  }
  | { type: "http"; url: string; headers?: Record<string, string> }
  | { type: "sse"; url: string; headers?: Record<string, string> };

/**
 * Get MCP file path by name.
 * MCPs are located in mcps/ folder with pattern: <name>.mcp.ts
 * Special case: meta is in meta/meta.mcp.ts
 */
export function getMcpPath(name: string): string {
  if (name === "meta") {
    return join(META_DIR, "meta.mcp.ts");
  }
  return join(MCPS_DIR, `${name}.mcp.ts`);
}

/**
 * Get available MCP names by scanning mcps/ directory
 */
export async function getAvailableMcps(): Promise<string[]> {
  const names: string[] = [];

  for await (const entry of Deno.readDir(MCPS_DIR)) {
    if (entry.isFile && entry.name.endsWith(".mcp.ts")) {
      const name = basename(entry.name, ".mcp.ts");
      names.push(name);
    }
  }

  names.push("meta");
  return names.sort();
}

// =============================================================================
// MCP Gateway Integration
// =============================================================================

import {
  type GatewayInfo,
  startMcpGateway,
} from "../mcps/shared/mcp-gateway.ts";

let gatewayInfo: GatewayInfo | null = null;

/**
 * Ensure MCP Gateway is running and return its info
 */
async function ensureGateway(): Promise<GatewayInfo> {
  if (!gatewayInfo) {
    gatewayInfo = await startMcpGateway();
  }
  return gatewayInfo;
}

/**
 * Get MCP server config for use with Claude SDK.
 * Returns HTTP config pointing to the Gateway.
 *
 * Usage:
 *   const config = await getMcpServerConfig("memory");
 *   builder.mcpServers({ memory: config });
 */
export async function getMcpServerConfig(
  name: string,
): Promise<McpServerConfig> {
  const gateway = await ensureGateway();
  return {
    type: "http",
    url: `${gateway.url}/mcp/${name}`,
  };
}

/**
 * Get multiple MCP server configs at once
 */
export async function getMcpServerConfigs(
  ...names: string[]
): Promise<Record<string, McpServerConfig>> {
  const gateway = await ensureGateway();
  const configs: Record<string, McpServerConfig> = {};

  for (const name of names) {
    configs[name] = {
      type: "http",
      url: `${gateway.url}/mcp/${name}`,
    };
  }

  return configs;
}

/**
 * Shutdown the MCP Gateway
 */
export async function shutdownMcpGateway(): Promise<void> {
  if (gatewayInfo) {
    await gatewayInfo.shutdown();
    gatewayInfo = null;
  }
}
