# Good First Issues

Scoped starter tasks with the exact files to touch. Every one of these is genuinely useful — none are busywork invented to onboard you.

**Before you start:** comment on the matching issue (or open one) so two people don't do the same work. If no issue exists yet, open one titled after the task below.

**Setup once:**

```bash
git clone https://github.com/prateeekranga/postflight.git
cd postflight && npm install && npm run build && npm test
```

Read [CONTRIBUTING.md](../CONTRIBUTING.md) for the full workflow and the [architecture principles](../CONTRIBUTING.md#architecture-principles) — especially the zero-runtime-dependency rule.

---

## 1. Verify and refresh a platform spec · `no code required`

**Difficulty:** easiest thing in the repo. **Skills:** reading platform docs carefully.

Each file in [`specs/platforms/`](../specs/platforms/) carries a `lastVerified` date. Platforms change limits quarterly, so some values drift.

Pick one platform, check its current official documentation against the JSON, and update anything stale — plus `lastVerified` and `sources`.

**Files:** `specs/platforms/<platform>.json` **and** the matching entry in `packages/core/src/specs/registry.ts` (a parity test enforces both).

**Done when:** `npm test` passes and the PR links the official doc or a dated screenshot.

---

## 2. Add a new platform to the registry

**Difficulty:** moderate. **Skills:** TypeScript, patience with platform docs.

PostFlight covers 9 platforms: X, LinkedIn, Instagram Feed, Instagram Reels, TikTok, YouTube Shorts, Threads, Bluesky, Mastodon. Obvious gaps, roughly easiest first:

| Platform | Why it's wanted | Notable quirk to capture |
| :--- | :--- | :--- |
| **Pinterest** | Large organic surface, no open linter covers it | Idea Pin vs. standard Pin limits differ |
| **Facebook Page** | Still the default for local business and nonprofits | Fold cutoff differs from Instagram despite shared API |
| **Reddit** | Heavily text-first, strict per-subreddit rules | Markdown flavour + title/body split |
| **Tumblr** | Simple spec, very approachable first platform | Tag limits and the 30-tag soft cap |
| **Snapchat Spotlight** | Completes the 9:16 short-form set | Distinct chrome insets from TikTok/Reels |

**Files:** new `specs/platforms/<id>.json` (copy the shape of [`mastodon.json`](../specs/platforms/mastodon.json), the simplest one), a matching entry in `packages/core/src/specs/registry.ts`, and the `PlatformId` union in `packages/core/src/types.ts`.

**Done when:** `postflight specs <id>` prints the spec and `npm test` passes. A platform with partial data is still welcome — say in the PR which fields you could not verify.

---

## 3. Add a safe-zone preset

**Difficulty:** moderate. **Skills:** measuring pixels, basic geometry.

There are 16 presets (`postflight safezone --list`). Missing and useful: Pinterest Idea Pin, Facebook Reels, Snapchat Spotlight, LinkedIn native video, and Threads image crop.

A preset is a canvas size plus four inset values in pixels, optionally with notch geometry. Measure on a real device or a current platform mockup.

**Files:** [`packages/core/src/safezone/analyzer.ts`](../packages/core/src/safezone/analyzer.ts) and [`apps/studio/src/data/presets.ts`](../apps/studio/src/data/presets.ts).

**Done when:** `postflight safezone --preset <id> --list` shows it and the Studio X-Ray canvas renders it. Say how you measured.

---

## 4. Extend the auto-fixer

**Difficulty:** moderate. **Skills:** TypeScript, Unicode awareness.

[`autofix.ts`](../packages/core/src/linter/autofix.ts) currently repairs invisible zero-width characters, Unicode faux-bold, and lowercase hashtags. Several rules are mechanically fixable but not yet wired up:

- `accessibility/redundant-alt-prefix` — strip a leading "Image of " / "Photo of " from alt text
- `accessibility/all-caps-shouting` — offer sentence case for runs of 3+ ALL-CAPS words
- `media/og-title-too-long` / `media/og-description-too-long` — suggest a truncation at a word boundary

Auto-fixes must be conservative: never change meaning, never touch text the rule did not flag.

**Files:** `packages/core/src/linter/autofix.ts`, set `autoFixable: true` on the rule in `packages/core/src/linter/rules.ts`, add a test in `packages/core/test/core-engine.test.mjs`.

---

## 5. Add a lint rule

**Difficulty:** moderate. **Skills:** TypeScript.

Follow [Adding a lint rule](../CONTRIBUTING.md#adding-a-lint-rule). Ideas that fit the existing engine:

- **Link-in-bio placeholder** — flag "link in bio" copy when the draft has no accompanying URL anywhere
- **Mixed-script homoglyphs** — Cyrillic `а` inside Latin words, which trips spam classifiers
- **Trailing whitespace before the fold** — silently wastes fold budget
- **Duplicated hashtags** — `#AI #ai` counts twice against a 5-tag cap but adds no reach
- **Emoji-only hook** — first visible line with no indexable text

**Files:** `packages/core/src/linter/rules.ts`, a test in `packages/core/test/core-engine.test.mjs`, then `npm run docs:rules`.

---

## 6. Improve CLI output

**Difficulty:** easy to moderate. **Skills:** TypeScript, a feel for terminal UX.

[`formatters.ts`](../packages/cli/src/formatters.ts) renders pretty, JSON, SARIF, and Markdown output. Open improvements:

- Respect [`NO_COLOR`](https://no-color.org/) and detect non-TTY output to drop ANSI codes automatically
- A `--quiet` flag that prints only errors
- Group repeated diagnostics across platforms instead of repeating the full text per platform

**Files:** `packages/cli/src/formatters.ts`, `packages/cli/src/index.ts`, tests in `packages/cli/test/cli.test.mjs`.

---

## 7. Write a CI recipe for another platform

**Difficulty:** easy. **Skills:** YAML, whichever CI you know.

The repo ships a GitHub Actions workflow. Contributors on other CI systems need an equivalent for GitLab CI, Bitbucket Pipelines, CircleCI, or a pre-commit hook.

**Files:** a new `docs/CI_RECIPES.md`, linked from the README documentation table.

**Done when:** someone can copy the snippet and have `postflight check` gate their pipeline.

---

## 8. Add test coverage for an untested path

**Difficulty:** easy to moderate. **Skills:** `node:test`.

The suite covers the engine well but is thin in places. Useful additions:

- `postflight killswitch verify` against a **tampered** ledger (the hash chain should reject it)
- `postflight triage` with malformed and empty `comments.json`
- CLI exit codes: `--strict` must exit non-zero when errors exist
- Round-trip: `compile` output re-fed through `check` should come back clean

**Files:** `packages/core/test/core-engine.test.mjs`, `packages/cli/test/cli.test.mjs`.

---

## 9. Studio accessibility audit

**Difficulty:** moderate. **Skills:** a11y, React, CSS.

The Studio targets WCAG 2.2 AA. It needs an audit it has never had: keyboard-only operation of the Safe-Zone X-Ray canvas, visible focus indicators throughout, screen-reader labelling of the fold simulator, and Forced Colors Mode.

**Files:** `apps/studio/src/components/*.tsx`, `apps/studio/src/styles/*.css`.

**Done when:** the PR lists what you tested with and what you fixed. Partial fixes are welcome — report the rest as issues.

---

## 10. Documentation and examples

**Difficulty:** easiest. **Skills:** writing clearly.

- Add a campaign to [`examples/campaigns/`](../examples/campaigns/) demonstrating a failure mode not yet covered
- Document a platform gotcha you have personally hit
- Improve any explanation in `docs/` that did not make sense on first read — if it confused you, it confuses others

Do not hand-edit [`docs/RULES.md`](RULES.md); it is generated by `npm run docs:rules`.

---

## Stuck?

Open a [Discussion](https://github.com/prateeekranga/postflight/discussions) or comment on the issue. A half-finished PR with a clear question is a perfectly good way to ask — reviewing real code is easier than guessing what you meant.
