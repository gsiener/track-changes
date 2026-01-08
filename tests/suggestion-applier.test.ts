import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Page } from "playwright";

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

function createMockPage(): Page {
  const mockElement = {
    fill: vi.fn().mockResolvedValue(undefined),
    click: vi.fn().mockResolvedValue(undefined),
    textContent: vi.fn().mockResolvedValue("Replace"),
  };

  return {
    goto: vi.fn().mockResolvedValue(undefined),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
    click: vi.fn().mockResolvedValue(undefined),
    $: vi.fn().mockResolvedValue(mockElement),
    $$: vi.fn().mockResolvedValue([mockElement]),
    keyboard: {
      press: vi.fn().mockResolvedValue(undefined),
      type: vi.fn().mockResolvedValue(undefined),
    },
    screenshot: vi.fn().mockResolvedValue(undefined),
  } as unknown as Page;
}

describe("SuggestionApplier", () => {
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

  describe("applySuggestion", () => {
    it("should fill find text and trigger search", async () => {
      const mockReplaceInput = {
        fill: vi.fn().mockResolvedValue(undefined),
      };
      mockFindFirst.mockResolvedValue(mockReplaceInput);

      const mockButton = {
        textContent: vi.fn().mockResolvedValue("Replace"),
      };
      (mockPage.$$ as any).mockResolvedValue([mockButton]);

      const { SuggestionApplier } = await import("../src/browser/suggestion-applier.js");
      const applier = new SuggestionApplier(mockPage);

      await applier.applySuggestion({
        findText: "old text",
        replaceWith: "new text",
      });

      // Verify fillFirst was called with find input
      expect(mockFillFirst).toHaveBeenCalledWith(
        mockPage,
        expect.any(Array),
        "old text",
        expect.any(Object)
      );
    });

    it("should fill replace text and click replace button", async () => {
      const mockReplaceInput = {
        fill: vi.fn().mockResolvedValue(undefined),
      };
      mockFindFirst.mockResolvedValue(mockReplaceInput);

      const mockButton = {
        textContent: vi.fn().mockResolvedValue("Replace"),
      };
      (mockPage.$$ as any).mockResolvedValue([mockButton]);

      const { SuggestionApplier } = await import("../src/browser/suggestion-applier.js");
      const applier = new SuggestionApplier(mockPage);

      await applier.applySuggestion({ findText: "old", replaceWith: "new" });

      // Verify replace input was filled
      expect(mockReplaceInput.fill).toHaveBeenCalledWith("new");
    });

    it("should throw when replace input not found", async () => {
      // Return null for replace input
      mockFindFirst.mockResolvedValue(null);
      (mockPage.$$ as any).mockResolvedValue([]);

      const { SuggestionApplier } = await import("../src/browser/suggestion-applier.js");
      const applier = new SuggestionApplier(mockPage);

      await expect(
        applier.applySuggestion({ findText: "old", replaceWith: "new" })
      ).rejects.toThrow("Replace input not found");
    });

    it("should close dialog after operation", async () => {
      const mockReplaceInput = {
        fill: vi.fn().mockResolvedValue(undefined),
      };
      mockFindFirst.mockResolvedValue(mockReplaceInput);

      const mockButton = {
        textContent: vi.fn().mockResolvedValue("Replace"),
      };
      (mockPage.$$ as any).mockResolvedValue([mockButton]);

      const { SuggestionApplier } = await import("../src/browser/suggestion-applier.js");
      const applier = new SuggestionApplier(mockPage);

      await applier.applySuggestion({ findText: "old", replaceWith: "new" });

      // Verify Escape was pressed to close dialog
      expect(mockPage.keyboard.press).toHaveBeenCalledWith("Escape");
    });
  });

  describe("openFindReplaceDialog", () => {
    it("should click Edit menu then Find and replace", async () => {
      const { SuggestionApplier } = await import("../src/browser/suggestion-applier.js");
      const applier = new SuggestionApplier(mockPage);

      await applier.openFindReplaceDialog();

      expect(mockPage.click).toHaveBeenCalledWith('div[id="docs-edit-menu"]');
      expect(mockPage.click).toHaveBeenCalledWith('span:has-text("Find and replace")');
    });
  });

  describe("via DocsWriter", () => {
    it("should delegate to SuggestionApplier", async () => {
      const mockReplaceInput = {
        fill: vi.fn().mockResolvedValue(undefined),
      };
      mockFindFirst.mockResolvedValue(mockReplaceInput);

      const mockButton = {
        textContent: vi.fn().mockResolvedValue("Replace"),
      };
      (mockPage.$$ as any).mockResolvedValue([mockButton]);

      const { DocsWriter } = await import("../src/browser/docs-writer.js");
      const writer = new DocsWriter(mockPage);

      await writer.applyAllChanges({
        suggestions: [{ findText: "old", replaceWith: "new" }],
        commentReplies: [],
        newComments: [],
      });

      // Verify fillFirst was called (delegation to SuggestionApplier worked)
      expect(mockFillFirst).toHaveBeenCalled();
    });

    it("should handle suggestion failure gracefully", async () => {
      // Return null for replace input to trigger failure
      mockFindFirst.mockResolvedValue(null);
      (mockPage.$$ as any).mockResolvedValue([]);

      const { DocsWriter } = await import("../src/browser/docs-writer.js");
      const writer = new DocsWriter(mockPage);

      // Should not throw, but log error and take screenshot
      await writer.applyAllChanges({
        suggestions: [{ findText: "old", replaceWith: "new" }],
        commentReplies: [],
        newComments: [],
      });

      // Screenshot should have been taken on failure
      expect(mockPage.screenshot).toHaveBeenCalled();
    });
  });
});
