# Changelog

All notable changes to PostFlight will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- **Rule catalog reconciled with the engine.** `RULE_CATALOG` declared 43 rules while the engine actually emitted 77. The 40 media and accessibility rules delegated to `validateMediaAttachments` / `validateOpenGraph` were never registered, so `formatReportAsSarif` fell back to the raw rule ID: GitHub Code Scanning showed `media/og-whatsapp-300kb-drop` instead of a readable title and description. All 77 are now registered with titles, summaries, and spec references.
- Removed 6 phantom catalog entries (`media/missing-alt-text`, `media/alt-text-limit`, `media/attachment-limit`, `media/file-size-limit`, `media/video-codec-hazard`, `media/og-image-spec`) that were declared but never emitted, advertising checks that did not run.
- `docs/RULES.md` documented 7 rule IDs that existed nowhere in the source — renamed in code without updating the docs (for example `media/transcode-hdr-washout`, actually emitted as `media/hdr-washout-risk`). It is now generated from the catalog, so it cannot drift again.
- Corrected stale counts across the README, CHANGELOG, architecture and MCP docs: 77 rules (was "30+") and 16 safe-zone presets (was 15).

### Added
- `packages/core/test/rules-catalog.test.mjs` — fails CI if a rule is emitted without a catalog entry, if a catalog entry never fires, if an ID is malformed or miscategorised, or if `docs/RULES.md` falls out of sync.
- `npm run docs:rules` (`scripts/generate-rules-doc.mjs`) regenerates `docs/RULES.md` from `RULE_CATALOG`.
- Contributor infrastructure: `ROADMAP.md`, `SUPPORT.md`, `docs/GOOD_FIRST_ISSUES.md`, `.github/CODEOWNERS`, `.github/dependabot.yml`, a feature-request template, issue template routing, `.editorconfig`, and `.nvmrc`.
- `.github/workflows/release.yml` — tag-triggered npm publish with provenance for `@postflight/core`, `/cli`, and `/mcp`. Inert until an `NPM_TOKEN` secret is configured and a `v*` tag is pushed.
- Per-package READMEs and full npm metadata (`repository`, `homepage`, `bugs`, `author`, `keywords`, `engines`, `publishConfig`) so the npm pages are not blank.
- Hand-built light/dark SVG diagrams in `docs/assets/` covering the architecture, the LinkedIn fold trap, and the safe-zone X-ray.

## [1.0.0] - 2026-11-25

### Added
- **Open Platform Spec Registry (`specs/platforms/*.json`)** covering 9 platforms: X, LinkedIn, Instagram Feed, Instagram Reels, TikTok, YouTube Shorts, Threads, Bluesky (ATProto), and Mastodon.
- **`@postflight/core` (Zero-Dependency TypeScript SDK)**:
  - Platform-accurate counting engines (`twitter-text` weighted + `t.co=23`, Bluesky dual 300-grapheme / 3,000 UTF-8 byte + exact UTF-8 byte facets, Threads emoji UTF-8 byte weight, Mastodon domain-stripped handles + CW, TikTok 2,200 API vs 4,000 native divergence).
  - Mobile & Desktop `"See more"` Fold Truncation Simulator including LinkedIn's blank-line fold trap.
  - 77 deterministic Pre-Flight Lint Rules across Limits, Fold Physics, Algorithmic Reach, FTC/ASA/AI Compliance, WCAG 2.2 Accessibility, Media/OG Forensics, UTM Attribution, and Brand Guardrails + 1-click Auto-Fixer + SARIF 2.1.0 output.
  - Pixel-accurate Safe-Zone Collision Engine across 16 presets (TikTok/Reels/Shorts Organic & Paid Ads, Universal Ad-Safe Union, IG 4:5 -> 3:4 Profile Grid `1012x1350`, LinkedIn PDF Carousel, X OG & 2/3/4-Image Grids).
  - 1-to-N Canonical Markdown Compiler (`Social-Media-as-Code`) outputting X threads, Bluesky UTF-8 byte facets, LinkedIn fold-safe posts, and IG 5-hashtag + DM funnel packs.
  - Media/OG Validator (WhatsApp 300 KB silent drop, IG Graph API 3:4 Error 36003, C2PA AI-label warning), WCAG 2.2 Contrast Calculator, and FFmpeg Rec.709 / CFR / `yuv420p` / `faststart` / `-14 LUFS` command builder.
  - Evergreen Duplicate & LinkedIn 24-Hour Cannibalization Detector, High-Intent Buyer Comment Triage Engine, OAuth Token Decay Monitor, and tamper-evident SHA-256 Hash-Chained Crisis Kill-Switch Ledger.
- **`@postflight/cli`**: Full CI-ready CLI (`check`, `compile`, `safezone`, `utm`, `triage`, `ffmpeg`, `tokens`, `contrast`, `killswitch`, `specs`, `rules`, `studio`) with Pretty ANSI, JSON, Markdown PR comment, and SARIF 2.1.0 outputs.
- **`@postflight/mcp`**: Standards-compliant JSON-RPC 2.0 stdio MCP server exposing 9 deterministic social pre-flight tools and 2 resource families for Claude Code, Cursor, Windsurf, and AI agents.
- **`@postflight/studio`**: Local-first interactive React 19 + Vite Web Studio with Pre-Flight Composer, Safe-Zone X-Ray Canvas, 1-to-N Compiler, Media/OG/WCAG/FFmpeg Lab, Triage/UTM Lab, and Agency Governance Deck.
