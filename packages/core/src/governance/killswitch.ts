import type { GovernanceAuditEntry, KillSwitchState } from '../types.js';

export const GENESIS_HASH = '0'.repeat(64);

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

/**
 * Pure TypeScript FIPS 180-4 SHA-256 over UTF-8 bytes.
 * Zero Node built-ins; runs identically in Node.js 20+ and browsers.
 */
export function sha256Hex(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const byteLen = bytes.length;
  const bitLen = byteLen * 8;

  // Pad to congruent 56 mod 64 bytes, then append 8-byte big-endian bit length
  const totalLen = Math.ceil((byteLen + 9) / 64) * 64;
  const padded = new Uint8Array(totalLen);
  padded.set(bytes);
  padded[byteLen] = 0x80;

  const view = new DataView(padded.buffer);
  const bitLenHi = Math.floor(bitLen / 0x100000000);
  const bitLenLo = bitLen >>> 0;
  view.setUint32(totalLen - 8, bitLenHi, false);
  view.setUint32(totalLen - 4, bitLenLo, false);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const w = new Uint32Array(64);

  for (let offset = 0; offset < totalLen; offset += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(offset + i * 4, false);
    }

    for (let i = 16; i < 64; i++) {
      const w15 = w[i - 15] ?? 0;
      const w2 = w[i - 2] ?? 0;
      const w16 = w[i - 16] ?? 0;
      const w7 = w[i - 7] ?? 0;
      const s0 = rotr(w15, 7) ^ rotr(w15, 18) ^ (w15 >>> 3);
      const s1 = rotr(w2, 17) ^ rotr(w2, 19) ^ (w2 >>> 10);
      w[i] = (w16 + s0 + w7 + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const k = SHA256_K[i] ?? 0;
      const wi = w[i] ?? 0;
      const temp1 = (h + S1 + ch + k + wi) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((word) => word.toString(16).padStart(8, '0'))
    .join('');
}

function computeAuditEntryHash(entry: Omit<GovernanceAuditEntry, 'hash'>): string {
  const canonicalPayload = JSON.stringify({
    seq: entry.seq,
    timestamp: entry.timestamp,
    actor: entry.actor,
    action: entry.action,
    targetId: entry.targetId ?? null,
    reason: entry.reason,
    prevHash: entry.prevHash,
  });
  return sha256Hex(canonicalPayload);
}

export function createKillSwitchState(): KillSwitchState {
  return {
    frozen: false,
    frozenAt: null,
    frozenBy: null,
    reason: null,
    blockedAttemptCount: 0,
    auditLog: [],
  };
}

export function recordGovernanceEvent(
  state: KillSwitchState,
  event: Omit<GovernanceAuditEntry, 'seq' | 'prevHash' | 'hash' | 'timestamp'> & {
    timestamp?: string;
  },
): KillSwitchState {
  const lastEntry = state.auditLog[state.auditLog.length - 1];
  const seq = lastEntry ? lastEntry.seq + 1 : 1;
  const prevHash = lastEntry ? lastEntry.hash : GENESIS_HASH;
  const timestamp = event.timestamp ?? new Date().toISOString();

  const unsignedEntry: Omit<GovernanceAuditEntry, 'hash'> = {
    seq,
    timestamp,
    actor: event.actor,
    action: event.action,
    reason: event.reason,
    prevHash,
  };

  if (event.targetId !== undefined) {
    unsignedEntry.targetId = event.targetId;
  }

  const hash = computeAuditEntryHash(unsignedEntry);
  const fullEntry: GovernanceAuditEntry = {
    ...unsignedEntry,
    hash,
  };

  return {
    ...state,
    blockedAttemptCount:
      event.action === 'PUBLISH_BLOCKED'
        ? state.blockedAttemptCount + 1
        : state.blockedAttemptCount,
    auditLog: [...state.auditLog, fullEntry],
  };
}

export function activateKillSwitch(
  state: KillSwitchState,
  actor: string,
  reason: string,
  timestamp?: string,
): KillSwitchState {
  const ts = timestamp ?? new Date().toISOString();
  const next = recordGovernanceEvent(state, {
    actor,
    action: 'KILL_SWITCH_ACTIVATED',
    reason,
    timestamp: ts,
  });
  return {
    ...next,
    frozen: true,
    frozenAt: ts,
    frozenBy: actor,
    reason,
  };
}

export function releaseKillSwitch(
  state: KillSwitchState,
  actor: string,
  reason: string,
  timestamp?: string,
): KillSwitchState {
  const ts = timestamp ?? new Date().toISOString();
  const next = recordGovernanceEvent(state, {
    actor,
    action: 'KILL_SWITCH_RELEASED',
    reason,
    timestamp: ts,
  });
  return {
    ...next,
    frozen: false,
    frozenAt: null,
    frozenBy: null,
    reason: null,
  };
}

export function verifyAuditChain(auditLog: GovernanceAuditEntry[]): {
  valid: boolean;
  brokenAtSeq: number | null;
} {
  for (let i = 0; i < auditLog.length; i++) {
    const entry = auditLog[i];
    if (!entry) continue;

    const expectedSeq = i + 1;
    const prevEntry = i > 0 ? auditLog[i - 1] : undefined;
    const expectedPrevHash = prevEntry ? prevEntry.hash : GENESIS_HASH;

    if (entry.seq !== expectedSeq || entry.prevHash !== expectedPrevHash) {
      return { valid: false, brokenAtSeq: entry.seq };
    }

    const unsignedEntry: Omit<GovernanceAuditEntry, 'hash'> = {
      seq: entry.seq,
      timestamp: entry.timestamp,
      actor: entry.actor,
      action: entry.action,
      reason: entry.reason,
      prevHash: entry.prevHash,
    };
    if (entry.targetId !== undefined) {
      unsignedEntry.targetId = entry.targetId;
    }

    const recomputedHash = computeAuditEntryHash(unsignedEntry);
    if (entry.hash !== recomputedHash) {
      return { valid: false, brokenAtSeq: entry.seq };
    }
  }

  return { valid: true, brokenAtSeq: null };
}

export function canPublish(state: KillSwitchState): {
  allowed: boolean;
  reason: string;
} {
  if (state.frozen) {
    return {
      allowed: false,
      reason: `Publishing is halted by emergency kill switch (activated by ${state.frozenBy ?? 'unknown'} at ${state.frozenAt ?? 'unknown'}): ${state.reason ?? 'Global freeze active'}.`,
    };
  }
  return {
    allowed: true,
    reason: 'Kill switch is inactive; publishing is permitted.',
  };
}
