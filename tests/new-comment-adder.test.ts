import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AgentBrowserClient } from "../src/browser/agent-browser-client.js";

// Mock logger
vi.mock("../src/utils/logger.js", () => ({
  logger: {
    trace: vi.fn(),
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

// Mock snapshot-helpers
const mockClickByMatcher = vi.fn();
const mockFillByMatcher = vi.fn();
const mockClickBySelector = vi.fn();
const mockFillBySelector = vi.fn();
const mockDismissDialogs = vi.fn();
const mockFindElementByMatcher = vi.fn();
const mockWait = vi.fn();

vi.mock("../src/browser/snapshot-helpers.js", () => ({
  clickByMatcher: mockClickByMatcher,
  fillByMatcher: mockFillByMatcher,
  clickBySelector: mockClickBySelector,
  fillBySelector: mockFillBySelector,
  dismissDialogs: mockDismissDialogs,
  findElementByMatcher: mockFindElementByMatcher,
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
    editMenu: [{ role: "menuitem", name: /Edit/i }],
    findAndReplaceMenuItem: [{ role: "menuitem", text: /Find and replace/i }],
    findInput: [{ role: "textbox", name: /find/i }],
    commentTextarea: [{ role: "textbox", name: /comment/i }],
    submitCommentButton: [{ role: "button", name: /Comment/i }],
  },
}));

function createMockClient(): AgentBrowserClient {
  const mockElement = {
    fill: vi.fn().mockResolvedValue(undefined),
    click: vi.fn().mockResolvedValue(undefined),
    textContent: vi.fn().mockResolvedValue(""),
  };

  const mockPage = {
    goto: vi.fn().mockResolvedValue(undefined),
    click: vi.fn().mockResolvedValue(undefined),
    $: vi.fn().mockResolvedValue(mockElement),
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

describe("NewCommentAdder", () => {
  let mockClient: AgentBrowserClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockClient();
    mockClickByMatcher.mockResolvedValue(undefined);
    mockFillByMatcher.mockResolvedValue(undefined);
    mockClickBySelector.mockResolvedValue(undefined);
    mockFillBySelector.mockResolvedValue(undefined);
    mockDismissDialogs.mockResolvedValue(undefined);
    mockFindElementByMatcher.mockResolvedValue(null);
    mockWait.mockResolvedValue(undefined);
  });

  describe("addNewComment", () => {
    it("should find anchor text via find-replace dialog", async () => {
      const { DocsWriter } = await import("../src/browser/docs-writer.js");
      const writer = new DocsWriter(mockClient);

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

      // Should fill find input with anchor text
      expect(mockFillByMatcher).toHaveBeenCalledWith(
        mockClient,
        expect.any(Array),
        "text to anchor on",
        expect.any(Object)
      );
    });

    it("should open comment dialog with keyboard shortcut", async () => {
      const { DocsWriter } = await import("../src/browser/docs-writer.js");
      const writer = new DocsWriter(mockClient);

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
      const mockPage = mockClient.getPage();
      expect(mockPage.keyboard.press).toHaveBeenCalledWith("Meta+Alt+m");
    });

    it("should fill comment textarea", async () => {
      const { DocsWriter } = await import("../src/browser/docs-writer.js");
      const writer = new DocsWriter(mockClient);

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

      // Textarea should be filled with comment via fillByMatcher
      expect(mockFillByMatcher).toHaveBeenCalledWith(
        mockClient,
        expect.any(Array),
        "My detailed comment here",
        expect.any(Object)
      );
    });

    it("should submit comment via clickByMatcher", async () => {
      const { DocsWriter } = await import("../src/browser/docs-writer.js");
      const writer = new DocsWriter(mockClient);

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

      // Submit button should be clicked via clickByMatcher
      expect(mockClickByMatcher).toHaveBeenCalledWith(
        mockClient,
        expect.any(Array),
        expect.objectContaining({ logPrefix: "Submit comment" })
      );
    });

    it("should use keyboard shortcut when submit button not found", async () => {
      // Make clickByMatcher fail for submit button
      mockClickByMatcher.mockImplementation((client, matchers, options) => {
        if (options?.logPrefix === "Submit comment") {
          return Promise.reject(new Error("Not found"));
        }
        return Promise.resolve(undefined);
      });
      mockClickBySelector.mockRejectedValue(new Error("Not found"));

      const { DocsWriter } = await import("../src/browser/docs-writer.js");
      const writer = new DocsWriter(mockClient);

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
      const mockPage = mockClient.getPage();
      expect(mockPage.keyboard.press).toHaveBeenCalledWith("Meta+Enter");
    });

    it("should close find dialog before adding comment", async () => {
      const { DocsWriter } = await import("../src/browser/docs-writer.js");
      const writer = new DocsWriter(mockClient);

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
      const mockPage = mockClient.getPage();
      expect(mockPage.keyboard.press).toHaveBeenCalledWith("Escape");
    });

    it("should handle multiple new comments sequentially", async () => {
      const { DocsWriter } = await import("../src/browser/docs-writer.js");
      const writer = new DocsWriter(mockClient);

      await writer.applyAllChanges({
        suggestions: [],
        commentReplies: [],
        newComments: [
          { anchorText: "anchor1", comment: "comment1" },
          { anchorText: "anchor2", comment: "comment2" },
        ],
      });

      // Both anchor texts should be searched via fillByMatcher
      expect(mockFillByMatcher).toHaveBeenCalledWith(
        mockClient,
        expect.any(Array),
        "anchor1",
        expect.any(Object)
      );
      expect(mockFillByMatcher).toHaveBeenCalledWith(
        mockClient,
        expect.any(Array),
        "anchor2",
        expect.any(Object)
      );
    });

    it("should handle failure gracefully and continue", async () => {
      // Make fillByMatcher fail for first comment's textarea
      let callCount = 0;
      mockFillByMatcher.mockImplementation((client, matchers, text, options) => {
        callCount++;
        // Fail on 3rd call (first comment's textarea - after anchor1 and Enter)
        if (callCount === 2) {
          return Promise.reject(new Error("Element not found"));
        }
        return Promise.resolve(undefined);
      });
      mockFillBySelector.mockRejectedValue(new Error("Element not found"));

      const { DocsWriter } = await import("../src/browser/docs-writer.js");
      const writer = new DocsWriter(mockClient);

      // Should not throw
      await writer.applyAllChanges({
        suggestions: [],
        commentReplies: [],
        newComments: [
          { anchorText: "anchor1", comment: "comment1" },
        ],
      });

      // Screenshot should be taken on failure
      const mockPage = mockClient.getPage();
      expect(mockPage.screenshot).toHaveBeenCalled();
    });
  });
});
