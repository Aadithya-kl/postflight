import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bookmark,
  CheckCircle2,
  Crosshair,
  Eye,
  EyeOff,
  Heart,
  ImagePlus,
  MessageCircle,
  RotateCcw,
  Scan,
  Share2,
  Trash2,
} from 'lucide-react';
import {
  SAFE_ZONE_PRESETS,
  analyzeSafeZone,
  listSafeZonePresets,
} from '@postflight/core';
import type { BoundingBox, SafeZonePresetId } from '@postflight/core';

interface SafeZoneXRayProps {
  onAnnounce: (message: string) => void;
}

function createBoxesForPreset(presetId: SafeZonePresetId): BoundingBox[] {
  const preset = SAFE_ZONE_PRESETS[presetId];
  const { width: w, height: h } = preset.canvas;

  if (presetId === 'instagram-reels-to-grid') {
    // 9:16 Reels cover frame cropped to 3:4 on IG Profile Grid (240px cropped top & bottom)
    return [
      { id: 'headline', label: 'Cover Title', x: 100, y: 170, width: 880, height: 150 },
      { id: 'logo', label: 'Brand Logo', x: 80, y: 310, width: 170, height: 110 },
      { id: 'subtitles', label: 'Center Hook', x: 120, y: 840, width: 840, height: 220 },
      { id: 'cta', label: 'Bottom Badge', x: 180, y: 1600, width: 720, height: 140 },
    ];
  }

  if (h > w * 1.5) {
    // 9:16 vertical video (1080x1920): deliberately place Headline & CTA/Logo touching hazards to demonstrate X-Ray
    return [
      { id: 'headline', label: 'Headline Hook', x: 100, y: 210, width: 760, height: 150 },
      { id: 'logo', label: 'Brand Logo', x: 820, y: 920, width: 170, height: 120 },
      { id: 'subtitles', label: 'Subtitles', x: 110, y: 1120, width: 640, height: 150 },
      { id: 'cta', label: 'CTA Pill', x: 140, y: 1460, width: 660, height: 120 },
    ];
  }

  if (h > w) {
    // 4:5 portrait (1080x1350): IG 4:5 -> 3:4 grid crop or LinkedIn PDF carousel
    return [
      { id: 'headline', label: 'Headline Hook', x: 20, y: 120, width: 960, height: 160 },
      { id: 'logo', label: 'Brand Logo', x: 880, y: 60, width: 170, height: 95 },
      { id: 'subtitles', label: 'Key Metric Card', x: 120, y: 520, width: 840, height: 220 },
      { id: 'cta', label: 'Swipe CTA Pill', x: 210, y: 1220, width: 660, height: 105 },
    ];
  }

  // Landscape (1200x630 or 1200x675): X OG Card or X Multi-Image Grids
  return [
    { id: 'headline', label: 'Headline Hook', x: 110, y: 70, width: 760, height: 140 },
    { id: 'logo', label: 'Brand Logo', x: 980, y: 40, width: 180, height: 90 },
    { id: 'subtitles', label: 'Hero Subject', x: 340, y: 250, width: 520, height: 190 },
    { id: 'cta', label: 'CTA Badge', x: 380, y: 510, width: 440, height: 95 },
  ];
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function SafeZoneXRay({ onAnnounce }: SafeZoneXRayProps) {
  const idPrefix = useId();
  const presets = useMemo(() => listSafeZonePresets(), []);

  const [presetId, setPresetId] = useState<SafeZonePresetId>('tiktok-ad');
  const [boxes, setBoxes] = useState<BoundingBox[]>(() => createBoxesForPreset('tiktok-ad'));
  const [selectedBoxId, setSelectedBoxId] = useState<string>('headline');
  const [showGhostChrome, setShowGhostChrome] = useState<boolean>(true);
  const [nudgeStep, setNudgeStep] = useState<number>(20);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [uploadedFilename, setUploadedFilename] = useState<string | null>(null);

  const canvasRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    boxId: string;
    startClientX: number;
    startClientY: number;
    origX: number;
    origY: number;
  } | null>(null);

  // Revoke object URL on change/unmount to avoid memory leaks
  useEffect(() => {
    return () => {
      if (uploadedImageUrl) {
        URL.revokeObjectURL(uploadedImageUrl);
      }
    };
  }, [uploadedImageUrl]);

  const preset = SAFE_ZONE_PRESETS[presetId];
  const analysis = useMemo(() => analyzeSafeZone(presetId, boxes), [presetId, boxes]);

  const collisionById = useMemo(() => {
    const map = new Map(analysis.collisions.map((c) => [c.boxId, c]));
    return map;
  }, [analysis.collisions]);

  const selectedBox = boxes.find((b) => b.id === selectedBoxId) ?? boxes[0] ?? null;
  const isFeedPlayerPreset =
    preset.canvas.height > preset.canvas.width * 1.5 &&
    presetId !== 'instagram-reels-to-grid';

  function handlePresetChange(nextId: SafeZonePresetId) {
    setPresetId(nextId);
    const nextBoxes = createBoxesForPreset(nextId);
    setBoxes(nextBoxes);
    setSelectedBoxId(nextBoxes[0]?.id ?? 'headline');
    onAnnounce(`Switched safe-zone preset to ${SAFE_ZONE_PRESETS[nextId].name}.`);
  }

  function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (uploadedImageUrl) {
      URL.revokeObjectURL(uploadedImageUrl);
    }
    const nextUrl = URL.createObjectURL(file);
    setUploadedImageUrl(nextUrl);
    setUploadedFilename(file.name);
    onAnnounce(`Loaded preview image ${file.name}.`);
    e.target.value = '';
  }

  function clearUploadedImage() {
    if (uploadedImageUrl) {
      URL.revokeObjectURL(uploadedImageUrl);
    }
    setUploadedImageUrl(null);
    setUploadedFilename(null);
    onAnnounce('Removed preview image and restored guide grid.');
  }

  function updateBox(boxId: string, patch: Partial<BoundingBox>) {
    const cw = preset.canvas.width;
    const ch = preset.canvas.height;
    setBoxes((prev) =>
      prev.map((box) => {
        if (box.id !== boxId) return box;
        const nextW = clamp(Math.round(patch.width ?? box.width), 40, cw);
        const nextH = clamp(Math.round(patch.height ?? box.height), 40, ch);
        const nextX = clamp(Math.round(patch.x ?? box.x), 0, Math.max(0, cw - nextW));
        const nextY = clamp(Math.round(patch.y ?? box.y), 0, Math.max(0, ch - nextH));
        return { ...box, ...patch, width: nextW, height: nextH, x: nextX, y: nextY };
      }),
    );
  }

  function nudgeSelected(dx: number, dy: number) {
    if (!selectedBox) return;
    updateBox(selectedBox.id, { x: selectedBox.x + dx, y: selectedBox.y + dy });
  }

  function snapBoxToSafeCenter(boxId: string) {
    const target = boxes.find((b) => b.id === boxId);
    if (!target) return;
    const sr = analysis.safeRect;
    const notch = analysis.deadZones.lowerRight;
    const usableRight = notch
      ? Math.min(sr.x + sr.width, preset.canvas.width - notch.right)
      : sr.x + sr.width;
    const maxSafeW = Math.max(80, usableRight - sr.x);
    const maxSafeH = Math.max(60, sr.height);
    const nextW = Math.min(target.width, maxSafeW);
    const nextH = Math.min(target.height, maxSafeH);
    const nextX = Math.round(sr.x + (maxSafeW - nextW) / 2);
    const nextY = Math.round(sr.y + (sr.height - nextH) / 2);
    updateBox(boxId, { x: nextX, y: nextY, width: nextW, height: nextH });
    onAnnounce(`Centered ${target.label} inside the safe area.`);
  }

  function snapAllClear() {
    const sr = analysis.safeRect;
    const notch = analysis.deadZones.lowerRight;
    const usableW = notch
      ? Math.max(120, Math.min(sr.width, preset.canvas.width - notch.right - sr.x))
      : sr.width;
    const slotCount = Math.max(1, boxes.length);
    const gap = Math.max(16, Math.round(sr.height * 0.03));
    const maxSlotH = Math.max(54, Math.floor((sr.height - gap * (slotCount + 1)) / slotCount));

    setBoxes((prev) =>
      prev.map((box, idx) => {
        const nextW = Math.min(box.width, usableW - 16);
        const nextH = Math.min(box.height, maxSlotH);
        const nextX = Math.round(sr.x + (usableW - nextW) / 2);
        const nextY = Math.round(sr.y + gap + idx * (maxSlotH + gap));
        return { ...box, x: nextX, y: nextY, width: nextW, height: nextH };
      }),
    );
    onAnnounce(`Moved all ${boxes.length} layers inside the safe area for ${preset.label}.`);
  }

  function handleBoxPointerDown(e: React.PointerEvent<HTMLDivElement>, box: BoundingBox) {
    e.stopPropagation();
    setSelectedBoxId(box.id);
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStateRef.current = {
      boxId: box.id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origX: box.x,
      origY: box.y,
    };
  }

  function handleBoxPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragStateRef.current;
    const stage = canvasRef.current;
    if (!drag || !stage) return;

    const rect = stage.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const scaleX = preset.canvas.width / rect.width;
    const scaleY = preset.canvas.height / rect.height;
    const dx = (e.clientX - drag.startClientX) * scaleX;
    const dy = (e.clientY - drag.startClientY) * scaleY;

    updateBox(drag.boxId, {
      x: drag.origX + dx,
      y: drag.origY + dy,
    });
  }

  function handleBoxPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (dragStateRef.current && e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    dragStateRef.current = null;
  }

  function handleBoxKeyDown(e: React.KeyboardEvent<HTMLDivElement>, box: BoundingBox) {
    const step = e.shiftKey ? 40 : nudgeStep;
    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        updateBox(box.id, { y: box.y - step });
        break;
      case 'ArrowDown':
        e.preventDefault();
        updateBox(box.id, { y: box.y + step });
        break;
      case 'ArrowLeft':
        e.preventDefault();
        updateBox(box.id, { x: box.x - step });
        break;
      case 'ArrowRight':
        e.preventDefault();
        updateBox(box.id, { x: box.x + step });
        break;
    }
  }

  const pctX = (px: number) => `${(px / preset.canvas.width) * 100}%`;
  const pctY = (px: number) => `${(px / preset.canvas.height) * 100}%`;

  const stageMaxWidth =
    preset.canvas.height > preset.canvas.width * 1.5
      ? '340px'
      : preset.canvas.height > preset.canvas.width
        ? '450px'
        : '740px';

  // Clipped lower-right notch geometry strictly inside safeRect
  const notchRect = useMemo(() => {
    const lr = analysis.deadZones.lowerRight;
    if (!lr) return null;
    const x1 = Math.max(analysis.safeRect.x, preset.canvas.width - lr.right);
    const y1 = Math.max(analysis.safeRect.y, lr.startY);
    const x2 = analysis.safeRect.x + analysis.safeRect.width;
    const y2 = analysis.safeRect.y + analysis.safeRect.height;
    if (x2 <= x1 || y2 <= y1) return null;
    return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
  }, [analysis, preset.canvas.width]);

  const overlapCount = analysis.collisions.filter((c) => c.collides).length;

  return (
    <div>
      <div className="section-header">
        <div>
          <h2 className="section-title">Safe-zone preview</h2>
          <p className="section-desc">
            Check whether app buttons, captions, or profile grid crops cover important text or
            logos.
          </p>
        </div>
        <div className="btn-row">
          <span
            className={`telemetry-pill ${
              analysis.allClear ? 'telemetry-pill--cleared' : 'telemetry-pill--hazard'
            }`}
          >
            {analysis.allClear ? (
              <CheckCircle2 size={14} aria-hidden="true" />
            ) : (
              <AlertCircle size={14} aria-hidden="true" />
            )}
            {analysis.allClear
              ? 'All layers clear'
              : `${overlapCount} ${overlapCount === 1 ? 'overlap' : 'overlaps'} found`}
          </span>
        </div>
      </div>

      {/* Preset & Frame Controls */}
      <div className="preset-bar" style={{ justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap', flex: '1 1 360px' }}>
          <label className="field-label" htmlFor={`${idPrefix}-preset`} style={{ whiteSpace: 'nowrap' }}>
            Format preset
          </label>
          <select
            id={`${idPrefix}-preset`}
            className="select"
            style={{ maxWidth: '420px' }}
            value={presetId}
            onChange={(e) => handlePresetChange(e.target.value as SafeZonePresetId)}
          >
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {p.canvas.width}×{p.canvas.height}
              </option>
            ))}
          </select>
        </div>

        <div className="btn-row">
          <label className="btn btn-sm" style={{ cursor: 'pointer' }}>
            <ImagePlus size={14} aria-hidden="true" />
            {uploadedFilename ? 'Replace image' : 'Upload image'}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={handleImageUpload}
            />
          </label>
          {uploadedImageUrl && (
            <button type="button" className="btn btn-sm btn-ghost" onClick={clearUploadedImage}>
              <Trash2 size={14} aria-hidden="true" />
              Remove image
            </button>
          )}
          {isFeedPlayerPreset && (
            <button
              type="button"
              className="btn btn-sm"
              aria-pressed={showGhostChrome}
              onClick={() => setShowGhostChrome((v) => !v)}
            >
              {showGhostChrome ? (
                <EyeOff size={14} aria-hidden="true" />
              ) : (
                <Eye size={14} aria-hidden="true" />
              )}
              {showGhostChrome ? 'Hide app overlay' : 'Show app overlay'}
            </button>
          )}
          <button type="button" className="btn btn-sm btn-cleared" onClick={snapAllClear}>
            <CheckCircle2 size={14} aria-hidden="true" />
            Fit all inside safe area
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              const reset = createBoxesForPreset(presetId);
              setBoxes(reset);
              setSelectedBoxId(reset[0]?.id ?? 'headline');
              onAnnounce('Reset layers to default positions.');
            }}
          >
            <RotateCcw size={14} aria-hidden="true" />
            Reset
          </button>
        </div>
      </div>

      <div className="xray-layout">
        {/* LEFT: Interactive Scaled Safe-Zone Canvas */}
        <section className="xray-stage-shell" aria-label="Interactive safe-zone preview canvas">
          <div className="kpi-strip" style={{ justifyContent: 'center' }}>
            <span className="badge tabular">
              Frame: {analysis.canvas.width}×{analysis.canvas.height}px
            </span>
            <span className="badge badge--cleared tabular">
              Safe area: {analysis.safeRect.width}×{analysis.safeRect.height}px ({analysis.safeAreaPercent}%)
            </span>
            <span className="badge badge--error tabular">
              Margins: T {analysis.deadZones.top} / B {analysis.deadZones.bottom} / L {analysis.deadZones.left} / R {analysis.deadZones.right}
            </span>
            {uploadedFilename && (
              <span className="badge badge--accent">Image: {uploadedFilename}</span>
            )}
          </div>

          <div
            ref={canvasRef}
            className="xray-canvas"
            style={{
              aspectRatio: `${preset.canvas.width} / ${preset.canvas.height}`,
              maxWidth: stageMaxWidth,
            }}
          >
            {/* Background: Local Client-Side Image OR Crisp Synthetic Frame */}
            {uploadedImageUrl ? (
              <img
                src={uploadedImageUrl}
                alt={`Uploaded preview frame ${uploadedFilename ?? ''}`}
                className="xray-bg-image"
              />
            ) : (
              <>
                <div className="xray-synthetic-bg" aria-hidden="true" />
                <div className="xray-synthetic-crosshair" aria-hidden="true">
                  <span>
                    {preset.canvas.width} × {preset.canvas.height}
                  </span>
                </div>
              </>
            )}

            {/* Hatched Dead Zones */}
            {analysis.deadZones.top > 0 && (
              <div
                className="xray-deadzone"
                aria-hidden="true"
                style={{ top: 0, left: 0, width: '100%', height: pctY(analysis.deadZones.top) }}
              />
            )}
            {analysis.deadZones.bottom > 0 && (
              <div
                className="xray-deadzone"
                aria-hidden="true"
                style={{
                  bottom: 0,
                  left: 0,
                  width: '100%',
                  height: pctY(analysis.deadZones.bottom),
                }}
              />
            )}
            {analysis.deadZones.left > 0 && (
              <div
                className="xray-deadzone"
                aria-hidden="true"
                style={{
                  top: pctY(analysis.deadZones.top),
                  left: 0,
                  width: pctX(analysis.deadZones.left),
                  height: pctY(analysis.safeRect.height),
                }}
              />
            )}
            {analysis.deadZones.right > 0 && (
              <div
                className="xray-deadzone"
                aria-hidden="true"
                style={{
                  top: pctY(analysis.deadZones.top),
                  right: 0,
                  width: pctX(analysis.deadZones.right),
                  height: pctY(analysis.safeRect.height),
                }}
              />
            )}
            {notchRect && (
              <div
                className="xray-deadzone"
                aria-hidden="true"
                style={{
                  left: pctX(notchRect.x),
                  top: pctY(notchRect.y),
                  width: pctX(notchRect.width),
                  height: pctY(notchRect.height),
                }}
              />
            )}

            {/* Emerald Safe-Zone Boundary */}
            <div
              className="xray-safe-boundary"
              aria-hidden="true"
              style={{
                left: pctX(analysis.safeRect.x),
                top: pctY(analysis.safeRect.y),
                width: pctX(analysis.safeRect.width),
                height: pctY(analysis.safeRect.height),
              }}
            >
              <span className="xray-safe-tag tabular">
                Safe {analysis.safeRect.width}×{analysis.safeRect.height}
              </span>
            </div>

            {/* Synthetic Vertical Platform Ghost UI Chrome */}
            {isFeedPlayerPreset && showGhostChrome && (
              <>
                <div className="xray-ghost-top" aria-hidden="true">
                  <span>Following</span>
                  <span style={{ borderBottom: '2px solid #fff', paddingBottom: 2 }}>For You</span>
                </div>
                <div className="xray-ghost-rail" aria-hidden="true">
                  <span className="xray-ghost-icon">
                    <Heart size={13} />
                  </span>
                  <span className="xray-ghost-icon">
                    <MessageCircle size={13} />
                  </span>
                  <span className="xray-ghost-icon">
                    <Bookmark size={13} />
                  </span>
                  <span className="xray-ghost-icon">
                    <Share2 size={13} />
                  </span>
                </div>
                <div className="xray-ghost-caption" aria-hidden="true">
                  <div className="xray-ghost-bar" style={{ width: '48%' }} />
                  <div className="xray-ghost-bar" style={{ width: '88%' }} />
                  <div className="xray-ghost-bar" style={{ width: '66%' }} />
                </div>
              </>
            )}

            {/* Interactive Draggable + Keyboard-Navigable Overlay Boxes */}
            {boxes.map((box) => {
              const col = collisionById.get(box.id);
              const collides = Boolean(col?.collides);
              const isSelected = box.id === selectedBoxId;
              return (
                <div
                  key={box.id}
                  tabIndex={0}
                  role="button"
                  aria-label={`${box.label} overlay at x ${box.x}, y ${box.y}, ${box.width} by ${box.height} pixels. ${collides ? `Colliding ${col?.overlapPercent}%` : 'Clear inside safe zone'}. Use arrow keys to move.`}
                  className={`xray-overlay-box ${
                    collides ? 'xray-overlay-box--colliding' : 'xray-overlay-box--clear'
                  } ${isSelected ? 'xray-overlay-box--selected' : ''}`}
                  style={{
                    left: pctX(box.x),
                    top: pctY(box.y),
                    width: pctX(box.width),
                    height: pctY(box.height),
                  }}
                  onFocus={() => setSelectedBoxId(box.id)}
                  onPointerDown={(e) => handleBoxPointerDown(e, box)}
                  onPointerMove={handleBoxPointerMove}
                  onPointerUp={handleBoxPointerUp}
                  onKeyDown={(e) => handleBoxKeyDown(e, box)}
                >
                  <span>{box.label}</span>
                  <span className="mono tabular" style={{ fontSize: '0.62rem', opacity: 0.92 }}>
                    {collides ? `${col?.overlapPercent}% covered` : 'Clear'}
                  </span>
                </div>
              );
            })}
          </div>

          <p className="field-hint" style={{ textAlign: 'center', maxWidth: '58ch' }}>
            {preset.description} Drag any layer directly or focus it and press the arrow keys (hold
            Shift for 40px steps).
          </p>
        </section>

        {/* RIGHT: Keyboard Controls, Precision Coordinates & Overlap Details */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {/* Selected Overlay Precision & WCAG Keyboard Nudge Controls */}
          <section className="instrument-card" aria-labelledby={`${idPrefix}-ctrl-heading`}>
            <div className="card-header">
              <div className="card-title-group">
                <Crosshair size={17} aria-hidden="true" />
                <div>
                  <h3 id={`${idPrefix}-ctrl-heading`} className="card-title">
                    Layer position &amp; keyboard controls
                  </h3>
                  <p className="card-subtitle">Move or resize layers with arrow keys or exact pixel values</p>
                </div>
              </div>
            </div>

            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {/* Layer Selector Chips */}
              <div className="platform-chip-grid" role="group" aria-label="Select overlay layer">
                {boxes.map((box) => {
                  const collides = Boolean(collisionById.get(box.id)?.collides);
                  return (
                    <button
                      key={box.id}
                      type="button"
                      className="platform-chip"
                      aria-pressed={box.id === selectedBoxId}
                      onClick={() => setSelectedBoxId(box.id)}
                    >
                      <span
                        className="status-dot"
                        style={{ color: collides ? 'var(--hazard)' : 'var(--cleared)' }}
                        aria-hidden="true"
                      />
                      {box.label}
                    </button>
                  );
                })}
              </div>

              {selectedBox && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                    {/* Directional Nudge Pad */}
                    <div>
                      <span className="field-label" style={{ display: 'block', marginBottom: 6 }}>
                        Move layer ({nudgeStep}px)
                      </span>
                      <div className="nudge-pad">
                        <span aria-hidden="true" />
                        <button
                          type="button"
                          className="btn"
                          aria-label={`Move ${selectedBox.label} up ${nudgeStep} pixels`}
                          onClick={() => nudgeSelected(0, -nudgeStep)}
                        >
                          <ArrowUp size={15} aria-hidden="true" />
                        </button>
                        <span aria-hidden="true" />
                        <button
                          type="button"
                          className="btn"
                          aria-label={`Move ${selectedBox.label} left ${nudgeStep} pixels`}
                          onClick={() => nudgeSelected(-nudgeStep, 0)}
                        >
                          <ArrowLeft size={15} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary"
                          aria-label={`Center ${selectedBox.label} inside the safe area`}
                          title="Center in safe area"
                          onClick={() => snapBoxToSafeCenter(selectedBox.id)}
                        >
                          <Crosshair size={15} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="btn"
                          aria-label={`Move ${selectedBox.label} right ${nudgeStep} pixels`}
                          onClick={() => nudgeSelected(nudgeStep, 0)}
                        >
                          <ArrowRight size={15} aria-hidden="true" />
                        </button>
                        <span aria-hidden="true" />
                        <button
                          type="button"
                          className="btn"
                          aria-label={`Move ${selectedBox.label} down ${nudgeStep} pixels`}
                          onClick={() => nudgeSelected(0, nudgeStep)}
                        >
                          <ArrowDown size={15} aria-hidden="true" />
                        </button>
                        <span aria-hidden="true" />
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                      <span className="field-label">Step size</span>
                      <div className="theme-switcher" role="group" aria-label="Nudge step size in pixels">
                        {[10, 20, 50].map((step) => (
                          <button
                            key={step}
                            type="button"
                            className="theme-btn mono tabular"
                            aria-pressed={nudgeStep === step}
                            onClick={() => setNudgeStep(step)}
                          >
                            {step}px
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        onClick={() => snapBoxToSafeCenter(selectedBox.id)}
                      >
                        <Crosshair size={14} aria-hidden="true" />
                        Center in safe area
                      </button>
                    </div>
                  </div>

                  {/* Numeric X/Y/W/H Inputs */}
                  <div className="coord-grid">
                    <div className="field-group">
                      <label className="field-label" htmlFor={`${idPrefix}-box-x`}>
                        X (px)
                      </label>
                      <input
                        id={`${idPrefix}-box-x`}
                        type="number"
                        className="input mono tabular"
                        value={selectedBox.x}
                        onChange={(e) =>
                          updateBox(selectedBox.id, { x: Number(e.target.value) || 0 })
                        }
                      />
                    </div>
                    <div className="field-group">
                      <label className="field-label" htmlFor={`${idPrefix}-box-y`}>
                        Y (px)
                      </label>
                      <input
                        id={`${idPrefix}-box-y`}
                        type="number"
                        className="input mono tabular"
                        value={selectedBox.y}
                        onChange={(e) =>
                          updateBox(selectedBox.id, { y: Number(e.target.value) || 0 })
                        }
                      />
                    </div>
                    <div className="field-group">
                      <label className="field-label" htmlFor={`${idPrefix}-box-w`}>
                        Width (px)
                      </label>
                      <input
                        id={`${idPrefix}-box-w`}
                        type="number"
                        className="input mono tabular"
                        value={selectedBox.width}
                        onChange={(e) =>
                          updateBox(selectedBox.id, { width: Number(e.target.value) || 40 })
                        }
                      />
                    </div>
                    <div className="field-group">
                      <label className="field-label" htmlFor={`${idPrefix}-box-h`}>
                        Height (px)
                      </label>
                      <input
                        id={`${idPrefix}-box-h`}
                        type="number"
                        className="input mono tabular"
                        value={selectedBox.height}
                        onChange={(e) =>
                          updateBox(selectedBox.id, { height: Number(e.target.value) || 40 })
                        }
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          </section>

          {/* Real-Time Overlap Check Cards */}
          <section className="instrument-card" aria-labelledby={`${idPrefix}-tel-heading`}>
            <div className="card-header">
              <div className="card-title-group">
                <Scan size={17} aria-hidden="true" />
                <h3 id={`${idPrefix}-tel-heading`} className="card-title">
                  Layer overlap check ({analysis.collisions.length})
                </h3>
              </div>
            </div>
            <div className="card-body">
              <div className="diag-list">
                {analysis.collisions.map((col) => (
                  <div
                    key={col.boxId}
                    className={`diag-item ${col.collides ? 'diag-item--error' : ''}`}
                    style={
                      col.collides
                        ? undefined
                        : { borderInlineStartColor: 'var(--cleared)' }
                    }
                  >
                    <div className="diag-head">
                      <span style={{ fontWeight: 700, fontSize: 'var(--text-sm)' }}>
                        {col.boxLabel}
                      </span>
                      <span
                        className={`badge tabular ${
                          col.collides ? 'badge--error' : 'badge--cleared'
                        }`}
                      >
                        {col.collides ? `${col.overlapPercent}% overlap` : 'Clear'}
                      </span>
                    </div>
                    {col.violatedEdges.length > 0 && (
                      <div className="kpi-strip">
                        {col.violatedEdges.map((edge) => (
                          <span key={edge} className="badge badge--warning">
                            {edge} edge
                          </span>
                        ))}
                        <span className="badge tabular">
                          {Math.round(col.overlapAreaPx).toLocaleString('en-US')} px&sup2;
                        </span>
                      </div>
                    )}
                    <p className="diag-hint">{col.recommendation}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
