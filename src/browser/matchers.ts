/**
 * Element matchers for finding elements in accessibility tree snapshots.
 *
 * This replaces CSS selectors with accessibility-based matching, which is:
 * - More stable across Google UI changes
 * - Based on accessible names (what users see/hear)
 * - Uses refs from agent-browser snapshots for deterministic selection
 */

export interface ElementMatcher {
  /** ARIA role to match (e.g., "button", "textbox", "menuitem") */
  role?: string | string[];
  /** Accessible name to match (aria-label, button text, etc.) */
  name?: string | RegExp;
  /** Inner text content to match */
  text?: string | RegExp;
  /** Whether element should be focused */
  focused?: boolean;
}

/**
 * Match a snapshot element against a matcher.
 */
export function matchesElement(
  element: { role: string; name?: string; text?: string; focused?: boolean },
  matcher: ElementMatcher
): boolean {
  // Check role
  if (matcher.role) {
    const roles = Array.isArray(matcher.role) ? matcher.role : [matcher.role];
    if (!roles.some((r) => element.role.toLowerCase() === r.toLowerCase())) {
      return false;
    }
  }

  // Check name
  if (matcher.name) {
    if (!element.name) return false;
    if (matcher.name instanceof RegExp) {
      if (!matcher.name.test(element.name)) return false;
    } else if (!element.name.toLowerCase().includes(matcher.name.toLowerCase())) {
      return false;
    }
  }

  // Check text
  if (matcher.text) {
    const textToMatch = element.text || element.name || "";
    if (matcher.text instanceof RegExp) {
      if (!matcher.text.test(textToMatch)) return false;
    } else if (textToMatch.toLowerCase() !== matcher.text.toLowerCase()) {
      return false;
    }
  }

  // Check focused
  if (matcher.focused !== undefined && element.focused !== matcher.focused) {
    return false;
  }

  return true;
}

/**
 * Element matchers for Google Docs UI elements.
 * Each key maps to an array of matchers tried in order (fallback pattern).
 */
export const matchers: Record<string, ElementMatcher[]> = {
  // Editing mode dropdown (top right of document)
  editingModeButton: [
    { name: "Editing mode" },
    { name: /mode/i, role: "button" },
    { name: /editing/i, role: "button" },
  ],

  suggestingModeOption: [
    { name: /Suggesting/i },
    { text: "Suggesting" },
    { role: "menuitem", name: /suggest/i },
  ],

  // Edit menu
  editMenu: [
    { role: "menuitem", name: /^Edit$/i },
    { text: "Edit", role: "menuitem" },
  ],

  findAndReplaceMenuItem: [
    { role: "menuitem", text: /Find and replace/i },
    { name: /Find and replace/i },
  ],

  // Find and replace dialog inputs
  findInput: [
    { role: "textbox", name: /find/i },
    { role: "combobox", name: /find/i },
    { role: "searchbox" },
  ],

  replaceInput: [
    { role: "textbox", name: /replace/i },
    { role: "combobox", name: /replace/i },
  ],

  replaceButton: [
    { role: "button", text: "Replace" },
    { role: "button", name: /^Replace$/i },
  ],

  replaceAllButton: [
    { role: "button", text: "Replace all" },
    { role: "button", name: /Replace all/i },
  ],

  // Dialog close
  closeDialogButton: [
    { role: "button", name: /close/i },
    { role: "button", name: /dismiss/i },
  ],

  // Comment-related
  commentTextarea: [
    { role: "textbox", name: /comment/i },
    { role: "textbox", name: /reply/i },
  ],

  submitCommentButton: [
    { role: "button", name: /^Comment$/i },
    { role: "button", text: "Comment" },
  ],

  // Dialog dismissal buttons
  understoodButton: [
    { role: "button", text: "I understand" },
    { role: "button", name: /understand/i },
  ],

  gotItButton: [
    { role: "button", text: "Got it" },
    { role: "button", name: /got it/i },
  ],
};

// Keyboard shortcuts (more stable than UI elements)
export const shortcuts = {
  findReplace: { key: "h", modifiers: ["Control"] }, // Ctrl+H
  addComment: { key: "m", modifiers: ["Control", "Alt"] }, // Ctrl+Alt+M
  selectAll: { key: "a", modifiers: ["Control"] },
  escape: { key: "Escape", modifiers: [] },
} as const;
