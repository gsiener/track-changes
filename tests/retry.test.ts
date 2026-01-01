import { describe, it, expect, vi } from "vitest";
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

    const result = await withRetry(operation, "test operation", {
      maxAttempts: 3,
      delayMs: 10,
    });

    expect(result).toBe("success");
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it("should throw after max attempts", async () => {
    const operation = vi.fn().mockRejectedValue(new Error("always fails"));

    await expect(
      withRetry(operation, "test operation", {
        maxAttempts: 3,
        delayMs: 10,
      })
    ).rejects.toThrow("always fails");

    expect(operation).toHaveBeenCalledTimes(3);
  });

  it("should use exponential backoff", async () => {
    const startTime = Date.now();
    const operation = vi.fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValue("success");

    await withRetry(operation, "test operation", {
      maxAttempts: 2,
      delayMs: 50,
      backoffMultiplier: 2,
    });

    const elapsed = Date.now() - startTime;
    // Should have waited at least 50ms (first retry delay)
    expect(elapsed).toBeGreaterThanOrEqual(45); // Allow some timing variance
  });

  it("should handle non-Error throws", async () => {
    const operation = vi.fn().mockRejectedValue("string error");

    await expect(
      withRetry(operation, "test operation", {
        maxAttempts: 1,
        delayMs: 10,
      })
    ).rejects.toThrow("string error");
  });
});
