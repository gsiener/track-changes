import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import type Anthropic from "@anthropic-ai/sdk";
import type { ReviewResponse } from "./types.js";

const CONVERSATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../conversations");

/** Earlier turns of the conversation with Claude about a document. */
export function loadConversation(docId: string, dir = CONVERSATIONS_DIR): Anthropic.MessageParam[] {
  const file = join(dir, `${docId}.json`);
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf-8")) : [];
}

/** Add a review, as applied, to the document's conversation. */
export function saveReview(docId: string, applied: ReviewResponse, dir = CONVERSATIONS_DIR): void {
  const conversation: Anthropic.MessageParam[] = [
    ...loadConversation(docId, dir),
    { role: "user", content: "Please review this document. [Earlier version omitted]" },
    { role: "assistant", content: JSON.stringify(applied) },
  ];
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${docId}.json`), JSON.stringify(conversation, null, 2));
}
