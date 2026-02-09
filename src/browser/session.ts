import type { Page } from "playwright-core";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync, mkdirSync } from "fs";
import { logger } from "../utils/logger.js";
import { AgentBrowserClient } from "./agent-browser-client.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const USER_DATA_DIR = join(__dirname, "../../agent-browser-data");

/**
 * BrowserSession - Manages browser lifecycle using agent-browser.
 *
 * Migrated from direct Playwright usage to agent-browser for:
 * - Better element selection via accessibility tree refs
 * - More stable interactions with complex SPAs like Google Docs
 * - Unified session management across the daemon
 */
export class BrowserSession {
  private client: AgentBrowserClient | null = null;

  /**
   * Launch browser for automated operations.
   * Loads saved session state if available.
   */
  async launch(headless: boolean = true): Promise<AgentBrowserClient> {
    logger.trace("Launching browser via agent-browser", { headless, userDataDir: USER_DATA_DIR });

    // Ensure data directory exists
    if (!existsSync(USER_DATA_DIR)) {
      mkdirSync(USER_DATA_DIR, { recursive: true });
    }

    this.client = new AgentBrowserClient();

    // Check for existing session state
    const storagePath = this.getStorageStatePath();
    const hasExistingSession = existsSync(storagePath);

    if (hasExistingSession) {
      logger.trace("Found saved session, will restore after launch");
    } else {
      logger.warn("No saved session found - you may need to log in");
    }

    // Launch browser
    await this.client.launch({
      headless,
      viewport: { width: 1280, height: 800 },
    });

    // Load existing session state if available
    // Note: agent-browser handles this differently - we load cookies after page exists
    if (hasExistingSession) {
      try {
        const page = this.client.getPage();
        const context = page.context();
        const state = await import("fs/promises").then((fs) => fs.readFile(storagePath, "utf-8"));
        const parsed = JSON.parse(state);

        // Set cookies from saved state
        if (parsed.cookies && parsed.cookies.length > 0) {
          await context.addCookies(parsed.cookies);
          logger.trace("Session cookies restored");
        }
      } catch (err) {
        logger.warn("Failed to restore session state", { error: String(err) });
      }
    }

    return this.client;
  }

  /**
   * Launch browser for manual login (non-headless).
   * Returns the page for user interaction.
   */
  async launchForLogin(): Promise<Page> {
    logger.trace("Launching browser for manual login");

    // Ensure data directory exists
    if (!existsSync(USER_DATA_DIR)) {
      mkdirSync(USER_DATA_DIR, { recursive: true });
    }

    this.client = new AgentBrowserClient();

    await this.client.launch({
      headless: false,
      viewport: { width: 1280, height: 800 },
    });

    return this.client.getPage();
  }

  /**
   * Save the current session state (cookies, localStorage).
   */
  async saveSession(): Promise<void> {
    if (!this.client) {
      throw new Error("No browser client to save");
    }

    const storagePath = this.getStorageStatePath();
    await this.client.saveStorageState(storagePath);
    logger.trace("Session saved", { path: storagePath });
  }

  /**
   * Close the browser and clean up resources.
   */
  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
    }
    logger.trace("Browser closed");
  }

  /**
   * Get the AgentBrowserClient instance.
   * Returns null if not launched.
   */
  getClient(): AgentBrowserClient | null {
    return this.client;
  }

  /**
   * Get the current Page from the client.
   * Throws if browser not launched.
   */
  getPage(): Page {
    if (!this.client) {
      throw new Error("Browser not launched. Call launch() first.");
    }
    return this.client.getPage();
  }

  private getStorageStatePath(): string {
    return join(USER_DATA_DIR, "storage-state.json");
  }
}
