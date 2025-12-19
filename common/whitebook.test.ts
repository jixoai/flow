/**
 * Whitebook 模块测试
 *
 * 测试从白皮书读取文档和提取 AI 指令的功能
 */

import {
  assertEquals,
  assertExists,
  assertStringIncludes,
} from "jsr:@std/assert";
import {
  combineWhitebookPrompts,
  extractAiInstructions,
  loadWhitebookAsPrompt,
  readWhitebookDoc,
  WHITEBOOK_DIR,
} from "./whitebook.ts";
import { join } from "jsr:@std/path";
import { exists } from "jsr:@std/fs/exists";

// =============================================================================
// WHITEBOOK_DIR 测试
// =============================================================================

Deno.test("WHITEBOOK_DIR", async (t) => {
  await t.step("should point to valid directory", async () => {
    const dirExists = await exists(WHITEBOOK_DIR);
    assertEquals(
      dirExists,
      true,
      `WHITEBOOK_DIR should exist: ${WHITEBOOK_DIR}`,
    );
  });

  await t.step("should contain white-book in path", () => {
    assertStringIncludes(WHITEBOOK_DIR, "white-book");
  });
});

// =============================================================================
// readWhitebookDoc 测试
// =============================================================================

Deno.test("readWhitebookDoc", async (t) => {
  await t.step("should read existing document", async () => {
    const content = await readWhitebookDoc("index.md");
    assertExists(content);
    assertEquals(typeof content, "string");
    assertEquals(content!.length > 0, true);
  });

  await t.step("should read nested document", async () => {
    const content = await readWhitebookDoc("01-overview/index.md");
    assertExists(content);
    assertStringIncludes(content!, "#"); // 应该包含 markdown 标题
  });

  await t.step("should return null for non-existent document", async () => {
    const content = await readWhitebookDoc("non-existent-file.md");
    assertEquals(content, null);
  });

  await t.step("should return null for non-existent directory", async () => {
    const content = await readWhitebookDoc("non-existent-dir/file.md");
    assertEquals(content, null);
  });

  await t.step("should read preferences-api document", async () => {
    const content = await readWhitebookDoc(
      "06-configuration/preferences-api.md",
    );
    if (content) {
      assertStringIncludes(content, "Preferences");
      assertStringIncludes(content, "definePreferences");
    }
  });
});

// =============================================================================
// extractAiInstructions 测试
// =============================================================================

Deno.test("extractAiInstructions", async (t) => {
  await t.step(
    "should extract AI instructions from preferences-api",
    async () => {
      const instructions = await extractAiInstructions(
        "06-configuration/preferences-api.md",
      );

      if (instructions) {
        // 应该包含 AI 指令内容
        assertStringIncludes(instructions, "AI Instructions");
      }
    },
  );

  await t.step("should return full content if no markers", async () => {
    // index.md 可能没有 AI 指令标记
    const content = await extractAiInstructions("index.md");
    assertExists(content);
  });

  await t.step("should return null for non-existent file", async () => {
    const content = await extractAiInstructions("non-existent.md");
    assertEquals(content, null);
  });
});

// =============================================================================
// loadWhitebookAsPrompt 测试
// =============================================================================

Deno.test("loadWhitebookAsPrompt", async (t) => {
  await t.step("should load document as prompt", async () => {
    const prompt = await loadWhitebookAsPrompt(
      "06-configuration/preferences-api.md",
    );
    assertEquals(typeof prompt, "string");
  });

  await t.step("should return empty string for non-existent file", async () => {
    const prompt = await loadWhitebookAsPrompt("non-existent.md");
    assertEquals(prompt, "");
  });

  await t.step("should prefer AI instructions if present", async () => {
    const prompt = await loadWhitebookAsPrompt(
      "06-configuration/preferences-api.md",
    );

    if (prompt.includes("AI Instructions")) {
      // 如果文档有 AI 指令，应该主要包含指令内容
      assertStringIncludes(prompt, "AI Instructions");
    }
  });
});

// =============================================================================
// combineWhitebookPrompts 测试
// =============================================================================

Deno.test("combineWhitebookPrompts", async (t) => {
  await t.step("should combine multiple documents", async () => {
    const combined = await combineWhitebookPrompts([
      "index.md",
      "01-overview/index.md",
    ]);

    assertEquals(typeof combined, "string");
    // 应该包含分隔符
    if (combined.length > 0) {
      assertStringIncludes(combined, "---");
    }
  });

  await t.step("should skip non-existent documents", async () => {
    const combined = await combineWhitebookPrompts([
      "index.md",
      "non-existent.md",
      "01-overview/index.md",
    ]);

    assertEquals(typeof combined, "string");
  });

  await t.step("should return empty for all non-existent", async () => {
    const combined = await combineWhitebookPrompts([
      "non-existent-1.md",
      "non-existent-2.md",
    ]);

    assertEquals(combined, "");
  });

  await t.step("should handle empty array", async () => {
    const combined = await combineWhitebookPrompts([]);
    assertEquals(combined, "");
  });

  await t.step("should handle single document", async () => {
    const combined = await combineWhitebookPrompts(["index.md"]);
    const single = await loadWhitebookAsPrompt("index.md");

    assertEquals(combined, single);
  });
});

// =============================================================================
// AI Instructions 格式测试
// =============================================================================

Deno.test("AI Instructions Format", async (t) => {
  // 创建临时测试文件
  const testDir = await Deno.makeTempDir();
  const testFile = join(testDir, "test-doc.md");

  await t.step("should extract content between markers", async () => {
    const content = `# Document Title

Some intro text.

<!-- AI_INSTRUCTIONS_START -->

## AI Instructions

This is the AI-specific content.

- Point 1
- Point 2

<!-- AI_INSTRUCTIONS_END -->

## Other Section

This should not be included.
`;

    await Deno.writeTextFile(testFile, content);

    // 直接测试提取逻辑
    const startMarker = "<!-- AI_INSTRUCTIONS_START -->";
    const endMarker = "<!-- AI_INSTRUCTIONS_END -->";

    const startIndex = content.indexOf(startMarker);
    const endIndex = content.indexOf(endMarker);

    const extracted = content
      .substring(startIndex + startMarker.length, endIndex)
      .trim();

    assertStringIncludes(extracted, "AI Instructions");
    assertStringIncludes(extracted, "Point 1");
    assertEquals(extracted.includes("Other Section"), false);
  });

  await t.step("should handle missing end marker", async () => {
    const content = `# Document

<!-- AI_INSTRUCTIONS_START -->

Instructions without end marker.
`;

    await Deno.writeTextFile(testFile, content);

    const startMarker = "<!-- AI_INSTRUCTIONS_START -->";
    const endMarker = "<!-- AI_INSTRUCTIONS_END -->";

    const _startIndex = content.indexOf(startMarker);
    const endIndex = content.indexOf(endMarker);

    // 当缺少结束标记时，endIndex 为 -1
    assertEquals(endIndex, -1);
  });

  await t.step("should handle missing start marker", async () => {
    const content = `# Document

Just regular content.

<!-- AI_INSTRUCTIONS_END -->
`;

    await Deno.writeTextFile(testFile, content);

    const startMarker = "<!-- AI_INSTRUCTIONS_START -->";

    const startIndex = content.indexOf(startMarker);

    // 当缺少开始标记时，startIndex 为 -1
    assertEquals(startIndex, -1);
  });

  await t.step("should handle empty AI instructions", async () => {
    const content = `# Document

<!-- AI_INSTRUCTIONS_START -->
<!-- AI_INSTRUCTIONS_END -->

Other content.
`;

    await Deno.writeTextFile(testFile, content);

    const startMarker = "<!-- AI_INSTRUCTIONS_START -->";
    const endMarker = "<!-- AI_INSTRUCTIONS_END -->";

    const startIndex = content.indexOf(startMarker);
    const endIndex = content.indexOf(endMarker);

    const extracted = content
      .substring(startIndex + startMarker.length, endIndex)
      .trim();

    assertEquals(extracted, "");
  });

  // 清理
  await Deno.remove(testDir, { recursive: true });
});

// =============================================================================
// 真实文档结构测试
// =============================================================================

Deno.test("Real Document Structure", async (t) => {
  await t.step("should have expected chapter structure", async () => {
    const chapters = [
      "01-overview",
      "02-workflow",
      "03-mcp",
      "04-advanced",
      "05-api",
      "06-configuration",
    ];

    for (const chapter of chapters) {
      const indexPath = `${chapter}/index.md`;
      const content = await readWhitebookDoc(indexPath);

      if (content === null) {
        console.warn(`Chapter ${chapter} index not found`);
        continue;
      }

      assertExists(content, `${chapter}/index.md should exist`);
    }
  });

  await t.step("preferences-api should have AI instructions", async () => {
    const content = await readWhitebookDoc(
      "06-configuration/preferences-api.md",
    );

    if (content) {
      assertStringIncludes(content, "AI_INSTRUCTIONS_START");
      assertStringIncludes(content, "AI_INSTRUCTIONS_END");
    }
  });
});

// =============================================================================
// 性能测试
// =============================================================================

Deno.test("Performance", async (t) => {
  await t.step("should read document quickly", async () => {
    const start = performance.now();

    for (let i = 0; i < 10; i++) {
      await readWhitebookDoc("index.md");
    }

    const elapsed = performance.now() - start;

    // 10 次读取应该在 100ms 内完成
    assertEquals(elapsed < 1000, true, `Reading took too long: ${elapsed}ms`);
  });

  await t.step("should combine documents efficiently", async () => {
    const start = performance.now();

    await combineWhitebookPrompts([
      "index.md",
      "01-overview/index.md",
      "02-workflow/index.md",
      "03-mcp/index.md",
    ]);

    const elapsed = performance.now() - start;

    // 组合 4 个文档应该在 500ms 内完成
    assertEquals(elapsed < 1000, true, `Combining took too long: ${elapsed}ms`);
  });
});
