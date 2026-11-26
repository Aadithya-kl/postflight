# PostFlight Rule Catalog

> **Generated file — do not edit by hand.**
> Every rule below is declared in [`packages/core/src/linter/rules.ts`](../packages/core/src/linter/rules.ts).
> Edit the catalog there, then run `npm run docs:rules` to regenerate this page.

All **77 rules** are fully deterministic: no network calls, no API keys, no LLM. The same input always produces the same diagnostics, which is what makes them safe to run in CI.

| | Count |
| :--- | ---: |
| Total rules | **77** |
| `error` (blocks `--strict` builds) | 35 |
| `warning` | 37 |
| `info` | 5 |
| Categories | 8 |

List them from the CLI at any time:

```bash
postflight rules                      # all 77
postflight rules --category media     # one category
```

## Severity levels

| Severity | Meaning |
| :--- | :--- |
| `error` | Will be rejected by the platform or API, or carries legal exposure. Fails `postflight check --strict`. |
| `warning` | Publishes successfully but measurably costs reach, accessibility, or attribution. |
| `info` | Advisory. Worth knowing, safe to ignore case by case. |

Severities shown here are defaults. Per-rule overrides go in `postflight.config.json` — see [`postflight.config.example.json`](../postflight.config.example.json).

## Contents

1. [Platform Limits & Protocol Counting](#1-platform-limits-protocol-counting) — `limits/*` (6 rules)
2. [Mobile & Desktop Fold Physics](#2-mobile-desktop-fold-physics) — `fold/*` (3 rules)
3. [Algorithmic Reach Suppressors](#3-algorithmic-reach-suppressors) — `algorithm/*` (10 rules)
4. [Legal & Regulatory Compliance](#4-legal-regulatory-compliance) — `compliance/*` (4 rules)
5. [WCAG 2.2 Accessibility & Social SEO](#5-wcag-22-accessibility-social-seo) — `accessibility/*` (8 rules)
6. [Media, Carousels, Video Transcoding & Open Graph Cards](#6-media-carousels-video-transcoding-open-graph-cards) — `media/*` (41 rules)
7. [Dark-Social Attribution](#7-dark-social-attribution) — `attribution/*` (1 rule)
8. [Brand, Legal & Scheduling Governance](#8-brand-legal-scheduling-governance) — `governance/*` (4 rules)

---

## 1. Platform Limits & Protocol Counting (`limits/*`)

Each platform counts differently. X applies weighted code-point counting with every URL fixed at 23 characters; Bluesky enforces 300 graphemes *and* 3,000 UTF-8 bytes; Threads weights emoji by UTF-8 byte length; TikTok diverges between its native app and its Content Posting API.

| Rule ID | Severity | What It Catches |
| :--- | :--- | :--- |
| `limits/bluesky-byte-limit` | `error` | **Bluesky UTF-8 Byte Ceiling Exceeded** — Post exceeds AT Protocol 3,000 UTF-8 byte ceiling even when grapheme count is within 300. |
| `limits/char-limit-exceeded` | `error` | **Character Limit Exceeded** — Post exceeds the target platform counting limit using its exact native counting algorithm. |
| `limits/first-comment-limit` | `error` | **First Comment Length Exceeded** — Planned first comment exceeds the platform comment character limit. |
| `limits/forbidden-chars` | `error` | **Forbidden Platform Characters** — Draft contains characters rejected by platform validation or API ingestion (e.g. < or > on YouTube). |
| `limits/threads-unique-urls` | `error` | **Threads Unique URL Cap Exceeded** — Threads Publishing API rejects posts containing more than 5 unique URLs. |
| `limits/api-limit-divergence` | `warning` | **Native vs. API Character Limit Divergence** — Post fits native app limits but exceeds the stricter publishing API cap (e.g. TikTok 2,200 API vs 4,000 native). |

---

## 2. Mobile & Desktop Fold Physics (`fold/*`)

The `...more` cutoff decides whether anyone reads past your hook. These rules simulate the exact truncation point on mobile and desktop, including the LinkedIn blank-line trap where a single `Enter` press costs a full visible line.

| Rule ID | Severity | What It Catches |
| :--- | :--- | :--- |
| `fold/blank-line-starvation` | `warning` | **Mobile Fold Blank-Line Starvation** — Blank line inside the opening lines consumes a visible line slot before the mobile fold truncation. |
| `fold/weak-hook-truncation` | `warning` | **Weak Hook / Awkward Mobile Fold Truncation** — Mobile fold cuts off mid-word, shows an ultra-thin hook, or buries the call-to-action below the fold. |
| `fold/reels-ultra-tight-fold` | `info` | **Instagram Reels Ultra-Tight Single-Line Fold** — Reels mobile HUD truncates captions after ~55 characters on line 1; front-load the core hook. |

---

## 3. Algorithmic Reach Suppressors (`algorithm/*`)

Patterns that do not break publishing but quietly cost you distribution: outbound links in the body, hashtag cliffs, engagement bait, dead link shorteners, and the X leading-`@mention` reply trap.

| Rule ID | Severity | What It Catches |
| :--- | :--- | :--- |
| `algorithm/hashtag-hard-cap` | `error` | **Platform Hashtag Hard Cap Exceeded** — Hashtag count exceeds the platform hard cap (e.g. IG/TikTok 5, Threads 1, YouTube 60 ignore-all cliff). |
| `algorithm/engagement-bait` | `warning` | **Algorithmic Engagement-Bait Pattern** — Copy matches explicit engagement-bait phrasing penalized by feed-integrity classifiers. |
| `algorithm/external-link-suppression` | `warning` | **External Link Reach Suppression Risk** — Outbound links in main post copy risk dwell-time and feed-ranking suppression on LinkedIn, X, or Threads. |
| `algorithm/hashtag-spam-threshold` | `warning` | **Hashtag Spam Threshold Exceeded** — Hashtag count exceeds recommended maximum and risks spam classification or reduced organic reach. |
| `algorithm/linkedin-first-comment-bridge` | `warning` | **LinkedIn First-Comment Link Bridge Risk** — Instant outbound links in LinkedIn first comments are pattern-matched as engagement-bridge behavior. |
| `algorithm/non-clickable-caption-url` | `warning` | **Non-Clickable Raw URL in Caption** — Platform does not hyperlink URLs inside captions; raw URLs render as dead text. |
| `algorithm/public-url-shortener-risk` | `warning` | **Generic Shortener or Shut-Down Dynamic Link** — Uses a shut-down Firebase Dynamic Link (*.page.link / goo.gl) or generic URL shortener penalized by anti-spam classifiers. |
| `algorithm/x-leading-mention-reply-trap` | `warning` | **X Leading @Mention Timeline Suppression Risk** — Posts/replies starting with @username at character 0 restrict visibility away from non-mutual followers timelines. |
| `algorithm/ai-slop-cliches` | `info` | **Generic AI Cliché / Emoji Density Signal** — Copy contains overused synthetic writing clichés or dense decorative emoji clusters that depress reader trust. |
| `algorithm/generic-spam-hashtags` | `info` | **Generic Low-Signal Hashtags Detected** — Generic engagement tags (#fyp, #viral, #explore, #follow4follow) add noise without topical targeting. |

---

## 4. Legal & Regulatory Compliance (`compliance/*`)

FTC 16 CFR Part 255, the UK ASA CAP Code, and EU Digital Fairness Act disclosure requirements. A disclosure that sits below the mobile fold is treated as no disclosure at all.

| Rule ID | Severity | What It Catches |
| :--- | :--- | :--- |
| `compliance/ftc-below-fold` | `error` | **Sponsored Disclosure Buried Below Mobile Fold** — Disclosure appears after the mobile fold cutoff, inside a trailing hashtag block, or too late for ASA UK. |
| `compliance/ftc-missing-disclosure` | `error` | **Missing Sponsored Ad Disclosure** — Sponsored post lacks an approved material-connection disclosure (#Ad, Ad:, #Sponsored, Paid Partnership). |
| `compliance/ftc-prohibited-shorthand` | `error` | **Prohibited Ambiguous Sponsorship Shorthand** — Sponsored post uses ambiguous shorthand (#sp, #spon, #collab, #partner, #gifted, #pr) rejected by regulators. |
| `compliance/ai-synthetic-disclosure` | `warning` | **Missing AI / Synthetic Media Disclosure** — Draft is flagged as AI-generated without an explicit disclosure note or C2PA provenance metadata. |

---

## 5. WCAG 2.2 Accessibility & Social SEO (`accessibility/*`)

Unicode faux-bold and lowercase hashtags break screen readers *and* make your keywords invisible to in-platform search. These rules catch both at once, and most are auto-fixable.

| Rule ID | Severity | What It Catches |
| :--- | :--- | :--- |
| `accessibility/alt-text-limit` | `error` | **Alt Text Character Limit Exceeded** — Alt text exceeds the platform maximum and will be truncated or rejected at upload time. |
| `accessibility/missing-alt-text` | `error` | **Missing Image Alt Text** — Attachment has no alt text on a platform that supports accessibility descriptions, failing WCAG 2.2 SC 1.1.1 Non-text Content for screen-reader users. |
| `accessibility/hashtag-pascal-case` | `warning` | **Non-PascalCase Multi-Word or ALL-CAPS Hashtag** — Lowercase compound hashtags and ALL-CAPS tags prevent screen readers from separating words cleanly. |
| `accessibility/invisible-zero-width-chars` | `warning` | **Invisible Zero-Width / Bidi Control Residue** — Hidden U+200B/U+FEFF/soft-hyphen/Bidi characters pasted from rich-text docs break hashtags, URLs, and trigger anti-spam obfuscation filters. |
| `accessibility/numeric-only-hashtag` | `warning` | **Numeric-Only or Adjacent Unspaced Hashtag** — Pure-number hashtags (#2026) fail to linkify on Mastodon & Bluesky, and adjacent tags (#AI#Dev) break hashtag parsers. |
| `accessibility/redundant-alt-prefix` | `warning` | **Redundant Alt Text Prefix** — Alt text opens with "image of", "photo of", "screenshot of" or similar. Screen readers already announce the element type, so the prefix wastes the listener’s first words. |
| `accessibility/unicode-faux-bold` | `warning` | **Unicode Faux-Bold / Fancy Font Characters** — Mathematical Alphanumeric Symbols break screen readers, fail platform search indexing, and hurt readability. |
| `accessibility/all-caps-shouting` | `info` | **Consecutive ALL-CAPS Shouting** — Three or more consecutive ALL-CAPS words may be spelled out letter-by-letter by screen readers. |

---

## 6. Media, Carousels, Video Transcoding & Open Graph Cards (`media/*`)

Upload rejections, silent reclassifications, and link previews that never render. Includes the Instagram Graph API `36003` aspect-ratio rejection, the Bluesky decimal-byte trap, YouTube Shorts landscape misclassification, and the WhatsApp 300 KB Open Graph drop.

| Rule ID | Severity | What It Catches |
| :--- | :--- | :--- |
| `media/bluesky-decimal-byte-limit` | `error` | **Bluesky Decimal 2,000,000-Byte Image Cap Exceeded** — Bluesky enforces a decimal 2,000,000-byte image ceiling, not 2 MiB (2,097,152). Images between the two values silently fail to upload. |
| `media/competitor-watermark` | `error` | **Competitor or Downloader Watermark Detected** — Filename matches a competitor or third-party downloader watermark pattern (TikTok, SnapTik, CapCut, reelsave); platforms actively suppress recycled watermarked video. |
| `media/ig-api-aspect-ratio-36003` | `error` | **Instagram Graph API Aspect Ratio Error 36003** — Aspect ratio is narrower than 4:5 (0.80) and is hard-rejected by the Instagram Graph API with error 36003, even though the native app accepts it. |
| `media/ig-api-carousel-limit` | `error` | **Instagram Graph API 10-Item Carousel Cap** — Instagram Graph API caps carousels at 10 items while the native app allows up to 20, so API publishing fails above 10. |
| `media/image-size-limit` | `error` | **Image File Size Exceeded** — Image byte size exceeds the platform upload cap and will be rejected or aggressively recompressed. |
| `media/images-not-supported` | `error` | **Standalone Images Not Supported** — Target platform is video-only (TikTok, Reels, Shorts) and rejects standalone image uploads. |
| `media/max-images-exceeded` | `error` | **Image Count Limit Exceeded** — Image attachment count exceeds the platform maximum images per post. |
| `media/max-items-exceeded` | `error` | **Carousel Item Limit Exceeded** — Total media items exceed the platform maximum for a single carousel or post. |
| `media/mixed-media-unsupported` | `error` | **Mixed Images and Video Unsupported** — Target platform does not permit combining images and video in a single post. |
| `media/multiple-videos-unsupported` | `error` | **Multiple Videos Unsupported** — Target platform accepts only one video per post; additional videos are dropped. |
| `media/og-image-over-5mb` | `error` | **og:image Exceeds 5 MB Crawler Cap** — Open Graph images above 5 MB exceed the social crawler ceiling and fail to render as previews. |
| `media/og-image-too-small` | `error` | **og:image Below 600x315 Minimum** — Open Graph images smaller than 600x315 downgrade the link preview from a large card to a small thumbnail or none at all. |
| `media/og-missing-title` | `error` | **Missing og:title** — Link preview cards fall back to raw URLs or broken page titles when og:title is absent. |
| `media/og-non-https-url` | `error` | **Open Graph URL Not HTTPS** — Modern social crawlers reject or downgrade insecure http:// Open Graph URLs. |
| `media/og-svg-unsupported` | `error` | **SVG Rejected as og:image** — SVG is not an accepted og:image format for X, LinkedIn, Meta, Slack, or iMessage crawlers. |
| `media/pdf-page-limit` | `error` | **LinkedIn PDF Page Limit Exceeded** — Document exceeds the LinkedIn 300-page maximum for PDF carousels. |
| `media/pdf-size-limit` | `error` | **LinkedIn PDF File Size Exceeded** — Document exceeds the LinkedIn 100 MiB PDF carousel upload ceiling. |
| `media/pdf-unsupported` | `error` | **Native PDF Carousel Unsupported** — Native PDF document carousels are LinkedIn-only; other platforms require slides exported as images. |
| `media/video-duration-limit` | `error` | **Video Duration Limit Exceeded** — Video runtime exceeds the maximum allowed duration for the target platform. |
| `media/video-size-limit` | `error` | **Video File Size Exceeded** — Video byte size exceeds the platform upload cap. |
| `media/x-api-4-image-cap` | `error` | **X API v2 Documented 4-Image Cap Exceeded** — X POST /2/tweets formally documents 4 photos maximum in media_ids, even though the native composer now accepts more. |
| `media/yt-shorts-landscape-misclassification` | `error` | **YouTube Shorts Landscape Misclassification** — Landscape video (width > height) is silently classified as a standard long-form upload instead of a Short, removing it from the Shorts shelf. |
| `media/bluesky-gallery-required` | `warning` | **Bluesky Standard 4-Image Embed Limit Exceeded** — Standard app.bsky.embed.images caps at 4 images; 5-10 images require app.bsky.embed.gallery. |
| `media/bluesky-legacy-1mb-limit` | `warning` | **Bluesky Legacy 1 MB Client Ceiling** — Image exceeds 1,000,000 bytes; older Bluesky clients and some third-party AppViews still enforce the legacy 1 MB blob ceiling. |
| `media/c2pa-ai-label-trigger` | `warning` | **C2PA Content Credentials Trigger AI Label** — Embedded C2PA Content Credentials cause Meta (Instagram/Threads) and TikTok to auto-apply an "AI info" label, which can suppress organic reach. |
| `media/chroma-subsampling-bleed` | `warning` | **Chroma Subsampling Text Bleed** — Non-4:2:0 chroma subsampling risks colour bleeding and illegible on-screen text once the platform re-encodes to yuv420p. |
| `media/hdr-washout-risk` | `warning` | **10-Bit HDR Washout After Transcode** — HLG / PQ / Dolby Vision sources frequently wash out or clip highlights once platforms transcode them to SDR Rec.709. |
| `media/ig-carousel-aspect-lock` | `warning` | **Instagram Carousel First-Slide Ratio Lock** — Instagram locks every carousel slide to the aspect ratio of slide #1; mismatched later slides are centre-cropped. |
| `media/ig-reels-recommendation-ceiling` | `warning` | **Instagram Reels 3-Minute Recommendation Ceiling** — Reels longer than 180 seconds lose eligibility for recommendation surfaces, sharply limiting non-follower reach. |
| `media/og-description-too-long` | `warning` | **og:description Truncated on Link Cards** — og:description exceeds 200 characters and is truncated in X link cards. |
| `media/og-legacy-format-risk` | `warning` | **Legacy Crawler og:image Format Risk** — WebP and AVIF Open Graph images break or fail silently on legacy link crawlers and some chat clients. |
| `media/og-linkedin-small-thumbnail` | `warning` | **LinkedIn Small Thumbnail Downgrade** — og:image is below the LinkedIn large-card threshold, so the post renders a small side thumbnail instead of a full-width image. |
| `media/og-missing-description` | `warning` | **Missing og:description** — Without og:description, crawlers scrape boilerplate navigation text into the link preview. |
| `media/og-title-too-long` | `warning` | **og:title Truncated on Link Cards** — og:title exceeds 70 characters and is truncated in X link cards. |
| `media/og-twitter-card-missing` | `warning` | **twitter:card Missing or Not Large Image** — Without twitter:card set to summary_large_image, X renders the narrow summary card instead of the full-width preview. |
| `media/og-whatsapp-300kb-drop` | `warning` | **WhatsApp 300 KB Open Graph Silent Drop** — Open Graph images above 300 KB (307,200 bytes) are silently dropped by WhatsApp and iMessage, killing dark-social link previews. |
| `media/og-x-aspect-crop` | `warning` | **X summary_large_image Aspect Crop** — og:image aspect ratio deviates from 1.91:1 / 2:1, so X centre-crops the summary_large_image card. |
| `media/pdf-mobile-render-slow` | `warning` | **LinkedIn PDF Mobile Render Stall** — PDF carousels above 5 MiB render slowly on mobile, and readers scroll past before slide #1 paints. |
| `media/vfr-audio-desync` | `warning` | **Variable Frame Rate Audio Desync** — Variable frame rate (VFR) phone footage causes frame stutter and progressive audio/video desync after platform re-encode. Convert to constant frame rate first. |
| `media/x-api-mixed-media-risk` | `warning` | **X API Mixed Image + Video Request Risk** — Mixing images and video in one X API request is unsupported and fails inconsistently even where the native composer allows it. |
| `media/og-cache-bust-tip` | `info` | **Open Graph Cache Not Versioned** — Open Graph URL carries no version query string; crawlers cache previews aggressively, so edits to the card will not appear until the cache expires. |

---

## 7. Dark-Social Attribution (`attribution/*`)

UTM hygiene for traffic that arrives with no referrer. Catches casing drift, click-ID pollution, and `utm_source` values that disagree with the platform actually being posted to.

| Rule ID | Severity | What It Catches |
| :--- | :--- | :--- |
| `attribution/utm-hygiene` | `warning` | **UTM Attribution Hygiene Issue** — Embedded URLs have casing/whitespace defects, click-ID noise, missing required UTMs, or mismatched utm_source. |

---

## 8. Brand, Legal & Scheduling Governance (`governance/*`)

Guardrails configured in `postflight.config.json`: forbidden and required terminology, unfilled template placeholders, and scheduling hazards such as missing timezone offsets and DST transition windows.

| Rule ID | Severity | What It Catches |
| :--- | :--- | :--- |
| `governance/brand-forbidden-terms` | `error` | **Forbidden Brand / Legal Term Detected** — Draft contains a term explicitly prohibited by brand, compliance, or legal guardrails. |
| `governance/unresolved-template-placeholders` | `error` | **Unresolved Template Placeholder or Localhost URL** — Draft contains unfilled {{template}} variables, [INSERT LINK]/[TBD] markers, or localhost URLs before publish. |
| `governance/brand-required-terms` | `warning` | **Required Brand / Disclaimer Term Missing** — Draft omits a mandatory phrase or legal disclaimer configured in brand guardrails. |
| `governance/schedule-timing-hazard` | `warning` | **Schedule Timezone, DST, or Burst Timing Hazard** — Scheduled timestamp lacks an explicit timezone offset, lands on top-of-hour :00 burst queues, or intersects a DST transition window. |

---

## Adding a rule

1. Add a `RuleDefinition` to `RULE_CATALOG` in [`packages/core/src/linter/rules.ts`](../packages/core/src/linter/rules.ts). The `id` prefix must match the `category`.
2. Emit the diagnostic with that exact `ruleId` from `evaluatePlatformRules` or a delegated validator such as [`media/validator.ts`](../packages/core/src/media/validator.ts).
3. Add a test in [`packages/core/test/core-engine.test.mjs`](../packages/core/test/core-engine.test.mjs).
4. Run `npm run docs:rules` to regenerate this page, then `npm test`.

[`rules-catalog.test.mjs`](../packages/core/test/rules-catalog.test.mjs) fails the build if a rule is emitted without a catalog entry, if a catalog entry never fires, or if this document falls out of sync. Unregistered rules degrade SARIF output in GitHub Code Scanning to a bare rule ID with no title or description, so the catalog entry is not optional.

See [CONTRIBUTING.md](../CONTRIBUTING.md) for the full contribution workflow.
