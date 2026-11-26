---
name: Feature Request
about: Suggest a new rule, platform, preset, command, or capability
title: "[feat] "
labels: ["enhancement"]
---

## What problem are you hitting?

Describe the failure mode, not just the feature. What went wrong on a real post, or what did you have to check by hand? The underlying problem often suggests a better fix than the one first imagined.

## Area

- [ ] New lint rule
- [ ] New platform spec
- [ ] New safe-zone preset
- [ ] CLI (`@postflight/cli`)
- [ ] MCP server (`@postflight/mcp`)
- [ ] Web Studio (`@postflight/studio`)
- [ ] Core engine / SDK (`@postflight/core`)
- [ ] Documentation

## What would you expect PostFlight to do?

A command, a diagnostic, or a screen — whatever form it takes. Example output is ideal:

```
```

## Source or evidence

If this is about platform behaviour (a limit, a fold cutoff, a crop, an API rejection), link the official documentation or attach a dated measurement. PostFlight's values gate other people's publishing pipelines, so claims need a source.

## Does it fit the project's constraints?

PostFlight is deterministic, needs no API keys, and `core`/`cli`/`mcp` take **zero runtime dependencies**. It is also deliberately not a scheduler and holds no publishing credentials — see [out of scope](https://github.com/prateeekranga/postflight/blob/main/ROADMAP.md#explicitly-out-of-scope).

- [ ] This works without network access or API keys
- [ ] This needs no new runtime dependency (or the issue explains why one is unavoidable)

Not sure? Open it anyway and say so — constraints are a discussion, not a gate.

## Would you be willing to work on it?

- [ ] Yes, with some pointers on where to start
- [ ] Maybe, depending on scope
- [ ] No, just reporting the need

All three are genuinely fine.
