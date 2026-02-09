import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { AgentBrowserClient } from "../src/browser/agent-browser-client.js";

// Mock logger
vi.mock("../src/utils/logger.js", () => ({
  logger: {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("snapshot-helpers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("TIMEOUTS", () => {
    it("should export all required timeout constants", async () => {
      const { TIMEOUTS } = await import("../src/browser/snapshot-helpers.js");

      expect(TIMEOUTS.PAGE_LOAD).toBeDefined();
      expect(TIMEOUTS.MENU_OPEN).toBeDefined();
      expect(TIMEOUTS.MENU_ACTION).toBeDefined();
      expect(TIMEOUTS.INPUT_SETTLE).toBeDefined();
      expect(TIMEOUTS.SEARCH_COMPLETE).toBeDefined();
      expect(TIMEOUTS.BUTTON_ACTION).toBeDefined();
      expect(TIMEOUTS.COMMENT_EXPAND).toBeDefined();
      expect(TIMEOUTS.KEY_PRESS).toBeDefined();
    });

    it("should have reasonable timeout values", async () => {
      const { TIMEOUTS } = await import("../src/browser/snapshot-helpers.js");

      // Timeouts should be positive numbers
      Object.values(TIMEOUTS).forEach((timeout) => {
        expect(typeof timeout).toBe("number");
        expect(timeout).toBeGreaterThan(0);
      });

      // Page load should be longer than key press
      expect(TIMEOUTS.PAGE_LOAD).toBeGreaterThan(TIMEOUTS.KEY_PRESS);
    });
  });

  describe("wait", () => {
    it("should wait for the specified duration", async () => {
      const { wait } = await import("../src/browser/snapshot-helpers.js");

      const waitPromise = wait(50);

      // Timer should be pending
      vi.advanceTimersByTime(49);
      expect(vi.getTimerCount()).toBe(1);

      // Advance past the wait time
      vi.advanceTimersByTime(1);
      await waitPromise;
    });
  });

  describe("findElementByMatcher", () => {
    function createMockClient(refMap: Record<string, { selector: string; role: string; name?: string }>) {
      return {
        getPage: vi.fn(),
        getSnapshot: vi.fn().mockResolvedValue({ tree: "", refs: refMap }),
        getRefMap: vi.fn().mockReturnValue(refMap),
        getLocatorFromRef: vi.fn().mockReturnValue(null),
        getLocator: vi.fn().mockReturnValue(null),
        isRef: vi.fn().mockReturnValue(false),
        launch: vi.fn(),
        saveStorageState: vi.fn(),
        setViewport: vi.fn(),
        isLaunched: vi.fn().mockReturnValue(true),
        close: vi.fn(),
      } as unknown as AgentBrowserClient;
    }

    it("should find element matching role", async () => {
      const { findElementByMatcher } = await import("../src/browser/snapshot-helpers.js");

      const refMap = {
        e1: { selector: "button", role: "button", name: "Submit" },
        e2: { selector: "input", role: "textbox", name: "Email" },
      };
      const client = createMockClient(refMap);

      const result = await findElementByMatcher(client, [{ role: "button" }]);

      expect(result).not.toBeNull();
      expect(result?.ref).toBe("e1");
      expect(result?.role).toBe("button");
    });

    it("should find element matching name", async () => {
      const { findElementByMatcher } = await import("../src/browser/snapshot-helpers.js");

      const refMap = {
        e1: { selector: "button", role: "button", name: "Cancel" },
        e2: { selector: "button", role: "button", name: "Submit" },
      };
      const client = createMockClient(refMap);

      const result = await findElementByMatcher(client, [{ name: "Submit" }]);

      expect(result).not.toBeNull();
      expect(result?.ref).toBe("e2");
    });

    it("should try matchers in order and return first match", async () => {
      const { findElementByMatcher } = await import("../src/browser/snapshot-helpers.js");

      const refMap = {
        e1: { selector: "button", role: "button", name: "Primary" },
        e2: { selector: "button", role: "button", name: "Secondary" },
      };
      const client = createMockClient(refMap);

      // First matcher won't match, second will
      const result = await findElementByMatcher(client, [
        { name: "NonExistent" },
        { name: "Secondary" },
      ]);

      expect(result).not.toBeNull();
      expect(result?.ref).toBe("e2");
    });

    it("should return null when no element matches", async () => {
      const { findElementByMatcher } = await import("../src/browser/snapshot-helpers.js");

      const refMap = {
        e1: { selector: "button", role: "button", name: "Submit" },
      };
      const client = createMockClient(refMap);

      const result = await findElementByMatcher(client, [{ name: "NonExistent" }]);

      expect(result).toBeNull();
    });
  });

  describe("dismissDialogs", () => {
    it("should press Escape twice as fallback", async () => {
      const { dismissDialogs } = await import("../src/browser/snapshot-helpers.js");

      const mockKeyboard = {
        press: vi.fn().mockResolvedValue(undefined),
      };
      const mockPage = {
        keyboard: mockKeyboard,
      };
      const mockClient = {
        getPage: vi.fn().mockReturnValue(mockPage),
        getSnapshot: vi.fn().mockResolvedValue({ tree: "", refs: {} }),
        getRefMap: vi.fn().mockReturnValue({}),
        getLocatorFromRef: vi.fn().mockReturnValue(null),
      } as unknown as AgentBrowserClient;

      const dismissPromise = dismissDialogs(mockClient);

      // Advance through all the waits
      await vi.runAllTimersAsync();
      await dismissPromise;

      // Should press Escape at least once
      expect(mockKeyboard.press).toHaveBeenCalledWith("Escape");
    });
  });
});
