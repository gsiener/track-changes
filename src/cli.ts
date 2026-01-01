#!/usr/bin/env node

import { Command } from "commander";
import { loadConfig } from "./config.js";
import { logger } from "./utils/logger.js";
import { extractDocId } from "./utils/url.js";

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

      // TODO: Implement full flow
      // 1. Fetch document content via Google Docs API
      // 2. Send to Claude for analysis
      // 3. Apply suggestions via Playwright (unless dry-run)

      logger.warn("Full implementation not yet complete");

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
      loadConfig();
      logger.info("Opening browser for manual Google login...");

      // TODO: Open Playwright browser for manual login
      // This saves session state for future automated runs

      logger.warn("Login command not yet implemented");

    } catch (error) {
      logger.error("Login failed", { error: String(error) });
      process.exit(1);
    }
  });

program.parse();
