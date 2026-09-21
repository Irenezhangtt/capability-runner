// Genuine API discovery followed by replay of the exact discovered capability.
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { startDemo } from '../src/demo-app.js';
import { ApiPlanner } from '../src/planner.js';
import { BrowserSurface } from '../src/surface.js';
import { Evidence } from '../src/evidence.js';
import { Runner } from '../src/engine.js';
import { Artifact, RunError } from '../src/schema.js';
import { contentHash } from '../src/profile.js';
import { loadProfile } from './fixtures.js';

const root = 'evidence/live';
const evidence = new Evidence(root, ['12345']);
// Validate credentials before starting a browser or writing a run.
const planner = new ApiPlanner(evidence);
const server = await startDemo(0);
const profile = await loadProfile(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
const surface = new BrowserSurface(profile, evidence);
const runner = new Runner(surface, evidence);
const contract = Artifact.pick({
  name: true,
  description: true,
  inputs: true,
  outputs: true,
}).parse(JSON.parse(await readFile('config/lookup-contract.json', 'utf8')));
let artifactPath: string;
try {
  await surface.launch();
  const { result, artifact } = await runner.discover(
    'Look up the supplied member and read their available savings balance and currency.',
    contract,
    { memberId: '12345' },
    planner,
  );
  if (!artifact || result.status !== 'success')
    throw new RunError(
      'LIVE_VALIDATION_FAILED',
      'Discovery did not complete; inspect redacted evidence',
    );
  artifactPath = join(evidence.dir, 'artifact.json');
  await mkdir('artifacts', { recursive: true });
  await writeFile('artifacts/lookup-savings.json', JSON.stringify(artifact, null, 2) + '\n');
  const saved = Artifact.parse(JSON.parse(await readFile(artifactPath, 'utf8')));
  if (contentHash(saved) !== contentHash(artifact))
    throw new RunError(
      'ARTIFACT_MISMATCH',
      'Saved discovery artifact does not match the recorded capability',
    );
  console.log('Genuine discovery succeeded. Verifying replay with all model credentials removed.');
} finally {
  await runner.handoff.close();
  await surface.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
// A fresh process receives no model key or model configuration during replay.
const replayEnv = { ...process.env };
for (const key of Object.keys(replayEnv))
  if (key.startsWith('LLM_') || /^(OPENAI|ANTHROPIC)_/.test(key)) delete replayEnv[key];
const code = await new Promise<number>((resolve, reject) => {
  const child = spawn(
    process.execPath,
    [
      '--import',
      'tsx',
      'scripts/assurance-lab.ts',
      '--artifact',
      artifactPath,
      '--output',
      join(root, 'replay-corpus'),
    ],
    { env: replayEnv, stdio: 'inherit' },
  );
  child.on('error', reject);
  child.on('exit', (value) => resolve(value ?? 1));
});
if (code !== 0)
  throw new RunError('LIVE_REPLAY_FAILED', 'Discovered capability failed the replay corpus');
console.log(
  'Live validation complete: genuine discovery and 15 replay scenarios saved under evidence/live.',
);
