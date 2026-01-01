import { describe, it, expect } from "vitest";
import { extractDocId, buildDocsUrl } from "../src/utils/url.js";

describe("extractDocId", () => {
  it("should extract ID from standard edit URL", () => {
    const url = "https://docs.google.com/document/d/1abc123_XYZ-def456/edit";
    expect(extractDocId(url)).toBe("1abc123_XYZ-def456");
  });

  it("should extract ID from URL without /edit", () => {
    const url = "https://docs.google.com/document/d/1abc123_XYZ-def456";
    expect(extractDocId(url)).toBe("1abc123_XYZ-def456");
  });

  it("should extract ID from URL with query params", () => {
    const url = "https://docs.google.com/document/d/1abc123_XYZ-def456/edit?usp=sharing";
    expect(extractDocId(url)).toBe("1abc123_XYZ-def456");
  });

  it("should extract ID from URL with fragment", () => {
    const url = "https://docs.google.com/document/d/1abc123_XYZ-def456/edit#heading=h.abc";
    expect(extractDocId(url)).toBe("1abc123_XYZ-def456");
  });

  it("should return null for invalid URLs", () => {
    expect(extractDocId("https://google.com")).toBeNull();
    expect(extractDocId("https://docs.google.com/spreadsheets/d/123")).toBeNull();
    expect(extractDocId("not a url")).toBeNull();
    expect(extractDocId("")).toBeNull();
  });

  it("should handle real-world document IDs", () => {
    // Real Google Docs IDs are typically 44 characters
    const realId = "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms";
    const url = `https://docs.google.com/document/d/${realId}/edit`;
    expect(extractDocId(url)).toBe(realId);
  });
});

describe("buildDocsUrl", () => {
  it("should build a valid Google Docs URL", () => {
    const docId = "1abc123_XYZ-def456";
    expect(buildDocsUrl(docId)).toBe("https://docs.google.com/document/d/1abc123_XYZ-def456/edit");
  });
});
