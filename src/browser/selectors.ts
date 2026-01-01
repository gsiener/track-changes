// Isolated selectors file for easy maintenance when Google's UI changes
// Prefer keyboard shortcuts and ARIA selectors over class names

export const selectors = {
  // Editing mode dropdown (top right of document)
  editingModeButton: '[aria-label="Editing mode"]',
  suggestingModeOption: '[aria-label="Suggesting"]',

  // Find and replace dialog - multiple selectors for robustness
  findReplaceDialog: '.docs-findinput-container, [role="dialog"]:has-text("Find"), .docs-findbar',
  findInput: '.docs-findinput-input, input[aria-label="Find"], input[name="find"]',
  replaceInput: '.docs-replaceinput-input, input[aria-label="Replace with"], input[name="replace"]',
  replaceButton: 'button:has-text("Replace"), [aria-label="Replace"]',
  closeDialogButton: '[aria-label="Close"], button:has-text("Close")',

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
