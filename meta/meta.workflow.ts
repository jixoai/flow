#!/usr/bin/env -S deno run -A --no-config
/**
 * Meta Workflow - Create and manage workflows/MCPs using AI
 *
 * Usage:
 *   meta list [--json]           List all workflows and MCPs
 *   meta analyze                 Analyze dependencies
 *   meta archive -n <name>       Archive a workflow or MCP
 *   meta unarchive -n <name>     Restore from archive
 *   meta create -p <prompt>      Create new workflow or MCP using AI
 *   meta config                  Show current preferences
 *   meta config init             Initialize preferences.ts
 *   meta config edit -p <prompt> Edit preferences with AI
 */

import { defineWorkflow } from "../workflows/shared/base-workflow.ts";
import {
  actionList,
  actionListJson,
  workflow as listWorkflow,
} from "./subflows/list.workflow.ts";
import {
  actionAnalyze,
  workflow as analyzeWorkflow,
} from "./subflows/analyze.workflow.ts";
import {
  actionArchive,
  actionUnarchive,
  type ArchiveType,
  archiveWorkflow,
  unarchiveWorkflow,
} from "./subflows/archive.workflow.ts";
import {
  actionCreate,
  type CreateType,
  workflow as createWorkflow,
} from "./subflows/create.workflow.ts";
import {
  actionEdit as actionConfigEdit,
  actionInit as actionConfigInit,
  actionJson as actionConfigJson,
  actionShow as actionConfigShow,
  workflow as configWorkflow,
} from "./subflows/config.workflow.ts";

export const workflow = defineWorkflow({
  name: "meta",
  description:
    "Create and manage workflows/MCPs - list, analyze, archive, create, config",
  version: "2.1.0",
  subflows: [
    listWorkflow,
    analyzeWorkflow,
    archiveWorkflow,
    unarchiveWorkflow,
    createWorkflow,
    configWorkflow,
  ],
  examples: [
    ["meta list", "List all workflows and MCPs"],
    ["meta list --json", "Output as JSON"],
    ["meta analyze", "Analyze dependencies"],
    ["meta archive -n old-workflow", "Archive a workflow"],
    ["meta archive -n old-mcp -t mcp", "Archive an MCP"],
    ['meta create -p "A workflow that..."', "Create workflow with AI"],
    ["meta config", "Show current preferences"],
    ["meta config init", "Initialize preferences.ts"],
    ['meta config edit -p "Use codex as default"', "Edit with AI"],
  ],
  autoStart: import.meta.main,
});

// Re-export for programmatic use
export {
  actionAnalyze,
  actionArchive,
  actionConfigEdit,
  actionConfigInit,
  actionConfigJson,
  actionConfigShow,
  actionCreate,
  actionList,
  actionListJson,
  actionUnarchive,
};
export type { ArchiveType, CreateType };
