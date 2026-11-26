import type { CommentIntent, CommentItem, PlatformId, TriagedComment } from '../types.js';

interface SignalRule {
  label: string;
  pattern: RegExp;
  weight?: number;
}

const CRISIS_RULES: readonly SignalRule[] = [
  { label: 'outage', pattern: /\boutage\b/i, weight: 3 },
  { label: 'hacked', pattern: /\bhacked\b/i, weight: 3 },
  { label: 'breach', pattern: /\bbreach(?:ed|es)?\b/i, weight: 3 },
  { label: 'scam', pattern: /\bscam(?:mer|med|s)?\b/i, weight: 2 },
  { label: 'fraud', pattern: /\bfraud(?:ulent)?\b/i, weight: 3 },
  { label: 'lawsuit', pattern: /\blawsuit(?:s)?\b|\bsuing\b|\blegal\s+action\b/i, weight: 3 },
  {
    label: 'service-down',
    pattern:
      /\b(?:site|app|service|server|servers|platform|checkout|dashboard|api|everything|system)\s+(?:is|are|went|still)?\s*down\b|\bdown\s+(?:right\s+now|again|for\s+everyone|globally)\b/i,
    weight: 2,
  },
  {
    label: 'refund-stolen',
    pattern:
      /\brefund\s+stolen\b|\bstolen\s+(?:money|card|funds|account|data)\b|\bunauthorized\s+charge/i,
    weight: 3,
  },
  {
    label: 'broken-checkout',
    pattern:
      /\bbroken\s+checkout\b|\bcheckout\s+(?:is\s+)?broken\b|\bcan(?:'t|not)\s+(?:pay|checkout)\b/i,
    weight: 3,
  },
  {
    label: 'security-vulnerability',
    pattern: /\bsecurity\s+vulnerabilit(?:y|ies)\b|\bdata\s+leak\b|\bzero[- ]day\b|\bexploit\b/i,
    weight: 3,
  },
  {
    label: 'regulator',
    pattern: /\bregulator(?:s|y)?\b|\bftc\b|\bsec\b|\bfinra\b|\bgdpr\s+violation\b|\battorney\s+general\b/i,
    weight: 2,
  },
];

const BOT_SPAM_RULES: readonly SignalRule[] = [
  { label: 'telegram-dm-spam', pattern: /\bdm\s+me\s+on\s+(?:telegram|whatsapp|insta|ig)\b/i },
  { label: 'bio-promo-spam', pattern: /\bcheck\s+(?:out\s+)?my\s+bio\b|\blink\s+in\s+my\s+bio\b/i },
  { label: 'promote-spam', pattern: /\bpromote\s+(?:it|this|your\s+\w+)\s+on\b/i },
  { label: 'whatsapp-number-spam', pattern: /\bwhatsapp\s*\+?\s*\d/i },
  { label: 'telegram-link-spam', pattern: /\bt\.me\/[a-z0-9_]+/i },
  {
    label: 'crypto-recovery-spam',
    pattern:
      /\b(?:crypto|forex|bitcoin|usdt|wallet|trading)\b.*\b(?:dm\s+me|guaranteed\s+profit|signals|recover(?:ed|y)\s+my\s+account)\b/i,
  },
];

const BUYER_INTENT_RULES: readonly SignalRule[] = [
  { label: 'pricing', pattern: /\bpric(?:e|es|ing)\b/i, weight: 3 },
  { label: 'cost', pattern: /\bcost(?:s)?\b/i, weight: 2 },
  { label: 'how-much', pattern: /\bhow\s+much\b/i, weight: 3 },
  { label: 'link-request', pattern: /\blink\s*\?|\bwhere(?:'s|\s+is)\s+(?:the\s+)?link\b|\bsend\s+(?:the\s+)?link\b/i, weight: 2 },
  { label: 'demo', pattern: /\bdemo\b/i, weight: 3 },
  { label: 'trial', pattern: /\btrial\b/i, weight: 2 },
  { label: 'enterprise', pattern: /\benterprise\b/i, weight: 3 },
  { label: 'integration', pattern: /\bintegrat(?:e|es|ing|ion)\s+with\b|\bintegrations?\b/i, weight: 2 },
  { label: 'api', pattern: /\bapi\b/i, weight: 2 },
  { label: 'shipping', pattern: /\bship(?:ping)?\s+to\b/i, weight: 2 },
  { label: 'discount', pattern: /\bdiscount\b|\bcoupon\b|\bpromo\s+code\b/i, weight: 2 },
  { label: 'where-to-buy', pattern: /\bwhere\s+(?:to|can\s+i)\s+buy\b|\bhow\s+(?:to|do\s+i)\s+buy\b/i, weight: 3 },
  { label: 'sign-up', pattern: /\bsign\s*up\b|\bsubscribe\b|\bget\s+started\b/i, weight: 2 },
  { label: 'availability', pattern: /\bavailable\s+in\b/i, weight: 2 },
  { label: 'compatibility', pattern: /\bdoes\s+(?:it|this)\s+work\s+with\b/i, weight: 2 },
];

const SUPPORT_RULES: readonly SignalRule[] = [
  { label: 'bug', pattern: /\bbug(?:s)?\b/i },
  { label: 'error', pattern: /\berror(?:s)?\b/i },
  { label: 'crash', pattern: /\bcrash(?:es|ed|ing)?\b/i },
  { label: 'login-failure', pattern: /\bcan(?:'t|not)\s+log\s*in\b|\blogin\s+(?:broken|failed|error|issue)\b/i },
  { label: 'not-working', pattern: /\bnot\s+working\b|\bdoesn(?:'t|t)\s+work\b|\bstopped\s+working\b/i },
  { label: 'help', pattern: /\bhelp\b/i },
  { label: 'stuck', pattern: /\bstuck\b/i },
  { label: 'issue', pattern: /\bissue(?:s)?\b|\bproblem\b|\bfailing\b/i },
];

const FEEDBACK_RULES: readonly SignalRule[] = [
  { label: 'feature-request', pattern: /\bfeature\s+request\b/i },
  { label: 'wish-it-had', pattern: /\bwish\s+(?:it|you)\s+had\b|\bwish\s+there\s+(?:was|were)\b/i },
  { label: 'would-love', pattern: /\bwould\s+love\b/i },
  { label: 'suggestion', pattern: /\bsuggestion(?:s)?\b|\bsuggest\b/i },
  { label: 'roadmap', pattern: /\broadmap\b|\bany\s+plans\s+(?:to|for)\b|\bplease\s+add\b/i },
];

const GENERIC_NOISE_PATTERN =
  /^(?:nice|fire|cool|awesome|great|amazing|love|lit|wow|facts|true|based|this|same|first|lol|lmao|yep|yes|great\s+post|nice\s+post|good\s+post|love\s+this|so\s+good|well\s+said|thanks|thx|gg)$/i;

const FINANCIAL_CLAIM_PATTERN =
  /\b(?:returns?|apy|apr|yield|guaranteed\s+(?:return|profit)|investment\s+fees?|advisory\s+fees?|management\s+fees?|performance\s+history|roi\s+guarantee|financial\s+advice|stock\s+pick|portfolio\s+returns?)\b/i;

const PUBLIC_PII_PATTERN =
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b|\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b|\b(?:\d[ -]*?){13,16}\b/;

const META_PRIVATE_REPLY_PLATFORMS = new Set<PlatformId>([
  'instagram-feed',
  'instagram-reels',
  'threads',
]);

function matchRules(text: string, rules: readonly SignalRule[]): { labels: string[]; weight: number } {
  const labels: string[] = [];
  let weight = 0;
  for (const rule of rules) {
    if (rule.pattern.test(text)) {
      labels.push(rule.label);
      weight += rule.weight ?? 1;
    }
  }
  return { labels, weight };
}

function isEmojiOnlyOrGenericNoise(text: string): { isNoise: boolean; signal?: string } {
  const strippedToWords = text
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (strippedToWords.length === 0) {
    return { isNoise: true, signal: 'emoji-only' };
  }

  if (GENERIC_NOISE_PATTERN.test(strippedToWords)) {
    return { isNoise: true, signal: 'generic-single-word-praise' };
  }

  return { isNoise: false };
}

const PRIORITY_RANK: Record<TriagedComment['priority'], number> = {
  P0: 4,
  P1: 3,
  P2: 2,
  P3: 1,
};

const INTENT_ORDER: Record<CommentIntent, number> = {
  'crisis-urgent': 6,
  'buyer-intent': 5,
  support: 4,
  feedback: 3,
  community: 2,
  'bot-noise': 1,
};

function buildComplianceNotes(
  comment: CommentItem,
  intent: CommentIntent,
): { complianceFlag?: string; metaNote?: string } {
  const flags: string[] = [];
  let metaNote: string | undefined;

  if (FINANCIAL_CLAIM_PATTERN.test(comment.text)) {
    flags.push(
      'FINRA Rule 2210 / Financial Claim Supervision: Comment asks about investment returns, yield, or advisory fees. Route response through a registered compliance principal before posting any numeric return or fee claims.',
    );
  }

  if (PUBLIC_PII_PATTERN.test(comment.text)) {
    flags.push(
      'GDPR / Privacy PII Exposure: Public comment contains an email address, phone number, or multi-digit card/account number. Hide or redact before replying publicly.',
    );
  }

  if (
    META_PRIVATE_REPLY_PLATFORMS.has(comment.platform) &&
    (intent === 'buyer-intent' || intent === 'support' || intent === 'crisis-urgent')
  ) {
    metaNote =
      'Meta API constraint: Strictly 1 private DM reply is permitted per comment, and follow-up messaging closes after the 24-hour customer service window.';
    flags.push(metaNote);
  }

  return {
    complianceFlag: flags.length > 0 ? flags.join(' | ') : undefined,
    metaNote,
  };
}

function classifySingleComment(comment: CommentItem): TriagedComment {
  const text = comment.text.trim();

  // 1. Crisis / Urgent always wins (P0, 15 min SLA)
  const crisis = matchRules(text, CRISIS_RULES);
  if (crisis.labels.length > 0) {
    const score = Math.min(100, 94 + crisis.weight);
    const { complianceFlag, metaNote } = buildComplianceNotes(comment, 'crisis-urgent');
    const action = metaNote
      ? `Escalate immediately to on-call comms/incident lead (<= 15m SLA), acknowledge publicly without speculating, and move account specifics to private channel. ${metaNote}`
      : 'Escalate immediately to on-call comms/incident lead (<= 15m SLA), acknowledge publicly without speculating, and move account specifics to a private support ticket.';
    const result: TriagedComment = {
      comment,
      intent: 'crisis-urgent',
      priority: 'P0',
      score,
      matchedSignals: crisis.labels,
      recommendedSlaMinutes: 15,
      suggestedAction: action,
    };
    if (complianceFlag) result.complianceFlag = complianceFlag;
    return result;
  }

  // 2. Bot / Spam patterns (check before buyer/support to block DM-promo spam)
  const spam = matchRules(text, BOT_SPAM_RULES);
  if (spam.labels.length > 0) {
    return {
      comment,
      intent: 'bot-noise',
      priority: 'P3',
      score: 5,
      matchedSignals: spam.labels,
      recommendedSlaMinutes: 0,
      suggestedAction: 'Hide/remove spam comment and block repeat bot account; no reply needed.',
    };
  }

  // 3. High-Intent Buyer (P0/P1, 30 min SLA)
  const buyer = matchRules(text, BUYER_INTENT_RULES);
  if (buyer.labels.length > 0) {
    const isTopBuyer = buyer.labels.length >= 2 || buyer.weight >= 3;
    const priority: TriagedComment['priority'] = isTopBuyer ? 'P0' : 'P1';
    const score = Math.min(92, 76 + buyer.weight * 3);
    const { complianceFlag, metaNote } = buildComplianceNotes(comment, 'buyer-intent');
    const baseAction =
      'Reply promptly (<= 30m SLA) with a clear answer + direct next step (pricing/demo/compatibility) while buyer intent is hot.';
    const result: TriagedComment = {
      comment,
      intent: 'buyer-intent',
      priority,
      score,
      matchedSignals: buyer.labels,
      recommendedSlaMinutes: 30,
      suggestedAction: metaNote ? `${baseAction} ${metaNote}` : baseAction,
    };
    if (complianceFlag) result.complianceFlag = complianceFlag;
    return result;
  }

  // 4. Support (P1, 60 min SLA)
  const support = matchRules(text, SUPPORT_RULES);
  if (support.labels.length > 0) {
    const score = Math.min(74, 65 + support.weight * 2);
    const { complianceFlag, metaNote } = buildComplianceNotes(comment, 'support');
    const baseAction =
      'Respond within 60 minutes, confirm troubleshooting steps, and collect ticket/account details privately.';
    const result: TriagedComment = {
      comment,
      intent: 'support',
      priority: 'P1',
      score,
      matchedSignals: support.labels,
      recommendedSlaMinutes: 60,
      suggestedAction: metaNote ? `${baseAction} ${metaNote}` : baseAction,
    };
    if (complianceFlag) result.complianceFlag = complianceFlag;
    return result;
  }

  // 5. Feedback (P2, 240 min SLA)
  const feedback = matchRules(text, FEEDBACK_RULES);
  if (feedback.labels.length > 0) {
    const score = Math.min(58, 50 + feedback.weight * 2);
    const { complianceFlag } = buildComplianceNotes(comment, 'feedback');
    const result: TriagedComment = {
      comment,
      intent: 'feedback',
      priority: 'P2',
      score,
      matchedSignals: feedback.labels,
      recommendedSlaMinutes: 240,
      suggestedAction:
        'Thank the commenter, ask a clarifying follow-up question, and log the request in the product feedback tracker.',
    };
    if (complianceFlag) result.complianceFlag = complianceFlag;
    return result;
  }

  // 6. Emoji-only / single generic praise word -> Bot/Noise (P3, 0 SLA)
  const noiseCheck = isEmojiOnlyOrGenericNoise(text);
  if (noiseCheck.isNoise) {
    return {
      comment,
      intent: 'bot-noise',
      priority: 'P3',
      score: noiseCheck.signal === 'emoji-only' ? 5 : 10,
      matchedSignals: [noiseCheck.signal ?? 'low-signal'],
      recommendedSlaMinutes: 0,
      suggestedAction: 'Optional like/heart reaction only; skip manual reply to preserve team SLA bandwidth.',
    };
  }

  // 7. Genuine Community engagement (P2, 180 min SLA)
  const hasQuestion = text.includes('?');
  const { complianceFlag } = buildComplianceNotes(comment, 'community');
  const communitySignals = hasQuestion ? ['community-question'] : ['community-engagement'];
  const result: TriagedComment = {
    comment,
    intent: 'community',
    priority: 'P2',
    score: hasQuestion ? 42 : 35,
    matchedSignals: communitySignals,
    recommendedSlaMinutes: 180,
    suggestedAction: hasQuestion
      ? 'Answer the community question thoughtfully within 3 hours to sustain thread reply velocity.'
      : 'Engage authentically within 3 hours with a brief conversational reply to reward active community members.',
  };
  if (complianceFlag) result.complianceFlag = complianceFlag;
  return result;
}

export function triageComments(comments: CommentItem[]): TriagedComment[] {
  const triaged = comments.map(classifySingleComment);

  triaged.sort((a, b) => {
    const intentDiff = INTENT_ORDER[b.intent] - INTENT_ORDER[a.intent];
    if (intentDiff !== 0) {
      // Ensure P0 crisis-urgent is always first, then P0/P1 buyer-intent, P1 support, P2 feedback, community, P3 bot-noise
      const priorityDiff = PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return intentDiff;
    }
    const scoreDiff = b.score - a.score;
    if (scoreDiff !== 0) return scoreDiff;
    return a.comment.id.localeCompare(b.comment.id);
  });

  return triaged;
}
