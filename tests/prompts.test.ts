import { describe, it, expect } from "vitest";
import { buildSystemPrompt, buildUserPrompt } from "../src/claude/prompts.js";
import type { DocumentContent } from "../src/google/types.js";

describe("buildSystemPrompt", () => {
  it("should include JSON schema", () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain("suggestions");
    expect(prompt).toContain("commentReplies");
    expect(prompt).toContain("newComments");
  });

  it("should include guidelines", () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain("exact text matches");
    expect(prompt).toContain("resolve");
  });

  it("should request JSON output", () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain("valid JSON");
  });
});

describe("buildUserPrompt", () => {
  const baseDocument: DocumentContent = {
    id: "doc123",
    title: "Test Document",
    body: "This is the document body.",
    comments: [],
  };

  it("should include document title and body", () => {
    const prompt = buildUserPrompt(baseDocument);
    expect(prompt).toContain("Test Document");
    expect(prompt).toContain("This is the document body.");
  });

  it("should include open comments", () => {
    const docWithComments: DocumentContent = {
      ...baseDocument,
      comments: [
        {
          id: "comment1",
          anchorText: "some text",
          content: "What do you think about this?",
          author: "Alice",
          resolved: false,
          replies: [],
        },
      ],
    };

    const prompt = buildUserPrompt(docWithComments);
    expect(prompt).toContain("Open Comments");
    expect(prompt).toContain("Alice");
    expect(prompt).toContain("What do you think about this?");
    expect(prompt).toContain("some text");
  });

  it("should exclude resolved comments", () => {
    const docWithResolvedComment: DocumentContent = {
      ...baseDocument,
      comments: [
        {
          id: "comment1",
          anchorText: "some text",
          content: "This was resolved",
          author: "Alice",
          resolved: true,
          replies: [],
        },
      ],
    };

    const prompt = buildUserPrompt(docWithResolvedComment);
    expect(prompt).not.toContain("This was resolved");
  });

  it("should include comment replies", () => {
    const docWithReplies: DocumentContent = {
      ...baseDocument,
      comments: [
        {
          id: "comment1",
          anchorText: "some text",
          content: "Original question",
          author: "Alice",
          resolved: false,
          replies: [
            { content: "Good point!", author: "Bob" },
          ],
        },
      ],
    };

    const prompt = buildUserPrompt(docWithReplies);
    expect(prompt).toContain("Bob: Good point!");
  });

  it("should include focus instructions when provided", () => {
    const prompt = buildUserPrompt(baseDocument, "Focus on clarity and tone");
    expect(prompt).toContain("Focus Instructions");
    expect(prompt).toContain("Focus on clarity and tone");
  });

  it("should not include focus section when not provided", () => {
    const prompt = buildUserPrompt(baseDocument);
    expect(prompt).not.toContain("Focus Instructions");
  });
});
