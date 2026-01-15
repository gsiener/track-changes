import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AgentBrowserClient } from "../src/browser/agent-browser-client.js";

// Mock logger
vi.mock("../src/utils/logger.js", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock retry to bypass actual retry logic in tests
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
    editMenu: [{ role: "menuitem", name: /Edit/i }],
    findAndReplaceMenuItem: [{ role: "menuitem", text: /Find and replace/i }],
    findInput: [{ role: "textbox", name: /find/i }],
    replaceInput: [{ role: "textbox", name: /replace/i }],
    replaceButton: [{ role: "button", text: "Replace" }],
  },
}));

function createMockClient(): AgentBrowserClient {
  const mockElement = {
    fill: vi.fn().mockResolvedValue(undefined),
    click: vi.fn().mockResolvedValue(undefined),
    textContent: vi.fn().mockResolvedValue("Replace"),
  };

  const mockPage = {
    goto: vi.fn().mockResolvedValue(undefined),
    click: vi.fn().mockResolvedValue(undefined),
    $: vi.fn().mockResolvedValue(mockElement),
    $$: vi.fn().mockResolvedValue([mockElement]),
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

describe("SuggestionApplier", () => {
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

  describe("applySuggestion", () => {
    it("should fill find text via fillByMatcher", async () => {
      const { SuggestionApplier } = await import("../src/browser/suggestion-applier.js");
      const applier = new SuggestionApplier(mockClient);

      await applier.applySuggestion({
        findText: "old text",
        replaceWith: "new text",
      });

      // Verify fillByMatcher was called for find input
      expect(mockFillByMatcher).toHaveBeenCalledWith(
        mockClient,
        expect.any(Array),
        "old text",
        expect.any(Object)
      );
    });

    it("should fill replace text via fillByMatcher", async () => {
      const { SuggestionApplier } = await import("../src/browser/suggestion-applier.js");
      const applier = new SuggestionApplier(mockClient);

      await applier.applySuggestion({ findText: "old", replaceWith: "new" });

      // Verify fillByMatcher was called for replace input
      expect(mockFillByMatcher).toHaveBeenCalledWith(
        mockClient,
        expect.any(Array),
        "new",
        expect.any(Object)
      );
    });

    it("should fall back to selector when matcher fails", async () => {
      // Make fillByMatcher fail on first call (find input)
      mockFillByMatcher
        .mockRejectedValueOnce(new Error("Matcher failed"))
        .mockResolvedValueOnce(undefined);

      const { SuggestionApplier } = await import("../src/browser/suggestion-applier.js");
      const applier = new SuggestionApplier(mockClient);

      await applier.applySuggestion({ findText: "old", replaceWith: "new" });

      // Verify fallback to fillBySelector was called
      expect(mockFillBySelector).toHaveBeenCalled();
    });

    it("should close dialog after operation with Escape", async () => {
      const { SuggestionApplier } = await import("../src/browser/suggestion-applier.js");
      const applier = new SuggestionApplier(mockClient);

      await applier.applySuggestion({ findText: "old", replaceWith: "new" });

      // Verify Escape was pressed to close dialog
      const mockPage = mockClient.getPage();
      expect(mockPage.keyboard.press).toHaveBeenCalledWith("Escape");
    });

    it("should click replace button via clickByMatcher", async () => {
      const { SuggestionApplier } = await import("../src/browser/suggestion-applier.js");
      const applier = new SuggestionApplier(mockClient);

      await applier.applySuggestion({ findText: "old", replaceWith: "new" });

      // Verify clickByMatcher was called for replace button
      expect(mockClickByMatcher).toHaveBeenCalledWith(
        mockClient,
        expect.any(Array),
        expect.objectContaining({ logPrefix: "Replace button" })
      );
    });
  });

  describe("openFindReplaceDialog", () => {
    it("should click Edit menu via clickByMatcher", async () => {
      const { SuggestionApplier } = await import("../src/browser/suggestion-applier.js");
      const applier = new SuggestionApplier(mockClient);

      await applier.openFindReplaceDialog();

      expect(mockClickByMatcher).toHaveBeenCalledWith(
        mockClient,
        expect.any(Array),
        expect.objectContaining({ logPrefix: "Edit menu" })
      );
    });

    it("should click Find and Replace menu item via clickByMatcher", async () => {
      const { SuggestionApplier } = await import("../src/browser/suggestion-applier.js");
      const applier = new SuggestionApplier(mockClient);

      await applier.openFindReplaceDialog();

      expect(mockClickByMatcher).toHaveBeenCalledWith(
        mockClient,
        expect.any(Array),
        expect.objectContaining({ logPrefix: "Find and replace" })
      );
    });
  });

  describe("via DocsWriter", () => {
    it("should delegate to SuggestionApplier", async () => {
      const { DocsWriter } = await import("../src/browser/docs-writer.js");
      const writer = new DocsWriter(mockClient);

      await writer.applyAllChanges({
        suggestions: [{ findText: "old", replaceWith: "new" }],
        commentReplies: [],
        newComments: [],
      });

      // Verify fillByMatcher was called (delegation to SuggestionApplier worked)
      expect(mockFillByMatcher).toHaveBeenCalled();
    });

    it("should handle suggestion failure gracefully", async () => {
      // Make all matchers fail to trigger error path
      mockFillByMatcher.mockRejectedValue(new Error("Element not found"));
      mockFillBySelector.mockRejectedValue(new Error("Element not found"));

      const { DocsWriter } = await import("../src/browser/docs-writer.js");
      const writer = new DocsWriter(mockClient);

      // Should not throw, but log error and take screenshot
      await writer.applyAllChanges({
        suggestions: [{ findText: "old", replaceWith: "new" }],
        commentReplies: [],
        newComments: [],
      });

      // Screenshot should have been taken on failure
      const mockPage = mockClient.getPage();
      expect(mockPage.screenshot).toHaveBeenCalled();
    });
  });
});
