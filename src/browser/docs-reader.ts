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

    await this.page.goto(url, { waitUntil: "load", timeout: 60000 });

    // Wait for the document editor to be ready
    try {
      await this.page.waitForSelector('.kix-appview-editor', { timeout: 10000 });
    } catch {
      logger.warn("Editor element not found, continuing anyway");
    }

    // Wait longer for content to render - Google Docs is slow
    await this.page.waitForTimeout(8000);

    // Debug: save screenshot to see what we're working with
    await this.page.screenshot({ path: 'screenshots/debug-document.png', fullPage: true });

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
    // Google Docs renders content on Canvas, making direct DOM extraction impossible.
    // We use the clipboard approach: Click, Select All, Copy, read clipboard

    try {
      // Click on the document canvas to focus it
      // The canvas area is within kix-appview-editor but we need to avoid the sidebar
      await this.page.click('.kix-appview-editor', { position: { x: 400, y: 300 } });
      await this.page.waitForTimeout(500);

      // Select All
      await this.page.keyboard.press('Meta+a');
      await this.page.waitForTimeout(500);

      // Copy to clipboard
      await this.page.keyboard.press('Meta+c');
      await this.page.waitForTimeout(500);

      // Read clipboard content using the Clipboard API
      // First try modern Clipboard API
      let clipboardText = await this.page.evaluate(async () => {
        try {
          const text = await navigator.clipboard.readText();
          return text;
        } catch {
          return '';
        }
      });

      // If that failed, try using a textarea to paste into
      if (!clipboardText || clipboardText.length < 50) {
        clipboardText = await this.page.evaluate(() => {
          const textarea = document.createElement('textarea');
          textarea.style.position = 'fixed';
          textarea.style.left = '-9999px';
          document.body.appendChild(textarea);
          textarea.focus();
          document.execCommand('paste');
          const text = textarea.value;
          document.body.removeChild(textarea);
          return text;
        });
      }

      if (clipboardText && clipboardText.length > 50) {
        logger.debug("Got text from clipboard", { length: clipboardText.length, preview: clipboardText.slice(0, 100) });
        // Deselect
        await this.page.keyboard.press('Escape');
        return clipboardText;
      }
    } catch (error) {
      logger.debug("Clipboard method failed", { error: String(error) });
    }

    // Alternative: Try to access Google's internal document model
    // Google Docs stores document data in JS variables
    const text = await this.page.evaluate(() => {
      // Look for the document model in Google's namespace
      // @ts-ignore - accessing internal Google API
      const kix = (window as any).kix;
      if (kix?.api?.documentModel) {
        try {
          // Try to get document text from internal model
          const model = kix.api.documentModel;
          if (typeof model.getText === 'function') {
            return model.getText();
          }
        } catch {}
      }

      // Look for document data in script tags or global state
      // @ts-ignore
      const docs = (window as any).docs;
      if (docs?.document?.body) {
        return docs.document.body;
      }

      // Fallback: get visible text, filtering aggressively
      const editor = document.querySelector('.kix-appview-editor') as HTMLElement | null;
      if (editor) {
        const text = editor.innerText || '';
        const lines = text.split('\n').filter(line => {
          const l = line.trim().toLowerCase();
          if (!line.trim()) return false;
          if (/^[0-9]+$/.test(line.trim())) return false;  // ruler numbers
          if (l.includes(' pm ') || l.includes(' am ')) return false;  // timestamps
          if (l.includes('today') && (l.includes(':') || l.includes('pm'))) return false;
          if (l.startsWith('replace:')) return false;
          if (l.startsWith('assigned to')) return false;
          if (l.includes('approver')) return false;
          if (l === 'you') return false;
          return true;
        });
        return lines.join('\n').trim();
      }

      return '';
    });

    logger.debug("Body text extracted", { length: text.length, preview: text.slice(0, 100) });
    return text;
  }

  private async extractComments(): Promise<CommentThread[]> {
    const comments: CommentThread[] = [];

    try {
      // Try multiple selectors to find comment elements
      const commentSelectors = [
        '[data-thread-id]',
        '.docos-anchoredreplyview',
        '.docos-docoview-tesla-conflict',
        '.docos-replyview',
        // Comments panel elements
        '.docos-streamdocoview',
      ];

      const seenThreadIds = new Set<string>();

      for (const selector of commentSelectors) {
        try {
          const commentElements = await this.page.$$(selector);

          for (const el of commentElements) {
            try {
              // Try to get thread ID from various attributes
              let threadId = await el.getAttribute("data-thread-id");
              if (!threadId) {
                threadId = await el.getAttribute("data-id");
              }
              if (!threadId) {
                threadId = `comment-${seenThreadIds.size}`;
              }

              // Skip if we've already seen this thread
              if (seenThreadIds.has(threadId)) continue;
              seenThreadIds.add(threadId);

              // Get the full text content
              const fullText = await el.textContent();
              if (!fullText || fullText.trim().length === 0) continue;

              // Try to parse out author and content
              // Google Docs comments often have format: "Author Name\nComment text"
              const lines = fullText.trim().split('\n').filter(l => l.trim());
              let author = "Unknown";
              let content = fullText.trim();

              // Look for author name - typically the first line before timestamp
              // Pattern: "Name\nTimestamp\nComment"
              if (lines.length >= 2) {
                // Check if first line looks like an author (no timestamp patterns)
                const firstLine = lines[0].trim();
                if (!firstLine.match(/\d{1,2}:\d{2}/) && !firstLine.match(/today|yesterday/i)) {
                  author = firstLine;
                  // Content is everything after the first line, excluding timestamps
                  content = lines.slice(1)
                    .filter(l => !l.match(/^\d{1,2}:\d{2}/) && !l.match(/^(today|yesterday)/i))
                    .join(' ')
                    .trim();
                }
              }

              if (content) {
                comments.push({
                  id: threadId,
                  anchorText: "", // Would need to find the highlighted text in doc
                  content: content,
                  author: author,
                  resolved: false,
                  replies: [],
                });

                logger.debug("Extracted comment", { threadId, author, contentPreview: content.slice(0, 50) });
              }
            } catch {
              // Skip this comment element
            }
          }
        } catch {
          // Continue to next selector
        }
      }
    } catch (error) {
      logger.warn("Could not extract comments from sidebar", { error: String(error) });
    }

    logger.info("Comments extracted", { count: comments.length });
    return comments;
  }

  private extractDocIdFromUrl(url: string): string | null {
    const match = url.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
    return match ? match[1] : null;
  }
}
