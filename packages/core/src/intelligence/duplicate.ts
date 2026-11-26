import type { DuplicateCheckInput, DuplicateCollision } from '../types.js';

const URL_STRIP_PATTERN = /https?:\/\/\S+/gi;
const NON_WORD_PATTERN = /[^\p{L}\p{N}\s]+/gu;

function normalizeText(text: string): string {
  return text
    .replace(URL_STRIP_PATTERN, ' ')
    .toLowerCase()
    .replace(NON_WORD_PATTERN, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(normalized: string): string[] {
  if (!normalized) return [];
  return normalized.split(' ').filter((token) => token.length > 0);
}

function buildShingles(tokens: string[], k: number): Set<string> {
  const shingles = new Set<string>();
  if (k <= 0 || tokens.length < k) return shingles;
  for (let i = 0; i <= tokens.length - k; i++) {
    shingles.add(tokens.slice(i, i + k).join(' '));
  }
  return shingles;
}

function computeJaccard(tokensA: string[], tokensB: string[], exactMatch: boolean): number {
  if (exactMatch) return 1;
  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  // Use 3-word shingles when both posts have >= 3 words, falling back to 2-word (or 1-word) for short posts
  const k = Math.min(3, tokensA.length, tokensB.length);
  const setA = buildShingles(tokensA, k);
  const setB = buildShingles(tokensB, k);

  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const shingle of setA) {
    if (setB.has(shingle)) {
      intersection++;
    }
  }

  const union = setA.size + setB.size - intersection;
  if (union === 0) return 0;
  return Math.round((intersection / union) * 1000) / 1000;
}

function parseTimestampMs(iso?: string): number | null {
  if (!iso) return null;
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? null : parsed;
}

const RISK_RANK: Record<DuplicateCollision['risk'], number> = {
  critical: 3,
  high: 2,
  moderate: 1,
};

function higherRisk(
  a: DuplicateCollision['risk'],
  b: DuplicateCollision['risk'],
): DuplicateCollision['risk'] {
  return RISK_RANK[a] >= RISK_RANK[b] ? a : b;
}

export interface DuplicateDetectionOptions {
  similarityThreshold?: number;
  linkedinCooldownHours?: number;
}

export function detectDuplicatesAndCannibalization(
  items: DuplicateCheckInput[],
  options?: DuplicateDetectionOptions,
): DuplicateCollision[] {
  const moderateThreshold = options?.similarityThreshold ?? 0.45;
  const highThreshold = Math.max(0.7, moderateThreshold);
  const linkedinCooldownHours = options?.linkedinCooldownHours ?? 24;

  const prepared = items.map((item) => {
    const normalized = normalizeText(item.text);
    return {
      item,
      normalized,
      tokens: tokenize(normalized),
      timestampMs: parseTimestampMs(item.publishedAt),
    };
  });

  const collisions: DuplicateCollision[] = [];

  for (let i = 0; i < prepared.length; i++) {
    const entryA = prepared[i];
    if (!entryA) continue;

    for (let j = i + 1; j < prepared.length; j++) {
      const entryB = prepared[j];
      if (!entryB) continue;

      const exactMatch =
        entryA.normalized.length > 0 && entryA.normalized === entryB.normalized;
      const jaccardSimilarity = computeJaccard(
        entryA.tokens,
        entryB.tokens,
        exactMatch,
      );

      let hoursApart: number | undefined;
      let cannibalizationWarning: string | undefined;

      if (
        entryA.item.platform === 'linkedin' &&
        entryB.item.platform === 'linkedin' &&
        entryA.timestampMs !== null &&
        entryB.timestampMs !== null
      ) {
        const diffHours =
          Math.round((Math.abs(entryA.timestampMs - entryB.timestampMs) / 3_600_000) * 100) /
          100;
        hoursApart = diffHours;
        if (diffHours < linkedinCooldownHours) {
          cannibalizationWarning = `LinkedIn 18-24h cannibalization window: "${entryA.item.id}" and "${entryB.item.id}" are only ${diffHours}h apart (< ${linkedinCooldownHours}h cooldown). Publishing a second post within 24h splits feed dwell velocity and prematurely terminates distribution of the first post.`;
        }
      }

      const isCopyDuplicate = exactMatch || jaccardSimilarity >= moderateThreshold;
      const isCannibalizing = cannibalizationWarning !== undefined;

      if (!isCopyDuplicate && !isCannibalizing) {
        continue;
      }

      let risk: DuplicateCollision['risk'] = 'moderate';
      let recommendation = '';

      if (exactMatch) {
        risk = 'critical';
        recommendation =
          'Exact duplicate copy detected. X automation rules suspend duplicate-posting accounts and Instagram applies a 30-day originality/aggregator penalty. Rewrite the angle, hook, and phrasing before publishing.';
      } else if (jaccardSimilarity >= highThreshold) {
        risk = 'high';
        recommendation = `Near-duplicate copy (${Math.round(jaccardSimilarity * 100)}% shingle overlap) risks X automation/spam penalties and Instagram's 30-day originality demotion. Substantially rewrite the hook, body structure, and examples.`;
      } else if (jaccardSimilarity >= moderateThreshold) {
        risk = 'moderate';
        recommendation = `Evergreen recycling fatigue detected (${Math.round(jaccardSimilarity * 100)}% overlap). Reframe the opening hook, audience perspective, and concrete proof points before reposting.`;
      } else if (isCannibalizing) {
        risk = hoursApart !== undefined && hoursApart < 18 ? 'high' : 'moderate';
        recommendation = `Space LinkedIn posts at least ${linkedinCooldownHours} hours apart so the earlier post can complete its feed distribution cycle without self-cannibalization.`;
      }

      if (isCopyDuplicate && isCannibalizing) {
        const cannibalRisk: DuplicateCollision['risk'] =
          hoursApart !== undefined && hoursApart < 18 ? 'high' : 'moderate';
        risk = higherRisk(risk, cannibalRisk);
        recommendation = `${recommendation} Also delay the second LinkedIn post beyond the ${linkedinCooldownHours}h cooldown window.`;
      }

      const collision: DuplicateCollision = {
        draftA: entryA.item.id,
        draftB: entryB.item.id,
        exactMatch,
        jaccardSimilarity,
        risk,
        recommendation,
      };

      if (hoursApart !== undefined) {
        collision.hoursApart = hoursApart;
      }
      if (cannibalizationWarning !== undefined) {
        collision.cannibalizationWarning = cannibalizationWarning;
      }

      collisions.push(collision);
    }
  }

  collisions.sort((a, b) => {
    const rankDiff = RISK_RANK[b.risk] - RISK_RANK[a.risk];
    if (rankDiff !== 0) return rankDiff;
    return b.jaccardSimilarity - a.jaccardSimilarity;
  });

  return collisions;
}
