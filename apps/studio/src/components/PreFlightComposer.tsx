import { useEffect, useId, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Copy,
  Info,
  Paperclip,
  Undo2,
  Wand2,
} from 'lucide-react';
import {
  autoFixDraftText,
  detectInvisibleZeroWidthChars,
  detectUnicodeFancyFonts,
  formatReportAsSarif,
  listPlatformSpecs,
  runPreFlight,
} from '@postflight/core';
import type {
  BrandGuardrails,
  DisclosureJurisdiction,
  MediaAttachment,
  PlatformId,
  PlatformLintReport,
  SocialDraft,
} from '@postflight/core';
import { COMPOSER_PRESETS } from '../data/presets';

export interface ComposerTelemetrySummary {
  score: number;
  grade: string;
  errors: number;
  warnings: number;
  passed: boolean;
}

interface PreFlightComposerProps {
  onAnnounce: (message: string) => void;
  onSummaryChange?: (summary: ComposerTelemetrySummary) => void;
}

const PRESET_SHORT_LABELS: Record<string, string> = {
  'trapped-sponsorship': 'Broken sponsored post',
  'clean-oss-launch': 'Clean launch post',
  'ai-viral-reel': 'Vertical video caption',
  'bluesky-mastodon-edge': 'Bluesky & Threads limits',
  'bluesky-mastodon-threads': 'Bluesky & Threads limits',
  'hidden-formatting-traps': 'Invisible & link traps',
};

const INITIAL_PRESET = COMPOSER_PRESETS[0]!;

export function PreFlightComposer({
  onAnnounce,
  onSummaryChange,
}: PreFlightComposerProps) {
  const idPrefix = useId();
  const allSpecs = useMemo(() => listPlatformSpecs(), []);

  const [activePresetId, setActivePresetId] = useState<string>(INITIAL_PRESET.id);
  const [selectedPlatforms, setSelectedPlatforms] = useState<PlatformId[]>([
    ...INITIAL_PRESET.platforms,
  ]);
  const [text, setText] = useState<string>(INITIAL_PRESET.draft.text);
  const [title, setTitle] = useState<string>(INITIAL_PRESET.draft.title ?? '');
  const [firstComment, setFirstComment] = useState<string>(
    INITIAL_PRESET.draft.firstComment ?? '',
  );
  const [contentWarning, setContentWarning] = useState<string>(
    INITIAL_PRESET.draft.contentWarning ?? '',
  );
  const [scheduledAt, setScheduledAt] = useState<string>(
    INITIAL_PRESET.draft.scheduledAt ?? '',
  );
  const [isSponsored, setIsSponsored] = useState<boolean>(
    Boolean(INITIAL_PRESET.draft.isSponsored),
  );
  const [isAiGenerated, setIsAiGenerated] = useState<boolean>(
    Boolean(INITIAL_PRESET.draft.isAiGenerated),
  );
  const [publishViaApi, setPublishViaApi] = useState<boolean>(
    Boolean(INITIAL_PRESET.draft.publishViaApi),
  );
  const [strictAccessibility, setStrictAccessibility] = useState<boolean>(true);
  const [flagAiSlop, setFlagAiSlop] = useState<boolean>(true);
  const [jurisdiction, setJurisdiction] = useState<DisclosureJurisdiction>('ftc');
  const [forbiddenTermsInput, setForbiddenTermsInput] = useState<string>(
    INITIAL_PRESET.forbiddenTerms,
  );
  const [media, setMedia] = useState<MediaAttachment[]>(
    INITIAL_PRESET.draft.media ? INITIAL_PRESET.draft.media.map((m) => ({ ...m })) : [],
  );

  const [expandedPlatforms, setExpandedPlatforms] = useState<Record<string, boolean>>({
    linkedin: true,
    'instagram-feed': false,
    x: false,
    tiktok: false,
    bluesky: false,
  });

  const [lastAutoFix, setLastAutoFix] = useState<{
    previousText: string;
    appliedFixes: string[];
  } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const fancyRuns = useMemo(() => detectUnicodeFancyFonts(text), [text]);
  const invisibleFindings = useMemo(
    () => detectInvisibleZeroWidthChars([title, text, firstComment].join('\n')),
    [title, text, firstComment],
  );

  const draft: SocialDraft = useMemo(
    () => ({
      id: activePresetId,
      text,
      title: title.trim() ? title : undefined,
      firstComment: firstComment.trim() ? firstComment : undefined,
      contentWarning: contentWarning.trim() ? contentWarning : undefined,
      scheduledAt: scheduledAt.trim() ? scheduledAt : undefined,
      isSponsored,
      isAiGenerated,
      publishViaApi,
      media: media.length > 0 ? media : undefined,
    }),
    [
      activePresetId,
      text,
      title,
      firstComment,
      contentWarning,
      scheduledAt,
      isSponsored,
      isAiGenerated,
      publishViaApi,
      media,
    ],
  );

  const guardrails: BrandGuardrails = useMemo(() => {
    const forbiddenTerms = forbiddenTermsInput
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    return {
      forbiddenTerms: forbiddenTerms.length > 0 ? forbiddenTerms : undefined,
      disclosureJurisdiction: jurisdiction,
      flagAiSlop,
      strictAccessibility,
      useApiLimits: publishViaApi,
    };
  }, [forbiddenTermsInput, jurisdiction, flagAiSlop, strictAccessibility, publishViaApi]);

  const report = useMemo(() => {
    const targets = selectedPlatforms.length > 0 ? selectedPlatforms : (['linkedin'] as PlatformId[]);
    return runPreFlight(draft, targets, guardrails);
  }, [draft, selectedPlatforms, guardrails]);

  useEffect(() => {
    onSummaryChange?.({
      score: report.overallScore,
      grade: report.overallGrade,
      errors: report.totalErrors,
      warnings: report.totalWarnings,
      passed: report.passed,
    });
  }, [
    report.overallScore,
    report.overallGrade,
    report.totalErrors,
    report.totalWarnings,
    report.passed,
    onSummaryChange,
  ]);

  function loadPreset(presetId: string) {
    const preset = COMPOSER_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setActivePresetId(preset.id);
    setSelectedPlatforms([...preset.platforms]);
    setText(preset.draft.text);
    setTitle(preset.draft.title ?? '');
    setFirstComment(preset.draft.firstComment ?? '');
    setContentWarning(preset.draft.contentWarning ?? '');
    setScheduledAt(preset.draft.scheduledAt ?? '');
    setIsSponsored(Boolean(preset.draft.isSponsored));
    setIsAiGenerated(Boolean(preset.draft.isAiGenerated));
    setPublishViaApi(Boolean(preset.draft.publishViaApi));
    setForbiddenTermsInput(preset.forbiddenTerms);
    setMedia(preset.draft.media ? preset.draft.media.map((m) => ({ ...m })) : []);
    setLastAutoFix(null);

    const nextExpanded: Record<string, boolean> = {};
    preset.platforms.forEach((p, idx) => {
      nextExpanded[p] = idx === 0;
    });
    setExpandedPlatforms(nextExpanded);
    onAnnounce(`Loaded example: ${PRESET_SHORT_LABELS[preset.id] ?? preset.name}.`);
  }

  function togglePlatform(id: PlatformId) {
    setSelectedPlatforms((prev) => {
      if (prev.includes(id)) {
        if (prev.length === 1) return prev;
        return prev.filter((p) => p !== id);
      }
      setExpandedPlatforms((exp) => ({ ...exp, [id]: true }));
      return [...prev, id];
    });
  }

  function handleAutoFix() {
    const targets = selectedPlatforms.length > 0 ? selectedPlatforms : (['linkedin'] as PlatformId[]);
    let workingText = text;
    const allFixes: string[] = [];

    for (const platform of targets) {
      const res = autoFixDraftText(workingText, platform, {
        isSponsored,
        disclosureJurisdiction: jurisdiction,
        utmCampaign: 'postflight-campaign',
      });
      if (res.changed) {
        workingText = res.fixedText;
        for (const fix of res.appliedFixes) {
          if (!allFixes.includes(fix)) {
            allFixes.push(fix);
          }
        }
      }
    }

    if (workingText === text) {
      onAnnounce('No automatic text fixes needed.');
      return;
    }

    setLastAutoFix({ previousText: text, appliedFixes: allFixes });
    setText(workingText);
    onAnnounce(`Fixed ${allFixes.length} issues automatically.`);
  }

  function handleUndoAutoFix() {
    if (!lastAutoFix) return;
    setText(lastAutoFix.previousText);
    setLastAutoFix(null);
    onAnnounce('Reverted automatic fixes.');
  }

  async function copyPayload(key: string, payload: string, label: string) {
    try {
      await navigator.clipboard.writeText(payload);
      setCopiedKey(key);
      onAnnounce(`${label} copied.`);
      window.setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 1800);
    } catch {
      onAnnounce(`Could not copy ${label}.`);
    }
  }

  const readinessTone =
    report.passed && report.overallScore >= 85
      ? 'pass'
      : report.overallScore >= 60
        ? 'warn'
        : 'fail';

  const statusSummaryText = report.passed
    ? report.totalWarnings === 0
      ? 'Ready to publish'
      : `Ready with ${report.totalWarnings} warning${report.totalWarnings === 1 ? '' : 's'}`
    : `${report.totalErrors} error${report.totalErrors === 1 ? '' : 's'} to fix before publishing`;

  return (
    <div>
      <div className="section-header">
        <div>
          <h2 className="section-title">Check a post before publishing</h2>
          <p className="section-desc">
            Paste your draft to catch cut-off hooks, hashtag caps, ad disclosure rules, broken links, and accessibility issues.
          </p>
        </div>
      </div>

      {/* Subtle Example Picker */}
      <div className="preset-bar" role="group" aria-label="Load an example draft">
        <span className="preset-bar-label">Try an example:</span>
        {COMPOSER_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className="preset-chip"
            aria-pressed={activePresetId === preset.id}
            onClick={() => loadPreset(preset.id)}
          >
            {PRESET_SHORT_LABELS[preset.id] ?? preset.name}
          </button>
        ))}
      </div>

      <div className="composer-layout">
        {/* LEFT COLUMN: Clean, focused editor */}
        <section className="instrument-card" aria-labelledby={`${idPrefix}-draft-heading`}>
          <div className="card-header">
            <h3 id={`${idPrefix}-draft-heading`} className="card-title">
              Your draft
            </h3>
            <div className="btn-row">
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => {
                  setSelectedPlatforms(['linkedin', 'instagram-feed', 'x', 'bluesky']);
                  onAnnounce('Selected 4 main platforms.');
                }}
              >
                Main 4
              </button>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => {
                  setSelectedPlatforms(allSpecs.map((s) => s.id));
                  onAnnounce('Selected all 9 platforms.');
                }}
              >
                All 9
              </button>
            </div>
          </div>

          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {/* Platform picker */}
            <div className="field-group">
              <span className="field-label">Platforms</span>
              <div className="platform-chip-grid" role="group" aria-label="Select social platforms">
                {allSpecs.map((spec) => {
                  const selected = selectedPlatforms.includes(spec.id);
                  return (
                    <button
                      key={spec.id}
                      type="button"
                      className="platform-chip"
                      aria-pressed={selected}
                      onClick={() => togglePlatform(spec.id)}
                    >
                      {spec.shortName}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Post text */}
            <div className="field-group">
              <div className="field-label-row">
                <label className="field-label" htmlFor={`${idPrefix}-body`}>
                  Post copy
                </label>
                <span className="btn-row">
                  {invisibleFindings.length > 0 && (
                    <span className="badge badge--warning tabular">
                      {invisibleFindings.length} hidden char{invisibleFindings.length === 1 ? '' : 's'}
                    </span>
                  )}
                  {fancyRuns.length > 0 && (
                    <span className="badge badge--error">
                      Fancy Unicode font detected
                    </span>
                  )}
                  <span className="field-hint tabular">{text.length} characters</span>
                </span>
              </div>
              <textarea
                id={`${idPrefix}-body`}
                className="textarea"
                style={{ minHeight: '200px' }}
                placeholder="Write or paste your post here..."
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </div>

            {/* Primary quick options */}
            <div className="checkbox-row">
              <label className="checkbox-pill">
                <input
                  type="checkbox"
                  checked={isSponsored}
                  onChange={(e) => setIsSponsored(e.target.checked)}
                />
                Sponsored / paid post
              </label>
              <label className="checkbox-pill">
                <input
                  type="checkbox"
                  checked={isAiGenerated}
                  onChange={(e) => setIsAiGenerated(e.target.checked)}
                />
                AI-generated media
              </label>
              <label className="checkbox-pill">
                <input
                  type="checkbox"
                  checked={publishViaApi}
                  onChange={(e) => setPublishViaApi(e.target.checked)}
                />
                Publishing via scheduler API
              </label>
            </div>

            {/* Progressive Disclosure for Advanced Options */}
            <details className="advanced-drawer">
              <summary>
                <ChevronRight size={15} aria-hidden="true" />
                More options (first comment, media alt text, brand rules)
                {media.length > 0 && (
                  <span className="badge">{media.length} media</span>
                )}
              </summary>

              <div className="advanced-drawer-body">
                <div className="field-group">
                  <label className="field-label" htmlFor={`${idPrefix}-first-comment`}>
                    First comment
                  </label>
                  <input
                    id={`${idPrefix}-first-comment`}
                    type="text"
                    className="input"
                    placeholder="Optional follow-up comment"
                    value={firstComment}
                    onChange={(e) => setFirstComment(e.target.value)}
                  />
                </div>

                <div className="coord-grid">
                  <div className="field-group">
                    <label className="field-label" htmlFor={`${idPrefix}-title`}>
                      YouTube Shorts title
                    </label>
                    <input
                      id={`${idPrefix}-title`}
                      type="text"
                      className="input"
                      placeholder="Up to 100 characters"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                    />
                  </div>
                  <div className="field-group">
                    <label className="field-label" htmlFor={`${idPrefix}-cw`}>
                      Mastodon content warning
                    </label>
                    <input
                      id={`${idPrefix}-cw`}
                      type="text"
                      className="input"
                      placeholder="Optional spoiler text"
                      value={contentWarning}
                      onChange={(e) => setContentWarning(e.target.value)}
                    />
                  </div>
                </div>

                <div className="coord-grid">
                  <div className="field-group">
                    <label className="field-label" htmlFor={`${idPrefix}-scheduled`}>
                      Scheduled publish time (ISO-8601)
                    </label>
                    <input
                      id={`${idPrefix}-scheduled`}
                      type="text"
                      className="input mono"
                      placeholder="e.g. 2026-11-26T09:15:00-05:00"
                      value={scheduledAt}
                      onChange={(e) => setScheduledAt(e.target.value)}
                      autoCorrect="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      aria-describedby={`${idPrefix}-scheduled-help`}
                    />
                    <p id={`${idPrefix}-scheduled-help`} className="field-hint">
                      Catches missing timezone offsets, top-of-hour :00 burst queues, and DST clock changes.
                    </p>
                  </div>
                  <div className="field-group">
                    <label className="field-label" htmlFor={`${idPrefix}-jurisdiction`}>
                      Ad disclosure rule
                    </label>
                    <select
                      id={`${idPrefix}-jurisdiction`}
                      className="select"
                      value={jurisdiction}
                      onChange={(e) => setJurisdiction(e.target.value as DisclosureJurisdiction)}
                    >
                      <option value="ftc">US FTC (before fold)</option>
                      <option value="asa-uk">UK ASA (first 40 chars)</option>
                      <option value="dfa-eu">EU DFA / DSA (first 40 chars)</option>
                      <option value="both">Both US FTC &amp; UK ASA</option>
                      <option value="all">Global strict (FTC + ASA + EU DFA)</option>
                    </select>
                  </div>
                </div>

                <div className="field-group">
                  <label className="field-label" htmlFor={`${idPrefix}-forbidden`}>
                    Blocked brand phrases
                  </label>
                  <input
                    id={`${idPrefix}-forbidden`}
                    type="text"
                    className="input"
                    placeholder="Comma-separated, e.g. guaranteed returns"
                    value={forbiddenTermsInput}
                    onChange={(e) => setForbiddenTermsInput(e.target.value)}
                  />
                </div>

                <div className="checkbox-row">
                  <label className="checkbox-pill">
                    <input
                      type="checkbox"
                      checked={strictAccessibility}
                      onChange={(e) => setStrictAccessibility(e.target.checked)}
                    />
                    Strict accessibility checks
                  </label>
                  <label className="checkbox-pill">
                    <input
                      type="checkbox"
                      checked={flagAiSlop}
                      onChange={(e) => setFlagAiSlop(e.target.checked)}
                    />
                    Flag generic AI clichés
                  </label>
                </div>

                {/* Attached Media Alt-Text */}
                <div className="field-group">
                  <div className="field-label-row">
                    <span className="field-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <Paperclip size={14} aria-hidden="true" />
                      Attached media ({media.length})
                    </span>
                    {media.length === 0 ? (
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() =>
                          setMedia([
                            {
                              type: 'image',
                              filename: 'campaign-hero-4x5.png',
                              width: 1080,
                              height: 1350,
                              sizeBytes: 2_050_000,
                              altText: '',
                            },
                          ])
                        }
                      >
                        Add sample image
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        onClick={() => setMedia([])}
                      >
                        Remove media
                      </button>
                    )}
                  </div>

                  {media.map((item, idx) => (
                    <div key={`${item.filename ?? 'media'}-${idx}`} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div className="kpi-strip">
                        <span className="badge">{item.filename ?? item.type}</span>
                        {item.width && item.height && (
                          <span className="badge tabular">
                            {item.width}×{item.height}
                          </span>
                        )}
                        {item.sizeBytes !== undefined && (
                          <span className="badge tabular">
                            {(item.sizeBytes / 1_000_000).toFixed(2)} MB
                          </span>
                        )}
                        {item.isHdr && <span className="badge badge--warning">HDR video</span>}
                        {item.isVfr && <span className="badge badge--warning">Variable frame rate</span>}
                        {item.hasC2paMetadata && <span className="badge badge--warning">C2PA metadata</span>}
                      </div>
                      {item.type === 'image' && (
                        <div className="field-group">
                          <label className="field-hint" htmlFor={`${idPrefix}-alt-${idx}`}>
                            Alt text for screen readers
                          </label>
                          <input
                            id={`${idPrefix}-alt-${idx}`}
                            type="text"
                            className="input"
                            placeholder="Describe what is shown in the image..."
                            value={item.altText ?? ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              setMedia((prev) =>
                                prev.map((m, i) => (i === idx ? { ...m, altText: val } : m)),
                              );
                            }}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </details>
          </div>
        </section>

        {/* RIGHT COLUMN: Calm Summary & Platform Results */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <section className="readiness-card" aria-label="Post check summary">
            <div className="readiness-top">
              <div>
                <div className="readiness-score-row">
                  <span className="readiness-score tabular">{report.overallScore}</span>
                  <span className="readiness-score-max">/ 100</span>
                </div>
                <div className={`readiness-status readiness-status--${readinessTone}`}>
                  {report.passed ? (
                    <CheckCircle2 size={16} aria-hidden="true" />
                  ) : (
                    <AlertCircle size={16} aria-hidden="true" />
                  )}
                  <span>{statusSummaryText}</span>
                </div>
              </div>

              <div className="kpi-strip">
                {report.totalErrors > 0 && (
                  <span className="badge badge--error tabular">
                    {report.totalErrors} error{report.totalErrors === 1 ? '' : 's'}
                  </span>
                )}
                {report.totalWarnings > 0 && (
                  <span className="badge badge--warning tabular">
                    {report.totalWarnings} warning{report.totalWarnings === 1 ? '' : 's'}
                  </span>
                )}
                {report.totalErrors === 0 && report.totalWarnings === 0 && (
                  <span className="badge badge--cleared">All checks passed</span>
                )}
              </div>
            </div>

            <div className="readiness-bar-track" aria-hidden="true">
              <div
                className="readiness-bar-fill"
                style={{ width: `${Math.max(4, Math.min(100, report.overallScore))}%` }}
              />
            </div>

            <div className="readiness-actions">
              <div className="btn-row">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleAutoFix}
                >
                  <Wand2 size={15} aria-hidden="true" />
                  Fix issues automatically
                </button>
                {lastAutoFix && (
                  <button type="button" className="btn btn-sm" onClick={handleUndoAutoFix}>
                    <Undo2 size={14} aria-hidden="true" />
                    Undo
                  </button>
                )}
              </div>

              <div className="btn-row">
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() =>
                    copyPayload('json', JSON.stringify(report, null, 2), 'JSON report')
                  }
                >
                  {copiedKey === 'json' ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
                  {copiedKey === 'json' ? 'Copied' : 'Copy JSON'}
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() =>
                    copyPayload(
                      'sarif',
                      JSON.stringify(formatReportAsSarif(report, `${activePresetId}.md`), null, 2),
                      'SARIF report',
                    )
                  }
                >
                  {copiedKey === 'sarif' ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
                  {copiedKey === 'sarif' ? 'Copied' : 'Copy SARIF'}
                </button>
              </div>
            </div>
          </section>

          {lastAutoFix && (
            <div className="autofix-banner" role="status">
              <div className="autofix-banner-title">
                <CheckCircle2 size={15} aria-hidden="true" />
                Applied {lastAutoFix.appliedFixes.length} automatic fix
                {lastAutoFix.appliedFixes.length === 1 ? '' : 'es'}
              </div>
              <ul className="autofix-list">
                {lastAutoFix.appliedFixes.map((fix) => (
                  <li key={fix}>{fix}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Per-Platform Cards */}
          <div className="platform-report-list">
            {report.platforms.map((platformReport) => (
              <PlatformDiagnosticCard
                key={platformReport.platform}
                report={platformReport}
                expanded={Boolean(expandedPlatforms[platformReport.platform])}
                onToggle={() =>
                  setExpandedPlatforms((prev) => ({
                    ...prev,
                    [platformReport.platform]: !prev[platformReport.platform],
                  }))
                }
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

interface PlatformDiagnosticCardProps {
  report: PlatformLintReport;
  expanded: boolean;
  onToggle: () => void;
}

function PlatformDiagnosticCard({
  report,
  expanded,
  onToggle,
}: PlatformDiagnosticCardProps) {
  const panelId = useId();
  const { counts, folds } = report;
  const pct = counts.effectiveLimit > 0 ? Math.min(100, (counts.count / counts.effectiveLimit) * 100) : 0;
  const meterClass = counts.overLimit
    ? 'meter-fill--over'
    : pct >= 85
      ? 'meter-fill--warn'
      : '';

  const scoreToneClass =
    report.passed && report.score >= 85
      ? 'score-pill--pass'
      : report.score >= 60
        ? 'score-pill--warn'
        : 'score-pill--fail';

  return (
    <article className="platform-card">
      <button
        type="button"
        className="platform-card-trigger"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={onToggle}
      >
        <div className="platform-card-left">
          <span className={`score-pill tabular ${scoreToneClass}`}>
            {report.score}
          </span>
          <div>
            <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>
              {report.platformName}
            </div>
            <div className="field-hint tabular">
              {counts.count} / {counts.effectiveLimit} chars
              {counts.maxBytes !== null ? ` · ${counts.utf8Bytes}/${counts.maxBytes} bytes` : ''}
            </div>
          </div>
        </div>

        <div className="btn-row">
          {report.errorCount > 0 && (
            <span className="badge badge--error tabular">
              {report.errorCount} error{report.errorCount === 1 ? '' : 's'}
            </span>
          )}
          {report.warningCount > 0 && (
            <span className="badge badge--warning tabular">
              {report.warningCount} warning{report.warningCount === 1 ? '' : 's'}
            </span>
          )}
          {report.errorCount === 0 && report.warningCount === 0 && (
            <span className="badge badge--cleared">Ready</span>
          )}
          {expanded ? (
            <ChevronUp size={16} aria-hidden="true" />
          ) : (
            <ChevronDown size={16} aria-hidden="true" />
          )}
        </div>
      </button>

      {expanded && (
        <div id={panelId} className="platform-card-body">
          {/* Length bar */}
          <div className="meter-block">
            <div className="meter-header">
              <span className="field-hint">{counts.breakdown}</span>
              <span
                className={`badge tabular ${
                  counts.overLimit ? 'badge--error' : 'badge--cleared'
                }`}
              >
                {counts.remaining >= 0
                  ? `${counts.remaining} left`
                  : `${Math.abs(counts.remaining)} over limit`}
              </span>
            </div>
            <div className="meter-track" aria-hidden="true">
              <div className={`meter-fill ${meterClass}`} style={{ width: `${pct}%` }} />
            </div>
          </div>

          {/* Mobile & Desktop Fold Preview */}
          <div>
            <div className="field-label-row" style={{ marginBlockEnd: '8px' }}>
              <span className="field-label">
                Feed preview ({folds.hasMedia ? 'with media' : 'text only'})
              </span>
            </div>
            <div className="fold-grid">
              {([folds.mobile, folds.desktop] as const).map((surfaceFold) => (
                <div key={surfaceFold.surface} className="fold-box">
                  <div className="fold-box-header">
                    <span>
                      {surfaceFold.surface === 'mobile' ? 'Mobile' : 'Desktop'}
                    </span>
                    <span
                      className={`badge ${
                        surfaceFold.truncated ? 'badge--warning' : 'badge--cleared'
                      }`}
                    >
                      {surfaceFold.truncated ? 'Cut off' : 'Fully visible'}
                    </span>
                  </div>
                  <div className="fold-box-content">
                    {surfaceFold.blankLinesConsumed > 0 && (
                      <div style={{ marginBlockEnd: '6px' }}>
                        <span className="badge badge--warning tabular">
                          {surfaceFold.blankLinesConsumed} blank line
                          {surfaceFold.blankLinesConsumed === 1 ? '' : 's'} used above fold
                        </span>
                      </div>
                    )}
                    <div>{surfaceFold.visibleText || '(empty draft)'}</div>
                    {surfaceFold.truncated && (
                      <>
                        <div className="fold-cut-divider">
                          <span>Hidden behind {surfaceFold.foldLabel}</span>
                        </div>
                        <div className="fold-hidden-text">{surfaceFold.hiddenText}</div>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Issues List */}
          <div className="diag-list" aria-label={`Issues for ${report.platformName}`}>
            {report.diagnostics.length === 0 ? (
              <div className="telemetry-pill telemetry-pill--cleared">
                <CheckCircle2 size={14} aria-hidden="true" />
                No issues found for {report.platformName}.
              </div>
            ) : (
              report.diagnostics.map((diag, idx) => (
                <div
                  key={`${diag.ruleId}-${idx}`}
                  className={`diag-item diag-item--${diag.severity}`}
                >
                  <div className="diag-head">
                    <span className="btn-row">
                      <span className={`badge badge--${diag.severity}`}>
                        {diag.severity === 'error' ? (
                          <AlertCircle size={11} aria-hidden="true" />
                        ) : diag.severity === 'warning' ? (
                          <AlertTriangle size={11} aria-hidden="true" />
                        ) : (
                          <Info size={11} aria-hidden="true" />
                        )}
                        {diag.severity === 'error'
                          ? 'Error'
                          : diag.severity === 'warning'
                            ? 'Warning'
                            : 'Note'}
                      </span>
                      <span className="field-hint mono" style={{ fontSize: '0.72rem' }}>
                        {diag.ruleId}
                      </span>
                    </span>
                    {diag.autoFixable && (
                      <span className="badge badge--accent">Auto-fixable</span>
                    )}
                  </div>
                  <p className="diag-msg">{diag.message}</p>
                  {diag.evidence && <code className="diag-evidence">{diag.evidence}</code>}
                  <p className="diag-hint">{diag.fixHint}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </article>
  );
}
