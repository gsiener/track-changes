/**
 * Extract document ID from a Google Docs URL
 *
 * Supports formats:
 * - https://docs.google.com/document/d/DOCUMENT_ID/edit
 * - https://docs.google.com/document/d/DOCUMENT_ID
 * - https://docs.google.com/document/d/DOCUMENT_ID/edit?usp=sharing
 */
export function extractDocId(url: string): string | null {
  const match = url.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

/**
 * Build a Google Docs URL from a document ID
 */
export function buildDocsUrl(docId: string): string {
  return `https://docs.google.com/document/d/${docId}/edit`;
}
