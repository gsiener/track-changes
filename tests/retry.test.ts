import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { withRetry } from "../src/browser/retry.js";

// Mock logger to avoid console output during tests
vi.mock("../src/utils/logger.js", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("withRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });
  it("should return result on first success", async () => {
    const operation = vi.fn().mockResolvedValue("success");

    const result = await withRetry(operation, "test operation");

    expect(result).toBe("success");
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("should retry on failure and succeed", async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(new Error("fail 1"))
      .mockRejectedValueOnce(new Error("fail 2"))
      .mockResolvedValue("success");

    const retryPromise = withRetry(operation, "test operation", {
      maxAttempts: 3,
      delayMs: 10,
    });

    await vi.runAllTimersAsync();
    const result = await retryPromise;

    expect(result).toBe("success");
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it("should throw after max attempts", async () => {
    const operation = vi.fn().mockRejectedValue(new Error("always fails"));

    const retryPromise = withRetry(operation, "test operation", {
      maxAttempts: 3,
      delayMs: 10,
    }).catch((e) => e); // Catch to prevent unhandled rejection

    await vi.runAllTimersAsync();

    const error = await retryPromise;
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("always fails");
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it("should use exponential backoff", async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValue("success");

    const retryPromise = withRetry(operation, "test operation", {
      maxAttempts: 2,
      delayMs: 50,
      backoffMultiplier: 2,
    });

    // First attempt fails immediately, then waits 50ms before retry
    expect(operation).toHaveBeenCalledTimes(1);

    // Advance by 50ms to trigger retry
    await vi.advanceTimersByTimeAsync(50);
    await retryPromise;

    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("should handle non-Error throws", async () => {
    const operation = vi.fn().mockRejectedValue("string error");

    const retryPromise = withRetry(operation, "test operation", {
      maxAttempts: 1,
      delayMs: 10,
    }).catch((e) => e); // Catch to prevent unhandled rejection

    await vi.runAllTimersAsync();

    const error = await retryPromise;
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("string error");
  });
});
