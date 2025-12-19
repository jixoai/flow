#!/usr/bin/env -S deno run -A --no-config
/**
 * Meta Workflow - Create and manage workflows/MCPs using AI
 *
 * Usage:
 *   meta list [--json]                List all workflows and MCPs
 *   meta analyze                      Analyze dependencies
 *   meta archive -n <name>            Archive a workflow or MCP
 *   meta unarchive -n <name>          Restore from archive
 *   meta create -p <prompt>           Create new workflow or MCP using AI
 *   meta preferences                  Show current preferences
 *   meta preferences init             Initialize preferences.ts
 *   meta preferences edit -p <prompt> Edit preferences with AI
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
  actionEdit as actionPreferencesEdit,
  actionInit as actionPreferencesInit,
  actionJson as actionPreferencesJson,
  actionShow as actionPreferencesShow,
  workflow as preferencesWorkflow,
} from "./subflows/preferences.workflow.ts";

export const workflow = defineWorkflow({
  name: "meta",
  description:
    "Create and manage workflows/MCPs - list, analyze, archive, create, preferences",
  version: "2.1.0",
  subflows: [
    listWorkflow,
    analyzeWorkflow,
    archiveWorkflow,
    unarchiveWorkflow,
    createWorkflow,
    preferencesWorkflow,
  ],
  examples: [
    ["meta list", "List all workflows and MCPs"],
    ["meta list --json", "Output as JSON"],
    ["meta analyze", "Analyze dependencies"],
    ["meta archive -n old-workflow", "Archive a workflow"],
    ["meta archive -n old-mcp -t mcp", "Archive an MCP"],
    ['meta create -p "A workflow that..."', "Create workflow with AI"],
    ["meta preferences", "Show current preferences"],
    ["meta preferences init", "Initialize preferences.ts"],
    ['meta preferences edit -p "Use codex as default"', "Edit with AI"],
  ],
  autoStart: import.meta.main,
});

// Re-export for programmatic use
export {
  actionAnalyze,
  actionArchive,
  actionCreate,
  actionList,
  actionListJson,
  actionPreferencesEdit,
  actionPreferencesInit,
  actionPreferencesJson,
  actionPreferencesShow,
  actionUnarchive,
};
export type { ArchiveType, CreateType };
