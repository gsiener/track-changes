/**
 * Page interaction helpers that reduce boilerplate for common Playwright patterns.
 *
 * Key abstractions:
 * - findFirst: Try multiple selectors, return first match
 * - clickFirst: Find and click with fallback strategies
 * - fillFirst: Find input and fill with value
 */

import type { Page, ElementHandle } from "playwright";
import { logger } from "../utils/logger.js";

/**
 * Timeout constants with explanations.
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
 * Find the first element matching any of the given selectors.
 * Tries each selector in order until one matches.
 *
 * @param page - Playwright page
 * @param selectors - Array of CSS selectors to try
 * @param options - Optional configuration
 * @returns The first matching element, or null if none found
 */
export async function findFirst(
  page: Page,
  selectors: string[],
  options: {
    visible?: boolean;
    parent?: ElementHandle;
    logPrefix?: string;
  } = {}
): Promise<ElementHandle | null> {
  const { visible = false, parent, logPrefix = "Element" } = options;
  const context = parent || page;

  for (const selector of selectors) {
    try {
      const element = await context.$(selector);
      if (element) {
        if (visible) {
          const isVisible = await element.isVisible();
          if (!isVisible) continue;
        }
        logger.debug(`${logPrefix} found`, { selector });
        return element;
      }
    } catch {
      // Selector failed, try next
    }
  }
  return null;
}

/**
 * Find and click the first matching element.
 * Includes fallback strategies: normal click -> force click -> JS click
 *
 * @param page - Playwright page
 * @param selectors - Array of CSS selectors to try
 * @param options - Optional configuration
 */
export async function clickFirst(
  page: Page,
  selectors: string[],
  options: {
    parent?: ElementHandle;
    logPrefix?: string;
    timeout?: number;
  } = {}
): Promise<void> {
  const { parent, logPrefix = "Element", timeout = 5000 } = options;

  const element = await findFirst(page, selectors, { parent, logPrefix });
  if (!element) {
    throw new Error(`${logPrefix} not found. Tried: ${selectors.join(", ")}`);
  }

  await clickElement(element, { logPrefix, timeout });
}

/**
 * Click an element with fallback strategies.
 */
export async function clickElement(
  element: ElementHandle,
  options: { logPrefix?: string; timeout?: number } = {}
): Promise<void> {
  const { logPrefix = "Element", timeout = 5000 } = options;

  // Try normal click first
  try {
    await element.click({ timeout });
    logger.debug(`${logPrefix} clicked`);
    return;
  } catch (err) {
    logger.debug(`${logPrefix} normal click failed, trying force click`);
  }

  // Try force click
  try {
    await element.click({ force: true });
    logger.debug(`${logPrefix} force clicked`);
    return;
  } catch (err) {
    logger.debug(`${logPrefix} force click failed, trying JS click`);
  }

  // Try JavaScript click as last resort
  await element.evaluate((el: HTMLElement) => el.click());
  logger.debug(`${logPrefix} JS clicked`);
}

/**
 * Find an input and fill it with a value.
 *
 * @param page - Playwright page
 * @param selectors - Array of CSS selectors to try
 * @param value - Value to fill
 * @param options - Optional configuration
 */
export async function fillFirst(
  page: Page,
  selectors: string[],
  value: string,
  options: { logPrefix?: string } = {}
): Promise<void> {
  const { logPrefix = "Input" } = options;

  const element = await findFirst(page, selectors, { logPrefix });
  if (!element) {
    throw new Error(`${logPrefix} not found. Tried: ${selectors.join(", ")}`);
  }

  await element.fill(value);
  logger.debug(`${logPrefix} filled`, { length: value.length });
}

/**
 * Close any open dialogs - tries multiple strategies.
 */
export async function dismissDialogs(page: Page): Promise<void> {
  // First, try to click "I understand" button (view history dialog)
  try {
    const understoodBtn = await page.$('button:has-text("I understand")');
    if (understoodBtn) {
      await understoodBtn.click();
      logger.debug("Clicked 'I understand' button");
      await page.waitForTimeout(TIMEOUTS.BUTTON_ACTION);
      return;
    }
  } catch {
    // Continue
  }

  // Try to click "Got it" button (other onboarding dialogs)
  try {
    const gotItBtn = await page.$('button:has-text("Got it")');
    if (gotItBtn) {
      await gotItBtn.click();
      logger.debug("Clicked 'Got it' button");
      await page.waitForTimeout(TIMEOUTS.BUTTON_ACTION);
      return;
    }
  } catch {
    // Continue
  }

  // Try to click dialog close button
  try {
    const closeBtn = await page.$('[aria-label="Close"], [aria-label="Dismiss"]');
    if (closeBtn) {
      await closeBtn.click();
      logger.debug("Clicked close button");
      await page.waitForTimeout(TIMEOUTS.BUTTON_ACTION);
      return;
    }
  } catch {
    // Continue
  }

  // Fallback: press Escape
  await page.keyboard.press("Escape");
  await page.waitForTimeout(TIMEOUTS.KEY_PRESS);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(TIMEOUTS.KEY_PRESS);
}
