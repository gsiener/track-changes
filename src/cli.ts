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
  .description("Claude reviews Google Docs and makes suggested edits")
  .version("0.1.0")
  .argument("[url]", "Google Docs URL to review")
  .option("-v, --verbose", "Enable verbose/debug logging")
  .action(async (url: string | undefined, options: { verbose?: boolean }) => {
    // If no URL provided and not a subcommand, show help
    if (!url) {
      program.help();
      return;
    }

    // Set log level
    if (options.verbose) {
      logger.setLevel("debug");
    }

    try {
      const config = loadConfig();
      logger.info("Starting document review", { url });

      // Extract document ID from URL
      const docId = extractDocId(url);
      if (!docId) {
        console.error("\n❌ Invalid Google Docs URL. Please provide a URL like:");
        console.error("   https://docs.google.com/document/d/YOUR_DOC_ID/edit\n");
        process.exit(1);
      }

      logger.info("Document ID extracted", { docId });

      // 1. Read the document
      let document: DocumentContent;
      const session = new BrowserSession();

      const hasServiceAccount = config.googleServiceAccountPath && existsSync(config.googleServiceAccountPath);

      console.log("\n🔍 Reading document...");
      if (hasServiceAccount) {
        logger.info("Fetching document via API...");
        const reader = new DocsReader(config);
        document = await reader.fetchDocument(docId);
      } else {
        logger.info("Using browser to read document...");
        const context = await session.launch(true);
        const page = await context.newPage();
        const browserReader = new BrowserDocsReader(page);
        document = await browserReader.readDocument(url);
      }

      console.log(`   📄 "${document.title}"`);
      console.log(`   📊 ${document.body.length} chars, ${document.comments.length} comments`);

      // 2. Analyze with Claude
      console.log("\n🤖 Analyzing with Claude...");
      const analyzer = new DocumentAnalyzer(config);
      const review = await analyzer.analyze(document);

      // Show what Claude found
      const totalActions = review.suggestions.length + review.commentReplies.length + review.newComments.length;
      console.log(`   Found ${totalActions} actions to take`);

      if (review.suggestions.length > 0) {
        console.log("\n📝 Suggestions:");
        for (const s of review.suggestions) {
          console.log(`  • "${s.findText.slice(0, 40)}..." → "${s.replaceWith.slice(0, 40)}..."`);
        }
      }

      if (review.commentReplies.length > 0) {
        console.log("\n💬 Replies:");
        for (const r of review.commentReplies) {
          console.log(`  • "${r.reply.slice(0, 60)}..."`);
        }
      }

      // 3. Apply changes to document
      if (totalActions > 0) {
        console.log("\n⏳ Applying changes...");

        let context = session.getContext();
        if (!context) {
          context = await session.launch(true);
        }
        const page = await context.newPage();
        const writer = new DocsWriter(page);

        await writer.navigateToDocument(buildDocsUrl(docId));
        await writer.enableSuggestionMode();
        await writer.applyAllChanges(review);

        console.log("\n✅ Done! Check your document:");
        console.log(`   🔗 ${buildDocsUrl(docId)}`);
      } else {
        console.log("\n✅ No changes needed.");
      }

      await session.close();

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error("Review failed", { error: errorMessage });

      if (errorMessage.includes("ANTHROPIC_API_KEY")) {
        console.error("\n❌ Missing API key. Set ANTHROPIC_API_KEY in .env\n");
      } else if (errorMessage.includes("session") || errorMessage.includes("storage")) {
        console.error("\n❌ Not logged in. Run: track-changes login\n");
      } else if (errorMessage.includes("timeout")) {
        console.error("\n❌ Timed out. Try again.\n");
      } else {
        console.error(`\n❌ Failed: ${errorMessage}\n`);
        if (!options.verbose) {
          console.error("   Use -v for debug output.\n");
        }
      }
      process.exit(1);
    }
  });

program
  .command("login")
  .description("Log into Google for browser automation")
  .action(async () => {
    try {
      const config = loadConfig();
      console.log("\n🔐 Log into Google:");
      console.log(`   Email: ${config.claudeGoogleEmail}`);
      console.log("\nA browser will open. Log in, then close it.\n");

      const session = new BrowserSession();
      const page = await session.launchForLogin();

      await page.goto("https://docs.google.com");

      console.log("⏳ Waiting for login...");
      await page.waitForURL("https://docs.google.com/**", { timeout: 120000 });

      console.log("✅ Login detected!");
      await session.saveSession();
      await session.close();

      console.log("✅ Session saved! You can now review documents.\n");

    } catch (error) {
      logger.error("Login failed", { error: String(error) });
      process.exit(1);
    }
  });

program.parse();
