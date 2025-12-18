/**
 * File Scanner - Scan directories for workflows and MCPs
 */

import { basename } from "jsr:@std/path";

export async function scanDirectory(
  dir: string,
  suffix: string,
): Promise<string[]> {
  const files: string[] = [];
  try {
    for await (const entry of Deno.readDir(dir)) {
      if (entry.isFile && entry.name.endsWith(suffix)) {
        files.push(`${dir}/${entry.name}`);
      }
    }
  } catch {
    // Directory may not exist
  }
  return files;
}

export async function extractDescription(filePath: string): Promise<string> {
  try {
    const content = await Deno.readTextFile(filePath);
    const match = content.match(/\/\*\*[\s\S]*?\*\s+([A-Z][^\n*]+)/);
    return match?.[1]?.trim() || "(No description)";
  } catch {
    return "(No description)";
  }
}

export async function extractMcpDependencies(
  filePath: string,
): Promise<string[]> {
  try {
    const content = await Deno.readTextFile(filePath);
    const deps: string[] = [];
    for (
      const m of content.matchAll(
        /mcps\/([a-z][a-z0-9-]*)\.mcp|mcp__([a-z][a-z0-9-]*)__/gi,
      )
    ) {
      const name = m[1] || m[2];
      if (name && !deps.includes(name)) deps.push(name);
    }
    return deps;
  } catch {
    return [];
  }
}

export async function extractMcpTools(filePath: string): Promise<string[]> {
  try {
    const content = await Deno.readTextFile(filePath);
    const matches = content.matchAll(
      /(?:server\.tool|defineTool)\s*\(\s*(?:\{[^}]*name:\s*)?["']([a-z_][a-z0-9_]*)["']/gi,
    );
    return [...matches].map((m) => m[1]);
  } catch {
    return [];
  }
}

export function getBaseName(filePath: string, suffix: string): string {
  return basename(filePath, suffix);
}
