import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";
import { logger } from "../utils/logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const USER_DATA_DIR = join(__dirname, "../../playwright/user-data");

export class BrowserSession {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;

  async launch(headless: boolean = true): Promise<BrowserContext> {
    logger.info("Launching browser", { headless, userDataDir: USER_DATA_DIR });

    this.browser = await chromium.launch({ headless });

    // Only use saved session if it exists
    const storagePath = this.getStorageStatePath();
    const contextOptions: { viewport: { width: number; height: number }; storageState?: string } = {
      viewport: { width: 1280, height: 800 },
    };

    if (existsSync(storagePath)) {
      logger.info("Using saved session");
      contextOptions.storageState = storagePath;
    } else {
      logger.warn("No saved session found - you may need to log in");
    }

    this.context = await this.browser.newContext(contextOptions);
    return this.context;
  }

  async launchForLogin(): Promise<Page> {
    logger.info("Launching browser for manual login");

    this.browser = await chromium.launch({ headless: false });
    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 800 },
    });

    const page = await this.context.newPage();
    return page;
  }

  async saveSession(): Promise<void> {
    if (!this.context) {
      throw new Error("No browser context to save");
    }

    const storagePath = this.getStorageStatePath();
    await this.context.storageState({ path: storagePath });
    logger.info("Session saved", { path: storagePath });
  }

  async close(): Promise<void> {
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    logger.info("Browser closed");
  }

  getContext(): BrowserContext | null {
    return this.context;
  }

  private getStorageStatePath(): string {
    return join(USER_DATA_DIR, "storage-state.json");
  }
}
