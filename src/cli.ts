import { parseArgs } from 'node:util';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';
import { Profile } from './profile.js';
import { Artifact, RunError } from './schema.js';
import { Evidence } from './evidence.js';
import { BrowserSurface } from './surface.js';
import { Runner } from './engine.js';
import { compileTenant, TenantSurface } from './tenant.js';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    profile: { type: 'string', default: 'config/demo-profile.json' },
    contract: { type: 'string', default: 'config/lookup-contract.json' },
    artifact: { type: 'string', default: 'artifacts/lookup-savings.json' },
    inputs: { type: 'string', default: '{"memberId":"12345"}' },
    goal: {
      type: 'string',
      default: 'Look up the supplied member and read their available savings balance and currency.',
    },
    target: { type: 'string' },
    tenant: { type: 'string' },
    evidence: { type: 'string', default: 'runs' },
    scenario: { type: 'string', default: 'normal' },
    headed: { type: 'boolean', default: false },
    human: { type: 'boolean', default: false },
    'show-outputs': { type: 'boolean', default: false },
  },
});
let surface: BrowserSurface | undefined;
let runner: Runner | undefined;
try {
  const mode = positionals[0];
  if (!['discover', 'replay'].includes(mode ?? ''))
    throw new RunError('USAGE', 'Use discover or replay');
  const profile = Profile.parse(JSON.parse(await readFile(values.profile, 'utf8')));
  if (values.target) profile.origin = new URL(values.target).origin;
  const inputs = z
    .record(z.string(), z.union([z.string(), z.number()]))
    .parse(JSON.parse(values.inputs));
  const evidence = new Evidence(values.evidence, Object.values(inputs));
  const binding = values.tenant
    ? compileTenant(profile, JSON.parse(await readFile(values.tenant, 'utf8')))
    : undefined;
  surface = new BrowserSurface(binding?.effective ?? profile, evidence);
  const planner =
    mode === 'discover' ? new (await import('./planner.js')).ApiPlanner(evidence) : undefined;
  await surface.launch(values.headed || values.human, values.scenario, binding?.overlay.id);
  runner = new Runner(
    binding ? new TenantSurface(surface, binding) : surface,
    evidence,
    values.human,
  );
  await runner.handoff.start();
  let result;
  if (mode === 'discover') {
    const contract = Artifact.pick({
      name: true,
      description: true,
      inputs: true,
      outputs: true,
    }).parse(JSON.parse(await readFile(values.contract, 'utf8')));
    const discovered = await runner.discover(values.goal, contract, inputs, planner!);
    result = discovered.result;
    if (discovered.artifact) {
      await mkdir(dirname(values.artifact), { recursive: true });
      await writeFile(values.artifact, JSON.stringify(discovered.artifact, null, 2) + '\n');
      console.log(`Capability saved: ${values.artifact}`);
    }
  } else result = await runner.replay(JSON.parse(await readFile(values.artifact, 'utf8')), inputs);
  const displayed = JSON.stringify(
    values['show-outputs'] ? result : evidence.sanitize(result),
    null,
    2,
  );
  console.log(displayed);
  console.log(`Evidence: ${evidence.dir}`);
  process.exitCode = result.status === 'failure' ? 1 : 0;
} catch (error) {
  console.error(
    error instanceof RunError
      ? `${error.code}: ${error.message}`
      : 'Configuration or startup failed. Check file paths, browser installation, and local app availability.',
  );
  process.exitCode = 1;
} finally {
  await runner?.handoff.close();
  await surface?.close();
}
