import { logger } from "../utils/logger.js";

export interface RetryOptions {
  maxAttempts: number;
  delayMs: number;
  backoffMultiplier: number;
}

const defaultOptions: RetryOptions = {
  maxAttempts: 3,
  delayMs: 1000,
  backoffMultiplier: 2,
};

export async function withRetry<T>(
  operation: () => Promise<T>,
  operationName: string,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts = { ...defaultOptions, ...options };
  let lastError: Error | undefined;
  let delay = opts.delayMs;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < opts.maxAttempts) {
        logger.warn(`${operationName} failed (attempt ${attempt}/${opts.maxAttempts})`, {
          error: lastError.message,
          retryingIn: `${delay}ms`,
        });
        await sleep(delay);
        delay *= opts.backoffMultiplier;
      }
    }
  }

  logger.error(`${operationName} failed after ${opts.maxAttempts} attempts`, {
    error: lastError?.message,
  });

  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
