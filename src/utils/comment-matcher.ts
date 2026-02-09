import type { CommentThread } from "../google/types.js";

export interface CommentMatchResult {
  comment: CommentThread | null;
  error?: string;
}

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function scoreMatch(content: string, quote: string): number {
  const normalizedContent = normalizeText(content);
  const normalizedQuote = normalizeText(quote);

  if (!normalizedContent || !normalizedQuote) return 0;
  if (normalizedContent === normalizedQuote) return 3;
  if (normalizedContent.includes(normalizedQuote)) return 2;
  if (normalizedQuote.includes(normalizedContent)) return 1;
  return 0;
}

export function matchCommentForReply(
  comments: CommentThread[],
  commentQuote: string
): CommentMatchResult {
  if (!commentQuote.trim()) {
    return { comment: null, error: "Empty comment quote provided for reply matching" };
  }

  const unresolvedComments = comments.filter((comment) => !comment.resolved);
  if (unresolvedComments.length === 0) {
    return { comment: null, error: "No unresolved comments available for reply matching" };
  }

  let bestScore = 0;
  let bestMatches: CommentThread[] = [];

  for (const comment of unresolvedComments) {
    const score = scoreMatch(comment.content, commentQuote);
    if (score > bestScore) {
      bestScore = score;
      bestMatches = [comment];
    } else if (score === bestScore && score > 0) {
      bestMatches.push(comment);
    }
  }

  if (bestScore === 0 || bestMatches.length === 0) {
    return {
      comment: null,
      error: `No unresolved comment matches quote: "${commentQuote.slice(0, 50)}..."`,
    };
  }

  if (bestMatches.length > 1) {
    return {
      comment: null,
      error: `Multiple unresolved comments match quote: "${commentQuote.slice(0, 50)}..."`,
    };
  }

  return { comment: bestMatches[0] };
}
