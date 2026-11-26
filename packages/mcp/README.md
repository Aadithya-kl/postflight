# @postflight/mcp

**A governed Model Context Protocol server that gives AI agents deterministic eyes for social media** — before anything reaches a publishing API.

Part of [PostFlight](https://github.com/prateeekranga/postflight).

## Why "governed"

Handing an agent a `publish_post` tool with raw write credentials is how brand incidents happen. This server is deliberately scoped to **read, lint, compile, triage, and govern**. It holds no OAuth credentials and cannot post on your behalf — the worst case is a wrong opinion, not a published mistake.

Everything it returns is deterministic: no network calls, no API keys, no model in the loop. The same draft always produces the same diagnostics, so an agent can act on the output without a second opinion.

## Setup

```bash
npm install @postflight/mcp
```

Then register it with your client. For Claude Code (`~/.claude.json` or `.mcp.json`), Cursor, or Windsurf:

```json
{
  "mcpServers": {
    "postflight": {
      "command": "npx",
      "args": ["-y", "@postflight/mcp"]
    }
  }
}
```

Or point at a local build:

```json
{
  "mcpServers": {
    "postflight": {
      "command": "node",
      "args": ["/absolute/path/to/postflight/packages/mcp/dist/index.js"]
    }
  }
}
```

Standards-compliant JSON-RPC 2.0 over stdio.

## Tools

| Tool | What the agent gets |
| :--- | :--- |
| `preflight_lint_post` | All 77 rules against a draft for any target platforms, with fix hints |
| `simulate_fold_preview` | Exact mobile and desktop `...more` truncation, including blank-line cost |
| `check_safe_zone` | 2D collision math against 16 presets, including profile-grid crops |
| `compile_canonical_post` | One Markdown source to native threads plus exact Bluesky UTF-8 facets |
| `get_platform_spec` | The verified limits, folds, crops, and API gotchas for a platform |
| `audit_utm_and_og` | UTM hygiene and Open Graph link-card forensics |
| `triage_comments` | Separates P0 crises and high-intent buyers from bot noise |
| `audit_oauth_tokens` | OAuth decay cliffs and refresh race conditions |
| `build_ffmpeg_normalize_cmd` | Rec.709 / CFR / `yuv420p` / `faststart` / `-14 LUFS` pipelines |

## Resources

| URI | Contents |
| :--- | :--- |
| `postflight://rules/catalog` | All 77 rules with categories, severities, and spec references |
| `postflight://specs/<platformId>` | The full spec for one of the 9 supported platforms |

## Example

> "Check this LinkedIn draft before I post it."

The agent calls `preflight_lint_post`, gets back that a blank line pushes the hook past the mobile fold and that `#spon` is not an acceptable FTC disclosure, and rewrites the draft — without ever having had the ability to publish it.

## Requirements

Node.js 20 or newer. Zero runtime dependencies beyond `@postflight/core`.

Full setup guide: [docs/MCP_INTEGRATION.md](https://github.com/prateeekranga/postflight/blob/main/docs/MCP_INTEGRATION.md)

## License

[MIT](LICENSE)
