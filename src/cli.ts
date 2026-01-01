#!/usr/bin/env node

import { Command } from "commander";
import { existsSync } from "fs";
import { loadConfig } from "./config.js";
import { logger } from "./utils/logger.js";
import { extractDocId, buildDocsUrl } from "./utils/url.js";
import { DocsReader } from "./google/docs-reader.js";
import { BrowserDocsReader } from "./browser/docs-reader.js";
import { DocumentAnalyzer } from "./claude/analyzer.js";
import { BrowserSession } from "./browser/session.js";
import { DocsWriter } from "./browser/docs-writer.js";
import type { DocumentContent } from "./google/types.js";

const program = new Command();

program
  .name("track-changes")
  .description("CLI tool for Claude to review Google Docs with suggested edits")
  .version("0.1.0");

program
  .command("review")
  .description("Review a Google Doc and make suggestions")
  .argument("<url>", "Google Docs URL to review")
  .option("-p, --prompt <text>", "Optional focus instructions for Claude")
  .option("--dry-run", "Analyze document but don't apply changes")
  .action(async (url: string, options: { prompt?: string; dryRun?: boolean }) => {
    try {
      const config = loadConfig();
      logger.info("Starting document review", { url, dryRun: options.dryRun ?? false });

      // Extract document ID from URL
      const docId = extractDocId(url);
      if (!docId) {
        logger.error("Invalid Google Docs URL");
        process.exit(1);
      }

      logger.info("Document ID extracted", { docId });

      // 1. Fetch document content
      let document: DocumentContent;
      const session = new BrowserSession();

      const hasServiceAccount = config.googleServiceAccountPath && existsSync(config.googleServiceAccountPath);

      if (hasServiceAccount) {
        // Use API if service account is configured and file exists
        logger.info("Fetching document via API...");
        const reader = new DocsReader(config);
        document = await reader.fetchDocument(docId);
      } else {
        // Fall back to browser-based reading
        logger.info("No service account configured, using browser to read document...");
        const context = await session.launch(true); // headless
        const page = await context.newPage();
        const browserReader = new BrowserDocsReader(page);
        document = await browserReader.readDocument(url);
      }

      logger.info("Document fetched", { title: document.title });

      // 2. Send to Claude for analysis
      logger.info("Sending to Claude for analysis...");
      const analyzer = new DocumentAnalyzer(config);
      const review = await analyzer.analyze(document, options.prompt);

      logger.info("Analysis complete", {
        suggestions: review.suggestions.length,
        commentReplies: review.commentReplies.length,
        newComments: review.newComments.length,
      });

      // Show what Claude found
      if (review.suggestions.length > 0) {
        console.log("\n📝 Suggestions:");
        for (const s of review.suggestions) {
          console.log(`  - "${s.findText.slice(0, 40)}..." → "${s.replaceWith.slice(0, 40)}..."`);
          if (s.rationale) console.log(`    Reason: ${s.rationale}`);
        }
      }

      if (review.commentReplies.length > 0) {
        console.log("\n💬 Comment Replies:");
        for (const r of review.commentReplies) {
          console.log(`  - Reply to "${r.commentQuote.slice(0, 30)}...": ${r.reply.slice(0, 50)}...`);
        }
      }

      if (review.newComments.length > 0) {
        console.log("\n📌 New Comments:");
        for (const c of review.newComments) {
          console.log(`  - On "${c.anchorText.slice(0, 30)}...": ${c.comment.slice(0, 50)}...`);
        }
      }

      // 3. Apply suggestions via Playwright (unless dry-run)
      if (options.dryRun) {
        logger.info("Dry run - skipping browser automation");
        console.log("\n✅ Dry run complete. Use without --dry-run to apply changes.");
        await session.close();
      } else {
        logger.info("Applying changes via browser...");

        try {
          // Get or create browser context
          let context = session.getContext();
          if (!context) {
            context = await session.launch(true); // headless
          }
          const page = await context.newPage();
          const writer = new DocsWriter(page);

          await writer.navigateToDocument(buildDocsUrl(docId));
          await writer.enableSuggestionMode();
          await writer.applyAllChanges(review);

          logger.info("All changes applied successfully");
          console.log("\n✅ Review complete! Check your document for suggestions.");
        } finally {
          await session.close();
        }
      }

    } catch (error) {
      logger.error("Review failed", { error: String(error) });
      process.exit(1);
    }
  });

program
  .command("login")
  .description("Manually log into Google account for browser automation")
  .action(async () => {
    try {
      const config = loadConfig();
      logger.info("Opening browser for manual Google login...");
      console.log("\n🔐 Please log into Google with the Claude account:");
      console.log(`   Email: ${config.claudeGoogleEmail}`);
      console.log("\nA browser will open. Log in, then it will auto-detect and save.\n");

      const session = new BrowserSession();
      const page = await session.launchForLogin();

      // Navigate to Google Docs directly - will redirect to login if needed
      await page.goto("https://docs.google.com");

      console.log("⏳ Waiting for you to log in...");

      // Wait until we're on docs.google.com (not accounts.google.com)
      await page.waitForURL("https://docs.google.com/**", { timeout: 120000 });

      console.log("✅ Login detected!");

      // Save session
      await session.saveSession();
      await session.close();

      console.log("✅ Session saved! You can now use the review command.");

    } catch (error) {
      logger.error("Login failed", { error: String(error) });
      process.exit(1);
    }
  });

program.parse();
