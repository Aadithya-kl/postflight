# @postflight/cli

**The `postflight` command line tool.** Lint social drafts, compile one canonical post into platform-native artifacts, run safe-zone collision math, and gate CI with SARIF 2.1.0 — with zero API keys.

Part of [PostFlight](https://github.com/prateeekranga/postflight).

```bash
npm install -g @postflight/cli
# or
npx @postflight/cli check draft.md
```

## What it catches

```console
$ postflight check campaign/sponsored-promo.md

 HOLD — ISSUES FOUND   Overall: 0/100  F   15 errors  31 warnings  7 info

    ERROR compliance/ftc-missing-disclosure [compliance] (-30pts) [auto-fix]
          Sponsored post on LinkedIn is missing an approved disclosure token.
          Fix: Prepend '#Ad ' at the very start of the post before the mobile fold.

    WARN  fold/blank-line-starvation [fold] (-10pts) [auto-fix]
          Blank line in the opening 2 lines consumes 1 of 3 mobile visible line(s)
          before '...more' on LinkedIn.
```

Add `--fix` to repair everything marked `[auto-fix]`.

## Commands

| Command | What it does |
| :--- | :--- |
| `check <file-or-dir>` | Lint drafts or campaign folders (`--targets`, `--format`, `--fix`, `--strict`, `--api`, `--sponsored`) |
| `compile <post.md>` | Compile canonical Markdown + YAML into native threads, Bluesky facets, and UTM bundles |
| `safezone --preset <id> --box x,y,w,h:label` | 2D collision math across 16 presets (`--list`) |
| `utm --url <url> --platform <id>` | Audit UTM hygiene, strip `fbclid`/`gclid` |
| `triage <comments.json>` | Separate P0 crises and buyer intent from bot noise |
| `ffmpeg --platform <id> [--hdr]` | Rec.709 / CFR / `yuv420p` / `-14 LUFS` pipelines |
| `tokens <connections.json>` | Audit OAuth decay cliffs and refresh races |
| `contrast --fg #FFF --bg #0D5E99` | WCAG 2.2 AA/AAA contrast calculator |
| `killswitch <status\|freeze\|resume\|verify>` | Publish freeze with a SHA-256 hash-chained ledger |
| `specs [platformId]` | Inspect the platform spec registry |
| `rules [--category <id>]` | List all 77 deterministic rules |
| `studio [--port 4173]` | Start the local Web Studio |

## In CI

`--format sarif` produces SARIF 2.1.0, so findings appear as native GitHub Code Scanning annotations on the pull request:

```yaml
- run: npx @postflight/cli check campaigns/ --format sarif --out postflight.sarif
- uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: postflight.sarif
```

Use `--strict` to exit non-zero when any error-severity rule fires.

Other output formats: `pretty` (default, ANSI), `json`, and `markdown` for posting as a PR comment.

## Requirements

Node.js 20 or newer. Zero runtime dependencies beyond `@postflight/core`.

## License

[MIT](LICENSE)
