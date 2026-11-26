import type {
  BrandGuardrails,
  LintDiagnostic,
  PlatformId,
  PlatformLintReport,
  PreFlightReport,
  Severity,
  SocialDraft,
} from '../types.js';
import { getPlatformSpec } from '../specs/registry.js';
import { countPlatformText } from '../counters/index.js';
import { simulatePlatformFold } from '../fold/simulator.js';
import { autoFixDraftText } from './autofix.js';
import { evaluatePlatformRules, RULE_CATALOG } from './rules.js';
import type { RuleDefinition } from './rules.js';

export type LintGrade = PlatformLintReport['grade'];

function scoreToGrade(score: number): LintGrade {
  if (score >= 95) return 'A+';
  if (score >= 88) return 'A';
  if (score >= 78) return 'B';
  if (score >= 65) return 'C';
  if (score >= 50) return 'D';
  return 'F';
}

function severityOrder(severity: Severity): number {
  if (severity === 'error') return 0;
  if (severity === 'warning') return 1;
  return 2;
}

function mapSeverityToSarifLevel(severity: Severity): 'error' | 'warning' | 'note' {
  if (severity === 'error') return 'error';
  if (severity === 'warning') return 'warning';
  return 'note';
}

function toRuleName(ruleId: string): string {
  return ruleId
    .split(/[/-]+/)
    .filter((part) => part.length > 0)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join('');
}

export function lintForPlatform(
  draft: SocialDraft,
  platform: PlatformId,
  guardrails?: BrandGuardrails,
): PlatformLintReport {
  const spec = getPlatformSpec(platform);
  const publishViaApi = Boolean(draft.publishViaApi || guardrails?.useApiLimits);

  const counts = countPlatformText(draft.text, platform, {
    contentWarning: draft.contentWarning,
    publishViaApi,
    xPremium: guardrails?.xPremium,
    mastodonMaxChars: guardrails?.mastodonMaxChars,
  });

  const hasMedia = Boolean(draft.media && draft.media.length > 0);
  const folds = simulatePlatformFold(draft.text, platform, { hasMedia });

  const diagnostics = evaluatePlatformRules(draft, platform, counts, folds, guardrails);
  diagnostics.sort((a: LintDiagnostic, b: LintDiagnostic) => {
    const sevDiff = severityOrder(a.severity) - severityOrder(b.severity);
    if (sevDiff !== 0) return sevDiff;
    return b.penaltyPoints - a.penaltyPoints;
  });

  let errorCount = 0;
  let warningCount = 0;
  let infoCount = 0;
  let totalPenalty = 0;

  for (const diag of diagnostics) {
    totalPenalty += diag.penaltyPoints;
    if (diag.severity === 'error') errorCount++;
    else if (diag.severity === 'warning') warningCount++;
    else infoCount++;
  }

  const score = Math.max(0, Math.min(100, 100 - totalPenalty));
  const grade = scoreToGrade(score);

  return {
    platform,
    platformName: spec.name,
    score,
    grade,
    passed: errorCount === 0,
    errorCount,
    warningCount,
    infoCount,
    counts,
    folds,
    diagnostics,
  };
}

export function runPreFlight(
  draft: SocialDraft,
  targets: PlatformId[],
  guardrails?: BrandGuardrails,
): PreFlightReport {
  const uniqueTargets = Array.from(new Set(targets));
  const platforms = uniqueTargets.map((platform) => lintForPlatform(draft, platform, guardrails));

  let totalErrors = 0;
  let totalWarnings = 0;
  let totalInfos = 0;
  let scoreSum = 0;

  for (const report of platforms) {
    totalErrors += report.errorCount;
    totalWarnings += report.warningCount;
    totalInfos += report.infoCount;
    scoreSum += report.score;
  }

  const overallScore = platforms.length > 0 ? Math.round(scoreSum / platforms.length) : 100;
  const overallGrade = scoreToGrade(overallScore);

  const firstTarget = uniqueTargets[0];
  const autoFixPreview =
    firstTarget !== undefined
      ? autoFixDraftText(draft.text, firstTarget, {
          isSponsored: draft.isSponsored,
          disclosureJurisdiction: guardrails?.disclosureJurisdiction,
          utmCampaign: guardrails?.expectedCampaign,
        })
      : undefined;

  const preFlightReport: PreFlightReport = {
    timestamp: new Date().toISOString(),
    overallScore,
    overallGrade,
    passed: totalErrors === 0,
    totalErrors,
    totalWarnings,
    totalInfos,
    platforms,
  };

  if (autoFixPreview !== undefined) {
    preFlightReport.autoFixPreview = autoFixPreview;
  }

  return preFlightReport;
}

export function formatReportAsSarif(
  report: PreFlightReport,
  artifactUri = 'draft.md',
): Record<string, unknown> {
  const catalogById = new Map<string, RuleDefinition>();
  for (const def of RULE_CATALOG) {
    catalogById.set(def.id, def);
  }

  const seenRuleIds = new Set<string>();
  const sarifRules: Array<Record<string, unknown>> = [];
  const sarifResults: Array<Record<string, unknown>> = [];

  for (const platformReport of report.platforms) {
    for (const diag of platformReport.diagnostics) {
      if (!seenRuleIds.has(diag.ruleId)) {
        seenRuleIds.add(diag.ruleId);
        const def = catalogById.get(diag.ruleId);
        sarifRules.push({
          id: diag.ruleId,
          name: toRuleName(diag.ruleId),
          shortDescription: {
            text: def ? def.title : diag.ruleId,
          },
          fullDescription: {
            text: def ? def.summary : diag.message,
          },
          help: {
            text: diag.fixHint,
          },
          defaultConfiguration: {
            level: mapSeverityToSarifLevel(def ? def.defaultSeverity : diag.severity),
          },
          properties: {
            category: def ? def.category : diag.category,
            specRef: def ? def.specRef : (diag.specRef ?? 'PostFlight Platform Spec'),
            tags: ['postflight', 'social-media', def ? def.category : diag.category],
          },
        });
      }

      const resultProps: Record<string, unknown> = {
        platform: diag.platform,
        platformName: platformReport.platformName,
        category: diag.category,
        penaltyPoints: diag.penaltyPoints,
        autoFixable: diag.autoFixable,
      };
      if (diag.evidence !== undefined) {
        resultProps['evidence'] = diag.evidence;
      }
      if (diag.specRef !== undefined) {
        resultProps['specRef'] = diag.specRef;
      }

      sarifResults.push({
        ruleId: diag.ruleId,
        level: mapSeverityToSarifLevel(diag.severity),
        message: {
          text: `[${platformReport.platformName}] ${diag.message} Fix: ${diag.fixHint}`,
        },
        locations: [
          {
            physicalLocation: {
              artifactLocation: {
                uri: artifactUri,
              },
              region: {
                startLine: 1,
                startColumn: 1,
              },
            },
          },
        ],
        properties: resultProps,
      });
    }
  }

  return {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'PostFlight',
            version: '1.0.0',
            informationUri: 'https://github.com/postflight/postflight',
            rules: sarifRules,
          },
        },
        results: sarifResults,
        properties: {
          timestamp: report.timestamp,
          overallScore: report.overallScore,
          overallGrade: report.overallGrade,
          passed: report.passed,
          totalErrors: report.totalErrors,
          totalWarnings: report.totalWarnings,
          totalInfos: report.totalInfos,
        },
      },
    ],
  };
}

export { RULE_CATALOG, evaluatePlatformRules } from './rules.js';
export type { RuleDefinition } from './rules.js';
export {
  autoFixDraftText,
  detectInvisibleZeroWidthChars,
  detectUnicodeFancyFonts,
  normalizeUnicodeFancyFonts,
  stripInvisibleZeroWidthChars,
  toPascalCaseHashtag,
} from './autofix.js';
export type { AutoFixOptions, InvisibleCharFinding } from './autofix.js';
