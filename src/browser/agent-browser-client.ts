/**
 * Agent Browser Client - Wrapper around BrowserManager for track-changes usage.
 *
 * This module provides a clean interface to agent-browser's BrowserManager,
 * exposing only the functionality we need while providing better error handling
 * and logging.
 */

import { BrowserManager } from "agent-browser/dist/browser.js";
import type { Page, Locator } from "playwright-core";
import type { RefMap, EnhancedSnapshot } from "agent-browser/dist/snapshot.js";
import { logger } from "../utils/logger.js";

export interface AgentBrowserOptions {
  headless?: boolean;
  viewport?: { width: number; height: number };
  storageStatePath?: string;
}

/**
 * Client wrapper for agent-browser's BrowserManager.
 * Provides a cleaner interface and maintains compatibility with existing code patterns.
 */
export class AgentBrowserClient {
  private manager: BrowserManager;
  private launched = false;

  constructor() {
    this.manager = new BrowserManager();
  }

  /**
   * Launch the browser with specified options.
   */
  async launch(options: AgentBrowserOptions = {}): Promise<void> {
    if (this.launched) {
      logger.debug("Browser already launched");
      return;
    }

    logger.trace("Launching browser via agent-browser", {
      headless: options.headless ?? true,
      viewport: options.viewport,
    });

    await this.manager.launch({
      id: "launch",
      action: "launch",
      headless: options.headless ?? true,
      viewport: options.viewport ?? { width: 1280, height: 800 },
    });

    this.launched = true;
    logger.trace("Browser launched successfully");
  }

  /**
   * Get the current Playwright Page object.
   * This allows using familiar Playwright APIs for interactions.
   */
  getPage(): Page {
    if (!this.launched) {
      throw new Error("Browser not launched. Call launch() first.");
    }
    return this.manager.getPage();
  }

  /**
   * Get an accessibility tree snapshot with element refs.
   * @param options.interactive - Only include interactive elements
   * @param options.compact - Remove structural elements without content
   */
  async getSnapshot(options?: {
    interactive?: boolean;
    compact?: boolean;
    maxDepth?: number;
    selector?: string;
  }): Promise<EnhancedSnapshot> {
    if (!this.launched) {
      throw new Error("Browser not launched. Call launch() first.");
    }
    return this.manager.getSnapshot(options);
  }

  /**
   * Get the cached ref map from the last snapshot.
   */
  getRefMap(): RefMap {
    return this.manager.getRefMap();
  }

  /**
   * Get a Playwright Locator from a ref (e.g., "e1", "@e1", "ref=e1").
   * Returns null if ref doesn't exist or is invalid.
   */
  getLocatorFromRef(ref: string): Locator | null {
    if (!this.launched) {
      throw new Error("Browser not launched. Call launch() first.");
    }
    return this.manager.getLocatorFromRef(ref);
  }

  /**
   * Get a Playwright Locator - supports both refs and regular selectors.
   */
  getLocator(selectorOrRef: string): Locator {
    if (!this.launched) {
      throw new Error("Browser not launched. Call launch() first.");
    }
    return this.manager.getLocator(selectorOrRef);
  }

  /**
   * Check if a selector string looks like a ref (e.g., "@e1").
   */
  isRef(selector: string): boolean {
    return this.manager.isRef(selector);
  }

  /**
   * Save the current storage state (cookies, localStorage) to a file.
   */
  async saveStorageState(path: string): Promise<void> {
    if (!this.launched) {
      throw new Error("Browser not launched. Call launch() first.");
    }
    await this.manager.saveStorageState(path);
    logger.trace("Storage state saved", { path });
  }

  /**
   * Set the viewport size.
   */
  async setViewport(width: number, height: number): Promise<void> {
    if (!this.launched) {
      throw new Error("Browser not launched. Call launch() first.");
    }
    await this.manager.setViewport(width, height);
  }

  /**
   * Check if the browser is currently launched.
   */
  isLaunched(): boolean {
    return this.launched && this.manager.isLaunched();
  }

  /**
   * Close the browser and clean up resources.
   */
  async close(): Promise<void> {
    if (this.launched) {
      await this.manager.close();
      this.launched = false;
      logger.trace("Browser closed");
    }
  }
}
