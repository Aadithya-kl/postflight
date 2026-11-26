import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PLATFORM_IDS,
  RULE_CATALOG,
  SAFE_ZONE_PRESETS,
  activateKillSwitch,
  analyzeSafeZone,
  canPublish,
  compileCanonicalPost,
  createKillSwitchState,
  getPlatformSpec,
  isPlatformId,
  listPlatformSpecs,
  listSafeZonePresets,
  recordGovernanceEvent,
  releaseKillSwitch,
  runPreFlight,
  triageComments,
  verifyAuditChain,
} from '@postflight/core';
import type {
  BoundingBox,
  BrandGuardrails,
  CommentItem,
  GovernanceAuditEntry,
  KillSwitchState,
  PlatformId,
  SafeZonePresetId,
  SocialDraft,
} from '@postflight/core';

export interface StudioServerOptions {
  port?: number;
  host?: string;
  stateDir?: string;
}

export interface StudioServerHandle {
  url: string;
  close: () => Promise<void>;
}

const MAX_JSON_BODY_BYTES = 2 * 1024 * 1024; // 2 MiB

const MIME_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function resolveStudioDistDir(): string {
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = path.dirname(currentFile);

  const candidates = [
    path.resolve(currentDir, '../../../apps/studio/dist'),
    path.resolve(process.cwd(), 'apps/studio/dist'),
  ];

  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'index.html'))) {
      return dir;
    }
  }

  return candidates[0] ?? path.resolve(process.cwd(), 'apps/studio/dist');
}

function getKillSwitchFilePath(stateDir: string): string {
  return path.join(stateDir, 'killswitch.json');
}

export function loadKillSwitchState(stateDir: string): KillSwitchState {
  const filePath = getKillSwitchFilePath(stateDir);
  if (!fs.existsSync(filePath)) {
    return createKillSwitchState();
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw) as KillSwitchState;
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof parsed.frozen !== 'boolean' ||
    !Array.isArray(parsed.auditLog)
  ) {
    throw new Error(`Invalid killswitch state file at ${filePath}`);
  }
  return parsed;
}

export function saveKillSwitchState(stateDir: string, state: KillSwitchState): string {
  fs.mkdirSync(stateDir, { recursive: true });
  const filePath = getKillSwitchFilePath(stateDir);
  fs.writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  return filePath;
}

function sendJson(
  res: http.ServerResponse,
  statusCode: number,
  payload: unknown
): void {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(body);
}

function sendFallbackHtml(res: http.ServerResponse, distDir: string): void {
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>PostFlight Studio — Build Required</title>
    <style>
      body { font-family: system-ui, -apple-system, sans-serif; background: #0b1020; color: #e2e8f0; margin: 0; padding: 3rem 1.5rem; }
      main { max-width: 680px; margin: 0 auto; background: #121a30; border: 1px solid #263354; border-radius: 12px; padding: 2rem; }
      h1 { margin-top: 0; color: #38bdf8; font-size: 1.5rem; }
      code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; background: #090d1a; border-radius: 6px; }
      pre { padding: 1rem; overflow-x: auto; border: 1px solid #1e293b; color: #86efac; }
      code { padding: 0.15rem 0.35rem; color: #bae6fd; }
      ul { line-height: 1.7; padding-left: 1.25rem; }
      .muted { color: #94a3b8; font-size: 0.9rem; }
    </style>
  </head>
  <body>
    <main>
      <h1>PostFlight Local Studio Server is Running</h1>
      <p>The local API is live, but the static Web Studio bundle was not found at <code>${distDir.replace(/</g, '&lt;')}</code>.</p>
      <p>Build the workspace to enable the full interactive UI:</p>
      <pre>npm run build</pre>
      <h2>Active Local JSON API Endpoints</h2>
      <ul>
        <li><code>GET /api/health</code> — Server health &amp; engine status</li>
        <li><code>GET /api/specs</code> — Verified 2025–2026 platform registry &amp; safe-zone presets</li>
        <li><code>POST /api/preflight</code> — Run deterministic pre-flight lint checks</li>
        <li><code>POST /api/compile</code> — Compile canonical Markdown into platform-native artifacts</li>
        <li><code>POST /api/safezone</code> — Analyze 2D safe-zone collisions</li>
        <li><code>POST /api/triage</code> — Triage comments by crisis/buyer intent</li>
        <li><code>GET /api/killswitch</code> &amp; <code>POST /api/killswitch</code> — SHA-256 hash-chained crisis kill-switch</li>
      </ul>
      <p class="muted">Zero external API keys. Zero telemetry. Runs 100% locally.</p>
    </main>
  </body>
</html>`;

  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(html);
}

async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;

    req.on('data', (chunk: Buffer) => {
      totalBytes += chunk.byteLength;
      if (totalBytes > MAX_JSON_BODY_BYTES) {
        reject(new Error('PAYLOAD_TOO_LARGE'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (raw.length === 0) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('INVALID_JSON'));
      }
    });

    req.on('error', (err) => reject(err));
  });
}

function parseTargetsList(rawTargets: unknown): PlatformId[] {
  if (rawTargets === undefined) {
    return [...PLATFORM_IDS];
  }
  if (!Array.isArray(rawTargets) || rawTargets.length === 0) {
    throw new Error('"targets" must be a non-empty array of valid platform IDs.');
  }
  const validated: PlatformId[] = [];
  for (const item of rawTargets) {
    if (typeof item !== 'string' || !isPlatformId(item)) {
      throw new Error(
        `Unknown platform "${String(item)}". Valid platforms: ${PLATFORM_IDS.join(', ')}`
      );
    }
    validated.push(item);
  }
  return validated;
}

function isSafeZonePresetId(value: string): value is SafeZonePresetId {
  return Object.prototype.hasOwnProperty.call(SAFE_ZONE_PRESETS, value);
}

async function handleApiRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  stateDir: string
): Promise<void> {
  const method = (req.method ?? 'GET').toUpperCase();

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  if (method === 'GET' && pathname === '/api/health') {
    sendJson(res, 200, {
      ok: true,
      service: 'postflight-studio',
      version: '1.0.0',
      platforms: PLATFORM_IDS.length,
      rules: RULE_CATALOG.length,
      safeZonePresets: listSafeZonePresets().length,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  if (method === 'GET' && pathname === '/api/specs') {
    sendJson(res, 200, {
      platforms: listPlatformSpecs(),
      safeZonePresets: listSafeZonePresets(),
      rules: RULE_CATALOG,
    });
    return;
  }

  if (method === 'GET' && pathname.startsWith('/api/specs/')) {
    const platformId = pathname.slice('/api/specs/'.length);
    if (!isPlatformId(platformId)) {
      sendJson(res, 404, {
        error: `Unknown platform "${platformId}". Valid: ${PLATFORM_IDS.join(', ')}`,
      });
      return;
    }
    sendJson(res, 200, getPlatformSpec(platformId));
    return;
  }

  if (method === 'GET' && pathname === '/api/killswitch') {
    const state = loadKillSwitchState(stateDir);
    sendJson(res, 200, {
      state,
      chain: verifyAuditChain(state.auditLog),
      publish: canPublish(state),
    });
    return;
  }

  if (method === 'POST') {
    let body: unknown;
    try {
      body = await readJsonBody(req);
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      if (code === 'PAYLOAD_TOO_LARGE') {
        sendJson(res, 413, { error: 'Request payload exceeds 2 MiB limit.' });
        return;
      }
      sendJson(res, 400, { error: 'Invalid JSON request body.' });
      return;
    }

    if (!isRecord(body)) {
      sendJson(res, 400, { error: 'Request body must be a JSON object.' });
      return;
    }

    try {
      if (pathname === '/api/preflight') {
        const draftRaw = body.draft;
        if (!isRecord(draftRaw) || typeof draftRaw.text !== 'string') {
          sendJson(res, 400, {
            error: 'POST /api/preflight requires { draft: { text: string, ... }, targets?, guardrails? }.',
          });
          return;
        }
        const targets = parseTargetsList(body.targets);
        const guardrails = isRecord(body.guardrails)
          ? (body.guardrails as BrandGuardrails)
          : undefined;
        const report = runPreFlight(draftRaw as unknown as SocialDraft, targets, guardrails);
        sendJson(res, 200, report);
        return;
      }

      if (pathname === '/api/compile') {
        if (typeof body.markdown !== 'string' || body.markdown.trim().length === 0) {
          sendJson(res, 400, {
            error: 'POST /api/compile requires { markdown: string, targets?, guardrails? }.',
          });
          return;
        }
        const targets =
          body.targets !== undefined ? parseTargetsList(body.targets) : undefined;
        const guardrails = isRecord(body.guardrails)
          ? (body.guardrails as BrandGuardrails)
          : undefined;
        const bundle = compileCanonicalPost(body.markdown, targets, guardrails);
        sendJson(res, 200, bundle);
        return;
      }

      if (pathname === '/api/safezone') {
        if (typeof body.presetId !== 'string' || !isSafeZonePresetId(body.presetId)) {
          sendJson(res, 400, {
            error: `Invalid or missing presetId. Valid presets: ${Object.keys(SAFE_ZONE_PRESETS).join(', ')}`,
          });
          return;
        }
        const rawBoxes = body.boxes ?? [];
        if (!Array.isArray(rawBoxes)) {
          sendJson(res, 400, { error: '"boxes" must be an array of BoundingBox objects.' });
          return;
        }
        const boxes: BoundingBox[] = rawBoxes.map((b, idx) => {
          if (!isRecord(b)) {
            throw new Error(`Box at index ${idx} must be an object.`);
          }
          const x = Number(b.x);
          const y = Number(b.y);
          const width = Number(b.width);
          const height = Number(b.height);
          if (
            !Number.isFinite(x) ||
            !Number.isFinite(y) ||
            !Number.isFinite(width) ||
            !Number.isFinite(height)
          ) {
            throw new Error(`Box at index ${idx} requires numeric x, y, width, height.`);
          }
          return {
            id: typeof b.id === 'string' && b.id.trim() ? b.id : `box-${idx + 1}`,
            label: typeof b.label === 'string' && b.label.trim() ? b.label : `Overlay ${idx + 1}`,
            x,
            y,
            width,
            height,
          };
        });
        const analysis = analyzeSafeZone(body.presetId, boxes);
        sendJson(res, 200, analysis);
        return;
      }

      if (pathname === '/api/triage') {
        if (!Array.isArray(body.comments)) {
          sendJson(res, 400, {
            error: 'POST /api/triage requires { comments: CommentItem[] }.',
          });
          return;
        }
        const comments = body.comments as CommentItem[];
        const triaged = triageComments(comments);
        sendJson(res, 200, { count: triaged.length, items: triaged });
        return;
      }

      if (pathname === '/api/killswitch') {
        let state = loadKillSwitchState(stateDir);
        const actor =
          typeof body.actor === 'string' && body.actor.trim().length > 0
            ? body.actor.trim()
            : 'studio-operator';
        const reason =
          typeof body.reason === 'string' && body.reason.trim().length > 0
            ? body.reason.trim()
            : 'Updated via PostFlight Studio API';

        const action = typeof body.action === 'string' ? body.action.toLowerCase() : undefined;

        if (action === 'freeze' || action === 'activate' || (action === undefined && body.frozen === true)) {
          state = activateKillSwitch(state, actor, reason);
          saveKillSwitchState(stateDir, state);
        } else if (
          action === 'resume' ||
          action === 'release' ||
          (action === undefined && body.frozen === false)
        ) {
          state = releaseKillSwitch(state, actor, reason);
          saveKillSwitchState(stateDir, state);
        } else if (action === 'event' && typeof body.eventAction === 'string') {
          state = recordGovernanceEvent(state, {
            actor,
            action: body.eventAction as GovernanceAuditEntry['action'],
            reason,
            ...(typeof body.targetId === 'string' ? { targetId: body.targetId } : {}),
          });
          saveKillSwitchState(stateDir, state);
        } else if (action !== 'verify' && action !== 'status') {
          sendJson(res, 400, {
            error:
              'POST /api/killswitch expects action ("freeze" | "resume" | "verify" | "event") or boolean "frozen".',
          });
          return;
        }

        sendJson(res, 200, {
          state,
          chain: verifyAuditChain(state.auditLog),
          publish: canPublish(state),
        });
        return;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      sendJson(res, 400, { error: message });
      return;
    }
  }

  sendJson(res, 404, { error: `Unknown API route: ${method} ${pathname}` });
}

function serveStaticFile(
  res: http.ServerResponse,
  distDir: string,
  pathname: string
): void {
  const rootResolved = path.resolve(distDir);

  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Bad Request');
    return;
  }

  if (decodedPath.includes('\0')) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Bad Request');
    return;
  }

  const relativePath = decodedPath === '/' ? 'index.html' : decodedPath.replace(/^\/+/, '');
  const candidate = path.resolve(rootResolved, relativePath);

  if (candidate !== rootResolved && !candidate.startsWith(`${rootResolved}${path.sep}`)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  const indexPath = path.join(rootResolved, 'index.html');
  if (!fs.existsSync(indexPath)) {
    sendFallbackHtml(res, rootResolved);
    return;
  }

  let fileToServe = candidate;
  if (!fs.existsSync(fileToServe) || fs.statSync(fileToServe).isDirectory()) {
    const ext = path.extname(fileToServe);
    if (ext.length > 0) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }
    fileToServe = indexPath;
  }

  const ext = path.extname(fileToServe).toLowerCase();
  const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';
  const data = fs.readFileSync(fileToServe);

  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': data.byteLength,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
  });
  res.end(data);
}

export async function startStudioServer(
  options: StudioServerOptions = {}
): Promise<StudioServerHandle> {
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? 4173;
  const stateDir = options.stateDir ?? path.join(process.cwd(), '.postflight');
  const distDir = resolveStudioDistDir();

  const server = http.createServer((req, res) => {
    const rawUrl = req.url ?? '/';
    const rawPathPart = rawUrl.split('?')[0] ?? '/';
    if (/(?:^|[/\\])(?:\.\.|%2e%2e)(?:$|[/\\]|%2f|%5c)/i.test(rawPathPart) || rawPathPart.includes('%00')) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    const parsedUrl = new URL(rawUrl, `http://${host}`);
    const pathname = parsedUrl.pathname;

    if (pathname.startsWith('/api/')) {
      handleApiRequest(req, res, pathname, stateDir).catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        if (!res.headersSent) {
          sendJson(res, 500, { error: `Internal server error: ${message}` });
        }
      });
      return;
    }

    if ((req.method ?? 'GET').toUpperCase() !== 'GET' && (req.method ?? 'GET').toUpperCase() !== 'HEAD') {
      res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Method Not Allowed');
      return;
    }

    serveStaticFile(res, distDir, pathname);
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });

  const addr = server.address() as AddressInfo | null;
  const boundPort = addr?.port ?? port;
  const url = `http://${host}:${boundPort}`;

  const close = (): Promise<void> =>
    new Promise((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

  return { url, close };
}
