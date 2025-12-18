/**
 * Archive Subflow - Archive and unarchive workflows/MCPs
 */

import { exists } from "jsr:@std/fs/exists";
import { defineWorkflow } from "../../workflows/shared/base-workflow.ts";
import {
  ARCHIVE_MCPS_DIR,
  ARCHIVE_WORKFLOWS_DIR,
  MCPS_DIR,
  WORKFLOWS_DIR,
} from "../../common/paths.ts";

export type ArchiveType = "workflow" | "mcp";

async function actionArchive(
  name: string,
  type: ArchiveType = "workflow",
): Promise<void> {
  const isWorkflow = type === "workflow";
  const srcDir = isWorkflow ? WORKFLOWS_DIR : MCPS_DIR;
  const dstDir = isWorkflow ? ARCHIVE_WORKFLOWS_DIR : ARCHIVE_MCPS_DIR;
  const suffix = isWorkflow ? ".workflow.ts" : ".mcp.ts";

  const src = `${srcDir}/${name}${suffix}`;
  const dst = `${dstDir}/${name}${suffix}`;

  if (!(await exists(src))) {
    console.error(`Not found: ${name} (${type})`);
    Deno.exit(1);
  }

  await Deno.mkdir(dstDir, { recursive: true });
  await Deno.rename(src, dst);

  console.log(`Archived ${type}: ${name}`);
  console.log(`  From: ${src}`);
  console.log(`  To:   ${dst}`);
}

async function actionUnarchive(
  name: string,
  type: ArchiveType = "workflow",
): Promise<void> {
  const isWorkflow = type === "workflow";
  const srcDir = isWorkflow ? ARCHIVE_WORKFLOWS_DIR : ARCHIVE_MCPS_DIR;
  const dstDir = isWorkflow ? WORKFLOWS_DIR : MCPS_DIR;
  const suffix = isWorkflow ? ".workflow.ts" : ".mcp.ts";

  const src = `${srcDir}/${name}${suffix}`;
  const dst = `${dstDir}/${name}${suffix}`;

  if (!(await exists(src))) {
    console.error(`Not found in archive: ${name} (${type})`);
    Deno.exit(1);
  }

  await Deno.rename(src, dst);

  console.log(`Unarchived ${type}: ${name}`);
  console.log(`  From: ${src}`);
  console.log(`  To:   ${dst}`);
}

export const archiveWorkflow = defineWorkflow({
  name: "archive",
  description: "Archive a workflow or MCP",
  args: {
    name: {
      type: "string",
      alias: "n",
      description: "Name of workflow/MCP",
      required: true,
    },
    type: {
      type: "string",
      alias: "t",
      description: "Type: workflow or mcp",
      default: "workflow",
    },
  },
  handler: async (args) => {
    await actionArchive(args.name, args.type as ArchiveType);
  },
});

export const unarchiveWorkflow = defineWorkflow({
  name: "unarchive",
  description: "Restore a workflow or MCP from archive",
  args: {
    name: {
      type: "string",
      alias: "n",
      description: "Name of workflow/MCP",
      required: true,
    },
    type: {
      type: "string",
      alias: "t",
      description: "Type: workflow or mcp",
      default: "workflow",
    },
  },
  handler: async (args) => {
    await actionUnarchive(args.name, args.type as ArchiveType);
  },
});

export { actionArchive, actionUnarchive };
