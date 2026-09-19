import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Policy, bindCapability } from '../src/profile.js';
import { Artifact, Decision, validateInputs } from '../src/schema.js';
import { Evidence } from '../src/evidence.js';
import { fixture, loadProfile } from '../scripts/fixtures.js';

test('policy blocks cross-origin, unreviewed routes, writes and encoded traversal', async () => {
  const p = new Policy(await loadProfile());
  for (const url of [
    'https://evil.example/app',
    'http://127.0.0.1:4173.evil.example/app',
    '/admin',
    '/app?token=secret',
    '/app/../admin',
    '/legacy/%2e%2e/admin',
  ])
    assert.throws(() => p.url(url));
  assert.throws(() => p.action({ type: 'click', target: 'transfer' }), /Irreversible/);
  assert.throws(() => p.action({ type: 'fill', target: 'balance', input: 'memberId' }));
  assert.equal(
    p.url('/legacy/search?memberId=12345'),
    'http://127.0.0.1:4173/legacy/search?memberId=12345',
  );
});
test('artifact binding rejects altered locators, checkpoints, output bindings and drift', async () => {
  const p = await loadProfile();
  const good = await fixture(p);
  bindCapability(good, p);
  for (const alter of [
    (a: typeof good) => (a.app.version = '2'),
    (a: typeof good) => (a.targets.search!.name = 'Transfer funds'),
    (a: typeof good) => (a.success.text = 'anything'),
    (a: typeof good) =>
      (a.steps[5]!.action = { type: 'extract', target: 'currency', output: 'balance' }),
    (a: typeof good) => (a.steps[1]!.id = 'entry'),
  ]) {
    const bad = structuredClone(good);
    alter(bad);
    assert.throws(() => bindCapability(bad, p));
  }
});
test('contracts reject literal credentials, executable actions and unexpected parameters', async () => {
  const good = await fixture(await loadProfile());
  assert.throws(() =>
    Artifact.parse({
      ...good,
      steps: [{ id: 'bad', action: { type: 'evaluate', code: 'fetch()' } }],
    }),
  );
  assert.throws(() =>
    Decision.parse({
      reason: 'x',
      done: false,
      action: { type: 'fill', target: 'memberId', value: 'secret' },
    }),
  );
  assert.throws(() => validateInputs(good, { memberId: 12345 }));
  assert.throws(() => validateInputs(good, { memberId: '12345', password: 'secret' }));
});
test('evidence redacts bound inputs, extracted outputs and secrets', async () => {
  const root = await mkdtemp(join(tmpdir(), 'capability-test-'));
  const e = new Evidence(root, ['12345']);
  e.protect('4250.75');
  await e.event('sample', {
    member: '12345',
    balance: 4250.75,
    token: 'Bearer abcdef',
    email: 'name@example.com',
  });
  const log = await readFile(join(e.dir, 'events.jsonl'), 'utf8');
  assert.equal(JSON.parse(log).balance, '[REDACTED]');
  for (const secret of ['12345', '4250.75', 'abcdef', 'name@example.com'])
    assert.ok(!log.includes(secret));
});
