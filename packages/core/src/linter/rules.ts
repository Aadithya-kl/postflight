import type {
  BrandGuardrails,
  CountResult,
  LintDiagnostic,
  PlatformFoldSimulation,
  PlatformId,
  RuleCategory,
  Severity,
  SocialDraft,
} from '../types.js';
import { getPlatformSpec } from '../specs/registry.js';
import {
  countGraphemes,
  extractUrls,
  findHashtagMatches,
  findUrlMatches,
} from '../counters/index.js';
import {
  detectInvisibleZeroWidthChars,
  detectUnicodeFancyFonts,
  isKnownSingleHashtagWord,
  toPascalCaseHashtag,
} from './autofix.js';
import { validateMediaAttachments, validateOpenGraph } from '../media/validator.js';
import { auditUtmUrl } from '../attribution/utm.js';

export interface RuleDefinition {
  id: string;
  category: RuleCategory;
  defaultSeverity: Severity;
  title: string;
  summary: string;
  specRef: string;
}

export const RULE_CATALOG: readonly RuleDefinition[] = [
  // Limits
  {
    id: 'limits/char-limit-exceeded',
    category: 'limits',
    defaultSeverity: 'error',
    title: 'Character Limit Exceeded',
    summary: 'Post exceeds the target platform counting limit using its exact native counting algorithm.',
    specRef: 'PlatformSpec.counting.hardLimit',
  },
  {
    id: 'limits/api-limit-divergence',
    category: 'limits',
    defaultSeverity: 'warning',
    title: 'Native vs. API Character Limit Divergence',
    summary: 'Post fits native app limits but exceeds the stricter publishing API cap (e.g. TikTok 2,200 API vs 4,000 native).',
    specRef: 'PlatformSpec.counting.apiHardLimit',
  },
  {
    id: 'limits/bluesky-byte-limit',
    category: 'limits',
    defaultSeverity: 'error',
    title: 'Bluesky UTF-8 Byte Ceiling Exceeded',
    summary: 'Post exceeds AT Protocol 3,000 UTF-8 byte ceiling even when grapheme count is within 300.',
    specRef: 'ATProto app.bsky.feed.post maxLength:3000',
  },
  {
    id: 'limits/threads-unique-urls',
    category: 'limits',
    defaultSeverity: 'error',
    title: 'Threads Unique URL Cap Exceeded',
    summary: 'Threads Publishing API rejects posts containing more than 5 unique URLs.',
    specRef: 'Meta Threads API maxUniqueUrlsApi:5',
  },
  {
    id: 'limits/forbidden-chars',
    category: 'limits',
    defaultSeverity: 'error',
    title: 'Forbidden Platform Characters',
    summary: 'Draft contains characters rejected by platform validation or API ingestion (e.g. < or > on YouTube).',
    specRef: 'PlatformSpec.counting.forbiddenChars',
  },
  {
    id: 'limits/first-comment-limit',
    category: 'limits',
    defaultSeverity: 'error',
    title: 'First Comment Length Exceeded',
    summary: 'Planned first comment exceeds the platform comment character limit.',
    specRef: 'PlatformSpec.counting.firstCommentLimit',
  },

  // Fold
  {
    id: 'fold/blank-line-starvation',
    category: 'fold',
    defaultSeverity: 'warning',
    title: 'Mobile Fold Blank-Line Starvation',
    summary: 'Blank line inside the opening lines consumes a visible line slot before the mobile fold truncation.',
    specRef: 'PlatformSpec.folds.blankLinesCountAsLines',
  },
  {
    id: 'fold/weak-hook-truncation',
    category: 'fold',
    defaultSeverity: 'warning',
    title: 'Weak Hook / Awkward Mobile Fold Truncation',
    summary: 'Mobile fold cuts off mid-word, shows an ultra-thin hook, or buries the call-to-action below the fold.',
    specRef: 'PlatformSpec.folds.mobileChars',
  },
  {
    id: 'fold/reels-ultra-tight-fold',
    category: 'fold',
    defaultSeverity: 'info',
    title: 'Instagram Reels Ultra-Tight Single-Line Fold',
    summary: 'Reels mobile HUD truncates captions after ~55 characters on line 1; front-load the core hook.',
    specRef: 'Instagram Reels Mobile HUD Fold (~55 chars)',
  },

  // Algorithm
  {
    id: 'algorithm/external-link-suppression',
    category: 'algorithm',
    defaultSeverity: 'warning',
    title: 'External Link Reach Suppression Risk',
    summary: 'Outbound links in main post copy risk dwell-time and feed-ranking suppression on LinkedIn, X, or Threads.',
    specRef: 'PlatformSpec.links.bodyPenaltyRisk',
  },
  {
    id: 'algorithm/linkedin-first-comment-bridge',
    category: 'algorithm',
    defaultSeverity: 'warning',
    title: 'LinkedIn First-Comment Link Bridge Risk',
    summary: 'Instant outbound links in LinkedIn first comments are pattern-matched as engagement-bridge behavior.',
    specRef: 'LinkedIn Links Policy / firstCommentSafe:false',
  },
  {
    id: 'algorithm/non-clickable-caption-url',
    category: 'algorithm',
    defaultSeverity: 'warning',
    title: 'Non-Clickable Raw URL in Caption',
    summary: 'Platform does not hyperlink URLs inside captions; raw URLs render as dead text.',
    specRef: 'PlatformSpec.links.clickableInBody:false',
  },
  {
    id: 'algorithm/hashtag-hard-cap',
    category: 'algorithm',
    defaultSeverity: 'error',
    title: 'Platform Hashtag Hard Cap Exceeded',
    summary: 'Hashtag count exceeds the platform hard cap (e.g. IG/TikTok 5, Threads 1, YouTube 60 ignore-all cliff).',
    specRef: 'PlatformSpec.hashtags.hardCap',
  },
  {
    id: 'algorithm/hashtag-spam-threshold',
    category: 'algorithm',
    defaultSeverity: 'warning',
    title: 'Hashtag Spam Threshold Exceeded',
    summary: 'Hashtag count exceeds recommended maximum and risks spam classification or reduced organic reach.',
    specRef: 'PlatformSpec.hashtags.recommendedMax',
  },
  {
    id: 'algorithm/generic-spam-hashtags',
    category: 'algorithm',
    defaultSeverity: 'info',
    title: 'Generic Low-Signal Hashtags Detected',
    summary: 'Generic engagement tags (#fyp, #viral, #explore, #follow4follow) add noise without topical targeting.',
    specRef: 'Platform Discovery Best Practices',
  },
  {
    id: 'algorithm/engagement-bait',
    category: 'algorithm',
    defaultSeverity: 'warning',
    title: 'Algorithmic Engagement-Bait Pattern',
    summary: 'Copy matches explicit engagement-bait phrasing penalized by feed-integrity classifiers.',
    specRef: 'Platform Integrity / Demotion Guidelines',
  },
  {
    id: 'algorithm/ai-slop-cliches',
    category: 'algorithm',
    defaultSeverity: 'info',
    title: 'Generic AI Cliché / Emoji Density Signal',
    summary: 'Copy contains overused synthetic writing clichés or dense decorative emoji clusters that depress reader trust.',
    specRef: 'BrandGuardrails.flagAiSlop',
  },
  {
    id: 'algorithm/public-url-shortener-risk',
    category: 'algorithm',
    defaultSeverity: 'warning',
    title: 'Generic Shortener or Shut-Down Dynamic Link',
    summary: 'Uses a shut-down Firebase Dynamic Link (*.page.link / goo.gl) or generic URL shortener penalized by anti-spam classifiers.',
    specRef: 'Platform Link Integrity / Aug 2025 FDL Shutdown',
  },
  {
    id: 'algorithm/x-leading-mention-reply-trap',
    category: 'algorithm',
    defaultSeverity: 'warning',
    title: 'X Leading @Mention Timeline Suppression Risk',
    summary: 'Posts/replies starting with @username at character 0 restrict visibility away from non-mutual followers timelines.',
    specRef: 'X Visibility & Reply Broadcasting Behavior',
  },

  // Compliance
  {
    id: 'compliance/ftc-missing-disclosure',
    category: 'compliance',
    defaultSeverity: 'error',
    title: 'Missing Sponsored Ad Disclosure',
    summary: 'Sponsored post lacks an approved material-connection disclosure (#Ad, Ad:, #Sponsored, Paid Partnership).',
    specRef: 'FTC 16 CFR Part 255 / ASA CAP Code',
  },
  {
    id: 'compliance/ftc-prohibited-shorthand',
    category: 'compliance',
    defaultSeverity: 'error',
    title: 'Prohibited Ambiguous Sponsorship Shorthand',
    summary: 'Sponsored post uses ambiguous shorthand (#sp, #spon, #collab, #partner, #gifted, #pr) rejected by regulators.',
    specRef: 'FTC Endorsement Guides / ASA Influencers Guide',
  },
  {
    id: 'compliance/ftc-below-fold',
    category: 'compliance',
    defaultSeverity: 'error',
    title: 'Sponsored Disclosure Buried Below Mobile Fold',
    summary: 'Disclosure appears after the mobile fold cutoff, inside a trailing hashtag block, or too late for ASA UK.',
    specRef: 'PlatformSpec.folds.ftcMaxMobileChars',
  },
  {
    id: 'compliance/ai-synthetic-disclosure',
    category: 'compliance',
    defaultSeverity: 'warning',
    title: 'Missing AI / Synthetic Media Disclosure',
    summary: 'Draft is flagged as AI-generated without an explicit disclosure note or C2PA provenance metadata.',
    specRef: 'Platform Synthetic Media Labeling Policies / EU AI Act Art. 50',
  },

  // Accessibility
  {
    id: 'accessibility/unicode-faux-bold',
    category: 'accessibility',
    defaultSeverity: 'warning',
    title: 'Unicode Faux-Bold / Fancy Font Characters',
    summary: 'Mathematical Alphanumeric Symbols break screen readers, fail platform search indexing, and hurt readability.',
    specRef: 'WCAG 2.2 / Unicode Math Alphanumeric Block U+1D400-U+1D7FF',
  },
  {
    id: 'accessibility/hashtag-pascal-case',
    category: 'accessibility',
    defaultSeverity: 'warning',
    title: 'Non-PascalCase Multi-Word or ALL-CAPS Hashtag',
    summary: 'Lowercase compound hashtags and ALL-CAPS tags prevent screen readers from separating words cleanly.',
    specRef: 'WCAG 2.2 / Fediverse & Social A11y Guidelines',
  },
  {
    id: 'accessibility/all-caps-shouting',
    category: 'accessibility',
    defaultSeverity: 'info',
    title: 'Consecutive ALL-CAPS Shouting',
    summary: 'Three or more consecutive ALL-CAPS words may be spelled out letter-by-letter by screen readers.',
    specRef: 'WCAG 2.2 Screen Reader Readability',
  },
  {
    id: 'accessibility/invisible-zero-width-chars',
    category: 'accessibility',
    defaultSeverity: 'warning',
    title: 'Invisible Zero-Width / Bidi Control Residue',
    summary: 'Hidden U+200B/U+FEFF/soft-hyphen/Bidi characters pasted from rich-text docs break hashtags, URLs, and trigger anti-spam obfuscation filters.',
    specRef: 'Unicode Default Ignorable & Bidi Spoofing Hygiene',
  },
  {
    id: 'accessibility/numeric-only-hashtag',
    category: 'accessibility',
    defaultSeverity: 'warning',
    title: 'Numeric-Only or Adjacent Unspaced Hashtag',
    summary: 'Pure-number hashtags (#2026) fail to linkify on Mastodon & Bluesky, and adjacent tags (#AI#Dev) break hashtag parsers.',
    specRef: 'Mastodon & ATProto Hashtag Lexicon Grammar',
  },

  // Attribution
  {
    id: 'attribution/utm-hygiene',
    category: 'attribution',
    defaultSeverity: 'warning',
    title: 'UTM Attribution Hygiene Issue',
    summary: 'Embedded URLs have casing/whitespace defects, click-ID noise, missing required UTMs, or mismatched utm_source.',
    specRef: 'GA4 Campaign Attribution Spec / BrandGuardrails.requiredUtmParams',
  },

  // Governance
  {
    id: 'governance/brand-forbidden-terms',
    category: 'governance',
    defaultSeverity: 'error',
    title: 'Forbidden Brand / Legal Term Detected',
    summary: 'Draft contains a term explicitly prohibited by brand, compliance, or legal guardrails.',
    specRef: 'BrandGuardrails.forbiddenTerms',
  },
  {
    id: 'governance/brand-required-terms',
    category: 'governance',
    defaultSeverity: 'warning',
    title: 'Required Brand / Disclaimer Term Missing',
    summary: 'Draft omits a mandatory phrase or legal disclaimer configured in brand guardrails.',
    specRef: 'BrandGuardrails.requiredTerms',
  },
  {
    id: 'governance/unresolved-template-placeholders',
    category: 'governance',
    defaultSeverity: 'error',
    title: 'Unresolved Template Placeholder or Localhost URL',
    summary: 'Draft contains unfilled {{template}} variables, [INSERT LINK]/[TBD] markers, or localhost URLs before publish.',
    specRef: 'Pre-Publish Release Hygiene Gate',
  },
  {
    id: 'governance/schedule-timing-hazard',
    category: 'governance',
    defaultSeverity: 'warning',
    title: 'Schedule Timezone, DST, or Burst Timing Hazard',
    summary: 'Scheduled timestamp lacks an explicit timezone offset, lands on top-of-hour :00 burst queues, or intersects a DST transition window.',
    specRef: 'Scheduler Reliability & Timezone Safety',
  },

  // Accessibility — emitted by the delegated media validator (validateMediaAttachments)
  {
    id: 'accessibility/missing-alt-text',
    category: 'accessibility',
    defaultSeverity: 'error',
    title: 'Missing Image Alt Text',
    summary:
      'Attachment has no alt text on a platform that supports accessibility descriptions, failing WCAG 2.2 SC 1.1.1 Non-text Content for screen-reader users.',
    specRef: 'WCAG 2.2 SC 1.1.1 / PlatformSpec.altText',
  },
  {
    id: 'accessibility/alt-text-limit',
    category: 'accessibility',
    defaultSeverity: 'error',
    title: 'Alt Text Character Limit Exceeded',
    summary:
      'Alt text exceeds the platform maximum and will be truncated or rejected at upload time.',
    specRef: 'PlatformSpec.altText.maxChars',
  },
  {
    id: 'accessibility/redundant-alt-prefix',
    category: 'accessibility',
    defaultSeverity: 'warning',
    title: 'Redundant Alt Text Prefix',
    summary:
      'Alt text opens with "image of", "photo of", "screenshot of" or similar. Screen readers already announce the element type, so the prefix wastes the listener’s first words.',
    specRef: 'WCAG 2.2 SC 1.1.1',
  },

  // Media — attachment counts & per-platform compatibility
  {
    id: 'media/max-items-exceeded',
    category: 'media',
    defaultSeverity: 'error',
    title: 'Carousel Item Limit Exceeded',
    summary:
      'Total media items exceed the platform maximum for a single carousel or post.',
    specRef: 'PlatformSpec.media.maxImages',
  },
  {
    id: 'media/max-images-exceeded',
    category: 'media',
    defaultSeverity: 'error',
    title: 'Image Count Limit Exceeded',
    summary: 'Image attachment count exceeds the platform maximum images per post.',
    specRef: 'PlatformSpec.media.maxImages',
  },
  {
    id: 'media/images-not-supported',
    category: 'media',
    defaultSeverity: 'error',
    title: 'Standalone Images Not Supported',
    summary:
      'Target platform is video-only (TikTok, Reels, Shorts) and rejects standalone image uploads.',
    specRef: 'PlatformSpec.media.maxImages',
  },
  {
    id: 'media/multiple-videos-unsupported',
    category: 'media',
    defaultSeverity: 'error',
    title: 'Multiple Videos Unsupported',
    summary:
      'Target platform accepts only one video per post; additional videos are dropped.',
    specRef: 'PlatformSpec.media.canMixImagesAndVideo',
  },
  {
    id: 'media/mixed-media-unsupported',
    category: 'media',
    defaultSeverity: 'error',
    title: 'Mixed Images and Video Unsupported',
    summary: 'Target platform does not permit combining images and video in a single post.',
    specRef: 'PlatformSpec.media.canMixImagesAndVideo',
  },
  {
    id: 'media/x-api-4-image-cap',
    category: 'media',
    defaultSeverity: 'error',
    title: 'X API v2 Documented 4-Image Cap Exceeded',
    summary:
      'X POST /2/tweets formally documents 4 photos maximum in media_ids, even though the native composer now accepts more.',
    specRef: 'X API v2 POST /2/tweets media_ids Limit',
  },
  {
    id: 'media/x-api-mixed-media-risk',
    category: 'media',
    defaultSeverity: 'warning',
    title: 'X API Mixed Image + Video Request Risk',
    summary:
      'Mixing images and video in one X API request is unsupported and fails inconsistently even where the native composer allows it.',
    specRef: 'x.media.canMixImagesAndVideo',
  },
  {
    id: 'media/bluesky-gallery-required',
    category: 'media',
    defaultSeverity: 'warning',
    title: 'Bluesky Standard 4-Image Embed Limit Exceeded',
    summary:
      'Standard app.bsky.embed.images caps at 4 images; 5-10 images require app.bsky.embed.gallery.',
    specRef: 'AT Protocol app.bsky.embed.images vs gallery',
  },

  // Media — file size & duration ceilings
  {
    id: 'media/image-size-limit',
    category: 'media',
    defaultSeverity: 'error',
    title: 'Image File Size Exceeded',
    summary:
      'Image byte size exceeds the platform upload cap and will be rejected or aggressively recompressed.',
    specRef: 'PlatformSpec.media.maxImageSizeBytes',
  },
  {
    id: 'media/video-size-limit',
    category: 'media',
    defaultSeverity: 'error',
    title: 'Video File Size Exceeded',
    summary: 'Video byte size exceeds the platform upload cap.',
    specRef: 'PlatformSpec.media.maxVideoSizeBytes',
  },
  {
    id: 'media/video-duration-limit',
    category: 'media',
    defaultSeverity: 'error',
    title: 'Video Duration Limit Exceeded',
    summary: 'Video runtime exceeds the maximum allowed duration for the target platform.',
    specRef: 'PlatformSpec.media.maxVideoDurationSec',
  },
  {
    id: 'media/bluesky-decimal-byte-limit',
    category: 'media',
    defaultSeverity: 'error',
    title: 'Bluesky Decimal 2,000,000-Byte Image Cap Exceeded',
    summary:
      'Bluesky enforces a decimal 2,000,000-byte image ceiling, not 2 MiB (2,097,152). Images between the two values silently fail to upload.',
    specRef: 'bluesky.media.maxImageSizeBytes (decimal 2,000,000)',
  },
  {
    id: 'media/bluesky-legacy-1mb-limit',
    category: 'media',
    defaultSeverity: 'warning',
    title: 'Bluesky Legacy 1 MB Client Ceiling',
    summary:
      'Image exceeds 1,000,000 bytes; older Bluesky clients and some third-party AppViews still enforce the legacy 1 MB blob ceiling.',
    specRef: 'bluesky.oauth.gotcha (legacy blob ceiling)',
  },

  // Media — Instagram & YouTube ingestion traps
  {
    id: 'media/ig-api-aspect-ratio-36003',
    category: 'media',
    defaultSeverity: 'error',
    title: 'Instagram Graph API Aspect Ratio Error 36003',
    summary:
      'Aspect ratio is narrower than 4:5 (0.80) and is hard-rejected by the Instagram Graph API with error 36003, even though the native app accepts it.',
    specRef: 'instagram-feed.oauth.gotcha (Graph API error 36003)',
  },
  {
    id: 'media/ig-api-carousel-limit',
    category: 'media',
    defaultSeverity: 'error',
    title: 'Instagram Graph API 10-Item Carousel Cap',
    summary:
      'Instagram Graph API caps carousels at 10 items while the native app allows up to 20, so API publishing fails above 10.',
    specRef: 'instagram-feed.oauth.gotcha (carousel item cap)',
  },
  {
    id: 'media/ig-carousel-aspect-lock',
    category: 'media',
    defaultSeverity: 'warning',
    title: 'Instagram Carousel First-Slide Ratio Lock',
    summary:
      'Instagram locks every carousel slide to the aspect ratio of slide #1; mismatched later slides are centre-cropped.',
    specRef: 'instagram-feed.media.firstSlideLocksRatio',
  },
  {
    id: 'media/ig-reels-recommendation-ceiling',
    category: 'media',
    defaultSeverity: 'warning',
    title: 'Instagram Reels 3-Minute Recommendation Ceiling',
    summary:
      'Reels longer than 180 seconds lose eligibility for recommendation surfaces, sharply limiting non-follower reach.',
    specRef: 'instagram-reels.media.recommendedVideoDurationSec',
  },
  {
    id: 'media/yt-shorts-landscape-misclassification',
    category: 'media',
    defaultSeverity: 'error',
    title: 'YouTube Shorts Landscape Misclassification',
    summary:
      'Landscape video (width > height) is silently classified as a standard long-form upload instead of a Short, removing it from the Shorts shelf.',
    specRef: 'youtube-shorts.oauth.gotcha (aspect classification)',
  },

  // Media — LinkedIn PDF document carousels
  {
    id: 'media/pdf-unsupported',
    category: 'media',
    defaultSeverity: 'error',
    title: 'Native PDF Carousel Unsupported',
    summary:
      'Native PDF document carousels are LinkedIn-only; other platforms require slides exported as images.',
    specRef: 'PlatformSpec.media (document carousel support)',
  },
  {
    id: 'media/pdf-page-limit',
    category: 'media',
    defaultSeverity: 'error',
    title: 'LinkedIn PDF Page Limit Exceeded',
    summary: 'Document exceeds the LinkedIn 300-page maximum for PDF carousels.',
    specRef: 'linkedin.media PDF carousel (300 pages)',
  },
  {
    id: 'media/pdf-size-limit',
    category: 'media',
    defaultSeverity: 'error',
    title: 'LinkedIn PDF File Size Exceeded',
    summary: 'Document exceeds the LinkedIn 100 MiB PDF carousel upload ceiling.',
    specRef: 'linkedin.media PDF carousel (100 MiB)',
  },
  {
    id: 'media/pdf-mobile-render-slow',
    category: 'media',
    defaultSeverity: 'warning',
    title: 'LinkedIn PDF Mobile Render Stall',
    summary:
      'PDF carousels above 5 MiB render slowly on mobile, and readers scroll past before slide #1 paints.',
    specRef: 'linkedin.media PDF carousel (mobile render budget)',
  },

  // Media — transcoding, colour space & provenance
  {
    id: 'media/hdr-washout-risk',
    category: 'media',
    defaultSeverity: 'warning',
    title: '10-Bit HDR Washout After Transcode',
    summary:
      'HLG / PQ / Dolby Vision sources frequently wash out or clip highlights once platforms transcode them to SDR Rec.709.',
    specRef: 'Platform Video Ingestion (SDR Rec.709 transcode)',
  },
  {
    id: 'media/vfr-audio-desync',
    category: 'media',
    defaultSeverity: 'warning',
    title: 'Variable Frame Rate Audio Desync',
    summary:
      'Variable frame rate (VFR) phone footage causes frame stutter and progressive audio/video desync after platform re-encode. Convert to constant frame rate first.',
    specRef: 'Platform Video Ingestion (CFR requirement)',
  },
  {
    id: 'media/chroma-subsampling-bleed',
    category: 'media',
    defaultSeverity: 'warning',
    title: 'Chroma Subsampling Text Bleed',
    summary:
      'Non-4:2:0 chroma subsampling risks colour bleeding and illegible on-screen text once the platform re-encodes to yuv420p.',
    specRef: 'Platform Video Ingestion (yuv420p)',
  },
  {
    id: 'media/c2pa-ai-label-trigger',
    category: 'media',
    defaultSeverity: 'warning',
    title: 'C2PA Content Credentials Trigger AI Label',
    summary:
      'Embedded C2PA Content Credentials cause Meta (Instagram/Threads) and TikTok to auto-apply an "AI info" label, which can suppress organic reach.',
    specRef: 'C2PA Content Credentials / Meta AI labelling',
  },
  {
    id: 'media/competitor-watermark',
    category: 'media',
    defaultSeverity: 'error',
    title: 'Competitor or Downloader Watermark Detected',
    summary:
      'Filename matches a competitor or third-party downloader watermark pattern (TikTok, SnapTik, CapCut, reelsave); platforms actively suppress recycled watermarked video.',
    specRef: 'PlatformSpec.media.watermarkPenalized',
  },

  // Open Graph link card forensics — emitted by validateOpenGraph
  {
    id: 'media/og-missing-title',
    category: 'media',
    defaultSeverity: 'error',
    title: 'Missing og:title',
    summary:
      'Link preview cards fall back to raw URLs or broken page titles when og:title is absent.',
    specRef: 'Open Graph Protocol og:title',
  },
  {
    id: 'media/og-missing-description',
    category: 'media',
    defaultSeverity: 'warning',
    title: 'Missing og:description',
    summary:
      'Without og:description, crawlers scrape boilerplate navigation text into the link preview.',
    specRef: 'Open Graph Protocol og:description',
  },
  {
    id: 'media/og-title-too-long',
    category: 'media',
    defaultSeverity: 'warning',
    title: 'og:title Truncated on Link Cards',
    summary: 'og:title exceeds 70 characters and is truncated in X link cards.',
    specRef: 'X Cards og:title (70 chars)',
  },
  {
    id: 'media/og-description-too-long',
    category: 'media',
    defaultSeverity: 'warning',
    title: 'og:description Truncated on Link Cards',
    summary: 'og:description exceeds 200 characters and is truncated in X link cards.',
    specRef: 'X Cards og:description (200 chars)',
  },
  {
    id: 'media/og-non-https-url',
    category: 'media',
    defaultSeverity: 'error',
    title: 'Open Graph URL Not HTTPS',
    summary:
      'Modern social crawlers reject or downgrade insecure http:// Open Graph URLs.',
    specRef: 'Open Graph Protocol og:url (HTTPS required)',
  },
  {
    id: 'media/og-svg-unsupported',
    category: 'media',
    defaultSeverity: 'error',
    title: 'SVG Rejected as og:image',
    summary:
      'SVG is not an accepted og:image format for X, LinkedIn, Meta, Slack, or iMessage crawlers.',
    specRef: 'Open Graph og:image supported formats',
  },
  {
    id: 'media/og-legacy-format-risk',
    category: 'media',
    defaultSeverity: 'warning',
    title: 'Legacy Crawler og:image Format Risk',
    summary:
      'WebP and AVIF Open Graph images break or fail silently on legacy link crawlers and some chat clients.',
    specRef: 'Open Graph og:image legacy crawler support',
  },
  {
    id: 'media/og-image-too-small',
    category: 'media',
    defaultSeverity: 'error',
    title: 'og:image Below 600x315 Minimum',
    summary:
      'Open Graph images smaller than 600x315 downgrade the link preview from a large card to a small thumbnail or none at all.',
    specRef: 'Open Graph og:image minimum 600x315',
  },
  {
    id: 'media/og-image-over-5mb',
    category: 'media',
    defaultSeverity: 'error',
    title: 'og:image Exceeds 5 MB Crawler Cap',
    summary:
      'Open Graph images above 5 MB exceed the social crawler ceiling and fail to render as previews.',
    specRef: 'Open Graph og:image 5 MB crawler cap',
  },
  {
    id: 'media/og-whatsapp-300kb-drop',
    category: 'media',
    defaultSeverity: 'warning',
    title: 'WhatsApp 300 KB Open Graph Silent Drop',
    summary:
      'Open Graph images above 300 KB (307,200 bytes) are silently dropped by WhatsApp and iMessage, killing dark-social link previews.',
    specRef: 'WhatsApp / iMessage og:image 307,200-byte ceiling',
  },
  {
    id: 'media/og-x-aspect-crop',
    category: 'media',
    defaultSeverity: 'warning',
    title: 'X summary_large_image Aspect Crop',
    summary:
      'og:image aspect ratio deviates from 1.91:1 / 2:1, so X centre-crops the summary_large_image card.',
    specRef: 'x.safeZones.ogCard',
  },
  {
    id: 'media/og-linkedin-small-thumbnail',
    category: 'media',
    defaultSeverity: 'warning',
    title: 'LinkedIn Small Thumbnail Downgrade',
    summary:
      'og:image is below the LinkedIn large-card threshold, so the post renders a small side thumbnail instead of a full-width image.',
    specRef: 'LinkedIn Post Inspector og:image thresholds',
  },
  {
    id: 'media/og-twitter-card-missing',
    category: 'media',
    defaultSeverity: 'warning',
    title: 'twitter:card Missing or Not Large Image',
    summary:
      'Without twitter:card set to summary_large_image, X renders the narrow summary card instead of the full-width preview.',
    specRef: 'X Cards twitter:card',
  },
  {
    id: 'media/og-cache-bust-tip',
    category: 'media',
    defaultSeverity: 'info',
    title: 'Open Graph Cache Not Versioned',
    summary:
      'Open Graph URL carries no version query string; crawlers cache previews aggressively, so edits to the card will not appear until the cache expires.',
    specRef: 'Open Graph crawler cache invalidation',
  },
] as const;

const GENERIC_SPAM_HASHTAGS = new Set([
  '#fyp',
  '#foryou',
  '#foryoupage',
  '#fypシ',
  '#explore',
  '#explorepage',
  '#viral',
  '#trending',
  '#follow4follow',
  '#f4f',
  '#like4like',
  '#l4l',
  '#followforfollow',
  '#likeforlike',
  '#followback',
  '#instagood',
  '#photooftheday',
]);

const ENGAGEMENT_BAIT_PATTERNS: ReadonlyArray<{ label: string; regex: RegExp }> = [
  {
    label: 'comment-keyword bait',
    regex: /\bcomment\s+["'“”]?(?:yes|me|interested|link|guide|send|info|ready|fire|agree|below)["'“”]?\b/i,
  },
  {
    label: 'comment-for-asset bait',
    regex: /\bcomment\s+["'“”]?[a-z0-9]{1,20}["'“”]?\s+(?:below|if|to\s+get|for\s+the)\b/i,
  },
  {
    label: 'tag-friends bait',
    regex: /\btag\s+(?:\d+|a|two|three|your)\s+(?:friends?|colleagues?|people|someone)\b/i,
  },
  {
    label: 'like/retweet-if bait',
    regex: /\b(?:like|share|repost|retweet|rt)\s+(?:this\s+)?(?:if\s+you\s+agree|if\s+you\s+relate|to\s+win)\b/i,
  },
  {
    label: 'drop-in-comments bait',
    regex: /\bdrop\s+(?:a\s+)?[^\n.!?]{1,25}\s+in\s+the\s+comments?\b/i,
  },
  {
    label: 'follow-chain bait',
    regex: /\bfollow\s+(?:everyone|all|anyone)\s+who\b/i,
  },
];

const AI_SLOP_PHRASES: ReadonlyArray<{ label: string; highSignal: boolean; regex: RegExp }> = [
  { label: 'delve', highSignal: true, regex: /\bdelve(?:s|d|ing)?\b/i },
  { label: 'game-changer', highSignal: true, regex: /\bgame[- ]changer\b/i },
  { label: 'tapestry', highSignal: true, regex: /\btapestry\b/i },
  { label: "in today's fast-paced", highSignal: true, regex: /\bin\s+today['’]s\s+fast[- ]paced\b/i },
  { label: 'unleash the power', highSignal: true, regex: /\bunleash\s+the\s+power\b/i },
  { label: 'elevate your', highSignal: true, regex: /\belevate\s+your\b/i },
  { label: 'revolutionize', highSignal: true, regex: /\brevolutioniz(?:e|es|ed|ing)\b/i },
  { label: 'realm of', highSignal: false, regex: /\brealm\s+of\b/i },
  { label: 'embark on a journey', highSignal: false, regex: /\bembark\s+on\s+a\s+journey\b/i },
  { label: 'testament to', highSignal: false, regex: /\btestament\s+to\b/i },
  { label: "it's not just about", highSignal: false, regex: /\bit['’]s\s+not\s+just\s+about\b/i },
  { label: 'unlock your full potential', highSignal: false, regex: /\bunlock\s+your\s+full\s+potential\b/i },
  { label: 'ever-evolving landscape', highSignal: false, regex: /\bever[- ]evolving\s+landscape\b/i },
  { label: 'navigating the complexities', highSignal: false, regex: /\bnavigating\s+the\s+complexities\b/i },
  { label: 'cutting-edge solution', highSignal: false, regex: /\bcutting[- ]edge\s+solution\b/i },
  { label: 'buckle up', highSignal: false, regex: /\bbuckle\s+up\b/i },
  { label: "here's the kicker", highSignal: false, regex: /\bhere['’]s\s+the\s+kicker\b/i },
];

const CTA_PATTERN =
  /\b(?:comment|reply|subscribe|sign\s+up|download|register|book\s+a|learn\s+more|read\s+more|link\s+in\s+bio|dm\s+me|get\s+started|claim|join\s+us|shop\s+now|buy\s+now|check\s+out\s+the\s+link)\b/i;

const APPROVED_FTC_DISCLOSURE_REGEX =
  /(?:^|[\s([{"'“”])(#ad\b|ad:|#sponsored\b|#advertisement\b|advertisement\b|paid\s+partnership\b|sponsored\s+by\b|commercial\s+collaboration\b)/i;

const PROHIBITED_FTC_SHORTHAND_REGEX =
  /(?:^|[\s([{"'“”])(#(?:sp|spon|collab|partner|ambassador|gifted|pr|prsample|affiliate)\b)/gi;

const SHUTDOWN_DYNAMIC_LINK_HOSTS = new Set(['page.link', 'goo.gl']);
const PUBLIC_SHORTENER_HOSTS = new Set([
  'bit.ly',
  'bitly.com',
  'tinyurl.com',
  'ow.ly',
  'rb.gy',
  'is.gd',
  'rebrand.ly',
  'shorturl.at',
  'cutt.ly',
  'buff.ly',
  'lnkd.in',
  't.co',
]);

const UNRESOLVED_PLACEHOLDER_REGEX =
  /\{\{[^{}\n]{1,40}\}\}|\[(?:insert\b[^\]\n]{0,30}|your\s+[a-z][a-z\s_-]{1,25}|placeholder|link\s+here|url\s+here|tbd|todo|company\s+name|brand\s+name|cta\s+here)\]|https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\b/i;

const ADJACENT_UNSPACED_HASHTAG_REGEX = /(?:^|\s)(#[\p{L}\p{N}_]+#[\p{L}\p{N}_]+)/gu;

const AI_DISCLOSURE_REGEX =
  /\b(?:ai[- ]generated|generated\s+(?:with|by|using)\s+ai|synthetic\s+media|made\s+with\s+ai|created\s+with\s+ai|ai\s+disclosure|c2pa)\b|#(?:aigenerated|madewithai|aiart|syntheticmedia)\b/i;

const ALL_CAPS_SHOUTING_REGEX = /\b[A-Z]{4,}(?:\s+[A-Z]{4,}){2,}\b/g;
const EMOJI_RUN_REGEX = /\p{Extended_Pictographic}/gu;

const PLATFORM_UTM_SOURCE_ALIASES: Readonly<Record<PlatformId, readonly string[]>> = {
  x: ['x', 'twitter', 'x.com', 'twitter.com', 't.co'],
  linkedin: ['linkedin', 'li', 'linkedin.com', 'lnkd'],
  'instagram-feed': ['instagram', 'ig', 'insta', 'instagram-feed', 'instagram_feed', 'instagram.com'],
  'instagram-reels': ['instagram', 'ig', 'insta', 'instagram-reels', 'instagram_reels', 'reels', 'instagram.com'],
  tiktok: ['tiktok', 'tt', 'tiktok.com'],
  'youtube-shorts': ['youtube', 'yt', 'youtube-shorts', 'youtube_shorts', 'shorts', 'youtube.com', 'youtu.be'],
  threads: ['threads', 'threads.net', 'threads.com'],
  bluesky: ['bluesky', 'bsky', 'bsky.app'],
  mastodon: ['mastodon', 'fediverse', 'masto'],
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsTermCaseInsensitive(haystack: string, term: string): boolean {
  const trimmed = term.trim();
  if (trimmed.length === 0) return false;
  const escaped = escapeRegExp(trimmed);
  const startsWord = /^[a-zA-Z0-9]/.test(trimmed);
  const endsWord = /[a-zA-Z0-9]$/.test(trimmed);
  const pattern = `${startsWord ? '\\b' : ''}${escaped}${endsWord ? '\\b' : ''}`;
  return new RegExp(pattern, 'i').test(haystack);
}

function stripUrlsAndHashtags(text: string): string {
  const urls = findUrlMatches(text);
  const tags = findHashtagMatches(text, urls);
  const spans = [...urls, ...tags].sort((a, b) => a.start - b.start);
  let out = '';
  let cursor = 0;
  for (const span of spans) {
    if (span.start > cursor) {
      out += text.slice(cursor, span.start);
    }
    out += ' ';
    cursor = Math.max(cursor, span.end);
  }
  if (cursor < text.length) {
    out += text.slice(cursor);
  }
  return out;
}

function severityRank(sev: Severity): number {
  if (sev === 'error') return 3;
  if (sev === 'warning') return 2;
  return 1;
}

export function evaluatePlatformRules(
  draft: SocialDraft,
  platform: PlatformId,
  counts: CountResult,
  folds: PlatformFoldSimulation,
  guardrails?: BrandGuardrails,
): LintDiagnostic[] {
  const spec = getPlatformSpec(platform);
  const diagnostics: LintDiagnostic[] = [];
  const publishViaApi = Boolean(draft.publishViaApi || guardrails?.useApiLimits);
  const text = draft.text;

  // 1. limits/api-limit-divergence & limits/char-limit-exceeded
  const isApiDivergence =
    counts.apiHardLimit !== null &&
    counts.apiHardLimit < counts.hardLimit &&
    counts.count > counts.apiHardLimit &&
    counts.count <= counts.hardLimit;

  if (isApiDivergence && counts.apiHardLimit !== null) {
    diagnostics.push({
      ruleId: 'limits/api-limit-divergence',
      platform,
      category: 'limits',
      severity: publishViaApi ? 'error' : 'warning',
      message: `${spec.shortName} caption (${counts.count} chars) fits the native ${counts.hardLimit}-char cap but exceeds the ${counts.apiHardLimit}-char Publishing API cap by ${counts.count - counts.apiHardLimit} chars.`,
      fixHint: `Trim caption to <=${counts.apiHardLimit} characters before scheduling or publishing via API.`,
      autoFixable: false,
      evidence: `${counts.count} / ${counts.apiHardLimit} API cap (native ${counts.hardLimit})`,
      specRef: 'PlatformSpec.counting.apiHardLimit',
      penaltyPoints: 20,
    });
  }

  if (counts.count > counts.effectiveLimit && !isApiDivergence) {
    const excess = counts.count - counts.effectiveLimit;
    diagnostics.push({
      ruleId: 'limits/char-limit-exceeded',
      platform,
      category: 'limits',
      severity: 'error',
      message: `Draft exceeds ${spec.shortName}'s limit by ${excess} unit(s) (${counts.count}/${counts.effectiveLimit} via ${counts.algorithm}).`,
      fixHint: `Shorten copy by at least ${excess} unit(s) to fit ${spec.shortName}'s ${counts.effectiveLimit} limit.`,
      autoFixable: false,
      evidence: counts.breakdown,
      specRef: 'PlatformSpec.counting.hardLimit',
      penaltyPoints: 30,
    });
  }

  // 2. limits/bluesky-byte-limit
  if (counts.overByteLimit && counts.maxBytes !== null) {
    diagnostics.push({
      ruleId: 'limits/bluesky-byte-limit',
      platform,
      category: 'limits',
      severity: 'error',
      message: `Draft is ${counts.utf8Bytes} UTF-8 bytes, exceeding ${spec.shortName}'s hard ${counts.maxBytes}-byte ceiling (even with ${counts.graphemes} graphemes).`,
      fixHint: `Reduce multi-byte emojis/ZWJ sequences or non-ASCII characters by at least ${counts.utf8Bytes - counts.maxBytes} UTF-8 bytes.`,
      autoFixable: false,
      evidence: `${counts.utf8Bytes}/${counts.maxBytes} UTF-8 bytes (${counts.graphemes} graphemes)`,
      specRef: 'ATProto app.bsky.feed.post maxLength:3000',
      penaltyPoints: 30,
    });
  }

  // 3. limits/threads-unique-urls
  if (spec.links.maxUniqueUrlsApi !== null && counts.uniqueUrls.length > spec.links.maxUniqueUrlsApi) {
    diagnostics.push({
      ruleId: 'limits/threads-unique-urls',
      platform,
      category: 'limits',
      severity: 'error',
      message: `${spec.shortName} allows at most ${spec.links.maxUniqueUrlsApi} unique URLs per post via API, but found ${counts.uniqueUrls.length}.`,
      fixHint: `Remove ${counts.uniqueUrls.length - spec.links.maxUniqueUrlsApi} URL(s) or move extra links into a follow-up reply.`,
      autoFixable: false,
      evidence: counts.uniqueUrls.join(', '),
      specRef: 'Meta Threads API maxUniqueUrlsApi:5',
      penaltyPoints: 20,
    });
  }

  // 4. limits/forbidden-chars
  if (spec.counting.forbiddenChars.length > 0) {
    const checkSurface = draft.title ? `${draft.title}\n${text}` : text;
    const foundForbidden = spec.counting.forbiddenChars.filter((ch) => checkSurface.includes(ch));
    if (foundForbidden.length > 0) {
      diagnostics.push({
        ruleId: 'limits/forbidden-chars',
        platform,
        category: 'limits',
        severity: 'error',
        message: `${spec.shortName} forbids character(s) ${foundForbidden.map((c) => `'${c}'`).join(', ')} in titles and descriptions.`,
        fixHint: `Remove or replace ${foundForbidden.map((c) => `'${c}'`).join(' and ')} (e.g. use arrows '→' or parentheses).`,
        autoFixable: true,
        evidence: foundForbidden.join(' '),
        specRef: 'PlatformSpec.counting.forbiddenChars',
        penaltyPoints: 20,
      });
    }
  }

  // 5. limits/first-comment-limit
  if (draft.firstComment && spec.counting.firstCommentLimit !== null) {
    const fcLength =
      spec.counting.algorithm === 'utf16'
        ? draft.firstComment.length
        : countGraphemes(draft.firstComment);
    if (fcLength > spec.counting.firstCommentLimit) {
      diagnostics.push({
        ruleId: 'limits/first-comment-limit',
        platform,
        category: 'limits',
        severity: 'error',
        message: `First comment (${fcLength} chars) exceeds ${spec.shortName}'s ${spec.counting.firstCommentLimit}-char comment limit.`,
        fixHint: `Trim first comment by ${fcLength - spec.counting.firstCommentLimit} char(s).`,
        autoFixable: false,
        evidence: `${fcLength}/${spec.counting.firstCommentLimit}`,
        specRef: 'PlatformSpec.counting.firstCommentLimit',
        penaltyPoints: 15,
      });
    }
  }

  // 6. fold/blank-line-starvation
  if (
    spec.folds.blankLinesCountAsLines &&
    spec.folds.mobileLines !== null &&
    spec.folds.mobileLines <= 3
  ) {
    const normalizedLines = text.replace(/\r\n/g, '\n').split('\n');
    const blankInTopTwo =
      normalizedLines.length >= 3 &&
      (normalizedLines[0]?.trim().length ?? 0) > 0 &&
      (normalizedLines[1]?.trim().length ?? 0) === 0;

    if ((folds.mobile.blankLinesConsumed > 0 && folds.mobile.truncated) || (blankInTopTwo && folds.mobile.truncated)) {
      diagnostics.push({
        ruleId: 'fold/blank-line-starvation',
        platform,
        category: 'fold',
        severity: 'warning',
        message: `Blank line in the opening 2 lines consumes ${Math.max(1, folds.mobile.blankLinesConsumed)} of ${folds.mobile.lineLimit ?? spec.folds.mobileLines} mobile visible line(s) before '${spec.folds.foldLabel}' on ${spec.shortName}.`,
        fixHint: 'Remove the blank line between line 1 and line 2 so your full two-line hook sits above the mobile fold.',
        autoFixable: platform === 'linkedin',
        evidence: `Visible above fold: "${folds.mobile.visibleText.slice(0, 80)}"`,
        specRef: 'PlatformSpec.folds.blankLinesCountAsLines',
        penaltyPoints: 10,
      });
    }
  }

  // 7. fold/weak-hook-truncation
  if (folds.mobile.truncated && folds.mobile.visibleText.length > 0 && folds.mobile.hiddenText.length > 0) {
    const lastVisibleChar = folds.mobile.visibleText[folds.mobile.visibleText.length - 1] ?? '';
    const firstHiddenChar = folds.mobile.hiddenText[0] ?? '';
    const midWordCut = /[\p{L}\p{N}]/u.test(lastVisibleChar) && /[\p{L}\p{N}]/u.test(firstHiddenChar);
    const ultraThinHook = folds.mobile.visibleChars < 25 && counts.graphemes > 100;
    const ctaBuriedBelowFold =
      CTA_PATTERN.test(folds.mobile.hiddenText) &&
      !CTA_PATTERN.test(folds.mobile.visibleText) &&
      !folds.mobile.visibleText.includes('?');

    if (midWordCut || ultraThinHook || ctaBuriedBelowFold) {
      const reasons: string[] = [];
      if (midWordCut) reasons.push('mobile fold cuts mid-word');
      if (ultraThinHook) reasons.push(`only ${folds.mobile.visibleChars} chars visible above fold`);
      if (ctaBuriedBelowFold) reasons.push('call-to-action is buried below the fold');

      diagnostics.push({
        ruleId: 'fold/weak-hook-truncation',
        platform,
        category: 'fold',
        severity: midWordCut || ultraThinHook ? 'warning' : 'info',
        message: `Weak ${spec.shortName} mobile fold presentation: ${reasons.join('; ')}.`,
        fixHint: `Tighten your opening hook to land cleanly within ${folds.mobile.charLimit ?? spec.folds.mobileChars ?? 120} chars before '${spec.folds.foldLabel}'.`,
        autoFixable: false,
        evidence: `"...${folds.mobile.visibleText.slice(-24)}|${folds.mobile.hiddenText.slice(0, 24)}..."`,
        specRef: 'PlatformSpec.folds.mobileChars',
        penaltyPoints: 6,
      });
    }
  }

  // 8. fold/reels-ultra-tight-fold
  if (platform === 'instagram-reels') {
    const firstLine = text.replace(/\r\n/g, '\n').split('\n')[0] ?? '';
    const firstLineLen = countGraphemes(firstLine);
    if (firstLineLen > 55) {
      diagnostics.push({
        ruleId: 'fold/reels-ultra-tight-fold',
        platform,
        category: 'fold',
        severity: 'info',
        message: `Instagram Reels first line is ${firstLineLen} chars; mobile overlay HUD truncates after ~55 chars.`,
        fixHint: 'Front-load the primary takeaway or keyword in the first 50–55 characters.',
        autoFixable: false,
        evidence: firstLine.slice(0, 70),
        specRef: 'Instagram Reels Mobile HUD Fold (~55 chars)',
        penaltyPoints: 4,
      });
    }
  }

  // 9. algorithm/external-link-suppression
  if (
    spec.links.clickableInBody &&
    (spec.links.bodyPenaltyRisk === 'high' || spec.links.bodyPenaltyRisk === 'moderate') &&
    counts.urlCount > 0 &&
    !guardrails?.allowExternalLinks
  ) {
    diagnostics.push({
      ruleId: 'algorithm/external-link-suppression',
      platform,
      category: 'algorithm',
      severity: 'warning',
      message: `${spec.shortName} applies ${spec.links.bodyPenaltyRisk} reach suppression risk to outbound URLs in main body copy (${counts.urlCount} URL(s) detected).`,
      fixHint: spec.links.recommendedStrategy,
      autoFixable: false,
      evidence: counts.uniqueUrls[0],
      specRef: 'PlatformSpec.links.bodyPenaltyRisk',
      penaltyPoints: 12,
    });
  }

  // 10. algorithm/linkedin-first-comment-bridge
  if (platform === 'linkedin' && draft.firstComment) {
    const fcUrls = extractUrls(draft.firstComment);
    if (fcUrls.length > 0) {
      diagnostics.push({
        ruleId: 'algorithm/linkedin-first-comment-bridge',
        platform,
        category: 'algorithm',
        severity: 'warning',
        message: `External URL placed in LinkedIn first comment (${fcUrls.length} URL(s)) triggers link-bridge pattern detection.`,
        fixHint: spec.links.recommendedStrategy,
        autoFixable: false,
        evidence: fcUrls[0],
        specRef: 'LinkedIn Links Policy / firstCommentSafe:false',
        penaltyPoints: 10,
      });
    }
  }

  // 11. algorithm/non-clickable-caption-url
  if (!spec.links.clickableInBody && counts.urlCount > 0) {
    diagnostics.push({
      ruleId: 'algorithm/non-clickable-caption-url',
      platform,
      category: 'algorithm',
      severity: 'warning',
      message: `${spec.shortName} does not hyperlink URLs in captions; ${counts.urlCount} URL(s) will render as unclickable dead text.`,
      fixHint: spec.links.recommendedStrategy,
      autoFixable: false,
      evidence: counts.uniqueUrls[0],
      specRef: 'PlatformSpec.links.clickableInBody:false',
      penaltyPoints: 10,
    });
  }

  // 12. algorithm/hashtag-hard-cap
  const exceedsHashtagHardCap =
    spec.hashtags.hardCap !== null && counts.hashtagCount > spec.hashtags.hardCap;

  if (exceedsHashtagHardCap && spec.hashtags.hardCap !== null) {
    const ytWarning =
      platform === 'youtube-shorts'
        ? ' YouTube silently ignores ALL hashtags when exceeding 60.'
        : '';
    diagnostics.push({
      ruleId: 'algorithm/hashtag-hard-cap',
      platform,
      category: 'algorithm',
      severity: 'error',
      message: `Draft uses ${counts.hashtagCount} hashtags, exceeding ${spec.shortName}'s hard cap of ${spec.hashtags.hardCap}.${ytWarning}`,
      fixHint: `Trim hashtags down to <=${spec.hashtags.hardCap} targeted tag(s). ${spec.hashtags.excessBehavior}`,
      autoFixable: true,
      evidence: counts.hashtags.slice(0, 8).join(' '),
      specRef: 'PlatformSpec.hashtags.hardCap',
      penaltyPoints: 22,
    });
  }

  // 13. algorithm/hashtag-spam-threshold
  if (!exceedsHashtagHardCap && counts.hashtagCount > spec.hashtags.recommendedMax) {
    diagnostics.push({
      ruleId: 'algorithm/hashtag-spam-threshold',
      platform,
      category: 'algorithm',
      severity: 'warning',
      message: `Draft uses ${counts.hashtagCount} hashtags, above ${spec.shortName}'s recommended maximum of ${spec.hashtags.recommendedMax}.`,
      fixHint: `Keep hashtags within ${spec.hashtags.recommendedMin}–${spec.hashtags.recommendedMax} topical tags. ${spec.hashtags.notes}`,
      autoFixable: false,
      evidence: counts.hashtags.join(' '),
      specRef: 'PlatformSpec.hashtags.recommendedMax',
      penaltyPoints: 8,
    });
  }

  // 14. algorithm/generic-spam-hashtags
  const matchedGenericTags = counts.hashtags.filter((tag) =>
    GENERIC_SPAM_HASHTAGS.has(tag.toLowerCase()),
  );
  if (matchedGenericTags.length > 0) {
    diagnostics.push({
      ruleId: 'algorithm/generic-spam-hashtags',
      platform,
      category: 'algorithm',
      severity: 'info',
      message: `Generic low-signal hashtag(s) detected: ${matchedGenericTags.join(', ')}.`,
      fixHint: 'Replace generic reach-bait tags with specific niche or topical keywords.',
      autoFixable: false,
      evidence: matchedGenericTags.join(' '),
      specRef: 'Platform Discovery Best Practices',
      penaltyPoints: 4,
    });
  }

  // 15. algorithm/engagement-bait
  const matchedBait: string[] = [];
  for (const pattern of ENGAGEMENT_BAIT_PATTERNS) {
    const m = pattern.regex.exec(text);
    if (m) {
      matchedBait.push(m[0]);
    }
  }
  if (matchedBait.length > 0) {
    diagnostics.push({
      ruleId: 'algorithm/engagement-bait',
      platform,
      category: 'algorithm',
      severity: 'warning',
      message: `Engagement-bait phrasing detected (${matchedBait.map((b) => `"${b}"`).join(', ')}), which feed-ranking classifiers demote.`,
      fixHint: 'Replace explicit comment/tag/like-bait prompts with an authentic open-ended question.',
      autoFixable: false,
      evidence: matchedBait.join('; '),
      specRef: 'Platform Integrity / Demotion Guidelines',
      penaltyPoints: 14,
    });
  }

  // 16. algorithm/ai-slop-cliches
  if (guardrails?.flagAiSlop !== false) {
    const matchedCliches: string[] = [];
    let hasHighSignalCliche = false;
    for (const item of AI_SLOP_PHRASES) {
      if (item.regex.test(text)) {
        matchedCliches.push(item.label);
        if (item.highSignal) {
          hasHighSignalCliche = true;
        }
      }
    }

    const emojiMatches = text.match(EMOJI_RUN_REGEX) ?? [];
    const denseDecorativeEmojis = emojiMatches.length >= 5 && counts.graphemes <= 400;

    if (matchedCliches.length >= 2 || hasHighSignalCliche || denseDecorativeEmojis) {
      const reasons: string[] = [];
      if (matchedCliches.length > 0) {
        reasons.push(`AI cliché phrase(s): ${matchedCliches.join(', ')}`);
      }
      if (denseDecorativeEmojis) {
        reasons.push(`${emojiMatches.length} decorative emojis in a ${counts.graphemes}-char post`);
      }

      diagnostics.push({
        ruleId: 'algorithm/ai-slop-cliches',
        platform,
        category: 'algorithm',
        severity: matchedCliches.length >= 2 ? 'warning' : 'info',
        message: `Synthetic copy / AI-slop signal detected (${reasons.join('; ')}).`,
        fixHint: 'Rewrite generic filler phrases with concrete specifics, data points, and restrained emoji usage.',
        autoFixable: false,
        evidence: matchedCliches.length > 0 ? matchedCliches.join(', ') : `${emojiMatches.length} emojis`,
        specRef: 'BrandGuardrails.flagAiSlop',
        penaltyPoints: 6,
      });
    }
  }

  // 17-19. FTC / ASA Sponsored Compliance Rules
  if (draft.isSponsored) {
    // 17. compliance/ftc-prohibited-shorthand
    PROHIBITED_FTC_SHORTHAND_REGEX.lastIndex = 0;
    const prohibitedMatches: string[] = [];
    let pm: RegExpExecArray | null;
    while ((pm = PROHIBITED_FTC_SHORTHAND_REGEX.exec(text)) !== null) {
      const token = pm[1];
      if (token) prohibitedMatches.push(token);
    }

    if (prohibitedMatches.length > 0) {
      diagnostics.push({
        ruleId: 'compliance/ftc-prohibited-shorthand',
        platform,
        category: 'compliance',
        severity: 'error',
        message: `Sponsored post uses prohibited/ambiguous disclosure shorthand (${prohibitedMatches.join(', ')}), which violates FTC/ASA clarity rules.`,
        fixHint: "Replace ambiguous shorthand with an explicit upfront '#Ad', 'Ad:', or '#Sponsored' disclosure.",
        autoFixable: false,
        evidence: prohibitedMatches.join(', '),
        specRef: 'FTC 16 CFR Part 255 / ASA CAP Code',
        penaltyPoints: 25,
      });
    }

    // 18 & 19. compliance/ftc-missing-disclosure & compliance/ftc-below-fold
    const disclosureMatch = APPROVED_FTC_DISCLOSURE_REGEX.exec(text);
    if (!disclosureMatch) {
      diagnostics.push({
        ruleId: 'compliance/ftc-missing-disclosure',
        platform,
        category: 'compliance',
        severity: 'error',
        message: `Sponsored post on ${spec.shortName} is missing an approved disclosure token (#Ad, Ad:, #Sponsored, Paid Partnership, #Advertisement).`,
        fixHint: "Prepend '#Ad ' at the very start of the post before the mobile fold.",
        autoFixable: true,
        specRef: 'FTC 16 CFR Part 255 / ASA CAP Code',
        penaltyPoints: 30,
      });
    } else {
      const matchedToken = disclosureMatch[1] ?? disclosureMatch[0].trim();
      const leadingGap = disclosureMatch[0].length - matchedToken.length;
      const tokenOffset = disclosureMatch.index + leadingGap;
      const tokenCharOffset = countGraphemes(text.slice(0, tokenOffset));
      const jurisdiction = guardrails?.disclosureJurisdiction ?? 'ftc';

      const pastFoldLimit = tokenCharOffset > spec.folds.ftcMaxMobileChars;
      const inHiddenFold =
        folds.mobile.truncated &&
        !APPROVED_FTC_DISCLOSURE_REGEX.test(folds.mobile.visibleText);

      // Detect disclosure buried inside a trailing cluster of >=2 hashtags
      const allTags = findHashtagMatches(text);
      const trimmedEndLen = text.trimEnd().length;
      let trailingClusterStart = -1;
      let trailingClusterCount = 0;
      if (allTags.length >= 2) {
        const lastTag = allTags[allTags.length - 1];
        if (lastTag && lastTag.end >= trimmedEndLen - 1) {
          trailingClusterCount = 1;
          trailingClusterStart = lastTag.start;
          for (let i = allTags.length - 2; i >= 0; i--) {
            const prevTag = allTags[i];
            const nextTag = allTags[i + 1];
            if (!prevTag || !nextTag) break;
            const between = text.slice(prevTag.end, nextTag.start);
            if (/^[\s,./|•·-]+$/.test(between)) {
              trailingClusterCount++;
              trailingClusterStart = prevTag.start;
            } else {
              break;
            }
          }
        }
      }
      const buriedInHashtagCluster =
        matchedToken.startsWith('#') &&
        tokenOffset > 0 &&
        trailingClusterCount >= 2 &&
        trailingClusterStart >= 0 &&
        tokenOffset >= trailingClusterStart;

      const strict40CharJurisdiction =
        jurisdiction === 'asa-uk' ||
        jurisdiction === 'dfa-eu' ||
        jurisdiction === 'both' ||
        jurisdiction === 'all';
      const asaUkOrEuTooLate = strict40CharJurisdiction && tokenCharOffset > 40;

      if (pastFoldLimit || inHiddenFold || buriedInHashtagCluster) {
        const failureReasons: string[] = [];
        if (pastFoldLimit || inHiddenFold) {
          failureReasons.push(
            `appears at char ${tokenCharOffset} (after ${spec.shortName}'s ${spec.folds.ftcMaxMobileChars}-char mobile fold threshold)`,
          );
        }
        if (buriedInHashtagCluster) {
          failureReasons.push('buried inside a trailing hashtag cluster');
        }

        diagnostics.push({
          ruleId: 'compliance/ftc-below-fold',
          platform,
          category: 'compliance',
          severity: 'error',
          message: `Sponsored disclosure '${matchedToken}' is not clear and conspicuous: ${failureReasons.join(' and ')}.`,
          fixHint: `Move '#Ad' to the opening characters of the post (within first ${Math.min(40, spec.folds.ftcMaxMobileChars)} chars, outside trailing hashtag blocks).`,
          autoFixable: true,
          evidence: `'${matchedToken}' at offset ${tokenCharOffset}`,
          specRef: 'PlatformSpec.folds.ftcMaxMobileChars',
          penaltyPoints: 25,
        });
      } else if (asaUkOrEuTooLate) {
        diagnostics.push({
          ruleId: 'compliance/ftc-below-fold',
          platform,
          category: 'compliance',
          severity: 'warning',
          message: `Under ${jurisdiction.toUpperCase()} guidance, disclosure '${matchedToken}' at char ${tokenCharOffset} should be front-loaded within the first 40 characters.`,
          fixHint: "Move '#Ad' to the start of line 1 so readers identify commercial intent immediately.",
          autoFixable: true,
          evidence: `'${matchedToken}' at offset ${tokenCharOffset} (>40 chars for ASA UK / EU DFA)`,
          specRef: 'ASA UK CAP Code / EU Digital Fairness Act',
          penaltyPoints: 15,
        });
      }
    }
  }

  // 20. compliance/ai-synthetic-disclosure
  if (draft.isAiGenerated) {
    const hasTextAiDisclosure = AI_DISCLOSURE_REGEX.test(text);
    const hasC2pa = Boolean(draft.media?.some((m) => m.hasC2paMetadata));
    if (!hasTextAiDisclosure && !hasC2pa) {
      diagnostics.push({
        ruleId: 'compliance/ai-synthetic-disclosure',
        platform,
        category: 'compliance',
        severity: 'warning',
        message: 'Post is marked as AI-generated without an explicit AI/synthetic disclosure note or C2PA provenance metadata.',
        fixHint: 'Add a clear note (e.g. "Created with AI") or preserve C2PA Content Credentials on attached media.',
        autoFixable: false,
        specRef: 'Platform Synthetic Media Policies / EU AI Act Art. 50',
        penaltyPoints: 12,
      });
    }
  }

  // 21. accessibility/unicode-faux-bold
  const fancyRuns = detectUnicodeFancyFonts(text);
  if (fancyRuns.length > 0) {
    diagnostics.push({
      ruleId: 'accessibility/unicode-faux-bold',
      platform,
      category: 'accessibility',
      severity: guardrails?.strictAccessibility ? 'error' : 'warning',
      message: `Detected ${fancyRuns.length} Unicode faux-bold/fancy-font run(s) (${fancyRuns.slice(0, 3).join(', ')}), which break screen readers and fail platform search indexing.`,
      fixHint: 'Replace Unicode Mathematical Alphanumeric characters with standard ASCII text.',
      autoFixable: true,
      evidence: fancyRuns.slice(0, 5).join(' '),
      specRef: 'WCAG 2.2 / Unicode U+1D400-U+1D7FF',
      penaltyPoints: 14,
    });
  }

  // 22. accessibility/hashtag-pascal-case
  const nonPascalTags: string[] = [];
  for (const tag of counts.hashtags) {
    const body = tag.slice(1);
    const hasUpper = /[A-Z]/.test(body);
    const hasLower = /[a-z]/.test(body);
    const isAllLower = !hasUpper && hasLower;
    const isAllCaps = hasUpper && !hasLower;

    if (isAllCaps && body.length >= 6) {
      nonPascalTags.push(tag);
      continue;
    }

    if (isAllLower && body.length >= 10) {
      const pascal = toPascalCaseHashtag(tag);
      const upperCount = (pascal.slice(1).match(/[A-Z]/g) ?? []).length;
      if (upperCount >= 2 || !isKnownSingleHashtagWord(body)) {
        nonPascalTags.push(tag);
      }
    }
  }

  if (nonPascalTags.length > 0) {
    const suggestions = nonPascalTags
      .slice(0, 3)
      .map((t) => `${t} -> ${toPascalCaseHashtag(t)}`)
      .join(', ');
    diagnostics.push({
      ruleId: 'accessibility/hashtag-pascal-case',
      platform,
      category: 'accessibility',
      severity: 'warning',
      message: `${nonPascalTags.length} hashtag(s) lack PascalCase formatting (${nonPascalTags.join(', ')}), impairing screen-reader word boundary pronunciation.`,
      fixHint: `Convert compound or ALL-CAPS hashtags to PascalCase (e.g. ${suggestions}).`,
      autoFixable: true,
      evidence: nonPascalTags.join(' '),
      specRef: 'WCAG 2.2 / Social Media Accessibility',
      penaltyPoints: 6,
    });
  }

  // 23. accessibility/all-caps-shouting
  const plainCopy = stripUrlsAndHashtags(text);
  const shoutingMatches = plainCopy.match(ALL_CAPS_SHOUTING_REGEX) ?? [];
  if (shoutingMatches.length > 0) {
    diagnostics.push({
      ruleId: 'accessibility/all-caps-shouting',
      platform,
      category: 'accessibility',
      severity: 'info',
      message: `Consecutive ALL-CAPS sequence detected ("${shoutingMatches[0]}"), which screen readers may spell letter-by-letter.`,
      fixHint: 'Use sentence case with concise phrasing instead of sustained ALL-CAPS runs.',
      autoFixable: false,
      evidence: shoutingMatches.slice(0, 2).join(' | '),
      specRef: 'WCAG 2.2 Screen Reader Readability',
      penaltyPoints: 4,
    });
  }

  // 24. attribution/utm-hygiene
  const allUrls = [
    ...counts.uniqueUrls,
    ...(draft.firstComment ? extractUrls(draft.firstComment) : []),
  ];
  const uniqueAuditUrls = Array.from(new Set(allUrls));

  if (uniqueAuditUrls.length > 0) {
    const aggregatedIssues: Array<{ severity: Severity; message: string; autoFixable: boolean }> = [];
    const affectedUrls: string[] = [];

    for (const rawUrl of uniqueAuditUrls) {
      const audit = auditUtmUrl(rawUrl, {
        platform,
        expectedMedium: guardrails?.expectedUtmMedium,
        expectedCampaign: guardrails?.expectedCampaign,
      });

      const urlIssues: Array<{ severity: Severity; message: string; autoFixable: boolean }> = [];

      for (const issue of audit.issues) {
        const isNormalizable =
          issue.code.includes('uppercase') ||
          issue.code.includes('space') ||
          issue.code.includes('whitespace') ||
          issue.code.includes('click') ||
          issue.code.includes('noise');
        urlIssues.push({
          severity: issue.severity,
          message: issue.message,
          autoFixable: isNormalizable,
        });
      }

      // Check requiredUtmParams guardrail
      if (guardrails?.requiredUtmParams && guardrails.requiredUtmParams.length > 0) {
        for (const reqParam of guardrails.requiredUtmParams) {
          const normalizedKey = reqParam.toLowerCase();
          const val = audit.params[normalizedKey];
          if (!val || val.trim().length === 0) {
            const alreadyFlagged = urlIssues.some((i) =>
              i.message.toLowerCase().includes(normalizedKey),
            );
            if (!alreadyFlagged) {
              urlIssues.push({
                severity: 'warning',
                message: `Missing required UTM parameter '${normalizedKey}'`,
                autoFixable: false,
              });
            }
          }
        }
      }

      // Check utm_source alignment with target platform (if not already reported by auditUtmUrl)
      const utmSource = audit.params['utm_source'];
      if (utmSource) {
        const allowedAliases = PLATFORM_UTM_SOURCE_ALIASES[platform];
        if (!allowedAliases.includes(utmSource.toLowerCase())) {
          const alreadyFlagged = urlIssues.some(
            (i) =>
              i.message.toLowerCase().includes('utm_source') &&
              (i.message.toLowerCase().includes('mismatch') ||
                i.message.toLowerCase().includes(platform)),
          );
          if (!alreadyFlagged) {
            urlIssues.push({
              severity: 'warning',
              message: `utm_source="${utmSource}" does not match target platform "${platform}"`,
              autoFixable: false,
            });
          }
        }
      }

      if (urlIssues.length > 0) {
        affectedUrls.push(rawUrl);
        aggregatedIssues.push(...urlIssues);
      }
    }

    if (aggregatedIssues.length > 0) {
      let highestSeverity: Severity = 'info';
      let anyAutoFixable = false;
      for (const item of aggregatedIssues) {
        if (severityRank(item.severity) > severityRank(highestSeverity)) {
          highestSeverity = item.severity;
        }
        if (item.autoFixable) {
          anyAutoFixable = true;
        }
      }
      // Ensure UTM hygiene issues surface as at least warning when noise/casing/mismatch occurs
      const finalSeverity: Severity = highestSeverity === 'info' ? 'warning' : highestSeverity;
      const summaryMessages = Array.from(new Set(aggregatedIssues.map((i) => i.message))).slice(0, 4);

      diagnostics.push({
        ruleId: 'attribution/utm-hygiene',
        platform,
        category: 'attribution',
        severity: finalSeverity,
        message: `UTM attribution hygiene issue(s) across ${affectedUrls.length} URL(s): ${summaryMessages.join('; ')}.`,
        fixHint:
          'Use lowercase hyphenated utm_* values, remove click-ID tracking noise (fbclid/gclid), and match utm_source to the target platform.',
        autoFixable: anyAutoFixable,
        evidence: affectedUrls[0],
        specRef: 'GA4 Campaign Attribution Spec',
        penaltyPoints: finalSeverity === 'error' ? 12 : 8,
      });
    }
  }

  // 25. governance/brand-forbidden-terms
  if (guardrails?.forbiddenTerms && guardrails.forbiddenTerms.length > 0) {
    const combinedCopy = [draft.title ?? '', text, draft.firstComment ?? ''].join('\n');
    const matchedForbidden = guardrails.forbiddenTerms.filter((term) =>
      containsTermCaseInsensitive(combinedCopy, term),
    );
    if (matchedForbidden.length > 0) {
      diagnostics.push({
        ruleId: 'governance/brand-forbidden-terms',
        platform,
        category: 'governance',
        severity: 'error',
        message: `Draft contains forbidden brand/compliance term(s): ${matchedForbidden.map((t) => `"${t}"`).join(', ')}.`,
        fixHint: 'Remove or rephrase prohibited terms before publishing to comply with brand/legal guardrails.',
        autoFixable: false,
        evidence: matchedForbidden.join(', '),
        specRef: 'BrandGuardrails.forbiddenTerms',
        penaltyPoints: 25,
      });
    }
  }

  // 26. governance/brand-required-terms
  if (guardrails?.requiredTerms && guardrails.requiredTerms.length > 0) {
    const combinedCopy = [draft.title ?? '', text, draft.firstComment ?? ''].join('\n');
    const missingRequired = guardrails.requiredTerms.filter(
      (term) => !containsTermCaseInsensitive(combinedCopy, term),
    );
    if (missingRequired.length > 0) {
      diagnostics.push({
        ruleId: 'governance/brand-required-terms',
        platform,
        category: 'governance',
        severity: 'warning',
        message: `Draft is missing required brand/disclaimer term(s): ${missingRequired.map((t) => `"${t}"`).join(', ')}.`,
        fixHint: `Include required phrase(s): ${missingRequired.join(', ')}.`,
        autoFixable: false,
        evidence: missingRequired.join(', '),
        specRef: 'BrandGuardrails.requiredTerms',
        penaltyPoints: 10,
      });
    }
  }

  // 27. accessibility/invisible-zero-width-chars
  const invisibleTarget = [draft.title ?? '', text, draft.firstComment ?? ''].join('\n');
  const invisibleFindings = detectInvisibleZeroWidthChars(invisibleTarget);
  if (invisibleFindings.length > 0) {
    const insideToken = /https?:\/\/\S*[\u200B\u200C\uFEFF\u00AD\u2060\u00A0]|#[\p{L}\p{N}_]*[\u200B\u200C\uFEFF\u00AD\u2060\u00A0]/u.test(
      invisibleTarget,
    );
    const hasBidi = invisibleFindings.some((f) => f.label.includes('Bidi'));
    const severeInvisible = insideToken || hasBidi || Boolean(guardrails?.strictAccessibility);
    const sampleCodes = Array.from(new Set(invisibleFindings.map((f) => f.codePoint))).slice(0, 4);
    diagnostics.push({
      ruleId: 'accessibility/invisible-zero-width-chars',
      platform,
      category: 'accessibility',
      severity: severeInvisible ? 'error' : 'warning',
      message: `Detected ${invisibleFindings.length} hidden formatting/control char(s) (${sampleCodes.join(', ')}) commonly copied from rich-text docs, which can break hashtags/links or trigger anti-spam filters.`,
      fixHint: 'Run 1-click Auto-Fix (or strip zero-width spaces, Bidi controls, and non-breaking spaces) while preserving emoji joiners.',
      autoFixable: true,
      evidence: `${invisibleFindings.length} char(s): ${sampleCodes.join(' ')}`,
      specRef: 'Unicode Default Ignorable Hygiene',
      penaltyPoints: severeInvisible ? 18 : 10,
    });
  }

  // 28. governance/unresolved-template-placeholders
  const placeholderSurface = [draft.title ?? '', text, draft.firstComment ?? ''].join('\n');
  const placeholderMatch = UNRESOLVED_PLACEHOLDER_REGEX.exec(placeholderSurface);
  if (placeholderMatch) {
    diagnostics.push({
      ruleId: 'governance/unresolved-template-placeholders',
      platform,
      category: 'governance',
      severity: 'error',
      message: `Unresolved draft template placeholder or local dev URL detected ("${placeholderMatch[0]}").`,
      fixHint: 'Replace template tokens and localhost links with final production copy and HTTPS destinations before scheduling.',
      autoFixable: false,
      evidence: placeholderMatch[0],
      specRef: 'Pre-Publish Release Hygiene Gate',
      penaltyPoints: 25,
    });
  }

  // 29. algorithm/public-url-shortener-risk
  if (uniqueAuditUrls.length > 0) {
    const shutdownLinks: string[] = [];
    const genericShorteners: string[] = [];
    for (const u of uniqueAuditUrls) {
      try {
        const host = new URL(u).hostname.toLowerCase();
        if (SHUTDOWN_DYNAMIC_LINK_HOSTS.has(host) || host.endsWith('.page.link')) {
          shutdownLinks.push(u);
        } else if (PUBLIC_SHORTENER_HOSTS.has(host)) {
          genericShorteners.push(u);
        }
      } catch {
        // Ignore unparseable URLs; utm-hygiene handles malformed URL diagnostics
      }
    }

    if (shutdownLinks.length > 0) {
      diagnostics.push({
        ruleId: 'algorithm/public-url-shortener-risk',
        platform,
        category: 'algorithm',
        severity: 'error',
        message: `Shut-down Firebase Dynamic Link (*.page.link) or goo.gl URL detected (${shutdownLinks[0]}). Google discontinued FDL in August 2025 — links resolve to 404.`,
        fixHint: 'Replace with your canonical HTTPS destination URL or Universal Links / App Links routing.',
        autoFixable: false,
        evidence: shutdownLinks[0],
        specRef: 'Firebase Dynamic Links Aug 2025 Shutdown',
        penaltyPoints: 25,
      });
    } else if (genericShorteners.length > 0) {
      diagnostics.push({
        ruleId: 'algorithm/public-url-shortener-risk',
        platform,
        category: 'algorithm',
        severity: 'warning',
        message: `Generic public URL shortener detected (${genericShorteners[0]}), which triggers automated phishing/spam filters and breaks Open Graph domain branding.`,
        fixHint: 'Replace generic shorteners with direct HTTPS URLs or your own branded custom short domain.',
        autoFixable: false,
        evidence: genericShorteners[0],
        specRef: 'Platform Link Integrity Filters',
        penaltyPoints: 8,
      });
    }
  }

  // 30. algorithm/x-leading-mention-reply-trap
  if (platform === 'x' && /^@[a-zA-Z0-9_]{1,15}\b/.test(text.trimStart())) {
    diagnostics.push({
      ruleId: 'algorithm/x-leading-mention-reply-trap',
      platform,
      category: 'algorithm',
      severity: 'warning',
      message: 'X post starts directly with "@mention" at character 0; replies starting with @handle are hidden from non-mutual followers home timelines.',
      fixHint: 'Lead with natural words before the handle (e.g. "Big launch with @partner...") or use ".@handle" for broadcast reach.',
      autoFixable: false,
      evidence: text.trimStart().slice(0, 28),
      specRef: 'X Reply vs Broadcast Timeline Rule',
      penaltyPoints: 8,
    });
  }

  // 31. accessibility/numeric-only-hashtag
  const numericOnlyTags = counts.hashtags.filter((tag) => /^#[0-9]+$/.test(tag));
  ADJACENT_UNSPACED_HASHTAG_REGEX.lastIndex = 0;
  const adjacentMatches = text.match(ADJACENT_UNSPACED_HASHTAG_REGEX)?.map((m) => m.trim()) ?? [];
  if (numericOnlyTags.length > 0 || adjacentMatches.length > 0) {
    const strictNumericFailure = platform === 'mastodon' || platform === 'bluesky';
    const reasons: string[] = [];
    if (numericOnlyTags.length > 0) {
      reasons.push(
        `numeric-only tag(s) (${numericOnlyTags.join(', ')}) fail to linkify on Mastodon/Bluesky`,
      );
    }
    if (adjacentMatches.length > 0) {
      reasons.push(`unspaced adjacent hashtags (${adjacentMatches.join(', ')}) break tag parsers`);
    }
    diagnostics.push({
      ruleId: 'accessibility/numeric-only-hashtag',
      platform,
      category: 'accessibility',
      severity: strictNumericFailure || adjacentMatches.length > 0 ? 'warning' : 'info',
      message: `Hashtag syntax hazard: ${reasons.join('; ')}.`,
      fixHint: 'Include at least one letter in numeric tags (e.g. #Year2026) and separate adjacent tags with spaces.',
      autoFixable: false,
      evidence: [...numericOnlyTags, ...adjacentMatches].join(' '),
      specRef: 'Mastodon & ATProto Hashtag Grammar',
      penaltyPoints: strictNumericFailure || adjacentMatches.length > 0 ? 6 : 2,
    });
  }

  // 32. governance/schedule-timing-hazard
  if (draft.scheduledAt && draft.scheduledAt.trim().length > 0) {
    const rawSched = draft.scheduledAt.trim();
    const hasExplicitTz = /(?:Z|[+-]\d{2}:\d{2}|[+-]\d{4})$/i.test(rawSched);
    const parsedMs = Date.parse(rawSched);
    if (Number.isNaN(parsedMs)) {
      diagnostics.push({
        ruleId: 'governance/schedule-timing-hazard',
        platform,
        category: 'governance',
        severity: 'error',
        message: `Scheduled timestamp "${rawSched}" is not a valid ISO-8601 date/time.`,
        fixHint: 'Use full ISO-8601 format with explicit offset, e.g. 2026-11-26T09:15:00-05:00 or ...Z.',
        autoFixable: false,
        evidence: rawSched,
        specRef: 'Scheduler Reliability & ISO-8601 Timezone Safety',
        penaltyPoints: 15,
      });
    } else {
      const hazards: string[] = [];
      if (!hasExplicitTz) {
        hazards.push('missing explicit timezone offset (Z or +/-HH:MM) — risks UTC/HQ 3 AM publish drift');
      }
      const timeMatch = /T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(rawSched);
      if (timeMatch) {
        const hh = Number(timeMatch[1]);
        const mm = Number(timeMatch[2]);
        if (mm === 0) {
          hazards.push('lands exactly on top-of-hour :00, colliding with global API 429 burst spikes');
        }
        const dt = new Date(parsedMs);
        const month = dt.getUTCMonth() + 1;
        const dom = dt.getUTCDate();
        const dow = dt.getUTCDay();
        const isDstSundayCandidate =
          dow === 0 &&
          ((month === 3 && ((dom >= 8 && dom <= 14) || dom >= 25)) ||
            (month === 10 && dom >= 25) ||
            (month === 11 && dom <= 7));
        if (isDstSundayCandidate && hh >= 0 && hh <= 4) {
          hazards.push('falls inside an early-morning US/EU Daylight Saving Time switch window (double-fire or skipped slot risk)');
        }
      }
      if (hazards.length > 0) {
        const warnTzOrDst = !hasExplicitTz || hazards.length > 1;
        diagnostics.push({
          ruleId: 'governance/schedule-timing-hazard',
          platform,
          category: 'governance',
          severity: warnTzOrDst ? 'warning' : 'info',
          message: `Schedule timing hazard for "${rawSched}": ${hazards.join('; ')}.`,
          fixHint: 'Include an explicit UTC offset (+/-HH:MM or Z) and jitter minute offsets (e.g. :07 or :23) away from :00 and DST transitions.',
          autoFixable: false,
          evidence: rawSched,
          specRef: 'Scheduler Reliability & Timezone Safety',
          penaltyPoints: warnTzOrDst ? 8 : 2,
        });
      }
    }
  }

  // 33. Delegate to Media & Open Graph validators
  if (draft.media && draft.media.length > 0) {
    diagnostics.push(...validateMediaAttachments(draft.media, platform, publishViaApi));
  }

  if (draft.openGraph) {
    diagnostics.push(...validateOpenGraph(draft.openGraph, platform));
  }

  return diagnostics;
}
