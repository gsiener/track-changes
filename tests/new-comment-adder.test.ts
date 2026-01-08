import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Page, ElementHandle } from "playwright";

// Mock logger
vi.mock("../src/utils/logger.js", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
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

function createMockElement(): ElementHandle {
  return {
    scrollIntoViewIfNeeded: vi.fn().mockResolvedValue(undefined),
    click: vi.fn().mockResolvedValue(undefined),
    fill: vi.fn().mockResolvedValue(undefined),
    textContent: vi.fn().mockResolvedValue(""),
  } as unknown as ElementHandle;
}

describe("NewCommentAdder", () => {
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

  describe("addNewComment", () => {
    it("should find anchor text via find-replace dialog", async () => {
      const mockTextarea = createMockElement();
      const mockSubmitBtn = createMockElement();

      mockFindFirst
        .mockResolvedValueOnce(mockTextarea)
        .mockResolvedValueOnce(mockSubmitBtn);

      const { DocsWriter } = await import("../src/browser/docs-writer.js");
      const writer = new DocsWriter(mockPage);

      await writer.applyAllChanges({
        suggestions: [],
        commentReplies: [],
        newComments: [
          {
            anchorText: "text to anchor on",
            comment: "This is my comment",
          },
        ],
      });

      // Should open find dialog and search for anchor text
      expect(mockFillFirst).toHaveBeenCalledWith(
        mockPage,
        expect.any(Array),
        "text to anchor on",
        expect.any(Object)
      );

      // Should press Enter to search
      expect(mockPage.keyboard.press).toHaveBeenCalledWith("Enter");
    });

    it("should open comment dialog with keyboard shortcut", async () => {
      const mockTextarea = createMockElement();
      const mockSubmitBtn = createMockElement();

      mockFindFirst
        .mockResolvedValueOnce(mockTextarea)
        .mockResolvedValueOnce(mockSubmitBtn);

      const { DocsWriter } = await import("../src/browser/docs-writer.js");
      const writer = new DocsWriter(mockPage);

      await writer.applyAllChanges({
        suggestions: [],
        commentReplies: [],
        newComments: [
          {
            anchorText: "anchor",
            comment: "comment text",
          },
        ],
      });

      // Should press Meta+Alt+m to add comment
      expect(mockPage.keyboard.press).toHaveBeenCalledWith("Meta+Alt+m");
    });

    it("should fill comment textarea and submit", async () => {
      const mockTextarea = createMockElement();
      const mockSubmitBtn = createMockElement();

      mockFindFirst
        .mockResolvedValueOnce(mockTextarea)
        .mockResolvedValueOnce(mockSubmitBtn);

      const { DocsWriter } = await import("../src/browser/docs-writer.js");
      const writer = new DocsWriter(mockPage);

      await writer.applyAllChanges({
        suggestions: [],
        commentReplies: [],
        newComments: [
          {
            anchorText: "anchor text",
            comment: "My detailed comment here",
          },
        ],
      });

      // Textarea should be filled with comment
      expect(mockTextarea.fill).toHaveBeenCalledWith("My detailed comment here");

      // Submit button should be clicked
      expect(mockSubmitBtn.click).toHaveBeenCalled();
    });

    it("should use keyboard shortcut when submit button not found", async () => {
      const mockTextarea = createMockElement();

      mockFindFirst
        .mockResolvedValueOnce(mockTextarea)
        .mockResolvedValueOnce(null); // No submit button

      const { DocsWriter } = await import("../src/browser/docs-writer.js");
      const writer = new DocsWriter(mockPage);

      await writer.applyAllChanges({
        suggestions: [],
        commentReplies: [],
        newComments: [
          {
            anchorText: "anchor",
            comment: "comment",
          },
        ],
      });

      // Should use Meta+Enter as fallback
      expect(mockPage.keyboard.press).toHaveBeenCalledWith("Meta+Enter");
    });

    it("should close find dialog before adding comment", async () => {
      const mockTextarea = createMockElement();
      const mockSubmitBtn = createMockElement();

      mockFindFirst
        .mockResolvedValueOnce(mockTextarea)
        .mockResolvedValueOnce(mockSubmitBtn);

      const { DocsWriter } = await import("../src/browser/docs-writer.js");
      const writer = new DocsWriter(mockPage);

      await writer.applyAllChanges({
        suggestions: [],
        commentReplies: [],
        newComments: [
          {
            anchorText: "anchor",
            comment: "comment",
          },
        ],
      });

      // Should press Escape to close find dialog (keeps selection)
      expect(mockPage.keyboard.press).toHaveBeenCalledWith("Escape");
    });

    it("should handle missing textarea gracefully", async () => {
      mockFindFirst.mockResolvedValue(null);

      const { DocsWriter } = await import("../src/browser/docs-writer.js");
      const writer = new DocsWriter(mockPage);

      // Should not throw
      await writer.applyAllChanges({
        suggestions: [],
        commentReplies: [],
        newComments: [
          {
            anchorText: "anchor",
            comment: "comment",
          },
        ],
      });

      // Should log warning but continue
      const { logger } = await import("../src/utils/logger.js");
      expect(logger.warn).toHaveBeenCalled();
    });

    it("should handle multiple new comments sequentially", async () => {
      const mockTextarea = createMockElement();
      const mockSubmitBtn = createMockElement();

      mockFindFirst.mockResolvedValue(mockTextarea);
      mockFindFirst
        .mockResolvedValueOnce(mockTextarea)
        .mockResolvedValueOnce(mockSubmitBtn)
        .mockResolvedValueOnce(mockTextarea)
        .mockResolvedValueOnce(mockSubmitBtn);

      const { DocsWriter } = await import("../src/browser/docs-writer.js");
      const writer = new DocsWriter(mockPage);

      await writer.applyAllChanges({
        suggestions: [],
        commentReplies: [],
        newComments: [
          { anchorText: "anchor1", comment: "comment1" },
          { anchorText: "anchor2", comment: "comment2" },
        ],
      });

      // Both anchor texts should be searched
      expect(mockFillFirst).toHaveBeenCalledWith(
        mockPage,
        expect.any(Array),
        "anchor1",
        expect.any(Object)
      );
      expect(mockFillFirst).toHaveBeenCalledWith(
        mockPage,
        expect.any(Array),
        "anchor2",
        expect.any(Object)
      );
    });
  });
});
