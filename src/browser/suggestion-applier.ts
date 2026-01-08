/**
 * SuggestionApplier - Applies text suggestions via find-and-replace in Google Docs.
 *
 * Extracted from DocsWriter for better modularity and testability.
 */

import type { Page, ElementHandle } from "playwright";
import type { TextSuggestion } from "../claude/types.js";
import { withRetry } from "./retry.js";
import { logger } from "../utils/logger.js";
import {
  TIMEOUTS,
  findFirst,
  fillFirst,
  clickElement,
  dismissDialogs,
} from "./page-helpers.js";

// Selectors for find-replace dialog
const SELECTORS = {
  findInput: [
    ".docs-findinput-input",
    'input[aria-label="Find"]',
    'input[placeholder*="Find"]',
  ],
  replaceInput: [
    ".docs-replaceinput-input",
    'input[aria-label="Replace with"]',
    'input[aria-label*="Replace"]',
  ],
};

export class SuggestionApplier {
  constructor(private page: Page) {}

  async applySuggestion(suggestion: TextSuggestion): Promise<void> {
    await withRetry(async () => {
      // Dismiss any dialogs first
      await dismissDialogs(this.page);

      // Open Find and Replace dialog via Edit menu
      await this.openFindReplaceDialog();

      // Fill in find text
      await fillFirst(this.page, SELECTORS.findInput, suggestion.findText, {
        logPrefix: "Find input",
      });
      await this.page.waitForTimeout(TIMEOUTS.INPUT_SETTLE);

      // Trigger search
      await this.page.keyboard.press("Enter");
      await this.page.waitForTimeout(TIMEOUTS.SEARCH_COMPLETE);

      // Fill in replacement
      const replaceInput = await this.findReplaceInput();
      if (!replaceInput) {
        throw new Error("Replace input not found");
      }
      await replaceInput.fill(suggestion.replaceWith);
      await this.page.waitForTimeout(TIMEOUTS.INPUT_SETTLE);

      // Click Replace button
      await this.clickReplaceButton();
      await this.page.waitForTimeout(TIMEOUTS.BUTTON_ACTION);

      // Close dialog
      await this.page.keyboard.press("Escape");
      await this.page.waitForTimeout(TIMEOUTS.KEY_PRESS);
    }, `Apply suggestion: "${suggestion.findText.slice(0, 30)}..."`);
  }

  async openFindReplaceDialog(): Promise<void> {
    await this.page.click('div[id="docs-edit-menu"]');
    await this.page.waitForTimeout(TIMEOUTS.MENU_OPEN);
    await this.page.click('span:has-text("Find and replace")');
    await this.page.waitForTimeout(TIMEOUTS.MENU_ACTION);
  }

  private async findReplaceInput(): Promise<ElementHandle | null> {
    // Try named selectors first
    const input = await findFirst(this.page, SELECTORS.replaceInput, {
      logPrefix: "Replace input",
    });
    if (input) return input;

    // Fallback: find all inputs in dialog, take the second one
    const dialogInputs = await this.page.$$(
      '.docs-findinput-container input, .docs-findinput-container textarea, [role="dialog"] input'
    );
    if (dialogInputs.length >= 2) {
      logger.debug("Replace input found by position", {
        index: 1,
        total: dialogInputs.length,
      });
      return dialogInputs[1];
    }
    return null;
  }

  private async clickReplaceButton(): Promise<void> {
    // Find button with exact "Replace" text (not "Replace all")
    const buttons = await this.page.$$('button, [role="button"]');
    for (const btn of buttons) {
      const text = await btn.textContent();
      if (text?.trim() === "Replace") {
        await clickElement(btn, { logPrefix: "Replace button" });
        return;
      }
    }
    throw new Error("Replace button not found");
  }
}
