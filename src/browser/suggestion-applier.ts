/**
 * SuggestionApplier - Applies text suggestions via find-and-replace in Google Docs.
 *
 * Migrated to use agent-browser's snapshot-based element finding for more
 * stable interactions with Google Docs' complex UI.
 */

import type { AgentBrowserClient } from "./agent-browser-client.js";
import type { TextSuggestion } from "../claude/types.js";
import { withRetry } from "./retry.js";
import { logger } from "../utils/logger.js";
import {
  TIMEOUTS,
  wait,
  dismissDialogs,
  clickByMatcher,
  fillByMatcher,
  clickBySelector,
  fillBySelector,
} from "./snapshot-helpers.js";
import { matchers } from "./matchers.js";

// CSS selector fallbacks for when snapshot matching doesn't work
const SELECTOR_FALLBACKS = {
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
  editMenu: [
    'div[id="docs-edit-menu"]',
    '[aria-label="Edit"]',
  ],
  findAndReplace: [
    'span:has-text("Find and replace")',
    '[aria-label*="Find and replace"]',
  ],
};

export class SuggestionApplier {
  constructor(private client: AgentBrowserClient) {}

  async applySuggestion(suggestion: TextSuggestion): Promise<void> {
    await withRetry(async () => {
      const page = this.client.getPage();

      // Dismiss any dialogs first
      await dismissDialogs(this.client);

      // Open Find and Replace dialog via Edit menu
      await this.openFindReplaceDialog();

      // Fill in find text - try snapshot first, fall back to selector
      try {
        await fillByMatcher(this.client, matchers.findInput, suggestion.findText, {
          logPrefix: "Find input",
        });
      } catch {
        await fillBySelector(this.client, SELECTOR_FALLBACKS.findInput, suggestion.findText, {
          logPrefix: "Find input (fallback)",
        });
      }
      await wait(TIMEOUTS.INPUT_SETTLE);

      // Trigger search
      await page.keyboard.press("Enter");
      await wait(TIMEOUTS.SEARCH_COMPLETE);

      // Fill in replacement - try snapshot first, fall back to selector
      try {
        await fillByMatcher(this.client, matchers.replaceInput, suggestion.replaceWith, {
          logPrefix: "Replace input",
        });
      } catch {
        await fillBySelector(this.client, SELECTOR_FALLBACKS.replaceInput, suggestion.replaceWith, {
          logPrefix: "Replace input (fallback)",
        });
      }
      await wait(TIMEOUTS.INPUT_SETTLE);

      // Click Replace button
      await this.clickReplaceButton();
      await wait(TIMEOUTS.BUTTON_ACTION);

      // Close dialog
      await page.keyboard.press("Escape");
      await wait(TIMEOUTS.KEY_PRESS);
    }, `Apply suggestion: "${suggestion.findText.slice(0, 30)}..."`);
  }

  async openFindReplaceDialog(): Promise<void> {
    const page = this.client.getPage();

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

  private async clickReplaceButton(): Promise<void> {
    const page = this.client.getPage();

    // Try snapshot-based first
    try {
      await clickByMatcher(this.client, matchers.replaceButton, { logPrefix: "Replace button" });
      return;
    } catch {
      logger.debug("Snapshot-based replace button click failed, trying selector fallback");
    }

    // Fallback: Find button with exact "Replace" text (not "Replace all")
    const buttons = await page.$$('button, [role="button"]');
    for (const btn of buttons) {
      const text = await btn.textContent();
      if (text?.trim() === "Replace") {
        try {
          await btn.click();
          logger.debug("Replace button clicked via selector fallback");
          return;
        } catch {
          await btn.click({ force: true });
          logger.debug("Replace button force clicked");
          return;
        }
      }
    }
    throw new Error("Replace button not found");
  }
}
