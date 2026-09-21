import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { fixture, loadProfile } from '../scripts/fixtures.js';
import { contentHash } from '../src/profile.js';

test('submission gate requires replay of the exact discovered artifact', async () => {
  // Deliberately fabricated test records, confined to a temporary directory.
  // They are never submission evidence and are removed after the test.
  const root = await mkdtemp(join(tmpdir(), 'submission-gate-'));
  try {
    const cap = await fixture(await loadProfile());
    cap.provenance = {
      ...cap.provenance,
      kind: 'llm_discovery',
      runId: 'test-discovery',
      provider: 'test',
      model: 'test',
    };
    const discovery = join(root, 'evidence/test-discovery');
    const replay = join(root, 'evidence/test-replay');
    await mkdir(discovery, { recursive: true });
    await mkdir(replay, { recursive: true });
    await writeFile(join(discovery, 'artifact.json'), JSON.stringify(cap));
    await writeFile(
      join(discovery, 'events.jsonl'),
      [
        { type: 'run_started', mode: 'llm_discovery' },
        { type: 'model_response', responseId: 'test-only' },
        { type: 'run_completed' },
      ]
        .map((e) => JSON.stringify(e))
        .join('\n'),
    );
    const writeReplay = async (hash: string, withModel = false) =>
      writeFile(
        join(replay, 'events.jsonl'),
        [
          {
            type: 'run_started',
            mode: 'deterministic_replay',
            sourceKind: 'llm_discovery',
            sourceRunId: 'test-discovery',
            artifactHash: hash,
          },
          ...(withModel ? [{ type: 'model_response' }] : []),
          { type: 'run_completed' },
        ]
          .map((e) => JSON.stringify(e))
          .join('\n'),
      );
    const check = () =>
      execFileSync(
        process.execPath,
        [
          '--import',
          import.meta.resolve('tsx'),
          fileURLToPath(new URL('../scripts/check-submission.ts', import.meta.url)),
        ],
        { cwd: root, encoding: 'utf8', stdio: 'pipe' },
      );
    await writeReplay('wrong-hash');
    assert.throws(check);
    await writeReplay(contentHash(cap), true);
    assert.throws(check);
    await writeReplay(contentHash(cap));
    assert.equal(JSON.parse(check()).ready, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
