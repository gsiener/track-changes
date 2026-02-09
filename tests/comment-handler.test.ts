import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Comment Handler Tests
 *
 * Note: Comment replies are now handled via Drive API in the CLI, not browser automation.
 * This test file documents the expected behavior for Drive API comment replies.
 *
 * Browser-based comment reply tests have been removed since that functionality
 * was moved to the DocsReader class (see docs-reader.test.ts).
 */

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

// Mock Google API clients for Drive API
const mockRepliesCreate = vi.fn();
const mockCommentsUpdate = vi.fn();

vi.mock("../src/google/auth.js", () => ({
  createDocsClient: vi.fn(() => ({
    documents: { get: vi.fn() },
  })),
  createDriveClient: vi.fn(() => ({
    comments: {
      list: vi.fn().mockResolvedValue({ data: { comments: [] } }),
      update: mockCommentsUpdate,
    },
    replies: {
      create: mockRepliesCreate,
    },
  })),
}));

describe("Comment Handler (Drive API)", () => {
  const mockConfig = {
    anthropicApiKey: "sk-ant-test-key",
    googleServiceAccountPath: "./test.json",
    claudeGoogleEmail: "test@example.com",
    claudeGooglePassword: "password",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("replyToComment via DocsReader", () => {
    it("should create reply via Drive API", async () => {
      mockRepliesCreate.mockResolvedValue({ data: { id: "reply1" } });

      const { DocsReader } = await import("../src/google/docs-reader.js");
      const reader = new DocsReader(mockConfig);

      await reader.replyToComment("doc123", "comment1", "Here's my reply");

      expect(mockRepliesCreate).toHaveBeenCalledWith({
        fileId: "doc123",
        commentId: "comment1",
        fields: "id,content,author",
        requestBody: {
          content: "Here's my reply",
        },
      });
    });

    it("should resolve comment when requested", async () => {
      mockRepliesCreate.mockResolvedValue({ data: { id: "reply1" } });
      mockCommentsUpdate.mockResolvedValue({ data: {} });

      const { DocsReader } = await import("../src/google/docs-reader.js");
      const reader = new DocsReader(mockConfig);

      await reader.replyToComment("doc123", "comment1", "Fixed!", true);

      // Should create reply
      expect(mockRepliesCreate).toHaveBeenCalledWith({
        fileId: "doc123",
        commentId: "comment1",
        fields: "id,content,author",
        requestBody: { content: "Fixed!" },
      });

      // Should resolve comment
      expect(mockCommentsUpdate).toHaveBeenCalledWith({
        fileId: "doc123",
        commentId: "comment1",
        fields: "id,resolved",
        requestBody: { resolved: true },
      });
    });

    it("should not resolve comment by default", async () => {
      mockRepliesCreate.mockResolvedValue({ data: { id: "reply1" } });

      const { DocsReader } = await import("../src/google/docs-reader.js");
      const reader = new DocsReader(mockConfig);

      await reader.replyToComment("doc123", "comment1", "Reply without resolve");

      expect(mockRepliesCreate).toHaveBeenCalled();
      expect(mockCommentsUpdate).not.toHaveBeenCalled();
    });
  });

  describe("resolveComment via DocsReader", () => {
    it("should resolve comment via Drive API", async () => {
      mockCommentsUpdate.mockResolvedValue({ data: {} });

      const { DocsReader } = await import("../src/google/docs-reader.js");
      const reader = new DocsReader(mockConfig);

      await reader.resolveComment("doc123", "comment1");

      expect(mockCommentsUpdate).toHaveBeenCalledWith({
        fileId: "doc123",
        commentId: "comment1",
        fields: "id,resolved",
        requestBody: { resolved: true },
      });
    });
  });

  describe("CLI integration", () => {
    it("should match commentQuote to document comments", () => {
      // This tests the matching logic used in cli.ts
      const documentComments = [
        { id: "c1", content: "Please fix this typo" },
        { id: "c2", content: "Add more details here" },
        { id: "c3", content: "This section needs revision" },
      ];

      const commentQuote = "fix this typo";

      // Match logic from cli.ts
      const matchingComment = documentComments.find(
        (c) =>
          c.content.toLowerCase().includes(commentQuote.toLowerCase()) ||
          commentQuote.toLowerCase().includes(c.content.toLowerCase().slice(0, 30))
      );

      expect(matchingComment).toBeTruthy();
      expect(matchingComment?.id).toBe("c1");
    });

    it("should handle case-insensitive matching", () => {
      const documentComments = [
        { id: "c1", content: "UPPERCASE COMMENT" },
      ];

      const commentQuote = "uppercase comment";

      const matchingComment = documentComments.find(
        (c) =>
          c.content.toLowerCase().includes(commentQuote.toLowerCase())
      );

      expect(matchingComment?.id).toBe("c1");
    });

    it("should return undefined when no matching comment found", () => {
      const documentComments = [
        { id: "c1", content: "Some comment" },
      ];

      const commentQuote = "completely different text";

      const matchingComment = documentComments.find(
        (c) =>
          c.content.toLowerCase().includes(commentQuote.toLowerCase())
      );

      expect(matchingComment).toBeUndefined();
    });
  });
});
