import type { Page } from "playwright";
import type { DocumentContent, CommentThread } from "../google/types.js";
import { logger } from "../utils/logger.js";

/**
 * Browser-based document reader - reads content directly from the DOM
 * Use this when you don't have a Google service account set up
 */
export class BrowserDocsReader {
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async readDocument(url: string): Promise<DocumentContent> {
    logger.info("Reading document via browser", { url });

    await this.page.goto(url, { waitUntil: "networkidle" });
    await this.page.waitForTimeout(3000); // Let doc fully load

    // Extract document title
    const title = await this.page.title();
    const cleanTitle = title.replace(" - Google Docs", "").trim();

    // Extract document body text
    const body = await this.extractBodyText();

    // Extract comments (if visible)
    const comments = await this.extractComments();

    logger.info("Document read", {
      title: cleanTitle,
      bodyLength: body.length,
      commentCount: comments.length,
    });

    return {
      id: this.extractDocIdFromUrl(url) ?? "unknown",
      title: cleanTitle,
      body,
      comments,
    };
  }

  private async extractBodyText(): Promise<string> {
    // Google Docs renders content in a specific structure
    // Try multiple selectors for robustness
    const selectors = [
      ".kix-page-content-wrapper",
      ".docs-texteventtarget-iframe",
      '[role="textbox"]',
    ];

    for (const selector of selectors) {
      try {
        const element = await this.page.$(selector);
        if (element) {
          const text = await element.textContent();
          if (text && text.trim().length > 0) {
            return text.trim();
          }
        }
      } catch {
        // Try next selector
      }
    }

    // Fallback: try to get all visible text
    const allText = await this.page.evaluate(() => {
      // Get text from the main document area
      const mainContent = document.querySelector(".kix-appview-editor");
      if (mainContent) {
        return mainContent.textContent || "";
      }

      // Broader fallback
      const body = document.body;
      return body?.innerText || "";
    });

    return allText.trim();
  }

  private async extractComments(): Promise<CommentThread[]> {
    // Try to find comment threads in the sidebar
    const comments: CommentThread[] = [];

    try {
      // Look for comment elements
      const commentElements = await this.page.$$('[data-thread-id]');

      for (const el of commentElements) {
        try {
          const threadId = await el.getAttribute("data-thread-id");
          const content = await el.textContent();

          if (threadId && content) {
            comments.push({
              id: threadId,
              anchorText: "",
              content: content.trim(),
              author: "Unknown",
              resolved: false,
              replies: [],
            });
          }
        } catch {
          // Skip this comment
        }
      }
    } catch {
      logger.warn("Could not extract comments from sidebar");
    }

    return comments;
  }

  private extractDocIdFromUrl(url: string): string | null {
    const match = url.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
    return match ? match[1] : null;
  }
}
