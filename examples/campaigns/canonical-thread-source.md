---
id: canonical-thread-launch
title: Why great social posts silently fail (and how PostFlight stops it)
campaign: postflight-v1-thread
url: https://postflight.dev/
targets: [x, linkedin, bluesky, instagram-feed, threads, mastodon]
hashtags: [OpenSource, SocialMediaEngineering, DevTools]
sponsored: false
aiGenerated: false
dmKeyword: PREFLIGHT
---
We analyzed 9 social platforms and found why great posts silently fail before anyone ever clicks.

LinkedIn folds mobile posts at line 3 and counts blank lines as full lines. Instagram slashed hashtags from 30 to 5 and slices 34px off each side of 4:5 posts in its 3:4 profile grid. Bluesky rejects 2.0 MiB images because its cap is 2,000,000 decimal bytes.

So we built PostFlight — an open-source pre-flight compiler, linter, safe-zone X-ray, and MCP server that catches reach killers, UI overlay collisions, WCAG issues, and FTC fold violations locally before you publish. Zero social API keys required.
