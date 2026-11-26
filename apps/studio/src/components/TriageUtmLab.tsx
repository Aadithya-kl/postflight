import { useId, useMemo, useState } from 'react';
import {
  AlertOctagon,
  Check,
  Copy,
  Link2,
  MessageSquareWarning,
  Plus,
  RotateCcw,
  ShieldAlert,
} from 'lucide-react';
import {
  auditUtmUrl,
  buildCanonicalUtmUrl,
  listPlatformSpecs,
  triageComments,
} from '@postflight/core';
import type { CommentIntent, CommentItem, PlatformId } from '@postflight/core';
import { SAMPLE_COMMENTS } from '../data/presets';

interface TriageUtmLabProps {
  onAnnounce: (message: string) => void;
}

type TriageFilter = 'all' | 'crisis-urgent' | 'buyer-intent' | 'support' | 'feedback' | 'bot-noise';

const FILTER_OPTIONS: ReadonlyArray<{ id: TriageFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'crisis-urgent', label: 'Urgent (P0)' },
  { id: 'buyer-intent', label: 'Buyer intent' },
  { id: 'support', label: 'Support' },
  { id: 'feedback', label: 'Feedback' },
  { id: 'bot-noise', label: 'Bot spam' },
];

const INTENT_LABELS: Record<CommentIntent, string> = {
  'crisis-urgent': 'Urgent issue',
  'buyer-intent': 'Buyer intent',
  support: 'Support',
  feedback: 'Feedback',
  community: 'Community',
  'bot-noise': 'Bot spam',
};

function formatSla(minutes: number): string {
  if (minutes <= 0) return 'Auto-hide';
  if (minutes >= 60) return `Reply in ${Math.round(minutes / 60)}h`;
  return `Reply in ${minutes}m`;
}

function formatIssueSeverity(severity: string): string {
  if (severity === 'error') return 'Error';
  if (severity === 'warning') return 'Warning';
  return 'Info';
}

export function TriageUtmLab({ onAnnounce }: TriageUtmLabProps) {
  const idPrefix = useId();
  const specs = useMemo(() => listPlatformSpecs(), []);

  // Comment Triage state
  const [comments, setComments] = useState<CommentItem[]>(() => [...SAMPLE_COMMENTS]);
  const [activeFilter, setActiveFilter] = useState<TriageFilter>('all');
  const [newAuthor, setNewAuthor] = useState('@enterprise_vp');
  const [newPlatform, setNewPlatform] = useState<PlatformId>('instagram-feed');
  const [newText, setNewText] = useState('');

  // UTM Auditor & Builder state
  const [auditUrl, setAuditUrl] = useState(
    'https://postflight.dev/offer?utm_source=LinkedIn&utm_medium=Paid%20Social&fbclid=IwAR999xyz',
  );
  const [auditPlatform, setAuditPlatform] = useState<PlatformId>('linkedin');
  const [expectedMedium, setExpectedMedium] = useState('paid-social');
  const [expectedCampaign, setExpectedCampaign] = useState('q4-launch');

  const [builderBaseUrl, setBuilderBaseUrl] = useState('https://postflight.dev/studio');
  const [builderPlatform, setBuilderPlatform] = useState<PlatformId>('linkedin');
  const [builderMedium, setBuilderMedium] = useState('organic-social');
  const [builderCampaign, setBuilderCampaign] = useState('postflight-v1-launch');
  const [builderContent, setBuilderContent] = useState('hero-carousel');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const triaged = useMemo(() => triageComments(comments), [comments]);

  const filterCounts = useMemo(() => {
    const counts: Record<TriageFilter, number> = {
      all: triaged.length,
      'crisis-urgent': 0,
      'buyer-intent': 0,
      support: 0,
      feedback: 0,
      'bot-noise': 0,
    };
    for (const item of triaged) {
      if (item.intent in counts) {
        counts[item.intent as Exclude<TriageFilter, 'all'>] += 1;
      }
    }
    return counts;
  }, [triaged]);

  const visibleTriaged = useMemo(
    () =>
      activeFilter === 'all'
        ? triaged
        : triaged.filter((item) => item.intent === activeFilter),
    [triaged, activeFilter],
  );

  const utmAudit = useMemo(
    () =>
      auditUtmUrl(auditUrl, {
        platform: auditPlatform,
        expectedMedium: expectedMedium.trim() || undefined,
        expectedCampaign: expectedCampaign.trim() || undefined,
      }),
    [auditUrl, auditPlatform, expectedMedium, expectedCampaign],
  );

  const canonicalBuild = useMemo((): { url: string | null; error: string | null } => {
    if (!builderBaseUrl.trim()) {
      return { url: null, error: 'Enter a destination URL to generate a canonical UTM link.' };
    }
    try {
      const url = buildCanonicalUtmUrl(builderBaseUrl, {
        platform: builderPlatform,
        campaign: builderCampaign || 'launch',
        medium: builderMedium || 'organic-social',
        content: builderContent.trim() || undefined,
      });
      return { url, error: null };
    } catch (err) {
      return {
        url: null,
        error: err instanceof Error ? err.message : 'Unable to construct canonical UTM URL.',
      };
    }
  }, [builderBaseUrl, builderPlatform, builderCampaign, builderMedium, builderContent]);

  function handleAddComment(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newText.trim();
    if (!trimmed) return;
    const item: CommentItem = {
      id: `c-${Date.now()}`,
      author: newAuthor.trim() || '@guest',
      platform: newPlatform,
      text: trimmed,
      timestamp: new Date().toISOString(),
    };
    setComments((prev) => [item, ...prev]);
    setNewText('');
    onAnnounce(`Added comment from ${item.author} and re-ranked triage inbox.`);
  }

  async function copyText(id: string, value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(id);
      onAnnounce(`${label} copied to clipboard.`);
      window.setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1800);
    } catch {
      onAnnounce(`Clipboard unavailable while copying ${label}.`);
    }
  }

  return (
    <div>
      <div className="section-header">
        <div>
          <h2 className="section-title">Comment triage &amp; link hygiene</h2>
          <p className="section-desc">
            Surface urgent issues and buyer questions above spam, and clean up campaign tracking
            links.
          </p>
        </div>
      </div>

      <div className="triage-layout">
        {/* Left: Comment triage inbox */}
        <section className="instrument-card" aria-labelledby={`${idPrefix}-triage-heading`}>
          <div className="card-header">
            <div className="card-title-group">
              <MessageSquareWarning size={18} aria-hidden="true" />
              <div>
                <h3 id={`${idPrefix}-triage-heading`} className="card-title">
                  Comment triage inbox
                </h3>
                <p className="card-subtitle tabular">
                  {triaged.length} comments sorted by urgency, buyer intent, and response target
                </p>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                setComments([...SAMPLE_COMMENTS]);
                setActiveFilter('all');
                onAnnounce('Restored sample comments.');
              }}
            >
              <RotateCcw size={14} aria-hidden="true" />
              Reset samples
            </button>
          </div>

          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {/* Quick Add Comment Form */}
            <form
              onSubmit={handleAddComment}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-2)',
                padding: 'var(--space-3)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                background: 'var(--canvas)',
              }}
            >
              <div className="coord-grid">
                <div className="field-group">
                  <label className="field-label" htmlFor={`${idPrefix}-c-author`}>
                    Author
                  </label>
                  <input
                    id={`${idPrefix}-c-author`}
                    type="text"
                    className="input mono"
                    value={newAuthor}
                    onChange={(e) => setNewAuthor(e.target.value)}
                  />
                </div>
                <div className="field-group">
                  <label className="field-label" htmlFor={`${idPrefix}-c-plat`}>
                    Platform
                  </label>
                  <select
                    id={`${idPrefix}-c-plat`}
                    className="select"
                    value={newPlatform}
                    onChange={(e) => setNewPlatform(e.target.value as PlatformId)}
                  >
                    {specs.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.shortName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="field-group">
                <label className="field-label" htmlFor={`${idPrefix}-c-text`}>
                  Test a comment
                </label>
                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                  <input
                    id={`${idPrefix}-c-text`}
                    type="text"
                    className="input"
                    placeholder="e.g. How much is enterprise pricing? Or: Checkout is broken!"
                    value={newText}
                    onChange={(e) => setNewText(e.target.value)}
                  />
                  <button type="submit" className="btn btn-primary">
                    <Plus size={15} aria-hidden="true" />
                    Classify
                  </button>
                </div>
              </div>
            </form>

            {/* Priority Filter Chips */}
            <div className="filter-chip-row" role="group" aria-label="Filter comments by intent">
              {FILTER_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className="preset-chip"
                  aria-pressed={activeFilter === opt.id}
                  onClick={() => setActiveFilter(opt.id)}
                >
                  <span>{opt.label}</span>
                  <span className="mono tabular" style={{ opacity: 0.85 }}>
                    ({filterCounts[opt.id]})
                  </span>
                </button>
              ))}
            </div>

            {/* Triaged Comments List */}
            <div className="triage-list">
              {visibleTriaged.length === 0 ? (
                <p className="field-hint">No comments match this filter.</p>
              ) : (
                visibleTriaged.map((item) => {
                  const prioBadgeClass =
                    item.priority === 'P0'
                      ? 'badge--error'
                      : item.priority === 'P1'
                        ? 'badge--cleared'
                        : item.priority === 'P2'
                          ? 'badge--warning'
                          : '';

                  return (
                    <article
                      key={item.comment.id}
                      className={`triage-card triage-card--${item.priority}`}
                    >
                      <div className="diag-head">
                        <div className="btn-row">
                          <span className={`badge ${prioBadgeClass}`}>{item.priority}</span>
                          <span className="badge badge--accent">
                            {INTENT_LABELS[item.intent]}
                          </span>
                          <span className="badge tabular">Score {item.score}</span>
                          <span className="badge tabular">{formatSla(item.recommendedSlaMinutes)}</span>
                        </div>
                        <span className="mono field-hint">
                          {item.comment.author} on {item.comment.platform}
                        </span>
                      </div>

                      <p style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>
                        &ldquo;{item.comment.text}&rdquo;
                      </p>

                      {item.matchedSignals.length > 0 && (
                        <div className="kpi-strip" aria-label="Matched classification signals">
                          {item.matchedSignals.map((sig) => (
                            <span key={sig} className="badge">
                              {sig}
                            </span>
                          ))}
                        </div>
                      )}

                      {item.complianceFlag && (
                        <div
                          className="diag-item diag-item--warning"
                          style={{ padding: '8px 10px' }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <ShieldAlert size={14} aria-hidden="true" style={{ color: 'var(--caution)', flex: 'none' }} />
                            <strong style={{ fontSize: 'var(--text-xs)' }}>Compliance note</strong>
                          </div>
                          <p className="field-hint" style={{ color: 'var(--ink)' }}>
                            {item.complianceFlag}
                          </p>
                        </div>
                      )}

                      <p className="field-hint">
                        <strong style={{ color: 'var(--ink)' }}>Suggested action:</strong>{' '}
                        {item.suggestedAction}
                      </p>
                    </article>
                  );
                })
              )}
            </div>
          </div>
        </section>

        {/* Right: UTM link checker & campaign link builder */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          <section className="instrument-card" aria-labelledby={`${idPrefix}-utm-audit-heading`}>
            <div className="card-header">
              <div className="card-title-group">
                <Link2 size={18} aria-hidden="true" />
                <div>
                  <h3 id={`${idPrefix}-utm-audit-heading`} className="card-title">
                    UTM link checker
                  </h3>
                  <p className="card-subtitle">
                    Catch casing mismatches, ad click-ID clutter, and wrong platform tags before
                    posting
                  </p>
                </div>
              </div>
              <span
                className={`badge ${
                  utmAudit.issues.some((i) => i.severity === 'error')
                    ? 'badge--error'
                    : utmAudit.issues.length > 0
                      ? 'badge--warning'
                      : 'badge--cleared'
                }`}
              >
                {utmAudit.issues.length} issue{utmAudit.issues.length === 1 ? '' : 's'}
              </span>
            </div>

            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <div className="field-group">
                <label className="field-label" htmlFor={`${idPrefix}-utm-raw`}>
                  URL to check
                </label>
                <textarea
                  id={`${idPrefix}-utm-raw`}
                  className="textarea textarea--mono"
                  style={{ minHeight: '76px' }}
                  value={auditUrl}
                  onChange={(e) => setAuditUrl(e.target.value)}
                />
              </div>

              <div className="coord-grid">
                <div className="field-group">
                  <label className="field-label" htmlFor={`${idPrefix}-utm-plat`}>
                    Target platform
                  </label>
                  <select
                    id={`${idPrefix}-utm-plat`}
                    className="select"
                    value={auditPlatform}
                    onChange={(e) => setAuditPlatform(e.target.value as PlatformId)}
                  >
                    {specs.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field-group">
                  <label className="field-label" htmlFor={`${idPrefix}-utm-med`}>
                    Expected medium
                  </label>
                  <input
                    id={`${idPrefix}-utm-med`}
                    type="text"
                    className="input mono"
                    value={expectedMedium}
                    onChange={(e) => setExpectedMedium(e.target.value)}
                  />
                </div>
              </div>

              <div className="field-group">
                <label className="field-label" htmlFor={`${idPrefix}-utm-camp`}>
                  Expected campaign
                </label>
                <input
                  id={`${idPrefix}-utm-camp`}
                  type="text"
                  className="input mono"
                  value={expectedCampaign}
                  onChange={(e) => setExpectedCampaign(e.target.value)}
                />
              </div>

              {/* Issues list */}
              <div className="diag-list">
                {utmAudit.issues.length === 0 ? (
                  <div className="telemetry-pill telemetry-pill--cleared">
                    <Check size={14} aria-hidden="true" />
                    Tracking parameters look clean with no GA4 splitting issues.
                  </div>
                ) : (
                  utmAudit.issues.map((issue) => (
                    <div key={`${issue.code}-${issue.message}`} className={`diag-item diag-item--${issue.severity}`}>
                      <div className="diag-head">
                        <span className={`badge badge--${issue.severity}`}>
                          {formatIssueSeverity(issue.severity)}
                        </span>
                        <span className="mono" style={{ fontSize: '0.72rem', fontWeight: 700 }}>
                          {issue.code}
                        </span>
                      </div>
                      <p className="diag-hint" style={{ color: 'var(--ink)' }}>
                        {issue.message}
                      </p>
                    </div>
                  ))
                )}
              </div>

              {utmAudit.validUrl && utmAudit.normalizedUrl && (
                <div>
                  <div className="field-label-row" style={{ marginBlockEnd: '6px' }}>
                    <span className="field-label">Cleaned URL</span>
                    <button
                      type="button"
                      className="btn btn-sm btn-cleared"
                      onClick={() =>
                        copyText('utm-norm', utmAudit.normalizedUrl, 'Cleaned UTM URL')
                      }
                    >
                      {copiedId === 'utm-norm' ? (
                        <Check size={14} aria-hidden="true" />
                      ) : (
                        <Copy size={14} aria-hidden="true" />
                      )}
                      {copiedId === 'utm-norm' ? 'Copied' : 'Copy clean URL'}
                    </button>
                  </div>
                  <pre className="code-block">{utmAudit.normalizedUrl}</pre>
                </div>
              )}

              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px',
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                  background: 'var(--canvas)',
                  fontSize: 'var(--text-xs)',
                  color: 'var(--ink-muted)',
                }}
              >
                <AlertOctagon size={15} aria-hidden="true" style={{ color: 'var(--accent)', flex: 'none', marginTop: 2 }} />
                <span>{utmAudit.darkSocialRiskNote}</span>
              </div>
            </div>
          </section>

          {/* Campaign link builder */}
          <section className="instrument-card" aria-labelledby={`${idPrefix}-utm-builder-heading`}>
            <div className="card-header">
              <div className="card-title-group">
                <Link2 size={18} aria-hidden="true" />
                <div>
                  <h3 id={`${idPrefix}-utm-builder-heading`} className="card-title">
                    Campaign link builder
                  </h3>
                  <p className="card-subtitle">
                    Generate lowercase, hyphenated links without fbclid, gclid, or extra tracking
                    clutter
                  </p>
                </div>
              </div>
            </div>

            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <div className="field-group">
                <label className="field-label" htmlFor={`${idPrefix}-b-url`}>
                  Destination URL
                </label>
                <input
                  id={`${idPrefix}-b-url`}
                  type="text"
                  className="input mono"
                  value={builderBaseUrl}
                  onChange={(e) => setBuilderBaseUrl(e.target.value)}
                />
              </div>

              <div className="coord-grid">
                <div className="field-group">
                  <label className="field-label" htmlFor={`${idPrefix}-b-plat`}>
                    Platform (utm_source)
                  </label>
                  <select
                    id={`${idPrefix}-b-plat`}
                    className="select"
                    value={builderPlatform}
                    onChange={(e) => setBuilderPlatform(e.target.value as PlatformId)}
                  >
                    {specs.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field-group">
                  <label className="field-label" htmlFor={`${idPrefix}-b-med`}>
                    Medium (utm_medium)
                  </label>
                  <input
                    id={`${idPrefix}-b-med`}
                    type="text"
                    className="input mono"
                    value={builderMedium}
                    onChange={(e) => setBuilderMedium(e.target.value)}
                  />
                </div>
              </div>

              <div className="coord-grid">
                <div className="field-group">
                  <label className="field-label" htmlFor={`${idPrefix}-b-camp`}>
                    Campaign (utm_campaign)
                  </label>
                  <input
                    id={`${idPrefix}-b-camp`}
                    type="text"
                    className="input mono"
                    value={builderCampaign}
                    onChange={(e) => setBuilderCampaign(e.target.value)}
                  />
                </div>
                <div className="field-group">
                  <label className="field-label" htmlFor={`${idPrefix}-b-cont`}>
                    Content tag (utm_content)
                  </label>
                  <input
                    id={`${idPrefix}-b-cont`}
                    type="text"
                    className="input mono"
                    value={builderContent}
                    onChange={(e) => setBuilderContent(e.target.value)}
                  />
                </div>
              </div>

              {canonicalBuild.error ? (
                <div className="diag-item diag-item--error" role="alert">
                  <p className="diag-hint" style={{ color: 'var(--ink)' }}>
                    {canonicalBuild.error}
                  </p>
                </div>
              ) : canonicalBuild.url ? (
                <div>
                  <div className="field-label-row" style={{ marginBlockEnd: '6px' }}>
                    <span className="field-label">Generated link</span>
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      onClick={() =>
                        copyText('utm-built', canonicalBuild.url ?? '', 'Campaign link')
                      }
                    >
                      {copiedId === 'utm-built' ? (
                        <Check size={14} aria-hidden="true" />
                      ) : (
                        <Copy size={14} aria-hidden="true" />
                      )}
                      {copiedId === 'utm-built' ? 'Copied' : 'Copy link'}
                    </button>
                  </div>
                  <pre className="code-block">{canonicalBuild.url}</pre>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
