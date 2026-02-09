import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import type { DocumentContent } from "../src/google/types.js";

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

// Mock Anthropic SDK
const mockCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      messages = {
        create: mockCreate,
      };
    },
  };
});

describe("DocumentAnalyzer", () => {
  const mockConfig = {
    anthropicApiKey: "sk-ant-test-key",
    googleServiceAccountPath: "./test.json",
    claudeGoogleEmail: "test@example.com",
    claudeGooglePassword: "password",
  };

  const testDocument: DocumentContent = {
    id: "doc123",
    title: "Test Document",
    body: "This is the document body with some text to review.",
    comments: [
      {
        id: "comment1",
        anchorText: "some text",
        content: "Please fix this",
        author: "Alice",
        resolved: false,
        replies: [],
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should parse valid JSON response with suggestions", async () => {
    const mockResponse = {
      usage: { input_tokens: 100, output_tokens: 50 },
      content: [
        {
          type: "text",
          text: JSON.stringify({
            suggestions: [
              {
                findText: "some text",
                replaceWith: "better text",
                rationale: "Improves clarity",
              },
            ],
            commentReplies: [
              {
                commentQuote: "Please fix this",
                reply: "Fixed!",
                resolve: true,
              },
            ],
            newComments: [],
          }),
        },
      ],
    };
    mockCreate.mockResolvedValue(mockResponse);

    const { DocumentAnalyzer } = await import("../src/claude/analyzer.js");
    const analyzer = new DocumentAnalyzer(mockConfig);
    const result = await analyzer.analyze(testDocument);

    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0].findText).toBe("some text");
    expect(result.suggestions[0].replaceWith).toBe("better text");
    expect(result.commentReplies).toHaveLength(1);
    expect(result.commentReplies[0].reply).toBe("Fixed!");
    expect(result.newComments).toHaveLength(0);
  });

  it("should parse response wrapped in ```json markdown fences", async () => {
    const jsonContent = JSON.stringify({
      suggestions: [{ findText: "old", replaceWith: "new" }],
      commentReplies: [],
      newComments: [],
    });
    const mockResponse = {
      usage: { input_tokens: 100, output_tokens: 50 },
      content: [
        {
          type: "text",
          text: `Here's my analysis:\n\n\`\`\`json\n${jsonContent}\n\`\`\`\n\nLet me know if you need changes.`,
        },
      ],
    };
    mockCreate.mockResolvedValue(mockResponse);

    const { DocumentAnalyzer } = await import("../src/claude/analyzer.js");
    const analyzer = new DocumentAnalyzer(mockConfig);
    const result = await analyzer.analyze(testDocument);

    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0].findText).toBe("old");
  });

  it("should parse response with bare ``` fences (no json specifier)", async () => {
    const jsonContent = JSON.stringify({
      suggestions: [],
      commentReplies: [],
      newComments: [{ anchorText: "text", comment: "Note here" }],
    });
    const mockResponse = {
      usage: { input_tokens: 100, output_tokens: 50 },
      content: [
        {
          type: "text",
          text: `\`\`\`\n${jsonContent}\n\`\`\``,
        },
      ],
    };
    mockCreate.mockResolvedValue(mockResponse);

    const { DocumentAnalyzer } = await import("../src/claude/analyzer.js");
    const analyzer = new DocumentAnalyzer(mockConfig);
    const result = await analyzer.analyze(testDocument);

    expect(result.newComments).toHaveLength(1);
    expect(result.newComments[0].comment).toBe("Note here");
  });

  it("should handle empty response (no suggestions/comments)", async () => {
    const mockResponse = {
      usage: { input_tokens: 100, output_tokens: 50 },
      content: [
        {
          type: "text",
          text: JSON.stringify({
            suggestions: [],
            commentReplies: [],
            newComments: [],
          }),
        },
      ],
    };
    mockCreate.mockResolvedValue(mockResponse);

    const { DocumentAnalyzer } = await import("../src/claude/analyzer.js");
    const analyzer = new DocumentAnalyzer(mockConfig);
    const result = await analyzer.analyze(testDocument);

    expect(result.suggestions).toHaveLength(0);
    expect(result.commentReplies).toHaveLength(0);
    expect(result.newComments).toHaveLength(0);
  });

  it("should extract JSON from response with text before and after", async () => {
    const mockResponse = {
      usage: { input_tokens: 100, output_tokens: 50 },
      content: [
        {
          type: "text",
          text: `I've analyzed the document. Here are my suggestions: {"suggestions": [{"findText": "test", "replaceWith": "tested"}], "commentReplies": [], "newComments": []} Hope this helps!`,
        },
      ],
    };
    mockCreate.mockResolvedValue(mockResponse);

    const { DocumentAnalyzer } = await import("../src/claude/analyzer.js");
    const analyzer = new DocumentAnalyzer(mockConfig);
    const result = await analyzer.analyze(testDocument);

    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0].findText).toBe("test");
  });

  it("should throw on invalid JSON response", async () => {
    const mockResponse = {
      usage: { input_tokens: 100, output_tokens: 50 },
      content: [
        {
          type: "text",
          text: "I cannot help with this document because it contains inappropriate content.",
        },
      ],
    };
    mockCreate.mockResolvedValue(mockResponse);

    const { DocumentAnalyzer } = await import("../src/claude/analyzer.js");
    const analyzer = new DocumentAnalyzer(mockConfig);

    await expect(analyzer.analyze(testDocument)).rejects.toThrow(
      /Invalid JSON from Claude/
    );
  });

  it("should throw on malformed JSON", async () => {
    const mockResponse = {
      usage: { input_tokens: 100, output_tokens: 50 },
      content: [
        {
          type: "text",
          text: '{"suggestions": [{"findText": "test"',
        },
      ],
    };
    mockCreate.mockResolvedValue(mockResponse);

    const { DocumentAnalyzer } = await import("../src/claude/analyzer.js");
    const analyzer = new DocumentAnalyzer(mockConfig);

    await expect(analyzer.analyze(testDocument)).rejects.toThrow(
      /Invalid JSON from Claude/
    );
  });

  it("should throw when schema validation fails (missing required fields)", async () => {
    const mockResponse = {
      usage: { input_tokens: 100, output_tokens: 50 },
      content: [
        {
          type: "text",
          text: JSON.stringify({
            suggestions: [{ findText: "test" }], // missing replaceWith
            commentReplies: [],
            newComments: [],
          }),
        },
      ],
    };
    mockCreate.mockResolvedValue(mockResponse);

    const { DocumentAnalyzer } = await import("../src/claude/analyzer.js");
    const analyzer = new DocumentAnalyzer(mockConfig);

    await expect(analyzer.analyze(testDocument)).rejects.toThrow(
      /Invalid response schema/
    );
  });

  it("should throw when response has wrong structure", async () => {
    const mockResponse = {
      usage: { input_tokens: 100, output_tokens: 50 },
      content: [
        {
          type: "text",
          text: JSON.stringify({
            edits: [], // wrong key name
          }),
        },
      ],
    };
    mockCreate.mockResolvedValue(mockResponse);

    const { DocumentAnalyzer } = await import("../src/claude/analyzer.js");
    const analyzer = new DocumentAnalyzer(mockConfig);

    await expect(analyzer.analyze(testDocument)).rejects.toThrow(
      /Invalid response schema/
    );
  });

  it("should throw when there is no text content in response", async () => {
    const mockResponse = {
      usage: { input_tokens: 100, output_tokens: 0 },
      content: [{ type: "tool_use", id: "123", name: "test", input: {} }],
    };
    mockCreate.mockResolvedValue(mockResponse);

    const { DocumentAnalyzer } = await import("../src/claude/analyzer.js");
    const analyzer = new DocumentAnalyzer(mockConfig);

    await expect(analyzer.analyze(testDocument)).rejects.toThrow(
      /No text response from Claude/
    );
  });

  it("should log API usage and estimated cost", async () => {
    const { logger } = await import("../src/utils/logger.js");
    const mockResponse = {
      usage: { input_tokens: 1000, output_tokens: 500 },
      content: [
        {
          type: "text",
          text: JSON.stringify({
            suggestions: [],
            commentReplies: [],
            newComments: [],
          }),
        },
      ],
    };
    mockCreate.mockResolvedValue(mockResponse);

    const { DocumentAnalyzer } = await import("../src/claude/analyzer.js");
    const analyzer = new DocumentAnalyzer(mockConfig);
    await analyzer.analyze(testDocument);

    expect(logger.trace).toHaveBeenCalledWith(
      "API usage",
      expect.objectContaining({
        inputTokens: 1000,
        outputTokens: 500,
        totalTokens: 1500,
      })
    );
  });

  it("should pass focus prompt to Claude when provided", async () => {
    const mockResponse = {
      usage: { input_tokens: 100, output_tokens: 50 },
      content: [
        {
          type: "text",
          text: JSON.stringify({
            suggestions: [],
            commentReplies: [],
            newComments: [],
          }),
        },
      ],
    };
    mockCreate.mockResolvedValue(mockResponse);

    const { DocumentAnalyzer } = await import("../src/claude/analyzer.js");
    const analyzer = new DocumentAnalyzer(mockConfig);
    await analyzer.analyze(testDocument, "Focus on grammar");

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            content: expect.stringContaining("Focus on grammar"),
          }),
        ]),
      })
    );
  });

  it("should handle optional fields in suggestions", async () => {
    const mockResponse = {
      usage: { input_tokens: 100, output_tokens: 50 },
      content: [
        {
          type: "text",
          text: JSON.stringify({
            suggestions: [
              {
                findText: "old text",
                replaceWith: "new text",
                contextBefore: "some context",
                rationale: "Better wording",
              },
              {
                findText: "another",
                replaceWith: "other",
                // no contextBefore or rationale
              },
            ],
            commentReplies: [],
            newComments: [],
          }),
        },
      ],
    };
    mockCreate.mockResolvedValue(mockResponse);

    const { DocumentAnalyzer } = await import("../src/claude/analyzer.js");
    const analyzer = new DocumentAnalyzer(mockConfig);
    const result = await analyzer.analyze(testDocument);

    expect(result.suggestions).toHaveLength(2);
    expect(result.suggestions[0].contextBefore).toBe("some context");
    expect(result.suggestions[0].rationale).toBe("Better wording");
    expect(result.suggestions[1].contextBefore).toBeUndefined();
    expect(result.suggestions[1].rationale).toBeUndefined();
  });
});
