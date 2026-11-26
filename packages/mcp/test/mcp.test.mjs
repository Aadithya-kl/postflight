import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const mcpBin = path.join(repoRoot, 'packages/mcp/dist/index.js');

function runMcpSession(requests) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [mcpBin], {
      cwd: repoRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const responses = [];
    let buffer = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      let idx;
      while ((idx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (line) responses.push(JSON.parse(line));
      }
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`MCP server exited with code ${code}: ${stderr}`));
      } else {
        resolve(responses);
      }
    });

    for (const req of requests) {
      child.stdin.write(`${JSON.stringify(req)}\n`);
    }
    child.stdin.end();
  });
}

describe('@postflight/mcp — Stdio JSON-RPC 2.0 Integration Tests', () => {
  it('completes initialize handshake, lists 9 tools & resources, and executes deterministic tools', async () => {
    const responses = await runMcpSession([
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'postflight-test', version: '1.0.0' },
        },
      },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 2, method: 'ping' },
      { jsonrpc: '2.0', id: 3, method: 'tools/list' },
      {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'preflight_lint_post',
          arguments: {
            text: '𝐔𝐧𝐥𝐨𝐜𝐤 growth #a #b #c #d #e #f #spon',
            targets: ['instagram-feed'],
            isSponsored: true,
          },
        },
      },
      {
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: {
          name: 'check_safe_zone',
          arguments: {
            presetId: 'instagram-feed-to-grid',
            boxes: [{ id: 'logo', label: 'Logo', x: 5, y: 100, width: 100, height: 100 }],
          },
        },
      },
      { jsonrpc: '2.0', id: 6, method: 'resources/list' },
      {
        jsonrpc: '2.0',
        id: 7,
        method: 'resources/read',
        params: { uri: 'postflight://specs/bluesky' },
      },
      {
        jsonrpc: '2.0',
        id: 8,
        method: 'tools/call',
        params: {
          name: 'check_safe_zone',
          arguments: {
            presetId: 'instagram-reels-to-grid',
            boxes: [{ id: 'title', label: 'Cover Title', x: 100, y: 120, width: 600, height: 150 }],
          },
        },
      },
      {
        jsonrpc: '2.0',
        id: 9,
        method: 'tools/call',
        params: {
          name: 'preflight_lint_post',
          arguments: {
            text: '@partner Launching {{tbd}} via https://acme.page.link/go #Open\u200BSource',
            targets: ['x', 'mastodon'],
            scheduledAt: '2026-03-08T02:00:00',
          },
        },
      },
    ]);

    const byId = new Map(responses.map((r) => [r.id, r]));

    assert.equal(byId.get(1)?.result?.serverInfo?.name, 'postflight-mcp');
    assert.deepEqual(byId.get(2)?.result, {});

    const tools = byId.get(3)?.result?.tools ?? [];
    assert.equal(tools.length, 9);

    const lintCall = byId.get(4)?.result;
    assert.equal(lintCall?.isError, false);
    const lintData = JSON.parse(lintCall.content[0].text);
    assert.equal(lintData.passed, false);
    assert.ok(lintData.totalErrors > 0);

    const szCall = byId.get(5)?.result;
    assert.equal(szCall?.isError, false);
    const szData = JSON.parse(szCall.content[0].text);
    assert.equal(szData.allClear, false);

    const resources = byId.get(6)?.result?.resources ?? [];
    assert.ok(resources.length >= 10);

    const bskyRes = byId.get(7)?.result?.contents?.[0];
    assert.ok(bskyRes?.text?.includes('"maxBytes": 3000'));

    const reelsGridCall = byId.get(8)?.result;
    assert.equal(reelsGridCall?.isError, false);
    assert.equal(JSON.parse(reelsGridCall.content[0].text).allClear, false);

    const hiddenLintCall = byId.get(9)?.result;
    assert.equal(hiddenLintCall?.isError, false);
    assert.equal(JSON.parse(hiddenLintCall.content[0].text).passed, false);
  });
});
