export type PlatformId =
  | 'x'
  | 'linkedin'
  | 'instagram-feed'
  | 'instagram-reels'
  | 'tiktok'
  | 'youtube-shorts'
  | 'threads'
  | 'bluesky'
  | 'mastodon';

export type CountingAlgorithm =
  | 'x-weighted'
  | 'utf16'
  | 'standard'
  | 'threads-emoji-utf8'
  | 'bluesky-dual'
  | 'mastodon';

export type Severity = 'error' | 'warning' | 'info';

export type RuleCategory =
  | 'limits'
  | 'fold'
  | 'algorithm'
  | 'compliance'
  | 'accessibility'
  | 'media'
  | 'attribution'
  | 'governance';

export type DisclosureJurisdiction = 'ftc' | 'asa-uk' | 'dfa-eu' | 'both' | 'all';

export interface SafeZoneRegion {
  canvas: { width: number; height: number };
  top: number;
  bottom: number;
  left: number;
  right: number;
  lowerRight?: { startY: number; right: number };
  label: string;
}

export interface PlatformSpec {
  id: PlatformId;
  name: string;
  shortName: string;
  specVersion: string;
  lastVerified: string;
  counting: {
    algorithm: CountingAlgorithm;
    hardLimit: number;
    apiHardLimit: number | null;
    premiumLimit: number | null;
    maxBytes: number | null;
    urlWeight: number | null;
    firstCommentLimit: number | null;
    forbiddenChars: string[];
    notes: string;
  };
  folds: {
    mobileChars: number | null;
    mobileLines: number | null;
    mobileCharsWithMedia: number | null;
    mobileLinesWithMedia: number | null;
    desktopChars: number | null;
    desktopLines: number | null;
    desktopCharsWithMedia: number | null;
    desktopLinesWithMedia: number | null;
    blankLinesCountAsLines: boolean;
    foldLabel: string;
    ftcMaxMobileChars: number;
  };
  hashtags: {
    hardCap: number | null;
    recommendedMin: number;
    recommendedMax: number;
    style: 'standard' | 'topic-tag' | 'pascal-case-preferred';
    excessBehavior: string;
    notes: string;
  };
  links: {
    clickableInBody: boolean;
    bodyPenaltyRisk: 'none' | 'low' | 'moderate' | 'high';
    firstCommentSafe: boolean;
    maxUniqueUrlsApi: number | null;
    recommendedStrategy: string;
    notes: string;
  };
  altText: {
    supported: boolean;
    maxChars: number | null;
    recommendedMax: number | null;
  };
  media: {
    maxImages: number;
    maxImageSizeBytes: number | null;
    maxVideoSizeBytes: number | null;
    maxVideoDurationSec: number | null;
    recommendedVideoDurationSec: number | null;
    canMixImagesAndVideo: boolean;
    aspectRatios: string[];
    recommendedCanvas: { width: number; height: number } | null;
    profileGridCrop: {
      feedCanvas: string;
      gridRatio: string;
      innerSafeWidth: number;
      innerSafeHeight: number;
      sideCropPx: number;
    } | null;
    watermarkPenalized: boolean;
    firstSlideLocksRatio: boolean;
  };
  safeZones: Record<string, SafeZoneRegion>;
  oauth: {
    accessTokenTtlHours: number | null;
    refreshTokenTtlDays: number | null;
    supportsProgrammaticRefresh: boolean;
    rotationRaceRisk: boolean;
    gotcha: string;
  } | null;
  sources: string[];
}

export interface MediaAttachment {
  type: 'image' | 'video' | 'pdf';
  filename?: string;
  altText?: string;
  width?: number;
  height?: number;
  sizeBytes?: number;
  durationSec?: number;
  pages?: number;
  fps?: number;
  isHdr?: boolean;
  isVfr?: boolean;
  chromaSubsampling?: '4:2:0' | '4:2:2' | '4:4:4';
  hasC2paMetadata?: boolean;
  aspectRatio?: string;
}

export interface OpenGraphMeta {
  url?: string;
  title?: string;
  description?: string;
  imageWidth?: number;
  imageHeight?: number;
  imageSizeBytes?: number;
  imageFormat?: 'jpeg' | 'png' | 'webp' | 'avif' | 'svg' | 'gif';
  twitterCard?: 'summary' | 'summary_large_image' | 'none';
}

export interface BrandGuardrails {
  brandName?: string;
  forbiddenTerms?: string[];
  requiredTerms?: string[];
  requiredUtmParams?: string[];
  expectedUtmMedium?: string;
  expectedCampaign?: string;
  disclosureJurisdiction?: DisclosureJurisdiction;
  flagAiSlop?: boolean;
  strictAccessibility?: boolean;
  allowExternalLinks?: boolean;
  useApiLimits?: boolean;
  xPremium?: boolean;
  mastodonMaxChars?: number;
}

export interface SocialDraft {
  id?: string;
  text: string;
  title?: string;
  firstComment?: string;
  contentWarning?: string;
  isSponsored?: boolean;
  isAiGenerated?: boolean;
  media?: MediaAttachment[];
  openGraph?: OpenGraphMeta;
  publishViaApi?: boolean;
  scheduledAt?: string;
}

export interface BlueskyFacet {
  index: { byteStart: number; byteEnd: number };
  features: Array<
    | { $type: 'app.bsky.richtext.facet#link'; uri: string }
    | { $type: 'app.bsky.richtext.facet#tag'; tag: string }
    | { $type: 'app.bsky.richtext.facet#mention'; handle: string }
  >;
}

export interface CountResult {
  platform: PlatformId;
  algorithm: CountingAlgorithm;
  count: number;
  hardLimit: number;
  apiHardLimit: number | null;
  effectiveLimit: number;
  remaining: number;
  overLimit: boolean;
  overApiLimit: boolean;
  utf8Bytes: number;
  maxBytes: number | null;
  overByteLimit: boolean;
  graphemes: number;
  urlCount: number;
  uniqueUrls: string[];
  hashtagCount: number;
  hashtags: string[];
  facets?: BlueskyFacet[];
  breakdown: string;
}

export interface FoldPreview {
  surface: 'mobile' | 'desktop';
  truncated: boolean;
  visibleText: string;
  hiddenText: string;
  visibleChars: number;
  visibleLines: number;
  charLimit: number | null;
  lineLimit: number | null;
  foldLabel: string;
  blankLinesConsumed: number;
  reason: 'none' | 'char-limit' | 'line-limit' | 'both';
}

export interface PlatformFoldSimulation {
  platform: PlatformId;
  hasMedia: boolean;
  mobile: FoldPreview;
  desktop: FoldPreview;
}

export interface LintDiagnostic {
  ruleId: string;
  platform: PlatformId;
  category: RuleCategory;
  severity: Severity;
  message: string;
  fixHint: string;
  autoFixable: boolean;
  evidence?: string;
  specRef?: string;
  penaltyPoints: number;
}

export interface PlatformLintReport {
  platform: PlatformId;
  platformName: string;
  score: number;
  grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
  passed: boolean;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  counts: CountResult;
  folds: PlatformFoldSimulation;
  diagnostics: LintDiagnostic[];
}

export interface PreFlightReport {
  timestamp: string;
  overallScore: number;
  overallGrade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
  passed: boolean;
  totalErrors: number;
  totalWarnings: number;
  totalInfos: number;
  platforms: PlatformLintReport[];
  autoFixPreview?: AutoFixResult;
}

export interface AutoFixResult {
  originalText: string;
  fixedText: string;
  changed: boolean;
  appliedFixes: string[];
}

export type SafeZonePresetId =
  | 'tiktok-organic'
  | 'tiktok-ad'
  | 'tiktok-ad-strict'
  | 'instagram-reels-organic'
  | 'instagram-reels-ad'
  | 'instagram-reels-to-grid'
  | 'youtube-shorts-organic'
  | 'youtube-shorts-ad'
  | 'universal-organic'
  | 'universal-ad-safe'
  | 'instagram-feed-to-grid'
  | 'linkedin-pdf-carousel'
  | 'x-og-card'
  | 'x-grid-2'
  | 'x-grid-3'
  | 'x-grid-4';

export interface BoundingBox {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SafeZoneCollision {
  boxId: string;
  boxLabel: string;
  collides: boolean;
  overlapAreaPx: number;
  overlapPercent: number;
  violatedEdges: Array<'top' | 'bottom' | 'left' | 'right' | 'lower-right-notch'>;
  recommendation: string;
}

export interface SafeZoneAnalysis {
  presetId: SafeZonePresetId;
  presetName: string;
  canvas: { width: number; height: number };
  safeRect: { x: number; y: number; width: number; height: number };
  deadZones: {
    top: number;
    bottom: number;
    left: number;
    right: number;
    lowerRight?: { startY: number; right: number };
  };
  safeAreaPercent: number;
  allClear: boolean;
  collisions: SafeZoneCollision[];
}

export interface CanonicalPostDocument {
  frontmatter: {
    id?: string;
    title?: string;
    campaign?: string;
    url?: string;
    targets?: PlatformId[];
    hashtags?: string[];
    sponsored?: boolean;
    aiGenerated?: boolean;
    dmKeyword?: string;
    firstComment?: string;
    contentWarning?: string;
    media?: MediaAttachment[];
  };
  body: string;
  hook: string;
  paragraphs: string[];
}

export interface CompiledPlatformArtifact {
  platform: PlatformId;
  platformName: string;
  posts: string[];
  firstComment?: string;
  facets?: BlueskyFacet[][];
  utmUrl?: string;
  dmFunnelNote?: string;
  lintSummary: {
    score: number;
    errors: number;
    warnings: number;
  };
  adaptationsApplied: string[];
}

export interface CompilationBundle {
  sourceId: string;
  compiledAt: string;
  artifacts: CompiledPlatformArtifact[];
}

export interface UtmAuditResult {
  originalUrl: string;
  validUrl: boolean;
  normalizedUrl: string;
  issues: Array<{
    code: string;
    severity: Severity;
    message: string;
  }>;
  params: Record<string, string>;
  hasClickIdNoise: boolean;
  darkSocialRiskNote: string;
}

export interface ContrastResult {
  foreground: string;
  background: string;
  ratio: number;
  aaNormal: boolean;
  aaLarge: boolean;
  aaNonText: boolean;
  aaaNormal: boolean;
  aaaLarge: boolean;
  recommendation: string;
}

export interface FfmpegCommandResult {
  platform: PlatformId;
  command: string;
  targetSpecs: {
    resolution: string;
    codec: string;
    pixelFormat: string;
    colorSpace: string;
    fps: number;
    videoBitrate: string;
    audioLoudness: string;
    faststart: boolean;
  };
  warningsAddressed: string[];
}

export interface DuplicateCheckInput {
  id: string;
  text: string;
  platform?: PlatformId;
  publishedAt?: string;
}

export interface DuplicateCollision {
  draftA: string;
  draftB: string;
  exactMatch: boolean;
  jaccardSimilarity: number;
  risk: 'critical' | 'high' | 'moderate';
  hoursApart?: number;
  cannibalizationWarning?: string;
  recommendation: string;
}

export interface CommentItem {
  id: string;
  author: string;
  platform: PlatformId;
  text: string;
  timestamp?: string;
  postId?: string;
}

export type CommentIntent = 'buyer-intent' | 'crisis-urgent' | 'support' | 'feedback' | 'community' | 'bot-noise';

export interface TriagedComment {
  comment: CommentItem;
  intent: CommentIntent;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  score: number;
  matchedSignals: string[];
  recommendedSlaMinutes: number;
  complianceFlag?: string;
  suggestedAction: string;
}

export interface OAuthConnectionInput {
  id: string;
  accountHandle: string;
  platform: PlatformId;
  accessTokenIssuedAt: string;
  refreshTokenIssuedAt?: string;
  isMarketingPartner?: boolean;
  hasOfflineAccess?: boolean;
  isAppAudited?: boolean;
  concurrentWorkers?: number;
}

export interface OAuthTokenHealth {
  connectionId: string;
  accountHandle: string;
  platform: PlatformId;
  status: 'healthy' | 'expiring-soon' | 'critical' | 'expired';
  accessHoursRemaining: number | null;
  refreshDaysRemaining: number | null;
  canAutoRefresh: boolean;
  risks: string[];
  actionRequired: string;
}

export interface GovernanceAuditEntry {
  seq: number;
  timestamp: string;
  actor: string;
  action: 'DRAFT_CREATED' | 'PREFLIGHT_PASSED' | 'PREFLIGHT_FAILED' | 'APPROVED' | 'QUEUED' | 'KILL_SWITCH_ACTIVATED' | 'KILL_SWITCH_RELEASED' | 'PUBLISH_BLOCKED';
  targetId?: string;
  reason: string;
  prevHash: string;
  hash: string;
}

export interface KillSwitchState {
  frozen: boolean;
  frozenAt: string | null;
  frozenBy: string | null;
  reason: string | null;
  blockedAttemptCount: number;
  auditLog: GovernanceAuditEntry[];
}
