import { describe, it, expect, vi, beforeEach } from "vitest";
import { matchCommentForReply } from "../src/utils/comment-matcher.js";

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
      const documentComments = [
        { id: "c1", content: "Please fix this typo", resolved: false },
        { id: "c2", content: "Add more details here", resolved: false },
        { id: "c3", content: "This section needs revision", resolved: false },
      ];

      const commentQuote = "fix this typo";

      const match = matchCommentForReply(documentComments as any, commentQuote);

      expect(match.comment).toBeTruthy();
      expect(match.comment?.id).toBe("c1");
    });

    it("should handle case-insensitive matching", () => {
      const documentComments = [
        { id: "c1", content: "UPPERCASE COMMENT", resolved: false },
      ];

      const commentQuote = "uppercase comment";

      const match = matchCommentForReply(documentComments as any, commentQuote);

      expect(match.comment?.id).toBe("c1");
    });

    it("should return null when no matching comment found", () => {
      const documentComments = [
        { id: "c1", content: "Some comment", resolved: false },
      ];

      const commentQuote = "completely different text";

      const match = matchCommentForReply(documentComments as any, commentQuote);

      expect(match.comment).toBeNull();
      expect(match.error).toContain("No unresolved comment matches quote");
    });

    it("should ignore resolved comments", () => {
      const documentComments = [
        { id: "c1", content: "Please fix this", resolved: true },
        { id: "c2", content: "Please fix this", resolved: false },
      ];

      const match = matchCommentForReply(documentComments as any, "Please fix this");

      expect(match.comment?.id).toBe("c2");
    });

    it("should return error when multiple unresolved comments match", () => {
      const documentComments = [
        { id: "c1", content: "Please fix this", resolved: false },
        { id: "c2", content: "Please fix this", resolved: false },
      ];

      const match = matchCommentForReply(documentComments as any, "Please fix this");

      expect(match.comment).toBeNull();
      expect(match.error).toContain("Multiple unresolved comments match quote");
    });
  });
});
