import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ApiPlanner } from '../src/planner.js';
import { Evidence } from '../src/evidence.js';

const env = { PATH: process.env.PATH, LLM_MODEL: 'test-model', OPENAI_API_KEY: 'test-secret' };

test('real Python worker rejects unsafe configuration without leaking secrets', async () => {
  const root = await mkdtemp(join(tmpdir(), 'python-planner-'));
  try {
    const planner = new ApiPlanner(new Evidence(root), {
      ...env,
      LLM_BASE_URL: 'http://invalid.example',
    });
    await assert.rejects(planner.decide({ goal: 'Read' }), { code: 'MODEL_CONFIG' });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('missing Python interpreter fails with a safe actionable error', async () => {
  const planner = new ApiPlanner(new Evidence(tmpdir()), { ...env, PYTHON_BIN: '/missing/python' });
  await assert.rejects(planner.decide({}), { code: 'MODEL_UNAVAILABLE' });
});

test('bridge validates decisions from a subprocess and records only accepted metadata', async () => {
  const root = await mkdtemp(join(tmpdir(), 'python-bridge-'));
  try {
    // Test-only executable: replaces the external provider, never creates live-discovery evidence.
    const executable = join(root, 'fake-python');
    const fixture = {
      version: 1,
      ok: true,
      decision: { done: true, reason: 'Verified' },
      responseId: 'test_response',
      usage: { input_tokens: 4 },
    };
    const install = async (output: unknown) =>
      writeFile(
        executable,
        `#!${process.execPath}\nlet input='';process.stdin.on('data',c=>input+=c);process.stdin.on('end',()=>{const r=JSON.parse(input);if(r.version!==1||r.context.goal!=='Read'||process.env.UNRELATED_SECRET)process.exit(2);process.stdout.write(${JSON.stringify(JSON.stringify(output))});});\n`,
        { mode: 0o700 },
      );
    await install(fixture);
    const evidence = new Evidence(root);
    const planner = new ApiPlanner(evidence, {
      ...env,
      PYTHON_BIN: executable,
      UNRELATED_SECRET: 'never-pass',
    });
    assert.deepEqual(await planner.decide({ goal: 'Read' }), fixture.decision);
    const log = await readFile(join(evidence.dir, 'events.jsonl'), 'utf8');
    assert.equal(JSON.parse(log).transport, 'python');
    assert.ok(!log.includes('test-secret'));
    for (const bad of [
      {
        ...fixture,
        decision: { done: false, reason: 'Execute', action: { type: 'evaluate', code: 'unsafe' } },
      },
      { ...fixture, version: 2 },
      { ...fixture, usage: { input_tokens: 'private' } },
    ]) {
      await install(bad);
      await assert.rejects(planner.decide({ goal: 'Read' }), { code: 'MODEL_INVALID_RESPONSE' });
    }
    assert.equal(await readFile(join(evidence.dir, 'events.jsonl'), 'utf8'), log);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
