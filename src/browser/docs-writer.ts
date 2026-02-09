/**
 * DocsWriter - Orchestrates applying Claude's suggestions to Google Docs.
 *
 * Uses browser automation because Google Docs API cannot create suggestions.
 * This is inherently fragile - when Google changes their UI, selectors may break.
 *
 * Migrated to use agent-browser for more stable interactions via:
 * - Accessibility tree snapshots with refs
 * - Fallback to CSS selectors when snapshots fail
 * - Screenshot debugging on failure
 *
 * Note: Comment replies are handled via Drive API (see cli.ts), not browser.
 */

import type { AgentBrowserClient } from "./agent-browser-client.js";
import type { ReviewResponse } from "../claude/types.js";
import { withRetry } from "./retry.js";
import { logger } from "../utils/logger.js";
import {
  TIMEOUTS,
  wait,
  dismissDialogs,
  clickByMatcher,
  clickBySelector,
} from "./snapshot-helpers.js";
import { matchers } from "./matchers.js";
import { mkdir } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { SuggestionApplier } from "./suggestion-applier.js";
import { NewCommentAdder } from "./new-comment-adder.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS_DIR = join(__dirname, "../../screenshots");

// CSS selector fallbacks for mode switching
const SELECTOR_FALLBACKS = {
  modeButton: [
    '[aria-label="Editing mode"]',
    "#docs-toolbar-mode-switcher",
    '[aria-label*="mode"]',
    '[data-tooltip*="Editing"]',
  ],
  suggestingOption: [
    '[aria-label="Suggesting"]',
    '[aria-label*="Suggesting"]',
    '[data-value="suggesting"]',
  ],
};

export interface BrowserActionResult {
  type: "suggestion" | "newComment";
  success: boolean;
  error?: string;
}

export class DocsWriter {
  private suggestionApplier: SuggestionApplier;
  private newCommentAdder: NewCommentAdder;

  constructor(private client: AgentBrowserClient) {
    this.suggestionApplier = new SuggestionApplier(client);
    this.newCommentAdder = new NewCommentAdder(client);
  }

  async navigateToDocument(url: string): Promise<void> {
    logger.trace("Navigating to document", { url });
    const page = this.client.getPage();

    await page.goto(url, { waitUntil: "load", timeout: 60000 });
    await wait(TIMEOUTS.PAGE_LOAD);

    // Dismiss any onboarding dialogs that block interaction
    await dismissDialogs(this.client);
    await wait(TIMEOUTS.KEY_PRESS);
  }

  async enableSuggestionMode(): Promise<void> {
    logger.trace("Enabling suggestion mode");

    await withRetry(async () => {
      await this.takeScreenshot("before-suggestion-mode");

      // Click mode dropdown - try snapshot first, fall back to selector
      try {
        await clickByMatcher(this.client, matchers.editingModeButton, {
          logPrefix: "Mode button",
        });
      } catch {
        await clickBySelector(this.client, SELECTOR_FALLBACKS.modeButton, {
          logPrefix: "Mode button (fallback)",
        });
      }
      await wait(TIMEOUTS.MENU_OPEN);

      await this.takeScreenshot("after-mode-click");

      // Select "Suggesting" option
      try {
        await clickByMatcher(this.client, matchers.suggestingModeOption, {
          logPrefix: "Suggesting option",
        });
      } catch {
        await clickBySelector(this.client, SELECTOR_FALLBACKS.suggestingOption, {
          logPrefix: "Suggesting option (fallback)",
        });
      }
      await wait(TIMEOUTS.BUTTON_ACTION);
    }, "Enable suggestion mode");

    logger.trace("Suggestion mode enabled");
  }

  async applyAllChanges(response: ReviewResponse): Promise<BrowserActionResult[]> {
    const results: BrowserActionResult[] = [];

    // Apply text suggestions
    for (let i = 0; i < response.suggestions.length; i++) {
      const suggestion = response.suggestions[i];
      logger.trace(`Applying suggestion ${i + 1}/${response.suggestions.length}`, {
        findText: suggestion.findText.slice(0, 50),
      });

      try {
        await this.suggestionApplier.applySuggestion(suggestion);
        results.push({ type: "suggestion", success: true });
      } catch (error) {
        logger.error(`Failed to apply suggestion ${i + 1}`, {
          error: String(error),
          findText: suggestion.findText.slice(0, 50),
        });
        await this.takeScreenshot(`suggestion-${i + 1}-failed`);
        results.push({ type: "suggestion", success: false, error: String(error) });
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
      logger.trace(`Adding new comment ${i + 1}/${response.newComments.length}`);

      try {
        await this.newCommentAdder.addNewComment(comment);
        results.push({ type: "newComment", success: true });
      } catch (error) {
        logger.error(`Failed to add comment ${i + 1}`, { error: String(error) });
        await this.takeScreenshot(`new-comment-${i + 1}-failed`);
        results.push({ type: "newComment", success: false, error: String(error) });
      }
    }

    return results;
  }

  private async takeScreenshot(name: string): Promise<void> {
    try {
      const page = this.client.getPage();
      await mkdir(SCREENSHOTS_DIR, { recursive: true });
      const path = join(SCREENSHOTS_DIR, `${name}-${Date.now()}.png`);
      await page.screenshot({ path, fullPage: true });
      logger.trace("Screenshot saved", { path });
    } catch (error) {
      logger.warn("Failed to save screenshot", { error: String(error) });
    }
  }
}
