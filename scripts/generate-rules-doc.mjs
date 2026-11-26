#!/usr/bin/env node
/**
 * Regenerates docs/RULES.md from the single source of truth: RULE_CATALOG in
 * packages/core/src/linter/rules.ts.
 *
 * Run `npm run docs:rules` after adding or editing a rule. The
 * `rules-catalog.test.mjs` integrity test fails CI if the doc drifts out of
 * sync with the engine, so this is not optional housekeeping.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RULE_CATALOG } from '../packages/core/dist/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outFile = path.resolve(__dirname, '../docs/RULES.md');

/** Section titles and blurbs, in the order they appear in the doc. */
const SECTIONS = [
  {
    category: 'limits',
    title: 'Platform Limits & Protocol Counting',
    blurb:
      'Each platform counts differently. X applies weighted code-point counting with every URL fixed at 23 characters; Bluesky enforces 300 graphemes *and* 3,000 UTF-8 bytes; Threads weights emoji by UTF-8 byte length; TikTok diverges between its native app and its Content Posting API.',
  },
  {
    category: 'fold',
    title: 'Mobile & Desktop Fold Physics',
    blurb:
      'The `...more` cutoff decides whether anyone reads past your hook. These rules simulate the exact truncation point on mobile and desktop, including the LinkedIn blank-line trap where a single `Enter` press costs a full visible line.',
  },
  {
    category: 'algorithm',
    title: 'Algorithmic Reach Suppressors',
    blurb:
      'Patterns that do not break publishing but quietly cost you distribution: outbound links in the body, hashtag cliffs, engagement bait, dead link shorteners, and the X leading-`@mention` reply trap.',
  },
  {
    category: 'compliance',
    title: 'Legal & Regulatory Compliance',
    blurb:
      'FTC 16 CFR Part 255, the UK ASA CAP Code, and EU Digital Fairness Act disclosure requirements. A disclosure that sits below the mobile fold is treated as no disclosure at all.',
  },
  {
    category: 'accessibility',
    title: 'WCAG 2.2 Accessibility & Social SEO',
    blurb:
      'Unicode faux-bold and lowercase hashtags break screen readers *and* make your keywords invisible to in-platform search. These rules catch both at once, and most are auto-fixable.',
  },
  {
    category: 'media',
    title: 'Media, Carousels, Video Transcoding & Open Graph Cards',
    blurb:
      'Upload rejections, silent reclassifications, and link previews that never render. Includes the Instagram Graph API `36003` aspect-ratio rejection, the Bluesky decimal-byte trap, YouTube Shorts landscape misclassification, and the WhatsApp 300 KB Open Graph drop.',
  },
  {
    category: 'attribution',
    title: 'Dark-Social Attribution',
    blurb:
      'UTM hygiene for traffic that arrives with no referrer. Catches casing drift, click-ID pollution, and `utm_source` values that disagree with the platform actually being posted to.',
  },
  {
    category: 'governance',
    title: 'Brand, Legal & Scheduling Governance',
    blurb:
      'Guardrails configured in `postflight.config.json`: forbidden and required terminology, unfilled template placeholders, and scheduling hazards such as missing timezone offsets and DST transition windows.',
  },
];

const SEVERITY_RANK = { error: 0, warning: 1, info: 2 };

/**
 * Reproduces GitHub's heading-anchor algorithm so the table of contents links
 * actually resolve: lowercase, drop every character that is not alphanumeric,
 * space, hyphen or underscore, then convert spaces to hyphens.
 *
 *   "1. Media & OG Cards (`media/*`)"  ->  "1-media--og-cards-media"
 *
 * Note the doubled hyphen where "&" was removed from between two spaces.
 */
function githubSlug(heading) {
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9 _-]/g, '')
    .replace(/ /g, '-');
}

/** The exact heading text rendered for a section, used for both the heading and its anchor. */
function sectionHeading(section, index) {
  return `${index + 1}. ${section.title} (\`${section.category}/*\`)`;
}

function escapePipes(text) {
  return text.replace(/\|/g, '\\|');
}

function renderTable(rules) {
  const lines = [
    '| Rule ID | Severity | What It Catches |',
    '| :--- | :--- | :--- |',
  ];
  for (const rule of rules) {
    lines.push(
      `| \`${rule.id}\` | \`${rule.defaultSeverity}\` | **${escapePipes(rule.title)}** — ${escapePipes(rule.summary)} |`,
    );
  }
  return lines.join('\n');
}

const byCategory = new Map();
for (const rule of RULE_CATALOG) {
  if (!byCategory.has(rule.category)) byCategory.set(rule.category, []);
  byCategory.get(rule.category).push(rule);
}

const known = new Set(SECTIONS.map((s) => s.category));
const unknown = [...byCategory.keys()].filter((c) => !known.has(c));
if (unknown.length > 0) {
  console.error(
    `Rule categories with no section defined in scripts/generate-rules-doc.mjs: ${unknown.join(', ')}`,
  );
  process.exit(1);
}

const severityTotals = { error: 0, warning: 0, info: 0 };
for (const rule of RULE_CATALOG) severityTotals[rule.defaultSeverity]++;

const parts = [];

parts.push(`# PostFlight Rule Catalog

> **Generated file — do not edit by hand.**
> Every rule below is declared in [\`packages/core/src/linter/rules.ts\`](../packages/core/src/linter/rules.ts).
> Edit the catalog there, then run \`npm run docs:rules\` to regenerate this page.

All **${RULE_CATALOG.length} rules** are fully deterministic: no network calls, no API keys, no LLM. The same input always produces the same diagnostics, which is what makes them safe to run in CI.

| | Count |
| :--- | ---: |
| Total rules | **${RULE_CATALOG.length}** |
| \`error\` (blocks \`--strict\` builds) | ${severityTotals.error} |
| \`warning\` | ${severityTotals.warning} |
| \`info\` | ${severityTotals.info} |
| Categories | ${byCategory.size} |

List them from the CLI at any time:

\`\`\`bash
postflight rules                      # all ${RULE_CATALOG.length}
postflight rules --category media     # one category
\`\`\`

## Severity levels

| Severity | Meaning |
| :--- | :--- |
| \`error\` | Will be rejected by the platform or API, or carries legal exposure. Fails \`postflight check --strict\`. |
| \`warning\` | Publishes successfully but measurably costs reach, accessibility, or attribution. |
| \`info\` | Advisory. Worth knowing, safe to ignore case by case. |

Severities shown here are defaults. Per-rule overrides go in \`postflight.config.json\` — see [\`postflight.config.example.json\`](../postflight.config.example.json).

## Contents

${SECTIONS.map((s, i) => {
  const count = (byCategory.get(s.category) ?? []).length;
  return `${i + 1}. [${s.title}](#${githubSlug(sectionHeading(s, i))}) — \`${s.category}/*\` (${count} rule${count === 1 ? '' : 's'})`;
}).join('\n')}`);

SECTIONS.forEach((section, i) => {
  const rules = (byCategory.get(section.category) ?? [])
    .slice()
    .sort(
      (a, b) =>
        SEVERITY_RANK[a.defaultSeverity] - SEVERITY_RANK[b.defaultSeverity] ||
        a.id.localeCompare(b.id),
    );
  if (rules.length === 0) return;

  parts.push(`## ${sectionHeading(section, i)}

${section.blurb}

${renderTable(rules)}`);
});

parts.push(`## Adding a rule

1. Add a \`RuleDefinition\` to \`RULE_CATALOG\` in [\`packages/core/src/linter/rules.ts\`](../packages/core/src/linter/rules.ts). The \`id\` prefix must match the \`category\`.
2. Emit the diagnostic with that exact \`ruleId\` from \`evaluatePlatformRules\` or a delegated validator such as [\`media/validator.ts\`](../packages/core/src/media/validator.ts).
3. Add a test in [\`packages/core/test/core-engine.test.mjs\`](../packages/core/test/core-engine.test.mjs).
4. Run \`npm run docs:rules\` to regenerate this page, then \`npm test\`.

[\`rules-catalog.test.mjs\`](../packages/core/test/rules-catalog.test.mjs) fails the build if a rule is emitted without a catalog entry, if a catalog entry never fires, or if this document falls out of sync. Unregistered rules degrade SARIF output in GitHub Code Scanning to a bare rule ID with no title or description, so the catalog entry is not optional.

See [CONTRIBUTING.md](../CONTRIBUTING.md) for the full contribution workflow.`);

fs.writeFileSync(outFile, parts.join('\n\n---\n\n') + '\n', 'utf8');
console.log(
  `Wrote ${path.relative(process.cwd(), outFile)} — ${RULE_CATALOG.length} rules across ${byCategory.size} categories.`,
);
