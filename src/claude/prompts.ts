import type { DocumentContent } from "../google/types.js";

export function buildSystemPrompt(): string {
  return `You are a collaborative document reviewer named Claude. You help improve documents by suggesting text edits and responding to comments.

## Task Assignment via @mentions

When a comment contains @claude, @Claude, or similar mention, that comment is a direct task assignment to you. You MUST:
1. Understand what the commenter is asking you to do
2. Execute the task (usually by creating a suggestion)
3. Reply to the comment with a ONE SENTENCE summary of what you did

Example:
- Comment: "@claude make this more concise"
- Your action: Create a suggestion to shorten the text
- Your reply: "Made this sentence more concise by removing redundant phrases."

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
- For @mentioned comments: ALWAYS reply with what action you took. Keep reply to 1 sentence.
- For other comments asking questions: answer helpfully in commentReplies.
- Set resolve: false for @mentions (let the human verify and resolve).
- Use newComments sparingly for important observations not tied to existing discussions.
- Be concise. Quality over quantity.

Output only valid JSON, no markdown fences or explanation.`;
}

// Check if a comment is @mentioning Claude
function isClaudeMention(text: string): boolean {
  const mentionPatterns = [
    /@claude\b/i,
    /@claude-reviewer\b/i,
    /@ai\b/i,
  ];
  return mentionPatterns.some(pattern => pattern.test(text));
}

export function buildUserPrompt(
  document: DocumentContent,
  focusPrompt?: string
): string {
  let prompt = `Please review this document and provide suggestions.

## Document: ${document.title}

${document.body}`;

  // Separate @mentioned comments (task assignments) from regular comments
  const taskComments = document.comments.filter(c => !c.resolved && isClaudeMention(c.content));
  const otherComments = document.comments.filter(c => !c.resolved && !isClaudeMention(c.content));

  // Show task assignments first (these are priority)
  if (taskComments.length > 0) {
    prompt += `\n\n## 🎯 Tasks Assigned to You (@mentions)\n`;
    prompt += `\nThese comments contain @claude mentions - you MUST process each one and reply with what you did.\n`;

    for (const comment of taskComments) {
      prompt += `\n### TASK: Comment by ${comment.author}`;
      if (comment.anchorText) {
        prompt += ` on "${comment.anchorText}"`;
      }
      prompt += `\n${comment.content}`;

      if (comment.replies.length > 0) {
        prompt += `\nPrevious replies:`;
        for (const reply of comment.replies) {
          prompt += `\n- ${reply.author}: ${reply.content}`;
        }
      }
    }
  }

  // Show other comments
  if (otherComments.length > 0) {
    prompt += `\n\n## Open Comments\n`;
    for (const comment of otherComments) {
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
