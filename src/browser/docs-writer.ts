import type { Page } from "playwright";
import type { ReviewResponse, TextSuggestion, CommentReplyAction, NewComment } from "../claude/types.js";
import { selectors, shortcuts } from "./selectors.js";
import { withRetry } from "./retry.js";
import { logger } from "../utils/logger.js";
import { mkdir } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS_DIR = join(__dirname, "../../screenshots");

export class DocsWriter {
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async navigateToDocument(url: string): Promise<void> {
    logger.info("Navigating to document", { url });
    await this.page.goto(url, { waitUntil: "load", timeout: 60000 });
    await this.page.waitForTimeout(5000); // Allow document to fully load
  }

  async enableSuggestionMode(): Promise<void> {
    logger.info("Enabling suggestion mode");

    await withRetry(async () => {
      // Take screenshot for debugging
      await this.takeScreenshot("before-suggestion-mode");

      // Try multiple selectors for the editing mode button
      const modeSelectors = [
        selectors.editingModeButton,
        '#docs-toolbar-mode-switcher',
        '[aria-label*="mode"]',
        '[data-tooltip*="Editing"]',
        '.docs-menubutton-caption',
      ];

      let modeButton = null;
      for (const selector of modeSelectors) {
        modeButton = await this.page.$(selector);
        if (modeButton) {
          logger.info("Found mode button", { selector });
          break;
        }
      }

      if (!modeButton) {
        // Log available elements for debugging
        const buttons = await this.page.$$eval('button, [role="button"]', els =>
          els.slice(0, 10).map(e => ({ tag: e.tagName, aria: e.getAttribute('aria-label'), text: e.textContent?.slice(0, 30) }))
        );
        logger.warn("Available buttons", { buttons });
        throw new Error("Could not find editing mode button");
      }

      await modeButton.click();
      await this.page.waitForTimeout(1000);

      // Take screenshot after clicking
      await this.takeScreenshot("after-mode-click");

      // Try multiple selectors for suggesting option
      const suggestSelectors = [
        selectors.suggestingModeOption,
        '[aria-label*="Suggesting"]',
        '[data-value="suggesting"]',
        'div:has-text("Suggesting")',
      ];

      let suggestingOption = null;
      for (const selector of suggestSelectors) {
        try {
          suggestingOption = await this.page.$(selector);
          if (suggestingOption) {
            logger.info("Found suggesting option", { selector });
            break;
          }
        } catch {
          // Continue to next selector
        }
      }

      if (!suggestingOption) {
        throw new Error("Could not find suggesting mode option");
      }

      await suggestingOption.click();
      await this.page.waitForTimeout(500);
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
        logger.error(`Failed to reply to comment ${i + 1}`, {
          error: String(error),
        });
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
        logger.error(`Failed to add comment ${i + 1}`, {
          error: String(error),
        });
        await this.takeScreenshot(`new-comment-${i + 1}-failed`);
      }
    }
  }

  private async applySuggestion(suggestion: TextSuggestion): Promise<void> {
    await withRetry(async () => {
      // Open find and replace via Edit menu (more reliable than keyboard shortcuts)
      await this.page.click('div[id="docs-edit-menu"]');
      await this.page.waitForTimeout(500);
      await this.page.click('span:has-text("Find and replace")');
      await this.page.waitForTimeout(1000);

      // Try multiple selectors to find the input
      const findSelectors = [
        '.docs-findinput-input',
        'input[aria-label="Find"]',
        'input[placeholder*="Find"]',
        'textarea[aria-label="Find"]',
      ];

      let findInput = null;
      for (const selector of findSelectors) {
        findInput = await this.page.$(selector);
        if (findInput) {
          logger.info("Found find input", { selector });
          break;
        }
      }
      if (!findInput) {
        await this.takeScreenshot("find-input-not-found");
        throw new Error("Find input not found");
      }

      await findInput.fill(suggestion.findText);
      await this.page.waitForTimeout(500);

      // Press Enter to trigger the search
      await this.page.keyboard.press("Enter");
      await this.page.waitForTimeout(1000);

      // Find the replace input - try multiple strategies
      const replaceSelectors = [
        '.docs-replaceinput-input',
        'input[aria-label="Replace with"]',
        'input[aria-label*="Replace"]',
        'textarea[aria-label="Replace with"]',
        'textarea[aria-label*="Replace"]',
        // Try finding by position - replace input is second in the dialog
        '.docs-findinput-container input:nth-of-type(2)',
        '.docs-findbar input:nth-of-type(2)',
      ];

      let replaceInput = null;
      for (const selector of replaceSelectors) {
        try {
          replaceInput = await this.page.$(selector);
          if (replaceInput) {
            logger.info("Found replace input", { selector });
            break;
          }
        } catch {
          // Continue to next selector
        }
      }

      // If still not found, try finding all inputs in the dialog and pick the second one
      if (!replaceInput) {
        const dialogInputs = await this.page.$$('.docs-findinput-container input, .docs-findinput-container textarea, [role="dialog"] input, [role="dialog"] textarea');
        if (dialogInputs.length >= 2) {
          replaceInput = dialogInputs[1];
          logger.info("Found replace input by position", { index: 1, total: dialogInputs.length });
        }
      }

      if (!replaceInput) {
        await this.takeScreenshot("replace-input-not-found");
        throw new Error("Replace input not found");
      }

      await replaceInput.fill(suggestion.replaceWith);
      await this.page.waitForTimeout(300);

      // Click replace button - try multiple selectors
      const replaceButtonSelectors = [
        // Exact text match buttons
        'button:has-text("Replace"):not(:has-text("all"))',
        '[role="button"]:has-text("Replace"):not(:has-text("all"))',
        // Google Docs specific selectors
        '.docs-findinput-button:has-text("Replace")',
        '[data-tooltip="Replace"]',
        '[aria-label="Replace"]',
        // Broader selectors
        'div:has-text("Replace"):not(:has-text("all"))[role="button"]',
      ];

      let replaceButton = null;
      for (const selector of replaceButtonSelectors) {
        try {
          // Use locator for better text matching
          const matches = await this.page.$$(selector);
          for (const match of matches) {
            const text = await match.textContent();
            // Make sure it says "Replace" but not "Replace all"
            if (text && text.trim() === 'Replace') {
              replaceButton = match;
              logger.info("Found replace button", { selector, text: text.trim() });
              break;
            }
          }
          if (replaceButton) break;
        } catch {
          // Continue to next selector
        }
      }

      // Fallback: find any clickable element that says exactly "Replace"
      if (!replaceButton) {
        const allElements = await this.page.$$('button, [role="button"], .docs-findinput-button');
        for (const el of allElements) {
          const text = await el.textContent();
          if (text && text.trim() === 'Replace') {
            replaceButton = el;
            logger.info("Found replace button by text scan", { text: text.trim() });
            break;
          }
        }
      }

      if (!replaceButton) {
        await this.takeScreenshot("replace-button-not-found");
        throw new Error("Replace button not found");
      }

      // Wait a moment for the button to become enabled after search completes
      await this.page.waitForTimeout(500);

      // Click with timeout and retry logic
      try {
        await replaceButton.click({ timeout: 5000 });
      } catch (clickError) {
        logger.warn("Replace button click failed, trying force click", { error: String(clickError) });
        // Try force click if normal click fails
        await replaceButton.click({ force: true });
      }
      await this.page.waitForTimeout(500);

      // Close the dialog
      await this.page.keyboard.press("Escape");
      await this.page.waitForTimeout(300);
    }, `Apply suggestion: "${suggestion.findText.slice(0, 30)}..."`);
  }

  private async replyToComment(reply: CommentReplyAction): Promise<void> {
    await withRetry(async () => {
      // Find the comment thread by searching for the quoted text
      // This is complex because we need to find comments in the sidebar
      const commentThreads = await this.page.$$(selectors.commentThread);

      for (const thread of commentThreads) {
        const threadText = await thread.textContent();
        if (threadText && threadText.includes(reply.commentQuote.slice(0, 50))) {
          // Found the comment, click to focus it
          await thread.click();
          await this.page.waitForTimeout(300);

          // Find and click reply input
          const replyInput = await this.page.$(selectors.replyInput);
          if (replyInput) {
            await replyInput.fill(reply.reply);
            await this.page.waitForTimeout(300);

            // Click reply button
            const postButton = await this.page.$(selectors.postReplyButton);
            if (postButton) {
              await postButton.click();
              await this.page.waitForTimeout(500);
            }
          }

          // Resolve if needed
          if (reply.resolve) {
            const resolveButton = await this.page.$(selectors.resolveButton);
            if (resolveButton) {
              await resolveButton.click();
              await this.page.waitForTimeout(300);
            }
          }

          return;
        }
      }

      throw new Error(`Could not find comment containing: "${reply.commentQuote.slice(0, 50)}..."`);
    }, "Reply to comment");
  }

  private async addNewComment(comment: NewComment): Promise<void> {
    await withRetry(async () => {
      // Use Edit menu to open Find and Replace (consistent with applySuggestion)
      await this.page.click('div[id="docs-edit-menu"]');
      await this.page.waitForTimeout(500);
      await this.page.click('span:has-text("Find and replace")');
      await this.page.waitForTimeout(1000);

      // Find the search input
      const findSelectors = [
        '.docs-findinput-input',
        'input[aria-label="Find"]',
        'input[aria-label="Find in document"]',
        'input[placeholder*="Find"]',
      ];

      let findInput = null;
      for (const selector of findSelectors) {
        findInput = await this.page.$(selector);
        if (findInput) {
          logger.info("Found find input for comment", { selector });
          break;
        }
      }
      if (!findInput) throw new Error("Find input not found");

      await findInput.fill(comment.anchorText);
      await this.page.waitForTimeout(500);

      // Press Enter to find the text
      await this.page.keyboard.press("Enter");
      await this.page.waitForTimeout(500);

      // Close find dialog
      await this.page.keyboard.press("Escape");
      await this.page.waitForTimeout(500);

      // The found text should now be selected, add comment with keyboard shortcut
      await this.page.keyboard.press("Meta+Alt+m");
      await this.page.waitForTimeout(1000);

      // Try multiple selectors for comment textarea
      const commentSelectors = [
        selectors.commentTextarea,
        'textarea[aria-label*="comment"]',
        'textarea[aria-label*="Comment"]',
        '[contenteditable="true"][aria-label*="comment"]',
        '.docos-input-textarea',
      ];

      let commentTextarea = null;
      for (const selector of commentSelectors) {
        try {
          commentTextarea = await this.page.$(selector);
          if (commentTextarea) {
            logger.info("Found comment textarea", { selector });
            break;
          }
        } catch {
          // Continue
        }
      }

      if (commentTextarea) {
        await commentTextarea.fill(comment.comment);
        await this.page.waitForTimeout(300);

        // Try multiple selectors for submit button
        const submitSelectors = [
          selectors.submitCommentButton,
          'button[aria-label*="Comment"]',
          'button:has-text("Comment")',
          '[role="button"]:has-text("Comment")',
        ];

        let submitButton = null;
        for (const selector of submitSelectors) {
          try {
            submitButton = await this.page.$(selector);
            if (submitButton) {
              logger.info("Found submit button", { selector });
              break;
            }
          } catch {
            // Continue
          }
        }

        if (submitButton) {
          await submitButton.click();
          await this.page.waitForTimeout(500);
        } else {
          // Try pressing Enter to submit
          await this.page.keyboard.press("Meta+Enter");
          await this.page.waitForTimeout(500);
        }
      } else {
        logger.warn("Comment textarea not found, comment may not have been added");
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
