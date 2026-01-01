# Claude Code Context

## Project Overview

**track-changes** is a CLI tool that enables Claude to collaborate on Google Docs by making suggested edits and responding to comments, using Google Docs' native "track changes" UI.

## Key Architectural Decisions

### Why Browser Automation?

Google's Docs API cannot create suggested edits—only read them. This is a known limitation ([issue #287903901](https://issuetracker.google.com/issues/287903901)). We use Playwright browser automation to write suggestions while using the API for reliable reading.

### Hybrid Read/Write Strategy

- **Read path**: Google Docs API via service account (fast, reliable)
- **Write path**: Playwright browser automation (fragile but necessary)

### Text Anchoring Over Indexes

Claude's suggestions use text content matching (`findText`) rather than document indexes. Indexes shift as edits are made; text anchoring is more robust for sequential operations.

## Development Practices

- **TDD**: Write tests before implementation
- **Isolated Selectors**: All DOM selectors in `src/browser/selectors.ts` for easy maintenance when Google's UI changes
- **Keyboard Shortcuts**: Prefer keyboard shortcuts over DOM selectors (more stable)
- **Retry Logic**: All browser operations use retry with exponential backoff

## Testing

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run lint          # TypeScript type check
```

## Common Tasks

### Adding a New Browser Operation

1. Add selector to `src/browser/selectors.ts`
2. Write test in `tests/`
3. Implement in `src/browser/docs-writer.ts`
4. Wrap with `withRetry()` for resilience

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
