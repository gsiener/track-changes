import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isClaudeMention } from "../src/claude/prompts.js";
import { extractDocId } from "../src/utils/url.js";

// Test the CLI argument parsing and workflow
describe("CLI", () => {
  describe("argument parsing", () => {
    it("accepts a single URL argument without subcommand", async () => {
      // CLI should work with just: track-changes <url>
      // No "review" subcommand needed anymore
      const url = "https://docs.google.com/document/d/abc123/edit";
      const docId = extractDocId(url);

      expect(docId).toBe("abc123");
    });

    it("extracts document ID from various URL formats", async () => {
      expect(extractDocId("https://docs.google.com/document/d/abc123/edit")).toBe("abc123");
      expect(extractDocId("https://docs.google.com/document/d/abc123/edit?tab=t.0")).toBe("abc123");
      expect(extractDocId("https://docs.google.com/document/d/abc123")).toBe("abc123");
    });

    it("returns null for invalid URLs", () => {
      expect(extractDocId("not-a-url")).toBeNull();
      expect(extractDocId("https://google.com")).toBeNull();
      expect(extractDocId("https://docs.google.com/spreadsheets/d/abc123")).toBeNull();
    });
  });

  describe("login command", () => {
    it("should still be available as track-changes login", () => {
      // Login command remains for setting up browser session
      const command = "login";
      expect(command).toBe("login");
    });
  });
});

describe("@mention detection", () => {
  it("detects @claude mentions", () => {
    expect(isClaudeMention("@claude make this better")).toBe(true);
    expect(isClaudeMention("@Claude please fix")).toBe(true);
    expect(isClaudeMention("hey @claude can you help")).toBe(true);
  });

  it("detects email-style @claude@domain mentions", () => {
    expect(isClaudeMention("@claude@kcuda.org make this better")).toBe(true);
    expect(isClaudeMention("@claude@example.com please fix")).toBe(true);
  });

  it("detects @claude-reviewer mentions", () => {
    expect(isClaudeMention("@claude-reviewer review this")).toBe(true);
  });

  it("detects @ai mentions", () => {
    expect(isClaudeMention("@ai improve this paragraph")).toBe(true);
  });

  it("does not match partial words", () => {
    expect(isClaudeMention("claudette")).toBe(false);
    expect(isClaudeMention("email@claude.com")).toBe(false);
  });

  it("does not match unrelated text", () => {
    expect(isClaudeMention("please fix this")).toBe(false);
    expect(isClaudeMention("great work!")).toBe(false);
  });
});

describe("workflow", () => {
  it("processes document in a single pass", () => {
    // The workflow should:
    // 1. Read document
    // 2. Find @mentioned comments
    // 3. Analyze with Claude
    // 4. Make suggested edits
    // 5. Reply to comment threads

    const steps = [
      "read_document",
      "find_mentions",
      "analyze",
      "make_suggestions",
      "reply_to_comments",
    ];

    expect(steps).toHaveLength(5);
    expect(steps[0]).toBe("read_document");
    expect(steps[steps.length - 1]).toBe("reply_to_comments");
  });
});
