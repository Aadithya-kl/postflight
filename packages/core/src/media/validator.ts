import { getPlatformSpec } from '../specs/registry.js';
import type {
  ContrastResult,
  LintDiagnostic,
  MediaAttachment,
  OpenGraphMeta,
  PlatformId,
} from '../types.js';

const WATERMARK_FILENAME_PATTERN =
  /tiktok|snaptik|capcut|musically|watermark|ig_save|reelsave/i;

const REDUNDANT_ALT_PREFIX_PATTERN =
  /^(image|picture|photo|graphic|screenshot)\s+of\b/i;

const BLUESKY_DECIMAL_LIMIT_BYTES = 2_000_000;
const BLUESKY_LEGACY_WARN_BYTES = 1_000_000;
const LINKEDIN_PDF_MAX_BYTES = 104_857_600; // 100 MiB
const LINKEDIN_PDF_MOBILE_WARN_BYTES = 5_242_880; // 5 MiB
const LINKEDIN_PDF_MAX_PAGES = 300;
const IG_GRAPH_API_MAX_CAROUSEL_ITEMS = 10;
const X_API_DOCUMENTED_MAX_IMAGES = 4;
const BSKY_STANDARD_EMBED_MAX_IMAGES = 4;
const IG_REELS_RECOMMENDATION_CEILING_SEC = 180;
const OG_WHATSAPP_LIMIT_BYTES = 307_200; // 300 KiB
const OG_HARD_LIMIT_BYTES = 5_242_880; // 5 MiB

function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) {
    return `${(bytes / 1_073_741_824).toFixed(2)} GB`;
  }
  if (bytes >= 1_048_576) {
    return `${(bytes / 1_048_576).toFixed(2)} MB`;
  }
  if (bytes >= 1_024) {
    return `${(bytes / 1_024).toFixed(1)} KB`;
  }
  return `${bytes} B`;
}

function parseAspectRatio(value?: string): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  const colonMatch = /^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/.exec(trimmed);
  if (colonMatch) {
    const w = Number(colonMatch[1]);
    const h = Number(colonMatch[2]);
    if (Number.isFinite(w) && Number.isFinite(h) && h > 0) {
      return w / h;
    }
    return null;
  }
  const numeric = Number(trimmed);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric;
  }
  return null;
}

function getAttachmentRatio(item: MediaAttachment): number | null {
  if (
    item.width !== undefined &&
    item.height !== undefined &&
    item.width > 0 &&
    item.height > 0
  ) {
    return item.width / item.height;
  }
  return parseAspectRatio(item.aspectRatio);
}

function formatRatio(ratio: number): string {
  return `${ratio.toFixed(2)}:1`;
}

function attachmentLabel(item: MediaAttachment, index: number): string {
  return item.filename ? `"${item.filename}" (#${index + 1})` : `Attachment #${index + 1}`;
}

export function validateMediaAttachments(
  media: MediaAttachment[],
  platform: PlatformId,
  publishViaApi = false,
): LintDiagnostic[] {
  if (!media || media.length === 0) {
    return [];
  }

  const spec = getPlatformSpec(platform);
  const diagnostics: LintDiagnostic[] = [];

  const images = media.filter((m) => m.type === 'image');
  const videos = media.filter((m) => m.type === 'video');
  const pdfs = media.filter((m) => m.type === 'pdf');

  // 1. Mixed image + video check
  if (images.length > 0 && videos.length > 0 && !spec.media.canMixImagesAndVideo) {
    diagnostics.push({
      ruleId: 'media/mixed-media-unsupported',
      platform,
      category: 'media',
      severity: 'error',
      message: `${spec.name} does not support mixing images and videos in the same post (${images.length} image(s) + ${videos.length} video(s)).`,
      fixHint: `Publish either images only or a single video on ${spec.shortName}.`,
      autoFixable: false,
      evidence: `${images.length} images, ${videos.length} videos`,
      specRef: `${spec.id}.media.canMixImagesAndVideo`,
      penaltyPoints: 20,
    });
  }

  // 2. PDF attachment checks (native document carousels are LinkedIn-only)
  if (pdfs.length > 0 && platform !== 'linkedin') {
    diagnostics.push({
      ruleId: 'media/pdf-unsupported',
      platform,
      category: 'media',
      severity: 'error',
      message: `${spec.name} does not support native PDF document carousels.`,
      fixHint: 'Export PDF slides as JPEG/PNG images for carousel platforms or reserve PDF carousels for LinkedIn.',
      autoFixable: false,
      evidence: `${pdfs.length} PDF attachment(s)`,
      penaltyPoints: 20,
    });
  }

  // 3. Image / carousel item count checks (including IG Graph API 10-item cap)
  if (spec.media.maxImages === 0 && images.length > 0) {
    diagnostics.push({
      ruleId: 'media/images-not-supported',
      platform,
      category: 'media',
      severity: 'error',
      message: `${spec.name} requires video media and does not support standalone image uploads.`,
      fixHint: `Provide a 9:16 vertical video for ${spec.shortName}, or target a feed/photo surface instead.`,
      autoFixable: false,
      evidence: `${images.length} image(s)`,
      specRef: `${spec.id}.media.maxImages`,
      penaltyPoints: 25,
    });
  } else if (
    platform === 'instagram-feed' &&
    publishViaApi &&
    media.length > IG_GRAPH_API_MAX_CAROUSEL_ITEMS
  ) {
    diagnostics.push({
      ruleId: 'media/ig-api-carousel-limit',
      platform,
      category: 'media',
      severity: 'error',
      message: `Instagram Graph API caps carousels at ${IG_GRAPH_API_MAX_CAROUSEL_ITEMS} items (vs ${spec.media.maxImages} natively in-app); found ${media.length} items.`,
      fixHint: 'Trim the carousel to 10 items or fewer for API publishing, or publish 11-20 items manually via the native Instagram app.',
      autoFixable: false,
      evidence: `${media.length} items (publishViaApi=true)`,
      specRef: 'instagram-feed.oauth.gotcha',
      penaltyPoints: 20,
    });
  } else if (spec.media.canMixImagesAndVideo) {
    if (platform === 'x' && publishViaApi) {
      if (images.length > X_API_DOCUMENTED_MAX_IMAGES) {
        diagnostics.push({
          ruleId: 'media/x-api-4-image-cap',
          platform,
          category: 'media',
          severity: 'error',
          message: `Official X POST /2/tweets API docs limit media_ids to ${X_API_DOCUMENTED_MAX_IMAGES} images (native composer expanded to ${spec.media.maxImages}); found ${images.length} images.`,
          fixHint: `Keep API media payloads to <= ${X_API_DOCUMENTED_MAX_IMAGES} images for reliable publishing, or split additional images into a thread reply.`,
          autoFixable: false,
          evidence: `${images.length} images (publishViaApi=true)`,
          specRef: 'x.oauth.gotcha',
          penaltyPoints: 15,
        });
      }
      if (images.length > 0 && videos.length > 0) {
        diagnostics.push({
          ruleId: 'media/x-api-mixed-media-risk',
          platform,
          category: 'media',
          severity: 'warning',
          message: `Mixing images (${images.length}) and video (${videos.length}) in a single X API request is unsupported on many v2 endpoints unless sent natively.`,
          fixHint: 'Separate images and video across consecutive thread posts when scheduling via X API.',
          autoFixable: false,
          evidence: `${images.length} images + ${videos.length} video(s)`,
          specRef: 'x.media.canMixImagesAndVideo',
          penaltyPoints: 8,
        });
      }
    }
    const totalCarouselItems = images.length + videos.length;
    if (totalCarouselItems > spec.media.maxImages) {
      diagnostics.push({
        ruleId: 'media/max-items-exceeded',
        platform,
        category: 'media',
        severity: 'error',
        message: `${spec.name} allows at most ${spec.media.maxImages} media items per post; found ${totalCarouselItems}.`,
        fixHint: `Reduce attachments to ${spec.media.maxImages} or fewer.`,
        autoFixable: false,
        evidence: `${totalCarouselItems} / ${spec.media.maxImages}`,
        specRef: `${spec.id}.media.maxImages`,
        penaltyPoints: 20,
      });
    }
  } else {
    if (platform === 'bluesky' && images.length > BSKY_STANDARD_EMBED_MAX_IMAGES && images.length <= spec.media.maxImages) {
      diagnostics.push({
        ruleId: 'media/bluesky-gallery-required',
        platform,
        category: 'media',
        severity: 'warning',
        message: `Bluesky draft attaches ${images.length} images: standard app.bsky.embed.images caps at ${BSKY_STANDARD_EMBED_MAX_IMAGES} photos (5-${spec.media.maxImages} requires app.bsky.embed.gallery support).`,
        fixHint: 'Limit to 4 photos when publishing through standard ATProto embed.images clients, or target app.bsky.embed.gallery.',
        autoFixable: false,
        evidence: `${images.length} images (>4 app.bsky.embed.images cap)`,
        specRef: 'bluesky.oauth.gotcha',
        penaltyPoints: 8,
      });
    }
    if (images.length > spec.media.maxImages) {
      diagnostics.push({
        ruleId: 'media/max-images-exceeded',
        platform,
        category: 'media',
        severity: 'error',
        message: `${spec.name} allows at most ${spec.media.maxImages} images per post; found ${images.length}.`,
        fixHint: `Reduce image count to ${spec.media.maxImages} or fewer.`,
        autoFixable: false,
        evidence: `${images.length} / ${spec.media.maxImages}`,
        specRef: `${spec.id}.media.maxImages`,
        penaltyPoints: 20,
      });
    }
    if (videos.length > 1) {
      diagnostics.push({
        ruleId: 'media/multiple-videos-unsupported',
        platform,
        category: 'media',
        severity: 'error',
        message: `${spec.name} allows only 1 video per post; found ${videos.length}.`,
        fixHint: 'Merge clips into a single video export or split across separate posts.',
        autoFixable: false,
        evidence: `${videos.length} videos`,
        specRef: `${spec.id}.media.canMixImagesAndVideo`,
        penaltyPoints: 20,
      });
    }
  }

  // 4. Instagram Carousel Slide-1 Aspect Ratio Lock
  if (spec.media.firstSlideLocksRatio && media.length > 1) {
    const firstSlide = media[0];
    const firstRatio = firstSlide ? getAttachmentRatio(firstSlide) : null;
    if (firstRatio !== null) {
      const mismatchedSlides: string[] = [];
      for (let i = 1; i < media.length; i++) {
        const slide = media[i];
        if (!slide) continue;
        const slideRatio = getAttachmentRatio(slide);
        if (slideRatio !== null && Math.abs(slideRatio - firstRatio) > 0.03) {
          mismatchedSlides.push(
            `Slide #${i + 1} (${formatRatio(slideRatio)} vs Slide #1 ${formatRatio(firstRatio)})`,
          );
        }
      }
      if (mismatchedSlides.length > 0) {
        diagnostics.push({
          ruleId: 'media/ig-carousel-aspect-lock',
          platform,
          category: 'media',
          severity: 'warning',
          message: `Instagram locks the entire carousel frame to Slide #1's aspect ratio (${formatRatio(firstRatio)}); mismatched slides will be auto-cropped: ${mismatchedSlides.join(', ')}.`,
          fixHint: 'Export all carousel slides at the exact same aspect ratio (recommended 4:5, 1080x1350) to prevent unexpected crops.',
          autoFixable: false,
          evidence: mismatchedSlides.join('; '),
          specRef: 'instagram-feed.media.firstSlideLocksRatio',
          penaltyPoints: 8,
        });
      }
    }
  }

  // 5. Per-attachment validations
  for (let i = 0; i < media.length; i++) {
    const item = media[i];
    if (!item) continue;
    const label = attachmentLabel(item, i);
    const ratio = getAttachmentRatio(item);

    // 5a. File size caps
    if (item.type === 'image' && item.sizeBytes !== undefined) {
      if (platform === 'bluesky') {
        if (item.sizeBytes > BLUESKY_DECIMAL_LIMIT_BYTES) {
          diagnostics.push({
            ruleId: 'media/bluesky-decimal-byte-limit',
            platform,
            category: 'media',
            severity: 'error',
            message: `${label} is ${item.sizeBytes.toLocaleString('en-US')} bytes, exceeding Bluesky's exact decimal 2,000,000-byte limit (NOT 2 MiB = 2,097,152 bytes).`,
            fixHint: 'Compress or resize the image strictly under 2,000,000 decimal bytes (ideally <= 950 KB for maximum PDS compatibility).',
            autoFixable: false,
            evidence: `${item.sizeBytes} bytes > 2000000`,
            specRef: 'bluesky.media.maxImageSizeBytes',
            penaltyPoints: 20,
          });
        } else if (item.sizeBytes > BLUESKY_LEGACY_WARN_BYTES) {
          diagnostics.push({
            ruleId: 'media/bluesky-legacy-1mb-limit',
            platform,
            category: 'media',
            severity: 'warning',
            message: `${label} is ${item.sizeBytes.toLocaleString('en-US')} bytes (> 1,000,000 bytes). Older AT Protocol PDS servers, third-party clients, and external link-card thumbnails still enforce a 1,000,000-byte ceiling.`,
            fixHint: 'Compress below 1,000,000 bytes if targeting maximum client/PDS compatibility or external embed thumbnails.',
            autoFixable: false,
            evidence: `${item.sizeBytes} bytes > 1000000`,
            specRef: 'bluesky.oauth.gotcha',
            penaltyPoints: 5,
          });
        }
      } else if (
        spec.media.maxImageSizeBytes !== null &&
        item.sizeBytes > spec.media.maxImageSizeBytes
      ) {
        diagnostics.push({
          ruleId: 'media/image-size-limit',
          platform,
          category: 'media',
          severity: 'error',
          message: `${label} (${formatBytes(item.sizeBytes)}) exceeds ${spec.name}'s image size limit of ${formatBytes(spec.media.maxImageSizeBytes)}.`,
          fixHint: `Re-export JPEG/PNG at lower quality or 1080px/1200px width to stay under ${formatBytes(spec.media.maxImageSizeBytes)}.`,
          autoFixable: false,
          evidence: `${item.sizeBytes} > ${spec.media.maxImageSizeBytes}`,
          specRef: `${spec.id}.media.maxImageSizeBytes`,
          penaltyPoints: 20,
        });
      }
    } else if (item.type === 'video' && item.sizeBytes !== undefined) {
      if (
        spec.media.maxVideoSizeBytes !== null &&
        item.sizeBytes > spec.media.maxVideoSizeBytes
      ) {
        diagnostics.push({
          ruleId: 'media/video-size-limit',
          platform,
          category: 'media',
          severity: 'error',
          message: `${label} (${formatBytes(item.sizeBytes)}) exceeds ${spec.name}'s video file size cap of ${formatBytes(spec.media.maxVideoSizeBytes)}.`,
          fixHint: `Transcode video with H.264 VBR targeting <= ${formatBytes(spec.media.maxVideoSizeBytes)}.`,
          autoFixable: false,
          evidence: `${item.sizeBytes} > ${spec.media.maxVideoSizeBytes}`,
          specRef: `${spec.id}.media.maxVideoSizeBytes`,
          penaltyPoints: 20,
        });
      }
    } else if (item.type === 'pdf' && platform === 'linkedin') {
      if (item.sizeBytes !== undefined) {
        if (item.sizeBytes > LINKEDIN_PDF_MAX_BYTES) {
          diagnostics.push({
            ruleId: 'media/pdf-size-limit',
            platform,
            category: 'media',
            severity: 'error',
            message: `${label} (${formatBytes(item.sizeBytes)}) exceeds LinkedIn's 100 MB PDF document carousel limit.`,
            fixHint: 'Optimize embedded images and subset fonts to reduce PDF size below 100 MB (ideally < 5 MB).',
            autoFixable: false,
            evidence: `${item.sizeBytes} > ${LINKEDIN_PDF_MAX_BYTES}`,
            penaltyPoints: 20,
          });
        } else if (item.sizeBytes > LINKEDIN_PDF_MOBILE_WARN_BYTES) {
          diagnostics.push({
            ruleId: 'media/pdf-mobile-render-slow',
            platform,
            category: 'media',
            severity: 'warning',
            message: `${label} (${formatBytes(item.sizeBytes)}) exceeds 5 MB; heavy LinkedIn PDF carousels render slowly on mobile feeds and hurt swipe-through dwell time.`,
            fixHint: 'Compress slide images and flatten vectors to keep PDF carousels under 5 MB.',
            autoFixable: false,
            evidence: `${formatBytes(item.sizeBytes)} > 5 MB`,
            penaltyPoints: 5,
          });
        }
      }
      if (item.pages !== undefined && item.pages > LINKEDIN_PDF_MAX_PAGES) {
        diagnostics.push({
          ruleId: 'media/pdf-page-limit',
          platform,
          category: 'media',
          severity: 'error',
          message: `${label} has ${item.pages} pages, exceeding LinkedIn's 300-page document carousel cap.`,
          fixHint: 'Trim document to <= 300 pages (5-12 slides is optimal for completion rate).',
          autoFixable: false,
          evidence: `${item.pages} pages`,
          penaltyPoints: 20,
        });
      }
    }

    // 5b. Instagram Graph API 3:4 rejection trap (Error 36003)
    if (platform === 'instagram-feed' && publishViaApi && ratio !== null) {
      if (ratio < 0.795) {
        diagnostics.push({
          ruleId: 'media/ig-api-aspect-ratio-36003',
          platform,
          category: 'media',
          severity: 'error',
          message: `${label} aspect ratio (${formatRatio(ratio)}) is narrower than 4:5 (0.80) and will be rejected by Instagram Graph API with Error 36003 (3:4 native grid ratio 0.75 is API-unsupported).`,
          fixHint: 'Export at 4:5 (1080x1350) with key visual content centered inside the inner 1012x1350 (3:4 profile grid) safe box (34px left/right margin).',
          autoFixable: false,
          evidence: `ratio=${ratio.toFixed(3)} (< 0.80)`,
          specRef: 'instagram-feed.oauth.gotcha',
          penaltyPoints: 20,
        });
      } else if (ratio > 1.92) {
        diagnostics.push({
          ruleId: 'media/ig-api-aspect-ratio-36003',
          platform,
          category: 'media',
          severity: 'error',
          message: `${label} aspect ratio (${formatRatio(ratio)}) exceeds Instagram Graph API's 1.91:1 maximum width and will fail with Error 36003.`,
          fixHint: 'Crop or pad media to stay within 4:5 (0.80) through 1.91:1.',
          autoFixable: false,
          evidence: `ratio=${ratio.toFixed(3)} (> 1.91)`,
          specRef: 'instagram-feed.oauth.gotcha',
          penaltyPoints: 20,
        });
      }
    }

    // 5c. YouTube Shorts 16:9 landscape misclassification trap
    if (platform === 'youtube-shorts' && item.type === 'video') {
      const isLandscape =
        (item.width !== undefined &&
          item.height !== undefined &&
          item.width > item.height) ||
        (ratio !== null && ratio > 1.01);
      if (isLandscape) {
        diagnostics.push({
          ruleId: 'media/yt-shorts-landscape-misclassification',
          platform,
          category: 'media',
          severity: 'error',
          message: `${label} is landscape (width > height); YouTube will silently classify it as a standard long-form video instead of a YouTube Short.`,
          fixHint: 'Export vertical 9:16 (1080x1920) or square 1:1 (1080x1080) with duration <= 180s so YouTube ingests it into the Shorts feed.',
          autoFixable: false,
          evidence:
            item.width && item.height
              ? `${item.width}x${item.height}`
              : item.aspectRatio ?? 'landscape',
          specRef: 'youtube-shorts.oauth.gotcha',
          penaltyPoints: 25,
        });
      }
    }

    // 5d. Video duration limits & IG Reels 180s discovery ceiling
    if (item.type === 'video' && item.durationSec !== undefined) {
      if (
        spec.media.maxVideoDurationSec !== null &&
        item.durationSec > spec.media.maxVideoDurationSec
      ) {
        diagnostics.push({
          ruleId: 'media/video-duration-limit',
          platform,
          category: 'media',
          severity: 'error',
          message: `${label} duration (${item.durationSec}s) exceeds ${spec.name}'s maximum of ${spec.media.maxVideoDurationSec}s.`,
          fixHint: `Trim video to <= ${spec.media.maxVideoDurationSec}s before publishing to ${spec.shortName}.`,
          autoFixable: false,
          evidence: `${item.durationSec}s > ${spec.media.maxVideoDurationSec}s`,
          specRef: `${spec.id}.media.maxVideoDurationSec`,
          penaltyPoints: 20,
        });
      } else if (
        platform === 'instagram-reels' &&
        item.durationSec > IG_REELS_RECOMMENDATION_CEILING_SEC
      ) {
        diagnostics.push({
          ruleId: 'media/ig-reels-recommendation-ceiling',
          platform,
          category: 'media',
          severity: 'warning',
          message: `${label} is ${item.durationSec}s long (> 180s). Instagram Reels longer than 3 minutes lose eligibility for non-follower recommendation feeds.`,
          fixHint: 'Tighten the cut to <= 180 seconds (ideally 30-90s) to retain Explore/Reels discovery distribution.',
          autoFixable: false,
          evidence: `${item.durationSec}s > 180s`,
          specRef: 'instagram-reels.media.recommendedVideoDurationSec',
          penaltyPoints: 8,
        });
      }
    }

    // 5e. Competitor watermark filename trap
    if (
      spec.media.watermarkPenalized &&
      item.filename &&
      WATERMARK_FILENAME_PATTERN.test(item.filename)
    ) {
      diagnostics.push({
        ruleId: 'media/competitor-watermark',
        platform,
        category: 'media',
        severity: 'error',
        message: `${label} matches a competitor/downloader watermark filename pattern; ${spec.name} suppresses videos carrying rival platform watermarks.`,
        fixHint: 'Export clean master footage directly from your NLE without TikTok, CapCut, or downloader watermarks and rename the file cleanly.',
        autoFixable: false,
        evidence: item.filename,
        specRef: `${spec.id}.media.watermarkPenalized`,
        penaltyPoints: 25,
      });
    }

    // 5f. Transcoding traps (HDR, VFR, Chroma subsampling, C2PA)
    if (item.isHdr === true) {
      diagnostics.push({
        ruleId: 'media/hdr-washout-risk',
        platform,
        category: 'media',
        severity: 'warning',
        message: `${label} is flagged as 10-bit HDR (HLG/PQ/Dolby Vision), which frequently washes out or clips highlights after social platform SDR transcoding.`,
        fixHint: 'Tone-map and convert to 8-bit Rec.709 SDR (yuv420p) before upload using FFmpeg zscale/tonemap.',
        autoFixable: false,
        evidence: 'isHdr=true',
        penaltyPoints: 8,
      });
    }

    if (item.isVfr === true) {
      diagnostics.push({
        ruleId: 'media/vfr-audio-desync',
        platform,
        category: 'media',
        severity: 'warning',
        message: `${label} uses Variable Frame Rate (VFR), which causes frame stutter and audio/video desync on social ingestion pipelines.`,
        fixHint: 'Re-encode to Constant Frame Rate (CFR 30fps or 60fps via -vsync cfr -r 30).',
        autoFixable: false,
        evidence: 'isVfr=true',
        penaltyPoints: 8,
      });
    }

    if (
      item.chromaSubsampling !== undefined &&
      item.chromaSubsampling !== '4:2:0'
    ) {
      diagnostics.push({
        ruleId: 'media/chroma-subsampling-bleed',
        platform,
        category: 'media',
        severity: 'warning',
        message: `${label} uses ${item.chromaSubsampling} chroma subsampling, risking text color bleeding or container rejection on social decoders.`,
        fixHint: 'Convert pixel format to 4:2:0 (-pix_fmt yuv420p) for universal playback and Graph API compatibility.',
        autoFixable: false,
        evidence: `chromaSubsampling=${item.chromaSubsampling}`,
        penaltyPoints: 6,
      });
    }

    if (item.hasC2paMetadata === true) {
      diagnostics.push({
        ruleId: 'media/c2pa-ai-label-trigger',
        platform,
        category: 'media',
        severity: 'warning',
        message: `${label} contains C2PA Content Credentials metadata; Meta (Instagram/Threads) and TikTok may auto-apply an "AI info" / "Made with AI" label even after minor Photoshop Generative Fill retouching.`,
        fixHint: 'Verify whether an AI disclosure badge is desired; review C2PA provenance metadata before export if only minor non-generative edits were made.',
        autoFixable: false,
        evidence: 'hasC2paMetadata=true',
        penaltyPoints: 5,
      });
    }

    // 5g. Accessibility Alt Text (WCAG 1.1.1)
    if (spec.altText.supported && (item.type === 'image' || item.type === 'pdf')) {
      const alt = item.altText?.trim() ?? '';
      if (alt.length === 0) {
        diagnostics.push({
          ruleId: 'accessibility/missing-alt-text',
          platform,
          category: 'accessibility',
          severity: 'error',
          message: `${label} is missing alt text (WCAG 1.1.1 Non-text Content) on ${spec.name}.`,
          fixHint: `Add concise, descriptive alt text (<= ${spec.altText.recommendedMax ?? spec.altText.maxChars ?? 300} chars recommended) describing key subjects and any embedded text.`,
          autoFixable: false,
          evidence: label,
          specRef: `${spec.id}.altText`,
          penaltyPoints: 15,
        });
      } else {
        if (REDUNDANT_ALT_PREFIX_PATTERN.test(alt)) {
          diagnostics.push({
            ruleId: 'accessibility/redundant-alt-prefix',
            platform,
            category: 'accessibility',
            severity: 'warning',
            message: `${label} alt text begins with a redundant prefix ("image of", "photo of", etc.); screen readers already announce the media role.`,
            fixHint: 'Remove the leading "Image/Photo/Graphic/Screenshot of" phrase and lead directly with the subject.',
            autoFixable: true,
            evidence: alt.slice(0, 48),
            specRef: 'WCAG 1.1.1',
            penaltyPoints: 3,
          });
        }

        if (spec.altText.maxChars !== null && alt.length > spec.altText.maxChars) {
          diagnostics.push({
            ruleId: 'accessibility/alt-text-limit',
            platform,
            category: 'accessibility',
            severity: 'error',
            message: `${label} alt text is ${alt.length} chars, exceeding ${spec.name}'s hard limit of ${spec.altText.maxChars} chars.`,
            fixHint: `Shorten alt text to <= ${spec.altText.maxChars} characters (recommended <= ${spec.altText.recommendedMax ?? 300}).`,
            autoFixable: false,
            evidence: `${alt.length} / ${spec.altText.maxChars}`,
            specRef: `${spec.id}.altText.maxChars`,
            penaltyPoints: 12,
          });
        }
      }
    }
  }

  return diagnostics;
}

export function validateOpenGraph(
  og: OpenGraphMeta,
  platform: PlatformId,
): LintDiagnostic[] {
  const diagnostics: LintDiagnostic[] = [];
  const title = og.title?.trim() ?? '';
  const description = og.description?.trim() ?? '';

  // 1. Title & Description presence / length
  if (!title) {
    diagnostics.push({
      ruleId: 'media/og-missing-title',
      platform,
      category: 'media',
      severity: 'error',
      message: 'Missing og:title metadata; link preview cards will fall back to raw URLs or broken page titles.',
      fixHint: 'Add a clear <meta property="og:title" content="..." /> (under 70 chars for X compatibility).',
      autoFixable: false,
      penaltyPoints: 12,
    });
  } else if (platform === 'x' && title.length > 70) {
    diagnostics.push({
      ruleId: 'media/og-title-too-long',
      platform,
      category: 'media',
      severity: 'warning',
      message: `og:title is ${title.length} chars; X link cards truncate titles beyond 70 characters.`,
      fixHint: 'Tighten og:title to <= 70 characters so the core takeaway stays visible.',
      autoFixable: false,
      evidence: `${title.length} / 70 chars`,
      penaltyPoints: 5,
    });
  }

  if (!description) {
    diagnostics.push({
      ruleId: 'media/og-missing-description',
      platform,
      category: 'media',
      severity: 'warning',
      message: 'Missing og:description metadata; link preview cards may pull boilerplate navigation text.',
      fixHint: 'Add a concise <meta property="og:description" content="..." /> (<= 200 chars).',
      autoFixable: false,
      penaltyPoints: 5,
    });
  } else if (platform === 'x' && description.length > 200) {
    diagnostics.push({
      ruleId: 'media/og-description-too-long',
      platform,
      category: 'media',
      severity: 'warning',
      message: `og:description is ${description.length} chars; X truncates card descriptions beyond 200 characters.`,
      fixHint: 'Trim og:description to <= 200 characters.',
      autoFixable: false,
      evidence: `${description.length} / 200 chars`,
      penaltyPoints: 4,
    });
  }

  // 2. Dimensions & Aspect Ratio checks
  if (
    og.imageWidth !== undefined &&
    og.imageHeight !== undefined &&
    og.imageWidth > 0 &&
    og.imageHeight > 0
  ) {
    if (og.imageWidth < 600 || og.imageHeight < 315) {
      diagnostics.push({
        ruleId: 'media/og-image-too-small',
        platform,
        category: 'media',
        severity: 'error',
        message: `og:image dimensions (${og.imageWidth}x${og.imageHeight}) are below the 600x315 minimum; link cards collapse into tiny thumbnails or fail to render.`,
        fixHint: 'Export og:image at 1200x630 (1.91:1) for reliable large-card rendering across platforms.',
        autoFixable: false,
        evidence: `${og.imageWidth}x${og.imageHeight}`,
        penaltyPoints: 15,
      });
    } else if (
      platform === 'linkedin' &&
      (og.imageWidth < 1200 || og.imageHeight < 627)
    ) {
      diagnostics.push({
        ruleId: 'media/og-linkedin-small-thumbnail',
        platform,
        category: 'media',
        severity: 'warning',
        message: `og:image (${og.imageWidth}x${og.imageHeight}) is smaller than LinkedIn's 1200x627 large-card threshold and will drop to a small side thumbnail.`,
        fixHint: 'Upscale/export og:image at 1200x630 (or >= 1200x627) to preserve full-width LinkedIn card previews.',
        autoFixable: false,
        evidence: `${og.imageWidth}x${og.imageHeight}`,
        penaltyPoints: 8,
      });
    }

    if (platform === 'x') {
      const ratio = og.imageWidth / og.imageHeight;
      if (Math.abs(ratio - 1.91) > 0.12 && Math.abs(ratio - 2.0) > 0.05) {
        diagnostics.push({
          ruleId: 'media/og-x-aspect-crop',
          platform,
          category: 'media',
          severity: 'warning',
          message: `og:image aspect ratio (${formatRatio(ratio)}) deviates from 1.91:1 / 2:1; X summary_large_image crops strictly to 2:1 (1200x600), cutting off top/bottom or edge elements.`,
          fixHint: 'Export a 1200x630 (1.91:1) or 1200x600 (2:1) card keeping text and logos inside a 15px top/bottom safe buffer.',
          autoFixable: false,
          evidence: `${og.imageWidth}x${og.imageHeight} (${formatRatio(ratio)})`,
          specRef: 'x.safeZones.ogCard',
          penaltyPoints: 6,
        });
      }
    }
  }

  // 3. WhatsApp / iMessage 300 KB silent drop & 5 MB hard cap
  if (og.imageSizeBytes !== undefined) {
    if (og.imageSizeBytes > OG_HARD_LIMIT_BYTES) {
      diagnostics.push({
        ruleId: 'media/og-image-over-5mb',
        platform,
        category: 'media',
        severity: 'error',
        message: `og:image (${formatBytes(og.imageSizeBytes)}) exceeds the 5 MB social crawler cap and will fail to display in preview cards.`,
        fixHint: 'Compress og:image as progressive JPEG/PNG under 300 KB (strictly < 5 MB).',
        autoFixable: false,
        evidence: `${og.imageSizeBytes} bytes`,
        penaltyPoints: 15,
      });
    } else if (og.imageSizeBytes > OG_WHATSAPP_LIMIT_BYTES) {
      diagnostics.push({
        ruleId: 'media/og-whatsapp-300kb-drop',
        platform,
        category: 'media',
        severity: 'warning',
        message: `og:image (${formatBytes(og.imageSizeBytes)}) exceeds 300 KB (307,200 bytes); WhatsApp and iMessage dark-social previews silently drop images above 300 KB.`,
        fixHint: 'Optimize og:image JPEG/PNG strictly under 300 KB so shared links preserve rich previews in messaging apps.',
        autoFixable: false,
        evidence: `${og.imageSizeBytes} > 307200`,
        penaltyPoints: 6,
      });
    }
  }

  // 4. Image format checks
  if (og.imageFormat === 'svg') {
    diagnostics.push({
      ruleId: 'media/og-svg-unsupported',
      platform,
      category: 'media',
      severity: 'error',
      message: 'SVG is rejected as an og:image format by X, LinkedIn, Meta, Slack, and iMessage crawlers.',
      fixHint: 'Rasterize your Open Graph card to JPEG or PNG (1200x630, < 300 KB).',
      autoFixable: false,
      evidence: 'imageFormat=svg',
      penaltyPoints: 15,
    });
  } else if (og.imageFormat === 'webp' || og.imageFormat === 'avif') {
    diagnostics.push({
      ruleId: 'media/og-legacy-format-risk',
      platform,
      category: 'media',
      severity: 'warning',
      message: `${og.imageFormat.toUpperCase()} Open Graph images break or fail silently on legacy link crawlers (WhatsApp, iMessage, older enterprise unfurlers).`,
      fixHint: 'Serve JPEG or PNG for og:image metadata while keeping WebP/AVIF for in-page rendering.',
      autoFixable: false,
      evidence: `imageFormat=${og.imageFormat}`,
      penaltyPoints: 6,
    });
  }

  // 5. X twitter:card check
  if (platform === 'x' && og.twitterCard !== 'summary_large_image') {
    diagnostics.push({
      ruleId: 'media/og-twitter-card-missing',
      platform,
      category: 'media',
      severity: 'warning',
      message: `twitter:card is "${og.twitterCard ?? 'missing'}" instead of "summary_large_image"; X will render a small square thumbnail or omit the large card.`,
      fixHint: 'Add <meta name="twitter:card" content="summary_large_image" /> to the page <head>.',
      autoFixable: false,
      evidence: `twitterCard=${og.twitterCard ?? 'undefined'}`,
      penaltyPoints: 5,
    });
  }

  // 6. Non-HTTPS URL check + cache-busting tip
  if (og.url !== undefined && og.url.trim().length > 0) {
    const trimmedUrl = og.url.trim();
    if (!trimmedUrl.toLowerCase().startsWith('https://')) {
      diagnostics.push({
        ruleId: 'media/og-non-https-url',
        platform,
        category: 'media',
        severity: 'error',
        message: 'Open Graph URL does not use HTTPS; modern social crawlers reject or downgrade insecure http:// preview metadata.',
        fixHint: 'Switch og:url and og:image to https:// with valid TLS certificates.',
        autoFixable: false,
        evidence: trimmedUrl,
        penaltyPoints: 12,
      });
    }

    if (!/[?&]v=[^&]+/i.test(trimmedUrl)) {
      diagnostics.push({
        ruleId: 'media/og-cache-bust-tip',
        platform,
        category: 'media',
        severity: 'info',
        message: 'Open Graph URL has no version query string; social crawlers aggressively cache OG previews for days after updates.',
        fixHint: 'Append a cache-busting version param (e.g. ?v=2026a or ?v=<hash>) to og:image URLs whenever updating creative assets.',
        autoFixable: false,
        evidence: trimmedUrl,
        penaltyPoints: 0,
      });
    }
  }

  return diagnostics;
}

function parseHexColor(hex: string): { r: number; g: number; b: number; normalized: string } {
  const cleaned = hex.trim().replace(/^#/, '');
  let expanded: string;
  if (/^[0-9a-fA-F]{3}$/.test(cleaned)) {
    const c0 = cleaned[0] ?? '0';
    const c1 = cleaned[1] ?? '0';
    const c2 = cleaned[2] ?? '0';
    expanded = `${c0}${c0}${c1}${c1}${c2}${c2}`;
  } else if (/^[0-9a-fA-F]{6}$/.test(cleaned)) {
    expanded = cleaned;
  } else {
    throw new Error(`Invalid hex color "${hex}". Expected 3-digit (#RGB) or 6-digit (#RRGGBB) hex.`);
  }

  const r = parseInt(expanded.slice(0, 2), 16);
  const g = parseInt(expanded.slice(2, 4), 16);
  const b = parseInt(expanded.slice(4, 6), 16);

  return {
    r,
    g,
    b,
    normalized: `#${expanded.toUpperCase()}`,
  };
}

function linearizeSrgbChannel(channel8Bit: number): number {
  const srgb = channel8Bit / 255;
  return srgb <= 0.04045 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
}

function relativeLuminance(r: number, g: number, b: number): number {
  const R = linearizeSrgbChannel(r);
  const G = linearizeSrgbChannel(g);
  const B = linearizeSrgbChannel(b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

export function calculateContrastRatio(
  foregroundHex: string,
  backgroundHex: string,
): ContrastResult {
  const fg = parseHexColor(foregroundHex);
  const bg = parseHexColor(backgroundHex);

  const lFg = relativeLuminance(fg.r, fg.g, fg.b);
  const lBg = relativeLuminance(bg.r, bg.g, bg.b);

  const l1 = Math.max(lFg, lBg);
  const l2 = Math.min(lFg, lBg);

  const rawRatio = (l1 + 0.05) / (l2 + 0.05);
  const ratio = Math.round(rawRatio * 100) / 100;

  const aaNormal = rawRatio >= 4.5;
  const aaLarge = rawRatio >= 3.0;
  const aaNonText = rawRatio >= 3.0;
  const aaaNormal = rawRatio >= 7.0;
  const aaaLarge = rawRatio >= 4.5;

  let recommendation: string;
  if (aaaNormal) {
    recommendation = `Passes WCAG 2.2 AAA for all text sizes (${ratio}:1). Excellent legibility on social graphics and mobile overlays.`;
  } else if (aaNormal) {
    recommendation = `Passes WCAG 2.2 AA for normal text and AAA for large text (${ratio}:1). Safe for carousel body copy and captions.`;
  } else if (aaLarge) {
    recommendation = `Passes WCAG 2.2 AA ONLY for large text (>=18pt / 14pt bold) and non-text UI (${ratio}:1). Increase contrast to >=4.5:1 before using for small caption text.`;
  } else {
    recommendation = `Fails WCAG 2.2 AA contrast (${ratio}:1 < 3.0:1). Darken foreground or lighten background (or add a semi-opaque dark scrim behind overlay captions).`;
  }

  return {
    foreground: fg.normalized,
    background: bg.normalized,
    ratio,
    aaNormal,
    aaLarge,
    aaNonText,
    aaaNormal,
    aaaLarge,
    recommendation,
  };
}
