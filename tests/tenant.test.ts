import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { compileTenant } from '../src/tenant.js';
import { canonical, contentHash, digest } from '../src/profile.js';
import { loadProfile, fixture } from '../scripts/fixtures.js';

test('presentation binding preserves the complete safety and business contract', async () => {
  const base = await loadProfile();
  const overlay = JSON.parse(await readFile('config/tenants/harbor.json', 'utf8'));
  const { effective } = compileTenant(base, overlay);
  assert.notEqual(digest(effective), digest(base));
  for (const key of [
    'allowedPaths',
    'allowedActions',
    'permissions',
    'riskyTargets',
    'conditions',
    'outputTargets',
    'postconditions',
  ] as const)
    assert.deepEqual(effective[key], base[key]);
  assert.equal(effective.targets.search!.name, 'Find client');
  assert.equal(effective.success.text, 'Savings summary');
  assert.equal(base.targets.search!.name, 'Find member');
});
test('overrides cannot change authority, create targets, collide locators or hide base drift', async () => {
  const base = await loadProfile();
  const overlay = JSON.parse(await readFile('config/tenants/harbor.json', 'utf8'));
  for (const bad of [
    { ...overlay, permissions: { transfer: ['click'] } },
    { ...overlay, allowedPaths: ['/admin'] },
    { ...overlay, labels: { newControl: 'Anything' } },
    { ...overlay, labels: { search: 'Transfer funds' } },
    { ...overlay, labels: { savings: 'Open member' } },
    { ...overlay, baseProfileDigest: '0'.repeat(64) },
  ])
    assert.throws(() => compileTenant(base, bad));
});
test('canonical hashes are insensitive to object-key order but bind semantic changes', async () => {
  const cap = await fixture(await loadProfile());
  const reordered = Object.fromEntries(Object.entries(cap).reverse());
  assert.equal(contentHash(cap), contentHash(reordered));
  assert.notEqual(contentHash(cap), contentHash({ ...cap, postconditions: [] }));
  assert.equal(canonical({ a: 1, b: 2 }), canonical({ b: 2, a: 1 }));
  assert.equal(canonical({ outputs: 1, outputTargets: 2 }), '{"outputTargets":2,"outputs":1}');
});
