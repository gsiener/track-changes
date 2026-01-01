# track-changes

A CLI tool that lets Claude review Google Docs and make suggested edits that appear as native "track changes" suggestions.

## The Vision

Imagine Claude as a collaborative team member on your Google Docs. You're working on a document with coworkers, and Claude can:
- Make suggested edits that appear as native "suggestions" (track changes)
- Reply to comment threads with helpful input
- Add new comments with observations
- Resolve comments it has addressed

All using Google Docs' familiar collaboration UI.

## How It Works

```
CLI → Google Docs API (read) → Claude (analyze) → Playwright (write suggestions)
```

**Key constraint:** Google's Docs API cannot create suggestions—only read them. We use browser automation (Playwright) to write suggestions while using the API to read document content.

## Setup

### Prerequisites

1. **Node.js 20+**
2. **Google Cloud Project** with Docs API enabled
3. **Service account** with credentials JSON
4. **Dedicated Google account** for Claude (for browser automation)
5. **Anthropic API key**

### Installation

```bash
git clone https://github.com/gsiener/track-changes.git
cd track-changes
npm install
npx playwright install chromium
```

### Configuration

Copy `.env.example` to `.env` and fill in:

```bash
GOOGLE_SERVICE_ACCOUNT_PATH=./credentials.json
CLAUDE_GOOGLE_EMAIL=your-claude-account@gmail.com
CLAUDE_GOOGLE_PASSWORD=your-password
ANTHROPIC_API_KEY=sk-ant-...
```

### First-time Login

Before Claude can make suggestions, you need to log into the Google account once:

```bash
npm run dev -- login
```

This opens a browser for manual login. The session is saved for future automated runs.

## Usage

```bash
# Review a document
npm run dev -- review "https://docs.google.com/document/d/YOUR_DOC_ID/edit"

# With focus instructions
npm run dev -- review "URL" --prompt "focus on clarity and technical accuracy"

# Dry run (analyze only, don't apply changes)
npm run dev -- review "URL" --dry-run
```

## Development

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Type check
npm run lint

# Build
npm run build
```

## Architecture

```
src/
├── cli.ts                    # Entry point
├── config.ts                 # Environment config with zod validation
├── google/
│   ├── auth.ts              # Service account setup
│   ├── docs-reader.ts       # Fetch documents via API
│   └── types.ts
├── claude/
│   ├── analyzer.ts          # Claude integration
│   ├── prompts.ts           # System/user prompts
│   └── types.ts             # ReviewResponse interface
├── browser/
│   ├── session.ts           # Playwright persistent context
│   ├── docs-writer.ts       # Apply suggestions via browser
│   ├── selectors.ts         # DOM selectors (isolated for maintenance)
│   └── retry.ts             # Retry logic
└── utils/
    ├── logger.ts
    └── url.ts
```

## Roadmap

See [GitHub Issues](https://github.com/gsiener/track-changes/issues) for planned improvements.

Key upcoming features:
- Web dashboard for easier collaboration
- Real-time presence indicators
- Conversation continuity with Claude
- Review history tracking

## License

MIT
