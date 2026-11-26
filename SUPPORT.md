# Getting help

PostFlight is maintained by volunteers, so please pick the channel that matches what you need. It genuinely speeds things up.

## Start here

Most questions are answered by:

- **[README](README.md)** — quickstart, CLI reference, and what each surface does
- **[docs/RULES.md](docs/RULES.md)** — what each of the 77 rules catches and why
- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — how the pieces fit together
- **[docs/MCP_INTEGRATION.md](docs/MCP_INTEGRATION.md)** — MCP setup for Claude Code, Cursor, Windsurf

Two commands answer a lot on their own:

```bash
postflight rules --category media   # what the linter checks and why
postflight specs linkedin           # the exact values PostFlight is enforcing
```

## Where to go

| What you have | Where it goes |
| :--- | :--- |
| A question, or "am I using this right?" | [Discussions](https://github.com/prateeekranga/postflight/discussions) |
| Something is broken or behaves wrongly | [Bug report](https://github.com/prateeekranga/postflight/issues/new?template=bug-report.md) |
| A platform changed its limits | [Platform spec update](https://github.com/prateeekranga/postflight/issues/new?template=platform-spec-update.md) |
| An idea for a new capability | [Feature request](https://github.com/prateeekranga/postflight/issues/new?template=feature-request.md) |
| A security vulnerability | **Do not open an issue** — see [SECURITY.md](SECURITY.md) |
| You want to contribute code | [CONTRIBUTING.md](CONTRIBUTING.md) and [good first issues](docs/GOOD_FIRST_ISSUES.md) |

## What makes a report easy to act on

PostFlight is deterministic — the same input always produces the same diagnostics — so a reproduction almost always pins the problem immediately:

1. The command you ran, verbatim.
2. The draft or a minimal version of it that still reproduces the behaviour. Redact real brand copy; the rule usually fires on the structure, not the words.
3. What you expected versus what happened.
4. `node --version` and your OS.
5. For rule disputes, a link to the platform's official documentation. If PostFlight has a value wrong, that link is the fix.

## Common issues

**`Cannot find module '@postflight/core'`**
The npm workspace links are missing or stale, which also happens after copying the folder between drives. Run `npm install` from the repository root.

**A rule fires on something you believe is fine**
Check `postflight specs <platform>` to see the value being enforced. If the platform has since changed it, a [spec update PR](CONTRIBUTING.md#fastest-contribution-a-platform-spec-pr) is the right fix and takes about two minutes. Brand-specific exceptions belong in `postflight.config.json`.

**Fold simulation does not match what you see on your phone**
Fold cutoffs vary by device width, font size, and app version. Open an issue with your device, the app version, and a screenshot — these measurements are exactly what keeps the specs accurate.

## Response expectations

This is a volunteer project with no SLA. Security reports are acknowledged within about 48 hours; everything else is best-effort. A PR will almost always get attention faster than an issue, and an imperfect PR with a clear question is a perfectly good way to ask something.
