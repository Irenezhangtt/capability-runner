import { mkdir, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { startDemo } from '../src/demo-app.js';
import { Evidence } from '../src/evidence.js';
import { BrowserSurface } from '../src/surface.js';
import { Runner } from '../src/engine.js';
import { loadProfile, fixture } from './fixtures.js';

const server = await startDemo(0);
const profile = await loadProfile(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
const artifact = await fixture(profile);
await mkdir('evidence/offline', { recursive: true });
await writeFile(
  'evidence/offline/authored-artifact.json',
  JSON.stringify(artifact, null, 2) + '\n',
);
const runs: unknown[] = [];
try {
  for (const [scenario, memberId] of [
    ['normal', '67890'],
    ['normal', '99999'],
    ['transient', '12345'],
    ['denied', '12345'],
    ['expired', '12345'],
  ]) {
    const evidence = new Evidence('evidence/offline', [memberId]);
    const surface = new BrowserSurface(profile, evidence);
    const runner = new Runner(surface, evidence);
    try {
      await surface.launch(false, scenario);
      const result = await runner.replay(artifact, { memberId });
      runs.push({ scenario, runId: evidence.runId, status: result.status });
      console.log(`${scenario}: ${result.status}`);
    } finally {
      await runner.handoff.close();
      await surface.close();
    }
  }
  await writeFile(
    'evidence/offline/index.json',
    JSON.stringify(
      {
        kind: 'authored_fixture_replay',
        note: 'These are real browser replay runs of an authored fixture. No LLM discovery is claimed.',
        runs,
      },
      null,
      2,
    ) + '\n',
  );
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
