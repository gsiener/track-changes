/**
 * NewCommentAdder - Adds new comments anchored to text in Google Docs.
 *
 * Migrated to use agent-browser's snapshot-based element finding for more
 * stable interactions with Google Docs' complex UI.
 */

import type { AgentBrowserClient } from "./agent-browser-client.js";
import type { NewComment } from "../claude/types.js";
import { withRetry } from "./retry.js";
import { logger } from "../utils/logger.js";
import {
  TIMEOUTS,
  wait,
  clickByMatcher,
  fillByMatcher,
  clickBySelector,
  fillBySelector,
  findElementByMatcher,
} from "./snapshot-helpers.js";
import { matchers } from "./matchers.js";

// CSS selector fallbacks for when snapshot matching doesn't work
const SELECTOR_FALLBACKS = {
  findInput: [
    ".docs-findinput-input",
    'input[aria-label="Find"]',
    'input[placeholder*="Find"]',
  ],
  commentTextarea: [
    'textarea[aria-label="Add a comment"]',
    'textarea[aria-label*="comment"]',
    ".docos-input-textarea",
  ],
  submitCommentButton: [
    'button[aria-label="Comment"]',
    'button[aria-label*="Comment"]',
    'button:has-text("Comment")',
  ],
  editMenu: [
    'div[id="docs-edit-menu"]',
    '[aria-label="Edit"]',
  ],
  findAndReplace: [
    'span:has-text("Find and replace")',
    '[aria-label*="Find and replace"]',
  ],
};

export class NewCommentAdder {
  constructor(private client: AgentBrowserClient) {}

  async addNewComment(comment: NewComment): Promise<void> {
    await withRetry(async () => {
      const page = this.client.getPage();

      // Find the anchor text using Find dialog
      await this.openFindReplaceDialog();

      // Fill find input
      try {
        await fillByMatcher(this.client, matchers.findInput, comment.anchorText, {
          logPrefix: "Find input",
        });
      } catch {
        await fillBySelector(this.client, SELECTOR_FALLBACKS.findInput, comment.anchorText, {
          logPrefix: "Find input (fallback)",
        });
      }
      await wait(TIMEOUTS.INPUT_SETTLE);

      // Trigger search and close find dialog
      await page.keyboard.press("Enter");
      await wait(TIMEOUTS.SEARCH_COMPLETE);
      await page.keyboard.press("Escape");
      await wait(TIMEOUTS.KEY_PRESS);

      // Add comment with keyboard shortcut (most stable method)
      await page.keyboard.press("Meta+Alt+m");
      await wait(TIMEOUTS.MENU_ACTION);

      // Fill comment textarea
      await this.fillCommentTextarea(comment.comment);
      await wait(TIMEOUTS.INPUT_SETTLE);

      // Submit comment
      await this.submitComment();
      await wait(TIMEOUTS.BUTTON_ACTION);

    }, `Add comment on: "${comment.anchorText.slice(0, 30)}..."`);
  }

  private async openFindReplaceDialog(): Promise<void> {
    // Try snapshot-based clicking first, fall back to selector
    try {
      await clickByMatcher(this.client, matchers.editMenu, { logPrefix: "Edit menu" });
    } catch {
      await clickBySelector(this.client, SELECTOR_FALLBACKS.editMenu, { logPrefix: "Edit menu (fallback)" });
    }
    await wait(TIMEOUTS.MENU_OPEN);

    // Click Find and Replace menu item
    try {
      await clickByMatcher(this.client, matchers.findAndReplaceMenuItem, { logPrefix: "Find and replace" });
    } catch {
      await clickBySelector(this.client, SELECTOR_FALLBACKS.findAndReplace, { logPrefix: "Find and replace (fallback)" });
    }
    await wait(TIMEOUTS.MENU_ACTION);
  }

  private async fillCommentTextarea(comment: string): Promise<void> {
    // Try snapshot-based first
    try {
      await fillByMatcher(this.client, matchers.commentTextarea, comment, {
        logPrefix: "Comment textarea",
      });
      return;
    } catch {
      logger.debug("Snapshot-based comment textarea fill failed, trying selector fallback");
    }

    // Fall back to selector-based
    try {
      await fillBySelector(this.client, SELECTOR_FALLBACKS.commentTextarea, comment, {
        logPrefix: "Comment textarea (fallback)",
      });
      return;
    } catch {
      logger.warn("Could not find comment textarea");
      throw new Error("Comment textarea not found");
    }
  }

  private async submitComment(): Promise<void> {
    const page = this.client.getPage();

    // Try snapshot-based first
    try {
      await clickByMatcher(this.client, matchers.submitCommentButton, { logPrefix: "Submit comment" });
      return;
    } catch {
      logger.debug("Snapshot-based submit button click failed, trying selector fallback");
    }

    // Try selector-based
    try {
      await clickBySelector(this.client, SELECTOR_FALLBACKS.submitCommentButton, {
        logPrefix: "Submit comment (fallback)",
      });
      return;
    } catch {
      logger.debug("Selector-based submit button click failed, trying keyboard shortcut");
    }

    // Final fallback: keyboard shortcut
    await page.keyboard.press("Meta+Enter");
    logger.debug("Comment submitted via keyboard shortcut");
  }
}
