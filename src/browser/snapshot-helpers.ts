/**
 * Snapshot-based interaction helpers using agent-browser's ref system.
 *
 * These helpers replace the CSS selector-based page-helpers.ts with
 * accessibility tree snapshot-based element finding. This is more stable
 * because it uses the same semantics as screen readers.
 *
 * Key differences from page-helpers.ts:
 * - Uses getSnapshot() + refs instead of CSS selectors
 * - Matches elements by role, name, and text (accessible properties)
 * - Falls back to Playwright locators when needed
 */

import type { Page, Locator } from "playwright-core";
import type { AgentBrowserClient } from "./agent-browser-client.js";
import { type ElementMatcher, matchesElement } from "./matchers.js";
import { logger } from "../utils/logger.js";

/**
 * Timeout constants for Google Docs interactions.
 * Google Docs is a complex SPA - these waits account for its rendering pipeline.
 */
export const TIMEOUTS = {
  /** After navigation, wait for initial render */
  PAGE_LOAD: 5000,
  /** After clicking menu, wait for dropdown to appear */
  MENU_OPEN: 500,
  /** After clicking menu item, wait for dialog/action */
  MENU_ACTION: 1000,
  /** After typing in input, wait for UI to update */
  INPUT_SETTLE: 300,
  /** After triggering search, wait for results */
  SEARCH_COMPLETE: 1000,
  /** After clicking button, wait for action to complete */
  BUTTON_ACTION: 500,
  /** After clicking comment, wait for expansion animation */
  COMMENT_EXPAND: 1500,
  /** Quick pause between sequential keyboard actions */
  KEY_PRESS: 300,
} as const;

/**
 * Wait for a specified duration.
 */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Find an element in the snapshot by matching against ElementMatchers.
 * Tries matchers in order and returns the first match.
 *
 * @returns The ref and element info, or null if not found
 */
export async function findElementByMatcher(
  client: AgentBrowserClient,
  matchers: ElementMatcher[],
  options: { logPrefix?: string } = {}
): Promise<{ ref: string; role: string; name?: string } | null> {
  const { logPrefix = "Element" } = options;

  // Get fresh snapshot with interactive elements
  const snapshot = await client.getSnapshot({ interactive: true, compact: true });
  const refMap = client.getRefMap();

  // Try each matcher in order
  for (const matcher of matchers) {
    for (const [ref, info] of Object.entries(refMap)) {
      const element = {
        role: info.role,
        name: info.name,
      };

      if (matchesElement(element, matcher)) {
        logger.debug(`${logPrefix} found via snapshot`, { ref, role: info.role, name: info.name });
        return { ref, role: info.role, name: info.name };
      }
    }
  }

  logger.debug(`${logPrefix} not found in snapshot`, { matcherCount: matchers.length });
  return null;
}

/**
 * Find and click an element using snapshot-based matching.
 *
 * @param client - AgentBrowserClient instance
 * @param matchers - Array of matchers to try in order
 * @param options - Options for the click
 */
export async function clickByMatcher(
  client: AgentBrowserClient,
  matchers: ElementMatcher[],
  options: { logPrefix?: string; timeout?: number } = {}
): Promise<void> {
  const { logPrefix = "Element", timeout = 5000 } = options;

  const found = await findElementByMatcher(client, matchers, { logPrefix });
  if (!found) {
    throw new Error(`${logPrefix} not found. Tried ${matchers.length} matchers.`);
  }

  const locator = client.getLocatorFromRef(found.ref);
  if (!locator) {
    throw new Error(`${logPrefix} ref ${found.ref} not found in locator map.`);
  }

  // Try to click with retry fallbacks
  try {
    await locator.click({ timeout });
    logger.debug(`${logPrefix} clicked via ref`, { ref: found.ref });
    return;
  } catch (err) {
    logger.debug(`${logPrefix} normal click failed, trying force click`);
  }

  try {
    await locator.click({ force: true });
    logger.debug(`${logPrefix} force clicked via ref`, { ref: found.ref });
    return;
  } catch (err) {
    logger.debug(`${logPrefix} force click failed, trying JS click`);
  }

  // Last resort: JavaScript click
  await locator.evaluate((el: HTMLElement) => el.click());
  logger.debug(`${logPrefix} JS clicked via ref`, { ref: found.ref });
}

/**
 * Find and fill an input element using snapshot-based matching.
 *
 * @param client - AgentBrowserClient instance
 * @param matchers - Array of matchers to try in order
 * @param value - Value to fill
 * @param options - Options for the fill
 */
export async function fillByMatcher(
  client: AgentBrowserClient,
  matchers: ElementMatcher[],
  value: string,
  options: { logPrefix?: string } = {}
): Promise<void> {
  const { logPrefix = "Input" } = options;

  const found = await findElementByMatcher(client, matchers, { logPrefix });
  if (!found) {
    throw new Error(`${logPrefix} not found. Tried ${matchers.length} matchers.`);
  }

  const locator = client.getLocatorFromRef(found.ref);
  if (!locator) {
    throw new Error(`${logPrefix} ref ${found.ref} not found in locator map.`);
  }

  await locator.fill(value);
  logger.debug(`${logPrefix} filled via ref`, { ref: found.ref, length: value.length });
}

/**
 * Dismiss any open dialogs - tries multiple strategies.
 * Based on common dialog patterns in Google Docs.
 */
export async function dismissDialogs(client: AgentBrowserClient): Promise<void> {
  const page = client.getPage();

  // Get snapshot to check for dialog buttons
  try {
    const snapshot = await client.getSnapshot({ interactive: true, compact: true });
    const refMap = client.getRefMap();

    // Look for common dismissal patterns
    const dismissPatterns: ElementMatcher[] = [
      { role: "button", text: "I understand" },
      { role: "button", text: "Got it" },
      { role: "button", name: /close/i },
      { role: "button", name: /dismiss/i },
    ];

    for (const pattern of dismissPatterns) {
      for (const [ref, info] of Object.entries(refMap)) {
        const element = { role: info.role, name: info.name };
        if (matchesElement(element, pattern)) {
          const locator = client.getLocatorFromRef(ref);
          if (locator) {
            try {
              await locator.click({ timeout: 1000 });
              logger.debug("Dismissed dialog via button", { ref, name: info.name });
              await wait(TIMEOUTS.BUTTON_ACTION);
              return;
            } catch {
              // Button might not be clickable, continue
            }
          }
        }
      }
    }
  } catch {
    // Snapshot failed, fall back to keyboard
  }

  // Fallback: press Escape twice
  await page.keyboard.press("Escape");
  await wait(TIMEOUTS.KEY_PRESS);
  await page.keyboard.press("Escape");
  await wait(TIMEOUTS.KEY_PRESS);
  logger.debug("Dismissed dialogs via Escape");
}

/**
 * Click using a CSS selector fallback (for when snapshot matching isn't reliable).
 * This maintains compatibility with existing code patterns.
 */
export async function clickBySelector(
  client: AgentBrowserClient,
  selectors: string[],
  options: { logPrefix?: string; timeout?: number } = {}
): Promise<void> {
  const { logPrefix = "Element", timeout = 5000 } = options;
  const page = client.getPage();

  for (const selector of selectors) {
    try {
      // First try agent-browser's getLocator which handles both refs and selectors
      const locator = client.getLocator(selector);
      await locator.click({ timeout });
      logger.debug(`${logPrefix} clicked via selector`, { selector });
      return;
    } catch {
      // Try next selector
    }
  }

  // Try direct page.$ as fallback
  for (const selector of selectors) {
    try {
      const element = await page.$(selector);
      if (element) {
        await element.click();
        logger.debug(`${logPrefix} clicked via page.$`, { selector });
        return;
      }
    } catch {
      // Try next selector
    }
  }

  throw new Error(`${logPrefix} not found. Tried: ${selectors.join(", ")}`);
}

/**
 * Fill an input using a CSS selector fallback.
 */
export async function fillBySelector(
  client: AgentBrowserClient,
  selectors: string[],
  value: string,
  options: { logPrefix?: string } = {}
): Promise<void> {
  const { logPrefix = "Input" } = options;
  const page = client.getPage();

  for (const selector of selectors) {
    try {
      const locator = client.getLocator(selector);
      await locator.fill(value);
      logger.debug(`${logPrefix} filled via selector`, { selector, length: value.length });
      return;
    } catch {
      // Try next selector
    }
  }

  // Fallback to page.$
  for (const selector of selectors) {
    try {
      const element = await page.$(selector);
      if (element) {
        await element.fill(value);
        logger.debug(`${logPrefix} filled via page.$`, { selector, length: value.length });
        return;
      }
    } catch {
      // Try next selector
    }
  }

  throw new Error(`${logPrefix} not found. Tried: ${selectors.join(", ")}`);
}
