/**
 * DocsWriter - Orchestrates applying Claude's suggestions to Google Docs.
 *
 * Uses browser automation because Google Docs API cannot create suggestions.
 * This is inherently fragile - when Google changes their UI, selectors may break.
 *
 * Strategy:
 * - Use multiple fallback selectors for each element
 * - Prefer ARIA labels over class names (more stable)
 * - Take screenshots on failure for debugging
 *
 * Note: Comment replies are now handled via Drive API (see cli.ts), not browser.
 */

import type { Page } from "playwright";
import type { ReviewResponse } from "../claude/types.js";
import { selectors } from "./selectors.js";
import { withRetry } from "./retry.js";
import { logger } from "../utils/logger.js";
import { TIMEOUTS, clickFirst, dismissDialogs } from "./page-helpers.js";
import { mkdir } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { SuggestionApplier } from "./suggestion-applier.js";
import { NewCommentAdder } from "./new-comment-adder.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS_DIR = join(__dirname, "../../screenshots");

// Selector groups for mode switching
const SELECTORS = {
  modeButton: [
    selectors.editingModeButton,
    "#docs-toolbar-mode-switcher",
    '[aria-label*="mode"]',
    '[data-tooltip*="Editing"]',
  ],
  suggestingOption: [
    selectors.suggestingModeOption,
    '[aria-label*="Suggesting"]',
    '[data-value="suggesting"]',
  ],
};

export class DocsWriter {
  private suggestionApplier: SuggestionApplier;
  private newCommentAdder: NewCommentAdder;

  constructor(private page: Page) {
    this.suggestionApplier = new SuggestionApplier(page);
    this.newCommentAdder = new NewCommentAdder(page);
  }

  async navigateToDocument(url: string): Promise<void> {
    logger.info("Navigating to document", { url });
    await this.page.goto(url, { waitUntil: "load", timeout: 60000 });
    await this.page.waitForTimeout(TIMEOUTS.PAGE_LOAD);

    // Dismiss any onboarding dialogs that block interaction
    await dismissDialogs(this.page);
    await this.page.waitForTimeout(TIMEOUTS.KEY_PRESS);
  }

  async enableSuggestionMode(): Promise<void> {
    logger.info("Enabling suggestion mode");

    await withRetry(async () => {
      await this.takeScreenshot("before-suggestion-mode");

      // Click mode dropdown
      await clickFirst(this.page, SELECTORS.modeButton, {
        logPrefix: "Mode button",
      });
      await this.page.waitForTimeout(TIMEOUTS.MENU_OPEN);

      await this.takeScreenshot("after-mode-click");

      // Select "Suggesting" option
      await clickFirst(this.page, SELECTORS.suggestingOption, {
        logPrefix: "Suggesting option",
      });
      await this.page.waitForTimeout(TIMEOUTS.BUTTON_ACTION);
    }, "Enable suggestion mode");

    logger.info("Suggestion mode enabled");
  }

  async applyAllChanges(response: ReviewResponse): Promise<void> {
    // Apply text suggestions
    for (let i = 0; i < response.suggestions.length; i++) {
      const suggestion = response.suggestions[i];
      logger.info(`Applying suggestion ${i + 1}/${response.suggestions.length}`, {
        findText: suggestion.findText.slice(0, 50),
      });

      try {
        await this.suggestionApplier.applySuggestion(suggestion);
      } catch (error) {
        logger.error(`Failed to apply suggestion ${i + 1}`, {
          error: String(error),
          findText: suggestion.findText.slice(0, 50),
        });
        await this.takeScreenshot(`suggestion-${i + 1}-failed`);
      }
    }

    // Note: Comment replies are now handled via Drive API in cli.ts
    // The commentReplies array should be empty when passed to this method
    if (response.commentReplies.length > 0) {
      logger.warn(
        "Comment replies passed to DocsWriter - these should be handled via Drive API",
        { count: response.commentReplies.length }
      );
    }

    // Add new comments
    for (let i = 0; i < response.newComments.length; i++) {
      const comment = response.newComments[i];
      logger.info(`Adding new comment ${i + 1}/${response.newComments.length}`);

      try {
        await this.newCommentAdder.addNewComment(comment);
      } catch (error) {
        logger.error(`Failed to add comment ${i + 1}`, { error: String(error) });
        await this.takeScreenshot(`new-comment-${i + 1}-failed`);
      }
    }
  }

  private async takeScreenshot(name: string): Promise<void> {
    try {
      await mkdir(SCREENSHOTS_DIR, { recursive: true });
      const path = join(SCREENSHOTS_DIR, `${name}-${Date.now()}.png`);
      await this.page.screenshot({ path, fullPage: true });
      logger.info("Screenshot saved", { path });
    } catch (error) {
      logger.warn("Failed to save screenshot", { error: String(error) });
    }
  }
}
