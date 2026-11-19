import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { loadConversation, saveReview } from "../src/claude/conversation.js";

describe("conversation", () => {
  const first = {
    suggestions: [{ findText: "old", replaceWith: "new" }],
    commentReplies: [],
    newComments: [],
  };
  const second = {
    suggestions: [],
    commentReplies: [{ commentQuote: "@claude tighten this", reply: "Tightened.", resolve: false }],
    newComments: [],
  };
  let tmp: string;
  let dir: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "track-changes-"));
    dir = join(tmp, "conversations");
  });

  afterEach(() => rmSync(tmp, { recursive: true }));

  it("is empty for a document that has not been reviewed", () => {
    expect(loadConversation("doc123", dir)).toEqual([]);
  });

  it("restores each document's reviews as alternating turns", () => {
    saveReview("doc123", first, dir);
    saveReview("doc123", second, dir);
    saveReview("other", second, dir);

    const conversation = loadConversation("doc123", dir);

    expect(conversation.map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant"]);
    expect(JSON.parse(conversation[1].content as string)).toEqual(first);
    expect(JSON.parse(conversation[3].content as string)).toEqual(second);
  });
});
