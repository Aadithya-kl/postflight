import { buildCanonicalUtmUrl } from '../attribution/utm.js';
import {
  countPlatformText,
  extractBlueskyFacets,
  extractHashtags,
  findUrlMatches,
} from '../counters/index.js';
import {
  normalizeUnicodeFancyFonts,
  stripInvisibleZeroWidthChars,
  toPascalCaseHashtag,
} from '../linter/autofix.js';
import { lintForPlatform } from '../linter/index.js';
import {
  getPlatformSpec,
  isPlatformId,
  PLATFORM_IDS,
} from '../specs/registry.js';
import type {
  BlueskyFacet,
  BrandGuardrails,
  CanonicalPostDocument,
  CompilationBundle,
  CompiledPlatformArtifact,
  MediaAttachment,
  PlatformId,
  SocialDraft,
} from '../types.js';

const graphemeSegmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });

const LEADING_DISCLOSURE_PATTERN =
  /^\s*(?:#ad\b|ad:|#sponsored\b|#advertisement\b|paid\s+partnership\b)/i;

function splitGraphemes(text: string): string[] {
  const result: string[] = [];
  for (const { segment } of graphemeSegmenter.segment(text)) {
    result.push(segment);
  }
  return result;
}

function unquoteYamlScalar(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length >= 2) {
    if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
      return trimmed
        .slice(1, -1)
        .replace(/\\"/g, '"')
        .replace(/\\n/g, '\n')
        .replace(/\\\\/g, '\\');
    }
    if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
      return trimmed.slice(1, -1).replace(/''/g, "'");
    }
  }
  return trimmed;
}

function parseInlineYamlArray(raw: string): string[] {
  const inner = raw.trim().slice(1, -1).trim();
  if (!inner) return [];

  const items: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;

  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === undefined) break;

    if (quote !== null) {
      if (ch === '\\' && quote === '"' && i + 1 < inner.length) {
        current += ch + (inner[i + 1] ?? '');
        i++;
        continue;
      }
      if (ch === quote) {
        quote = null;
      }
      current += ch;
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
    } else if (ch === ',') {
      const cleaned = unquoteYamlScalar(current);
      if (cleaned.length > 0) items.push(cleaned);
      current = '';
    } else {
      current += ch;
    }
  }

  const tail = unquoteYamlScalar(current);
  if (tail.length > 0) items.push(tail);
  return items;
}

function parseBooleanValue(value: string): boolean | undefined {
  const lower = value.trim().toLowerCase();
  if (lower === 'true' || lower === 'yes') return true;
  if (lower === 'false' || lower === 'no') return false;
  return undefined;
}

function normalizeFrontmatterKey(key: string): string {
  return key.trim().toLowerCase().replace(/[-_\s]+/g, '');
}

function assignMediaField(target: Partial<MediaAttachment>, key: string, rawVal: string): void {
  const normKey = normalizeFrontmatterKey(key);
  const val = unquoteYamlScalar(rawVal);
  switch (normKey) {
    case 'type':
      if (val === 'image' || val === 'video' || val === 'pdf') {
        target.type = val;
      }
      break;
    case 'filename':
      target.filename = val;
      break;
    case 'alttext':
    case 'alt':
      target.altText = val;
      break;
    case 'width': {
      const num = Number(val);
      if (Number.isFinite(num)) target.width = num;
      break;
    }
    case 'height': {
      const num = Number(val);
      if (Number.isFinite(num)) target.height = num;
      break;
    }
    case 'sizebytes': {
      const num = Number(val);
      if (Number.isFinite(num)) target.sizeBytes = num;
      break;
    }
    case 'durationsec': {
      const num = Number(val);
      if (Number.isFinite(num)) target.durationSec = num;
      break;
    }
    case 'pages': {
      const num = Number(val);
      if (Number.isFinite(num)) target.pages = num;
      break;
    }
    case 'fps': {
      const num = Number(val);
      if (Number.isFinite(num)) target.fps = num;
      break;
    }
    case 'ishdr': {
      const b = parseBooleanValue(val);
      if (b !== undefined) target.isHdr = b;
      break;
    }
    case 'isvfr': {
      const b = parseBooleanValue(val);
      if (b !== undefined) target.isVfr = b;
      break;
    }
    case 'chromasubsampling':
      if (val === '4:2:0' || val === '4:2:2' || val === '4:4:4') {
        target.chromaSubsampling = val;
      }
      break;
    case 'hasc2pametadata': {
      const b = parseBooleanValue(val);
      if (b !== undefined) target.hasC2paMetadata = b;
      break;
    }
    case 'aspectratio':
      target.aspectRatio = val;
      break;
    default:
      break;
  }
}

export function parseCanonicalMarkdown(markdown: string): CanonicalPostDocument {
  const normalizedInput = markdown.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const frontmatter: CanonicalPostDocument['frontmatter'] = {};
  let rawBody = normalizedInput;

  const fmMatch = /^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(normalizedInput);
  const emptyFmMatch = !fmMatch
    ? /^---[ \t]*\n---[ \t]*(?:\n|$)/.exec(normalizedInput)
    : null;

  if (fmMatch) {
    const yamlBlock = fmMatch[1] ?? '';
    rawBody = normalizedInput.slice(fmMatch[0].length);
    const lines = yamlBlock.split('\n');

    let currentArrayKey: string | null = null;
    let currentListItems: string[] = [];
    let currentMediaItems: Array<Partial<MediaAttachment>> = [];
    let activeMediaObj: Partial<MediaAttachment> | null = null;

    const flushPendingList = (): void => {
      if (!currentArrayKey) return;
      const norm = normalizeFrontmatterKey(currentArrayKey);
      if (norm === 'targets') {
        const validTargets: PlatformId[] = [];
        for (const item of currentListItems) {
          const lower = item.trim().toLowerCase();
          if (isPlatformId(lower)) {
            validTargets.push(lower);
          }
        }
        frontmatter.targets = validTargets;
      } else if (norm === 'hashtags') {
        frontmatter.hashtags = currentListItems.map((item) => item.trim()).filter(Boolean);
      } else if (norm === 'media') {
        if (activeMediaObj && activeMediaObj.type) {
          currentMediaItems.push(activeMediaObj);
        }
        const validMedia = currentMediaItems.filter(
          (m): m is MediaAttachment =>
            m.type === 'image' || m.type === 'video' || m.type === 'pdf',
        );
        if (validMedia.length > 0) {
          frontmatter.media = validMedia;
        }
      }
      currentArrayKey = null;
      currentListItems = [];
      currentMediaItems = [];
      activeMediaObj = null;
    };

    for (const rawLine of lines) {
      const trimmed = rawLine.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      // Check block array item: "- value" or "- key: value"
      const listItemMatch = /^-\s*(.*)$/.exec(trimmed);
      if (listItemMatch && currentArrayKey !== null) {
        const itemContent = (listItemMatch[1] ?? '').trim();
        if (normalizeFrontmatterKey(currentArrayKey) === 'media') {
          if (activeMediaObj && activeMediaObj.type) {
            currentMediaItems.push(activeMediaObj);
          }
          activeMediaObj = {};
          const kvInList = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(itemContent);
          if (kvInList) {
            assignMediaField(activeMediaObj, kvInList[1] ?? '', kvInList[2] ?? '');
          }
        } else {
          const value = unquoteYamlScalar(itemContent);
          if (value.length > 0) {
            currentListItems.push(value);
          }
        }
        continue;
      }

      // Indented sub-property inside a media object item
      if (
        currentArrayKey !== null &&
        normalizeFrontmatterKey(currentArrayKey) === 'media' &&
        activeMediaObj !== null &&
        /^\s{2,}/.test(rawLine)
      ) {
        const subKv = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(trimmed);
        if (subKv) {
          assignMediaField(activeMediaObj, subKv[1] ?? '', subKv[2] ?? '');
          continue;
        }
      }

      // Top-level key: value
      const kvMatch = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(trimmed);
      if (!kvMatch) continue;

      flushPendingList();

      const key = kvMatch[1] ?? '';
      const rawValue = (kvMatch[2] ?? '').trim();
      const normKey = normalizeFrontmatterKey(key);

      if (rawValue === '') {
        // Expecting a block array on subsequent lines
        currentArrayKey = key;
        currentListItems = [];
        currentMediaItems = [];
        activeMediaObj = null;
        continue;
      }

      if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
        const parsedArray = parseInlineYamlArray(rawValue);
        if (normKey === 'targets') {
          frontmatter.targets = parsedArray
            .map((v) => v.trim().toLowerCase())
            .filter((v): v is PlatformId => isPlatformId(v));
        } else if (normKey === 'hashtags') {
          frontmatter.hashtags = parsedArray.map((v) => v.trim()).filter(Boolean);
        }
        continue;
      }

      const scalar = unquoteYamlScalar(rawValue);
      switch (normKey) {
        case 'id':
          frontmatter.id = scalar;
          break;
        case 'title':
          frontmatter.title = scalar;
          break;
        case 'campaign':
          frontmatter.campaign = scalar;
          break;
        case 'url':
          frontmatter.url = scalar;
          break;
        case 'sponsored': {
          const b = parseBooleanValue(scalar);
          if (b !== undefined) frontmatter.sponsored = b;
          break;
        }
        case 'aigenerated': {
          const b = parseBooleanValue(scalar);
          if (b !== undefined) frontmatter.aiGenerated = b;
          break;
        }
        case 'dmkeyword':
          frontmatter.dmKeyword = scalar;
          break;
        case 'firstcomment':
          frontmatter.firstComment = scalar;
          break;
        case 'contentwarning':
          frontmatter.contentWarning = scalar;
          break;
        default:
          break;
      }
    }

    flushPendingList();
  } else if (emptyFmMatch) {
    rawBody = normalizedInput.slice(emptyFmMatch[0].length);
  }

  const body = rawBody.trim();
  const paragraphs = body
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  const hook = paragraphs[0] ?? '';

  return {
    frontmatter,
    body,
    hook,
    paragraphs,
  };
}

function stripUrlsFromText(text: string): string {
  const spans = findUrlMatches(text);
  if (spans.length === 0) return text;

  let out = '';
  let cursor = 0;
  for (const span of spans) {
    out += text.slice(cursor, span.start);
    cursor = span.end;
  }
  out += text.slice(cursor);

  return out
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function stripTrailingHashtagLines(text: string): string {
  const lines = text.split('\n');
  while (lines.length > 0) {
    const last = (lines[lines.length - 1] ?? '').trim();
    if (last.length === 0) {
      lines.pop();
      continue;
    }
    // Check if the entire trailing line consists solely of hashtags
    const withoutTags = last.replace(/#[\p{L}\p{N}_]+/gu, '').trim();
    if (withoutTags.length === 0) {
      lines.pop();
      continue;
    }
    break;
  }
  return lines.join('\n').trim();
}

function normalizeInlineHashtagsToPascal(text: string): string {
  const urlSpans = findUrlMatches(text);
  return text.replace(/#[\p{L}\p{N}_]+/gu, (match, offset: number) => {
    const end = offset + match.length;
    for (const span of urlSpans) {
      if (offset < span.end && end > span.start) {
        return match;
      }
    }
    return toPascalCaseHashtag(match);
  });
}

function collectNormalizedHashtags(
  frontmatterTags: readonly string[] | undefined,
  bodyText: string,
  maxTags: number,
  excludeAdTag: boolean,
): string[] {
  const seen = new Set<string>();
  const collected: string[] = [];

  const pushTag = (raw: string): void => {
    const cleaned = raw.trim().replace(/^#+/, '').replace(/[^\p{L}\p{N}_-]+/gu, '');
    if (!cleaned) return;
    const pascal = toPascalCaseHashtag(`#${cleaned}`);
    const lower = pascal.toLowerCase();
    if (excludeAdTag && lower === '#ad') return;
    if (seen.has(lower)) return;
    seen.add(lower);
    collected.push(pascal);
  };

  if (frontmatterTags) {
    for (const tag of frontmatterTags) {
      pushTag(tag);
    }
  }

  for (const tag of extractHashtags(bodyText)) {
    pushTag(tag);
  }

  return collected.slice(0, Math.max(0, maxTags));
}

function removeHashtagsFromText(text: string): string {
  const urlSpans = findUrlMatches(text);
  let out = '';
  let lastIdx = 0;
  const regex = /#[\p{L}\p{N}_]+/gu;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    let insideUrl = false;
    for (const span of urlSpans) {
      if (start < span.end && end > span.start) {
        insideUrl = true;
        break;
      }
    }
    if (insideUrl) continue;
    out += text.slice(lastIdx, start);
    lastIdx = end;
  }
  out += text.slice(lastIdx);
  return out
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function prependSponsoredDisclosure(text: string): { text: string; added: boolean } {
  if (LEADING_DISCLOSURE_PATTERN.test(text)) {
    return { text, added: false };
  }
  return { text: `#Ad ${text}`.trim(), added: true };
}

function truncateToFit(
  text: string,
  fits: (candidate: string) => boolean,
  ellipsis = '…',
): string {
  if (fits(text)) return text;

  const words = text.split(/\s+/);
  let best = '';
  for (const word of words) {
    const next = best ? `${best} ${word}` : word;
    if (fits(`${next}${ellipsis}`)) {
      best = next;
    } else {
      break;
    }
  }
  if (best.length > 0) {
    return `${best}${ellipsis}`;
  }

  // Fallback grapheme-level slicing for ultra-long single tokens
  const clusters = splitGraphemes(text);
  let lo = 0;
  let hi = clusters.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const candidate = clusters.slice(0, mid).join('') + ellipsis;
    if (fits(candidate)) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return lo > 0 ? clusters.slice(0, lo).join('') + ellipsis : '';
}

function breakOpeningLineForFold(
  text: string,
  maxLine1Chars: number,
  terminateMidSentenceWithEllipsis = false,
): string {
  const lines = text.split('\n');
  const firstLine = lines[0] ?? '';
  const clusters = splitGraphemes(firstLine);
  if (clusters.length <= maxLine1Chars) {
    return text;
  }

  const budget = terminateMidSentenceWithEllipsis ? Math.max(10, maxLine1Chars - 1) : maxLine1Chars;
  // Prefer breaking at sentence boundary within budget, else word boundary
  const prefix = clusters.slice(0, budget).join('');
  let breakIdx = -1;
  let brokeAtSentence = false;
  const sentenceMatch = /^(.*[.!?])\s+/.exec(prefix);
  if (sentenceMatch && sentenceMatch[1] && sentenceMatch[1].length >= Math.floor(budget * 0.45)) {
    breakIdx = sentenceMatch[1].length;
    brokeAtSentence = true;
  } else {
    const lastSpace = prefix.lastIndexOf(' ');
    if (lastSpace >= Math.floor(budget * 0.4)) {
      breakIdx = lastSpace;
    }
  }

  if (breakIdx <= 0) {
    return text;
  }

  let head = firstLine.slice(0, breakIdx).trimEnd();
  const tail = firstLine.slice(breakIdx).trimStart();
  if (terminateMidSentenceWithEllipsis && !brokeAtSentence && /[\p{L}\p{N}]$/u.test(head)) {
    head = `${head}…`;
  }
  const rest = lines.slice(1);
  return [head, tail, ...rest].join('\n');
}

function collapseOpeningBlankLineForFold(text: string): { text: string; collapsed: boolean } {
  const paras = text
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (paras.length < 2) {
    return { text, collapsed: false };
  }
  const first = paras[0] ?? '';
  // If first paragraph already spans >= 2 physical lines, no blank line sits in the top 2 lines
  if (first.includes('\n')) {
    return { text, collapsed: false };
  }
  const second = paras[1] ?? '';
  const rest = paras.slice(2);
  const assembled = `${first}\n${second}${rest.length > 0 ? `\n\n${rest.join('\n\n')}` : ''}`;
  return { text: assembled, collapsed: true };
}

function splitUnitsBySentencesAndWords(text: string): string[] {
  const paragraphs = text
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const units: string[] = [];
  for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
    const para = paragraphs[pIdx];
    if (!para) continue;
    if (pIdx > 0) {
      units.push('\n\n');
    }
    const sentences = para.split(/(?<=[.!?])\s+/);
    for (let sIdx = 0; sIdx < sentences.length; sIdx++) {
      const sentence = sentences[sIdx]?.trim();
      if (!sentence) continue;
      if (sIdx > 0) units.push(' ');
      units.push(sentence);
    }
  }
  return units;
}

function splitChunkIntoThread(
  bodyText: string,
  fits: (candidate: string) => boolean,
  options: {
    prefixOnFirst?: string;
    suffixOnLast?: string;
    extraFinalPost?: string;
    numberPosts: boolean;
  },
): string[] {
  const prefix = options.prefixOnFirst ?? '';
  const suffix = options.suffixOnLast ?? '';

  // Fast path: single post with no extra reply post
  if (!options.extraFinalPost) {
    const single = `${prefix}${bodyText}${suffix ? `\n\n${suffix}` : ''}`.trim();
    if (fits(single)) {
      return [single];
    }
  }

  const formatNumbered = (chunk: string, idx: number, total: number): string => {
    if (!options.numberPosts || total <= 1) return chunk;
    return `${chunk}\n\n${idx}/${total}`;
  };

  // Iterative fixed-point packing so numbering digit width (e.g. 9 -> 10) never overflows
  let estimatedTotal = options.extraFinalPost ? 2 : 3;

  for (let pass = 0; pass < 4; pass++) {
    const reserveTotal = Math.max(estimatedTotal, 2);
    const fitsWithMarker = (candidate: string, idx: number): boolean =>
      fits(formatNumbered(candidate, idx, reserveTotal));

    const units = splitUnitsBySentencesAndWords(bodyText);
    const rawChunks: string[] = [];
    let current = prefix;

    const pushCurrent = (): void => {
      const trimmed = current.trim();
      if (trimmed.length > 0) {
        rawChunks.push(trimmed);
      }
      current = '';
    };

    const appendToken = (token: string): void => {
      const chunkNumber = rawChunks.length + 1;
      const isSep = token === '\n\n' || token === ' ';
      if (isSep && current.trim().length === 0) {
        return;
      }

      const candidate =
        current.length === 0
          ? token
          : isSep
            ? current + token
            : current.endsWith(' ') || current.endsWith('\n')
              ? current + token
              : `${current} ${token}`;

      if (fitsWithMarker(candidate.trim(), chunkNumber)) {
        current = candidate;
        return;
      }

      if (isSep) {
        return;
      }

      // If current already has content, flush and retry token on fresh chunk
      if (current.trim().length > 0 && current !== prefix) {
        pushCurrent();
        appendToken(token);
        return;
      }

      // Token itself exceeds a single chunk: split by words, then graphemes
      const words = token.split(/\s+/).filter(Boolean);
      if (words.length > 1) {
        for (const word of words) {
          appendToken(word);
        }
        return;
      }

      // Single indivisible word exceeds chunk: slice by graphemes
      const clusters = splitGraphemes(token);
      let pos = 0;
      while (pos < clusters.length) {
        const nextIdx = rawChunks.length + 1;
        let lo = 1;
        let hi = clusters.length - pos;
        let bestLen = 1;
        while (lo <= hi) {
          const mid = Math.floor((lo + hi) / 2);
          const slice = clusters.slice(pos, pos + mid).join('');
          const cand = current.length > 0 ? `${current}${slice}` : slice;
          if (fitsWithMarker(cand.trim(), nextIdx)) {
            bestLen = mid;
            lo = mid + 1;
          } else {
            hi = mid - 1;
          }
        }
        const piece = clusters.slice(pos, pos + bestLen).join('');
        current = current.length > 0 ? `${current}${piece}` : piece;
        pos += bestLen;
        if (pos < clusters.length) {
          pushCurrent();
        }
      }
    };

    for (const unit of units) {
      appendToken(unit);
    }
    pushCurrent();

    if (rawChunks.length === 0 && prefix.trim().length > 0) {
      rawChunks.push(prefix.trim());
    }

    // Attach suffix (e.g. hashtags / URL) to the last content chunk or a new chunk
    if (suffix.trim().length > 0) {
      const lastIdx = rawChunks.length - 1;
      const lastChunk = lastIdx >= 0 ? rawChunks[lastIdx] : undefined;
      if (lastChunk !== undefined) {
        const combined = `${lastChunk}\n\n${suffix}`;
        if (fitsWithMarker(combined, rawChunks.length)) {
          rawChunks[lastIdx] = combined;
        } else {
          rawChunks.push(suffix.trim());
        }
      } else {
        rawChunks.push(suffix.trim());
      }
    }

    // Append dedicated final reply post (e.g. X UTM link reply)
    if (options.extraFinalPost) {
      rawChunks.push(options.extraFinalPost.trim());
    }

    const actualTotal = rawChunks.length;
    const finalPosts = rawChunks.map((chunk, i) =>
      formatNumbered(chunk, i + 1, actualTotal),
    );

    const allFit = finalPosts.every((p) => fits(p));
    if (allFit && String(actualTotal).length <= String(reserveTotal).length) {
      return finalPosts;
    }

    estimatedTotal = Math.max(actualTotal, reserveTotal * 2);
  }

  // Final defensive fallback ensuring strict compliance
  const fallback = truncateToFit(`${prefix}${bodyText}${suffix ? `\n\n${suffix}` : ''}`.trim(), fits);
  return options.extraFinalPost
    ? [fallback, truncateToFit(options.extraFinalPost, fits)]
    : [fallback];
}

function compileSinglePlatform(
  doc: CanonicalPostDocument,
  platform: PlatformId,
  guardrails?: BrandGuardrails,
): CompiledPlatformArtifact {
  const spec = getPlatformSpec(platform);
  const adaptations: string[] = [];

  // 1. Strip invisible zero-width residue and normalize Unicode fancy fonts across all text fields
  const bodyClean = stripInvisibleZeroWidthChars(doc.body);
  const titleClean = doc.frontmatter.title
    ? stripInvisibleZeroWidthChars(doc.frontmatter.title)
    : { text: '', removedCount: 0, normalizedSpaces: 0 };
  const fcClean = doc.frontmatter.firstComment
    ? stripInvisibleZeroWidthChars(doc.frontmatter.firstComment)
    : { text: '', removedCount: 0, normalizedSpaces: 0 };
  const cwClean = doc.frontmatter.contentWarning
    ? stripInvisibleZeroWidthChars(doc.frontmatter.contentWarning)
    : { text: '', removedCount: 0, normalizedSpaces: 0 };

  const totalInvisibleStripped =
    bodyClean.removedCount +
    bodyClean.normalizedSpaces +
    titleClean.removedCount +
    titleClean.normalizedSpaces +
    fcClean.removedCount +
    fcClean.normalizedSpaces +
    cwClean.removedCount +
    cwClean.normalizedSpaces;
  if (totalInvisibleStripped > 0) {
    adaptations.push(
      `Cleaned ${totalInvisibleStripped} hidden zero-width/non-breaking space character(s)`,
    );
  }

  const bodyNorm = normalizeUnicodeFancyFonts(bodyClean.text);
  const titleNorm = doc.frontmatter.title
    ? normalizeUnicodeFancyFonts(titleClean.text)
    : { text: '', replacements: 0 };
  const fcNorm = doc.frontmatter.firstComment
    ? normalizeUnicodeFancyFonts(fcClean.text)
    : { text: '', replacements: 0 };
  const cwNorm = doc.frontmatter.contentWarning
    ? normalizeUnicodeFancyFonts(cwClean.text)
    : { text: '', replacements: 0 };

  const totalFancyFixes =
    bodyNorm.replacements +
    titleNorm.replacements +
    fcNorm.replacements +
    cwNorm.replacements;
  if (totalFancyFixes > 0) {
    adaptations.push(
      `Normalized ${totalFancyFixes} Unicode fancy-font character(s) to accessible ASCII`,
    );
  }

  const normalizedBody = normalizeInlineHashtagsToPascal(bodyNorm.text);
  const isSponsored = doc.frontmatter.sponsored === true;

  // 2. Build canonical UTM URL per platform when URL + campaign exist
  const rawUrl =
    doc.frontmatter.url?.trim() || findUrlMatches(normalizedBody)[0]?.value;
  const campaign = doc.frontmatter.campaign?.trim() || guardrails?.expectedCampaign?.trim();
  let utmUrl: string | undefined;
  let resolvedUrl: string | undefined = rawUrl;

  if (rawUrl && campaign) {
    utmUrl = buildCanonicalUtmUrl(rawUrl, {
      platform,
      campaign,
      medium: guardrails?.expectedUtmMedium ?? 'organic-social',
    });
    resolvedUrl = utmUrl;
    adaptations.push(`Generated canonical lowercase UTM URL for ${spec.shortName} (utm_source=${platform === 'instagram-feed' || platform === 'instagram-reels' ? 'instagram' : platform === 'youtube-shorts' ? 'youtube' : platform})`);
  }

  let posts: string[] = [];
  let firstComment: string | undefined = fcNorm.text.trim() || undefined;
  let facets: BlueskyFacet[][] | undefined;
  let dmFunnelNote: string | undefined;

  // Clean body stripped of trailing raw hashtag footer block so we re-assemble tags cleanly per platform
  const bodyWithoutFooterTags = stripTrailingHashtagLines(normalizedBody);

  switch (platform) {
    case 'x': {
      const maxAdditionalTags = isSponsored ? 1 : 2;
      const tags = collectNormalizedHashtags(
        doc.frontmatter.hashtags,
        normalizedBody,
        maxAdditionalTags,
        isSponsored,
      );
      let cleanText = stripUrlsFromText(removeHashtagsFromText(bodyWithoutFooterTags));
      if (resolvedUrl) {
        adaptations.push('Removed external URL from Post 1 and moved UTM link to final thread reply to avoid X link suppression');
      }
      if (tags.length > 0) {
        adaptations.push(`Capped hashtags to ${tags.length} PascalCase tag(s) (X <= 2 recommended)`);
      }

      const prefixOnFirst = isSponsored && !LEADING_DISCLOSURE_PATTERN.test(cleanText) ? '#Ad ' : '';
      if (prefixOnFirst) {
        adaptations.push('Prepended FTC/ASA "#Ad" disclosure above the fold');
      }

      const tagFooter = tags.join(' ');
      const xLimit = guardrails?.xPremium ? spec.counting.premiumLimit ?? 280 : 280;
      const fitsX = (candidate: string): boolean =>
        countPlatformText(candidate, 'x', { xPremium: guardrails?.xPremium }).count <= xLimit;

      const linkReply = resolvedUrl ? `Read the full details: ${resolvedUrl}` : undefined;
      if (linkReply && !firstComment) {
        firstComment = linkReply;
      }

      posts = splitChunkIntoThread(cleanText, fitsX, {
        prefixOnFirst,
        suffixOnLast: tagFooter,
        extraFinalPost: linkReply,
        numberPosts: true,
      });

      if (posts.length > 1) {
        adaptations.push(`Auto-threaded into ${posts.length} posts strictly <= ${xLimit} X-weighted chars`);
      }
      break;
    }

    case 'linkedin': {
      const maxAdditionalTags = isSponsored ? 2 : 3;
      const tags = collectNormalizedHashtags(
        doc.frontmatter.hashtags,
        normalizedBody,
        maxAdditionalTags,
        isSponsored,
      );
      const cleanBody = stripUrlsFromText(removeHashtagsFromText(bodyWithoutFooterTags));
      // Avoid blank-line starvation above LinkedIn's mobile "...more" fold
      const collapsedLinkedIn = collapseOpeningBlankLineForFold(cleanBody);
      let assembled = collapsedLinkedIn.text;
      if (collapsedLinkedIn.collapsed) {
        adaptations.push('Eliminated early blank-line fold starvation above LinkedIn mobile "...more" cutoff');
      }

      if (isSponsored) {
        const disc = prependSponsoredDisclosure(assembled);
        assembled = disc.text;
        if (disc.added) {
          adaptations.push('Prepended FTC/ASA "#Ad" disclosure above LinkedIn mobile fold');
        }
      }

      if (resolvedUrl) {
        assembled = `${assembled}\n\nFull resource linked in my Profile Featured section.`;
        adaptations.push('Moved external URL out of LinkedIn body and instant first comment to avoid reach suppression & link-bridge detection');
      }

      // Ensure firstComment does not contain a raw URL on LinkedIn
      if (firstComment && findUrlMatches(firstComment).length > 0) {
        firstComment = stripUrlsFromText(firstComment) || undefined;
        adaptations.push('Stripped URL from LinkedIn first comment to prevent instant link-bridge demotion');
      }

      if (tags.length > 0) {
        assembled = `${assembled}\n\n${tags.join(' ')}`;
        adaptations.push(`Applied ${tags.length} PascalCase hashtag(s) (LinkedIn <= 3 recommended)`);
      }

      const fitsLinkedIn = (candidate: string): boolean =>
        countPlatformText(candidate, 'linkedin').count <= spec.counting.hardLimit;
      if (!fitsLinkedIn(assembled)) {
        assembled = truncateToFit(assembled, fitsLinkedIn);
        adaptations.push('Trimmed copy to stay within LinkedIn 3,000 UTF-16 character limit');
      }

      posts = [assembled];
      break;
    }

    case 'bluesky': {
      const maxAdditionalTags = isSponsored ? 2 : 3;
      const tags = collectNormalizedHashtags(
        doc.frontmatter.hashtags,
        normalizedBody,
        maxAdditionalTags,
        isSponsored,
      );
      const cleanText = stripUrlsFromText(removeHashtagsFromText(bodyWithoutFooterTags));
      const prefixOnFirst = isSponsored && !LEADING_DISCLOSURE_PATTERN.test(cleanText) ? '#Ad ' : '';
      if (prefixOnFirst) {
        adaptations.push('Prepended FTC/ASA "#Ad" disclosure');
      }

      const suffixParts: string[] = [];
      if (resolvedUrl) {
        suffixParts.push(resolvedUrl);
        adaptations.push('Included canonical UTM link directly in Bluesky post (zero link suppression on AT Protocol)');
      }
      if (tags.length > 0) {
        suffixParts.push(tags.join(' '));
      }

      const fitsBsky = (candidate: string): boolean => {
        const res = countPlatformText(candidate, 'bluesky');
        return !res.overLimit && !res.overByteLimit;
      };

      posts = splitChunkIntoThread(cleanText, fitsBsky, {
        prefixOnFirst,
        suffixOnLast: suffixParts.join('\n'),
        numberPosts: true,
      });

      facets = posts.map((post) => extractBlueskyFacets(post));
      if (posts.length > 1) {
        adaptations.push(`Auto-threaded into ${posts.length} Bluesky posts strictly <= 300 graphemes and <= 3,000 UTF-8 bytes`);
      }
      adaptations.push('Generated exact UTF-8 byte-indexed AT Protocol rich-text facets');
      break;
    }

    case 'instagram-feed':
    case 'instagram-reels': {
      const isReels = platform === 'instagram-reels';
      const foldMaxChars = isReels ? 55 : 125;
      const maxAdditionalTags = isSponsored ? 4 : 5;
      const tags = collectNormalizedHashtags(
        doc.frontmatter.hashtags,
        normalizedBody,
        maxAdditionalTags,
        isSponsored,
      );

      let caption = stripUrlsFromText(removeHashtagsFromText(bodyWithoutFooterTags));
      if (resolvedUrl) {
        adaptations.push(`Stripped non-clickable URL from ${spec.shortName} caption`);
      }

      if (isSponsored) {
        const disc = prependSponsoredDisclosure(caption);
        caption = disc.text;
        if (disc.added) {
          adaptations.push(`Prepended "#Ad" disclosure inside ${spec.shortName} ${foldMaxChars}-char mobile fold`);
        }
      }

      const foldOptimized = breakOpeningLineForFold(caption, foldMaxChars, isReels);
      if (foldOptimized !== caption) {
        caption = foldOptimized;
        adaptations.push(`Formatted opening hook cleanly within ${spec.shortName} ${foldMaxChars}-char mobile fold`);
      }

      if (!isReels) {
        const collapsedIg = collapseOpeningBlankLineForFold(caption);
        if (collapsedIg.collapsed) {
          caption = collapsedIg.text;
          adaptations.push('Eliminated early blank-line fold starvation above IG Feed 2-line mobile fold');
        }
      }

      if (doc.frontmatter.dmKeyword) {
        const kw = doc.frontmatter.dmKeyword.trim();
        dmFunnelNote = `DM Funnel Strategy: Invite readers organically to DM "${kw}" (avoid engagement-bait phrases like "Comment ${kw} below"). Remember Meta's strict 1-private-reply-per-comment API limit and 24-hour messaging window.`;
        adaptations.push(`Generated organic DM funnel guidance for keyword "${kw}"`);
      }

      if (tags.length > 0) {
        caption = `${caption}\n\n${tags.join(' ')}`;
        adaptations.push(`Capped strictly to ${tags.length + (isSponsored ? 1 : 0)} PascalCase hashtag(s) (Instagram Dec 2025 5-hashtag cap)`);
      }

      const fitsIg = (candidate: string): boolean =>
        countPlatformText(candidate, platform).count <= spec.counting.hardLimit;
      if (!fitsIg(caption)) {
        caption = truncateToFit(caption, fitsIg);
        adaptations.push(`Trimmed caption to stay within ${spec.shortName} 2,200-char ceiling`);
      }

      posts = [caption];
      break;
    }

    case 'tiktok': {
      const maxAdditionalTags = isSponsored ? 4 : 5;
      const tags = collectNormalizedHashtags(
        doc.frontmatter.hashtags,
        normalizedBody,
        maxAdditionalTags,
        isSponsored,
      );
      let caption = stripUrlsFromText(removeHashtagsFromText(bodyWithoutFooterTags));
      if (resolvedUrl) {
        adaptations.push('Stripped non-clickable URL from TikTok caption');
      }

      if (isSponsored) {
        const disc = prependSponsoredDisclosure(caption);
        caption = disc.text;
        if (disc.added) {
          adaptations.push('Prepended "#Ad" disclosure above TikTok 80-char mobile fold');
        }
      }

      caption = breakOpeningLineForFold(caption, 80);
      const collapsedTt = collapseOpeningBlankLineForFold(caption);
      if (collapsedTt.collapsed) {
        caption = collapsedTt.text;
        adaptations.push('Eliminated early blank-line fold starvation above TikTok 2-line mobile fold');
      }

      if (tags.length > 0) {
        caption = `${caption}\n\n${tags.join(' ')}`;
        adaptations.push(`Capped strictly to ${tags.length + (isSponsored ? 1 : 0)} PascalCase hashtag(s) (TikTok 5-hashtag hard cap)`);
      }

      // Strictly enforce TikTok Content Posting API 2,200-char ceiling
      const apiLimit = spec.counting.apiHardLimit ?? 2200;
      const fitsTikTokApi = (candidate: string): boolean =>
        countPlatformText(candidate, 'tiktok', { publishViaApi: true }).count <= apiLimit;
      if (!fitsTikTokApi(caption)) {
        caption = truncateToFit(caption, fitsTikTokApi);
        adaptations.push('Enforced TikTok Content Posting API 2,200-char limit to prevent silent truncation');
      }

      posts = [caption];
      break;
    }

    case 'youtube-shorts': {
      const maxAdditionalTags = isSponsored ? 4 : 5;
      const tags = collectNormalizedHashtags(
        doc.frontmatter.hashtags,
        normalizedBody,
        maxAdditionalTags,
        isSponsored,
      );

      const rawTitleSource = (titleNorm.text.trim() || doc.hook || normalizedBody)
        .replace(/\n+/g, ' ')
        .replace(/[<>]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      let cleanTitle = stripUrlsFromText(removeHashtagsFromText(rawTitleSource));

      if (/[<>]/.test(doc.frontmatter.title ?? doc.body)) {
        adaptations.push('Stripped forbidden angle brackets (< and >) rejected by YouTube API');
      }
      if (resolvedUrl) {
        adaptations.push('Removed non-clickable URL from Shorts title (use native Related Video link instead)');
      }

      if (isSponsored) {
        const disc = prependSponsoredDisclosure(cleanTitle);
        cleanTitle = disc.text;
        if (disc.added) {
          adaptations.push('Prepended "#Ad" disclosure inside YouTube Shorts 40-char mobile fold');
        }
      }

      const fitsShorts = (candidate: string): boolean =>
        countPlatformText(candidate, 'youtube-shorts').count <= 100;

      // Ensure crisp title <= 100 chars with key hook in first 45 chars + up to 5 fitting hashtags
      if (!fitsShorts(cleanTitle)) {
        cleanTitle = truncateToFit(cleanTitle, fitsShorts);
      }

      const appliedTags: string[] = [];
      for (const tag of tags) {
        const candidate = `${cleanTitle} ${tag}`.trim();
        if (fitsShorts(candidate)) {
          cleanTitle = candidate;
          appliedTags.push(tag);
        } else {
          break;
        }
      }

      if (appliedTags.length > 0) {
        adaptations.push(`Compiled <= 100-char Shorts title with ${appliedTags.length} PascalCase hashtag(s)`);
      } else {
        adaptations.push('Compiled crisp <= 100-char YouTube Shorts title front-loaded within 45 chars');
      }

      posts = [cleanTitle];
      break;
    }

    case 'threads': {
      // Threads strictly allows 1 topic tag total (if #Ad is prepended, avoid adding a 2nd hashtag)
      const tags = isSponsored
        ? []
        : collectNormalizedHashtags(doc.frontmatter.hashtags, normalizedBody, 1, false).map(
            (t) => t.slice(0, 50),
          );

      const cleanText = stripUrlsFromText(removeHashtagsFromText(bodyWithoutFooterTags));
      const prefixOnFirst = isSponsored && !LEADING_DISCLOSURE_PATTERN.test(cleanText) ? '#Ad ' : '';
      if (prefixOnFirst) {
        adaptations.push('Prepended "#Ad" disclosure (reserving Threads 1-tag ceiling)');
      } else if (tags.length === 1) {
        adaptations.push(`Reduced hashtags to strictly 1 Threads topic tag (${tags[0]})`);
      }

      if (resolvedUrl) {
        firstComment = firstComment
          ? `${firstComment}\n${resolvedUrl}`
          : `Link: ${resolvedUrl}`;
        adaptations.push('Moved external UTM URL into Threads follow-up reply to preserve reply velocity');
      }

      const fitsThreads = (candidate: string): boolean =>
        countPlatformText(candidate, 'threads').count <= spec.counting.hardLimit;

      posts = splitChunkIntoThread(cleanText, fitsThreads, {
        prefixOnFirst,
        suffixOnLast: tags.join(' '),
        numberPosts: true,
      });

      if (posts.length > 1) {
        adaptations.push(`Split into ${posts.length} Threads replies strictly <= 500 emoji-UTF8 units`);
      }
      break;
    }

    case 'mastodon': {
      const maxAdditionalTags = isSponsored ? 4 : 5;
      const tags = collectNormalizedHashtags(
        doc.frontmatter.hashtags,
        normalizedBody,
        maxAdditionalTags,
        isSponsored,
      );
      const cleanText = stripUrlsFromText(removeHashtagsFromText(bodyWithoutFooterTags));
      const prefixOnFirst = isSponsored && !LEADING_DISCLOSURE_PATTERN.test(cleanText) ? '#Ad ' : '';
      if (prefixOnFirst) {
        adaptations.push('Prepended "#Ad" disclosure');
      }

      const contentWarning = cwNorm.text.trim() || undefined;
      if (contentWarning) {
        adaptations.push('Preserved Mastodon Content Warning (counted toward total character budget)');
      }

      const suffixParts: string[] = [];
      if (resolvedUrl) {
        suffixParts.push(resolvedUrl);
        adaptations.push('Included direct canonical UTM URL (23-char flat weight, zero link penalty on Fediverse)');
      }
      if (tags.length > 0) {
        suffixParts.push(tags.join(' '));
        adaptations.push(`Formatted ${tags.length} PascalCase Fediverse discovery hashtag(s)`);
      }

      const mastodonLimit = guardrails?.mastodonMaxChars ?? spec.counting.hardLimit;
      const fitsMastodon = (candidate: string): boolean =>
        countPlatformText(candidate, 'mastodon', {
          contentWarning,
          mastodonMaxChars: mastodonLimit,
        }).count <= mastodonLimit;

      posts = splitChunkIntoThread(cleanText, fitsMastodon, {
        prefixOnFirst,
        suffixOnLast: suffixParts.join('\n\n'),
        numberPosts: true,
      });

      if (posts.length > 1) {
        adaptations.push(`Auto-threaded into ${posts.length} Mastodon posts strictly <= ${mastodonLimit} chars`);
      }
      break;
    }
  }

  // Run lintForPlatform on compiled artifact to populate lintSummary
  const draftToLint: SocialDraft = {
    id: doc.frontmatter.id,
    text: posts[0] ?? '',
    title: platform === 'youtube-shorts' ? posts[0] : doc.frontmatter.title,
    firstComment,
    contentWarning: platform === 'mastodon' ? cwNorm.text.trim() || undefined : undefined,
    isSponsored,
    isAiGenerated: doc.frontmatter.aiGenerated,
    media: doc.frontmatter.media,
    publishViaApi: guardrails?.useApiLimits ?? platform === 'tiktok',
  };

  const lintReport = lintForPlatform(draftToLint, platform, guardrails);

  const artifact: CompiledPlatformArtifact = {
    platform,
    platformName: spec.name,
    posts,
    lintSummary: {
      score: lintReport.score,
      errors: lintReport.errorCount,
      warnings: lintReport.warningCount,
    },
    adaptationsApplied: adaptations,
  };

  if (firstComment !== undefined) {
    artifact.firstComment = firstComment;
  }
  if (facets !== undefined) {
    artifact.facets = facets;
  }
  if (utmUrl !== undefined) {
    artifact.utmUrl = utmUrl;
  }
  if (dmFunnelNote !== undefined) {
    artifact.dmFunnelNote = dmFunnelNote;
  }

  return artifact;
}

export function compileCanonicalPost(
  input: string | CanonicalPostDocument,
  targets?: PlatformId[],
  guardrails?: BrandGuardrails,
): CompilationBundle {
  const doc = typeof input === 'string' ? parseCanonicalMarkdown(input) : input;

  const rawTargets: PlatformId[] =
    targets && targets.length > 0
      ? targets
      : doc.frontmatter.targets && doc.frontmatter.targets.length > 0
        ? doc.frontmatter.targets
        : [...PLATFORM_IDS];

  const uniqueTargets = Array.from(new Set(rawTargets));
  const artifacts = uniqueTargets.map((platform) =>
    compileSinglePlatform(doc, platform, guardrails),
  );

  return {
    sourceId: doc.frontmatter.id?.trim() || 'canonical-post',
    compiledAt: new Date().toISOString(),
    artifacts,
  };
}
