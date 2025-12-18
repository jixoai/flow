/**
 * List Subflow - List all workflows and MCPs
 */

import { defineWorkflow } from "../../workflows/shared/base-workflow.ts";
import {
  buildInventory,
  getActiveMcps,
  getActiveWorkflows,
} from "../lib/inventory.ts";

async function actionList(): Promise<void> {
  const inv = await buildInventory();

  console.log("## Active Workflows\n");
  for (const w of getActiveWorkflows(inv)) {
    const deps = w.mcpDependencies.length > 0
      ? w.mcpDependencies.join(", ")
      : "none";
    console.log(`- **${w.name}**: ${w.description} [deps: ${deps}]`);
  }

  console.log("\n## Active MCPs\n");
  for (const m of getActiveMcps(inv)) {
    const tools = m.tools.length > 0 ? m.tools.join(", ") : "no tools";
    const refs = m.referencedBy.length > 0 ? m.referencedBy.join(", ") : "none";
    console.log(`- **${m.name}**: ${tools} [used by: ${refs}]`);
  }
}

async function actionListJson(): Promise<string> {
  const inv = await buildInventory();
  return JSON.stringify(inv, null, 2);
}

export const workflow = defineWorkflow({
  name: "list",
  description: "List all workflows and MCPs",
  args: {
    json: { type: "boolean", description: "Output as JSON", default: false },
  },
  handler: async (args) => {
    if (args.json) {
      console.log(await actionListJson());
    } else {
      await actionList();
    }
  },
});

export { actionList, actionListJson };
