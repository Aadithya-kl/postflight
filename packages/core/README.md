# @postflight/core

**Zero-dependency social media pre-flight engine.** Deterministic linting, exact platform counters, fold simulation, safe-zone collision math, canonical post compilation, and a tamper-evident governance ledger — in Node and in the browser.

Part of [PostFlight](https://github.com/prateeekranga/postflight).

```bash
npm install @postflight/core
```

## Why it's unusual

- **Zero runtime dependencies**, and no Node-only built-ins. No `node:fs`, no `node:crypto`. It uses `Intl.Segmenter`, `TextEncoder`, `URL`, and a pure-TypeScript SHA-256, so the identical code runs in CI and fully offline in a browser tab.
- **Deterministic.** No network, no API keys, no LLM. The same input always produces the same diagnostics, which is what makes it safe to run in CI or hand to an AI agent.
- **77 rules** across limits, fold physics, algorithmic reach, FTC/ASA compliance, WCAG 2.2 accessibility, media and Open Graph forensics, attribution, and brand governance.

## Usage

```ts
import { runPreFlight, compileCanonicalPost, analyzeSafeZone } from '@postflight/core';

const report = runPreFlight(
  { text: 'Your launch draft...', isSponsored: true },
  ['linkedin', 'x', 'instagram-feed', 'bluesky'],
);

console.log(report.overallScore, report.overallGrade, report.totalErrors);

for (const platform of report.platforms) {
  for (const d of platform.diagnostics) {
    console.log(`${d.severity} ${d.ruleId} — ${d.message}`);
  }
}
```

### Platform-exact counting

Every platform counts differently, and the differences are where posts break:

| Platform | What makes it awkward |
| :--- | :--- |
| **X** | Weighted code points, every URL fixed at 23 characters regardless of length |
| **Bluesky** | 300 graphemes **and** 3,000 UTF-8 bytes, plus exact `byteStart`/`byteEnd` facets — JavaScript `.length` gives the wrong answer on emoji |
| **Threads** | Emoji weighted by UTF-8 byte length |
| **Mastodon** | Handles counted with the domain stripped; content warnings counted separately |
| **TikTok** | 4,000 natively but 2,200 through the Content Posting API |

### Safe-zone collision

```ts
const result = analyzeSafeZone('tiktok-organic', [
  { x: 60, y: 1500, width: 960, height: 300, label: 'caption card' },
]);
```

16 presets covering TikTok, Reels, and Shorts in organic and paid variants, the Instagram `4:5 → 3:4` and `9:16 → 3:4` profile grid crops, LinkedIn PDF carousels, and X OG and multi-image grids.

### Canonical compilation

```ts
const artifacts = compileCanonicalPost(markdownSource);
```

One Markdown source becomes platform-native output: numbered X threads, Bluesky posts with exact UTF-8 ATProto facets, fold-optimized LinkedIn copy, and hashtag-capped Instagram/TikTok/Threads variants.

## Requirements

Node.js 20 or newer, or any browser with `Intl.Segmenter`. Ships ESM with TypeScript declarations.

## Documentation

- [All 77 rules](https://github.com/prateeekranga/postflight/blob/main/docs/RULES.md)
- [Architecture](https://github.com/prateeekranga/postflight/blob/main/docs/ARCHITECTURE.md)
- [Platform spec registry](https://github.com/prateeekranga/postflight/tree/main/specs/platforms)

## License

[MIT](LICENSE)
