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
    await this.page.waitForTimeout(5000); // Let doc fully render

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
    // Google Docs renders document content in paragraph elements
    // We need to specifically target the document canvas and avoid UI elements
    const text = await this.page.evaluate(() => {
      // Target the actual document paragraphs, not UI elements
      // Google Docs uses .kix-paragraphrenderer for document text
      const paragraphs = document.querySelectorAll('.kix-paragraphrenderer');
      if (paragraphs.length > 0) {
        const texts: string[] = [];
        paragraphs.forEach(p => {
          const content = p.textContent?.trim();
          if (content) {
            texts.push(content);
          }
        });
        return texts.join('\n\n');
      }

      // Fallback: Try to get text from the page content wrapper
      // but exclude common UI elements
      const pageContent = document.querySelector('.kix-page-content-wrapper');
      if (pageContent) {
        // Clone and remove UI elements
        const clone = pageContent.cloneNode(true) as Element;
        // Remove comment elements, suggestions UI, etc.
        clone.querySelectorAll('[data-thread-id], .docos-anchoredreplyview, .docs-butterbar-container').forEach(el => el.remove());
        return clone.textContent?.trim() || '';
      }

      // Last resort: get innerText but filter out obvious UI patterns
      const editor = document.querySelector('.kix-appview-editor') as HTMLElement | null;
      if (editor) {
        const text = editor.innerText || '';
        // Filter out lines that look like UI elements
        return text
          .split('\n')
          .filter((line: string) => {
            const lower = line.toLowerCase();
            // Skip lines that are clearly UI elements
            if (lower.includes('assigned to') && lower.includes('pm') && lower.includes('today')) return false;
            if (lower.includes('suggestion was deleted')) return false;
            if (lower.includes('show more') && lower.includes('show less')) return false;
            if (lower.includes('comment details cannot be verified')) return false;
            if (lower.includes('gemini created these notes')) return false;
            if (lower.includes('drag image to reposition')) return false;
            return true;
          })
          .join('\n')
          .trim();
      }

      return '';
    });

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
