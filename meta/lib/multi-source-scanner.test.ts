/**
 * Tests for multi-source-scanner.ts - Unified directory scanning and merging
 */

import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  afterAll,
  beforeAll,
  describe,
  it,
} from "https://deno.land/std@0.224.0/testing/bdd.ts";
import { join } from "jsr:@std/path";
import {
  createSource,
  createStandardSources,
  existsInSource,
  findByName,
  getActiveItems,
  scanAndMerge,
  scanDirectory,
  scanSource,
} from "./multi-source-scanner.ts";

// =============================================================================
// Test Helpers
// =============================================================================

const TEST_DIR = "/tmp/jixoflow-test-scanner";

async function setupTestDir(): Promise<void> {
  try {
    await Deno.remove(TEST_DIR, { recursive: true });
  } catch {
    // Directory may not exist
  }
  await Deno.mkdir(TEST_DIR, { recursive: true });
}

async function cleanupTestDir(): Promise<void> {
  try {
    await Deno.remove(TEST_DIR, { recursive: true });
  } catch {
    // Directory may not exist
  }
}

async function createTestFile(
  subdir: string,
  filename: string,
  content = "",
): Promise<string> {
  const dir = join(TEST_DIR, subdir);
  await Deno.mkdir(dir, { recursive: true });
  const path = join(dir, filename);
  await Deno.writeTextFile(path, content);
  return path;
}

// =============================================================================
// Tests: scanDirectory
// =============================================================================

describe("scanDirectory", () => {
  beforeAll(setupTestDir);
  afterAll(cleanupTestDir);

  it("should return empty array for non-existent directory", async () => {
    const result = await scanDirectory("/non-existent-path", ".ts");
    assertEquals(result, []);
  });

  it("should return empty array for empty directory", async () => {
    await Deno.mkdir(join(TEST_DIR, "empty"), { recursive: true });
    const result = await scanDirectory(join(TEST_DIR, "empty"), ".ts");
    assertEquals(result, []);
  });

  it("should find files matching suffix", async () => {
    await createTestFile("scan1", "a.workflow.ts");
    await createTestFile("scan1", "b.workflow.ts");
    await createTestFile("scan1", "c.mcp.ts");

    const result = await scanDirectory(join(TEST_DIR, "scan1"), ".workflow.ts");
    assertEquals(result.length, 2);
    assertEquals(result.some((f) => f.endsWith("a.workflow.ts")), true);
    assertEquals(result.some((f) => f.endsWith("b.workflow.ts")), true);
  });

  it("should not match files with different suffix", async () => {
    await createTestFile("scan2", "a.mcp.ts");

    const result = await scanDirectory(join(TEST_DIR, "scan2"), ".workflow.ts");
    assertEquals(result.length, 0);
  });
});

// =============================================================================
// Tests: scanSource
// =============================================================================

describe("scanSource", () => {
  beforeAll(setupTestDir);
  afterAll(cleanupTestDir);

  it("should return ScannedItems with correct properties", async () => {
    await createTestFile("source1", "test.workflow.ts");

    const source = createSource("builtin", join(TEST_DIR, "source1"));
    const items = await scanSource(source, ".workflow.ts");

    assertEquals(items.length, 1);
    assertEquals(items[0].name, "test");
    assertEquals(items[0].source, "builtin");
    assertEquals(items[0].filename, "test.workflow.ts");
    assertExists(items[0].path);
    assertExists(items[0].priority);
  });

  it("should respect enabled=false", async () => {
    await createTestFile("source2", "test.workflow.ts");

    const source = createSource("builtin", join(TEST_DIR, "source2"), {
      enabled: false,
    });
    const items = await scanSource(source, ".workflow.ts");

    assertEquals(items.length, 0);
  });

  it("should use custom priority when provided", async () => {
    await createTestFile("source3", "test.workflow.ts");

    const source = createSource("custom", join(TEST_DIR, "source3"), {
      priority: 999,
    });
    const items = await scanSource(source, ".workflow.ts");

    assertEquals(items[0].priority, 999);
  });
});

// =============================================================================
// Tests: scanAndMerge
// =============================================================================

describe("scanAndMerge", () => {
  beforeAll(setupTestDir);
  afterAll(cleanupTestDir);

  it("should merge items from multiple sources", async () => {
    await createTestFile("merge-builtin", "a.workflow.ts");
    await createTestFile("merge-builtin", "b.workflow.ts");
    await createTestFile("merge-user", "c.workflow.ts");

    const result = await scanAndMerge({
      suffix: ".workflow.ts",
      sources: [
        createSource("builtin", join(TEST_DIR, "merge-builtin")),
        createSource("user", join(TEST_DIR, "merge-user")),
      ],
    });

    assertEquals(result.items.length, 3);
    assertEquals(result.stats.total, 3);
  });

  it("should prioritize higher priority sources", async () => {
    await createTestFile(
      "priority-builtin",
      "same.workflow.ts",
      "builtin content",
    );
    await createTestFile("priority-user", "same.workflow.ts", "user content");

    const result = await scanAndMerge({
      suffix: ".workflow.ts",
      sources: [
        createSource("builtin", join(TEST_DIR, "priority-builtin")),
        createSource("user", join(TEST_DIR, "priority-user")),
      ],
    });

    assertEquals(result.items.length, 1);
    assertEquals(result.items[0].name, "same");
    assertEquals(result.items[0].source, "user");
    assertEquals(result.items[0].overrides, "builtin");
  });

  it("should track overridden items", async () => {
    await createTestFile("override-builtin", "dup.workflow.ts");
    await createTestFile("override-user", "dup.workflow.ts");

    const result = await scanAndMerge({
      suffix: ".workflow.ts",
      sources: [
        createSource("builtin", join(TEST_DIR, "override-builtin")),
        createSource("user", join(TEST_DIR, "override-user")),
      ],
    });

    assertEquals(result.overridden.length, 1);
    assertEquals(result.overridden[0].item.source, "builtin");
    assertEquals(result.overridden[0].by.source, "user");
    assertEquals(result.stats.overriddenCount, 1);
  });

  it("should group items by source", async () => {
    await createTestFile("group-builtin", "a.workflow.ts");
    await createTestFile("group-user", "b.workflow.ts");
    await createTestFile("group-user", "c.workflow.ts");

    const result = await scanAndMerge({
      suffix: ".workflow.ts",
      sources: [
        createSource("builtin", join(TEST_DIR, "group-builtin")),
        createSource("user", join(TEST_DIR, "group-user")),
      ],
    });

    assertEquals(result.bySource.builtin.length, 1);
    assertEquals(result.bySource.user.length, 2);
  });

  it("should handle project > user > builtin priority", async () => {
    await createTestFile("pri-builtin", "x.workflow.ts", "builtin");
    await createTestFile("pri-user", "x.workflow.ts", "user");
    await createTestFile("pri-project", "x.workflow.ts", "project");

    const result = await scanAndMerge({
      suffix: ".workflow.ts",
      sources: [
        createSource("builtin", join(TEST_DIR, "pri-builtin")),
        createSource("user", join(TEST_DIR, "pri-user")),
        createSource("project", join(TEST_DIR, "pri-project")),
      ],
    });

    assertEquals(result.items.length, 1);
    assertEquals(result.items[0].source, "project");
  });
});

// =============================================================================
// Tests: Helper Functions
// =============================================================================

describe("createSource", () => {
  it("should create source with defaults", () => {
    const source = createSource("builtin", "/path/to/dir");
    assertEquals(source.type, "builtin");
    assertEquals(source.directory, "/path/to/dir");
    assertEquals(source.enabled, undefined);
    assertEquals(source.priority, undefined);
  });

  it("should create source with custom options", () => {
    const source = createSource("custom", "/path", {
      priority: 50,
      enabled: true,
    });
    assertEquals(source.type, "custom");
    assertEquals(source.priority, 50);
    assertEquals(source.enabled, true);
  });
});

describe("createStandardSources", () => {
  it("should create sources for all provided directories", () => {
    const sources = createStandardSources({
      builtin: "/builtin",
      user: "/user",
      archived: "/archived",
    });

    assertEquals(sources.length, 3);
    assertEquals(sources.some((s) => s.type === "builtin"), true);
    assertEquals(sources.some((s) => s.type === "user"), true);
    assertEquals(sources.some((s) => s.type === "archived"), true);
  });

  it("should include project source when provided", () => {
    const sources = createStandardSources({
      builtin: "/builtin",
      project: "/project",
    });

    assertEquals(sources.some((s) => s.type === "project"), true);
  });

  it("should include custom sources", () => {
    const sources = createStandardSources({
      builtin: "/builtin",
      custom: [
        { directory: "/custom1", priority: 70 },
        { directory: "/custom2" },
      ],
    });

    const customs = sources.filter((s) => s.type === "custom");
    assertEquals(customs.length, 2);
  });
});

describe("getActiveItems", () => {
  beforeAll(setupTestDir);
  afterAll(cleanupTestDir);

  it("should exclude archived items", async () => {
    await createTestFile("active-builtin", "a.workflow.ts");
    await createTestFile("active-archived", "b.workflow.ts");

    const result = await scanAndMerge({
      suffix: ".workflow.ts",
      sources: [
        createSource("builtin", join(TEST_DIR, "active-builtin")),
        createSource("archived", join(TEST_DIR, "active-archived")),
      ],
    });

    const active = getActiveItems(result);
    assertEquals(active.length, 1);
    assertEquals(active[0].source, "builtin");
  });
});

describe("findByName", () => {
  beforeAll(setupTestDir);
  afterAll(cleanupTestDir);

  it("should find item by name", async () => {
    await createTestFile("find-test", "target.workflow.ts");
    await createTestFile("find-test", "other.workflow.ts");

    const result = await scanAndMerge({
      suffix: ".workflow.ts",
      sources: [createSource("builtin", join(TEST_DIR, "find-test"))],
    });

    const found = findByName(result, "target");
    assertExists(found);
    assertEquals(found.name, "target");
  });

  it("should return undefined for non-existent name", async () => {
    await createTestFile("find-none", "a.workflow.ts");

    const result = await scanAndMerge({
      suffix: ".workflow.ts",
      sources: [createSource("builtin", join(TEST_DIR, "find-none"))],
    });

    const found = findByName(result, "non-existent");
    assertEquals(found, undefined);
  });
});

describe("existsInSource", () => {
  beforeAll(setupTestDir);
  afterAll(cleanupTestDir);

  it("should return true for existing item in source", async () => {
    await createTestFile("exists-builtin", "item.workflow.ts");

    const result = await scanAndMerge({
      suffix: ".workflow.ts",
      sources: [createSource("builtin", join(TEST_DIR, "exists-builtin"))],
    });

    assertEquals(existsInSource(result, "item", "builtin"), true);
  });

  it("should return true for overridden item in source", async () => {
    await createTestFile("exists-over-builtin", "item.workflow.ts");
    await createTestFile("exists-over-user", "item.workflow.ts");

    const result = await scanAndMerge({
      suffix: ".workflow.ts",
      sources: [
        createSource("builtin", join(TEST_DIR, "exists-over-builtin")),
        createSource("user", join(TEST_DIR, "exists-over-user")),
      ],
    });

    // User wins, but builtin still exists (was overridden)
    assertEquals(existsInSource(result, "item", "builtin"), true);
    assertEquals(existsInSource(result, "item", "user"), true);
  });

  it("should return false for non-existent item", async () => {
    await createTestFile("exists-no", "other.workflow.ts");

    const result = await scanAndMerge({
      suffix: ".workflow.ts",
      sources: [createSource("builtin", join(TEST_DIR, "exists-no"))],
    });

    assertEquals(existsInSource(result, "item", "builtin"), false);
  });
});
