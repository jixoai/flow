/**
 * Base JixoFlow (v2)
 *
 * Features:
 * - Nested subflows support
 * - Uses @std/cli/parse-args (Deno standard library)
 * - Hierarchical help system (--help / --help=all)
 * - Deep invocation: `workflow sub1 sub2 --args`
 * - Cycle detection for help printing
 *
 * Usage:
 *   const subflow = defineWorkflow({
 *     name: "sub",
 *     description: "A subflow",
 *     handler: async (args) => { ... },
 *   });
 *
 *   export const workflow = defineWorkflow({
 *     name: "main",
 *     description: "Main workflow",
 *     args: {
 *       prompt: { type: "string", alias: "p", description: "Input", required: true },
 *     },
 *     subflows: { sub: subflow },
 *     handler: async (args) => { ... },
 *     autoStart: import.meta.main,
 *   });
 */

import { dirname, fromFileUrl } from "jsr:@std/path";
import {
  type Args as StdArgs,
  parseArgs as stdParseArgs,
} from "jsr:@std/cli/parse-args";

// =============================================================================
// Types
// =============================================================================

export type ArgType = "string" | "boolean" | "number";

export interface ArgConfig {
  type: ArgType;
  alias?: string;
  description?: string;
  default?: string | boolean | number;
  required?: boolean;
}

/** Subflow can be direct reference or lazy loader (for circular deps) */
// deno-lint-ignore no-explicit-any
export type SubflowDef = Workflow<any> | (() => Promise<Workflow<any>>);

/** Resolve a SubflowDef to actual Workflow */
async function resolveSubflow(
  def: SubflowDef,
): Promise<Workflow<Record<string, ArgConfig>>> {
  if (typeof def === "function") {
    return await def();
  }
  return def;
}

/** Get workflow name from SubflowDef (may need to resolve loader) */
async function getSubflowName(def: SubflowDef): Promise<string> {
  const workflow = await resolveSubflow(def);
  return workflow.meta.name;
}

/** Build name -> SubflowDef map from array */
async function buildSubflowMap(
  subflows: SubflowDef[],
): Promise<Map<string, SubflowDef>> {
  const map = new Map<string, SubflowDef>();
  for (const def of subflows) {
    const name = await getSubflowName(def);
    map.set(name, def);
  }
  return map;
}

export interface WorkflowConfig<TArgs extends Record<string, ArgConfig>> {
  name: string;
  description: string;
  version?: string;
  /** Argument definitions */
  args?: TArgs;
  /**
   * Nested subflows array - uses workflow.meta.name as identifier
   * - Direct: [subWorkflow1, subWorkflow2]
   * - Lazy loader (for circular deps): [() => import("./sub.ts").then(m => m.workflow)]
   */
  subflows?: SubflowDef[];
  /** Examples shown in help: [command, description] */
  examples?: Array<[string, string]>;
  /** Additional notes shown at the end of help */
  notes?: string;
  /** Main handler */
  handler?: (args: InferArgs<TArgs>, ctx: WorkflowContext) => Promise<void>;
  /** Auto-start when true (use `import.meta.main`) */
  autoStart?: boolean;
}

export interface WorkflowMeta {
  name: string;
  description: string;
  version: string;
  args: Record<string, ArgConfig>;
}

export interface WorkflowContext {
  /** Workflow metadata */
  meta: WorkflowMeta;
  /** Invocation path (e.g., ["main", "sub1", "sub2"]) */
  path: string[];
  /** Raw argv remaining after path resolution */
  rawArgs: string[];
  /**
   * Get a subflow by name (for orchestration in handler)
   * This method enables workflow composition and future visualization tracking
   */
  getSubflow: (
    name: string,
  ) => Promise<Workflow<Record<string, ArgConfig>> | undefined>;
  /** List available subflow names */
  subflowNames: () => Promise<string[]>;
}

// Type inference for args
type InferArg<T extends ArgConfig> = T["type"] extends "string" ? string
  : T["type"] extends "boolean" ? boolean
  : T["type"] extends "number" ? number
  : never;

type InferArgs<T extends Record<string, ArgConfig>> =
  & {
    [K in keyof T]: T[K]["required"] extends true ? InferArg<T[K]>
      : T[K]["default"] extends undefined ? InferArg<T[K]> | undefined
      : InferArg<T[K]>;
  }
  & {
    /** Positional arguments (after subflow path) */
    _: string[];
  };

// =============================================================================
// Argument Parsing (using @std/cli)
// =============================================================================

export type { StdArgs as ParsedArgs };

/**
 * Build parseArgs options from WorkflowConfig
 */
function buildParseOptions(argsConfig: Record<string, ArgConfig>) {
  const boolean: string[] = [];
  const string: string[] = [];
  const alias: Record<string, string> = {};
  const defaults: Record<string, unknown> = {};

  for (const [key, cfg] of Object.entries(argsConfig)) {
    if (cfg.type === "boolean") boolean.push(key);
    else string.push(key);

    if (cfg.alias) alias[cfg.alias] = key;
    if (cfg.default !== undefined) defaults[key] = cfg.default;
  }

  return { boolean, string, alias, default: defaults };
}

/**
 * Parse arguments using @std/cli/parse-args
 */
export function parseArgs(
  argv: string[],
  argsConfig: Record<string, ArgConfig> = {},
): StdArgs {
  const opts = buildParseOptions(argsConfig);
  return stdParseArgs(argv, {
    ...opts,
    stopEarly: false,
    "--": true,
  });
}

/**
 * Convert parsed args to typed args based on ArgConfig
 */
function resolveArgs<TArgs extends Record<string, ArgConfig>>(
  parsed: StdArgs,
  config: TArgs,
): InferArgs<TArgs> {
  const result: Record<string, unknown> = { _: parsed._.map(String) };

  // Process each config key
  for (const [key, cfg] of Object.entries(config)) {
    const value = parsed[key];

    // Convert type if needed
    if (value !== undefined) {
      switch (cfg.type) {
        case "number":
          result[key] = Number(value);
          break;
        case "boolean":
          result[key] = Boolean(value);
          break;
        default:
          result[key] = String(value);
      }
    } else if (cfg.default !== undefined) {
      result[key] = cfg.default;
    }
  }

  return result as InferArgs<TArgs>;
}

// =============================================================================
// Help System
// =============================================================================

interface HelpOptions {
  showAll: boolean;
  printed: Set<string>;
  indent: number;
}

function formatArg(key: string, cfg: ArgConfig): string {
  const parts: string[] = [];
  parts.push(`  --${key}`);
  if (cfg.alias) parts[0] += `, -${cfg.alias}`;
  parts.push(`<${cfg.type}>`);
  if (cfg.description) parts.push(cfg.description);
  if (cfg.required) parts.push("(required)");
  if (cfg.default !== undefined) parts.push(`[default: ${cfg.default}]`);
  return parts.join("  ");
}

async function printHelp<TArgs extends Record<string, ArgConfig>>(
  workflow: Workflow<TArgs>,
  path: string[],
  opts: HelpOptions,
): Promise<void> {
  const { meta, config } = workflow;
  const prefix = "  ".repeat(opts.indent);
  const pathStr = path.join(" ");
  const id = pathStr || meta.name;

  // Cycle detection
  if (opts.printed.has(id)) {
    if (opts.showAll) {
      console.log(`${prefix}${meta.name}: (see above)`);
    }
    return;
  }
  opts.printed.add(id);

  // Header
  if (opts.indent === 0) {
    console.log(`${meta.name} v${meta.version} - ${meta.description}`);
    console.log();
    console.log(`Usage: ${pathStr || meta.name} [subflow...] [options]`);
  } else {
    console.log(`${prefix}${meta.name} - ${meta.description}`);
  }

  // Arguments
  const argEntries = Object.entries(meta.args);
  if (argEntries.length > 0) {
    console.log();
    console.log(`${prefix}Options:`);
    for (const [key, cfg] of argEntries) {
      console.log(`${prefix}${formatArg(key, cfg)}`);
    }
  }

  // Built-in options (only at top level)
  if (opts.indent === 0) {
    console.log();
    console.log(`${prefix}Built-in:`);
    console.log(
      `${prefix}  --help, -h      Show help (use --help=all for full tree)`,
    );
    console.log(`${prefix}  --version, -v   Show version`);
  }

  // Subflows
  const subflows = config.subflows || [];
  if (subflows.length > 0) {
    console.log();
    console.log(`${prefix}Subflows:`);
    for (const subDef of subflows) {
      const sub = await resolveSubflow(subDef);
      if (opts.showAll) {
        console.log();
        await printHelp(sub, [...path, sub.meta.name], {
          ...opts,
          indent: opts.indent + 1,
        });
      } else {
        console.log(`${prefix}  ${sub.meta.name}  ${sub.meta.description}`);
      }
    }
  }

  // Examples
  if (config.examples && config.examples.length > 0 && opts.indent === 0) {
    console.log();
    console.log("Examples:");
    for (const [cmd, desc] of config.examples) {
      console.log(`  ${cmd}`);
      console.log(`    ${desc}`);
    }
  }

  // Notes
  if (config.notes && opts.indent === 0) {
    console.log();
    console.log(config.notes);
  }
}

// =============================================================================
// Workflow Definition
// =============================================================================

export interface Workflow<TArgs extends Record<string, ArgConfig>> {
  /** Workflow metadata */
  meta: WorkflowMeta;
  /** Original config (for help printing) */
  config: WorkflowConfig<TArgs>;
  /** Run with CLI args */
  run: (argv?: string[]) => Promise<void>;
  /** Direct execution with typed args */
  execute: (args: Partial<InferArgs<TArgs>>) => Promise<void>;
}

/**
 * Define a workflow with optional subflows
 */
export function defineWorkflow<TArgs extends Record<string, ArgConfig>>(
  config: WorkflowConfig<TArgs>,
): Workflow<TArgs> {
  const meta: WorkflowMeta = {
    name: config.name,
    description: config.description,
    version: config.version || "1.0.0",
    args: (config.args || {}) as Record<string, ArgConfig>,
  };

  // Cache for resolved subflow map (lazy built on first access)
  let subflowMapCache: Map<string, SubflowDef> | null = null;

  async function getSubflowMap(): Promise<Map<string, SubflowDef>> {
    if (!subflowMapCache) {
      subflowMapCache = await buildSubflowMap(config.subflows || []);
    }
    return subflowMapCache;
  }

  /** Create context with getSubflow bound to current workflow's subflows */
  function createContext(path: string[], rawArgs: string[]): WorkflowContext {
    return {
      meta,
      path,
      rawArgs,
      getSubflow: async (name: string) => {
        const map = await getSubflowMap();
        const subDef = map.get(name);
        if (!subDef) return undefined;
        return await resolveSubflow(subDef);
      },
      subflowNames: async () => {
        const map = await getSubflowMap();
        return Array.from(map.keys());
      },
    };
  }

  async function run(argv: string[] = Deno.args): Promise<void> {
    // Initial parse without type hints (just for subflow routing)
    const parsed = stdParseArgs(argv, { stopEarly: false, "--": true });

    // Check for version first (only --version, not -v which may be user alias)
    if (parsed["version"] === true) {
      console.log(meta.version);
      return;
    }

    // Resolve subflow path FIRST
    // deno-lint-ignore no-explicit-any
    let currentWorkflow: Workflow<any> = workflow;
    const path: string[] = [meta.name];
    const remaining = parsed._.map(String);

    while (remaining.length > 0) {
      const next = remaining[0];
      // Build subflow map for current workflow
      const subflowMap = await buildSubflowMap(
        currentWorkflow.config.subflows || [],
      );
      const subDef = subflowMap.get(next);
      if (subDef) {
        path.push(next);
        remaining.shift();
        currentWorkflow = await resolveSubflow(subDef);
      } else {
        break;
      }
    }

    // Check for help AFTER resolving path
    const helpValue = parsed["help"] ?? parsed["h"];
    if (helpValue !== undefined) {
      const showAll = helpValue === "all";
      await printHelp(currentWorkflow, path, {
        showAll,
        printed: new Set(),
        indent: 0,
      });
      return;
    }

    // Re-parse with target workflow's arg config for proper type handling
    const targetArgv = [...remaining];
    for (const [key, value] of Object.entries(parsed)) {
      if (
        key === "_" || key === "--" || key === "help" || key === "h" ||
        key === "version"
      ) continue;
      if (typeof value === "boolean") {
        if (value) targetArgv.push(`--${key}`);
        else targetArgv.push(`--no-${key}`);
      } else {
        targetArgv.push(`--${key}=${value}`);
      }
    }

    const targetParsed = parseArgs(targetArgv, currentWorkflow.meta.args);

    // Resolve args
    const args = resolveArgs(targetParsed, currentWorkflow.meta.args);

    // Validate required args
    for (const [key, cfg] of Object.entries(currentWorkflow.meta.args)) {
      if (cfg.required && args[key] === undefined) {
        console.error(`Error: Missing required argument: --${key}`);
        console.error(`Run with --help for usage information.`);
        Deno.exit(1);
      }
    }

    // Execute handler
    if (currentWorkflow.config.handler) {
      // Create context bound to currentWorkflow's subflows
      // Cache subflow map for this context
      let ctxSubflowMap: Map<string, SubflowDef> | null = null;
      const getCtxSubflowMap = async () => {
        if (!ctxSubflowMap) {
          ctxSubflowMap = await buildSubflowMap(
            currentWorkflow.config.subflows || [],
          );
        }
        return ctxSubflowMap;
      };

      const ctx: WorkflowContext = {
        meta: currentWorkflow.meta,
        path,
        rawArgs: remaining,
        getSubflow: async (name: string) => {
          const map = await getCtxSubflowMap();
          const subDef = map.get(name);
          if (!subDef) return undefined;
          return await resolveSubflow(subDef);
        },
        subflowNames: async () => {
          const map = await getCtxSubflowMap();
          return Array.from(map.keys());
        },
      };
      try {
        await currentWorkflow.config.handler(args, ctx);
      } catch (error) {
        console.error("Error:", error instanceof Error ? error.message : error);
        Deno.exit(1);
      }
    } else {
      // No handler, show help
      await printHelp(currentWorkflow, path, {
        showAll: false,
        printed: new Set(),
        indent: 0,
      });
    }
  }

  async function execute(args: Partial<InferArgs<TArgs>>): Promise<void> {
    const fullArgs = { _: [], ...args } as InferArgs<TArgs>;
    if (config.handler) {
      await config.handler(fullArgs, createContext([meta.name], []));
    }
  }

  const workflow: Workflow<TArgs> = { meta, config, run, execute };

  // Auto-start if configured
  if (config.autoStart) {
    run().catch((error) => {
      console.error("Error:", error instanceof Error ? error.message : error);
      Deno.exit(1);
    });
  }

  return workflow;
}

// =============================================================================
// Utilities
// =============================================================================

/**
 * Get the directory of the current module
 */
export function getModuleDir(importMetaUrl: string): string {
  return dirname(fromFileUrl(importMetaUrl));
}

/**
 * Create a simple workflow that just delegates to subflows
 */
export function createRouter(config: {
  name: string;
  description: string;
  subflows: SubflowDef[];
  version?: string;
}): Workflow<Record<string, never>> {
  return defineWorkflow({
    name: config.name,
    description: config.description,
    version: config.version,
    subflows: config.subflows,
    // No handler - will show help if no subflow matched
  });
}
