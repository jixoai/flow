/**
 * Shared Session Manager
 *
 * Common session management utilities for MCP servers.
 * Used by ai-claude-code.mcp.ts and ai-codex.mcp.ts.
 */

import * as path from "node:path";

// Constants - can be overridden by environment variable SESSIONS_DIR
const DEFAULT_SESSIONS_BASE_DIR = ".claude/.sessions";

/**
 * Get the base sessions directory (can be overridden by SESSIONS_DIR env var)
 */
export function getSessionsBaseDir(): string {
  return Deno.env.get("SESSIONS_DIR") ||
    path.join(Deno.cwd(), DEFAULT_SESSIONS_BASE_DIR);
}

/**
 * Format date as ISO-like string safe for filenames: 2025-11-04T13-07-17
 */
export function formatTimestampForFilename(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${
    pad(date.getDate())
  }T${pad(date.getHours())}-${pad(date.getMinutes())}-${
    pad(date.getSeconds())
  }`;
}

// Type definitions
export interface SessionMetadata {
  sessionId: string;
  title: string;
  model?: string;
  createdAt: string;
  updatedAt: string;
  workingDirectory: string;
  turnCount: number;
  totalCostUsd?: number;
  lastPrompt: string;
  status: "active" | "completed" | "error";
}

export interface SessionFile {
  metadata: SessionMetadata;
  history: Array<{
    timestamp: string;
    prompt: string;
    response: string;
    costUsd?: number;
  }>;
}

/**
 * Get the sessions directory for a specific MCP
 */
export function getSessionsDir(mcpName: string): string {
  return path.join(getSessionsBaseDir(), mcpName);
}

/**
 * Generate a session file path with date-based organization
 * Format: {sessionsDir}/{mcpName}/{year}/{month}/{day}/{timestamp}-{title}.json
 * Timestamp format: 2025-11-04T13-07-17
 */
export function generateSessionPath(mcpName: string, title: string): string {
  const now = new Date();
  const year = now.getFullYear().toString();
  const month = (now.getMonth() + 1).toString().padStart(2, "0");
  const day = now.getDate().toString().padStart(2, "0");
  const timestamp = formatTimestampForFilename(now);

  // Sanitize title for filename
  const sanitizedTitle = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 50)
    .replace(/^-|-$/g, "") || "untitled";

  const sessionsDir = getSessionsDir(mcpName);
  return path.join(
    sessionsDir,
    year,
    month,
    day,
    `${timestamp}-${sanitizedTitle}.json`,
  );
}

/**
 * Ensure a directory exists
 */
export async function ensureDir(dirPath: string): Promise<void> {
  try {
    await Deno.mkdir(dirPath, { recursive: true });
  } catch (error) {
    if (!(error instanceof Deno.errors.AlreadyExists)) {
      throw error;
    }
  }
}

/**
 * Save a session to disk
 */
export async function saveSession(
  sessionPath: string,
  session: SessionFile,
): Promise<void> {
  const dir = path.dirname(sessionPath);
  await ensureDir(dir);
  await Deno.writeTextFile(sessionPath, JSON.stringify(session, null, 2));
}

/**
 * Load a session from disk
 */
export async function loadSession(
  sessionPath: string,
): Promise<SessionFile | null> {
  try {
    const content = await Deno.readTextFile(sessionPath);
    return JSON.parse(content) as SessionFile;
  } catch {
    return null;
  }
}

/**
 * List all sessions for a specific MCP
 */
export async function listAllSessions(
  mcpName: string,
): Promise<Array<{ path: string; metadata: SessionMetadata }>> {
  const sessions: Array<{ path: string; metadata: SessionMetadata }> = [];
  const sessionsDir = getSessionsDir(mcpName);

  async function walkDir(dir: string): Promise<void> {
    try {
      for await (const entry of Deno.readDir(dir)) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory) {
          await walkDir(fullPath);
        } else if (entry.name.endsWith(".json")) {
          const session = await loadSession(fullPath);
          if (session) {
            sessions.push({
              path: fullPath,
              metadata: session.metadata,
            });
          }
        }
      }
    } catch {
      // Directory doesn't exist or not readable
    }
  }

  await walkDir(sessionsDir);

  // Sort by updatedAt descending
  sessions.sort((a, b) =>
    b.metadata.updatedAt.localeCompare(a.metadata.updatedAt)
  );

  return sessions;
}

/**
 * Find a session by its session ID
 */
export async function findSessionById(
  mcpName: string,
  sessionId: string,
): Promise<{ path: string; session: SessionFile } | null> {
  const sessions = await listAllSessions(mcpName);
  for (const { path: sessionPath } of sessions) {
    const session = await loadSession(sessionPath);
    if (session && session.metadata.sessionId === sessionId) {
      return { path: sessionPath, session };
    }
  }
  return null;
}

/**
 * Extract a short title from a prompt
 */
export function extractTitle(prompt: string): string {
  const title = prompt.replace(/\n/g, " ").trim().slice(0, 50);
  return title || "untitled";
}

/**
 * Delete a session file
 */
export async function deleteSession(sessionPath: string): Promise<boolean> {
  try {
    await Deno.remove(sessionPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Delete sessions older than a specified number of days
 */
export async function deleteSessionsOlderThan(
  mcpName: string,
  days: number,
): Promise<string[]> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  const sessions = await listAllSessions(mcpName);
  const deletedPaths: string[] = [];

  for (const { path: sPath, metadata } of sessions) {
    if (new Date(metadata.updatedAt) < cutoffDate) {
      if (await deleteSession(sPath)) {
        deletedPaths.push(sPath);
      }
    }
  }

  return deletedPaths;
}

/**
 * Delete all sessions for a specific MCP
 */
export async function deleteAllSessions(mcpName: string): Promise<string[]> {
  const sessions = await listAllSessions(mcpName);
  const deletedPaths: string[] = [];

  for (const { path: sPath } of sessions) {
    if (await deleteSession(sPath)) {
      deletedPaths.push(sPath);
    }
  }

  return deletedPaths;
}
