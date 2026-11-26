import { useId, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  Check,
  CheckCircle2,
  Clapperboard,
  Contrast,
  Copy,
  Globe,
  Info,
  ShieldAlert,
} from 'lucide-react';
import {
  buildFfmpegNormalizeCommand,
  calculateContrastRatio,
  listPlatformSpecs,
  validateOpenGraph,
} from '@postflight/core';
import type {
  ContrastResult,
  LintDiagnostic,
  OpenGraphMeta,
  PlatformId,
} from '@postflight/core';

interface MediaOgLabProps {
  onAnnounce: (message: string) => void;
}

const HEX_PATTERN = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function expandHexForColorInput(hex: string, fallback: string): string {
  const match = HEX_PATTERN.exec(hex.trim());
  if (!match) return fallback;
  const raw = match[1] ?? '';
  if (raw.length === 3) {
    const c0 = raw[0] ?? '0';
    const c1 = raw[1] ?? '0';
    const c2 = raw[2] ?? '0';
    return `#${c0}${c0}${c1}${c1}${c2}${c2}`;
  }
  return `#${raw}`;
}

export function MediaOgLab({ onAnnounce }: MediaOgLabProps) {
  const idPrefix = useId();
  const specs = useMemo(() => listPlatformSpecs(), []);

  // 1. Open Graph Forensics state
  const [ogUrl, setOgUrl] = useState('https://postflight.dev/launch');
  const [ogTitle, setOgTitle] = useState(
    'PostFlight — Catch Social Reach Killers, Fold Cuts & Safe-Zone Collisions Locally',
  );
  const [ogDesc, setOgDesc] = useState(
    'Zero-API-key pre-flight compiler for 9 social platforms: fold simulation, 9:16 X-ray, Bluesky UTF-8 facets, and WCAG contrast verification.',
  );
  const [ogWidth, setOgWidth] = useState(1200);
  const [ogHeight, setOgHeight] = useState(630);
  const [ogSizeKb, setOgSizeKb] = useState(420);
  const [ogFormat, setOgFormat] = useState<NonNullable<OpenGraphMeta['imageFormat']>>('png');
  const [twitterCard, setTwitterCard] =
    useState<NonNullable<OpenGraphMeta['twitterCard']>>('summary_large_image');

  // 2. WCAG Contrast Lab state
  const [fgHex, setFgHex] = useState('#FFFFFF');
  const [bgHex, setBgHex] = useState('#0D5E99');

  // 3. FFmpeg Pipeline Builder state
  const [ffmpegPlatform, setFfmpegPlatform] = useState<PlatformId>('instagram-reels');
  const [ffmpegInput, setFfmpegInput] = useState('iphone-16-hdr-cut.mov');
  const [ffmpegOutput, setFfmpegOutput] = useState('reels-rec709-ready.mp4');
  const [ffmpegHdr, setFfmpegHdr] = useState(true);
  const [ffmpegFps, setFfmpegFps] = useState<24 | 30 | 60>(30);

  const [copiedId, setCopiedId] = useState<string | null>(null);

  const ogMeta: OpenGraphMeta = useMemo(
    () => ({
      url: ogUrl,
      title: ogTitle,
      description: ogDesc,
      imageWidth: ogWidth,
      imageHeight: ogHeight,
      imageSizeBytes: Math.round(ogSizeKb * 1024),
      imageFormat: ogFormat,
      twitterCard,
    }),
    [ogUrl, ogTitle, ogDesc, ogWidth, ogHeight, ogSizeKb, ogFormat, twitterCard],
  );

  const ogDiagnostics = useMemo(() => {
    const xDiags = validateOpenGraph(ogMeta, 'x');
    const liDiags = validateOpenGraph(ogMeta, 'linkedin');
    const merged: Array<LintDiagnostic & { surfaces: string[] }> = [];
    const byKey = new Map<string, LintDiagnostic & { surfaces: string[] }>();

    for (const d of [...xDiags, ...liDiags]) {
      const surfaceLabel = d.platform === 'x' ? 'X' : 'LinkedIn';
      const key = `${d.ruleId}:${d.message}`;
      const existing = byKey.get(key);
      if (existing) {
        if (!existing.surfaces.includes(surfaceLabel)) {
          existing.surfaces.push(surfaceLabel);
        }
      } else {
        const entry = { ...d, surfaces: [surfaceLabel] };
        byKey.set(key, entry);
        merged.push(entry);
      }
    }
    return merged;
  }, [ogMeta]);

  const ogRatio = ogHeight > 0 ? ogWidth / ogHeight : 0;
  const linkedinIsSmallThumb = ogWidth < 1200 || ogHeight < 627;
  const xHasCropRisk = Math.abs(ogRatio - 2.0) > 0.05;
  const whatsappKbPercent = Math.min(100, (ogSizeKb / 300) * 100);
  const whatsappOver = ogSizeKb > 300;
  const crawlerOver = ogSizeKb > 5120;

  const ogMetaHtmlSnippet = useMemo(() => {
    const escapedTitle = ogTitle.replace(/"/g, '&quot;');
    const escapedDesc = ogDesc.replace(/"/g, '&quot;');
    const safeUrl = ogUrl.trim() || 'https://example.com/';
    const imgExt = ogFormat === 'jpeg' ? 'jpg' : ogFormat;
    return [
      `<meta property="og:type" content="website" />`,
      `<meta property="og:url" content="${safeUrl}" />`,
      `<meta property="og:title" content="${escapedTitle}" />`,
      `<meta property="og:description" content="${escapedDesc}" />`,
      `<meta property="og:image" content="${safeUrl.replace(/\/$/, '')}/og-card.${imgExt}?v=2026a" />`,
      `<meta property="og:image:width" content="${ogWidth}" />`,
      `<meta property="og:image:height" content="${ogHeight}" />`,
      `<meta name="twitter:card" content="${twitterCard}" />`,
    ].join('\n');
  }, [ogTitle, ogDesc, ogUrl, ogFormat, ogWidth, ogHeight, twitterCard]);

  const contrastState = useMemo((): { result: ContrastResult | null; error: string | null } => {
    if (!HEX_PATTERN.test(fgHex.trim()) || !HEX_PATTERN.test(bgHex.trim())) {
      return {
        result: null,
        error: 'Enter valid 3-digit (#RGB) or 6-digit (#RRGGBB) hex colors to compute WCAG 2.2 luminance.',
      };
    }
    try {
      return { result: calculateContrastRatio(fgHex, bgHex), error: null };
    } catch (err) {
      return {
        result: null,
        error: err instanceof Error ? err.message : 'Invalid hex color format.',
      };
    }
  }, [fgHex, bgHex]);

  const ffmpegResult = useMemo(
    () =>
      buildFfmpegNormalizeCommand(ffmpegPlatform, {
        input: ffmpegInput.trim() || 'input.mov',
        output: ffmpegOutput.trim() || `${ffmpegPlatform}-normalized.mp4`,
        isHdr: ffmpegHdr,
        targetFps: ffmpegFps,
      }),
    [ffmpegPlatform, ffmpegInput, ffmpegOutput, ffmpegHdr, ffmpegFps],
  );

  async function copyText(id: string, text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      onAnnounce(`${label} copied to clipboard.`);
      window.setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1800);
    } catch {
      onAnnounce(`Could not access clipboard for ${label}.`);
    }
  }

  function formatSeverityLabel(severity: LintDiagnostic['severity']): string {
    if (severity === 'error') return 'Error';
    if (severity === 'warning') return 'Warning';
    return 'Info';
  }

  return (
    <div className="lab-stack">
      <div className="section-header">
        <div>
          <h2 className="section-title">Media, link cards &amp; contrast</h2>
          <p className="section-desc">
            Verify Open Graph link previews, check caption contrast, and generate clean video export
            commands.
          </p>
        </div>
      </div>

      {/* Instrument 1: Link preview check */}
      <section className="instrument-card" aria-labelledby={`${idPrefix}-og-heading`}>
        <div className="card-header">
          <div className="card-title-group">
            <Globe size={18} aria-hidden="true" />
            <div>
              <h3 id={`${idPrefix}-og-heading`} className="card-title">
                Link preview check
              </h3>
              <p className="card-subtitle">
                Compare LinkedIn 1.91:1 and X 2:1 link crops and check WhatsApp&apos;s 300 KB image
                limit
              </p>
            </div>
          </div>
          <div className="btn-row">
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                setOgWidth(1200);
                setOgHeight(630);
                setOgSizeKb(210);
                setOgFormat('jpeg');
                setTwitterCard('summary_large_image');
                setOgUrl('https://postflight.dev/launch?v=2026a');
                onAnnounce('Loaded optimal 1200 by 630 JPEG Open Graph preset under 300 kilobytes.');
              }}
            >
              <CheckCircle2 size={14} aria-hidden="true" />
              Optimal 1200×630 (&lt;300 KB)
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                setOgWidth(960);
                setOgHeight(540);
                setOgSizeKb(640);
                setOgFormat('webp');
                setTwitterCard('summary');
                setOgUrl('http://postflight.dev/launch');
                onAnnounce('Loaded broken Open Graph example with a 300 KB overflow and WebP image.');
              }}
            >
              <AlertTriangle size={14} aria-hidden="true" />
              Broken preview example
            </button>
          </div>
        </div>

        <div className="card-body">
          <div className="lab-two-col">
            {/* OG Controls */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <div className="field-group">
                <label className="field-label" htmlFor={`${idPrefix}-og-url`}>
                  Page URL (og:url)
                </label>
                <input
                  id={`${idPrefix}-og-url`}
                  type="url"
                  className="input mono"
                  value={ogUrl}
                  onChange={(e) => setOgUrl(e.target.value)}
                />
              </div>

              <div className="field-group">
                <div className="field-label-row">
                  <label className="field-label" htmlFor={`${idPrefix}-og-title`}>
                    Title (og:title)
                  </label>
                  <span
                    className={`mono tabular ${ogTitle.length > 70 ? 'badge badge--warning' : 'field-hint'}`}
                  >
                    {ogTitle.length} / 70 chars
                  </span>
                </div>
                <input
                  id={`${idPrefix}-og-title`}
                  type="text"
                  className="input"
                  value={ogTitle}
                  onChange={(e) => setOgTitle(e.target.value)}
                />
              </div>

              <div className="field-group">
                <div className="field-label-row">
                  <label className="field-label" htmlFor={`${idPrefix}-og-desc`}>
                    Description (og:description)
                  </label>
                  <span
                    className={`mono tabular ${ogDesc.length > 200 ? 'badge badge--warning' : 'field-hint'}`}
                  >
                    {ogDesc.length} / 200 chars
                  </span>
                </div>
                <textarea
                  id={`${idPrefix}-og-desc`}
                  className="textarea"
                  style={{ minHeight: '72px' }}
                  value={ogDesc}
                  onChange={(e) => setOgDesc(e.target.value)}
                />
              </div>

              <div className="coord-grid">
                <div className="field-group">
                  <label className="field-label" htmlFor={`${idPrefix}-og-w`}>
                    Image width (px)
                  </label>
                  <input
                    id={`${idPrefix}-og-w`}
                    type="number"
                    min={100}
                    max={4096}
                    className="input mono tabular"
                    value={ogWidth}
                    onChange={(e) => setOgWidth(Math.max(100, Number(e.target.value) || 0))}
                  />
                </div>
                <div className="field-group">
                  <label className="field-label" htmlFor={`${idPrefix}-og-h`}>
                    Image height (px)
                  </label>
                  <input
                    id={`${idPrefix}-og-h`}
                    type="number"
                    min={100}
                    max={4096}
                    className="input mono tabular"
                    value={ogHeight}
                    onChange={(e) => setOgHeight(Math.max(100, Number(e.target.value) || 0))}
                  />
                </div>
              </div>

              <div className="coord-grid">
                <div className="field-group">
                  <label className="field-label" htmlFor={`${idPrefix}-og-fmt`}>
                    Image format
                  </label>
                  <select
                    id={`${idPrefix}-og-fmt`}
                    className="select"
                    value={ogFormat}
                    onChange={(e) =>
                      setOgFormat(e.target.value as NonNullable<OpenGraphMeta['imageFormat']>)
                    }
                  >
                    <option value="jpeg">JPEG (recommended)</option>
                    <option value="png">PNG (recommended)</option>
                    <option value="webp">WebP (limited crawler support)</option>
                    <option value="avif">AVIF (limited crawler support)</option>
                    <option value="svg">SVG (not supported)</option>
                    <option value="gif">GIF</option>
                  </select>
                </div>

                <div className="field-group">
                  <label className="field-label" htmlFor={`${idPrefix}-og-tw`}>
                    X card type (twitter:card)
                  </label>
                  <select
                    id={`${idPrefix}-og-tw`}
                    className="select"
                    value={twitterCard}
                    onChange={(e) =>
                      setTwitterCard(e.target.value as NonNullable<OpenGraphMeta['twitterCard']>)
                    }
                  >
                    <option value="summary_large_image">summary_large_image</option>
                    <option value="summary">summary (small square)</option>
                    <option value="none">Missing / none</option>
                  </select>
                </div>
              </div>

              {/* WhatsApp 300 KB Gauge */}
              <div className="meter-block">
                <div className="meter-header">
                  <label className="field-label" htmlFor={`${idPrefix}-og-kb`}>
                    WhatsApp &amp; iMessage 300 KB image limit
                  </label>
                  <span
                    className={`badge tabular ${
                      crawlerOver
                        ? 'badge--error'
                        : whatsappOver
                          ? 'badge--warning'
                          : 'badge--cleared'
                    }`}
                  >
                    {ogSizeKb} KB ({crawlerOver ? 'Over 5 MB limit' : whatsappOver ? 'Over 300 KB' : 'Safe'})
                  </span>
                </div>
                <div className="meter-track" aria-hidden="true">
                  <div
                    className={`meter-fill ${
                      crawlerOver
                        ? 'meter-fill--over'
                        : whatsappOver
                          ? 'meter-fill--warn'
                          : ''
                    }`}
                    style={{ width: `${whatsappKbPercent}%` }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <input
                    id={`${idPrefix}-og-kb`}
                    type="range"
                    min={40}
                    max={6000}
                    step={10}
                    value={ogSizeKb}
                    onChange={(e) => setOgSizeKb(Number(e.target.value))}
                    style={{ flex: 1, accentColor: 'var(--accent)' }}
                    aria-describedby={`${idPrefix}-og-kb-hint`}
                  />
                  <input
                    type="number"
                    min={1}
                    max={15000}
                    value={ogSizeKb}
                    onChange={(e) => setOgSizeKb(Math.max(1, Number(e.target.value) || 1))}
                    className="input mono tabular"
                    style={{ width: '96px' }}
                    aria-label="Open Graph image size in kilobytes"
                  />
                </div>
                <p id={`${idPrefix}-og-kb-hint`} className="field-hint">
                  WhatsApp and iMessage silently drop og:image thumbnails above 300 KB (307,200 bytes).
                </p>
              </div>
            </div>

            {/* OG Previews & Diagnostics */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div className="og-preview-grid">
                {/* LinkedIn 1.91:1 Preview */}
                <div className="og-card-mockup">
                  <div className="card-header" style={{ padding: '6px 10px' }}>
                    <span className="mono" style={{ fontSize: '0.72rem', fontWeight: 700 }}>
                      LinkedIn 1.91:1 card
                    </span>
                    <span
                      className={`badge ${linkedinIsSmallThumb ? 'badge--warning' : 'badge--cleared'}`}
                    >
                      {linkedinIsSmallThumb ? 'Side thumbnail' : 'Full width'}
                    </span>
                  </div>
                  <div className="og-card-media og-card-media--linkedin">
                    <span className="mono tabular" style={{ fontSize: '0.75rem', fontWeight: 700 }}>
                      {ogWidth} × {ogHeight} ({ogRatio.toFixed(2)}:1)
                    </span>
                    <span className="field-hint">
                      {ogFormat.toUpperCase()}, {ogSizeKb} KB
                    </span>
                  </div>
                  <div className="og-card-meta">
                    <strong style={{ fontSize: '0.82rem' }}>{ogTitle || '(Missing og:title)'}</strong>
                    <span className="field-hint mono" style={{ fontSize: '0.7rem' }}>
                      {(() => {
                        try {
                          return new URL(ogUrl).hostname;
                        } catch {
                          return 'invalid-url';
                        }
                      })()}
                    </span>
                  </div>
                </div>

                {/* X 2:1 Crop Preview */}
                <div className="og-card-mockup">
                  <div className="card-header" style={{ padding: '6px 10px' }}>
                    <span className="mono" style={{ fontSize: '0.72rem', fontWeight: 700 }}>
                      X 2:1 crop ({twitterCard})
                    </span>
                    <span className={`badge ${xHasCropRisk ? 'badge--warning' : 'badge--cleared'}`}>
                      {xHasCropRisk ? 'Edge crop' : 'Exact 2:1'}
                    </span>
                  </div>
                  <div className="og-card-media og-card-media--x">
                    {xHasCropRisk && (
                      <>
                        <div className="og-crop-stripe og-crop-stripe--top" aria-hidden="true" />
                        <div className="og-crop-stripe og-crop-stripe--bottom" aria-hidden="true" />
                      </>
                    )}
                    <span className="mono tabular" style={{ fontSize: '0.75rem', fontWeight: 700 }}>
                      {twitterCard === 'summary_large_image'
                        ? '1200 × 600 target window'
                        : 'Small square card'}
                    </span>
                    <span className="field-hint">
                      {xHasCropRisk ? 'Keep text inside a 15px vertical safe buffer' : 'Clean 2:1 framing'}
                    </span>
                  </div>
                  <div className="og-card-meta">
                    <strong style={{ fontSize: '0.82rem' }}>
                      {ogTitle.length > 70 ? `${ogTitle.slice(0, 67)}...` : ogTitle || '(No title)'}
                    </strong>
                    <span className="field-hint" style={{ fontSize: '0.74rem' }}>
                      {ogDesc.length > 110 ? `${ogDesc.slice(0, 107)}...` : ogDesc || '(No description)'}
                    </span>
                  </div>
                </div>
              </div>

              {/* OG Diagnostics */}
              <div className="diag-list" aria-label="Open Graph diagnostics">
                {ogDiagnostics.length === 0 ? (
                  <div className="telemetry-pill telemetry-pill--cleared">
                    <CheckCircle2 size={15} aria-hidden="true" />
                    All Open Graph and messaging preview checks passed.
                  </div>
                ) : (
                  ogDiagnostics.map((d) => (
                    <div key={`${d.ruleId}-${d.message}`} className={`diag-item diag-item--${d.severity}`}>
                      <div className="diag-head">
                        <span className="btn-row">
                          <span className={`badge badge--${d.severity}`}>
                            {formatSeverityLabel(d.severity)}
                          </span>
                          <span className="mono" style={{ fontSize: '0.74rem', fontWeight: 700 }}>
                            {d.ruleId}
                          </span>
                        </span>
                        <span className="badge">{d.surfaces.join(' + ')}</span>
                      </div>
                      <p className="diag-msg">{d.message}</p>
                      <p className="diag-hint">{d.fixHint}</p>
                    </div>
                  ))
                )}
              </div>

              <div>
                <div className="field-label-row" style={{ marginBlockEnd: '6px' }}>
                  <span className="field-label">Generated Open Graph meta tags</span>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => copyText('og-meta', ogMetaHtmlSnippet, 'Open Graph HTML tags')}
                  >
                    {copiedId === 'og-meta' ? (
                      <Check size={14} aria-hidden="true" />
                    ) : (
                      <Copy size={14} aria-hidden="true" />
                    )}
                    {copiedId === 'og-meta' ? 'Copied' : 'Copy HTML tags'}
                  </button>
                </div>
                <pre className="code-block">{ogMetaHtmlSnippet}</pre>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Instrument 2: Text contrast check */}
      <section className="instrument-card" aria-labelledby={`${idPrefix}-wcag-heading`}>
        <div className="card-header">
          <div className="card-title-group">
            <Contrast size={18} aria-hidden="true" />
            <div>
              <h3 id={`${idPrefix}-wcag-heading`} className="card-title">
                Text contrast check
              </h3>
              <p className="card-subtitle">
                Check video captions, slide text, and button pills against WCAG 2.2 readability
                standards
              </p>
            </div>
          </div>
          <div className="btn-row">
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                setFgHex('#FFFFFF');
                setBgHex('#141A23');
                onAnnounce('Loaded high-contrast white on dark preset.');
              }}
            >
              White on dark
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                setFgHex('#94A3B8');
                setBgHex('#FFFFFF');
                onAnnounce('Loaded low-contrast gray example.');
              }}
            >
              Low-contrast example
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                setFgHex(bgHex);
                setBgHex(fgHex);
                onAnnounce('Swapped text and background colors.');
              }}
            >
              <ArrowLeftRight size={14} aria-hidden="true" />
              Swap
            </button>
          </div>
        </div>

        <div className="card-body">
          <div className="lab-two-col">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <div className="coord-grid">
                <div className="field-group">
                  <label className="field-label" htmlFor={`${idPrefix}-fg-text`}>
                    Text color
                  </label>
                  <div className="color-input-row">
                    <input
                      type="color"
                      className="color-swatch-input"
                      value={expandHexForColorInput(fgHex, '#ffffff')}
                      onChange={(e) => setFgHex(e.target.value.toUpperCase())}
                      aria-label="Foreground color picker"
                    />
                    <input
                      id={`${idPrefix}-fg-text`}
                      type="text"
                      className="input mono"
                      value={fgHex}
                      onChange={(e) => setFgHex(e.target.value)}
                    />
                  </div>
                </div>

                <div className="field-group">
                  <label className="field-label" htmlFor={`${idPrefix}-bg-text`}>
                    Background color
                  </label>
                  <div className="color-input-row">
                    <input
                      type="color"
                      className="color-swatch-input"
                      value={expandHexForColorInput(bgHex, '#0d5e99')}
                      onChange={(e) => setBgHex(e.target.value.toUpperCase())}
                      aria-label="Background color picker"
                    />
                    <input
                      id={`${idPrefix}-bg-text`}
                      type="text"
                      className="input mono"
                      value={bgHex}
                      onChange={(e) => setBgHex(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {contrastState.error ? (
                <div className="diag-item diag-item--error" role="alert">
                  <p className="diag-msg">{contrastState.error}</p>
                </div>
              ) : contrastState.result ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                    <span className="contrast-ratio-big tabular">
                      {contrastState.result.ratio.toFixed(2)}:1
                    </span>
                    <span
                      className={`badge ${
                        contrastState.result.aaNormal
                          ? 'badge--cleared'
                          : contrastState.result.aaLarge
                            ? 'badge--warning'
                            : 'badge--error'
                      }`}
                    >
                      {contrastState.result.aaaNormal
                        ? 'Passes WCAG AAA'
                        : contrastState.result.aaNormal
                          ? 'Passes WCAG AA'
                          : contrastState.result.aaLarge
                            ? 'Large text only'
                            : 'Fails WCAG 2.2'}
                    </span>
                  </div>

                  <div className="kpi-strip">
                    <span
                      className={`badge ${contrastState.result.aaNormal ? 'badge--cleared' : 'badge--error'}`}
                    >
                      AA normal (&ge;4.5): {contrastState.result.aaNormal ? 'Pass' : 'Fail'}
                    </span>
                    <span
                      className={`badge ${contrastState.result.aaLarge ? 'badge--cleared' : 'badge--error'}`}
                    >
                      AA large (&ge;3.0): {contrastState.result.aaLarge ? 'Pass' : 'Fail'}
                    </span>
                    <span
                      className={`badge ${contrastState.result.aaNonText ? 'badge--cleared' : 'badge--error'}`}
                    >
                      AA UI &amp; icons (&ge;3.0): {contrastState.result.aaNonText ? 'Pass' : 'Fail'}
                    </span>
                    <span
                      className={`badge ${contrastState.result.aaaNormal ? 'badge--cleared' : 'badge--warning'}`}
                    >
                      AAA normal (&ge;7.0): {contrastState.result.aaaNormal ? 'Pass' : 'Fail'}
                    </span>
                    <span
                      className={`badge ${contrastState.result.aaaLarge ? 'badge--cleared' : 'badge--warning'}`}
                    >
                      AAA large (&ge;4.5): {contrastState.result.aaaLarge ? 'Pass' : 'Fail'}
                    </span>
                  </div>

                  <p className="field-hint">{contrastState.result.recommendation}</p>
                </>
              ) : null}
            </div>

            <div
              className="contrast-preview-stage"
              style={{
                backgroundColor: expandHexForColorInput(bgHex, '#0d5e99'),
                color: expandHexForColorInput(fgHex, '#ffffff'),
              }}
            >
              <span
                style={{
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  opacity: 0.9,
                }}
              >
                Live caption preview
              </span>
              <div style={{ fontSize: '1.35rem', fontWeight: 700, fontFamily: 'var(--font-display)' }}>
                Check caption readability before exporting.
              </div>
              <p style={{ fontSize: '0.9rem', maxWidth: '42ch' }}>
                Normal body caption (14.4px): Keep burned-in subtitles at or above 4.5:1 contrast so
                viewers watching outdoors on mobile can read comfortably.
              </p>
              <span
                style={{
                  display: 'inline-block',
                  padding: '5px 12px',
                  borderRadius: '999px',
                  border: `2px solid ${expandHexForColorInput(fgHex, '#ffffff')}`,
                  fontSize: '0.78rem',
                  fontWeight: 700,
                }}
              >
                Button or badge border
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Instrument 3: Video export command */}
      <section className="instrument-card" aria-labelledby={`${idPrefix}-ffmpeg-heading`}>
        <div className="card-header">
          <div className="card-title-group">
            <Clapperboard size={18} aria-hidden="true" />
            <div>
              <h3 id={`${idPrefix}-ffmpeg-heading`} className="card-title">
                Video export command
              </h3>
              <p className="card-subtitle">
                Generate a Rec.709 SDR, constant frame rate, -14 LUFS FFmpeg command to avoid harsh
                platform re-compression
              </p>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => copyText('ffmpeg-cmd', ffmpegResult.command, 'FFmpeg command')}
          >
            {copiedId === 'ffmpeg-cmd' ? (
              <Check size={14} aria-hidden="true" />
            ) : (
              <Copy size={14} aria-hidden="true" />
            )}
            {copiedId === 'ffmpeg-cmd' ? 'Copied' : 'Copy command'}
          </button>
        </div>

        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div className="lab-two-col">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <div className="field-group">
                <label className="field-label" htmlFor={`${idPrefix}-ff-plat`}>
                  Target platform
                </label>
                <select
                  id={`${idPrefix}-ff-plat`}
                  className="select"
                  value={ffmpegPlatform}
                  onChange={(e) => {
                    const next = e.target.value as PlatformId;
                    setFfmpegPlatform(next);
                    setFfmpegOutput(`${next}-rec709-ready.mp4`);
                  }}
                >
                  {specs.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="coord-grid">
                <div className="field-group">
                  <label className="field-label" htmlFor={`${idPrefix}-ff-in`}>
                    Input file
                  </label>
                  <input
                    id={`${idPrefix}-ff-in`}
                    type="text"
                    className="input mono"
                    value={ffmpegInput}
                    onChange={(e) => setFfmpegInput(e.target.value)}
                  />
                </div>
                <div className="field-group">
                  <label className="field-label" htmlFor={`${idPrefix}-ff-out`}>
                    Output file
                  </label>
                  <input
                    id={`${idPrefix}-ff-out`}
                    type="text"
                    className="input mono"
                    value={ffmpegOutput}
                    onChange={(e) => setFfmpegOutput(e.target.value)}
                  />
                </div>
              </div>

              <div className="checkbox-row">
                <label className="checkbox-pill">
                  <input
                    type="checkbox"
                    checked={ffmpegHdr}
                    onChange={(e) => setFfmpegHdr(e.target.checked)}
                  />
                  Convert 10-bit HDR (HLG/Dolby Vision) to Rec.709 SDR
                </label>

                <div className="theme-switcher" role="group" aria-label="Target constant frame rate">
                  {([24, 30, 60] as const).map((fps) => (
                    <button
                      key={fps}
                      type="button"
                      className="theme-btn mono tabular"
                      aria-pressed={ffmpegFps === fps}
                      onClick={() => setFfmpegFps(fps)}
                    >
                      {fps} fps
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="spec-checklist" aria-label="Target encode specifications">
              <div className="spec-cell">
                <span className="spec-cell-label">Resolution</span>
                <span className="spec-cell-val tabular">{ffmpegResult.targetSpecs.resolution}</span>
              </div>
              <div className="spec-cell">
                <span className="spec-cell-label">Video codec</span>
                <span className="spec-cell-val">{ffmpegResult.targetSpecs.codec}</span>
              </div>
              <div className="spec-cell">
                <span className="spec-cell-label">Pixel format</span>
                <span className="spec-cell-val">{ffmpegResult.targetSpecs.pixelFormat}</span>
              </div>
              <div className="spec-cell">
                <span className="spec-cell-label">Color space</span>
                <span className="spec-cell-val">{ffmpegResult.targetSpecs.colorSpace}</span>
              </div>
              <div className="spec-cell">
                <span className="spec-cell-label">Frame rate &amp; bitrate</span>
                <span className="spec-cell-val tabular">
                  {ffmpegResult.targetSpecs.fps} fps CFR, {ffmpegResult.targetSpecs.videoBitrate}
                </span>
              </div>
              <div className="spec-cell">
                <span className="spec-cell-label">Audio &amp; faststart</span>
                <span className="spec-cell-val">
                  -14 LUFS (-1.0 dBTP), {ffmpegResult.targetSpecs.faststart ? '+faststart' : 'off'}
                </span>
              </div>
            </div>
          </div>

          <pre className="code-block" aria-label="Generated FFmpeg command">
            {ffmpegResult.command}
          </pre>

          <div className="diag-list" aria-label="Platform ingestion issues addressed">
            {ffmpegResult.warningsAddressed.map((item) => (
              <div
                key={item}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px',
                  fontSize: 'var(--text-xs)',
                  color: 'var(--ink-muted)',
                }}
              >
                {item.includes('HDR') ? (
                  <ShieldAlert size={15} style={{ color: 'var(--caution)', flex: 'none', marginTop: 2 }} aria-hidden="true" />
                ) : (
                  <Info size={15} style={{ color: 'var(--cleared)', flex: 'none', marginTop: 2 }} aria-hidden="true" />
                )}
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
