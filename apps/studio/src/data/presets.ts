import type {
  BoundingBox,
  CommentItem,
  DuplicateCheckInput,
  OAuthConnectionInput,
  PlatformId,
  SocialDraft,
} from '@postflight/core';

export interface ComposerPreset {
  id: string;
  name: string;
  badge: string;
  tone: 'hazard' | 'cleared' | 'caution' | 'accent';
  summary: string;
  platforms: PlatformId[];
  forbiddenTerms: string;
  draft: SocialDraft;
}

const LONG_TIKTOK_STORY = [
  'Behind the scenes of our 10-bit HDR studio reel shoot — watch until the end for the full color pipeline breakdown.',
  '',
  'Most creators export straight out of mobile editors in Variable Frame Rate (VFR) Dolby Vision HLG and wonder why the platform crushes shadows, washes out skin tones, and drops audio sync after upload.',
  '',
  'Here is the exact pre-flight workflow we now run on every single vertical campaign before touching an upload button:',
  '1. Normalize color space from 10-bit HDR to Rec.709 8-bit SDR (yuv420p) so mobile feeds never blow out highlights.',
  '2. Lock Constant Frame Rate (CFR 30fps or 60fps) with closed GOP keyframes aligned to 2-second boundaries.',
  '3. Normalize loudness to -14 LUFS integrated / -1.0 dBTP true peak so vertical feeds stop pumping dialogue.',
  '4. Move the MP4 moov atom to the front (+faststart) so Meta Graph API containers never stall on ingest.',
  '5. Strip competitor watermarks from raw exports before cross-posting — TikTok and Instagram both demote watermarked files.',
  '6. Check lower-right paid ad notches and caption HUD dead zones so burned-in subtitles never collide with the audio marquee.',
  '7. Keep the hook inside the first 55 characters for Instagram Reels and first 80 characters for TikTok so mobile viewers read the core claim before hitting "...more".',
  '8. Audit C2PA Content Credentials: even light Photoshop Generative Fill triggers platform "AI info" labels automatically.',
  '',
  'Deep technical notes for post-production engineers:',
  'When encoding with x264, setting -pix_fmt yuv420p and -profile:v high -level 4.1 avoids silent 4:2:2 transcode stalls across older Android decoders and Meta ingestion nodes. For audio, 48kHz stereo AAC-LC at 192k prevents sample-rate resampling artifacts during platform muxing. Keep keyframe intervals strictly fixed (-g 60 for 30fps) so adaptive HLS/DASH segment splits align cleanly with scene cuts and first-frame playback starts instantly without gray macroblocking.',
  '',
  'Extra production checklist for agencies shipping 20+ short-form cuts per week: always verify the 4:5 to 3:4 profile grid crop on cover frames (keep titles inside the inner 1012x1350 band), verify burned-in subtitle contrast ratio >= 4.5:1 against bright backgrounds, and double-check that API caption payloads stay under 2,200 characters even though the native mobile TikTok composer lets you type 4,000 characters. That 1,800-character API cliff silently truncates hashtags and partner disclosures on scheduled launches.',
  '',
  'Save this checklist for your next production sprint! #VideoProduction #ShortFormVideo #ColorGrading #CreatorOps',
].join('\n');

export const COMPOSER_PRESETS: ComposerPreset[] = [
  {
    id: 'trapped-sponsorship',
    name: 'Trapped Sponsorship Draft (9 Hidden Failures)',
    badge: '9+ Traps',
    tone: 'hazard',
    summary:
      'Packed with real-world launch killers: Unicode faux-bold, buried #spon below fold, 8 lowercase IG hashtags, LinkedIn blank-line fold starvation, body + first-comment links, uppercase UTM with fbclid, engagement bait, missing alt text, and Bluesky 2.0 MiB decimal cap overflow.',
    platforms: ['linkedin', 'instagram-feed', 'x', 'tiktok', 'bluesky'],
    forbiddenTerms: 'guaranteed returns, 100% risk-free',
    draft: {
      id: 'sponsored-promo-broken',
      text: [
        '🚀🔥 𝐔𝐧𝐥𝐞𝐚𝐬𝐡 𝐭𝐡𝐞 𝐠𝐚𝐦𝐞-𝐜𝐡𝐚𝐧𝐠𝐞𝐫 𝐭𝐡𝐚𝐭 𝐰𝐢𝐥𝐥 𝐫𝐞𝐯𝐨𝐥𝐮𝐭𝐢𝐨𝐧𝐢𝐳𝐞 𝐲𝐨𝐮𝐫 𝐰𝐨𝐫𝐤𝐟𝐥𝐨𝐰!',
        '',
        "In today's fast-paced world, delve into guaranteed returns with our new partner suite.",
        '',
        'Comment YES below and tag 3 friends to unlock the private playbook! Grab it at https://postflight.dev/offer?utm_source=LinkedIn&utm_medium=Paid%20Social&fbclid=IwAR999xyz',
        '',
        '#socialmediamarketing #growthhacking #digitalmarketing #fyp #viral #contentcreator #marketingtips #technews #spon',
      ].join('\n'),
      firstComment:
        'Grab the partner discount link right here: https://postflight.dev/offer?utm_source=LinkedIn&fbclid=IwAR999xyz',
      isSponsored: true,
      isAiGenerated: true,
      publishViaApi: true,
      media: [
        {
          type: 'image',
          filename: 'promo-hero-4x5.png',
          width: 1080,
          height: 1350,
          sizeBytes: 2_050_000,
          altText: '',
        },
      ],
    },
  },
  {
    id: 'clean-oss-launch',
    name: 'Clean Open-Source Launch',
    badge: 'Cleared A+',
    tone: 'cleared',
    summary:
      'High-scoring multi-platform engineering announcement: sharp hook above every fold, PascalCase hashtags within caps, descriptive alt text, and zero algorithmic traps.',
    platforms: ['x', 'linkedin', 'bluesky', 'mastodon', 'threads'],
    forbiddenTerms: 'guaranteed returns',
    draft: {
      id: 'postflight-v1-clean',
      text: [
        'We built PostFlight: a zero-API-key pre-flight compiler for 9 social platforms.',
        'Catch LinkedIn fold cuts, IG 5-tag caps, Bluesky UTF-8 byte facets, and 9:16 UI collisions locally before you ship.',
        '#OpenSource #DevTools',
      ].join('\n'),
      firstComment: '',
      isSponsored: false,
      isAiGenerated: false,
      publishViaApi: true,
      media: [
        {
          type: 'image',
          filename: 'postflight-workbench-preview.png',
          width: 1200,
          height: 675,
          sizeBytes: 420_000,
          altText:
            'PostFlight Studio interface showing a 9:16 safe-zone X-ray overlay with clear bounding boxes and a green pre-flight score of 98 out of 100.',
        },
      ],
    },
  },
  {
    id: 'ai-viral-reel',
    name: 'AI-Retouched Viral Reel',
    badge: 'Media + API Trap',
    tone: 'caution',
    summary:
      'Triggers TikTok 2,200-char API ceiling (vs 4,000 native), IG Reels 55-char mobile fold, C2PA AI-label metadata warning, 10-bit HDR washout, VFR sync risk, 4:2:2 chroma warning, and watermark filename detection.',
    platforms: ['tiktok', 'instagram-reels', 'youtube-shorts'],
    forbiddenTerms: '',
    draft: {
      id: 'ai-retouched-reel',
      title: 'How we fixed 10-bit HDR color washout <Rec.709> on vertical social feeds',
      text: LONG_TIKTOK_STORY,
      firstComment: '',
      isSponsored: false,
      isAiGenerated: true,
      publishViaApi: true,
      media: [
        {
          type: 'video',
          filename: 'studio-cut-tiktok-watermark.mp4',
          width: 1080,
          height: 1920,
          sizeBytes: 85_000_000,
          durationSec: 195,
          fps: 60,
          isHdr: true,
          isVfr: true,
          chromaSubsampling: '4:2:2',
          hasC2paMetadata: true,
          aspectRatio: '9:16',
        },
      ],
    },
  },
  {
    id: 'bluesky-mastodon-threads',
    name: 'Bluesky Facets, Mastodon CW & Threads Emoji',
    badge: 'Encoding Stress',
    tone: 'accent',
    summary:
      'Demonstrates multi-platform encoding quirks: Bluesky grapheme vs UTF-8 byte facet offsets, Mastodon remote mention stripping + Content Warning character budget, and Threads multi-byte emoji UTF-8 inflation.',
    platforms: ['bluesky', 'mastodon', 'threads', 'x'],
    forbiddenTerms: '',
    draft: {
      id: 'encoding-stress-test',
      contentWarning: 'Unicode & protocol internals',
      text: [
        'Shipping @postflight@fosstodon.org v1.0 today! 👨‍👩‍👧‍👦🚀🏳️‍🌈',
        'Why counting .length fails: X weighs URLs at 23 via t.co, Bluesky indexes facets in UTF-8 bytes, and Threads counts ZWJ emojis by UTF-8 byte length.',
        'Docs: https://postflight.dev/specs?utm_source=bluesky&utm_medium=organic&utm_campaign=spec_v1 #OpenProtocol #Accessibility #DevTools',
      ].join('\n'),
      isSponsored: false,
      isAiGenerated: false,
      publishViaApi: true,
      media: [
        {
          type: 'image',
          filename: 'utf8-facet-diagram.png',
          width: 1200,
          height: 1200,
          sizeBytes: 980_000,
          altText:
            'Diagram comparing UTF-16 code units, grapheme clusters, and UTF-8 byte offsets for emoji-heavy social posts.',
        },
      ],
    },
  },
  {
    id: 'hidden-formatting-traps',
    name: 'Invisible Residue, Dead Shorteners & DST Trap',
    badge: 'Hidden Bugs',
    tone: 'hazard',
    summary:
      'Catches traps invisible to the human eye: U+200B zero-width spaces copied from docs, shut-down Firebase .page.link URLs, unfilled {{placeholders}}, leading @mentions on X, #2026 numeric tags on Mastodon/Bluesky, and naive DST schedule times.',
    platforms: ['x', 'bluesky', 'mastodon', 'linkedin'],
    forbiddenTerms: '',
    draft: {
      id: 'hidden-edge-traps',
      text: [
        '@partner check out our #2026 launch notes in {{campaign_link}}!',
        'Watch the demo via https://acme.page.link/launch and #Open\u200BSource resources.',
      ].join('\n'),
      scheduledAt: '2026-03-08T02:00:00',
      isSponsored: false,
      isAiGenerated: false,
      publishViaApi: true,
      media: [
        {
          type: 'image',
          filename: 'launch-card.png',
          width: 1200,
          height: 675,
          sizeBytes: 380_000,
          altText: 'PostFlight pre-publish diagnostic overview card.',
        },
      ],
    },
  },
];

export const DEFAULT_XRAY_BOXES: BoundingBox[] = [
  { id: 'headline', label: 'Headline Hook', x: 90, y: 190, width: 880, height: 170 },
  { id: 'logo', label: 'Brand Logo', x: 840, y: 340, width: 190, height: 110 },
  { id: 'subtitles', label: 'Burned Subtitles', x: 110, y: 1380, width: 790, height: 180 },
  { id: 'cta', label: 'CTA Pill', x: 180, y: 1610, width: 700, height: 130 },
];

export const SAMPLE_CANONICAL_MARKDOWN = `---
id: launch-postflight-v1
title: Stop shipping broken social posts — Meet PostFlight
campaign: postflight-launch
url: https://postflight.dev/?utm_source=social&utm_medium=organic&utm_campaign=postflight-launch
targets: [x, linkedin, bluesky, mastodon, threads, instagram-feed]
hashtags: [OpenSource, SocialMediaEngineering, DevTools]
sponsored: false
aiGenerated: false
dmKeyword: PREFLIGHT
---
We analyzed 9 social platforms and found why great posts silently fail:

LinkedIn folds mobile posts at line 3 (and blank lines count as full lines). Instagram slashed hashtags from 30 to 5 and slices 34px off 4:5 images in its 3:4 profile grid. Bluesky rejects 2.0 MiB images because its cap is 2,000,000 decimal bytes.

So we built PostFlight — an open-source pre-flight compiler, linter, safe-zone X-ray, and MCP server that catches reach killers, UI overlay collisions, WCAG issues, and FTC fold violations locally before you publish. Zero social API keys required.`;

export const SAMPLE_COMMENTS: CommentItem[] = [
  {
    id: 'c-101',
    author: '@dev_kiran',
    platform: 'x',
    text: 'URGENT: Your checkout page is throwing a 500 error and people in the replies think the launch link is a scam!',
    timestamp: '2026-11-25T07:58:00Z',
  },
  {
    id: 'c-102',
    author: '@sec_researcher',
    platform: 'linkedin',
    text: 'Heads up — looks like an unauthorized redirect or potential data breach warning on your staging subdomain. Need immediate response.',
    timestamp: '2026-11-25T07:56:00Z',
  },
  {
    id: 'c-103',
    author: '@sarah_ops',
    platform: 'linkedin',
    text: 'How much is the team plan and does this integrate with GitHub Actions + Postiz? Ready to book a demo this week.',
    timestamp: '2026-11-25T07:55:00Z',
  },
  {
    id: 'c-104',
    author: '@maya_studio',
    platform: 'instagram-feed',
    text: 'PREFLIGHT — link please! Would love to buy this safe-zone overlay workflow for our 12-person agency Reels team.',
    timestamp: '2026-11-25T07:50:00Z',
  },
  {
    id: 'c-105',
    author: '@fin_advisor_joe',
    platform: 'linkedin',
    text: 'What is the annual management fee and guaranteed yield return rate if we deploy this for our wealth advisory accounts?',
    timestamp: '2026-11-25T07:42:00Z',
  },
  {
    id: 'c-106',
    author: '@lena_builds',
    platform: 'threads',
    text: 'My CLI install failed on Node 18 and I cannot find the invoice receipt from yesterday — can support help me fix this?',
    timestamp: '2026-11-25T07:38:00Z',
  },
  {
    id: 'c-107',
    author: '@alex_creator',
    platform: 'youtube-shorts',
    text: 'Feature request: would love an export directly to Premiere Pro and DaVinci Resolve safe-zone guide markers!',
    timestamp: '2026-11-25T07:30:00Z',
  },
  {
    id: 'c-108',
    author: '@nadia_a11y',
    platform: 'bluesky',
    text: 'Huge thanks for flagging Unicode faux-bold and PascalCase hashtags! Screen reader users appreciate tools like this.',
    timestamp: '2026-11-25T07:25:00Z',
  },
  {
    id: 'c-109',
    author: '@promo_bot99',
    platform: 'instagram-feed',
    text: 'DM me on Telegram for 10k real followers and crypto signals! Check my bio 🚀🔥',
    timestamp: '2026-11-25T07:22:00Z',
  },
  {
    id: 'c-110',
    author: '@fire_emoji_user',
    platform: 'tiktok',
    text: '🔥🔥🔥',
    timestamp: '2026-11-25T07:20:00Z',
  },
];

export function createSampleOAuthConnections(nowMs: number = Date.now()): OAuthConnectionInput[] {
  const hoursAgo = (h: number) => new Date(nowMs - h * 3_600_000).toISOString();
  const daysAgo = (d: number) => new Date(nowMs - d * 86_400_000).toISOString();

  return [
    {
      id: 'conn-ig-brand',
      accountHandle: '@acme_brand',
      platform: 'instagram-feed',
      accessTokenIssuedAt: hoursAgo(10),
    },
    {
      id: 'conn-x-main',
      accountHandle: '@acme_dev',
      platform: 'x',
      accessTokenIssuedAt: hoursAgo(1.75),
      hasOfflineAccess: false,
      concurrentWorkers: 3,
    },
    {
      id: 'conn-li-founder',
      accountHandle: 'Jane Doe (Founder)',
      platform: 'linkedin',
      accessTokenIssuedAt: daysAgo(57),
      isMarketingPartner: false,
    },
    {
      id: 'conn-tt-studio',
      accountHandle: '@acme_tiktok',
      platform: 'tiktok',
      accessTokenIssuedAt: hoursAgo(22.5),
      refreshTokenIssuedAt: daysAgo(340),
      isAppAudited: false,
    },
    {
      id: 'conn-bsky-oss',
      accountHandle: '@acme.bsky.social',
      platform: 'bluesky',
      accessTokenIssuedAt: hoursAgo(0.4),
      refreshTokenIssuedAt: daysAgo(12),
    },
  ];
}

export function createSampleCampaignCalendar(nowMs: number = Date.now()): DuplicateCheckInput[] {
  const hoursFromNow = (h: number) => new Date(nowMs + h * 3_600_000).toISOString();

  return [
    {
      id: 'li-launch-morning',
      platform: 'linkedin',
      publishedAt: hoursFromNow(2),
      text: 'We analyzed 9 social platforms and found why great posts silently fail: LinkedIn folds mobile posts at line 3 and counts blank lines as full lines. Instagram slashed hashtags from 30 to 5 and slices 34px off 4:5 images in its 3:4 profile grid.',
    },
    {
      id: 'li-followup-afternoon',
      platform: 'linkedin',
      publishedAt: hoursFromNow(8),
      text: 'Quick afternoon update: we just published our interactive Safe-Zone X-Ray workbench for vertical Reels, TikTok ads, and LinkedIn PDF carousels with full keyboard accessibility.',
    },
    {
      id: 'x-evergreen-repost',
      platform: 'x',
      publishedAt: hoursFromNow(26),
      text: 'We analyzed 9 social platforms and found why great posts silently fail: LinkedIn folds mobile posts at line 3 and counts blank lines as full lines. Instagram slashed hashtags from 30 to 5 and slices 34px off 4:5 images in its 3:4 profile grid.',
    },
    {
      id: 'li-similar-recap',
      platform: 'linkedin',
      publishedAt: hoursFromNow(52),
      text: 'We analyzed 9 social platforms and discovered why great posts silently fail: LinkedIn folds mobile posts at line 3 and blank lines count as full lines. Instagram cut hashtags from 30 to 5 and trims 34px off 4:5 images in its 3:4 profile grid.',
    },
  ];
}
