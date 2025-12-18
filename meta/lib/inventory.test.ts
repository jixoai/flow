/**
 * Tests for inventory.ts - Workflow and MCP scanning with user directory support
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
  buildInventory,
  getActiveMcps,
  getActiveWorkflows,
} from "./inventory.ts";
import {
  USER_MCPS_DIR,
  USER_WORKFLOWS_DIR,
} from "../../common/paths.ts";

// =============================================================================
// Test Fixtures
// =============================================================================

const TEST_USER_WORKFLOW = `/**
 * Test User Workflow
 */
import { defineWorkflow } from "../../workflows/shared/base-workflow.ts";
export const workflow = defineWorkflow({
  name: "test-user",
  description: "Test user workflow",
  handler: async () => {},
  autoStart: import.meta.main,
});
`;

const TEST_USER_MCP = `/**
 * Test User MCP
 */
import { defineTool, createMcpServer, z } from "../../mcps/shared/base-mcp.ts";
export const testTool = defineTool({
  name: "test_tool",
  description: "Test tool",
  inputSchema: z.object({}),
  handler: async () => ({}),
});
export const server = createMcpServer({
  name: "test-user",
  tools: [testTool],
  autoStart: import.meta.main,
});
`;

// =============================================================================
// Helper Functions
// =============================================================================

async function createTestFile(
  dir: string,
  filename: string,
  content: string,
): Promise<string> {
  try {
    await Deno.mkdir(dir, { recursive: true });
  } catch {
    // Directory may already exist
  }
  const path = join(dir, filename);
  await Deno.writeTextFile(path, content);
  return path;
}

async function removeTestFile(path: string): Promise<void> {
  try {
    await Deno.remove(path);
  } catch {
    // File may not exist
  }
}

// =============================================================================
// Tests
// =============================================================================

describe("inventory", () => {
  describe("buildInventory", () => {
    it("should return inventory with workflows and mcpScripts arrays", async () => {
      const inventory = await buildInventory();
      assertExists(inventory.workflows);
      assertExists(inventory.mcpScripts);
      assertEquals(Array.isArray(inventory.workflows), true);
      assertEquals(Array.isArray(inventory.mcpScripts), true);
    });

    it("should include builtin workflows", async () => {
      const inventory = await buildInventory();
      const builtinWorkflows = inventory.workflows.filter((w) =>
        w.source === "builtin"
      );
      assertEquals(builtinWorkflows.length > 0, true);
    });

    it("should include builtin MCPs", async () => {
      const inventory = await buildInventory();
      const builtinMcps = inventory.mcpScripts.filter((m) =>
        m.source === "builtin"
      );
      assertEquals(builtinMcps.length > 0, true);
    });

    it("should have source field on all items", async () => {
      const inventory = await buildInventory();
      for (const w of inventory.workflows) {
        assertExists(w.source);
        assertEquals(["builtin", "user", "archived"].includes(w.source), true);
      }
      for (const m of inventory.mcpScripts) {
        assertExists(m.source);
        assertEquals(["builtin", "user", "archived"].includes(m.source), true);
      }
    });
  });

  describe("user directory priority", () => {
    let testWorkflowPath: string;
    let testMcpPath: string;

    beforeAll(async () => {
      // Create test files in user directories
      testWorkflowPath = await createTestFile(
        USER_WORKFLOWS_DIR,
        "test-user-priority.workflow.ts",
        TEST_USER_WORKFLOW,
      );
      testMcpPath = await createTestFile(
        USER_MCPS_DIR,
        "test-user-priority.mcp.ts",
        TEST_USER_MCP,
      );
    });

    afterAll(async () => {
      await removeTestFile(testWorkflowPath);
      await removeTestFile(testMcpPath);
    });

    it("should find user workflows with source='user'", async () => {
      const inventory = await buildInventory();
      const userWorkflow = inventory.workflows.find(
        (w) => w.name === "test-user-priority" && w.source === "user",
      );
      assertExists(userWorkflow);
      assertEquals(userWorkflow.source, "user");
    });

    it("should find user MCPs with source='user'", async () => {
      const inventory = await buildInventory();
      const userMcp = inventory.mcpScripts.find(
        (m) => m.name === "test-user-priority" && m.source === "user",
      );
      assertExists(userMcp);
      assertEquals(userMcp.source, "user");
    });
  });

  describe("user override builtin", () => {
    let overrideWorkflowPath: string;

    const OVERRIDE_DESCRIPTION = "User override of coder";

    beforeAll(async () => {
      // Create a user workflow that overrides a builtin (using 'coder' as example)
      // Note: This test assumes 'coder' exists as a builtin
      overrideWorkflowPath = await createTestFile(
        USER_WORKFLOWS_DIR,
        "coder.workflow.ts",
        `/**
 * ${OVERRIDE_DESCRIPTION}
 */
import { defineWorkflow } from "../../workflows/shared/base-workflow.ts";
export const workflow = defineWorkflow({
  name: "coder",
  description: "${OVERRIDE_DESCRIPTION}",
  handler: async () => {},
  autoStart: import.meta.main,
});
`,
      );
    });

    afterAll(async () => {
      await removeTestFile(overrideWorkflowPath);
    });

    it("should have user version override builtin when same name", async () => {
      const inventory = await buildInventory();
      const coderWorkflows = inventory.workflows.filter((w) =>
        w.name === "coder" && !w.archived
      );

      // Should only have one non-archived 'coder' workflow
      assertEquals(coderWorkflows.length, 1);
      // It should be the user version
      assertEquals(coderWorkflows[0].source, "user");
      assertEquals(coderWorkflows[0].description, "User override of coder");
    });
  });

  describe("getActiveWorkflows", () => {
    it("should exclude archived workflows", async () => {
      const inventory = await buildInventory();
      const active = getActiveWorkflows(inventory);
      for (const w of active) {
        assertEquals(w.archived, false);
      }
    });
  });

  describe("getActiveMcps", () => {
    it("should exclude archived MCPs", async () => {
      const inventory = await buildInventory();
      const active = getActiveMcps(inventory);
      for (const m of active) {
        assertEquals(m.archived, false);
      }
    });
  });
});
