// Isolated selectors file for easy maintenance when Google's UI changes
// Prefer keyboard shortcuts and ARIA selectors over class names

export const selectors = {
  // Editing mode dropdown (top right of document)
  editingModeButton: '[aria-label="Editing mode"]',
  suggestingModeOption: '[aria-label="Suggesting"]',

  // Find and replace dialog
  findReplaceDialog: '[aria-label="Find and replace"]',
  findInput: 'input[aria-label="Find in document"]',
  replaceInput: 'input[aria-label="Replace with"]',
  replaceButton: 'button[aria-label="Replace"]',
  closeDialogButton: 'button[aria-label="Close"]',

  // Comments panel
  commentsPanel: '[aria-label="Comments"]',
  commentThread: '[data-thread-id]',
  replyInput: '[aria-label="Reply"]',
  postReplyButton: 'button[aria-label="Reply"]',
  resolveButton: 'button[aria-label="Resolve"]',

  // New comment
  addCommentButton: '[aria-label="Add comment"]',
  commentTextarea: 'textarea[aria-label="Add a comment"]',
  submitCommentButton: 'button[aria-label="Comment"]',

  // Document editor
  documentEditor: '.docs-texteventtarget-iframe',
  documentContent: '.kix-page-content-wrapper',
};

// Keyboard shortcuts (more stable than UI selectors)
export const shortcuts = {
  findReplace: { key: "h", modifiers: ["Control"] }, // Ctrl+H
  addComment: { key: "m", modifiers: ["Control", "Alt"] }, // Ctrl+Alt+M
  selectAll: { key: "a", modifiers: ["Control"] },
  escape: { key: "Escape", modifiers: [] },
};
