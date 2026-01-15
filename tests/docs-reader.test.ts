import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock logger
vi.mock("../src/utils/logger.js", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock the Google API clients
const mockDocsGet = vi.fn();
const mockCommentsList = vi.fn();
const mockRepliesCreate = vi.fn();
const mockCommentsUpdate = vi.fn();

vi.mock("../src/google/auth.js", () => ({
  createDocsClient: vi.fn(() => ({
    documents: {
      get: mockDocsGet,
    },
  })),
  createDriveClient: vi.fn(() => ({
    comments: {
      list: mockCommentsList,
      update: mockCommentsUpdate,
    },
    replies: {
      create: mockRepliesCreate,
    },
  })),
}));

describe("DocsReader", () => {
  const mockConfig = {
    anthropicApiKey: "sk-ant-test-key",
    googleServiceAccountPath: "./test.json",
    claudeGoogleEmail: "test@example.com",
    claudeGooglePassword: "password",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("fetchDocument", () => {
    it("should fetch document content and extract body text", async () => {
      mockDocsGet.mockResolvedValue({
        data: {
          title: "Test Document",
          body: {
            content: [
              {
                paragraph: {
                  elements: [
                    { textRun: { content: "Hello world" } },
                  ],
                },
              },
            ],
          },
        },
      });
      mockCommentsList.mockResolvedValue({ data: { comments: [] } });

      const { DocsReader } = await import("../src/google/docs-reader.js");
      const reader = new DocsReader(mockConfig);
      const document = await reader.fetchDocument("doc123");

      expect(document.id).toBe("doc123");
      expect(document.title).toBe("Test Document");
      expect(document.body).toBe("Hello world");
      expect(document.comments).toEqual([]);
    });

    it("should extract text from paragraphs with multiple textRuns", async () => {
      mockDocsGet.mockResolvedValue({
        data: {
          title: "Multi-run Doc",
          body: {
            content: [
              {
                paragraph: {
                  elements: [
                    { textRun: { content: "Hello " } },
                    { textRun: { content: "beautiful " } },
                    { textRun: { content: "world" } },
                  ],
                },
              },
            ],
          },
        },
      });
      mockCommentsList.mockResolvedValue({ data: { comments: [] } });

      const { DocsReader } = await import("../src/google/docs-reader.js");
      const reader = new DocsReader(mockConfig);
      const document = await reader.fetchDocument("doc123");

      expect(document.body).toBe("Hello beautiful world");
    });

    it("should extract text from multiple paragraphs", async () => {
      mockDocsGet.mockResolvedValue({
        data: {
          title: "Multi-paragraph Doc",
          body: {
            content: [
              {
                paragraph: {
                  elements: [{ textRun: { content: "First paragraph" } }],
                },
              },
              {
                paragraph: {
                  elements: [{ textRun: { content: "Second paragraph" } }],
                },
              },
            ],
          },
        },
      });
      mockCommentsList.mockResolvedValue({ data: { comments: [] } });

      const { DocsReader } = await import("../src/google/docs-reader.js");
      const reader = new DocsReader(mockConfig);
      const document = await reader.fetchDocument("doc123");

      expect(document.body).toBe("First paragraph\nSecond paragraph");
    });

    it("should extract text from tables", async () => {
      mockDocsGet.mockResolvedValue({
        data: {
          title: "Table Doc",
          body: {
            content: [
              {
                table: {
                  tableRows: [
                    {
                      tableCells: [
                        {
                          content: [
                            {
                              paragraph: {
                                elements: [{ textRun: { content: "Cell 1" } }],
                              },
                            },
                          ],
                        },
                        {
                          content: [
                            {
                              paragraph: {
                                elements: [{ textRun: { content: "Cell 2" } }],
                              },
                            },
                          ],
                        },
                      ],
                    },
                    {
                      tableCells: [
                        {
                          content: [
                            {
                              paragraph: {
                                elements: [{ textRun: { content: "Cell 3" } }],
                              },
                            },
                          ],
                        },
                        {
                          content: [
                            {
                              paragraph: {
                                elements: [{ textRun: { content: "Cell 4" } }],
                              },
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              },
            ],
          },
        },
      });
      mockCommentsList.mockResolvedValue({ data: { comments: [] } });

      const { DocsReader } = await import("../src/google/docs-reader.js");
      const reader = new DocsReader(mockConfig);
      const document = await reader.fetchDocument("doc123");

      expect(document.body).toContain("Cell 1");
      expect(document.body).toContain("Cell 2");
      expect(document.body).toContain("Cell 3");
      expect(document.body).toContain("Cell 4");
    });

    it("should fetch comments and convert to CommentThread format", async () => {
      mockDocsGet.mockResolvedValue({
        data: {
          title: "Doc with Comments",
          body: { content: [] },
        },
      });
      mockCommentsList.mockResolvedValue({
        data: {
          comments: [
            {
              id: "comment1",
              content: "Please review this",
              author: { displayName: "Alice" },
              resolved: false,
              quotedFileContent: { value: "anchor text here" },
              replies: [
                {
                  content: "Will do!",
                  author: { displayName: "Bob" },
                },
              ],
            },
          ],
        },
      });

      const { DocsReader } = await import("../src/google/docs-reader.js");
      const reader = new DocsReader(mockConfig);
      const document = await reader.fetchDocument("doc123");

      expect(document.comments).toHaveLength(1);
      expect(document.comments[0]).toEqual({
        id: "comment1",
        content: "Please review this",
        author: "Alice",
        resolved: false,
        anchorText: "anchor text here",
        replies: [
          {
            content: "Will do!",
            author: "Bob",
          },
        ],
      });
    });

    it("should handle multiple comments", async () => {
      mockDocsGet.mockResolvedValue({
        data: {
          title: "Doc",
          body: { content: [] },
        },
      });
      mockCommentsList.mockResolvedValue({
        data: {
          comments: [
            {
              id: "c1",
              content: "Comment 1",
              author: { displayName: "Alice" },
              resolved: false,
              quotedFileContent: { value: "text1" },
              replies: [],
            },
            {
              id: "c2",
              content: "Comment 2",
              author: { displayName: "Bob" },
              resolved: true,
              quotedFileContent: { value: "text2" },
              replies: [],
            },
          ],
        },
      });

      const { DocsReader } = await import("../src/google/docs-reader.js");
      const reader = new DocsReader(mockConfig);
      const document = await reader.fetchDocument("doc123");

      expect(document.comments).toHaveLength(2);
      expect(document.comments[0].id).toBe("c1");
      expect(document.comments[1].id).toBe("c2");
      expect(document.comments[1].resolved).toBe(true);
    });

    it("should handle Drive API failure gracefully (return empty comments)", async () => {
      const { logger } = await import("../src/utils/logger.js");
      mockDocsGet.mockResolvedValue({
        data: {
          title: "Doc",
          body: { content: [] },
        },
      });
      mockCommentsList.mockRejectedValue(new Error("Drive API not authorized"));

      const { DocsReader } = await import("../src/google/docs-reader.js");
      const reader = new DocsReader(mockConfig);
      const document = await reader.fetchDocument("doc123");

      expect(document.comments).toEqual([]);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Failed to fetch comments"),
        expect.any(Object)
      );
    });

    it("should handle missing comment fields gracefully", async () => {
      mockDocsGet.mockResolvedValue({
        data: {
          title: "Doc",
          body: { content: [] },
        },
      });
      mockCommentsList.mockResolvedValue({
        data: {
          comments: [
            {
              // Minimal comment with missing fields
            },
          ],
        },
      });

      const { DocsReader } = await import("../src/google/docs-reader.js");
      const reader = new DocsReader(mockConfig);
      const document = await reader.fetchDocument("doc123");

      expect(document.comments).toHaveLength(1);
      expect(document.comments[0]).toEqual({
        id: "",
        content: "",
        author: "Unknown",
        resolved: false,
        anchorText: "",
        replies: [],
      });
    });

    it("should handle empty body content", async () => {
      mockDocsGet.mockResolvedValue({
        data: {
          title: "Empty Doc",
          body: {},
        },
      });
      mockCommentsList.mockResolvedValue({ data: { comments: [] } });

      const { DocsReader } = await import("../src/google/docs-reader.js");
      const reader = new DocsReader(mockConfig);
      const document = await reader.fetchDocument("doc123");

      expect(document.body).toBe("");
    });

    it("should handle undefined body", async () => {
      mockDocsGet.mockResolvedValue({
        data: {
          title: "No Body Doc",
        },
      });
      mockCommentsList.mockResolvedValue({ data: { comments: [] } });

      const { DocsReader } = await import("../src/google/docs-reader.js");
      const reader = new DocsReader(mockConfig);
      const document = await reader.fetchDocument("doc123");

      expect(document.body).toBe("");
    });

    it("should use correct API parameters", async () => {
      mockDocsGet.mockResolvedValue({
        data: {
          title: "Doc",
          body: { content: [] },
        },
      });
      mockCommentsList.mockResolvedValue({ data: { comments: [] } });

      const { DocsReader } = await import("../src/google/docs-reader.js");
      const reader = new DocsReader(mockConfig);
      await reader.fetchDocument("doc-id-123");

      expect(mockDocsGet).toHaveBeenCalledWith({
        documentId: "doc-id-123",
        suggestionsViewMode: "SUGGESTIONS_INLINE",
      });
      expect(mockCommentsList).toHaveBeenCalledWith({
        fileId: "doc-id-123",
        fields: "comments(id,content,author,resolved,quotedFileContent,replies)",
        includeDeleted: false,
      });
    });

    it("should default title to Untitled when missing", async () => {
      mockDocsGet.mockResolvedValue({
        data: {
          body: { content: [] },
        },
      });
      mockCommentsList.mockResolvedValue({ data: { comments: [] } });

      const { DocsReader } = await import("../src/google/docs-reader.js");
      const reader = new DocsReader(mockConfig);
      const document = await reader.fetchDocument("doc123");

      expect(document.title).toBe("Untitled");
    });
  });

  describe("replyToComment (Drive API)", () => {
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

    it("should not resolve comment by default", async () => {
      mockRepliesCreate.mockResolvedValue({ data: { id: "reply1" } });

      const { DocsReader } = await import("../src/google/docs-reader.js");
      const reader = new DocsReader(mockConfig);

      await reader.replyToComment("doc123", "comment1", "Reply without resolve");

      expect(mockRepliesCreate).toHaveBeenCalled();
      expect(mockCommentsUpdate).not.toHaveBeenCalled();
    });

    it("should resolve comment via Drive API", async () => {
      mockCommentsUpdate.mockResolvedValue({ data: {} });

      const { DocsReader } = await import("../src/google/docs-reader.js");
      const reader = new DocsReader(mockConfig);

      await reader.resolveComment("doc123", "comment1");

      expect(mockCommentsUpdate).toHaveBeenCalledWith({
        fileId: "doc123",
        commentId: "comment1",
        fields: "id,resolved",
        requestBody: {
          resolved: true,
        },
      });
    });

    it("should reply and resolve in one operation", async () => {
      mockRepliesCreate.mockResolvedValue({ data: { id: "reply1" } });
      mockCommentsUpdate.mockResolvedValue({ data: {} });

      const { DocsReader } = await import("../src/google/docs-reader.js");
      const reader = new DocsReader(mockConfig);

      await reader.replyToComment("doc123", "comment1", "Fixed!", true);

      expect(mockRepliesCreate).toHaveBeenCalledWith({
        fileId: "doc123",
        commentId: "comment1",
        fields: "id,content,author",
        requestBody: {
          content: "Fixed!",
        },
      });
      expect(mockCommentsUpdate).toHaveBeenCalledWith({
        fileId: "doc123",
        commentId: "comment1",
        fields: "id,resolved",
        requestBody: {
          resolved: true,
        },
      });
    });
  });
});
