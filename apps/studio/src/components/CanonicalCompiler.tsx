import { useId, useMemo, useState } from 'react';
import {
  Check,
  Code2,
  Copy,
  Download,
  FileCode2,
  MessageCircle,
  RotateCcw,
} from 'lucide-react';
import {
  compileCanonicalPost,
  listPlatformSpecs,
  parseCanonicalMarkdown,
} from '@postflight/core';
import type { CompiledPlatformArtifact, PlatformId } from '@postflight/core';
import { SAMPLE_CANONICAL_MARKDOWN } from '../data/presets';

interface CanonicalCompilerProps {
  onAnnounce: (message: string) => void;
}

const SPONSORED_SAMPLE_MARKDOWN = `---
id: q4-partner-promo
title: Q4 Partner Launch Suite
campaign: q4-partner-promo
url: https://postflight.dev/offer?utm_source=LinkedIn&fbclid=IwAR999xyz
targets: [x, linkedin, bluesky, instagram-feed, tiktok, threads]
hashtags: [socialmediamarketing, growthhacking, digitalmarketing, fyp, viral, contentcreator]
sponsored: true
aiGenerated: true
dmKeyword: SUITE
---
🚀 𝐔𝐧𝐥𝐞𝐚𝐬𝐡 𝐭𝐡𝐞 𝐧𝐞𝐱𝐭 𝐠𝐞𝐧𝐞𝐫𝐚𝐭𝐢𝐨𝐧 𝐨𝐟 𝐩𝐫𝐞-𝐟𝐥𝐢𝐠𝐡𝐭 𝐜𝐨𝐧𝐭𝐞𝐧𝐭 𝐞𝐧𝐠𝐢𝐧𝐞𝐞𝐫𝐢𝐧𝐠!

PostFlight compiles one canonical Markdown source into compliant native posts across every channel: X threads with a reply link, LinkedIn hooks without blank-line fold starvation, Bluesky ATProto UTF-8 byte facets, and Instagram captions capped cleanly at 5 PascalCase hashtags.

Check the live open-source toolkit and run local validation in milliseconds.`;

export function CanonicalCompiler({ onAnnounce }: CanonicalCompilerProps) {
  const idPrefix = useId();
  const allSpecs = useMemo(() => listPlatformSpecs(), []);

  const [markdown, setMarkdown] = useState<string>(SAMPLE_CANONICAL_MARKDOWN);
  const [overrideTargets, setOverrideTargets] = useState<PlatformId[] | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const parsedDoc = useMemo(() => parseCanonicalMarkdown(markdown), [markdown]);

  const effectiveTargets = useMemo((): PlatformId[] => {
    if (overrideTargets && overrideTargets.length > 0) {
      return overrideTargets;
    }
    if (parsedDoc.frontmatter.targets && parsedDoc.frontmatter.targets.length > 0) {
      return parsedDoc.frontmatter.targets;
    }
    return ['x', 'linkedin', 'bluesky', 'mastodon', 'threads', 'instagram-feed'];
  }, [overrideTargets, parsedDoc.frontmatter.targets]);

  const bundle = useMemo(
    () => compileCanonicalPost(parsedDoc, effectiveTargets),
    [parsedDoc, effectiveTargets],
  );

  function toggleTarget(platform: PlatformId) {
    const current = effectiveTargets;
    if (current.includes(platform)) {
      if (current.length === 1) return;
      setOverrideTargets(current.filter((p) => p !== platform));
    } else {
      setOverrideTargets([...current, platform]);
    }
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

  function downloadBundleJson() {
    const json = JSON.stringify(bundle, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${bundle.sourceId || 'postflight-bundle'}.compiled.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    onAnnounce(`Exported ${bundle.artifacts.length}-platform compiled JSON bundle.`);
  }

  return (
    <div>
      <div className="section-header">
        <div>
          <h2 className="section-title">Repurpose one post for every platform</h2>
          <p className="section-desc">
            Write your draft once in Markdown and get ready-to-paste threads, captions, and clean
            links.
          </p>
        </div>

        <div className="btn-row">
          <button
            type="button"
            className="btn btn-sm"
            onClick={() =>
              copyText('bundle-json', JSON.stringify(bundle, null, 2), 'Compiled JSON bundle')
            }
          >
            {copiedId === 'bundle-json' ? (
              <Check size={14} aria-hidden="true" />
            ) : (
              <Copy size={14} aria-hidden="true" />
            )}
            {copiedId === 'bundle-json' ? 'Copied JSON' : 'Copy JSON'}
          </button>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={downloadBundleJson}
          >
            <Download size={14} aria-hidden="true" />
            Export JSON
          </button>
        </div>
      </div>

      <div className="compiler-layout">
        {/* LEFT PANE: Canonical Markdown + YAML Frontmatter Editor */}
        <section className="instrument-card" aria-labelledby={`${idPrefix}-md-heading`}>
          <div className="card-header">
            <div className="card-title-group">
              <FileCode2 size={17} aria-hidden="true" />
              <div>
                <h3 id={`${idPrefix}-md-heading`} className="card-title">
                  Markdown draft
                </h3>
                <p className="card-subtitle mono">
                  {parsedDoc.frontmatter.id ?? 'canonical-post'}.md
                </p>
              </div>
            </div>
            <div className="btn-row">
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  setMarkdown(SAMPLE_CANONICAL_MARKDOWN);
                  setOverrideTargets(null);
                  onAnnounce('Loaded launch post Markdown example.');
                }}
              >
                <RotateCcw size={13} aria-hidden="true" />
                Launch example
              </button>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  setMarkdown(SPONSORED_SAMPLE_MARKDOWN);
                  setOverrideTargets(null);
                  onAnnounce('Loaded sponsored post example.');
                }}
              >
                Sponsored example
              </button>
            </div>
          </div>

          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {/* Parsed Frontmatter Summary */}
            <div className="kpi-strip" aria-label="Parsed frontmatter fields">
              <span className="badge badge--accent">
                id: {parsedDoc.frontmatter.id ?? 'untitled'}
              </span>
              {parsedDoc.frontmatter.campaign && (
                <span className="badge">campaign: {parsedDoc.frontmatter.campaign}</span>
              )}
              {parsedDoc.frontmatter.dmKeyword && (
                <span className="badge badge--cleared">
                  DM keyword: {parsedDoc.frontmatter.dmKeyword}
                </span>
              )}
              {parsedDoc.frontmatter.sponsored && (
                <span className="badge badge--warning">Sponsored (#Ad added)</span>
              )}
              <span className="badge tabular">
                {parsedDoc.paragraphs.length} paragraph{parsedDoc.paragraphs.length === 1 ? '' : 's'}
              </span>
            </div>

            <div className="field-group">
              <label className="field-label" htmlFor={`${idPrefix}-md-editor`}>
                Frontmatter &amp; post copy
              </label>
              <textarea
                id={`${idPrefix}-md-editor`}
                className="textarea textarea--mono"
                style={{ minHeight: '380px' }}
                value={markdown}
                onChange={(e) => setMarkdown(e.target.value)}
                spellCheck={false}
              />
            </div>

            {/* Target Platforms Selector */}
            <div className="field-group">
              <div className="field-label-row">
                <span className="field-label">
                  Target platforms ({effectiveTargets.length})
                </span>
                {overrideTargets !== null && (
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() => setOverrideTargets(null)}
                  >
                    Reset to draft targets
                  </button>
                )}
              </div>
              <div className="platform-chip-grid" role="group" aria-label="Select compiler output platforms">
                {allSpecs.map((spec) => {
                  const active = effectiveTargets.includes(spec.id);
                  return (
                    <button
                      key={spec.id}
                      type="button"
                      className="platform-chip"
                      aria-pressed={active}
                      onClick={() => toggleTarget(spec.id)}
                    >
                      <span className="platform-chip-dot" aria-hidden="true" />
                      {spec.shortName}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* RIGHT PANE: Compiled Native Platform Outputs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {bundle.artifacts.map((artifact) => (
            <CompiledArtifactCard
              key={artifact.platform}
              artifact={artifact}
              copiedId={copiedId}
              onCopy={copyText}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

interface CompiledArtifactCardProps {
  artifact: CompiledPlatformArtifact;
  copiedId: string | null;
  onCopy: (id: string, value: string, label: string) => void;
}

function CompiledArtifactCard({
  artifact,
  copiedId,
  onCopy,
}: CompiledArtifactCardProps) {
  const [showFacets, setShowFacets] = useState(artifact.platform === 'bluesky');

  const fullCompiledCopy = [
    ...artifact.posts,
    ...(artifact.firstComment ? [`\n--- First Comment ---\n${artifact.firstComment}`] : []),
  ].join('\n\n');

  const scoreTone =
    artifact.lintSummary.errors === 0 && artifact.lintSummary.score >= 85
      ? 'badge--cleared'
      : artifact.lintSummary.errors > 0
        ? 'badge--error'
        : 'badge--warning';

  const totalFacets =
    artifact.facets?.reduce((sum, list) => sum + list.length, 0) ?? 0;

  return (
    <article className="instrument-card">
      <div className="card-header">
        <div className="card-title-group">
          <Code2 size={17} aria-hidden="true" />
          <div>
            <h3 className="card-title">{artifact.platformName}</h3>
            <p className="card-subtitle tabular">
              {artifact.posts.length > 1
                ? `${artifact.posts.length}-part thread`
                : 'Single post'}
              {artifact.facets
                ? `, ${totalFacets} Bluesky ${totalFacets === 1 ? 'facet' : 'facets'}`
                : ''}
            </p>
          </div>
        </div>
        <div className="btn-row">
          <span className={`badge tabular ${scoreTone}`}>
            Score {artifact.lintSummary.score}/100
            {artifact.lintSummary.errors > 0 || artifact.lintSummary.warnings > 0
              ? ` (${artifact.lintSummary.errors} err, ${artifact.lintSummary.warnings} warn)`
              : ''}
          </span>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() =>
              onCopy(
                `art-${artifact.platform}`,
                fullCompiledCopy,
                `${artifact.platformName} post`,
              )
            }
          >
            {copiedId === `art-${artifact.platform}` ? (
              <Check size={13} aria-hidden="true" />
            ) : (
              <Copy size={13} aria-hidden="true" />
            )}
            {copiedId === `art-${artifact.platform}` ? 'Copied' : 'Copy text'}
          </button>
        </div>
      </div>

      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {/* Adaptations Applied */}
        {artifact.adaptationsApplied.length > 0 && (
          <div className="kpi-strip" aria-label="Platform adaptations applied">
            {artifact.adaptationsApplied.map((item) => (
              <span key={item} className="badge badge--accent" style={{ whiteSpace: 'normal' }}>
                {item}
              </span>
            ))}
          </div>
        )}

        {/* Canonical UTM URL */}
        {artifact.utmUrl && (
          <div style={{ fontSize: 'var(--text-xs)' }}>
            <span className="field-label" style={{ marginInlineEnd: 6 }}>
              Tracking link:
            </span>
            <code className="mono" style={{ wordBreak: 'break-all', color: 'var(--accent)' }}>
              {artifact.utmUrl}
            </code>
          </div>
        )}

        {/* DM Funnel Note (Instagram / TikTok) */}
        {artifact.dmFunnelNote && (
          <div className="diag-item" style={{ borderInlineStartColor: 'var(--cleared)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <MessageCircle size={14} aria-hidden="true" style={{ color: 'var(--cleared)' }} />
              <strong style={{ fontSize: 'var(--text-xs)' }}>DM funnel note</strong>
            </div>
            <p className="diag-hint" style={{ color: 'var(--ink)' }}>
              {artifact.dmFunnelNote}
            </p>
          </div>
        )}

        {/* Compiled Post / Thread Cards */}
        <div className="thread-stack">
          {artifact.posts.map((postText, idx) => (
            <div key={`${artifact.platform}-post-${idx}`} className="thread-card">
              {artifact.posts.length > 1 && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBlockEnd: '6px',
                  }}
                >
                  <span className="badge badge--accent tabular">
                    Post {idx + 1} / {artifact.posts.length}
                  </span>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost"
                    onClick={() =>
                      onCopy(
                        `art-${artifact.platform}-${idx}`,
                        postText,
                        `${artifact.platformName} part ${idx + 1}`,
                      )
                    }
                  >
                    {copiedId === `art-${artifact.platform}-${idx}` ? (
                      <Check size={12} aria-hidden="true" />
                    ) : (
                      <Copy size={12} aria-hidden="true" />
                    )}
                    Copy
                  </button>
                </div>
              )}
              <div>{postText}</div>
            </div>
          ))}
        </div>

        {/* First Comment / Reply */}
        {artifact.firstComment && (
          <div className="thread-card" style={{ borderStyle: 'dashed' }}>
            <span className="badge" style={{ marginBlockEnd: 6 }}>
              First comment / reply
            </span>
            <div>{artifact.firstComment}</div>
          </div>
        )}

        {/* Bluesky ATProto UTF-8 Byte-Offset Facets JSON Inspector */}
        {artifact.facets && artifact.facets.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div className="field-label-row">
              <span className="field-label">
                Bluesky facets JSON (UTF-8 byte offsets)
              </span>
              <div className="btn-row">
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => setShowFacets((v) => !v)}
                >
                  {showFacets ? 'Hide JSON' : 'Show JSON'}
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() =>
                    onCopy(
                      `facets-${artifact.platform}`,
                      JSON.stringify(artifact.facets, null, 2),
                      'Bluesky facets JSON',
                    )
                  }
                >
                  {copiedId === `facets-${artifact.platform}` ? (
                    <Check size={13} aria-hidden="true" />
                  ) : (
                    <Copy size={13} aria-hidden="true" />
                  )}
                  Copy JSON
                </button>
              </div>
            </div>
            {showFacets && (
              <pre className="code-block">
                {JSON.stringify(artifact.facets, null, 2)}
              </pre>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
