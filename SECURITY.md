# Security Policy

## Supported versions

| Version | Supported |
| :--- | :--- |
| 1.x | Yes |

## Reporting a vulnerability

**Please do not open a public issue for security vulnerabilities.**

Report privately through [GitHub Security Advisories](https://github.com/prateeekranga/postflight/security/advisories/new), which keeps the report confidential until a fix is available.

Please include:

- What the vulnerability allows an attacker to do
- Steps to reproduce, ideally with a minimal input file
- Affected package (`@postflight/core`, `/cli`, `/mcp`, `/studio`) and version
- Your assessment of impact

You can expect an acknowledgement within about 48 hours and an honest estimate of the fix timeline. This is a volunteer project, so please allow reasonable time before public disclosure. Reporters are credited in the advisory and the changelog unless they prefer otherwise.

## Security guarantees by design

PostFlight's architecture removes several categories of risk rather than mitigating them:

- **No publishing credentials, anywhere.** PostFlight holds no OAuth tokens and cannot post to any platform. It validates content before your publishing tool sees it. A compromise of PostFlight cannot result in a published post.
- **Local-first with zero telemetry.** Drafts, media frames, safe-zone previews, and compliance audits are processed locally. Preview images uploaded to the Web Studio stay entirely in browser memory and are never transmitted.
- **Deterministic and offline.** The engine makes no network calls. `@postflight/core` has zero runtime dependencies, which keeps the supply-chain surface close to zero and makes the code auditable in an afternoon.
- **Governed MCP boundary.** `@postflight/mcp` exposes only read, lint, compile, triage, and governance tools. There is no write or publish tool to abuse, which is what makes it safe to hand to an autonomous agent.
- **Path traversal protection.** `postflight studio` serves static assets strictly within the resolved Studio bundle root.
- **Tamper-evident governance ledger.** The kill-switch ledger is a SHA-256 hash chain; `postflight killswitch verify` detects retroactive edits to the audit trail.

## Scope notes

The following are known, intentional properties rather than vulnerabilities:

- `postflight studio` binds to `127.0.0.1` and has no authentication. It is a local developer tool and should not be exposed to a network.
- The `.postflight/` directory stores local state, including the kill-switch ledger, in plain text. It is tamper-*evident*, not tamper-*proof*; the hash chain detects edits but does not prevent them.
- Rule findings are advisory. PostFlight checks content against platform specifications and regulatory guidance, but it is not legal advice and does not guarantee compliance.

If you are unsure whether something counts as a vulnerability, report it privately anyway. We would rather triage a non-issue than miss a real one.
