# track-changes

[![CI](https://github.com/gsiener/track-changes/actions/workflows/ci.yml/badge.svg)](https://github.com/gsiener/track-changes/actions/workflows/ci.yml)

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
CLI → Google Docs API (read) → Claude (analyze) → Drive API (comment replies)
                                                → agent-browser (suggestions & new comments)
```

**Key constraints:**
- Google's Docs API cannot create suggestions—only read them. We use browser automation (agent-browser) for suggestions.
- Comment replies use the Drive API (faster and more reliable than browser automation).

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
# Review a document (one-time pass)
npm run dev -- "https://docs.google.com/document/d/YOUR_DOC_ID/edit"

# With verbose logging
npm run dev -- "URL" -v
```

### How it works

When you run the CLI with a Google Doc URL:

1. **Reads** the document content and comments
2. **Finds** comments where Claude is @mentioned (e.g., "@claude make this better")
3. **Analyzes** the document with Claude
4. **Makes** suggested edits as native Google Docs suggestions
5. **Replies** to comment threads with what it did

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
├── cli.ts                    # Entry point, orchestration
├── config.ts                 # Environment config with zod validation
├── google/
│   ├── auth.ts              # Service account setup
│   ├── docs-reader.ts       # Fetch documents + comment replies via Drive API
│   └── types.ts
├── claude/
│   ├── analyzer.ts          # Claude integration
│   ├── prompts.ts           # System/user prompts
│   └── types.ts             # ReviewResponse interface
├── browser/
│   ├── agent-browser-client.ts # Wrapper around agent-browser
│   ├── session.ts           # Browser session management
│   ├── docs-writer.ts       # Orchestrates browser operations
│   ├── suggestion-applier.ts # Apply text suggestions via find-replace
│   ├── new-comment-adder.ts # Add new comments anchored to text
│   ├── snapshot-helpers.ts  # Accessibility tree-based element finding
│   ├── matchers.ts          # Element matchers for Google Docs UI
│   └── retry.ts             # Retry logic with exponential backoff
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
