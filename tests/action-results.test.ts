import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AgentBrowserClient } from "../src/browser/agent-browser-client.js";

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
  trace: vi.fn(),
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

// Mock snapshot-helpers
const mockClickByMatcher = vi.fn();
const mockFillByMatcher = vi.fn();
const mockClickBySelector = vi.fn();
const mockFillBySelector = vi.fn();
const mockDismissDialogs = vi.fn();
const mockWait = vi.fn();

vi.mock("../src/browser/snapshot-helpers.js", () => ({
  clickByMatcher: mockClickByMatcher,
  fillByMatcher: mockFillByMatcher,
  clickBySelector: mockClickBySelector,
  fillBySelector: mockFillBySelector,
  dismissDialogs: mockDismissDialogs,
  wait: mockWait,
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

// Mock matchers
vi.mock("../src/browser/matchers.js", () => ({
  matchers: {
    editingModeButton: [{ name: "Editing mode" }],
    suggestingModeOption: [{ name: /Suggesting/i }],
    editMenu: [{ role: "menuitem", name: /Edit/i }],
    findAndReplaceMenuItem: [{ role: "menuitem", text: /Find and replace/i }],
    findInput: [{ role: "textbox", name: /find/i }],
    replaceInput: [{ role: "textbox", name: /replace/i }],
    replaceButton: [{ role: "button", text: "Replace" }],
    commentTextarea: [{ role: "textbox", name: /comment/i }],
    submitCommentButton: [{ role: "button", name: /Comment/i }],
  },
}));

function createMockClient(): AgentBrowserClient {
  const mockPage = {
    goto: vi.fn().mockResolvedValue(undefined),
    click: vi.fn().mockResolvedValue(undefined),
    $: vi.fn().mockResolvedValue(null),
    $$: vi.fn().mockResolvedValue([]),
    keyboard: {
      press: vi.fn().mockResolvedValue(undefined),
      type: vi.fn().mockResolvedValue(undefined),
    },
    screenshot: vi.fn().mockResolvedValue(undefined),
  };

  return {
    getPage: vi.fn().mockReturnValue(mockPage),
    getSnapshot: vi.fn().mockResolvedValue({ tree: "", refs: {} }),
    getRefMap: vi.fn().mockReturnValue({}),
    getLocatorFromRef: vi.fn().mockReturnValue(null),
    getLocator: vi.fn().mockReturnValue(null),
    isRef: vi.fn().mockReturnValue(false),
    launch: vi.fn().mockResolvedValue(undefined),
    saveStorageState: vi.fn().mockResolvedValue(undefined),
    setViewport: vi.fn().mockResolvedValue(undefined),
    isLaunched: vi.fn().mockReturnValue(true),
    close: vi.fn().mockResolvedValue(undefined),
  } as unknown as AgentBrowserClient;
}

describe("Action Results Tracking", () => {
  let mockClient: AgentBrowserClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockClient();
    mockClickByMatcher.mockResolvedValue(undefined);
    mockFillByMatcher.mockResolvedValue(undefined);
    mockClickBySelector.mockResolvedValue(undefined);
    mockFillBySelector.mockResolvedValue(undefined);
    mockDismissDialogs.mockResolvedValue(undefined);
    mockWait.mockResolvedValue(undefined);
  });

  describe("partial failure handling", () => {
    it("should track successful suggestions count", async () => {
      const { DocsWriter } = await import("../src/browser/docs-writer.js");
      const writer = new DocsWriter(mockClient);

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
      expect(mockLogger.trace).toHaveBeenCalledWith(
        expect.stringContaining("Applying suggestion 1/2"),
        expect.any(Object)
      );
      expect(mockLogger.trace).toHaveBeenCalledWith(
        expect.stringContaining("Applying suggestion 2/2"),
        expect.any(Object)
      );
    });

    it("should continue processing after individual failures", async () => {
      // First suggestion will fail
      let callCount = 0;
      mockFillByMatcher.mockImplementation(async () => {
        callCount++;
        if (callCount <= 2) {
          // First two calls (find input and replace input for first suggestion)
          throw new Error("Element not found");
        }
        return undefined;
      });
      mockFillBySelector.mockRejectedValue(new Error("Fallback also failed"));

      const { DocsWriter } = await import("../src/browser/docs-writer.js");
      const writer = new DocsWriter(mockClient);

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
      expect(mockLogger.trace).toHaveBeenCalledWith(
        expect.stringContaining("Applying suggestion 2/2"),
        expect.any(Object)
      );
    });

    it("should track failed suggestions with error details", async () => {
      mockFillByMatcher.mockRejectedValue(new Error("Element not found"));
      mockFillBySelector.mockRejectedValue(new Error("Fallback also failed"));

      const { DocsWriter } = await import("../src/browser/docs-writer.js");
      const writer = new DocsWriter(mockClient);

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
      const mockPage = mockClient.getPage();
      expect(mockPage.screenshot).toHaveBeenCalled();
    });

    it("should process suggestions and new comments (comment replies via API)", async () => {
      const { DocsWriter } = await import("../src/browser/docs-writer.js");
      const writer = new DocsWriter(mockClient);

      await writer.applyAllChanges({
        suggestions: [{ findText: "old", replaceWith: "new" }],
        commentReplies: [], // Empty - handled via Drive API
        newComments: [{ anchorText: "anchor", comment: "new comment" }],
      });

      // Both suggestions and new comments should be attempted
      expect(mockLogger.trace).toHaveBeenCalledWith(
        expect.stringContaining("Applying suggestion"),
        expect.any(Object)
      );
      expect(mockLogger.trace).toHaveBeenCalledWith(
        expect.stringContaining("Adding new comment")
      );
    });

    it("should warn when commentReplies are passed (should be handled via API)", async () => {
      const { DocsWriter } = await import("../src/browser/docs-writer.js");
      const writer = new DocsWriter(mockClient);

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
      const { DocsWriter } = await import("../src/browser/docs-writer.js");
      const writer = new DocsWriter(mockClient);

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
      expect(mockLogger.trace).toHaveBeenCalledWith(
        expect.stringContaining("1/3"),
        expect.any(Object)
      );
      expect(mockLogger.trace).toHaveBeenCalledWith(
        expect.stringContaining("2/3"),
        expect.any(Object)
      );
      expect(mockLogger.trace).toHaveBeenCalledWith(
        expect.stringContaining("3/3"),
        expect.any(Object)
      );
    });
  });
});
