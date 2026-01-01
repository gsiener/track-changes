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
    await this.page.goto(url, { waitUntil: "networkidle" });
    await this.page.waitForTimeout(2000); // Allow document to fully load
  }

  async enableSuggestionMode(): Promise<void> {
    logger.info("Enabling suggestion mode");

    await withRetry(async () => {
      // Click the editing mode dropdown
      const modeButton = await this.page.$(selectors.editingModeButton);
      if (!modeButton) {
        throw new Error("Could not find editing mode button");
      }

      await modeButton.click();
      await this.page.waitForTimeout(500);

      // Click "Suggesting" option
      const suggestingOption = await this.page.$(selectors.suggestingModeOption);
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
      // Open find and replace with Ctrl+H
      await this.page.keyboard.press("Control+h");
      await this.page.waitForTimeout(500);

      // Wait for dialog
      await this.page.waitForSelector(selectors.findReplaceDialog, { timeout: 5000 });

      // Type the text to find
      const findInput = await this.page.$(selectors.findInput);
      if (!findInput) throw new Error("Find input not found");

      await findInput.fill(suggestion.findText);
      await this.page.waitForTimeout(300);

      // Type the replacement text
      const replaceInput = await this.page.$(selectors.replaceInput);
      if (!replaceInput) throw new Error("Replace input not found");

      await replaceInput.fill(suggestion.replaceWith);
      await this.page.waitForTimeout(300);

      // Click replace button (this creates a suggestion in suggestion mode)
      const replaceButton = await this.page.$(selectors.replaceButton);
      if (!replaceButton) throw new Error("Replace button not found");

      await replaceButton.click();
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
      // First, find and select the anchor text
      // Open find dialog
      await this.page.keyboard.press("Control+f");
      await this.page.waitForTimeout(500);

      const findInput = await this.page.$('input[aria-label="Find in document"]');
      if (!findInput) throw new Error("Find input not found");

      await findInput.fill(comment.anchorText);
      await this.page.waitForTimeout(500);

      // Press Enter to find, then Escape to close find
      await this.page.keyboard.press("Enter");
      await this.page.waitForTimeout(300);
      await this.page.keyboard.press("Escape");
      await this.page.waitForTimeout(300);

      // Now add comment with Ctrl+Alt+M
      await this.page.keyboard.press("Control+Alt+m");
      await this.page.waitForTimeout(500);

      // Type the comment
      const commentTextarea = await this.page.$(selectors.commentTextarea);
      if (commentTextarea) {
        await commentTextarea.fill(comment.comment);
        await this.page.waitForTimeout(300);

        // Submit
        const submitButton = await this.page.$(selectors.submitCommentButton);
        if (submitButton) {
          await submitButton.click();
          await this.page.waitForTimeout(500);
        }
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
