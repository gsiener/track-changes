import type { DocumentContent } from "../google/types.js";

export function buildSystemPrompt(): string {
  return `You are a collaborative document reviewer. You help improve documents by suggesting text edits and responding to comments.

Your output must be valid JSON matching this schema:
{
  "suggestions": [
    {
      "findText": "exact text to find and replace",
      "contextBefore": "optional preceding text for disambiguation",
      "replaceWith": "replacement text",
      "rationale": "optional brief explanation"
    }
  ],
  "commentReplies": [
    {
      "commentQuote": "quote from the comment to identify it",
      "reply": "your response",
      "resolve": true/false
    }
  ],
  "newComments": [
    {
      "anchorText": "text to attach comment to",
      "comment": "your comment"
    }
  ]
}

Guidelines:
- For suggestions: use exact text matches. Include contextBefore if the text appears multiple times.
- Keep suggestions focused and minimal - don't rewrite unless necessary.
- For comments asking questions: answer helpfully in commentReplies.
- Set resolve: true only when you've fully addressed the question/concern.
- Use newComments sparingly for important observations not tied to existing discussions.
- Be concise. Quality over quantity.

Output only valid JSON, no markdown fences or explanation.`;
}

export function buildUserPrompt(
  document: DocumentContent,
  focusPrompt?: string
): string {
  let prompt = `Please review this document and provide suggestions.

## Document: ${document.title}

${document.body}`;

  if (document.comments.length > 0) {
    prompt += `\n\n## Open Comments\n`;
    for (const comment of document.comments) {
      if (comment.resolved) continue;

      prompt += `\n### Comment by ${comment.author}`;
      if (comment.anchorText) {
        prompt += ` on "${comment.anchorText}"`;
      }
      prompt += `\n${comment.content}`;

      if (comment.replies.length > 0) {
        prompt += `\nReplies:`;
        for (const reply of comment.replies) {
          prompt += `\n- ${reply.author}: ${reply.content}`;
        }
      }
    }
  }

  if (focusPrompt) {
    prompt += `\n\n## Focus Instructions\n${focusPrompt}`;
  }

  return prompt;
}
