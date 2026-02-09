import { describe, it, expect } from "vitest";
import { prepareSuggestionsForApply } from "../src/utils/suggestion-validation.js";

describe("prepareSuggestionsForApply", () => {
  it("accepts suggestions with a unique match", () => {
    const body = "Hello world. Unique sentence here.";
    const result = prepareSuggestionsForApply(body, [
      { findText: "Unique sentence", replaceWith: "Updated sentence" },
    ]);

    expect(result.suggestions).toHaveLength(1);
    expect(result.failures).toHaveLength(0);
  });

  it("rejects suggestions with no matches", () => {
    const body = "Hello world.";
    const result = prepareSuggestionsForApply(body, [
      { findText: "Missing text", replaceWith: "Replacement" },
    ]);

    expect(result.suggestions).toHaveLength(0);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].reason).toContain("No match found");
  });

  it("rejects suggestions with multiple matches and no contextBefore", () => {
    const body = "Repeat this. Repeat this.";
    const result = prepareSuggestionsForApply(body, [
      { findText: "Repeat this", replaceWith: "Updated" },
    ]);

    expect(result.suggestions).toHaveLength(0);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].reason).toContain("multiple times");
  });

  it("uses contextBefore to disambiguate when combined match is unique", () => {
    const body = "Alpha beta. Gamma beta.";
    const result = prepareSuggestionsForApply(body, [
      {
        findText: "beta",
        contextBefore: "Gamma ",
        replaceWith: "delta",
      },
    ]);

    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0].findText).toBe("Gamma beta");
    expect(result.suggestions[0].replaceWith).toBe("Gamma delta");
    expect(result.failures).toHaveLength(0);
  });

  it("rejects contextBefore when still ambiguous", () => {
    const body = "Alpha beta. Alpha beta.";
    const result = prepareSuggestionsForApply(body, [
      {
        findText: "beta",
        contextBefore: "Alpha ",
        replaceWith: "delta",
      },
    ]);

    expect(result.suggestions).toHaveLength(0);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].reason).toContain("ambiguous");
  });

  it("rejects empty findText", () => {
    const body = "Hello world.";
    const result = prepareSuggestionsForApply(body, [
      { findText: "   ", replaceWith: "Updated" },
    ]);

    expect(result.suggestions).toHaveLength(0);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].reason).toContain("empty");
  });
});
