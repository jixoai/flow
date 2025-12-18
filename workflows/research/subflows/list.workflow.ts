/**
 * Research List Subflow - List all research reports
 */

import { defineWorkflow } from "../../shared/base-workflow.ts";
import { getResearchDir } from "../../../common/paths.ts";
import { listReports } from "../helpers.ts";

export const workflow = defineWorkflow({
  name: "list",
  description: "List all research reports",
  args: {
    json: { type: "boolean", description: "Output as JSON", default: false },
    limit: {
      type: "number",
      alias: "l",
      description: "Max reports to show",
      default: 20,
    },
  },
  handler: async (args) => {
    const reports = await listReports();

    if (reports.length === 0) {
      console.log("No research reports found.");
      console.log(`Reports directory: ${getResearchDir()}`);
      return;
    }

    if (args.json) {
      console.log(JSON.stringify(reports.slice(0, args.limit), null, 2));
      return;
    }

    console.log(`## Research Reports (${reports.length} total)\n`);
    for (const report of reports.slice(0, args.limit)) {
      const status = report.hasMain ? "✓" : "○";
      const date = report.createdAt.toISOString().slice(0, 16).replace(
        "T",
        " ",
      );
      console.log(`${status} ${report.id}`);
      console.log(`  Created: ${date}`);
      console.log(`  Path: ${report.path}`);
      console.log();
    }
  },
});
