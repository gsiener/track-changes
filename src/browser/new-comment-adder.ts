/**
 * NewCommentAdder - Adds new comments anchored to text in Google Docs.
 *
 * Extracted from DocsWriter for better modularity and testability.
 */

import type { Page } from "playwright";
import type { NewComment } from "../claude/types.js";
import { selectors } from "./selectors.js";
import { withRetry } from "./retry.js";
import { logger } from "../utils/logger.js";
import { TIMEOUTS, findFirst, fillFirst } from "./page-helpers.js";

// Selectors for find dialog and comment inputs
const SELECTORS = {
  findInput: [
    ".docs-findinput-input",
    'input[aria-label="Find"]',
    'input[placeholder*="Find"]',
  ],
};

export class NewCommentAdder {
  constructor(private page: Page) {}

  async addNewComment(comment: NewComment): Promise<void> {
    await withRetry(async () => {
      // Find the anchor text using Find dialog
      await this.openFindReplaceDialog();
      await fillFirst(this.page, SELECTORS.findInput, comment.anchorText, {
        logPrefix: "Find input",
      });
      await this.page.waitForTimeout(TIMEOUTS.INPUT_SETTLE);
      await this.page.keyboard.press("Enter");
      await this.page.waitForTimeout(TIMEOUTS.SEARCH_COMPLETE);
      await this.page.keyboard.press("Escape");
      await this.page.waitForTimeout(TIMEOUTS.KEY_PRESS);

      // Add comment with keyboard shortcut
      await this.page.keyboard.press("Meta+Alt+m");
      await this.page.waitForTimeout(TIMEOUTS.MENU_ACTION);

      // Fill comment textarea
      const textarea = await findFirst(
        this.page,
        [
          selectors.commentTextarea,
          'textarea[aria-label*="comment"]',
          ".docos-input-textarea",
        ],
        { logPrefix: "Comment textarea" }
      );

      if (textarea) {
        await textarea.fill(comment.comment);
        await this.page.waitForTimeout(TIMEOUTS.INPUT_SETTLE);

        // Submit
        const submitBtn = await findFirst(
          this.page,
          [
            selectors.submitCommentButton,
            'button[aria-label*="Comment"]',
            'button:has-text("Comment")',
          ],
          { logPrefix: "Submit button" }
        );

        if (submitBtn) {
          await submitBtn.click();
        } else {
          await this.page.keyboard.press("Meta+Enter");
        }
        await this.page.waitForTimeout(TIMEOUTS.BUTTON_ACTION);
      } else {
        logger.warn("Comment textarea not found");
      }
    }, `Add comment on: "${comment.anchorText.slice(0, 30)}..."`);
  }

  private async openFindReplaceDialog(): Promise<void> {
    await this.page.click('div[id="docs-edit-menu"]');
    await this.page.waitForTimeout(TIMEOUTS.MENU_OPEN);
    await this.page.click('span:has-text("Find and replace")');
    await this.page.waitForTimeout(TIMEOUTS.MENU_ACTION);
  }
}
