# PostFlight MCP Server Integration Guide

`@postflight/mcp` is a **zero-dependency, standards-compliant Model Context Protocol (MCP) stdio server** that gives AI coding and marketing agents deterministic "eyes" for social media physics—before a single post ever reaches a publishing API.

## Why Governed Pre-Flight MCP?

Giving AI agents raw write access to brand social accounts (e.g. `publish_post`) with zero pre-flight validation risks FTC compliance violations, broken 9:16 overlays, Unicode accessibility failures, and 0%-engagement link posts. `@postflight/mcp` runs strictly as a **read / validate / compile / triage / governance** toolset with self-healing structured diagnostics.

## Quick Setup

First, build the packages:

```bash
npm install
npm run build:packages
```

### Claude Code (`~/.claude.json` or `.mcp.json`)

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

### Cursor (`.cursor/mcp.json`) & Windsurf

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

## Exposed MCP Tools (9 Tools)

| Tool Name | Purpose |
| :--- | :--- |
| `preflight_lint_post` | Runs all 77 deterministic lint rules across 1–9 platforms, returning score, grade, exact platform counts, mobile/desktop fold cuts, and a 1-click `autoFixPreview`. |
| `compile_canonical_post` | Compiles a single canonical Markdown+YAML post into X weighted threads, LinkedIn fold-optimized drafts, Bluesky posts with exact UTF-8 `byteStart`/`byteEnd` facets, and IG 5-hashtag captions. |
| `check_safe_zone` | Computes exact pixel collision overlaps for text/CTA/logo boxes across 16 presets (TikTok/Reels/Shorts Organic & Paid Ads, IG 4:5→3:4 & Reels 9:16→3:4 Profile Grids, LinkedIn PDF, X Grids). |
| `simulate_fold_preview` | Simulates exact mobile & desktop `"See more"` cutoffs (including LinkedIn's blank-line fold trap). |
| `audit_utm_and_og` | Validates UTM taxonomy, strips click-ID noise (`fbclid`/`gclid`), and audits Open Graph card dimensions & WhatsApp 300 KB limits. |
| `triage_comments` | Classifies comment streams into P0 Crisis, High-Intent Buyer Leads, Support, Feedback, and Bot Noise with SLA targets and Meta 24h / FINRA alerts. |
| `build_ffmpeg_normalize_cmd` | Generates copy-ready FFmpeg commands for Rec.709 SDR, CFR, `yuv420p`, `faststart`, and `-14 LUFS` audio normalization. |
| `audit_oauth_tokens` | Evaluates OAuth token expiry timelines and platform-specific refresh/race hazards across Meta, LinkedIn, TikTok, X, and Bluesky. |
| `get_platform_spec` | Retrieves authoritative 2025–2026 platform specs from the open registry. |

## Exposed MCP Resources

- `postflight://specs/<platformId>` — Full JSON specification for any of the 9 platforms.
- `postflight://rules/catalog` — Full catalog of all deterministic Pre-Flight rules.
