/**
 * DocsWriter - Applies Claude's suggestions to Google Docs via browser automation.
 *
 * Google Docs doesn't have an API for creating suggestions, so we automate the UI.
 * This is inherently fragile - when Google changes their UI, selectors may break.
 *
 * Strategy:
 * - Use multiple fallback selectors for each element
 * - Prefer ARIA labels over class names (more stable)
 * - Take screenshots on failure for debugging
 */

import type { Page } from "playwright";
import type { ReviewResponse, TextSuggestion, CommentReplyAction, NewComment } from "../claude/types.js";
import { selectors } from "./selectors.js";
import { withRetry } from "./retry.js";
import { logger } from "../utils/logger.js";
import {
  TIMEOUTS,
  findFirst,
  clickFirst,
  clickElement,
  fillFirst,
  dismissDialogs,
} from "./page-helpers.js";
import { mkdir } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS_DIR = join(__dirname, "../../screenshots");

// Selector groups - keeping these together makes UI changes easier to fix
const SELECTORS = {
  modeButton: [
    selectors.editingModeButton,
    '#docs-toolbar-mode-switcher',
    '[aria-label*="mode"]',
    '[data-tooltip*="Editing"]',
  ],
  suggestingOption: [
    selectors.suggestingModeOption,
    '[aria-label*="Suggesting"]',
    '[data-value="suggesting"]',
  ],
  findInput: [
    '.docs-findinput-input',
    'input[aria-label="Find"]',
    'input[placeholder*="Find"]',
  ],
  replaceInput: [
    '.docs-replaceinput-input',
    'input[aria-label="Replace with"]',
    'input[aria-label*="Replace"]',
  ],
  replaceButton: [
    'button:has-text("Replace"):not(:has-text("all"))',
    '[role="button"]:has-text("Replace"):not(:has-text("all"))',
    '[aria-label="Replace"]',
  ],
  commentThread: [
    selectors.commentThread,
    '.docos-anchoredreplyview',
    '.docos-docoview-tesla-conflict',
    '.docos-streamdocoview',
  ],
  replyInput: [
    '.docos-input-textarea',
    'textarea[aria-label*="reply"]',
    'textarea[aria-label*="Reply"]',
    '[contenteditable="true"]',
  ],
  postReplyButton: [
    '.docos-input-buttons button:first-child',
    'button[aria-label*="Reply"]',
    'button:has-text("Reply")',
    '[role="button"]:has-text("Reply")',
  ],
};

export class DocsWriter {
  constructor(private page: Page) {}

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
      await clickFirst(this.page, SELECTORS.modeButton, { logPrefix: "Mode button" });
      await this.page.waitForTimeout(TIMEOUTS.MENU_OPEN);

      await this.takeScreenshot("after-mode-click");

      // Select "Suggesting" option
      await clickFirst(this.page, SELECTORS.suggestingOption, { logPrefix: "Suggesting option" });
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
        await this.applySuggestion(suggestion);
      } catch (error) {
        logger.error(`Failed to apply suggestion ${i + 1}`, {
          error: String(error),
          findText: suggestion.findText.slice(0, 50),
        });
        await this.takeScreenshot(`suggestion-${i + 1}-failed`);
      }
    }

    // Reply to comments
    for (let i = 0; i < response.commentReplies.length; i++) {
      const reply = response.commentReplies[i];
      logger.info(`Replying to comment ${i + 1}/${response.commentReplies.length}`);

      try {
        await this.replyToComment(reply);
      } catch (error) {
        logger.error(`Failed to reply to comment ${i + 1}`, { error: String(error) });
        await this.takeScreenshot(`comment-reply-${i + 1}-failed`);
      }
    }

    // Add new comments
    for (let i = 0; i < response.newComments.length; i++) {
      const comment = response.newComments[i];
      logger.info(`Adding new comment ${i + 1}/${response.newComments.length}`);

      try {
        await this.addNewComment(comment);
      } catch (error) {
        logger.error(`Failed to add comment ${i + 1}`, { error: String(error) });
        await this.takeScreenshot(`new-comment-${i + 1}-failed`);
      }
    }
  }

  private async applySuggestion(suggestion: TextSuggestion): Promise<void> {
    await withRetry(async () => {
      // Open Find and Replace dialog via Edit menu
      await this.openFindReplaceDialog();

      // Fill in find text
      await fillFirst(this.page, SELECTORS.findInput, suggestion.findText, { logPrefix: "Find input" });
      await this.page.waitForTimeout(TIMEOUTS.INPUT_SETTLE);

      // Trigger search
      await this.page.keyboard.press("Enter");
      await this.page.waitForTimeout(TIMEOUTS.SEARCH_COMPLETE);

      // Fill in replacement - need to find second input in dialog
      const replaceInput = await this.findReplaceInput();
      if (!replaceInput) {
        await this.takeScreenshot("replace-input-not-found");
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

  private async openFindReplaceDialog(): Promise<void> {
    await this.page.click('div[id="docs-edit-menu"]');
    await this.page.waitForTimeout(TIMEOUTS.MENU_OPEN);
    await this.page.click('span:has-text("Find and replace")');
    await this.page.waitForTimeout(TIMEOUTS.MENU_ACTION);
  }

  private async findReplaceInput(): Promise<any> {
    // Try named selectors first
    let input = await findFirst(this.page, SELECTORS.replaceInput, { logPrefix: "Replace input" });
    if (input) return input;

    // Fallback: find all inputs in dialog, take the second one
    const dialogInputs = await this.page.$$(
      '.docs-findinput-container input, .docs-findinput-container textarea, [role="dialog"] input'
    );
    if (dialogInputs.length >= 2) {
      logger.debug("Replace input found by position", { index: 1, total: dialogInputs.length });
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

  private async replyToComment(reply: CommentReplyAction): Promise<void> {
    await withRetry(async () => {
      await dismissDialogs(this.page);

      // Find the comment thread
      const thread = await this.findCommentThread(reply.commentQuote);
      if (!thread) {
        throw new Error(`Could not find comment containing: "${reply.commentQuote.slice(0, 50)}..."`);
      }

      // Click to expand comment
      await thread.scrollIntoViewIfNeeded();
      await this.page.waitForTimeout(TIMEOUTS.KEY_PRESS);
      await clickElement(thread, { logPrefix: "Comment thread" });
      await this.page.waitForTimeout(TIMEOUTS.COMMENT_EXPAND);

      await this.takeScreenshot("after-comment-click");

      // Find and fill reply input
      const replyInput = await findFirst(this.page, SELECTORS.replyInput, {
        visible: true,
        logPrefix: "Reply input",
      });

      if (replyInput) {
        await replyInput.scrollIntoViewIfNeeded();
        await replyInput.click({ force: true });
        await this.page.waitForTimeout(TIMEOUTS.INPUT_SETTLE);
        await this.page.keyboard.type(reply.reply, { delay: 20 });
        await this.page.waitForTimeout(TIMEOUTS.INPUT_SETTLE);

        // Submit reply
        const postButton = await findFirst(this.page, SELECTORS.postReplyButton, {
          visible: true,
          logPrefix: "Post button",
        });

        if (postButton) {
          await postButton.click({ force: true });
          await this.page.waitForTimeout(TIMEOUTS.BUTTON_ACTION);
          logger.info("Reply posted successfully");
        } else {
          // Fallback: keyboard submit
          logger.info("No post button found, trying keyboard submit");
          await this.page.keyboard.press("Meta+Enter");
          await this.page.waitForTimeout(TIMEOUTS.BUTTON_ACTION);
        }
      } else {
        logger.warn("Could not find visible reply input");
      }

      // Resolve if requested
      if (reply.resolve) {
        const resolveBtn = await this.page.$(selectors.resolveButton);
        if (resolveBtn) {
          await resolveBtn.click();
          await this.page.waitForTimeout(TIMEOUTS.KEY_PRESS);
        }
      }
    }, "Reply to comment");
  }

  private async findCommentThread(quoteText: string): Promise<any> {
    // Build search terms from the quote
    const searchTerms = [
      quoteText.slice(0, 30),
      ...quoteText.split(/\s+/).filter(w => w.length > 5),
    ];

    // Find all comment threads
    let threads: any[] = [];
    for (const selector of SELECTORS.commentThread) {
      threads = await this.page.$$(selector);
      if (threads.length > 0) {
        logger.info("Found comment threads", { selector, count: threads.length });
        break;
      }
    }

    logger.info("Searching for comment", { searchTerms, threadCount: threads.length });

    // Find thread containing any search term
    for (const thread of threads) {
      const text = await thread.textContent();
      if (!text) continue;

      const found = searchTerms.some(term =>
        text.toLowerCase().includes(term.toLowerCase())
      );

      if (found) {
        logger.info("Found matching comment thread", { preview: text.slice(0, 60) });
        return thread;
      }
    }

    return null;
  }

  private async addNewComment(comment: NewComment): Promise<void> {
    await withRetry(async () => {
      // Find the anchor text using Find dialog
      await this.openFindReplaceDialog();
      await fillFirst(this.page, SELECTORS.findInput, comment.anchorText, { logPrefix: "Find input" });
      await this.page.waitForTimeout(TIMEOUTS.INPUT_SETTLE);
      await this.page.keyboard.press("Enter");
      await this.page.waitForTimeout(TIMEOUTS.SEARCH_COMPLETE);
      await this.page.keyboard.press("Escape");
      await this.page.waitForTimeout(TIMEOUTS.KEY_PRESS);

      // Add comment with keyboard shortcut
      await this.page.keyboard.press("Meta+Alt+m");
      await this.page.waitForTimeout(TIMEOUTS.MENU_ACTION);

      // Fill comment textarea
      const textarea = await findFirst(this.page, [
        selectors.commentTextarea,
        'textarea[aria-label*="comment"]',
        '.docos-input-textarea',
      ], { logPrefix: "Comment textarea" });

      if (textarea) {
        await textarea.fill(comment.comment);
        await this.page.waitForTimeout(TIMEOUTS.INPUT_SETTLE);

        // Submit
        const submitBtn = await findFirst(this.page, [
          selectors.submitCommentButton,
          'button[aria-label*="Comment"]',
          'button:has-text("Comment")',
        ], { logPrefix: "Submit button" });

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
