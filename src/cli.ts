#!/usr/bin/env node

import { Command } from "commander";
import { existsSync } from "fs";
import { loadConfig } from "./config.js";
import { logger } from "./utils/logger.js";
import { extractDocId, buildDocsUrl } from "./utils/url.js";
import { DocsReader } from "./google/docs-reader.js";
import { DocumentAnalyzer } from "./claude/analyzer.js";
import { BrowserSession } from "./browser/session.js";
import { DocsWriter } from "./browser/docs-writer.js";
import type { DocumentContent } from "./google/types.js";
import { matchCommentForReply } from "./utils/comment-matcher.js";
import { prepareSuggestionsForApply } from "./utils/suggestion-validation.js";

// Action result tracking for partial failure handling
interface ActionResult {
  type: "suggestion" | "commentReply" | "newComment";
  success: boolean;
  error?: string;
}

// Simple timing utility
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

const program = new Command();

program
  .name("track-changes")
  .description("Claude reviews Google Docs and makes suggested edits")
  .version("0.1.0")
  .argument("[url]", "Google Docs URL to review")
  .option("-v, --verbose", "Enable verbose logging (debug level)")
  .option("--trace", "Enable trace logging (all internal details)")
  .action(async (url: string | undefined, options: { verbose?: boolean; trace?: boolean }) => {
    // If no URL provided and not a subcommand, show help
    if (!url) {
      program.help();
      return;
    }

    // Set log level
    if (options.trace) {
      logger.setLevel("trace");
    } else if (options.verbose) {
      logger.setLevel("debug");
    }

    let session: BrowserSession | null = null;

    try {
      const startTime = Date.now();
      const config = loadConfig();
      logger.trace("Starting document review", { url });

      // Extract document ID from URL
      const docId = extractDocId(url);
      if (!docId) {
        console.error("\n❌ Invalid Google Docs URL. Please provide a URL like:");
        console.error("   https://docs.google.com/document/d/YOUR_DOC_ID/edit\n");
        process.exit(1);
      }

      logger.trace("Document ID extracted", { docId });

      // 1. Read the document
      console.log("\n🔍 Reading document...");

      // Require service account for reliable, clean data
      if (!config.googleServiceAccountPath || !existsSync(config.googleServiceAccountPath)) {
        console.error("\n❌ Service account required for reliable document reading");
        console.error("\nSetup instructions:");
        console.error("1. Create a Google Cloud project");
        console.error("2. Enable Google Docs API");
        console.error("3. Create a service account and download credentials.json");
        console.error("4. Set GOOGLE_SERVICE_ACCOUNT_PATH=./credentials.json in .env");
        console.error("\nWhy: Browser reading is unreliable and expensive");
        console.error("  - Extracts duplicate comments (164 instead of 20)");
        console.error("  - Mixes UI text into document body");
        console.error("  - Costs 4x more ($0.06 vs $0.015 per run)\n");
        process.exit(1);
      }

      const readStart = Date.now();
      logger.trace("Fetching document via API...");
      const reader = new DocsReader(config);
      const document = await reader.fetchDocument(docId);
      const readDuration = Date.now() - readStart;

      session = new BrowserSession();

      console.log(`   📄 "${document.title}"`);
      console.log(`   📊 ${document.body.length} chars, ${document.comments.length} comments`);
      console.log(`   ⏱️  Read in ${formatDuration(readDuration)}`);

      // 2. Analyze with Claude
      console.log("\n🤖 Analyzing with Claude...");
      const analyzeStart = Date.now();
      const analyzer = new DocumentAnalyzer(config);
      const review = await analyzer.analyze(document);
      const analyzeDuration = Date.now() - analyzeStart;

      console.log(`   ⏱️  Analyzed in ${formatDuration(analyzeDuration)}`);

      // Validate suggestions against document body before browser automation
      const suggestionPrep = prepareSuggestionsForApply(document.body, review.suggestions);
      const suggestionsToApply = suggestionPrep.suggestions;
      const skippedSuggestions = suggestionPrep.failures.length;

      // Show what Claude found
      const totalActions = suggestionsToApply.length + review.commentReplies.length + review.newComments.length;
      console.log(`   Found ${totalActions} actions to take`);
      if (skippedSuggestions > 0) {
        console.log(`   ⚠️  Skipped ${skippedSuggestions} suggestions due to ambiguous or missing matches`);
      }

      // Track results for summary
      const results: ActionResult[] = [];
      if (suggestionPrep.failures.length > 0) {
        for (const failure of suggestionPrep.failures) {
          results.push({
            type: "suggestion",
            success: false,
            error: failure.reason,
          });
          logger.warn("Skipping suggestion due to match validation failure", {
            reason: failure.reason,
            findText: failure.suggestion.findText.slice(0, 50),
          });
        }
      }

      if (suggestionsToApply.length > 0) {
        console.log("\n📝 Suggestions:");
        for (const s of suggestionsToApply) {
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
        const applyStart = Date.now();

        // Apply comment replies via Drive API (fast, reliable)
        if (review.commentReplies.length > 0) {
          console.log("   💬 Applying comment replies via API...");
          for (let i = 0; i < review.commentReplies.length; i++) {
            const reply = review.commentReplies[i];
            logger.trace(`Replying to comment ${i + 1}/${review.commentReplies.length}`);

            try {
              const match = matchCommentForReply(document.comments, reply.commentQuote);
              if (!match.comment) {
                results.push({
                  type: "commentReply",
                  success: false,
                  error: match.error ?? `Could not find comment matching: "${reply.commentQuote.slice(0, 30)}..."`,
                });
                logger.error(match.error ?? `Could not find comment matching: "${reply.commentQuote.slice(0, 50)}..."`);
                continue;
              }

              const matchingComment = match.comment;
              await reader.replyToComment(
                docId,
                matchingComment.id,
                reply.reply,
                reply.resolve
              );
              results.push({ type: "commentReply", success: true });
              logger.trace("Reply posted successfully", { commentId: matchingComment.id });
            } catch (error) {
              results.push({
                type: "commentReply",
                success: false,
                error: String(error),
              });
              logger.error(`Failed to reply to comment ${i + 1}`, { error: String(error) });
            }
          }
        }

        // Apply suggestions and new comments via browser (only option for suggestions)
        const needsBrowser = suggestionsToApply.length > 0 || review.newComments.length > 0;
        if (needsBrowser) {
          console.log("   ✏️ Applying suggestions via browser (agent-browser)...");
          let client = session.getClient();
          if (!client) {
            client = await session.launch(true);
          }
          const writer = new DocsWriter(client);

          await writer.navigateToDocument(buildDocsUrl(docId));
          await writer.enableSuggestionMode();

          // Only pass suggestions and new comments (comment replies already done via API)
          const browserResults = await writer.applyAllChanges({
            suggestions: suggestionsToApply,
            commentReplies: [], // Already handled via API
            newComments: review.newComments,
          });

          results.push(...browserResults);
        }

        const applyDuration = Date.now() - applyStart;
        const totalDuration = Date.now() - startTime;

        // Show results summary
        const suggestionResults = results.filter((r) => r.type === "suggestion");
        const replyResults = results.filter((r) => r.type === "commentReply");
        const commentResults = results.filter((r) => r.type === "newComment");

        const suggestionSuccess = suggestionResults.filter((r) => r.success).length;
        const replySuccess = replyResults.filter((r) => r.success).length;
        const commentSuccess = commentResults.filter((r) => r.success).length;

        const anyFailures =
          suggestionSuccess < suggestionsToApply.length + skippedSuggestions ||
          replySuccess < review.commentReplies.length ||
          commentSuccess < review.newComments.length;

        console.log("\n📊 Results:");
        if (review.suggestions.length > 0) {
          console.log(`   Suggestions: ${suggestionSuccess}/${review.suggestions.length}`);
        }
        if (review.commentReplies.length > 0) {
          console.log(`   Comment replies: ${replySuccess}/${review.commentReplies.length}`);
        }
        if (review.newComments.length > 0) {
          console.log(`   New comments: ${commentSuccess}/${review.newComments.length}`);
        }
        console.log(`   ⏱️  Applied in ${formatDuration(applyDuration)}`);
        console.log(`   ⏱️  Total time: ${formatDuration(totalDuration)}`);

        if (anyFailures) {
          console.log("\n⚠️  Some actions failed. Check logs for details.");
          console.log(`   🔗 ${buildDocsUrl(docId)}`);
        } else {
          console.log("\n✅ Done! Check your document:");
          console.log(`   🔗 ${buildDocsUrl(docId)}`);
        }
      } else if (skippedSuggestions > 0) {
        console.log("\n⚠️  No changes applied due to ambiguous or missing matches.");
        console.log(`   🔗 ${buildDocsUrl(docId)}`);
      } else {
        console.log("\n✅ No changes needed.");
      }

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
    } finally {
      if (session) {
        try {
          await session.close();
        } catch (error) {
          logger.warn("Failed to close browser session", { error: String(error) });
        }
      }
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
