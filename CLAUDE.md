# Claude Code Context

## Project Overview

**track-changes** is a CLI tool that enables Claude to collaborate on Google Docs by making suggested edits and responding to comments, using Google Docs' native "track changes" UI.

## Key Architectural Decisions

### Why Browser Automation?

Google's Docs API cannot create suggested edits—only read them. This is a known limitation ([issue #287903901](https://issuetracker.google.com/issues/287903901)). We use agent-browser (a Vercel Labs CLI wrapping Playwright) for browser automation to write suggestions while using the API for reliable reading.

### Hybrid Read/Write Strategy

- **Read path**: Google Docs API via service account (fast, reliable)
- **Write path**: agent-browser automation (more stable than raw Playwright)

### Text Anchoring Over Indexes

Claude's suggestions use text content matching (`findText`) rather than document indexes. Indexes shift as edits are made; text anchoring is more robust for sequential operations.

### Accessibility Tree-Based Element Selection

Instead of CSS selectors, we use agent-browser's accessibility tree snapshots with refs (`@e1`, `@e2`) for more stable element selection. Elements are matched by role, name, and text properties. Fallback to CSS selectors when snapshots don't match.

## Development Practices

- **TDD**: Write tests before implementation
- **Isolated Matchers**: Element matchers in `src/browser/matchers.ts` for easy maintenance when Google's UI changes
- **Keyboard Shortcuts**: Prefer keyboard shortcuts over UI selectors (most stable)
- **Snapshot-First**: Try accessibility tree refs first, fall back to CSS selectors
- **Retry Logic**: All browser operations use retry with exponential backoff

## Testing

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run lint          # TypeScript type check
```

## Common Tasks

### Adding a New Browser Operation

1. Add matcher to `src/browser/matchers.ts` (role, name, text patterns)
2. Add CSS selector fallbacks if needed
3. Write test in `tests/`
4. Implement using `clickByMatcher()` / `fillByMatcher()` from `snapshot-helpers.ts`
5. Wrap with `withRetry()` for resilience

### Modifying Claude's Response Format

1. Update types in `src/claude/types.ts`
2. Update schema in `src/claude/analyzer.ts`
3. Update prompts in `src/claude/prompts.ts`
4. Add tests in `tests/prompts.test.ts`

## Known Issues

- Browser automation is inherently fragile—Google can change their UI
- Service account cannot access user's private docs (must be shared)
- Password-based auth for browser is not ideal (future: OAuth)

## Project Management

- GitHub Issues for bug tracking and feature requests
- GitHub Projects for kanban workflow
- CI runs on every push/PR via GitHub Actions
