import type { AutoFixResult, DisclosureJurisdiction, PlatformId } from '../types.js';
import { getPlatformSpec } from '../specs/registry.js';
import { findHashtagMatches, findUrlMatches } from '../counters/index.js';
import { simulatePlatformFold } from '../fold/simulator.js';

// Exact BMP Letterlike Symbol holes left by Unicode Mathematical Alphanumeric blocks
const MATH_LETTERLIKE_MAP: Readonly<Record<number, string>> = {
  0x2102: 'C', // ℂ
  0x210a: 'g', // ℊ
  0x210b: 'H', // ℋ
  0x210c: 'H', // ℌ
  0x210d: 'H', // ℍ
  0x210e: 'h', // ℎ (Italic small h)
  0x210f: 'h', // ℏ
  0x2110: 'I', // ℐ
  0x2111: 'I', // ℑ
  0x2112: 'L', // ℒ
  0x2113: 'l', // ℓ
  0x2115: 'N', // ℕ
  0x2119: 'P', // ℙ
  0x211a: 'Q', // ℚ
  0x211b: 'R', // ℛ
  0x211c: 'R', // ℜ
  0x211d: 'R', // ℝ
  0x2124: 'Z', // ℤ
  0x2128: 'Z', // ℨ
  0x212c: 'B', // ℬ
  0x212d: 'C', // ℭ
  0x212f: 'e', // ℯ
  0x2130: 'E', // ℰ
  0x2131: 'F', // ℱ
  0x2133: 'M', // ℳ
  0x2134: 'o', // ℴ
};

// Ranges for Mathematical Alphanumeric Latin A-Z (26), a-z (26), and digits 0-9 (10)
const MATH_UPPER_BASES: readonly number[] = [
  0x1d400, // Bold A-Z
  0x1d434, // Italic A-Z
  0x1d468, // Bold Italic A-Z
  0x1d49c, // Script A-Z
  0x1d4d0, // Bold Script A-Z
  0x1d504, // Fraktur A-Z
  0x1d538, // Double-Struck A-Z
  0x1d56c, // Bold Fraktur A-Z
  0x1d5a0, // Sans-Serif A-Z
  0x1d5d4, // Sans-Serif Bold A-Z
  0x1d608, // Sans-Serif Italic A-Z
  0x1d63c, // Sans-Serif Bold Italic A-Z
  0x1d670, // Monospace A-Z
];

const MATH_LOWER_BASES: readonly number[] = [
  0x1d41a, // Bold a-z
  0x1d44e, // Italic a-z
  0x1d482, // Bold Italic a-z
  0x1d4b6, // Script a-z
  0x1d4ea, // Bold Script a-z
  0x1d51e, // Fraktur a-z
  0x1d552, // Double-Struck a-z
  0x1d586, // Bold Fraktur a-z
  0x1d5ba, // Sans-Serif a-z
  0x1d5ee, // Sans-Serif Bold a-z
  0x1d622, // Sans-Serif Italic a-z
  0x1d656, // Sans-Serif Bold Italic a-z
  0x1d68a, // Monospace a-z
];

const MATH_DIGIT_BASES: readonly number[] = [
  0x1d7ce, // Bold 0-9
  0x1d7d8, // Double-Struck 0-9
  0x1d7e2, // Sans-Serif 0-9
  0x1d7ec, // Sans-Serif Bold 0-9
  0x1d7f6, // Monospace 0-9
];

const ENCLOSED_UPPER_BASES: readonly number[] = [
  0x24b6, // Circled A-Z
  0x1f130, // Squared A-Z
  0x1f150, // Negative Circled A-Z
  0x1f170, // Negative Squared A-Z
];

function mapFancyCodePointToAscii(cp: number): string | null {
  const hole = MATH_LETTERLIKE_MAP[cp];
  if (hole !== undefined) {
    return hole;
  }

  for (const base of MATH_UPPER_BASES) {
    if (cp >= base && cp < base + 26) {
      return String.fromCharCode(65 + (cp - base));
    }
  }

  for (const base of MATH_LOWER_BASES) {
    if (cp >= base && cp < base + 26) {
      return String.fromCharCode(97 + (cp - base));
    }
  }

  for (const base of MATH_DIGIT_BASES) {
    if (cp >= base && cp < base + 10) {
      return String.fromCharCode(48 + (cp - base));
    }
  }

  // Enclosed alphanumerics: Circled A-Z, a-z, Squared/Negative A-Z
  for (const base of ENCLOSED_UPPER_BASES) {
    if (cp >= base && cp < base + 26) {
      return String.fromCharCode(65 + (cp - base));
    }
  }
  if (cp >= 0x24d0 && cp < 0x24d0 + 26) {
    return String.fromCharCode(97 + (cp - 0x24d0));
  }

  // Fullwidth Latin & Digits
  if (cp >= 0xff10 && cp <= 0xff19) {
    return String.fromCharCode(48 + (cp - 0xff10));
  }
  if (cp >= 0xff21 && cp <= 0xff3a) {
    return String.fromCharCode(65 + (cp - 0xff21));
  }
  if (cp >= 0xff41 && cp <= 0xff5a) {
    return String.fromCharCode(97 + (cp - 0xff41));
  }

  // NFKD fallback for remaining Mathematical Alphanumeric Symbols (e.g. Greek or dotless variants)
  if (cp >= 0x1d400 && cp <= 0x1d7ff) {
    const normalized = String.fromCodePoint(cp).normalize('NFKD');
    if (normalized !== String.fromCodePoint(cp) && /^[\x20-\x7E]+$/.test(normalized)) {
      return normalized;
    }
  }

  return null;
}

const ALWAYS_BAD_INVISIBLE_REGEX =
  /[\u200B\u200C\uFEFF\u00AD\u2060\u180E\u202A-\u202E\u2066-\u2069]/u;
const EMOJI_OR_SCRIPT_JOIN_NEIGHBOR =
  /[\p{Extended_Pictographic}\p{Regional_Indicator}\uFE0F\u20E3\u{1F3FB}-\u{1F3FF}\u{E0020}-\u{E007F}\p{Script=Arabic}\p{Script=Devanagari}\u2640\u2642\u2695\u2696\u2708]/u;

export interface InvisibleCharFinding {
  codePoint: string;
  label: string;
  index: number;
}

/**
 * Detects hidden zero-width residue, Bidi overrides, soft hyphens, and non-breaking spaces
 * commonly pasted from Docs/Notion/AI chats while preserving legitimate emoji/script ZWJ sequences.
 */
export function detectInvisibleZeroWidthChars(text: string): InvisibleCharFinding[] {
  const findings: InvisibleCharFinding[] = [];
  const chars = [...text];
  let utf16Index = 0;

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]!;
    const cp = ch.codePointAt(0);
    if (cp !== undefined) {
      if (ALWAYS_BAD_INVISIBLE_REGEX.test(ch)) {
        const isBidi = (cp >= 0x202a && cp <= 0x202e) || (cp >= 0x2066 && cp <= 0x2069);
        findings.push({
          codePoint: `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`,
          label: isBidi ? 'Bidi override control' : 'zero-width / hidden formatting char',
          index: utf16Index,
        });
      } else if (cp === 0x00a0) {
        findings.push({
          codePoint: 'U+00A0',
          label: 'non-breaking space',
          index: utf16Index,
        });
      } else if (cp === 0x200d) {
        const prev = i > 0 ? chars[i - 1]! : '';
        const next = i + 1 < chars.length ? chars[i + 1]! : '';
        const validJoiner =
          prev.length > 0 &&
          next.length > 0 &&
          EMOJI_OR_SCRIPT_JOIN_NEIGHBOR.test(prev) &&
          EMOJI_OR_SCRIPT_JOIN_NEIGHBOR.test(next);
        if (!validJoiner) {
          findings.push({
            codePoint: 'U+200D',
            label: 'stray orphan zero-width joiner',
            index: utf16Index,
          });
        }
      }
    }
    utf16Index += ch.length;
  }

  return findings;
}

export function stripInvisibleZeroWidthChars(text: string): {
  text: string;
  removedCount: number;
  normalizedSpaces: number;
} {
  const chars = [...text];
  let out = '';
  let removedCount = 0;
  let normalizedSpaces = 0;

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]!;
    const cp = ch.codePointAt(0);
    if (cp !== undefined) {
      if (ALWAYS_BAD_INVISIBLE_REGEX.test(ch)) {
        removedCount++;
        continue;
      }
      if (cp === 0x00a0) {
        out += ' ';
        normalizedSpaces++;
        continue;
      }
      if (cp === 0x200d) {
        const prev = i > 0 ? chars[i - 1]! : '';
        const next = i + 1 < chars.length ? chars[i + 1]! : '';
        const validJoiner =
          prev.length > 0 &&
          next.length > 0 &&
          EMOJI_OR_SCRIPT_JOIN_NEIGHBOR.test(prev) &&
          EMOJI_OR_SCRIPT_JOIN_NEIGHBOR.test(next);
        if (!validJoiner) {
          removedCount++;
          continue;
        }
      }
    }
    out += ch;
  }

  return { text: out, removedCount, normalizedSpaces };
}

export function detectUnicodeFancyFonts(text: string): string[] {
  const runs: string[] = [];
  let currentRun = '';

  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp !== undefined && mapFancyCodePointToAscii(cp) !== null) {
      currentRun += ch;
    } else if (currentRun.length > 0) {
      runs.push(currentRun);
      currentRun = '';
    }
  }

  if (currentRun.length > 0) {
    runs.push(currentRun);
  }

  return runs;
}

export function normalizeUnicodeFancyFonts(text: string): { text: string; replacements: number } {
  let out = '';
  let replacements = 0;

  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp !== undefined) {
      const mapped = mapFancyCodePointToAscii(cp);
      if (mapped !== null) {
        out += mapped;
        replacements++;
        continue;
      }
    }
    out += ch;
  }

  return { text: out, replacements };
}

// Built-in dictionary of ~170 common social, tech, marketing, creator, and accessibility terms
const HASHTAG_WORD_DICTIONARY: readonly string[] = [
  'accessibility',
  'advertising',
  'affiliate',
  'agency',
  'algorithm',
  'analytics',
  'android',
  'architecture',
  'artificial',
  'attribution',
  'audience',
  'automation',
  'a11y',
  'b2b',
  'b2c',
  'backend',
  'best',
  'blog',
  'blogging',
  'bluesky',
  'bootstrapped',
  'brand',
  'branding',
  'build',
  'building',
  'business',
  'campaign',
  'career',
  'carousel',
  'case',
  'checklist',
  'cloud',
  'code',
  'coding',
  'commerce',
  'community',
  'compliance',
  'content',
  'conversion',
  'copywriting',
  'create',
  'creative',
  'creator',
  'creators',
  'crypto',
  'culture',
  'customer',
  'cybersecurity',
  'daily',
  'data',
  'design',
  'designer',
  'dev',
  'developer',
  'developers',
  'development',
  'devops',
  'digital',
  'disclosure',
  'ecommerce',
  'economy',
  'editing',
  'education',
  'email',
  'engagement',
  'engineer',
  'engineering',
  'enterprise',
  'entrepreneur',
  'entrepreneurship',
  'event',
  'experience',
  'fediverse',
  'feed',
  'film',
  'finance',
  'fintech',
  'fitness',
  'flight',
  'food',
  'for',
  'founder',
  'founders',
  'framework',
  'freelance',
  'frontend',
  'full',
  'funnel',
  'future',
  'game',
  'gaming',
  'genai',
  'github',
  'go',
  'google',
  'governance',
  'graphic',
  'growth',
  'guide',
  'hack',
  'hacker',
  'hackers',
  'hacking',
  'health',
  'hiring',
  'hook',
  'how',
  'ideas',
  'inclusive',
  'indie',
  'influencer',
  'influencers',
  'innovation',
  'insights',
  'instagram',
  'intelligence',
  'ios',
  'javascript',
  'jobs',
  'journey',
  'launch',
  'leadership',
  'learn',
  'learning',
  'life',
  'lifestyle',
  'linkedin',
  'live',
  'llm',
  'local',
  'machine',
  'maker',
  'management',
  'market',
  'marketing',
  'mastodon',
  'media',
  'meta',
  'metrics',
  'micro',
  'mindset',
  'mobile',
  'modern',
  'money',
  'motivation',
  'music',
  'my',
  'network',
  'news',
  'newsletter',
  'next',
  'nocode',
  'node',
  'of',
  'on',
  'online',
  'open',
  'ops',
  'optimization',
  'organic',
  'paid',
  'personal',
  'photo',
  'photography',
  'platform',
  'podcast',
  'post',
  'posts',
  'privacy',
  'pro',
  'product',
  'productivity',
  'programming',
  'project',
  'prompt',
  'public',
  'python',
  'react',
  'reels',
  'remote',
  'research',
  'revenue',
  'review',
  'rust',
  'saas',
  'sales',
  'scale',
  'science',
  'search',
  'security',
  'self',
  'seo',
  'ship',
  'shop',
  'short',
  'shorts',
  'small',
  'social',
  'software',
  'solo',
  'source',
  'sponsored',
  'stack',
  'startup',
  'startups',
  'stories',
  'story',
  'storytelling',
  'strategy',
  'studio',
  'study',
  'success',
  'sustainability',
  'system',
  'systems',
  'team',
  'tech',
  'technology',
  'testing',
  'the',
  'threads',
  'tiktok',
  'time',
  'tip',
  'tips',
  'to',
  'tool',
  'tooling',
  'tools',
  'top',
  'traffic',
  'travel',
  'trend',
  'trends',
  'tutorial',
  'twitter',
  'typescript',
  'ui',
  'update',
  'user',
  'ux',
  'venture',
  'video',
  'viral',
  'visual',
  'voice',
  'web',
  'web3',
  'weekly',
  'wellness',
  'with',
  'work',
  'workflow',
  'writing',
  'youtube',
  'ai',
  'in',
  'ad',
  'pr',
  'qa',
  'js',
  'ts',
  'api',
  'app',
  'art',
  'ceo',
  'cli',
  'crm',
  'css',
  'cto',
  'diy',
  'faq',
  'ftc',
  'gtm',
  'kpi',
  'mcp',
  'mvp',
  'okr',
  'pdf',
  'roi',
  'sdk',
  'sql',
  'ugc',
  'utm',
];

const DICT_SET = new Set<string>(HASHTAG_WORD_DICTIONARY);
const MAX_DICT_WORD_LEN = HASHTAG_WORD_DICTIONARY.reduce(
  (max, word) => (word.length > max ? word.length : max),
  0,
);

function capitalizeSegment(seg: string): string {
  if (seg.length === 0) return '';
  return seg[0]!.toUpperCase() + seg.slice(1).toLowerCase();
}

interface SegNode {
  cost: number;
  prev: number;
  isDict: boolean;
  isShortDict: boolean;
}

function segmentCompoundWord(lower: string): string[] {
  const n = lower.length;
  if (n === 0) return [];
  if (DICT_SET.has(lower)) {
    return [lower];
  }

  const dp: SegNode[] = new Array<SegNode>(n + 1);
  dp[0] = { cost: 0, prev: -1, isDict: true, isShortDict: false };
  for (let i = 1; i <= n; i++) {
    dp[i] = { cost: Number.POSITIVE_INFINITY, prev: -1, isDict: false, isShortDict: false };
  }

  for (let i = 0; i < n; i++) {
    const curr = dp[i];
    if (!curr || !Number.isFinite(curr.cost)) continue;

    // 1) Try dictionary words starting at i
    const maxLen = Math.min(MAX_DICT_WORD_LEN, n - i);
    for (let len = 1; len <= maxLen; len++) {
      const sub = lower.slice(i, i + len);
      if (DICT_SET.has(sub)) {
        const isShort = len <= 2;
        // Penalize switching from unknown chunk into a tiny 2-letter dict word
        const transitionPenalty = !curr.isDict && isShort ? 150 : 0;
        const nextCost = curr.cost + 10 + transitionPenalty;
        const target = dp[i + len];
        if (target && nextCost < target.cost) {
          dp[i + len] = { cost: nextCost, prev: i, isDict: true, isShortDict: isShort };
        }
      }
    }

    // 2) Try contiguous digit run starting at i (e.g. "2026" in #tech2026)
    const ch = lower[i];
    if (ch !== undefined && ch >= '0' && ch <= '9') {
      let j = i + 1;
      while (j < n) {
        const nextCh = lower[j];
        if (nextCh === undefined || nextCh < '0' || nextCh > '9') break;
        j++;
      }
      const nextCost = curr.cost + 10;
      const target = dp[j];
      if (target && nextCost < target.cost) {
        dp[j] = { cost: nextCost, prev: i, isDict: true, isShortDict: false };
      }
    }

    // 3) Fallback single unknown character (adjacent unknowns get merged after traceback)
    const switchFromShortPenalty = curr.isShortDict ? 150 : 0;
    const unknownCost = curr.cost + 100 + switchFromShortPenalty;
    const nextNode = dp[i + 1];
    if (nextNode && unknownCost < nextNode.cost) {
      dp[i + 1] = { cost: unknownCost, prev: i, isDict: false, isShortDict: false };
    }
  }

  // Reconstruct segments and merge contiguous unknown characters
  const rawTokens: Array<{ text: string; isDict: boolean }> = [];
  let cursor = n;
  while (cursor > 0) {
    const node = dp[cursor];
    if (!node || node.prev < 0) break;
    rawTokens.push({ text: lower.slice(node.prev, cursor), isDict: node.isDict });
    cursor = node.prev;
  }
  rawTokens.reverse();

  // Clean merge of adjacent unknown tokens
  const finalTokens: string[] = [];
  let unknownBuffer = '';
  for (const token of rawTokens) {
    if (!token.isDict) {
      unknownBuffer += token.text;
    } else {
      if (unknownBuffer.length > 0) {
        finalTokens.push(unknownBuffer);
        unknownBuffer = '';
      }
      finalTokens.push(token.text);
    }
  }
  if (unknownBuffer.length > 0) {
    finalTokens.push(unknownBuffer);
  }

  return finalTokens;
}

export function isKnownSingleHashtagWord(lowerBody: string): boolean {
  return DICT_SET.has(lowerBody);
}

export function toPascalCaseHashtag(tag: string): string {
  const trimmed = tag.trim();
  const body = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
  if (body.length === 0) return '#';

  // Handle explicit underscore or hyphen delimiters first
  if (/[_-]/.test(body)) {
    const parts = body.split(/[_-]+/).filter((p) => p.length > 0);
    if (parts.length === 0) return '#';
    const formatted = parts
      .flatMap((part) => {
        const hasUpper = /[A-Z]/.test(part);
        const hasLower = /[a-z]/.test(part);
        if (hasUpper && hasLower) {
          return [part[0]!.toUpperCase() + part.slice(1)];
        }
        return segmentCompoundWord(part.toLowerCase()).map(capitalizeSegment);
      })
      .join('');
    return `#${formatted}`;
  }

  // Preserve intentional mixed case (e.g. #SocialMediaTips, #PostFlight, #iOSDev)
  const hasUpper = /[A-Z]/.test(body);
  const hasLower = /[a-z]/.test(body);
  if (hasUpper && hasLower) {
    return `#${body}`;
  }

  // All-lowercase or ALL-CAPS: segment using DP dictionary
  const segments = segmentCompoundWord(body.toLowerCase());
  return `#${segments.map(capitalizeSegment).join('')}`;
}

const CLICK_ID_PARAMS = new Set([
  'fbclid',
  'gclid',
  'dclid',
  'msclkid',
  'mc_eid',
  'igshid',
  'ttclid',
  'twclid',
  'li_fat_id',
  'si',
]);

function normalizeUrlUtms(rawUrl: string, utmCampaign?: string): { url: string; changed: boolean } {
  try {
    const parsed = new URL(rawUrl);
    const entries = Array.from(parsed.searchParams.entries());
    if (entries.length === 0) {
      return { url: rawUrl, changed: false };
    }

    let changed = false;
    let hasAnyUtm = false;
    let hasCampaign = false;
    const rebuilt = new URLSearchParams();

    for (const [rawKey, rawVal] of entries) {
      const lowerKey = rawKey.toLowerCase();
      if (CLICK_ID_PARAMS.has(lowerKey)) {
        changed = true;
        continue;
      }

      if (lowerKey.startsWith('utm_')) {
        hasAnyUtm = true;
        if (lowerKey === 'utm_campaign') {
          hasCampaign = true;
        }
        const cleanVal = rawVal.trim().toLowerCase().replace(/\s+/g, '-');
        if (rawKey !== lowerKey || rawVal !== cleanVal) {
          changed = true;
        }
        rebuilt.append(lowerKey, cleanVal);
      } else {
        rebuilt.append(rawKey, rawVal);
      }
    }

    if (utmCampaign && hasAnyUtm && !hasCampaign) {
      const cleanCampaign = utmCampaign.trim().toLowerCase().replace(/\s+/g, '-');
      if (cleanCampaign.length > 0) {
        rebuilt.append('utm_campaign', cleanCampaign);
        changed = true;
      }
    }

    if (!changed) {
      return { url: rawUrl, changed: false };
    }

    const queryString = rebuilt.toString();
    parsed.search = queryString.length > 0 ? `?${queryString}` : '';
    return { url: parsed.toString(), changed: true };
  } catch {
    return { url: rawUrl, changed: false };
  }
}

const APPROVED_FTC_DISCLOSURE_REGEX =
  /(?:^|[\s([{"'“”])(#ad\b|ad:|#sponsored\b|#advertisement\b|paid\s+partnership\b|sponsored\s+by\b)/i;

function hasUpfrontCompliantDisclosure(
  text: string,
  platform: PlatformId,
  jurisdiction: DisclosureJurisdiction,
): boolean {
  const match = APPROVED_FTC_DISCLOSURE_REGEX.exec(text);
  if (!match) return false;

  const spec = getPlatformSpec(platform);
  const matchedToken = match[1] ?? match[0].trim();
  const tokenStart = match.index + (match[0].length - matchedToken.length);
  const strict40CharJurisdiction =
    jurisdiction === 'asa-uk' ||
    jurisdiction === 'dfa-eu' ||
    jurisdiction === 'both' ||
    jurisdiction === 'all';
  const maxOffset = strict40CharJurisdiction
    ? Math.min(40, spec.folds.ftcMaxMobileChars)
    : spec.folds.ftcMaxMobileChars;

  if (tokenStart > maxOffset) {
    return false;
  }

  // Ensure it is not buried inside a trailing cluster of >=2 hashtags
  const allTags = findHashtagMatches(text);
  const trimmedEndLen = text.trimEnd().length;
  if (tokenStart > 0 && allTags.length >= 2) {
    const lastTag = allTags[allTags.length - 1];
    if (lastTag && lastTag.end >= trimmedEndLen - 1) {
      let clusterStart = lastTag.start;
      let clusterCount = 1;
      for (let i = allTags.length - 2; i >= 0; i--) {
        const prevTag = allTags[i];
        const nextTag = allTags[i + 1];
        if (!prevTag || !nextTag) break;
        if (/^[\s,./|•·-]+$/.test(text.slice(prevTag.end, nextTag.start))) {
          clusterCount++;
          clusterStart = prevTag.start;
        } else {
          break;
        }
      }
      if (clusterCount >= 2 && tokenStart >= clusterStart) {
        return false;
      }
    }
  }

  return true;
}

export interface AutoFixOptions {
  isSponsored?: boolean;
  disclosureJurisdiction?: DisclosureJurisdiction;
  utmCampaign?: string;
}

export function autoFixDraftText(
  text: string,
  platform: PlatformId,
  options?: AutoFixOptions,
): AutoFixResult {
  const spec = getPlatformSpec(platform);
  const appliedFixes: string[] = [];
  let fixedText = text;

  // 0. Strip invisible zero-width residue / Bidi controls and normalize non-breaking spaces
  const invisibleResult = stripInvisibleZeroWidthChars(fixedText);
  if (invisibleResult.removedCount > 0 || invisibleResult.normalizedSpaces > 0) {
    fixedText = invisibleResult.text;
    const parts: string[] = [];
    if (invisibleResult.removedCount > 0) {
      parts.push(`${invisibleResult.removedCount} invisible zero-width/control char(s)`);
    }
    if (invisibleResult.normalizedSpaces > 0) {
      parts.push(`${invisibleResult.normalizedSpaces} non-breaking space(s)`);
    }
    appliedFixes.push(`Removed/normalized ${parts.join(' and ')}`);
  }

  // 1. Normalize Unicode fancy fonts to accessible ASCII
  const fancyResult = normalizeUnicodeFancyFonts(fixedText);
  if (fancyResult.replacements > 0) {
    fixedText = fancyResult.text;
    appliedFixes.push(
      `Normalized ${fancyResult.replacements} Unicode fancy-font character(s) to accessible ASCII`,
    );
  }

  // 2. Convert multi-word all-lowercase, ALL-CAPS, or underscore hashtags to PascalCase
  const urlSpansForTags = findUrlMatches(fixedText);
  const hashtagMatches = findHashtagMatches(fixedText, urlSpansForTags);
  let convertedTags = 0;

  for (let i = hashtagMatches.length - 1; i >= 0; i--) {
    const tagMatch = hashtagMatches[i];
    if (!tagMatch) continue;
    const rawTag = tagMatch.value;
    const body = rawTag.slice(1);
    const hasUpper = /[A-Z]/.test(body);
    const hasLower = /[a-z]/.test(body);

    const isUnderscore = body.includes('_');
    const isAllLower = !hasUpper && hasLower;
    const isAllCapsLong = hasUpper && !hasLower && body.length >= 6;

    if (!isUnderscore && !isAllLower && !isAllCapsLong) {
      continue;
    }

    const pascal = toPascalCaseHashtag(rawTag);
    const upperCount = (pascal.slice(1).match(/[A-Z]/g) ?? []).length;

    const shouldConvert =
      isUnderscore ||
      isAllCapsLong ||
      (isAllLower && (upperCount >= 2 || body.length >= 10));

    if (shouldConvert && pascal !== rawTag) {
      fixedText = fixedText.slice(0, tagMatch.start) + pascal + fixedText.slice(tagMatch.end);
      convertedTags++;
    }
  }

  if (convertedTags > 0) {
    appliedFixes.push(`Converted ${convertedTags} hashtag(s) to accessible PascalCase`);
  }

  // 3. Strip platform-forbidden characters (e.g. '<' and '>' on YouTube Shorts)
  if (spec.counting.forbiddenChars.length > 0) {
    let strippedChars = 0;
    let nextText = '';
    const forbiddenSet = new Set(spec.counting.forbiddenChars);
    for (const ch of fixedText) {
      if (forbiddenSet.has(ch)) {
        strippedChars++;
      } else {
        nextText += ch;
      }
    }
    if (strippedChars > 0) {
      fixedText = nextText;
      appliedFixes.push(
        `Removed ${strippedChars} forbidden character(s) (${spec.counting.forbiddenChars.join(', ')}) for ${spec.shortName}`,
      );
    }
  }

  // 4. Collapse LinkedIn double-blank-line fold killer inside the first 2 lines if hook gets starved
  if (platform === 'linkedin') {
    const normalized = fixedText.replace(/\r\n/g, '\n');
    const foldCheck = simulatePlatformFold(normalized, platform, { hasMedia: false });
    const lines = normalized.split('\n');
    const firstLine = lines[0] ?? '';
    const secondLine = lines[1];
    const hasBlankAfterHook =
      firstLine.trim().length > 0 &&
      secondLine !== undefined &&
      secondLine.trim().length === 0 &&
      lines.slice(2).some((l) => l.trim().length > 0);

    if (
      hasBlankAfterHook &&
      ((foldCheck.mobile.blankLinesConsumed > 0 && foldCheck.mobile.truncated) ||
        lines[2]?.trim() === '')
    ) {
      let firstContentIdx = 1;
      while (firstContentIdx < lines.length && (lines[firstContentIdx] ?? '').trim().length === 0) {
        firstContentIdx++;
      }
      if (firstContentIdx < lines.length) {
        const collapsed = [firstLine, ...lines.slice(firstContentIdx)].join('\n');
        if (collapsed !== normalized) {
          fixedText = collapsed;
          appliedFixes.push(
            'Collapsed opening blank line(s) on LinkedIn to prevent mobile fold line starvation',
          );
        }
      }
    }
  }

  // 5. Prepend upfront '#Ad ' disclosure if sponsored and missing before mobile fold
  if (options?.isSponsored) {
    const jurisdiction = options.disclosureJurisdiction ?? 'ftc';
    if (!hasUpfrontCompliantDisclosure(fixedText, platform, jurisdiction)) {
      fixedText = `#Ad ${fixedText.trimStart()}`;
      appliedFixes.push(
        `Prepended upfront '#Ad ' disclosure before ${spec.shortName} mobile fold (${jurisdiction.toUpperCase()})`,
      );
    }
  }

  // 6. Trim excess hashtags past platform hardCap (e.g. IG/TikTok >5, Threads >1)
  if (spec.hashtags.hardCap !== null) {
    const cap = spec.hashtags.hardCap;
    const updatedTagMatches = findHashtagMatches(fixedText);
    if (updatedTagMatches.length > cap) {
      const excessCount = updatedTagMatches.length - cap;
      for (let i = updatedTagMatches.length - 1; i >= cap; i--) {
        const tagMatch = updatedTagMatches[i];
        if (!tagMatch) continue;
        let removeStart = tagMatch.start;
        const removeEnd = tagMatch.end;
        // Also absorb a single preceding horizontal space so we don't leave double spaces
        if (removeStart > 0 && fixedText[removeStart - 1] === ' ') {
          removeStart--;
        }
        fixedText = fixedText.slice(0, removeStart) + fixedText.slice(removeEnd);
      }
      // Clean trailing horizontal spaces on lines affected by tag trimming
      fixedText = fixedText
        .split('\n')
        .map((line) => line.replace(/[ \t]+$/g, ''))
        .join('\n')
        .replace(/\n{3,}$/g, '\n')
        .trimEnd();

      appliedFixes.push(
        `Trimmed ${excessCount} excess hashtag(s) to comply with ${spec.shortName}'s ${cap}-hashtag hard cap`,
      );
    }
  }

  // 7. Normalize dirty UTM query params and strip click-id noise in embedded URLs
  const urlMatches = findUrlMatches(fixedText);
  let normalizedUrlCount = 0;
  for (let i = urlMatches.length - 1; i >= 0; i--) {
    const urlMatch = urlMatches[i];
    if (!urlMatch) continue;
    const normalized = normalizeUrlUtms(urlMatch.value, options?.utmCampaign);
    if (normalized.changed) {
      fixedText =
        fixedText.slice(0, urlMatch.start) + normalized.url + fixedText.slice(urlMatch.end);
      normalizedUrlCount++;
    }
  }
  if (normalizedUrlCount > 0) {
    appliedFixes.push(
      `Normalized UTM parameters and stripped click-ID tracking noise in ${normalizedUrlCount} URL(s)`,
    );
  }

  return {
    originalText: text,
    fixedText,
    changed: fixedText !== text,
    appliedFixes,
  };
}
