import {
  PLATFORM_IDS,
  RULE_CATALOG,
  SAFE_ZONE_PRESETS,
  analyzeSafeZone,
  auditOAuthTokens,
  auditUtmUrl,
  buildCanonicalUtmUrl,
  buildFfmpegNormalizeCommand,
  compileCanonicalPost,
  getPlatformSpec,
  isPlatformId,
  listPlatformSpecs,
  listSafeZonePresets,
  runPreFlight,
  simulatePlatformFold,
  triageComments,
  validateOpenGraph,
} from '@postflight/core';
import type {
  BoundingBox,
  BrandGuardrails,
  CommentItem,
  MediaAttachment,
  OAuthConnectionInput,
  OpenGraphMeta,
  PlatformId,
  SafeZonePresetId,
  SocialDraft,
} from '@postflight/core';

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpResourceDefinition {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

export interface McpResourceContent {
  uri: string;
  mimeType: string;
  text: string;
}

const PLATFORM_ENUM = [...PLATFORM_IDS];

const SAFE_ZONE_PRESET_ENUM: SafeZonePresetId[] = [
  'tiktok-organic',
  'tiktok-ad',
  'tiktok-ad-strict',
  'instagram-reels-organic',
  'instagram-reels-ad',
  'instagram-reels-to-grid',
  'youtube-shorts-organic',
  'youtube-shorts-ad',
  'universal-organic',
  'universal-ad-safe',
  'instagram-feed-to-grid',
  'linkedin-pdf-carousel',
  'x-og-card',
  'x-grid-2',
  'x-grid-3',
  'x-grid-4',
];

export const MCP_TOOLS: readonly McpToolDefinition[] = [
  {
    name: 'preflight_lint_post',
    description:
      'Run deterministic pre-flight linting on a social media draft across 1–9 platforms (character/byte/grapheme counting, LinkedIn blank-line fold physics, FTC/ASA disclosure checks, WCAG 2.2 accessibility, media & OG validation, UTM hygiene, and brand guardrails). Returns score, grade, diagnostics, fold cutoffs, and a 1-click self-healing autoFixPreview. Never publishes live posts.',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'The main body copy of the social media post draft.',
        },
        targets: {
          type: 'array',
          items: { type: 'string', enum: PLATFORM_ENUM },
          minItems: 1,
          description: 'Target platforms to lint against (defaults to all 9 platforms).',
        },
        title: {
          type: 'string',
          description: 'Optional title (used for YouTube Shorts title limit checks).',
        },
        firstComment: {
          type: 'string',
          description: 'Optional planned first comment / reply text.',
        },
        contentWarning: {
          type: 'string',
          description: 'Optional Mastodon spoilerText / content warning.',
        },
        isSponsored: {
          type: 'boolean',
          description: 'True if this is a paid/sponsored/affiliate post requiring FTC/ASA above-the-fold disclosure.',
        },
        isAiGenerated: {
          type: 'boolean',
          description: 'True if synthetic/AI-generated media or copy requires disclosure.',
        },
        publishViaApi: {
          type: 'boolean',
          description: 'Enforce stricter publishing API caps (e.g. TikTok 2,200 API limit, IG Graph API Error 36003 & 10-item carousel cap).',
        },
        scheduledAt: {
          type: 'string',
          description: 'Optional ISO-8601 scheduled publish timestamp to audit timezone offset, top-of-hour burst, and DST transition risks.',
        },
        media: {
          type: 'array',
          description: 'Optional media attachment metadata to validate (dimensions, sizeBytes, durationSec, altText, HDR/VFR, C2PA).',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['image', 'video', 'pdf'] },
              filename: { type: 'string' },
              altText: { type: 'string' },
              width: { type: 'number' },
              height: { type: 'number' },
              sizeBytes: { type: 'number' },
              durationSec: { type: 'number' },
              pages: { type: 'number' },
              fps: { type: 'number' },
              isHdr: { type: 'boolean' },
              isVfr: { type: 'boolean' },
              chromaSubsampling: { type: 'string', enum: ['4:2:0', '4:2:2', '4:4:4'] },
              hasC2paMetadata: { type: 'boolean' },
              aspectRatio: { type: 'string' },
            },
            required: ['type'],
          },
        },
        openGraph: {
          type: 'object',
          description: 'Optional Open Graph card metadata for linked URLs.',
          properties: {
            url: { type: 'string' },
            title: { type: 'string' },
            description: { type: 'string' },
            imageWidth: { type: 'number' },
            imageHeight: { type: 'number' },
            imageSizeBytes: { type: 'number' },
            imageFormat: { type: 'string', enum: ['jpeg', 'png', 'webp', 'avif', 'svg', 'gif'] },
            twitterCard: { type: 'string', enum: ['summary', 'summary_large_image', 'none'] },
          },
        },
        guardrails: {
          type: 'object',
          description: 'Optional BrandGuardrails configuration (forbiddenTerms, requiredTerms, disclosureJurisdiction, flagAiSlop, etc.).',
          properties: {
            brandName: { type: 'string' },
            forbiddenTerms: { type: 'array', items: { type: 'string' } },
            requiredTerms: { type: 'array', items: { type: 'string' } },
            requiredUtmParams: { type: 'array', items: { type: 'string' } },
            expectedUtmMedium: { type: 'string' },
            expectedCampaign: { type: 'string' },
            disclosureJurisdiction: { type: 'string', enum: ['ftc', 'asa-uk', 'dfa-eu', 'both', 'all'] },
            flagAiSlop: { type: 'boolean' },
            strictAccessibility: { type: 'boolean' },
            allowExternalLinks: { type: 'boolean' },
            useApiLimits: { type: 'boolean' },
            xPremium: { type: 'boolean' },
            mastodonMaxChars: { type: 'number' },
          },
        },
      },
      required: ['text'],
    },
  },
  {
    name: 'compile_canonical_post',
    description:
      'Compile a single canonical Markdown+YAML post into platform-native artifacts: X weighted threads (t.co=23), Bluesky posts with exact UTF-8 byteStart/byteEnd ATProto facets, LinkedIn fold-optimized drafts, Instagram 5-hashtag captions, Threads single topic-tag posts, and canonical per-platform UTM links.',
    inputSchema: {
      type: 'object',
      properties: {
        markdown: {
          type: 'string',
          description: 'Canonical Markdown document with optional YAML frontmatter (id, title, campaign, url, targets, hashtags, sponsored, dmKeyword).',
        },
        targets: {
          type: 'array',
          items: { type: 'string', enum: PLATFORM_ENUM },
          description: 'Optional override list of target platforms.',
        },
        guardrails: {
          type: 'object',
          description: 'Optional BrandGuardrails to apply while linting compiled outputs.',
        },
      },
      required: ['markdown'],
    },
  },
  {
    name: 'check_safe_zone',
    description:
      'Compute exact 2D pixel collision overlaps between overlay bounding boxes (captions, CTAs, logos, titles) and platform UI dead zones across 16 presets including TikTok Organic/Paid Ad + lower-right notch, Instagram Reels Organic/Ad & Reels Cover -> 3:4 Profile Grid, YouTube Shorts Organic/Ad, Instagram 4:5->3:4 profile grid crop (1012x1350), LinkedIn PDF carousels, and X multi-image/OG grids.',
    inputSchema: {
      type: 'object',
      properties: {
        presetId: {
          type: 'string',
          enum: SAFE_ZONE_PRESET_ENUM,
          description: 'Safe-zone preset identifier.',
        },
        boxes: {
          type: 'array',
          description: 'Overlay bounding boxes in pixel coordinates relative to the preset canvas.',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              label: { type: 'string' },
              x: { type: 'number' },
              y: { type: 'number' },
              width: { type: 'number' },
              height: { type: 'number' },
            },
            required: ['x', 'y', 'width', 'height'],
          },
        },
      },
      required: ['presetId'],
    },
  },
  {
    name: 'simulate_fold_preview',
    description:
      'Simulate exact mobile and desktop "See more" / "...more" truncation cutoffs for any platform, including LinkedIn blank-line line consumption and media-attached fold collapse.',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Draft post text to simulate.',
        },
        platform: {
          type: 'string',
          enum: PLATFORM_ENUM,
          description: 'Target platform ID.',
        },
        platforms: {
          type: 'array',
          items: { type: 'string', enum: PLATFORM_ENUM },
          description: 'Optional array of platforms to simulate simultaneously.',
        },
        hasMedia: {
          type: 'boolean',
          description: 'Whether image/video/document media is attached (tightens LinkedIn mobile fold from 3 lines to 2 lines).',
        },
      },
      required: ['text'],
    },
  },
  {
    name: 'audit_utm_and_og',
    description:
      'Audit URL UTM hygiene (case fragmentation, click-ID noise like fbclid/gclid, platform mismatch, dark-social risk), optionally build a clean canonical UTM URL, and validate Open Graph card specs (WhatsApp 300 KB silent drop, LinkedIn 1200x627 threshold, X 2:1 summary_large_image crop).',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'URL to audit for UTM hygiene and click-ID noise.',
        },
        platform: {
          type: 'string',
          enum: PLATFORM_ENUM,
          description: 'Target platform for utm_source matching and OG card rules.',
        },
        expectedCampaign: {
          type: 'string',
          description: 'Expected utm_campaign slug (also used to build canonicalUtmUrl).',
        },
        expectedMedium: {
          type: 'string',
          description: 'Expected utm_medium slug (default: "organic-social").',
        },
        openGraph: {
          type: 'object',
          description: 'Optional Open Graph metadata to validate.',
          properties: {
            url: { type: 'string' },
            title: { type: 'string' },
            description: { type: 'string' },
            imageWidth: { type: 'number' },
            imageHeight: { type: 'number' },
            imageSizeBytes: { type: 'number' },
            imageFormat: { type: 'string', enum: ['jpeg', 'png', 'webp', 'avif', 'svg', 'gif'] },
            twitterCard: { type: 'string', enum: ['summary', 'summary_large_image', 'none'] },
          },
        },
      },
    },
  },
  {
    name: 'triage_comments',
    description:
      'Classify and prioritize social media comments into P0 Crisis/Urgent, High-Intent Buyer Leads, Support, Product Feedback, Community, and Bot/Emoji Noise — with SLA targets and Meta 24-hour / FINRA Rule 2210 compliance alerts.',
    inputSchema: {
      type: 'object',
      properties: {
        comments: {
          type: 'array',
          description: 'List of social media comments to classify and prioritize.',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              author: { type: 'string' },
              platform: { type: 'string', enum: PLATFORM_ENUM },
              text: { type: 'string' },
              timestamp: { type: 'string' },
              postId: { type: 'string' },
            },
            required: ['text', 'platform'],
          },
        },
      },
      required: ['comments'],
    },
  },
  {
    name: 'build_ffmpeg_normalize_cmd',
    description:
      'Generate copy-ready FFmpeg normalization commands calibrated to platform specs: 8-bit Rec.709 SDR (optional Hable HDR tone mapping), Constant Frame Rate (CFR), yuv420p chroma, closed GOP + moov faststart, and -14 LUFS audio loudness.',
    inputSchema: {
      type: 'object',
      properties: {
        platform: {
          type: 'string',
          enum: PLATFORM_ENUM,
          description: 'Target social platform.',
        },
        input: {
          type: 'string',
          description: 'Input video filename (default: "input.mov").',
        },
        output: {
          type: 'string',
          description: 'Output MP4 filename (default: "<platform>-normalized.mp4").',
        },
        isHdr: {
          type: 'boolean',
          description: 'Set true for 10-bit HDR/Dolby Vision/HLG phone footage to include Hable HDR->Rec.709 SDR tone mapping.',
        },
        targetFps: {
          type: 'number',
          enum: [24, 30, 60],
          description: 'Constant frame rate target (24, 30, or 60; default: 30).',
        },
      },
      required: ['platform'],
    },
  },
  {
    name: 'audit_oauth_tokens',
    description:
      'Audit OAuth connection token health across Meta (60d / 24h refresh window), LinkedIn (60d non-Marketing Partner cliff), X (2h offline.access loop & RFC 9700 concurrent refresh races), TikTok (24h TTL & unaudited SELF_ONLY lock), Bluesky, YouTube, and Mastodon.',
    inputSchema: {
      type: 'object',
      properties: {
        connections: {
          type: 'array',
          description: 'OAuth connection metadata records (never pass raw secret tokens).',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              accountHandle: { type: 'string' },
              platform: { type: 'string', enum: PLATFORM_ENUM },
              accessTokenIssuedAt: { type: 'string', description: 'ISO-8601 timestamp when access token was issued.' },
              refreshTokenIssuedAt: { type: 'string', description: 'Optional ISO-8601 timestamp when refresh token was issued.' },
              isMarketingPartner: { type: 'boolean' },
              hasOfflineAccess: { type: 'boolean' },
              isAppAudited: { type: 'boolean' },
              concurrentWorkers: { type: 'number' },
            },
            required: ['id', 'accountHandle', 'platform', 'accessTokenIssuedAt'],
          },
        },
        nowIso: {
          type: 'string',
          description: 'Optional ISO-8601 evaluation reference timestamp (defaults to current time).',
        },
      },
      required: ['connections'],
    },
  },
  {
    name: 'get_platform_spec',
    description:
      'Retrieve authoritative 2025–2026 platform specifications from the open PostFlight registry (counting algorithm, native vs API limits, fold cutoffs, hashtag caps, link penalties, alt-text caps, safe zones, and OAuth gotchas). Omit platform to list all 9 platforms and 16 safe-zone presets.',
    inputSchema: {
      type: 'object',
      properties: {
        platform: {
          type: 'string',
          enum: PLATFORM_ENUM,
          description: 'Optional platform ID. Omit to list all platforms.',
        },
      },
    },
  },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertPlatformId(value: unknown, fieldName = 'platform'): PlatformId {
  if (typeof value !== 'string' || !isPlatformId(value)) {
    throw new Error(
      `Invalid ${fieldName} "${String(value)}". Expected one of: ${PLATFORM_IDS.join(', ')}`
    );
  }
  return value;
}

function parsePlatformList(value: unknown, defaultList: readonly PlatformId[]): PlatformId[] {
  if (value === undefined) {
    return [...defaultList];
  }
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('"targets" / "platforms" must be a non-empty array of valid platform IDs.');
  }
  return value.map((item) => assertPlatformId(item, 'target platform'));
}

function isSafeZonePresetId(value: string): value is SafeZonePresetId {
  return Object.prototype.hasOwnProperty.call(SAFE_ZONE_PRESETS, value);
}

export function executeMcpTool(
  name: string,
  args: Record<string, unknown>
): unknown {
  switch (name) {
    case 'preflight_lint_post': {
      const draftObj = isRecord(args.draft) ? args.draft : args;
      const text = draftObj.text;
      if (typeof text !== 'string') {
        throw new Error('preflight_lint_post requires a string "text" argument.');
      }

      const targets = parsePlatformList(args.targets, PLATFORM_IDS);
      const draft: SocialDraft = {
        text,
        ...(typeof draftObj.id === 'string' ? { id: draftObj.id } : {}),
        ...(typeof draftObj.title === 'string' ? { title: draftObj.title } : {}),
        ...(typeof draftObj.firstComment === 'string' ? { firstComment: draftObj.firstComment } : {}),
        ...(typeof draftObj.contentWarning === 'string' ? { contentWarning: draftObj.contentWarning } : {}),
        ...(typeof draftObj.isSponsored === 'boolean' ? { isSponsored: draftObj.isSponsored } : {}),
        ...(typeof draftObj.isAiGenerated === 'boolean' ? { isAiGenerated: draftObj.isAiGenerated } : {}),
        ...(typeof draftObj.publishViaApi === 'boolean' ? { publishViaApi: draftObj.publishViaApi } : {}),
        ...(typeof draftObj.scheduledAt === 'string' ? { scheduledAt: draftObj.scheduledAt } : {}),
        ...(Array.isArray(draftObj.media) ? { media: draftObj.media as MediaAttachment[] } : {}),
        ...(isRecord(draftObj.openGraph) ? { openGraph: draftObj.openGraph as OpenGraphMeta } : {}),
      };

      const guardrails = isRecord(args.guardrails)
        ? (args.guardrails as BrandGuardrails)
        : undefined;

      return runPreFlight(draft, targets, guardrails);
    }

    case 'compile_canonical_post': {
      if (typeof args.markdown !== 'string' || args.markdown.trim().length === 0) {
        throw new Error('compile_canonical_post requires a non-empty string "markdown" argument.');
      }

      const targets =
        args.targets !== undefined ? parsePlatformList(args.targets, PLATFORM_IDS) : undefined;
      const guardrails = isRecord(args.guardrails)
        ? (args.guardrails as BrandGuardrails)
        : undefined;

      return compileCanonicalPost(args.markdown, targets, guardrails);
    }

    case 'check_safe_zone': {
      if (typeof args.presetId !== 'string' || !isSafeZonePresetId(args.presetId)) {
        throw new Error(
          `Invalid presetId "${String(args.presetId)}". Valid presets: ${Object.keys(SAFE_ZONE_PRESETS).join(', ')}`
        );
      }

      const rawBoxes = args.boxes ?? [];
      if (!Array.isArray(rawBoxes)) {
        throw new Error('check_safe_zone "boxes" must be an array.');
      }

      const boxes: BoundingBox[] = rawBoxes.map((entry, idx) => {
        if (!isRecord(entry)) {
          throw new Error(`boxes[${idx}] must be an object with x, y, width, height.`);
        }
        const x = Number(entry.x);
        const y = Number(entry.y);
        const width = Number(entry.width);
        const height = Number(entry.height);
        if (
          !Number.isFinite(x) ||
          !Number.isFinite(y) ||
          !Number.isFinite(width) ||
          !Number.isFinite(height) ||
          width <= 0 ||
          height <= 0
        ) {
          throw new Error(`boxes[${idx}] requires finite x, y and positive width, height.`);
        }
        return {
          id: typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim() : `box-${idx + 1}`,
          label:
            typeof entry.label === 'string' && entry.label.trim()
              ? entry.label.trim()
              : `Overlay ${idx + 1}`,
          x,
          y,
          width,
          height,
        };
      });

      return analyzeSafeZone(args.presetId, boxes);
    }

    case 'simulate_fold_preview': {
      if (typeof args.text !== 'string') {
        throw new Error('simulate_fold_preview requires a string "text" argument.');
      }

      const hasMedia = Boolean(args.hasMedia);

      if (Array.isArray(args.platforms) && args.platforms.length > 0) {
        const platforms = parsePlatformList(args.platforms, PLATFORM_IDS);
        return {
          hasMedia,
          simulations: platforms.map((p) => simulatePlatformFold(args.text as string, p, { hasMedia })),
        };
      }

      if (args.platform !== undefined) {
        const platform = assertPlatformId(args.platform, 'platform');
        return simulatePlatformFold(args.text, platform, { hasMedia });
      }

      const defaultFoldPlatforms: PlatformId[] = [
        'linkedin',
        'instagram-feed',
        'instagram-reels',
        'tiktok',
        'youtube-shorts',
      ];
      return {
        hasMedia,
        simulations: defaultFoldPlatforms.map((p) =>
          simulatePlatformFold(args.text as string, p, { hasMedia })
        ),
      };
    }

    case 'audit_utm_and_og': {
      const url = typeof args.url === 'string' && args.url.trim().length > 0 ? args.url.trim() : undefined;
      const openGraph = isRecord(args.openGraph)
        ? (args.openGraph as OpenGraphMeta)
        : undefined;

      if (!url && !openGraph) {
        throw new Error('audit_utm_and_og requires at least one of "url" or "openGraph".');
      }

      const platform =
        args.platform !== undefined ? assertPlatformId(args.platform, 'platform') : undefined;
      const expectedCampaign =
        typeof args.expectedCampaign === 'string'
          ? args.expectedCampaign
          : typeof args.campaign === 'string'
            ? args.campaign
            : undefined;
      const expectedMedium =
        typeof args.expectedMedium === 'string'
          ? args.expectedMedium
          : typeof args.medium === 'string'
            ? args.medium
            : undefined;

      const utmAudit = url
        ? auditUtmUrl(url, {
            ...(platform ? { platform } : {}),
            ...(expectedCampaign ? { expectedCampaign } : {}),
            ...(expectedMedium ? { expectedMedium } : {}),
          })
        : null;

      let canonicalUtmUrl: string | null = null;
      if (url && platform && expectedCampaign) {
        try {
          canonicalUtmUrl = buildCanonicalUtmUrl(url, {
            platform,
            campaign: expectedCampaign,
            ...(expectedMedium ? { medium: expectedMedium } : {}),
          });
        } catch {
          canonicalUtmUrl = null;
        }
      }

      const openGraphDiagnostics = openGraph
        ? validateOpenGraph(openGraph, platform ?? 'x')
        : [];

      return {
        utmAudit,
        canonicalUtmUrl,
        openGraphDiagnostics,
      };
    }

    case 'triage_comments': {
      if (!Array.isArray(args.comments)) {
        throw new Error('triage_comments requires an array "comments" argument.');
      }

      const comments: CommentItem[] = args.comments.map((entry, idx) => {
        if (!isRecord(entry) || typeof entry.text !== 'string') {
          throw new Error(`comments[${idx}] must be an object with string "text" and valid "platform".`);
        }
        const platform = assertPlatformId(entry.platform, `comments[${idx}].platform`);
        return {
          id: typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim() : `c-${idx + 1}`,
          author:
            typeof entry.author === 'string' && entry.author.trim()
              ? entry.author.trim()
              : '@unknown',
          platform,
          text: entry.text,
          ...(typeof entry.timestamp === 'string' ? { timestamp: entry.timestamp } : {}),
          ...(typeof entry.postId === 'string' ? { postId: entry.postId } : {}),
        };
      });

      const items = triageComments(comments);
      const priorityCounts = { P0: 0, P1: 0, P2: 0, P3: 0 };
      for (const item of items) {
        priorityCounts[item.priority] += 1;
      }

      return {
        total: items.length,
        priorityCounts,
        items,
      };
    }

    case 'build_ffmpeg_normalize_cmd': {
      const platform = assertPlatformId(args.platform, 'platform');
      const rawFps = args.targetFps;
      let targetFps: 24 | 30 | 60 | undefined;
      if (rawFps !== undefined) {
        if (rawFps === 24 || rawFps === 30 || rawFps === 60) {
          targetFps = rawFps;
        } else {
          throw new Error('targetFps must be 24, 30, or 60.');
        }
      }

      return buildFfmpegNormalizeCommand(platform, {
        ...(typeof args.input === 'string' && args.input.trim() ? { input: args.input.trim() } : {}),
        ...(typeof args.output === 'string' && args.output.trim() ? { output: args.output.trim() } : {}),
        ...(typeof args.isHdr === 'boolean' ? { isHdr: args.isHdr } : {}),
        ...(targetFps !== undefined ? { targetFps } : {}),
      });
    }

    case 'audit_oauth_tokens': {
      if (!Array.isArray(args.connections)) {
        throw new Error('audit_oauth_tokens requires an array "connections" argument.');
      }

      const connections: OAuthConnectionInput[] = args.connections.map((entry, idx) => {
        if (!isRecord(entry)) {
          throw new Error(`connections[${idx}] must be an object.`);
        }
        const platform = assertPlatformId(entry.platform, `connections[${idx}].platform`);
        if (typeof entry.accessTokenIssuedAt !== 'string' || !entry.accessTokenIssuedAt.trim()) {
          throw new Error(`connections[${idx}].accessTokenIssuedAt must be an ISO-8601 string.`);
        }
        return {
          id:
            typeof entry.id === 'string' && entry.id.trim()
              ? entry.id.trim()
              : `conn-${idx + 1}`,
          accountHandle:
            typeof entry.accountHandle === 'string' && entry.accountHandle.trim()
              ? entry.accountHandle.trim()
              : 'unknown-account',
          platform,
          accessTokenIssuedAt: entry.accessTokenIssuedAt.trim(),
          ...(typeof entry.refreshTokenIssuedAt === 'string'
            ? { refreshTokenIssuedAt: entry.refreshTokenIssuedAt.trim() }
            : {}),
          ...(typeof entry.isMarketingPartner === 'boolean'
            ? { isMarketingPartner: entry.isMarketingPartner }
            : {}),
          ...(typeof entry.hasOfflineAccess === 'boolean'
            ? { hasOfflineAccess: entry.hasOfflineAccess }
            : {}),
          ...(typeof entry.isAppAudited === 'boolean'
            ? { isAppAudited: entry.isAppAudited }
            : {}),
          ...(typeof entry.concurrentWorkers === 'number' && Number.isFinite(entry.concurrentWorkers)
            ? { concurrentWorkers: entry.concurrentWorkers }
            : {}),
        };
      });

      const nowIso = typeof args.nowIso === 'string' ? args.nowIso : undefined;
      const results = auditOAuthTokens(connections, nowIso);
      const summary = {
        expired: results.filter((r) => r.status === 'expired').length,
        critical: results.filter((r) => r.status === 'critical').length,
        expiringSoon: results.filter((r) => r.status === 'expiring-soon').length,
        healthy: results.filter((r) => r.status === 'healthy').length,
      };

      return {
        total: results.length,
        summary,
        connections: results,
      };
    }

    case 'get_platform_spec': {
      if (args.platform !== undefined && args.platform !== '') {
        const platform = assertPlatformId(args.platform, 'platform');
        return getPlatformSpec(platform);
      }
      return {
        count: PLATFORM_IDS.length,
        platforms: listPlatformSpecs(),
        safeZonePresets: listSafeZonePresets(),
      };
    }

    default: {
      throw new Error(
        `Unknown tool "${name}". Available tools: ${MCP_TOOLS.map((t) => t.name).join(', ')}`
      );
    }
  }
}

export function listMcpResources(): McpResourceDefinition[] {
  const specResources: McpResourceDefinition[] = PLATFORM_IDS.map((id) => {
    const spec = getPlatformSpec(id);
    return {
      uri: `postflight://specs/${id}`,
      name: `${spec.name} Platform Spec`,
      description: `Verified ${spec.specVersion} counting rules, folds, hashtag caps, media & OAuth specs for ${spec.name}.`,
      mimeType: 'application/json',
    };
  });

  return [
    ...specResources,
    {
      uri: 'postflight://rules/catalog',
      name: 'PostFlight Deterministic Rule Catalog',
      description: `All ${RULE_CATALOG.length} deterministic social media pre-flight lint rules.`,
      mimeType: 'application/json',
    },
  ];
}

export function readMcpResource(uri: string): McpResourceContent | null {
  if (uri === 'postflight://rules/catalog') {
    return {
      uri,
      mimeType: 'application/json',
      text: JSON.stringify(RULE_CATALOG, null, 2),
    };
  }

  const specPrefix = 'postflight://specs/';
  if (uri.startsWith(specPrefix)) {
    const platformId = uri.slice(specPrefix.length);
    if (!isPlatformId(platformId)) {
      return null;
    }
    return {
      uri,
      mimeType: 'application/json',
      text: JSON.stringify(getPlatformSpec(platformId), null, 2),
    };
  }

  return null;
}
