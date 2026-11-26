import type {
  BoundingBox,
  PlatformId,
  SafeZoneAnalysis,
  SafeZoneCollision,
  SafeZonePresetId,
  SafeZoneRegion,
} from '../types.js';

export interface SafeZonePreset extends SafeZoneRegion {
  id: SafeZonePresetId;
  name: string;
  platform?: PlatformId;
  description: string;
}

export const SAFE_ZONE_PRESETS: Readonly<Record<SafeZonePresetId, SafeZonePreset>> = {
  'tiktok-organic': {
    id: 'tiktok-organic',
    name: 'TikTok Organic (9:16)',
    platform: 'tiktok',
    canvas: { width: 1080, height: 1920 },
    top: 240,
    bottom: 380,
    left: 60,
    right: 180,
    label: 'TikTok Organic Safe Zone',
    description: 'Clears top Following/For You navigation, right engagement rail, and organic caption/audio bar.',
  },
  'tiktok-ad': {
    id: 'tiktok-ad',
    name: 'TikTok Paid In-Feed Ad (9:16)',
    platform: 'tiktok',
    canvas: { width: 1080, height: 1920 },
    top: 240,
    bottom: 484,
    left: 60,
    right: 180,
    lowerRight: { startY: 840, right: 300 },
    label: 'TikTok In-Feed Ad Safe Zone',
    description: 'Clears Sponsored CTA card, right engagement rail, and lower-right profile/sound disc notch.',
  },
  'tiktok-ad-strict': {
    id: 'tiktok-ad-strict',
    name: 'TikTok Strict Paid Ad + Add-On (9:16)',
    platform: 'tiktok',
    canvas: { width: 1080, height: 1920 },
    top: 240,
    bottom: 660,
    left: 120,
    right: 180,
    lowerRight: { startY: 840, right: 300 },
    label: 'TikTok Strict Ad Safe Zone',
    description: 'Conservative TikTok Business spec clearing interactive add-ons, multi-line ad copy, and lower-right notch.',
  },
  'instagram-reels-organic': {
    id: 'instagram-reels-organic',
    name: 'Instagram Reels Organic (9:16)',
    platform: 'instagram-reels',
    canvas: { width: 1080, height: 1920 },
    top: 269,
    bottom: 480,
    left: 65,
    right: 168,
    label: 'IG Reels Organic Safe Zone',
    description: 'Clears 14% top header, 25% bottom handle/caption/audio overlay, and right engagement column.',
  },
  'instagram-reels-ad': {
    id: 'instagram-reels-ad',
    name: 'Instagram Reels Paid Ad (9:16)',
    platform: 'instagram-reels',
    canvas: { width: 1080, height: 1920 },
    top: 269,
    bottom: 672,
    left: 65,
    right: 168,
    label: 'IG Reels Paid Ad Safe Zone',
    description: 'Meta official Reels Ads safe zone: 14% top, 35% bottom CTA/caption HUD, 6% left, right action rail.',
  },
  'instagram-reels-to-grid': {
    id: 'instagram-reels-to-grid',
    name: 'Instagram 9:16 Reels -> 3:4 Profile Grid Cover Crop',
    platform: 'instagram-reels',
    canvas: { width: 1080, height: 1920 },
    top: 240,
    bottom: 240,
    left: 0,
    right: 0,
    label: 'IG Reels Cover -> 3:4 Profile Grid Safe Box (1080x1440)',
    description: 'Protects Reels cover titles from Instagram 3:4 profile grid vertical cropping (240px cropped off both top and bottom).',
  },
  'youtube-shorts-organic': {
    id: 'youtube-shorts-organic',
    name: 'YouTube Shorts Organic (9:16)',
    platform: 'youtube-shorts',
    canvas: { width: 1080, height: 1920 },
    top: 288,
    bottom: 380,
    left: 60,
    right: 192,
    label: 'YouTube Shorts Organic Safe Zone',
    description: 'Clears top search/camera chrome, wide right like/comment/remix column, and bottom channel bar.',
  },
  'youtube-shorts-ad': {
    id: 'youtube-shorts-ad',
    name: 'YouTube Shorts Paid Ad (9:16)',
    platform: 'youtube-shorts',
    canvas: { width: 1080, height: 1920 },
    top: 288,
    bottom: 672,
    left: 48,
    right: 192,
    label: 'YouTube Shorts Paid Ad Safe Zone',
    description: 'Google Vertical Video Ad spec: 15% top, 35% bottom sponsor/CTA card, 17.78% right rail.',
  },
  'universal-organic': {
    id: 'universal-organic',
    name: 'Universal Vertical Organic (TikTok + Reels + Shorts)',
    canvas: { width: 1080, height: 1920 },
    top: 288,
    bottom: 480,
    left: 65,
    right: 192,
    label: 'Universal Organic 9:16 Safe Zone',
    description: 'Strict intersection of TikTok, IG Reels, and YouTube Shorts organic overlays for cross-posted vertical video.',
  },
  'universal-ad-safe': {
    id: 'universal-ad-safe',
    name: 'Universal Vertical Paid Ad (TikTok + Reels + Shorts)',
    canvas: { width: 1080, height: 1920 },
    top: 288,
    bottom: 672,
    left: 65,
    right: 192,
    lowerRight: { startY: 840, right: 300 },
    label: 'Universal Paid Ad 9:16 Safe Zone',
    description: 'Strict intersection of all three major vertical paid-ad specs including TikTok lower-right notch.',
  },
  'instagram-feed-to-grid': {
    id: 'instagram-feed-to-grid',
    name: 'Instagram 4:5 Feed -> 3:4 Profile Grid Crop',
    platform: 'instagram-feed',
    canvas: { width: 1080, height: 1350 },
    top: 0,
    bottom: 0,
    left: 34,
    right: 34,
    label: 'IG 4:5 to 3:4 Profile Grid Safe Box (1012x1350)',
    description: 'Protects text and faces from Instagram 3:4 profile grid side cropping (34px cropped off left and right).',
  },
  'linkedin-pdf-carousel': {
    id: 'linkedin-pdf-carousel',
    name: 'LinkedIn Document / PDF Carousel (4:5)',
    platform: 'linkedin',
    canvas: { width: 1080, height: 1350 },
    top: 80,
    bottom: 100,
    left: 80,
    right: 80,
    label: 'LinkedIn PDF Carousel Viewer Safe Margin',
    description: 'Clears top title/fullscreen bar, bottom pagination scrub bar, and left/right slide navigation arrows.',
  },
  'x-og-card': {
    id: 'x-og-card',
    name: 'X Open Graph Link Card (summary_large_image)',
    platform: 'x',
    canvas: { width: 1200, height: 630 },
    top: 15,
    bottom: 15,
    left: 60,
    right: 60,
    label: 'X summary_large_image 2:1 Crop Safe Zone',
    description: 'Protects 1.91:1 OG images (1200x630) from X 2:1 timeline crop and rounded corner/domain pill overlay.',
  },
  'x-grid-2': {
    id: 'x-grid-2',
    name: 'X 2-Image Grid Crop (7:8 Center Crop)',
    platform: 'x',
    canvas: { width: 1200, height: 675 },
    top: 0,
    bottom: 0,
    left: 305,
    right: 305,
    label: 'X 2-Up 7:8 Center-Crop Safe Box',
    description: 'Shows the exact center-safe area preserved when a 16:9 image (1200x675) renders inside X 2-image side-by-side layout.',
  },
  'x-grid-3': {
    id: 'x-grid-3',
    name: 'X 3-Image Grid Crop (Stacked Right / 7:8 Left)',
    platform: 'x',
    canvas: { width: 1200, height: 675 },
    top: 0,
    bottom: 0,
    left: 262,
    right: 262,
    label: 'X 3-Up Grid Center-Safe Box',
    description: 'Protects key subjects from horizontal crop in X 3-image collage tiles (left 7:8 + right stacked 1:1/16:9).',
  },
  'x-grid-4': {
    id: 'x-grid-4',
    name: 'X 4-Image 2x2 Grid Crop',
    platform: 'x',
    canvas: { width: 1200, height: 675 },
    top: 45,
    bottom: 45,
    left: 180,
    right: 180,
    label: 'X 4-Up 2x2 Grid Safe Margin',
    description: 'Clears 2x2 tile edge cropping and inner gutter seams on X 4-image posts.',
  },
};

const PRESET_ORDER: readonly SafeZonePresetId[] = [
  'tiktok-organic',
  'tiktok-ad',
  'tiktok-ad-strict',
  'instagram-reels-organic',
  'instagram-reels-ad',
  'instagram-reels-to-grid',
  'youtube-shorts-organic',
  'youtube-shorts-ad',
  'universal-organic',
  'universal-ad-safe',
  'instagram-feed-to-grid',
  'linkedin-pdf-carousel',
  'x-og-card',
  'x-grid-2',
  'x-grid-3',
  'x-grid-4',
] as const;

export function listSafeZonePresets(): SafeZonePreset[] {
  return PRESET_ORDER.map((id) => SAFE_ZONE_PRESETS[id]);
}

function rectIntersectionArea(
  ax1: number,
  ay1: number,
  ax2: number,
  ay2: number,
  bx1: number,
  by1: number,
  bx2: number,
  by2: number,
): number {
  const ix1 = Math.max(ax1, bx1);
  const iy1 = Math.max(ay1, by1);
  const ix2 = Math.min(ax2, bx2);
  const iy2 = Math.min(ay2, by2);
  if (ix2 <= ix1 || iy2 <= iy1) return 0;
  return (ix2 - ix1) * (iy2 - iy1);
}

export function analyzeSafeZone(
  presetId: SafeZonePresetId,
  boxes: BoundingBox[],
): SafeZoneAnalysis {
  const preset = SAFE_ZONE_PRESETS[presetId];
  const canvasW = preset.canvas.width;
  const canvasH = preset.canvas.height;

  const safeX1 = preset.left;
  const safeY1 = preset.top;
  const safeX2 = Math.max(safeX1, canvasW - preset.right);
  const safeY2 = Math.max(safeY1, canvasH - preset.bottom);
  const safeRect = {
    x: safeX1,
    y: safeY1,
    width: safeX2 - safeX1,
    height: safeY2 - safeY1,
  };

  // Clipped lower-right notch strictly inside safeRect (prevents any double counting with right/bottom zones)
  const notch = preset.lowerRight
    ? {
        x1: Math.max(safeX1, canvasW - preset.lowerRight.right),
        y1: Math.max(safeY1, preset.lowerRight.startY),
        x2: safeX2,
        y2: safeY2,
      }
    : null;

  const notchArea =
    notch !== null && notch.x2 > notch.x1 && notch.y2 > notch.y1
      ? (notch.x2 - notch.x1) * (notch.y2 - notch.y1)
      : 0;

  const totalCanvasArea = canvasW * canvasH;
  const effectiveSafeArea = Math.max(0, safeRect.width * safeRect.height - notchArea);
  const safeAreaPercent =
    totalCanvasArea > 0 ? Number(((effectiveSafeArea / totalCanvasArea) * 100).toFixed(2)) : 0;

  const collisions: SafeZoneCollision[] = boxes.map((box) => {
    const width = Math.max(0, box.width);
    const height = Math.max(0, box.height);
    const boxArea = width * height;

    if (boxArea === 0) {
      return {
        boxId: box.id,
        boxLabel: box.label,
        collides: false,
        overlapAreaPx: 0,
        overlapPercent: 0,
        violatedEdges: [],
        recommendation: 'Element has zero area; no collision detected.',
      };
    }

    const bx1 = box.x;
    const by1 = box.y;
    const bx2 = box.x + width;
    const by2 = box.y + height;

    const safeIntersect = rectIntersectionArea(bx1, by1, bx2, by2, safeX1, safeY1, safeX2, safeY2);
    const notchIntersect =
      notch !== null && notch.x2 > notch.x1 && notch.y2 > notch.y1
        ? rectIntersectionArea(bx1, by1, bx2, by2, notch.x1, notch.y1, notch.x2, notch.y2)
        : 0;

    // Exact dead-zone overlap: boxArea minus the portion lying inside (safeRect \ notch)
    const validSafePortion = Math.max(0, safeIntersect - notchIntersect);
    const rawOverlapArea = Math.max(0, boxArea - validSafePortion);
    const overlapAreaPx = Math.round(rawOverlapArea * 100) / 100;
    const overlapPercent = Number(((overlapAreaPx / boxArea) * 100).toFixed(2));
    const collides = overlapAreaPx > 0;

    const violatedEdges: SafeZoneCollision['violatedEdges'] = [];
    const shiftHints: string[] = [];

    if (by1 < safeY1) {
      violatedEdges.push('top');
      shiftHints.push(`shift down by ${Math.ceil(safeY1 - by1)}px (clear top dead zone y >= ${safeY1})`);
    }
    if (by2 > safeY2) {
      violatedEdges.push('bottom');
      shiftHints.push(`shift up by ${Math.ceil(by2 - safeY2)}px (clear bottom dead zone y <= ${safeY2})`);
    }
    if (bx1 < safeX1) {
      violatedEdges.push('left');
      shiftHints.push(`shift right by ${Math.ceil(safeX1 - bx1)}px (clear left dead zone x >= ${safeX1})`);
    }
    if (bx2 > safeX2) {
      violatedEdges.push('right');
      shiftHints.push(`shift left by ${Math.ceil(bx2 - safeX2)}px (clear right dead zone x <= ${safeX2})`);
    }
    if (notch !== null && notchIntersect > 0) {
      violatedEdges.push('lower-right-notch');
      const leftShift = Math.ceil(bx2 - notch.x1);
      const upShift = Math.ceil(by2 - notch.y1);
      shiftHints.push(
        `clear lower-right notch by shifting left ${leftShift}px (x2 <= ${notch.x1}) or up ${upShift}px (y2 <= ${notch.y1})`,
      );
    }

    const recommendation = collides
      ? `Adjust "${box.label}": ${shiftHints.join('; ')}.`
      : `"${box.label}" sits completely inside the ${preset.label}.`;

    return {
      boxId: box.id,
      boxLabel: box.label,
      collides,
      overlapAreaPx,
      overlapPercent,
      violatedEdges,
      recommendation,
    };
  });

  const deadZones: SafeZoneAnalysis['deadZones'] = {
    top: preset.top,
    bottom: preset.bottom,
    left: preset.left,
    right: preset.right,
  };
  if (preset.lowerRight !== undefined) {
    deadZones.lowerRight = { ...preset.lowerRight };
  }

  return {
    presetId,
    presetName: preset.name,
    canvas: { width: canvasW, height: canvasH },
    safeRect,
    deadZones,
    safeAreaPercent,
    allClear: collisions.every((c) => !c.collides),
    collisions,
  };
}
