import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RULE_CATALOG } from '../dist/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(__dirname, '../src');
const rulesDoc = path.resolve(__dirname, '../../../docs/RULES.md');

const RULE_ID_PATTERN =
  /'(limits|fold|algorithm|compliance|accessibility|attribution|governance|media)\/[a-z0-9-]+'/g;

/** Every `.ts` file under packages/core/src. */
function collectSourceFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectSourceFiles(full));
    else if (entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

/**
 * Rule IDs that appear anywhere in the core sources. The catalog declaration
 * itself lives in linter/rules.ts, so an ID that occurs exactly once across the
 * whole tree is declared but never actually emitted as a diagnostic.
 */
function collectIdOccurrences() {
  const counts = new Map();
  for (const file of collectSourceFiles(srcDir)) {
    const text = fs.readFileSync(file, 'utf8');
    for (const match of text.matchAll(RULE_ID_PATTERN)) {
      const id = match[0].slice(1, -1);
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return counts;
}

describe('Pre-Flight Rule Catalog Integrity', () => {
  const occurrences = collectIdOccurrences();
  const catalogIds = RULE_CATALOG.map((r) => r.id);

  it('registers every rule ID emitted anywhere in @postflight/core', () => {
    const catalogSet = new Set(catalogIds);
    const missing = [...occurrences.keys()].filter((id) => !catalogSet.has(id)).sort();

    assert.deepStrictEqual(
      missing,
      [],
      `These rule IDs are emitted as diagnostics but absent from RULE_CATALOG. ` +
        `Unregistered rules degrade SARIF output to a raw ID with no title or description ` +
        `(see formatReportAsSarif in src/linter/index.ts). Add a RuleDefinition for each:\n  ` +
        missing.join('\n  '),
    );
  });

  it('contains no phantom entries that never emit a diagnostic', () => {
    const phantoms = catalogIds.filter((id) => (occurrences.get(id) ?? 0) <= 1).sort();

    assert.deepStrictEqual(
      phantoms,
      [],
      `These RULE_CATALOG entries are declared but never emitted anywhere in the engine, ` +
        `so they advertise checks that do not run:\n  ` + phantoms.join('\n  '),
    );
  });

  it('has unique, well-formed rule definitions', () => {
    const seen = new Set();
    for (const rule of RULE_CATALOG) {
      assert.ok(!seen.has(rule.id), `Duplicate RULE_CATALOG entry: ${rule.id}`);
      seen.add(rule.id);

      assert.match(
        rule.id,
        /^(limits|fold|algorithm|compliance|accessibility|attribution|governance|media)\/[a-z0-9-]+$/,
        `Malformed rule ID: ${rule.id}`,
      );
      assert.equal(
        rule.id.split('/')[0],
        rule.category,
        `Rule ${rule.id} is filed under category "${rule.category}"; the ID prefix must match.`,
      );
      assert.ok(
        ['error', 'warning', 'info'].includes(rule.defaultSeverity),
        `Rule ${rule.id} has invalid defaultSeverity "${rule.defaultSeverity}"`,
      );
      for (const field of ['title', 'summary', 'specRef']) {
        assert.ok(
          typeof rule[field] === 'string' && rule[field].trim().length > 0,
          `Rule ${rule.id} is missing a non-empty "${field}"`,
        );
      }
      assert.notEqual(
        rule.title,
        rule.id,
        `Rule ${rule.id} needs a human-readable title, not a copy of its ID.`,
      );
    }
  });

  it('documents every catalog rule in docs/RULES.md and nothing that does not exist', () => {
    const doc = fs.readFileSync(rulesDoc, 'utf8');
    const documented = new Set(
      [...doc.matchAll(/`((?:limits|fold|algorithm|compliance|accessibility|attribution|governance|media)\/[a-z0-9-]+)`/g)].map(
        (m) => m[1],
      ),
    );

    const undocumented = catalogIds.filter((id) => !documented.has(id)).sort();
    assert.deepStrictEqual(
      undocumented,
      [],
      `These rules ship in RULE_CATALOG but are missing from docs/RULES.md:\n  ` +
        undocumented.join('\n  '),
    );

    const catalogSet = new Set(catalogIds);
    const phantomDocs = [...documented].filter((id) => !catalogSet.has(id)).sort();
    assert.deepStrictEqual(
      phantomDocs,
      [],
      `docs/RULES.md documents these rule IDs, but they do not exist in the engine:\n  ` +
        phantomDocs.join('\n  '),
    );
  });
});
