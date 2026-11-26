import type { BlueskyFacet, CountResult, PlatformId } from '../types.js';
import { getPlatformSpec } from '../specs/registry.js';

const graphemeSegmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
const utf8Encoder = new TextEncoder();

const URL_CANDIDATE_REGEX = /https?:\/\/[^\s<>"'`]+/gi;
const HASHTAG_REGEX = /#[\p{L}\p{N}_]+/gu;
const BSKY_MENTION_REGEX =
  /(^|[^a-zA-Z0-9._-])@([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+)/gu;
const MASTODON_REMOTE_MENTION_REGEX =
  /(^|[^\p{L}\p{N}_])(@[a-zA-Z0-9_.-]+)@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+/gu;
const EMOJI_CLUSTER_REGEX = /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20E3/u;
const PRECEDING_WORD_CHAR_REGEX = /[\p{L}\p{N}_/]/u;
const TRAILING_PUNCTUATION_CHARS = new Set(['.', ',', '!', '?', ';', ':', "'", '"', '”', '’', '…', '>']);

export interface TextSpanMatch {
  value: string;
  start: number;
  end: number;
}

export interface CountOptions {
  contentWarning?: string;
  publishViaApi?: boolean;
  xPremium?: boolean;
  mastodonMaxChars?: number;
}

function countCharOccurrences(str: string, char: string): number {
  let count = 0;
  for (let i = 0; i < str.length; i++) {
    if (str[i] === char) count++;
  }
  return count;
}

function trimTrailingUrlPunctuation(raw: string): string {
  let cleaned = raw;
  while (cleaned.length > 0) {
    const last = cleaned[cleaned.length - 1];
    if (last === undefined) break;

    if (TRAILING_PUNCTUATION_CHARS.has(last)) {
      cleaned = cleaned.slice(0, -1);
      continue;
    }
    if (last === ')' && countCharOccurrences(cleaned, ')') > countCharOccurrences(cleaned, '(')) {
      cleaned = cleaned.slice(0, -1);
      continue;
    }
    if (last === ']' && countCharOccurrences(cleaned, ']') > countCharOccurrences(cleaned, '[')) {
      cleaned = cleaned.slice(0, -1);
      continue;
    }
    if (last === '}' && countCharOccurrences(cleaned, '}') > countCharOccurrences(cleaned, '{')) {
      cleaned = cleaned.slice(0, -1);
      continue;
    }
    break;
  }
  return cleaned;
}

function isValidHttpUrl(candidate: string): boolean {
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    const host = parsed.hostname;
    if (!host) return false;
    return host.includes('.') || host === 'localhost' || host.startsWith('[');
  } catch {
    return false;
  }
}

export function findUrlMatches(text: string): TextSpanMatch[] {
  const matches: TextSpanMatch[] = [];
  URL_CANDIDATE_REGEX.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = URL_CANDIDATE_REGEX.exec(text)) !== null) {
    const raw = match[0];
    const cleaned = trimTrailingUrlPunctuation(raw);
    if (cleaned.length > 0 && isValidHttpUrl(cleaned)) {
      matches.push({
        value: cleaned,
        start: match.index,
        end: match.index + cleaned.length,
      });
    }
  }
  return matches;
}

function isInsideSpans(start: number, end: number, spans: readonly TextSpanMatch[]): boolean {
  for (const span of spans) {
    if (start < span.end && end > span.start) {
      return true;
    }
  }
  return false;
}

export function findHashtagMatches(text: string, urlSpans?: readonly TextSpanMatch[]): TextSpanMatch[] {
  const urls = urlSpans ?? findUrlMatches(text);
  const matches: TextSpanMatch[] = [];
  HASHTAG_REGEX.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = HASHTAG_REGEX.exec(text)) !== null) {
    const value = match[0];
    const start = match.index;
    const end = start + value.length;

    if (isInsideSpans(start, end, urls)) {
      continue;
    }

    if (start > 0) {
      const prevChar = text[start - 1];
      if (prevChar !== undefined && PRECEDING_WORD_CHAR_REGEX.test(prevChar)) {
        continue;
      }
    }

    matches.push({ value, start, end });
  }
  return matches;
}

export function extractUrls(text: string): string[] {
  return findUrlMatches(text).map((m) => m.value);
}

export function extractHashtags(text: string): string[] {
  return findHashtagMatches(text).map((m) => m.value);
}

export function countGraphemes(text: string): number {
  let count = 0;
  for (const _segment of graphemeSegmenter.segment(text)) {
    count++;
  }
  return count;
}

export function countUtf8Bytes(text: string): number {
  return utf8Encoder.encode(text).byteLength;
}

function utf16RangeToUtf8ByteRange(text: string, start: number, end: number): { byteStart: number; byteEnd: number } {
  const byteStart = utf8Encoder.encode(text.slice(0, start)).byteLength;
  const byteLength = utf8Encoder.encode(text.slice(start, end)).byteLength;
  return {
    byteStart,
    byteEnd: byteStart + byteLength,
  };
}

export function extractBlueskyFacets(text: string): BlueskyFacet[] {
  const facets: BlueskyFacet[] = [];
  const urlSpans = findUrlMatches(text);
  const occupiedSpans: TextSpanMatch[] = [...urlSpans];

  for (const urlMatch of urlSpans) {
    const index = utf16RangeToUtf8ByteRange(text, urlMatch.start, urlMatch.end);
    facets.push({
      index,
      features: [{ $type: 'app.bsky.richtext.facet#link', uri: urlMatch.value }],
    });
  }

  BSKY_MENTION_REGEX.lastIndex = 0;
  let mentionMatch: RegExpExecArray | null;
  while ((mentionMatch = BSKY_MENTION_REGEX.exec(text)) !== null) {
    const prefix = mentionMatch[1] ?? '';
    const handle = mentionMatch[2];
    if (!handle) continue;

    const start = mentionMatch.index + prefix.length;
    const end = start + 1 + handle.length; // includes leading '@'

    if (isInsideSpans(start, end, occupiedSpans)) {
      continue;
    }

    occupiedSpans.push({ value: `@${handle}`, start, end });
    const index = utf16RangeToUtf8ByteRange(text, start, end);
    facets.push({
      index,
      features: [{ $type: 'app.bsky.richtext.facet#mention', handle }],
    });
  }

  const hashtagSpans = findHashtagMatches(text, occupiedSpans);
  for (const tagMatch of hashtagSpans) {
    const tagValue = tagMatch.value.slice(1);
    if (!tagValue) continue;

    const index = utf16RangeToUtf8ByteRange(text, tagMatch.start, tagMatch.end);
    facets.push({
      index,
      features: [{ $type: 'app.bsky.richtext.facet#tag', tag: tagValue }],
    });
  }

  facets.sort((a, b) => a.index.byteStart - b.index.byteStart);
  return facets;
}

function xCodePointWeight(cp: number): number {
  if (
    (cp >= 0x0000 && cp <= 0x10ff) ||
    (cp >= 0x2000 && cp <= 0x200d) ||
    (cp >= 0x2010 && cp <= 0x201f) ||
    (cp >= 0x2032 && cp <= 0x2037)
  ) {
    return 1;
  }
  return 2;
}

function countXWeighted(text: string, urlSpans: readonly TextSpanMatch[], urlWeight: number): {
  total: number;
  textWeight: number;
  urlTotalWeight: number;
} {
  let textWeight = 0;
  let cursor = 0;

  for (const span of urlSpans) {
    if (span.start > cursor) {
      const segment = text.slice(cursor, span.start);
      for (const ch of segment) {
        const cp = ch.codePointAt(0);
        if (cp !== undefined) {
          textWeight += xCodePointWeight(cp);
        }
      }
    }
    cursor = span.end;
  }

  if (cursor < text.length) {
    const tail = text.slice(cursor);
    for (const ch of tail) {
      const cp = ch.codePointAt(0);
      if (cp !== undefined) {
        textWeight += xCodePointWeight(cp);
      }
    }
  }

  const urlTotalWeight = urlSpans.length * urlWeight;
  return {
    total: textWeight + urlTotalWeight,
    textWeight,
    urlTotalWeight,
  };
}

function countThreadsEmojiUtf8(text: string): {
  total: number;
  emojiClusters: number;
  emojiUnits: number;
} {
  let total = 0;
  let emojiClusters = 0;
  let emojiUnits = 0;

  for (const { segment } of graphemeSegmenter.segment(text)) {
    if (EMOJI_CLUSTER_REGEX.test(segment)) {
      const bytes = countUtf8Bytes(segment);
      total += bytes;
      emojiClusters++;
      emojiUnits += bytes;
    } else {
      total += [...segment].length;
    }
  }

  return { total, emojiClusters, emojiUnits };
}

function countMastodonText(text: string, contentWarning: string | undefined, urlWeight: number): {
  total: number;
  cwChars: number;
  normalizedUrls: number;
  remoteMentionsCollapsed: number;
} {
  const combined = (contentWarning ?? '') + text;
  const cwChars = contentWarning ? countGraphemes(contentWarning) : 0;
  const urlSpans = findUrlMatches(combined);
  const urlPlaceholder = 'x'.repeat(urlWeight);

  let replaced = '';
  let cursor = 0;
  for (const span of urlSpans) {
    replaced += combined.slice(cursor, span.start) + urlPlaceholder;
    cursor = span.end;
  }
  replaced += combined.slice(cursor);

  let remoteMentionsCollapsed = 0;
  const normalized = replaced.replace(
    MASTODON_REMOTE_MENTION_REGEX,
    (_full: string, prefix: string, localHandle: string) => {
      remoteMentionsCollapsed++;
      return `${prefix}${localHandle}`;
    },
  );

  return {
    total: countGraphemes(normalized),
    cwChars,
    normalizedUrls: urlSpans.length,
    remoteMentionsCollapsed,
  };
}

export function countPlatformText(
  text: string,
  platform: PlatformId,
  options?: CountOptions,
): CountResult {
  const spec = getPlatformSpec(platform);
  const urlSpans = findUrlMatches(text);
  const urls = urlSpans.map((m) => m.value);
  const uniqueUrls = Array.from(new Set(urls));
  const hashtags = findHashtagMatches(text, urlSpans).map((m) => m.value);
  const graphemes = countGraphemes(text);
  const utf8Bytes = countUtf8Bytes(text);

  const customMastodonLimit =
    platform === 'mastodon' &&
    options?.mastodonMaxChars !== undefined &&
    options.mastodonMaxChars > 0
      ? options.mastodonMaxChars
      : null;

  const hardLimit = customMastodonLimit ?? spec.counting.hardLimit;
  const apiHardLimit = customMastodonLimit ?? spec.counting.apiHardLimit;

  const effectiveLimit =
    options?.publishViaApi && apiHardLimit !== null
      ? apiHardLimit
      : platform === 'x' && options?.xPremium && spec.counting.premiumLimit !== null
        ? spec.counting.premiumLimit
        : hardLimit;

  let count = graphemes;
  let facets: BlueskyFacet[] | undefined;
  let breakdown = '';

  switch (spec.counting.algorithm) {
    case 'x-weighted': {
      const urlWeight = spec.counting.urlWeight ?? 23;
      const weighted = countXWeighted(text, urlSpans, urlWeight);
      count = weighted.total;
      breakdown = `X weighted: ${count}/${effectiveLimit} (${weighted.textWeight} text weight + ${urlSpans.length} URL(s) × ${urlWeight} t.co)`;
      break;
    }
    case 'bluesky-dual': {
      count = graphemes;
      facets = extractBlueskyFacets(text);
      const maxBytes = spec.counting.maxBytes ?? 3000;
      breakdown = `Bluesky dual: ${graphemes}/${effectiveLimit} graphemes, ${utf8Bytes}/${maxBytes} UTF-8 bytes, ${facets.length} facet(s)`;
      break;
    }
    case 'threads-emoji-utf8': {
      const threadsStats = countThreadsEmojiUtf8(text);
      count = threadsStats.total;
      breakdown = `Threads UTF-8 emoji-weighted: ${count}/${effectiveLimit} (${threadsStats.emojiClusters} emoji cluster(s) = ${threadsStats.emojiUnits} units)`;
      break;
    }
    case 'mastodon': {
      const urlWeight = spec.counting.urlWeight ?? 23;
      const mastoStats = countMastodonText(text, options?.contentWarning, urlWeight);
      count = mastoStats.total;
      const cwPart = mastoStats.cwChars > 0 ? ` + ${mastoStats.cwChars} CW` : '';
      const mentionPart =
        mastoStats.remoteMentionsCollapsed > 0
          ? `, ${mastoStats.remoteMentionsCollapsed} remote mention(s) stripped`
          : '';
      breakdown = `Mastodon: ${count}/${effectiveLimit} (${mastoStats.normalizedUrls} URL(s) × ${urlWeight}${cwPart}${mentionPart})`;
      break;
    }
    case 'utf16': {
      count = text.length;
      breakdown = `UTF-16 code units: ${count}/${effectiveLimit} (${graphemes} graphemes)`;
      break;
    }
    case 'standard': {
      count = graphemes;
      const apiNote =
        apiHardLimit !== null && apiHardLimit !== hardLimit
          ? ` (native ${hardLimit} / API ${apiHardLimit})`
          : '';
      breakdown = `Standard graphemes: ${count}/${effectiveLimit}${apiNote}`;
      break;
    }
  }

  const maxBytes = spec.counting.maxBytes;
  const overByteLimit = maxBytes !== null && utf8Bytes > maxBytes;
  const overApiLimit = apiHardLimit !== null && count > apiHardLimit;
  const overLimit = count > effectiveLimit || overByteLimit;
  const remaining = effectiveLimit - count;

  const result: CountResult = {
    platform,
    algorithm: spec.counting.algorithm,
    count,
    hardLimit,
    apiHardLimit,
    effectiveLimit,
    remaining,
    overLimit,
    overApiLimit,
    utf8Bytes,
    maxBytes,
    overByteLimit,
    graphemes,
    urlCount: urls.length,
    uniqueUrls,
    hashtagCount: hashtags.length,
    hashtags,
    breakdown,
  };

  if (facets !== undefined) {
    result.facets = facets;
  }

  return result;
}
