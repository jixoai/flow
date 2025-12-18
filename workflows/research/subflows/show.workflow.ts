/**
 * Research Show Subflow - Show a research report
 */

import { defineWorkflow } from "../../shared/base-workflow.ts";
import { listReports } from "../helpers.ts";

export const workflow = defineWorkflow({
  name: "show",
  description: "Show a research report",
  args: {
    id: {
      type: "string",
      description: "Report ID (or 'latest')",
      required: true,
    },
    raw: { type: "boolean", description: "Show raw markdown", default: false },
  },
  handler: async (args) => {
    const reports = await listReports();

    const report = args.id === "latest"
      ? reports[0]
      : reports.find((r) => r.id === args.id || r.id.includes(args.id));

    if (!report) {
      console.error(`Report not found: ${args.id}`);
      console.error("Use 'research list' to see available reports.");
      Deno.exit(1);
    }

    if (!report.hasMain) {
      console.error(`Report has no MAIN.md: ${report.id}`);
      console.log(`Path: ${report.path}`);
      Deno.exit(1);
    }

    const content = await Deno.readTextFile(report.mainFile);

    if (args.raw) {
      console.log(content);
    } else {
      console.log(`# Report: ${report.id}\n`);
      console.log(`Path: ${report.path}\n`);
      console.log("---\n");
      console.log(content);
    }
  },
});
