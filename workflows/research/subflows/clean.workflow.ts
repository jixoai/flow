/**
 * Research Clean Subflow - Remove old or incomplete reports
 */

import { defineWorkflow } from "../../shared/base-workflow.ts";
import { listReports } from "../helpers.ts";

export const workflow = defineWorkflow({
  name: "clean",
  description: "Remove old or incomplete reports",
  args: {
    keep: {
      type: "number",
      alias: "k",
      description: "Keep N most recent reports",
      default: 10,
    },
    incomplete: {
      type: "boolean",
      description: "Only remove incomplete reports",
      default: false,
    },
    "dry-run": {
      type: "boolean",
      description: "Show what would be removed",
      default: false,
    },
  },
  handler: async (args) => {
    const reports = await listReports();

    const toRemove = args.incomplete
      ? reports.filter((r) => !r.hasMain)
      : reports.slice(args.keep);

    if (toRemove.length === 0) {
      console.log("Nothing to clean.");
      return;
    }

    console.log(`Reports to remove: ${toRemove.length}\n`);
    for (const report of toRemove) {
      const status = report.hasMain ? "complete" : "incomplete";
      console.log(`- ${report.id} (${status})`);
    }

    if (args["dry-run"]) {
      console.log("\n(dry-run mode, no files removed)");
      return;
    }

    console.log();
    for (const report of toRemove) {
      await Deno.remove(report.path, { recursive: true });
      console.log(`Removed: ${report.id}`);
    }
    console.log(`\nCleaned ${toRemove.length} reports.`);
  },
});
