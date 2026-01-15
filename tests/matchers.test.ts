import { describe, it, expect } from "vitest";
import { matchesElement, matchers } from "../src/browser/matchers.js";

describe("matchers", () => {
  describe("matchesElement", () => {
    it("should match by role", () => {
      const element = { role: "button", name: "Submit" };
      expect(matchesElement(element, { role: "button" })).toBe(true);
      expect(matchesElement(element, { role: "textbox" })).toBe(false);
    });

    it("should match role case-insensitively", () => {
      const element = { role: "Button", name: "Submit" };
      expect(matchesElement(element, { role: "button" })).toBe(true);
      expect(matchesElement(element, { role: "BUTTON" })).toBe(true);
    });

    it("should match by role array", () => {
      const element = { role: "textbox", name: "Input" };
      expect(matchesElement(element, { role: ["button", "textbox"] })).toBe(true);
      expect(matchesElement(element, { role: ["button", "combobox"] })).toBe(false);
    });

    it("should match by name string (partial, case-insensitive)", () => {
      const element = { role: "button", name: "Submit Form" };
      expect(matchesElement(element, { name: "Submit" })).toBe(true);
      expect(matchesElement(element, { name: "submit" })).toBe(true);
      expect(matchesElement(element, { name: "Cancel" })).toBe(false);
    });

    it("should match by name regex", () => {
      const element = { role: "button", name: "Submit Form" };
      expect(matchesElement(element, { name: /Submit/i })).toBe(true);
      expect(matchesElement(element, { name: /^Submit/ })).toBe(true);
      expect(matchesElement(element, { name: /Cancel/ })).toBe(false);
    });

    it("should return false when name is required but element has no name", () => {
      const element = { role: "button" };
      expect(matchesElement(element, { name: "Submit" })).toBe(false);
    });

    it("should match by text string (exact, case-insensitive)", () => {
      const element = { role: "button", text: "Replace" };
      expect(matchesElement(element, { text: "Replace" })).toBe(true);
      expect(matchesElement(element, { text: "replace" })).toBe(true);
      expect(matchesElement(element, { text: "Replace all" })).toBe(false);
    });

    it("should match by text regex", () => {
      const element = { role: "button", text: "Replace all items" };
      expect(matchesElement(element, { text: /Replace/i })).toBe(true);
      expect(matchesElement(element, { text: /items$/ })).toBe(true);
      expect(matchesElement(element, { text: /Cancel/ })).toBe(false);
    });

    it("should use name as fallback when text is not set", () => {
      const element = { role: "button", name: "Submit Button" };
      expect(matchesElement(element, { text: /Submit/i })).toBe(true);
    });

    it("should match multiple criteria together", () => {
      const element = { role: "button", name: "Submit", text: "Submit" };
      expect(matchesElement(element, { role: "button", name: "Submit" })).toBe(true);
      expect(matchesElement(element, { role: "button", text: "Submit" })).toBe(true);
      expect(matchesElement(element, { role: "textbox", name: "Submit" })).toBe(false);
    });

    it("should match by focused state", () => {
      const focusedElement = { role: "textbox", name: "Input", focused: true };
      const unfocusedElement = { role: "textbox", name: "Input", focused: false };

      expect(matchesElement(focusedElement, { focused: true })).toBe(true);
      expect(matchesElement(focusedElement, { focused: false })).toBe(false);
      expect(matchesElement(unfocusedElement, { focused: false })).toBe(true);
    });

    it("should match with empty matcher", () => {
      const element = { role: "button", name: "Submit" };
      expect(matchesElement(element, {})).toBe(true);
    });
  });

  describe("predefined matchers", () => {
    it("should have matchers for all Google Docs UI elements", () => {
      // Verify all expected matchers exist
      expect(matchers.editingModeButton).toBeDefined();
      expect(matchers.suggestingModeOption).toBeDefined();
      expect(matchers.editMenu).toBeDefined();
      expect(matchers.findAndReplaceMenuItem).toBeDefined();
      expect(matchers.findInput).toBeDefined();
      expect(matchers.replaceInput).toBeDefined();
      expect(matchers.replaceButton).toBeDefined();
      expect(matchers.replaceAllButton).toBeDefined();
      expect(matchers.closeDialogButton).toBeDefined();
      expect(matchers.commentTextarea).toBeDefined();
      expect(matchers.submitCommentButton).toBeDefined();
      expect(matchers.understoodButton).toBeDefined();
      expect(matchers.gotItButton).toBeDefined();
    });

    it("should have multiple fallback matchers for each element", () => {
      // Each element should have at least 2 matchers for fallback
      expect(matchers.editingModeButton.length).toBeGreaterThanOrEqual(2);
      expect(matchers.suggestingModeOption.length).toBeGreaterThanOrEqual(2);
      expect(matchers.findInput.length).toBeGreaterThanOrEqual(2);
    });

    it("editingModeButton should match Google Docs mode dropdown", () => {
      const modeDropdown = { role: "button", name: "Editing mode" };
      expect(matchers.editingModeButton.some((m) => matchesElement(modeDropdown, m))).toBe(true);
    });

    it("replaceButton should match exact Replace button (not Replace all)", () => {
      const replaceBtn = { role: "button", text: "Replace" };
      const replaceAllBtn = { role: "button", text: "Replace all" };

      // Should match "Replace"
      expect(matchers.replaceButton.some((m) => matchesElement(replaceBtn, m))).toBe(true);

      // Should NOT match "Replace all" (different matcher)
      const replaceAllMatches = matchers.replaceButton.some((m) => matchesElement(replaceAllBtn, m));
      // The text matcher requires exact match, so "Replace all" should not match "Replace"
      expect(replaceAllMatches).toBe(false);
    });
  });
});
