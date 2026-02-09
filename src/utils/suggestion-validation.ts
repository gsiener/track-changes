import type { TextSuggestion } from "../claude/types.js";

export interface SuggestionValidationFailure {
  suggestion: TextSuggestion;
  reason: string;
}

export interface SuggestionPreparationResult {
  suggestions: TextSuggestion[];
  failures: SuggestionValidationFailure[];
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let index = 0;
  while (true) {
    const found = haystack.indexOf(needle, index);
    if (found === -1) break;
    count += 1;
    index = found + needle.length;
  }
  return count;
}

/**
 * Build a disambiguated suggestion by prepending contextBefore to findText.
 *
 * Heuristic: if replaceWith already starts with contextBefore, assume Claude
 * intended to preserve the context prefix and use replaceWith as-is.
 * Otherwise, prepend contextBefore so the replacement covers the full span.
 */
function buildContextSuggestion(suggestion: TextSuggestion): TextSuggestion {
  if (!suggestion.contextBefore) return suggestion;
  const combinedFind = `${suggestion.contextBefore}${suggestion.findText}`;
  const combinedReplace = suggestion.replaceWith.startsWith(suggestion.contextBefore)
    ? suggestion.replaceWith
    : `${suggestion.contextBefore}${suggestion.replaceWith}`;

  return {
    ...suggestion,
    findText: combinedFind,
    replaceWith: combinedReplace,
    contextBefore: undefined,
  };
}

export function prepareSuggestionsForApply(
  documentBody: string,
  suggestions: TextSuggestion[]
): SuggestionPreparationResult {
  const prepared: TextSuggestion[] = [];
  const failures: SuggestionValidationFailure[] = [];

  for (const suggestion of suggestions) {
    if (!suggestion.findText.trim()) {
      failures.push({
        suggestion,
        reason: "Suggestion has empty findText",
      });
      continue;
    }

    const directCount = countOccurrences(documentBody, suggestion.findText);
    if (directCount === 1) {
      prepared.push(suggestion);
      continue;
    }

    if (directCount === 0) {
      failures.push({
        suggestion,
        reason: `No match found for "${suggestion.findText.slice(0, 50)}..."`,
      });
      continue;
    }

    if (suggestion.contextBefore?.trim()) {
      const combined = `${suggestion.contextBefore}${suggestion.findText}`;
      const combinedCount = countOccurrences(documentBody, combined);
      if (combinedCount === 1) {
        prepared.push(buildContextSuggestion(suggestion));
        continue;
      }
      failures.push({
        suggestion,
        reason:
          combinedCount === 0
            ? "contextBefore did not match any occurrence"
            : "contextBefore still ambiguous",
      });
      continue;
    }

    failures.push({
      suggestion,
      reason: "findText appears multiple times without disambiguating contextBefore",
    });
  }

  return { suggestions: prepared, failures };
}
