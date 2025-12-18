/**
 * Tests for session-manager.ts
 */

import {
  assertEquals,
  assertExists,
  assertMatch,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  it,
} from "https://deno.land/std@0.224.0/testing/bdd.ts";
import * as path from "node:path";
import {
  deleteAllSessions,
  deleteSession,
  deleteSessionsOlderThan,
  ensureDir,
  extractTitle,
  findSessionById,
  formatTimestampForFilename,
  generateSessionPath,
  getSessionsBaseDir,
  getSessionsDir,
  listAllSessions,
  loadSession,
  saveSession,
  type SessionFile,
} from "./session-manager.ts";

const TEST_MCP_NAME = "test-mcp";

// =============================================================================
// Helper Functions
// =============================================================================

function createTestSession(
  overrides: Partial<SessionFile["metadata"]> = {},
): SessionFile {
  return {
    metadata: {
      sessionId: `test-session-${Date.now()}`,
      title: "Test Session",
      model: "test-model",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      workingDirectory: "/tmp",
      turnCount: 1,
      totalCostUsd: 0.01,
      lastPrompt: "Test prompt",
      status: "active",
      ...overrides,
    },
    history: [
      {
        timestamp: new Date().toISOString(),
        prompt: "Test prompt",
        response: "Test response",
        costUsd: 0.01,
      },
    ],
  };
}

// =============================================================================
// extractTitle Tests
// =============================================================================

describe("extractTitle", () => {
  it("should extract short prompt as title", () => {
    const title = extractTitle("Hello World");
    assertEquals(title, "Hello World");
  });

  it("should truncate long prompts", () => {
    const longPrompt = "a".repeat(100);
    const title = extractTitle(longPrompt);
    assertEquals(title.length, 50);
  });

  it("should replace newlines with spaces", () => {
    const title = extractTitle("Hello\nWorld\nTest");
    assertEquals(title, "Hello World Test");
  });

  it("should return 'untitled' for empty prompt", () => {
    const title = extractTitle("");
    assertEquals(title, "untitled");
  });

  it("should return 'untitled' for whitespace-only prompt", () => {
    const title = extractTitle("   ");
    assertEquals(title, "untitled");
  });

  it("should trim whitespace", () => {
    const title = extractTitle("  Hello World  ");
    assertEquals(title, "Hello World");
  });
});

// =============================================================================
// formatTimestampForFilename Tests
// =============================================================================

describe("formatTimestampForFilename", () => {
  it("should format date as ISO-like string", () => {
    const date = new Date("2025-11-04T13:07:17.000Z");
    // Note: The output depends on local timezone, so we check pattern
    const result = formatTimestampForFilename(date);
    assertMatch(result, /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/);
  });

  it("should pad single digit values", () => {
    const date = new Date("2025-01-05T03:07:09.000Z");
    const result = formatTimestampForFilename(date);
    assertMatch(result, /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/);
    // Verify padding is present (all segments are 2 digits for month/day/hour/min/sec)
    const parts = result.split(/[-T]/);
    assertEquals(parts[1].length, 2); // month
    assertEquals(parts[2].length, 2); // day
    assertEquals(parts[3].length, 2); // hour
    assertEquals(parts[4].length, 2); // minute
    assertEquals(parts[5].length, 2); // second
  });

  it("should produce filesystem-safe output", () => {
    const date = new Date();
    const result = formatTimestampForFilename(date);
    // Should not contain characters that are problematic for filenames
    assertEquals(result.includes(":"), false);
    assertEquals(result.includes("/"), false);
    assertEquals(result.includes("\\"), false);
  });
});

// =============================================================================
// getSessionsBaseDir Tests
// =============================================================================

describe("getSessionsBaseDir", () => {
  const originalEnv = Deno.env.get("SESSIONS_DIR");

  afterEach(() => {
    // Restore original environment
    if (originalEnv) {
      Deno.env.set("SESSIONS_DIR", originalEnv);
    } else {
      Deno.env.delete("SESSIONS_DIR");
    }
  });

  it("should use cwd by default", () => {
    Deno.env.delete("SESSIONS_DIR");
    const baseDir = getSessionsBaseDir();
    assertStringIncludes(baseDir, Deno.cwd());
    assertStringIncludes(baseDir, ".claude/.sessions");
  });

  it("should use SESSIONS_DIR env var when set", () => {
    const customDir = "/custom/sessions/path";
    Deno.env.set("SESSIONS_DIR", customDir);
    const baseDir = getSessionsBaseDir();
    assertEquals(baseDir, customDir);
  });
});

// =============================================================================
// getSessionsDir Tests
// =============================================================================

describe("getSessionsDir", () => {
  it("should return path with MCP name", () => {
    const dir = getSessionsDir("my-mcp");
    assertStringIncludes(dir, ".claude/.sessions/my-mcp");
  });

  it("should handle different MCP names", () => {
    const dir1 = getSessionsDir("ai-claude-code");
    const dir2 = getSessionsDir("ai-codex");

    assertStringIncludes(dir1, "ai-claude-code");
    assertStringIncludes(dir2, "ai-codex");
    assertEquals(dir1 !== dir2, true);
  });
});

// =============================================================================
// generateSessionPath Tests
// =============================================================================

describe("generateSessionPath", () => {
  it("should generate path with date structure", () => {
    const sessionPath = generateSessionPath(TEST_MCP_NAME, "Test Title");
    const now = new Date();
    const year = now.getFullYear().toString();
    const month = (now.getMonth() + 1).toString().padStart(2, "0");
    const day = now.getDate().toString().padStart(2, "0");

    assertStringIncludes(sessionPath, year);
    assertStringIncludes(sessionPath, month);
    assertStringIncludes(sessionPath, day);
    assertStringIncludes(sessionPath, ".json");
  });

  it("should use ISO-like timestamp format in filename", () => {
    const sessionPath = generateSessionPath(TEST_MCP_NAME, "Test Title");
    const filename = path.basename(sessionPath);
    // Filename should start with timestamp like 2025-12-17T20-53-11
    assertMatch(filename, /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-/);
  });

  it("should sanitize title for filename", () => {
    const sessionPath = generateSessionPath(TEST_MCP_NAME, "Test: Title! @#$%");
    assertStringIncludes(sessionPath, "test-title");
    assertEquals(sessionPath.includes(":"), false);
    assertEquals(sessionPath.includes("!"), false);
    assertEquals(sessionPath.includes("@"), false);
  });

  it("should handle empty title", () => {
    const sessionPath = generateSessionPath(TEST_MCP_NAME, "");
    assertStringIncludes(sessionPath, "untitled");
  });

  it("should truncate long titles", () => {
    const longTitle = "a".repeat(100);
    const sessionPath = generateSessionPath(TEST_MCP_NAME, longTitle);
    const filename = path.basename(sessionPath);
    // Filename should be reasonable length (timestamp + truncated title + extension)
    assertEquals(filename.length < 100, true);
  });

  it("should handle special characters in title", () => {
    const sessionPath = generateSessionPath(TEST_MCP_NAME, "Hello 世界 🌍");
    assertStringIncludes(sessionPath, "hello");
    assertStringIncludes(sessionPath, ".json");
  });
});

// =============================================================================
// File Operations Tests
// =============================================================================

describe("File Operations", () => {
  const testDir = "/tmp/session-manager-test-" + Date.now();
  let testSessionPath: string;
  let testSession: SessionFile;

  beforeAll(async () => {
    await ensureDir(testDir);
    testSessionPath = path.join(testDir, "test-session.json");
    testSession = createTestSession({ sessionId: "test-id-123" });
  });

  afterAll(async () => {
    try {
      await Deno.remove(testDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("ensureDir", () => {
    it("should create directory if not exists", async () => {
      const newDir = path.join(testDir, "new-dir", "nested");
      await ensureDir(newDir);

      const stat = await Deno.stat(newDir);
      assertEquals(stat.isDirectory, true);
    });

    it("should not throw if directory already exists", async () => {
      await ensureDir(testDir);
      await ensureDir(testDir); // Should not throw
    });
  });

  describe("saveSession", () => {
    it("should save session to file", async () => {
      await saveSession(testSessionPath, testSession);

      const content = await Deno.readTextFile(testSessionPath);
      const parsed = JSON.parse(content);
      assertEquals(parsed.metadata.sessionId, testSession.metadata.sessionId);
    });

    it("should create parent directories", async () => {
      const nestedPath = path.join(testDir, "a", "b", "c", "session.json");
      await saveSession(nestedPath, testSession);

      const content = await Deno.readTextFile(nestedPath);
      assertExists(JSON.parse(content));
    });
  });

  describe("loadSession", () => {
    it("should load existing session", async () => {
      await saveSession(testSessionPath, testSession);

      const loaded = await loadSession(testSessionPath);
      assertExists(loaded);
      assertEquals(loaded?.metadata.sessionId, testSession.metadata.sessionId);
    });

    it("should return null for non-existent file", async () => {
      const loaded = await loadSession("/non/existent/path.json");
      assertEquals(loaded, null);
    });

    it("should return null for invalid JSON", async () => {
      const invalidPath = path.join(testDir, "invalid.json");
      await Deno.writeTextFile(invalidPath, "not valid json");

      const loaded = await loadSession(invalidPath);
      assertEquals(loaded, null);
    });
  });

  describe("deleteSession", () => {
    it("should delete existing session", async () => {
      const sessionPath = path.join(testDir, "to-delete.json");
      await saveSession(sessionPath, testSession);

      const result = await deleteSession(sessionPath);
      assertEquals(result, true);

      const loaded = await loadSession(sessionPath);
      assertEquals(loaded, null);
    });

    it("should return false for non-existent file", async () => {
      const result = await deleteSession("/non/existent/path.json");
      assertEquals(result, false);
    });
  });
});

// =============================================================================
// Session Listing Tests
// =============================================================================

describe("Session Listing", () => {
  const testMcpName = "test-listing-" + Date.now();
  const sessions: Array<{ path: string; session: SessionFile }> = [];

  beforeAll(async () => {
    // Create test sessions
    for (let i = 0; i < 3; i++) {
      const session = createTestSession({
        sessionId: `list-test-${i}`,
        title: `Test Session ${i}`,
        updatedAt: new Date(Date.now() - i * 1000).toISOString(), // Stagger timestamps
      });
      const sessionPath = generateSessionPath(
        testMcpName,
        session.metadata.title,
      );
      await saveSession(sessionPath, session);
      sessions.push({ path: sessionPath, session });
    }
  });

  afterAll(async () => {
    await deleteAllSessions(testMcpName);
  });

  describe("listAllSessions", () => {
    it("should list all sessions", async () => {
      const listed = await listAllSessions(testMcpName);
      assertEquals(listed.length, 3);
    });

    it("should sort by updatedAt descending", async () => {
      const listed = await listAllSessions(testMcpName);

      for (let i = 1; i < listed.length; i++) {
        const prev = new Date(listed[i - 1].metadata.updatedAt).getTime();
        const curr = new Date(listed[i].metadata.updatedAt).getTime();
        assertEquals(
          prev >= curr,
          true,
          "Sessions should be sorted by updatedAt descending",
        );
      }
    });

    it("should return empty array for non-existent MCP", async () => {
      const listed = await listAllSessions("non-existent-mcp-" + Date.now());
      assertEquals(listed, []);
    });
  });

  describe("findSessionById", () => {
    it("should find session by ID", async () => {
      const result = await findSessionById(testMcpName, "list-test-0");
      assertExists(result);
      assertEquals(result?.session.metadata.sessionId, "list-test-0");
    });

    it("should return null for non-existent ID", async () => {
      const result = await findSessionById(testMcpName, "non-existent-id");
      assertEquals(result, null);
    });
  });
});

// =============================================================================
// Session Deletion Tests
// =============================================================================

describe("Session Deletion", () => {
  describe("deleteSessionsOlderThan", () => {
    const testMcpName = "test-delete-old-" + Date.now();

    beforeEach(async () => {
      // Create sessions with different ages
      const now = Date.now();

      // Recent session (today)
      const recentSession = createTestSession({
        sessionId: "recent",
        updatedAt: new Date(now).toISOString(),
      });
      await saveSession(
        generateSessionPath(testMcpName, "Recent"),
        recentSession,
      );

      // Old session (10 days ago)
      const oldSession = createTestSession({
        sessionId: "old",
        updatedAt: new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString(),
      });
      await saveSession(generateSessionPath(testMcpName, "Old"), oldSession);
    });

    afterEach(async () => {
      await deleteAllSessions(testMcpName);
    });

    it("should delete sessions older than specified days", async () => {
      const deleted = await deleteSessionsOlderThan(testMcpName, 5);
      assertEquals(deleted.length, 1);

      const remaining = await listAllSessions(testMcpName);
      assertEquals(remaining.length, 1);
      assertEquals(remaining[0].metadata.sessionId, "recent");
    });

    it("should not delete recent sessions", async () => {
      const deleted = await deleteSessionsOlderThan(testMcpName, 30);
      assertEquals(deleted.length, 0);

      const remaining = await listAllSessions(testMcpName);
      assertEquals(remaining.length, 2);
    });
  });

  describe("deleteAllSessions", () => {
    it("should delete all sessions for MCP", async () => {
      const testMcpName = "test-delete-all-" + Date.now();

      // Create sessions
      for (let i = 0; i < 3; i++) {
        const session = createTestSession({ sessionId: `del-all-${i}` });
        await saveSession(
          generateSessionPath(testMcpName, `Session ${i}`),
          session,
        );
      }

      const beforeDelete = await listAllSessions(testMcpName);
      assertEquals(beforeDelete.length, 3);

      const deleted = await deleteAllSessions(testMcpName);
      assertEquals(deleted.length, 3);

      const afterDelete = await listAllSessions(testMcpName);
      assertEquals(afterDelete.length, 0);
    });

    it("should return empty array for non-existent MCP", async () => {
      const deleted = await deleteAllSessions("non-existent-mcp-" + Date.now());
      assertEquals(deleted, []);
    });
  });
});
