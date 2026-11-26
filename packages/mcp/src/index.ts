#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import {
  MCP_TOOLS,
  executeMcpTool,
  listMcpResources,
  readMcpResource,
} from './tools.js';

export const MCP_PROTOCOL_VERSION = '2024-11-05';
export const MCP_SERVER_INFO = {
  name: 'postflight-mcp',
  version: '1.0.0',
} as const;

type JsonRpcId = string | number | null;

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: JsonRpcId;
  method: string;
  params?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function jsonRpcResult(id: JsonRpcId, result: Record<string, unknown>): Record<string, unknown> {
  return {
    jsonrpc: '2.0',
    id,
    result,
  };
}

function jsonRpcError(
  id: JsonRpcId,
  code: number,
  message: string,
  data?: unknown
): Record<string, unknown> {
  const error: Record<string, unknown> = { code, message };
  if (data !== undefined) {
    error.data = data;
  }
  return {
    jsonrpc: '2.0',
    id,
    error,
  };
}

export async function handleJsonRpcMessage(
  msg: unknown
): Promise<Record<string, unknown> | null> {
  if (!isRecord(msg)) {
    return jsonRpcError(null, -32600, 'Invalid Request: message must be a JSON object.');
  }

  const rawId = msg.id;
  const hasId = Object.prototype.hasOwnProperty.call(msg, 'id') && rawId !== undefined;
  const id: JsonRpcId =
    typeof rawId === 'string' || typeof rawId === 'number' || rawId === null ? rawId : null;

  if (msg.jsonrpc !== '2.0' || typeof msg.method !== 'string' || msg.method.length === 0) {
    if (!hasId) {
      return null;
    }
    return jsonRpcError(
      id,
      -32600,
      'Invalid Request: expected jsonrpc="2.0" and non-empty string method.'
    );
  }

  const request = msg as unknown as JsonRpcRequest;
  const { method, params } = request;

  // Notifications must never receive a response per JSON-RPC 2.0 & MCP spec
  if (method === 'notifications/initialized' || method.startsWith('notifications/')) {
    return null;
  }
  if (!hasId) {
    return null;
  }

  switch (method) {
    case 'initialize': {
      return jsonRpcResult(id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {
          tools: {},
          resources: {},
        },
        serverInfo: {
          name: MCP_SERVER_INFO.name,
          version: MCP_SERVER_INFO.version,
        },
      });
    }

    case 'ping': {
      return jsonRpcResult(id, {});
    }

    case 'tools/list': {
      return jsonRpcResult(id, {
        tools: MCP_TOOLS,
      });
    }

    case 'tools/call': {
      if (!isRecord(params) || typeof params.name !== 'string' || params.name.trim() === '') {
        return jsonRpcError(id, -32602, 'Invalid params: tools/call requires string "name".');
      }

      const toolName = params.name;
      const rawArgs = params.arguments;
      if (rawArgs !== undefined && !isRecord(rawArgs)) {
        return jsonRpcResult(id, {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                { error: 'Tool "arguments" must be a JSON object when provided.' },
                null,
                2
              ),
            },
          ],
          isError: true,
        });
      }

      try {
        const result = executeMcpTool(toolName, rawArgs ?? {});
        return jsonRpcResult(id, {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
          isError: false,
        });
      } catch (error) {
        const errMessage = error instanceof Error ? error.message : String(error);
        return jsonRpcResult(id, {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: errMessage }, null, 2),
            },
          ],
          isError: true,
        });
      }
    }

    case 'resources/list': {
      return jsonRpcResult(id, {
        resources: listMcpResources(),
      });
    }

    case 'resources/read': {
      if (!isRecord(params) || typeof params.uri !== 'string' || params.uri.trim() === '') {
        return jsonRpcError(id, -32602, 'Invalid params: resources/read requires string "uri".');
      }

      const content = readMcpResource(params.uri);
      if (!content) {
        return jsonRpcError(id, -32002, `Resource not found: ${params.uri}`);
      }

      return jsonRpcResult(id, {
        contents: [content],
      });
    }

    default: {
      return jsonRpcError(id, -32601, `Method not found: ${method}`);
    }
  }
}

export function startStdioServer(): void {
  const rl = readline.createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  });

  let queue: Promise<void> = Promise.resolve();

  const writeResponse = (payload: Record<string, unknown>): void => {
    process.stdout.write(`${JSON.stringify(payload)}\n`);
  };

  rl.on('line', (line: string) => {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      return;
    }

    queue = queue
      .then(async () => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(trimmed);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          writeResponse(jsonRpcError(null, -32700, `Parse error: ${message}`));
          return;
        }

        const response = await handleJsonRpcMessage(parsed);
        if (response !== null) {
          writeResponse(response);
        }
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        process.stderr.write(`[postflight-mcp] Internal error: ${message}\n`);
      });
  });
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  const selfPath = fileURLToPath(import.meta.url);
  try {
    return fs.realpathSync(selfPath) === fs.realpathSync(path.resolve(entry));
  } catch {
    const a = path.resolve(selfPath);
    const b = path.resolve(entry);
    return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
  }
}

if (isMainModule()) {
  startStdioServer();
}
