# Contributing to PostFlight

Thanks for helping make social publishing deterministic, accessible, and compliant.

PostFlight is genuinely community-maintained by necessity: platforms change their limits, fold cutoffs, grid crops, and hashtag caps every quarter, and no single maintainer can track all nine. **A spec update is a real contribution, and it takes about two minutes.**

- [Fastest contribution: a platform spec PR](#fastest-contribution-a-platform-spec-pr)
- [Local development](#local-development)
- [Repository layout](#repository-layout)
- [Adding a lint rule](#adding-a-lint-rule)
- [Adding a safe-zone preset](#adding-a-safe-zone-preset)
- [Architecture principles](#architecture-principles)
- [Pull request checklist](#pull-request-checklist)

New contributors: start with [good first issues](docs/GOOD_FIRST_ISSUES.md), which name the exact files to touch.

## Fastest contribution: a platform spec PR

Every platform specification lives as versioned data in [`specs/platforms/*.json`](specs/platforms/), mirrored in the runtime registry at [`packages/core/src/specs/registry.ts`](packages/core/src/specs/registry.ts).

1. Edit `specs/platforms/<platform>.json`. Update the changed values, plus `lastVerified` and `sources`.
2. Mirror the identical change in `packages/core/src/specs/registry.ts`.
3. Run `npm test`. [`specs-sync.test.mjs`](packages/core/test/specs-sync.test.mjs) asserts deep parity between the JSON files and the registry, so it fails loudly if you update only one.
4. Open a PR linking the official platform documentation, a release note, or a dated screenshot of the measured behaviour.

We ask for a source because these values end up gating other people's publishing pipelines. "I measured it myself on 2026-11-20, here is the screenshot" is a perfectly good source.

## Local development

Requires **Node.js 20 or newer**. There is no database, no Redis, and no API keys.

```bash
git clone https://github.com/prateeekranga/postflight.git
cd postflight
npm install          # also links the workspace packages
npm run build        # core -> cli -> mcp -> studio
npm test             # build:packages + the full node:test suite
```

Useful commands while working:

```bash
npm run build:packages                       # skip the Studio bundle (faster loop)
npm run typecheck                            # all four workspaces
npm run docs:rules                           # regenerate docs/RULES.md from the catalog
npm run dev:studio                           # Vite dev server with HMR
npm run studio                               # serve the built Studio
node --test packages/core/test/rules-catalog.test.mjs   # run one test file
node packages/cli/dist/index.js check examples/campaigns/sponsored-promo-broken.md
```

> **If you see `Cannot find module '@postflight/core'`**, the npm workspace links are missing or stale. Run `npm install` from the repository root to restore them.

## Repository layout

```
specs/platforms/*.json      Open platform spec registry (9 platforms) — the data
packages/core/              Zero-dependency engine: rules, counters, fold, safe zones
  src/linter/rules.ts         RULE_CATALOG — the single source of truth for rules
  src/media/validator.ts      Delegated media + Open Graph validators
  src/specs/registry.ts       Runtime mirror of specs/platforms/*.json
packages/cli/               CLI, formatters (pretty/json/sarif/markdown), Studio server
packages/mcp/               JSON-RPC 2.0 stdio MCP server (9 governed tools)
apps/studio/                React 19 + Vite local-first Web Studio (6 instruments)
scripts/generate-rules-doc.mjs   Regenerates docs/RULES.md from RULE_CATALOG
```

## Adding a lint rule

Rules are declared in one place and must be emitted with that same ID, or SARIF output in GitHub Code Scanning degrades to a bare rule ID with no title or description.

1. **Declare it.** Add a `RuleDefinition` to `RULE_CATALOG` in [`packages/core/src/linter/rules.ts`](packages/core/src/linter/rules.ts). The ID prefix must match the `category` — `media/foo` must be `category: 'media'`.
2. **Emit it.** Push a `LintDiagnostic` with that exact `ruleId` from `evaluatePlatformRules`, or from a delegated validator such as [`media/validator.ts`](packages/core/src/media/validator.ts).
3. **Test it.** Add a case to [`packages/core/test/core-engine.test.mjs`](packages/core/test/core-engine.test.mjs) proving it fires on bad input and stays quiet on good input.
4. **Document it.** Run `npm run docs:rules`, which regenerates [docs/RULES.md](docs/RULES.md) from the catalog. Never edit that file by hand.
5. **Verify.** `npm test`.

[`rules-catalog.test.mjs`](packages/core/test/rules-catalog.test.mjs) enforces all of this: it fails if a rule is emitted without a catalog entry, if a catalog entry never actually fires, if an ID is malformed, or if `docs/RULES.md` drifts.

If the rule is mechanically repairable, wire it into [`packages/core/src/linter/autofix.ts`](packages/core/src/linter/autofix.ts) and set `autoFixable: true`. Auto-fixes must be conservative: never change the author's meaning, and never touch anything the rule did not flag.

## Adding a safe-zone preset

Presets live in [`packages/core/src/safezone/analyzer.ts`](packages/core/src/safezone/analyzer.ts), with the Studio's drag-and-drop catalogue in [`apps/studio/src/data/presets.ts`](apps/studio/src/data/presets.ts). Include the canvas size, the four inset values in pixels, any notch geometry, and a `description` saying which UI elements the insets clear. Measure on a real device or a current platform mockup and say which in the PR.

## Architecture principles

1. **Zero external runtime dependencies** in `@postflight/core`, `@postflight/cli`, and `@postflight/mcp`. The engine must stay fast, auditable, and runnable in both Node and the browser. A dependency-free core is why the Studio can run fully offline. If you believe a dependency is unavoidable, open an issue first.
2. **Node + browser parity.** `@postflight/core` uses no Node-only built-ins — no `node:fs`, no `node:crypto`. It relies on `Intl.Segmenter`, `TextEncoder`, `URL`, and a pure-TypeScript SHA-256.
3. **Deterministic, always.** Every rule, counter, simulation, and compliance gate must be reproducible with no network and no LLM. Same input, same diagnostics, every time. That is what makes PostFlight safe to run in CI.
4. **Zero-API-key day-1 value.** A new user must get something useful within a minute of cloning, without Meta App Review or a paid API tier.
5. **Specs are data, not code.** Platform values belong in `specs/platforms/*.json` so non-programmers can contribute them.
6. **Accessibility is not optional.** Studio changes must keep keyboard operability, 4.5:1 text contrast, light/dark parity, and Forced Colors Mode support.

## Pull request checklist

- [ ] `npm run build` and `npm run typecheck` pass
- [ ] `npm test` passes
- [ ] Spec changes update **both** `specs/platforms/<id>.json` and `packages/core/src/specs/registry.ts`
- [ ] New or changed rules include a catalog entry, a test, and a regenerated `docs/RULES.md` (`npm run docs:rules`)
- [ ] Platform-behaviour claims cite an official source or a dated measurement
- [ ] No new runtime dependencies in `core`, `cli`, or `mcp`

Commit messages: a short imperative subject (`Add Threads 1-topic-tag cap`) is all we ask. Conventional Commits are welcome but not required.

## Reporting bugs and requesting features

Use the [issue templates](https://github.com/prateeekranga/postflight/issues/new/choose). For open questions, use [Discussions](https://github.com/prateeekranga/postflight/discussions). For security vulnerabilities, follow [SECURITY.md](SECURITY.md) — please do not open a public issue.

By contributing, you agree your work is licensed under the [MIT License](LICENSE) and that you follow the [Code of Conduct](CODE_OF_CONDUCT.md).
