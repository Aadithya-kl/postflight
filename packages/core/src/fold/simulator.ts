import type { FoldPreview, PlatformFoldSimulation, PlatformId } from '../types.js';
import { getPlatformSpec } from '../specs/registry.js';

const graphemeSegmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });

const MOBILE_CHARS_PER_LINE = 48;
const DESKTOP_CHARS_PER_LINE = 68;

export interface FoldSimulationOptions {
  hasMedia?: boolean;
}

function splitGraphemes(text: string): string[] {
  const clusters: string[] = [];
  for (const { segment } of graphemeSegmenter.segment(text)) {
    clusters.push(segment);
  }
  return clusters;
}

function findSoftWrapLength(clusters: readonly string[], start: number, maxPerLine: number): number {
  const remaining = clusters.length - start;
  if (remaining <= maxPerLine) {
    return remaining;
  }

  // Prefer breaking after the last whitespace within the visual line width
  const windowEnd = start + maxPerLine;
  for (let i = windowEnd; i > start; i--) {
    const ch = clusters[i - 1];
    if (ch !== undefined && /\s/.test(ch)) {
      return i - start;
    }
  }

  // No whitespace found in window; hard-wrap at line width
  return maxPerLine;
}

function simulateSurfaceFold(
  normalizedText: string,
  surface: 'mobile' | 'desktop',
  charLimit: number | null,
  lineLimit: number | null,
  blankLinesCountAsLines: boolean,
  foldLabel: string,
): FoldPreview {
  if (normalizedText.length === 0) {
    return {
      surface,
      truncated: false,
      visibleText: '',
      hiddenText: '',
      visibleChars: 0,
      visibleLines: 0,
      charLimit,
      lineLimit,
      foldLabel,
      blankLinesConsumed: 0,
      reason: 'none',
    };
  }

  const baseCharsPerLine = surface === 'mobile' ? MOBILE_CHARS_PER_LINE : DESKTOP_CHARS_PER_LINE;
  // Single-line overlays (e.g. IG Reels 55-char 1-line HUD) fit their full single-line char budget on line 1
  const charsPerLine =
    lineLimit === 1 && charLimit !== null
      ? Math.max(baseCharsPerLine, charLimit)
      : baseCharsPerLine;

  const physicalLines = normalizedText.split('\n');
  const visibleParts: string[] = [];
  const hiddenParts: string[] = [];

  let visibleLines = 0;
  let visibleCharCount = 0;
  let blankLinesConsumed = 0;
  let hitCharLimit = false;
  let hitLineLimit = false;
  let stopped = false;

  for (let lineIdx = 0; lineIdx < physicalLines.length; lineIdx++) {
    const lineText = physicalLines[lineIdx] ?? '';

    if (stopped) {
      hiddenParts.push((hiddenParts.length > 0 ? '\n' : '') + lineText);
      continue;
    }

    const isBlankLine = lineText.trim().length === 0;
    const hasPrecedingNewline = lineIdx > 0;

    if (isBlankLine) {
      const hasContentAfter = physicalLines.slice(lineIdx + 1).some((l) => l.length > 0);
      const newlineCost = hasPrecedingNewline ? 1 : 0;

      if (blankLinesCountAsLines) {
        if (lineLimit !== null && visibleLines >= lineLimit) {
          if (hasContentAfter) {
            hitLineLimit = true;
            stopped = true;
            hiddenParts.push(lineText);
          }
          continue;
        }
        if (charLimit !== null && visibleCharCount + newlineCost > charLimit) {
          if (hasContentAfter) {
            hitCharLimit = true;
            stopped = true;
            hiddenParts.push(lineText);
          }
          continue;
        }

        if (hasPrecedingNewline) {
          visibleParts.push('\n');
          visibleCharCount += 1;
        }
        visibleLines += 1;
        blankLinesConsumed += 1;
      } else {
        if (charLimit !== null && visibleCharCount + newlineCost > charLimit) {
          if (hasContentAfter) {
            hitCharLimit = true;
            stopped = true;
            hiddenParts.push(lineText);
          }
          continue;
        }
        if (hasPrecedingNewline) {
          visibleParts.push('\n');
          visibleCharCount += 1;
        }
      }
      continue;
    }

    // Non-blank physical line
    if (lineLimit !== null && visibleLines >= lineLimit) {
      hitLineLimit = true;
      stopped = true;
      hiddenParts.push(lineText);
      continue;
    }

    if (hasPrecedingNewline) {
      if (charLimit !== null && visibleCharCount + 1 >= charLimit) {
        hitCharLimit = true;
        if (lineLimit !== null && visibleLines >= lineLimit) {
          hitLineLimit = true;
        }
        stopped = true;
        hiddenParts.push(lineText);
        continue;
      }
      visibleParts.push('\n');
      visibleCharCount += 1;
    }

    const clusters = splitGraphemes(lineText);
    let pos = 0;

    while (pos < clusters.length) {
      if (lineLimit !== null && visibleLines >= lineLimit) {
        hitLineLimit = true;
        stopped = true;
        hiddenParts.push(clusters.slice(pos).join(''));
        break;
      }

      const remainingCharBudget =
        charLimit !== null ? charLimit - visibleCharCount : Number.POSITIVE_INFINITY;

      if (remainingCharBudget <= 0) {
        hitCharLimit = true;
        stopped = true;
        hiddenParts.push(clusters.slice(pos).join(''));
        break;
      }

      const wrapLen = findSoftWrapLength(clusters, pos, charsPerLine);

      if (wrapLen > remainingCharBudget) {
        const taken = clusters.slice(pos, pos + remainingCharBudget).join('');
        visibleParts.push(taken);
        visibleCharCount += remainingCharBudget;
        visibleLines += 1;
        pos += remainingCharBudget;
        hitCharLimit = true;
        stopped = true;
        hiddenParts.push(clusters.slice(pos).join(''));
        break;
      }

      const taken = clusters.slice(pos, pos + wrapLen).join('');
      visibleParts.push(taken);
      visibleCharCount += wrapLen;
      visibleLines += 1;
      pos += wrapLen;

      const hasMoreInLine = pos < clusters.length;
      const hasMorePhysicalLines = lineIdx + 1 < physicalLines.length;
      const hasMoreNonEmptyContent =
        hasMoreInLine ||
        (hasMorePhysicalLines &&
          physicalLines.slice(lineIdx + 1).some((l) => l.trim().length > 0));

      if (hasMoreNonEmptyContent && charLimit !== null && visibleCharCount >= charLimit) {
        hitCharLimit = true;
        if (lineLimit !== null && visibleLines >= lineLimit) {
          hitLineLimit = true;
        }
        stopped = true;
        if (hasMoreInLine) {
          hiddenParts.push(clusters.slice(pos).join(''));
        }
        break;
      }
    }
  }

  const rawVisible = visibleParts.join('');
  const rawHidden = hiddenParts.join('');
  const hasRealHidden = rawHidden.trim().length > 0;

  if (!hasRealHidden) {
    const cleanFull = normalizedText;
    return {
      surface,
      truncated: false,
      visibleText: cleanFull,
      hiddenText: '',
      visibleChars: splitGraphemes(cleanFull).length,
      visibleLines,
      charLimit,
      lineLimit,
      foldLabel,
      blankLinesConsumed,
      reason: 'none',
    };
  }

  const visibleText = rawVisible.replace(/\n+$/, '');
  const hiddenText = rawHidden.replace(/^\n+/, '');

  let reason: FoldPreview['reason'] = 'none';
  if (hitCharLimit && hitLineLimit) {
    reason = 'both';
  } else if (hitCharLimit) {
    reason = 'char-limit';
  } else if (hitLineLimit) {
    reason = 'line-limit';
  }

  return {
    surface,
    truncated: true,
    visibleText,
    hiddenText,
    visibleChars: splitGraphemes(visibleText).length,
    visibleLines,
    charLimit,
    lineLimit,
    foldLabel,
    blankLinesConsumed,
    reason,
  };
}

export function simulatePlatformFold(
  text: string,
  platform: PlatformId,
  options?: FoldSimulationOptions,
): PlatformFoldSimulation {
  const spec = getPlatformSpec(platform);
  const hasMedia = Boolean(options?.hasMedia);
  const normalized = text.replace(/\r\n/g, '\n');

  const mobileCharLimit = hasMedia
    ? spec.folds.mobileCharsWithMedia
    : spec.folds.mobileChars;
  const mobileLineLimit = hasMedia
    ? spec.folds.mobileLinesWithMedia
    : spec.folds.mobileLines;

  const desktopCharLimit = hasMedia
    ? spec.folds.desktopCharsWithMedia
    : spec.folds.desktopChars;
  const desktopLineLimit = hasMedia
    ? spec.folds.desktopLinesWithMedia
    : spec.folds.desktopLines;

  return {
    platform,
    hasMedia,
    mobile: simulateSurfaceFold(
      normalized,
      'mobile',
      mobileCharLimit,
      mobileLineLimit,
      spec.folds.blankLinesCountAsLines,
      spec.folds.foldLabel,
    ),
    desktop: simulateSurfaceFold(
      normalized,
      'desktop',
      desktopCharLimit,
      desktopLineLimit,
      spec.folds.blankLinesCountAsLines,
      spec.folds.foldLabel,
    ),
  };
}
