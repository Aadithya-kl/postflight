# Roadmap

Direction, not promises. Nothing here has a committed date, and priority follows what people actually need — so an issue with real use cases behind it moves up.

Items marked **help wanted** are ones where an outside contributor could own the whole thing. See [good first issues](docs/GOOD_FIRST_ISSUES.md) for the scoped starter versions.

## Shipped in 1.0

- Open platform spec registry covering 9 platforms as versioned JSON
- `@postflight/core`: 77 deterministic rules, exact per-platform counters, fold simulator, 16-preset safe-zone collision engine, canonical 1-to-N compiler, media/OG validators, SHA-256 hash-chained kill-switch
- `@postflight/cli`: 12 commands with pretty, JSON, Markdown, and SARIF 2.1.0 output
- `@postflight/mcp`: 9 governed read/lint tools over JSON-RPC 2.0 stdio
- `@postflight/studio`: local-first Web Studio with 6 instruments
- Rule catalog integrity test that fails CI on documentation drift

## Near term

**Platform coverage** — **help wanted**
Pinterest, Facebook Page, Reddit, Tumblr, and Snapchat Spotlight are the most requested gaps. Each is a self-contained contribution: one spec file, one registry entry, one union member. See [good first issue #2](docs/GOOD_FIRST_ISSUES.md#2-add-a-new-platform-to-the-registry).

**Spec freshness automation**
`lastVerified` dates go stale silently. A scheduled job that flags specs older than ~90 days and opens a tracking issue would keep the registry honest without manual auditing.

**npm distribution**
Publish `@postflight/core`, `/cli`, and `/mcp` so `npx postflight check` works without cloning. The release workflow and package metadata are already in place; this is waiting on the npm organization.

**CLI ergonomics** — **help wanted**
`NO_COLOR` support, non-TTY detection, a `--quiet` mode, and grouped cross-platform diagnostics. See [good first issue #6](docs/GOOD_FIRST_ISSUES.md#6-improve-cli-output).

**Configuration surface**
`postflight.config.json` currently covers brand guardrails. Extending it to per-rule severity overrides and per-directory targets would make PostFlight usable on large multi-brand repositories.

## Exploring

These are ideas, not commitments. Opinions in [Discussions](https://github.com/prateeekranga/postflight/discussions) genuinely shape whether they happen.

**Studio accessibility audit** — **help wanted**
The Studio targets WCAG 2.2 AA but has never had a proper audit, particularly the drag-and-drop X-Ray canvas under keyboard-only operation.

**Editor integration**
A language-server or VS Code extension surfacing fold cutoffs and rule violations inline while drafting. The engine is already browser-compatible, so the hard part is the editor plumbing.

**Scheduler adapters**
Thin adapters so Postiz, Mixpost, or a custom pipeline can call PostFlight as a pre-publish gate. PostFlight stays out of the publishing business — these would be read-only validation hooks.

**Spec provenance**
Recording *how* each spec value was verified (official doc, measurement, API response) so downstream users can judge confidence per field.

**Internationalization**
Rule messages are English-only. Several rules (fold physics, CJK grapheme counting) matter most for non-English content, where the counting divergences are largest.

## Explicitly out of scope

PostFlight will not become a scheduler or a publishing client. It holds no OAuth write credentials and does not post on your behalf. That boundary is what makes it safe to hand to an AI agent, safe to run in CI, and usable on day one without an app review. It composes with your scheduler rather than replacing it.

Similarly, `@postflight/core` will not take runtime npm dependencies. The zero-dependency constraint is why the engine runs identically in Node, in CI, and fully offline in the browser.

## Influencing this list

Open an issue describing the problem you hit, not just the feature you want — the failure mode usually suggests a better fix than the one originally asked for. Real use cases move items up this list faster than anything else.
