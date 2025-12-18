/**
 * Research Workflow - Helper Functions
 */

import { join } from "jsr:@std/path";
import { exists } from "jsr:@std/fs/exists";
import { getResearchDir } from "../../common/paths.ts";

export function generateReportId(topic: string): string {
  const sanitized = topic.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30)
    .replace(/^-|-$/g, "");
  const ts = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  return `${sanitized}-${ts}`;
}

export async function ensureReportDir(reportId: string): Promise<string> {
  const reportDir = join(getResearchDir(), reportId);
  await Deno.mkdir(join(reportDir, "http"), { recursive: true });
  await Deno.mkdir(join(reportDir, "assets"), { recursive: true });
  return reportDir;
}

export interface ReportInfo {
  id: string;
  path: string;
  mainFile: string;
  hasMain: boolean;
  createdAt: Date;
}

export async function listReports(): Promise<ReportInfo[]> {
  const baseDir = getResearchDir();
  const reports: ReportInfo[] = [];

  try {
    for await (const entry of Deno.readDir(baseDir)) {
      if (entry.isDirectory && !entry.name.startsWith(".")) {
        const reportPath = join(baseDir, entry.name);
        const mainFile = join(reportPath, "MAIN.md");
        const hasMain = await exists(mainFile);

        const stat = await Deno.stat(reportPath);

        reports.push({
          id: entry.name,
          path: reportPath,
          mainFile,
          hasMain,
          createdAt: stat.birthtime || stat.mtime || new Date(),
        });
      }
    }
  } catch {
    // Directory doesn't exist
  }

  return reports.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}
