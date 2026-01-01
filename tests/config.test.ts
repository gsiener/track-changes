import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock dotenv before importing config
vi.mock("dotenv", () => ({
  config: vi.fn(),
}));

describe("config", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should load valid configuration", async () => {
    process.env.GOOGLE_SERVICE_ACCOUNT_PATH = "./credentials.json";
    process.env.CLAUDE_GOOGLE_EMAIL = "claude@example.com";
    process.env.CLAUDE_GOOGLE_PASSWORD = "password123";
    process.env.ANTHROPIC_API_KEY = "sk-ant-api-key";

    const { loadConfig } = await import("../src/config.js");
    const config = loadConfig();

    expect(config.googleServiceAccountPath).toBe("./credentials.json");
    expect(config.claudeGoogleEmail).toBe("claude@example.com");
    expect(config.claudeGooglePassword).toBe("password123");
    expect(config.anthropicApiKey).toBe("sk-ant-api-key");
  });

  it("should throw error for missing required fields", async () => {
    process.env.GOOGLE_SERVICE_ACCOUNT_PATH = "";
    process.env.CLAUDE_GOOGLE_EMAIL = "";
    process.env.CLAUDE_GOOGLE_PASSWORD = "";
    process.env.ANTHROPIC_API_KEY = "";

    const { loadConfig } = await import("../src/config.js");

    expect(() => loadConfig()).toThrow("Configuration error");
  });

  it("should validate Anthropic API key format", async () => {
    process.env.GOOGLE_SERVICE_ACCOUNT_PATH = "./credentials.json";
    process.env.CLAUDE_GOOGLE_EMAIL = "claude@example.com";
    process.env.CLAUDE_GOOGLE_PASSWORD = "password123";
    process.env.ANTHROPIC_API_KEY = "invalid-key";

    const { loadConfig } = await import("../src/config.js");

    expect(() => loadConfig()).toThrow("Invalid Anthropic API key format");
  });

  it("should validate email format", async () => {
    process.env.GOOGLE_SERVICE_ACCOUNT_PATH = "./credentials.json";
    process.env.CLAUDE_GOOGLE_EMAIL = "not-an-email";
    process.env.CLAUDE_GOOGLE_PASSWORD = "password123";
    process.env.ANTHROPIC_API_KEY = "sk-ant-api-key";

    const { loadConfig } = await import("../src/config.js");

    expect(() => loadConfig()).toThrow("Valid email required");
  });
});
