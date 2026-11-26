import type { PlatformId, Severity, UtmAuditResult } from '../types.js';

const CLICK_ID_NOISE_PARAMS = new Set([
  'fbclid',
  'gclid',
  'ttclid',
  'igshid',
  'si',
  'msclkid',
  'twclid',
  'li_fat_id',
  'mc_cid',
  'mc_eid',
  '_hsenc',
  '_hsmi',
]);

const PLATFORM_CANONICAL_SOURCE: Record<PlatformId, string> = {
  x: 'x',
  linkedin: 'linkedin',
  'instagram-feed': 'instagram',
  'instagram-reels': 'instagram',
  tiktok: 'tiktok',
  'youtube-shorts': 'youtube',
  threads: 'threads',
  bluesky: 'bluesky',
  mastodon: 'mastodon',
};

const PLATFORM_ACCEPTED_SOURCES: Record<PlatformId, readonly string[]> = {
  x: ['x', 'twitter'],
  linkedin: ['linkedin'],
  'instagram-feed': ['instagram', 'ig', 'instagram-feed'],
  'instagram-reels': ['instagram', 'ig', 'instagram-reels'],
  tiktok: ['tiktok'],
  'youtube-shorts': ['youtube', 'youtube-shorts', 'yt'],
  threads: ['threads'],
  bluesky: ['bluesky', 'bsky'],
  mastodon: ['mastodon', 'fediverse'],
};

const DARK_SOCIAL_RISK_NOTE =
  'Dark Social warning: In-app browsers (Instagram, TikTok, LinkedIn, X) and private messaging shares (WhatsApp, iMessage, Slack, Discord) frequently strip HTTP document.referrer headers, collapsing untagged visits into "Direct" traffic in GA4. Keep lowercase, hyphenated UTM parameters intact and capture landing UTMs server-side on first pageview.';

function slugifyUtmValue(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export interface AuditUtmOptions {
  platform?: PlatformId;
  expectedMedium?: string;
  expectedCampaign?: string;
}

export function auditUtmUrl(
  rawUrl: string,
  options?: AuditUtmOptions,
): UtmAuditResult {
  const issues: Array<{ code: string; severity: Severity; message: string }> = [];
  const trimmed = rawUrl.trim();

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      originalUrl: rawUrl,
      validUrl: false,
      normalizedUrl: '',
      issues: [
        {
          code: 'utm/invalid-url',
          severity: 'error',
          message: `Invalid URL "${rawUrl}". Provide a fully qualified https:// URL.`,
        },
      ],
      params: {},
      hasClickIdNoise: false,
      darkSocialRiskNote: DARK_SOCIAL_RISK_NOTE,
    };
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return {
      originalUrl: rawUrl,
      validUrl: false,
      normalizedUrl: '',
      issues: [
        {
          code: 'utm/invalid-protocol',
          severity: 'error',
          message: `Unsupported URL protocol "${parsed.protocol}". Social attribution URLs must use https://.`,
        },
      ],
      params: {},
      hasClickIdNoise: false,
      darkSocialRiskNote: DARK_SOCIAL_RISK_NOTE,
    };
  }

  if (parsed.protocol !== 'https:') {
    issues.push({
      code: 'utm/non-https',
      severity: 'error',
      message: 'URL uses insecure http:// instead of https://; browsers drop referrer headers across protocol transitions and social crawlers distrust insecure links.',
    });
  }

  const params: Record<string, string> = {};
  const foundClickIds: string[] = [];
  let hasUppercaseUtm = false;
  let hasWhitespaceInUtm = false;
  let hasUnderscoreInUtm = false;
  let hasHyphenInUtm = false;

  const utmValuesLowerKeys = new Map<string, string>();

  for (const [key, value] of parsed.searchParams.entries()) {
    params[key] = value;
    const lowerKey = key.toLowerCase();

    if (CLICK_ID_NOISE_PARAMS.has(lowerKey)) {
      foundClickIds.push(key);
      continue;
    }

    if (lowerKey.startsWith('utm_')) {
      utmValuesLowerKeys.set(lowerKey, value);
      if (key !== lowerKey || value !== value.toLowerCase()) {
        hasUppercaseUtm = true;
      }
      if (/\s/.test(value)) {
        hasWhitespaceInUtm = true;
      }
      if (value.includes('_')) {
        hasUnderscoreInUtm = true;
      }
      if (value.includes('-')) {
        hasHyphenInUtm = true;
      }
    }
  }

  const hasClickIdNoise = foundClickIds.length > 0;
  if (hasClickIdNoise) {
    issues.push({
      code: 'utm/click-id-pollution',
      severity: 'warning',
      message: `Detected tracking click-ID noise (${foundClickIds.join(', ')}) copied from a live feed/share URL; strip click IDs to avoid polluting canonical attribution and breaking URL deduplication.`,
    });
  }

  if (hasUppercaseUtm) {
    issues.push({
      code: 'utm/mixed-case-fragmentation',
      severity: 'error',
      message: 'Detected uppercase/mixed-case UTM keys or values (e.g. "LinkedIn" vs "linkedin"). GA4 treats UTM parameters as strictly case-sensitive, fracturing campaign reports into duplicate rows.',
    });
  }

  if (hasWhitespaceInUtm) {
    issues.push({
      code: 'utm/whitespace-in-value',
      severity: 'warning',
      message: 'UTM parameter values contain raw spaces (%20/+); standardize on lowercase hyphen-separated slugs.',
    });
  }

  if (hasUnderscoreInUtm && hasHyphenInUtm) {
    issues.push({
      code: 'utm/separator-inconsistency',
      severity: 'warning',
      message: 'UTM values mix underscores ("_") and hyphens ("-"). Standardize on lowercase hyphens across all campaigns for clean GA4 grouping.',
    });
  } else if (hasUnderscoreInUtm) {
    issues.push({
      code: 'utm/underscore-separator',
      severity: 'info',
      message: 'UTM values use underscores ("_"); prefer lowercase hyphens ("-") for consistent cross-channel attribution hygiene.',
    });
  }

  const utmSource = utmValuesLowerKeys.get('utm_source')?.trim();
  const utmMedium = utmValuesLowerKeys.get('utm_medium')?.trim();
  const utmCampaign = utmValuesLowerKeys.get('utm_campaign')?.trim();

  if (!utmSource) {
    issues.push({
      code: 'utm/missing-utm_source',
      severity: 'warning',
      message: 'Missing utm_source parameter; referral attribution will be lost in dark-social and in-app browser environments.',
    });
  }

  if (!utmMedium) {
    issues.push({
      code: 'utm/missing-utm_medium',
      severity: 'warning',
      message: 'Missing utm_medium parameter (e.g. "organic-social" or "paid-social"); GA4 default channel grouping may misclassify traffic.',
    });
  }

  if (!utmCampaign) {
    issues.push({
      code: 'utm/missing-utm_campaign',
      severity: 'warning',
      message: 'Missing utm_campaign parameter; post conversions cannot be rolled up to campaign attribution.',
    });
  }

  if (options?.platform && utmSource) {
    const accepted = PLATFORM_ACCEPTED_SOURCES[options.platform];
    const canonical = PLATFORM_CANONICAL_SOURCE[options.platform];
    if (!accepted.includes(utmSource.toLowerCase())) {
      issues.push({
        code: 'utm/source-platform-mismatch',
        severity: 'error',
        message: `utm_source="${utmSource}" does not match target platform "${options.platform}" (expected "${canonical}"). Copy-pasting tagged URLs across platforms corrupts channel ROI.`,
      });
    }
  }

  if (
    options?.expectedMedium &&
    utmMedium &&
    slugifyUtmValue(utmMedium) !== slugifyUtmValue(options.expectedMedium)
  ) {
    issues.push({
      code: 'utm/medium-mismatch',
      severity: 'warning',
      message: `utm_medium="${utmMedium}" does not match expected medium "${options.expectedMedium}".`,
    });
  }

  if (
    options?.expectedCampaign &&
    utmCampaign &&
    slugifyUtmValue(utmCampaign) !== slugifyUtmValue(options.expectedCampaign)
  ) {
    issues.push({
      code: 'utm/campaign-mismatch',
      severity: 'warning',
      message: `utm_campaign="${utmCampaign}" does not match expected campaign "${options.expectedCampaign}".`,
    });
  }

  // Construct clean normalized URL
  const normalized = new URL(parsed.toString());
  if (normalized.protocol === 'http:') {
    normalized.protocol = 'https:';
  }

  const rebuiltParams: Array<[string, string]> = [];
  const seenUtmKeys = new Set<string>();

  for (const [key, value] of parsed.searchParams.entries()) {
    const lowerKey = key.toLowerCase();
    if (CLICK_ID_NOISE_PARAMS.has(lowerKey)) {
      continue;
    }
    if (lowerKey.startsWith('utm_')) {
      if (seenUtmKeys.has(lowerKey)) continue;
      seenUtmKeys.add(lowerKey);
      rebuiltParams.push([lowerKey, slugifyUtmValue(value)]);
    } else {
      rebuiltParams.push([key, value]);
    }
  }

  if (options?.platform && !seenUtmKeys.has('utm_source')) {
    rebuiltParams.push(['utm_source', PLATFORM_CANONICAL_SOURCE[options.platform]]);
  }
  if (options?.expectedMedium && !seenUtmKeys.has('utm_medium')) {
    rebuiltParams.push(['utm_medium', slugifyUtmValue(options.expectedMedium)]);
  }
  if (options?.expectedCampaign && !seenUtmKeys.has('utm_campaign')) {
    rebuiltParams.push(['utm_campaign', slugifyUtmValue(options.expectedCampaign)]);
  }

  normalized.search = '';
  for (const [k, v] of rebuiltParams) {
    normalized.searchParams.append(k, v);
  }

  return {
    originalUrl: rawUrl,
    validUrl: true,
    normalizedUrl: normalized.toString(),
    issues,
    params,
    hasClickIdNoise,
    darkSocialRiskNote: DARK_SOCIAL_RISK_NOTE,
  };
}

export interface BuildCanonicalUtmOptions {
  platform: PlatformId;
  campaign: string;
  medium?: string;
  content?: string;
}

export function buildCanonicalUtmUrl(
  rawUrl: string,
  options: BuildCanonicalUtmOptions,
): string {
  const trimmed = rawUrl.trim();
  const candidate = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error(`Cannot build canonical UTM URL from invalid URL "${rawUrl}".`);
  }

  if (parsed.protocol === 'http:') {
    parsed.protocol = 'https:';
  }

  const keptParams: Array<[string, string]> = [];
  for (const [key, value] of parsed.searchParams.entries()) {
    const lowerKey = key.toLowerCase();
    if (CLICK_ID_NOISE_PARAMS.has(lowerKey)) {
      continue;
    }
    if (
      lowerKey === 'utm_source' ||
      lowerKey === 'utm_medium' ||
      lowerKey === 'utm_campaign' ||
      lowerKey === 'utm_content'
    ) {
      continue;
    }
    if (lowerKey.startsWith('utm_')) {
      keptParams.push([lowerKey, slugifyUtmValue(value)]);
    } else {
      keptParams.push([key, value]);
    }
  }

  parsed.search = '';
  for (const [k, v] of keptParams) {
    parsed.searchParams.append(k, v);
  }

  parsed.searchParams.set('utm_source', PLATFORM_CANONICAL_SOURCE[options.platform]);
  parsed.searchParams.set(
    'utm_medium',
    slugifyUtmValue(options.medium ?? 'organic-social') || 'organic-social',
  );
  const campaignSlug = slugifyUtmValue(options.campaign);
  if (campaignSlug) {
    parsed.searchParams.set('utm_campaign', campaignSlug);
  }
  if (options.content !== undefined) {
    const contentSlug = slugifyUtmValue(options.content);
    if (contentSlug) {
      parsed.searchParams.set('utm_content', contentSlug);
    }
  }

  return parsed.toString();
}
