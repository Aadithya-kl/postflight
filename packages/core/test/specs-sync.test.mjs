import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLATFORM_IDS, getPlatformSpec } from '../dist/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const specsDir = path.resolve(__dirname, '../../../specs/platforms');

describe('Open Platform Spec Registry Sync', () => {
  it('matches every JSON file in specs/platforms/*.json with @postflight/core registry', () => {
    const files = fs
      .readdirSync(specsDir)
      .filter((f) => f.endsWith('.json'))
      .sort();

    assert.equal(
      files.length,
      PLATFORM_IDS.length,
      `Expected ${PLATFORM_IDS.length} JSON spec files, found ${files.length}`,
    );

    for (const id of PLATFORM_IDS) {
      const filePath = path.join(specsDir, `${id}.json`);
      assert.ok(fs.existsSync(filePath), `Missing spec JSON file: ${filePath}`);
      const diskSpec = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const coreSpec = getPlatformSpec(id);
      assert.deepStrictEqual(
        coreSpec,
        diskSpec,
        `Mismatch between specs/platforms/${id}.json and packages/core registry`,
      );
    }
  });
});
