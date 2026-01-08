import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Page } from "playwright";

/**
 * Action Results Tracking Tests
 *
 * Tests for partial failure handling in DocsWriter.
 *
 * Note: Comment replies are now handled via Drive API in cli.ts, not DocsWriter.
 * DocsWriter only handles suggestions and new comments.
 */

// Mock logger
const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

vi.mock("../src/utils/logger.js", () => ({
  logger: mockLogger,
}));

// Mock retry to bypass actual retry logic
vi.mock("../src/browser/retry.js", () => ({
  withRetry: vi.fn(async (operation: () => Promise<any>) => operation()),
}));

// Mock page-helpers
const mockFindFirst = vi.fn();
const mockClickFirst = vi.fn();
const mockFillFirst = vi.fn();
const mockClickElement = vi.fn();
const mockDismissDialogs = vi.fn();

vi.mock("../src/browser/page-helpers.js", () => ({
  findFirst: mockFindFirst,
  clickFirst: mockClickFirst,
  fillFirst: mockFillFirst,
  clickElement: mockClickElement,
  dismissDialogs: mockDismissDialogs,
  TIMEOUTS: {
    PAGE_LOAD: 100,
    MENU_OPEN: 50,
    MENU_ACTION: 50,
    INPUT_SETTLE: 50,
    SEARCH_COMPLETE: 50,
    BUTTON_ACTION: 50,
    COMMENT_EXPAND: 50,
    KEY_PRESS: 50,
  },
}));

// Mock selectors
vi.mock("../src/browser/selectors.js", () => ({
  selectors: {
    editingModeButton: '[data-tooltip*="mode"]',
    suggestingModeOption: '[aria-label*="Suggesting"]',
    commentThread: '.docos-anchoredreplyview',
    resolveButton: '.docos-resolve-button',
    commentTextarea: 'textarea[aria-label*="comment"]',
    submitCommentButton: 'button[aria-label*="Comment"]',
  },
}));

function createMockPage(): Page {
  return {
    goto: vi.fn().mockResolvedValue(undefined),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
    click: vi.fn().mockResolvedValue(undefined),
    $: vi.fn().mockResolvedValue(null),
    $$: vi.fn().mockResolvedValue([]),
    keyboard: {
      press: vi.fn().mockResolvedValue(undefined),
      type: vi.fn().mockResolvedValue(undefined),
    },
    screenshot: vi.fn().mockResolvedValue(undefined),
  } as unknown as Page;
}

describe("Action Results Tracking", () => {
  let mockPage: Page;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPage = createMockPage();
    mockFindFirst.mockResolvedValue(null);
    mockClickFirst.mockResolvedValue(undefined);
    mockFillFirst.mockResolvedValue(undefined);
    mockClickElement.mockResolvedValue(undefined);
    mockDismissDialogs.mockResolvedValue(undefined);
  });

  describe("partial failure handling", () => {
    it("should track successful suggestions count", async () => {
      const mockReplaceInput = { fill: vi.fn() };
      mockFindFirst.mockResolvedValue(mockReplaceInput);

      const mockButton = { textContent: vi.fn().mockResolvedValue("Replace") };
      (mockPage.$$ as any).mockResolvedValue([mockButton]);

      const { DocsWriter } = await import("../src/browser/docs-writer.js");
      const writer = new DocsWriter(mockPage);

      // Apply multiple suggestions - all should succeed
      await writer.applyAllChanges({
        suggestions: [
          { findText: "old1", replaceWith: "new1" },
          { findText: "old2", replaceWith: "new2" },
        ],
        commentReplies: [],
        newComments: [],
      });

      // Logger should have been called for each suggestion
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("Applying suggestion 1/2"),
        expect.any(Object)
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("Applying suggestion 2/2"),
        expect.any(Object)
      );
    });

    it("should continue processing after individual failures", async () => {
      // First suggestion will fail, second will succeed
      let callCount = 0;
      mockFindFirst.mockImplementation(async () => {
        callCount++;
        if (callCount <= 1) {
          return null;
        }
        return { fill: vi.fn() };
      });

      // For clickReplaceButton
      let buttonCallCount = 0;
      (mockPage.$$ as any).mockImplementation(async () => {
        buttonCallCount++;
        if (buttonCallCount === 1) {
          return [];
        }
        return [{ textContent: vi.fn().mockResolvedValue("Replace") }];
      });

      const { DocsWriter } = await import("../src/browser/docs-writer.js");
      const writer = new DocsWriter(mockPage);

      await writer.applyAllChanges({
        suggestions: [
          { findText: "fail", replaceWith: "fail" },
          { findText: "succeed", replaceWith: "succeed" },
        ],
        commentReplies: [],
        newComments: [],
      });

      // Error should be logged for first failure
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining("Failed to apply suggestion 1"),
        expect.any(Object)
      );

      // But second suggestion should still be attempted
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("Applying suggestion 2/2"),
        expect.any(Object)
      );
    });

    it("should track failed suggestions with error details", async () => {
      mockFindFirst.mockResolvedValue(null);
      (mockPage.$$ as any).mockResolvedValue([]);

      const { DocsWriter } = await import("../src/browser/docs-writer.js");
      const writer = new DocsWriter(mockPage);

      await writer.applyAllChanges({
        suggestions: [{ findText: "will fail", replaceWith: "never" }],
        commentReplies: [],
        newComments: [],
      });

      // Error should be logged with details
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining("Failed to apply suggestion"),
        expect.objectContaining({
          error: expect.any(String),
        })
      );

      // Screenshot should be taken
      expect(mockPage.screenshot).toHaveBeenCalled();
    });

    it("should process suggestions and new comments (comment replies via API)", async () => {
      const mockReplaceInput = { fill: vi.fn() };
      const mockTextarea = { fill: vi.fn() };
      const mockSubmitBtn = { click: vi.fn() };

      mockFindFirst
        .mockResolvedValueOnce(mockReplaceInput) // For suggestion
        .mockResolvedValueOnce(mockTextarea) // For new comment textarea
        .mockResolvedValueOnce(mockSubmitBtn); // For new comment submit

      const mockButton = { textContent: vi.fn().mockResolvedValue("Replace") };
      (mockPage.$$ as any).mockResolvedValue([mockButton]);

      const { DocsWriter } = await import("../src/browser/docs-writer.js");
      const writer = new DocsWriter(mockPage);

      await writer.applyAllChanges({
        suggestions: [{ findText: "old", replaceWith: "new" }],
        commentReplies: [], // Empty - handled via Drive API
        newComments: [{ anchorText: "anchor", comment: "new comment" }],
      });

      // Both suggestions and new comments should be attempted
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("Applying suggestion"),
        expect.any(Object)
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("Adding new comment")
      );
    });

    it("should warn when commentReplies are passed (should be handled via API)", async () => {
      const mockReplaceInput = { fill: vi.fn() };
      mockFindFirst.mockResolvedValue(mockReplaceInput);
      const mockButton = { textContent: vi.fn().mockResolvedValue("Replace") };
      (mockPage.$$ as any).mockResolvedValue([mockButton]);

      const { DocsWriter } = await import("../src/browser/docs-writer.js");
      const writer = new DocsWriter(mockPage);

      await writer.applyAllChanges({
        suggestions: [],
        commentReplies: [
          { commentQuote: "test", reply: "reply", resolve: false },
        ],
        newComments: [],
      });

      // Should warn that comment replies should be via API
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Comment replies passed to DocsWriter"),
        expect.any(Object)
      );
    });
  });

  describe("summary reporting", () => {
    it("should log summary of actions attempted", async () => {
      const mockReplaceInput = { fill: vi.fn() };
      mockFindFirst.mockResolvedValue(mockReplaceInput);
      const mockButton = { textContent: vi.fn().mockResolvedValue("Replace") };
      (mockPage.$$ as any).mockResolvedValue([mockButton]);

      const { DocsWriter } = await import("../src/browser/docs-writer.js");
      const writer = new DocsWriter(mockPage);

      await writer.applyAllChanges({
        suggestions: [
          { findText: "old1", replaceWith: "new1" },
          { findText: "old2", replaceWith: "new2" },
          { findText: "old3", replaceWith: "new3" },
        ],
        commentReplies: [],
        newComments: [],
      });

      // All 3 suggestions should be logged
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("1/3"),
        expect.any(Object)
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("2/3"),
        expect.any(Object)
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("3/3"),
        expect.any(Object)
      );
    });
  });
});
