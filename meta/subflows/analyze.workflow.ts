/**
 * Analyze Subflow - Analyze dependencies between workflows and MCPs
 */

import { defineWorkflow } from "../../workflows/shared/base-workflow.ts";
import {
  buildInventory,
  getActiveMcps,
  getActiveWorkflows,
  getUnusedMcps,
} from "../lib/inventory.ts";

async function actionAnalyze(): Promise<void> {
  const inv = await buildInventory();
  const activeMcps = getActiveMcps(inv);

  console.log("## Dependency Tree\n");
  for (const w of getActiveWorkflows(inv)) {
    console.log(`### ${w.name}`);
    console.log(`> ${w.description}\n`);

    if (w.mcpDependencies.length === 0) {
      console.log("- (no dependencies)\n");
    } else {
      for (const dep of w.mcpDependencies) {
        const found = activeMcps.find((m) => m.name === dep);
        if (found) {
          console.log(`- ✓ ${dep}: ${found.tools.join(", ") || "no tools"}`);
        } else {
          console.log(`- ✗ ${dep}: **MISSING!**`);
        }
      }
      console.log();
    }
  }

  console.log("## Unused MCPs\n");
  const unused = getUnusedMcps(inv);
  if (unused.length === 0) {
    console.log("All MCPs are referenced by at least one workflow.\n");
  } else {
    console.log("The following MCPs are not referenced by any workflow:\n");
    for (const m of unused) {
      console.log(`- **${m.name}**: ${m.description}`);
    }
  }

  console.log("\n## Summary\n");
  console.log(`- Active Workflows: ${getActiveWorkflows(inv).length}`);
  console.log(`- Active MCPs: ${activeMcps.length}`);
  console.log(`- Unused MCPs: ${unused.length}`);
  console.log(
    `- Archived: ${inv.workflows.filter((w) => w.archived).length} workflows, ${
      inv.mcpScripts.filter((m) => m.archived).length
    } MCPs`,
  );
}

export const workflow = defineWorkflow({
  name: "analyze",
  description: "Analyze dependencies between workflows and MCPs",
  handler: async () => {
    await actionAnalyze();
  },
});

export { actionAnalyze };
