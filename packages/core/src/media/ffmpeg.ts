import type { FfmpegCommandResult, PlatformId } from '../types.js';

interface PlatformVideoProfile {
  width: number;
  height: number;
  bitrate: string;
  maxrate: string;
  bufsize: string;
  audioBitrate: string;
  aspectNote: string;
}

const PLATFORM_VIDEO_PROFILES: Record<PlatformId, PlatformVideoProfile> = {
  tiktok: {
    width: 1080,
    height: 1920,
    bitrate: '12M',
    maxrate: '16M',
    bufsize: '24M',
    audioBitrate: '192k',
    aspectNote: '9:16 vertical full-bleed',
  },
  'instagram-reels': {
    width: 1080,
    height: 1920,
    bitrate: '16M',
    maxrate: '20M',
    bufsize: '32M',
    audioBitrate: '192k',
    aspectNote: '9:16 vertical Reels container',
  },
  'youtube-shorts': {
    width: 1080,
    height: 1920,
    bitrate: '15M',
    maxrate: '20M',
    bufsize: '30M',
    audioBitrate: '192k',
    aspectNote: '9:16 vertical (avoids 16:9 long-form misclassification)',
  },
  'instagram-feed': {
    width: 1080,
    height: 1350,
    bitrate: '16M',
    maxrate: '20M',
    bufsize: '32M',
    audioBitrate: '192k',
    aspectNote: '4:5 portrait feed container (Graph API compliant)',
  },
  linkedin: {
    width: 1080,
    height: 1350,
    bitrate: '15M',
    maxrate: '20M',
    bufsize: '30M',
    audioBitrate: '192k',
    aspectNote: '4:5 portrait mobile feed viewport',
  },
  threads: {
    width: 1080,
    height: 1350,
    bitrate: '16M',
    maxrate: '20M',
    bufsize: '32M',
    audioBitrate: '192k',
    aspectNote: '4:5 portrait feed',
  },
  x: {
    width: 1920,
    height: 1080,
    bitrate: '10M',
    maxrate: '14M',
    bufsize: '20M',
    audioBitrate: '192k',
    aspectNote: '16:9 landscape timeline playback',
  },
  bluesky: {
    width: 1920,
    height: 1080,
    bitrate: '10M',
    maxrate: '14M',
    bufsize: '20M',
    audioBitrate: '192k',
    aspectNote: '16:9 landscape (<= 300 MB / 10 min AT Protocol cap)',
  },
  mastodon: {
    width: 1280,
    height: 720,
    bitrate: '10M',
    maxrate: '12M',
    bufsize: '20M',
    audioBitrate: '160k',
    aspectNote: '16:9 HD landscape sized for Fediverse 99 MB video limits',
  },
};

export interface BuildFfmpegOptions {
  input?: string;
  output?: string;
  isHdr?: boolean;
  targetFps?: 24 | 30 | 60;
}

export function buildFfmpegNormalizeCommand(
  platform: PlatformId,
  options?: BuildFfmpegOptions,
): FfmpegCommandResult {
  const profile = PLATFORM_VIDEO_PROFILES[platform];
  const input = options?.input ?? 'input.mov';
  const output = options?.output ?? `${platform}-normalized.mp4`;
  const fps = options?.targetFps ?? 30;
  const isHdr = options?.isHdr ?? false;
  const gop = fps * 2;
  const resolution = `${profile.width}x${profile.height}`;

  const scaleAndPad = `scale=${profile.width}:${profile.height}:force_original_aspect_ratio=decrease,pad=${profile.width}:${profile.height}:(ow-iw)/2:(oh-ih)/2:black,setsar=1`;

  const videoFilter = isHdr
    ? `zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,${scaleAndPad},format=yuv420p`
    : `${scaleAndPad},format=yuv420p`;

  const args: string[] = [
    'ffmpeg -y',
    `-i "${input}"`,
    `-vf "${videoFilter}"`,
    '-c:v libx264 -profile:v high -level 4.1',
    '-pix_fmt yuv420p',
    `-vsync cfr -r ${fps}`,
    `-g ${gop} -keyint_min ${gop} -sc_threshold 0`,
    `-b:v ${profile.bitrate} -maxrate ${profile.maxrate} -bufsize ${profile.bufsize}`,
    '-colorspace bt709 -color_trc bt709 -color_primaries bt709',
    `-c:a aac -b:a ${profile.audioBitrate} -ar 48000 -ac 2`,
    '-af "loudnorm=I=-14:TP=-1.0:LRA=11"',
    '-movflags +faststart',
    `"${output}"`,
  ];

  const warningsAddressed: string[] = [
    `Normalized canvas to ${resolution} (${profile.aspectNote}) with even dimensions for H.264 4:2:0.`,
    `Enforced Constant Frame Rate (${fps} fps CFR) to prevent VFR audio/video desync and stutter.`,
    'Enforced 8-bit 4:2:0 pixel format (yuv420p) to eliminate 4:2:2/4:4:4 chroma bleeding and decoder rejections.',
    `Configured closed GOP (${gop}-frame keyframe interval, -sc_threshold 0) + moov atom faststart (+faststart) required by Meta/Instagram Graph API and progressive streaming.`,
    'Tagged Rec.709 SDR color metadata (bt709) to preserve color fidelity across mobile feeds.',
    'Normalized stereo AAC 48kHz audio to -14 LUFS integrated loudness (-1.0 dBTP true peak) to avoid aggressive platform volume limiting.',
  ];

  if (isHdr) {
    warningsAddressed.unshift(
      'Applied Hable HDR-to-SDR tone mapping (zscale + tonemap=hable -> bt709) to prevent 10-bit HDR highlight washout.',
    );
  }

  return {
    platform,
    command: args.join(' '),
    targetSpecs: {
      resolution,
      codec: 'H.264 High@L4.1 (libx264)',
      pixelFormat: 'yuv420p',
      colorSpace: isHdr ? 'Rec.709 SDR (Hable tone-mapped from HDR)' : 'Rec.709 SDR (bt709)',
      fps,
      videoBitrate: profile.bitrate,
      audioLoudness: 'AAC 48kHz stereo, -14 LUFS / -1.0 dBTP (LRA 11)',
      faststart: true,
    },
    warningsAddressed,
  };
}
