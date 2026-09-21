import { parseArgs } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { startDemo } from '../src/demo-app.js';
import { Artifact, type RunResult } from '../src/schema.js';
import { contentHash } from '../src/profile.js';
import { compileTenant, TenantSurface } from '../src/tenant.js';
import { BrowserSurface } from '../src/surface.js';
import { Runner } from '../src/engine.js';
import { Evidence } from '../src/evidence.js';
import { fixture, loadProfile } from './fixtures.js';

const { values } = parseArgs({
  options: {
    artifact: { type: 'string' },
    output: { type: 'string', default: 'evidence/assurance' },
  },
});
const server = await startDemo(0);
const profile = await loadProfile(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
const artifact = values.artifact
  ? Artifact.parse(JSON.parse(await readFile(values.artifact, 'utf8')))
  : await fixture(profile);
const overlay = JSON.parse(await readFile('config/tenants/harbor.json', 'utf8'));
const binding = compileTenant(profile, overlay);
const artifactHash = contentHash(artifact);
type Case = {
  name: string;
  tenant: 'base' | 'harbor';
  scenario: string;
  input: string;
  expected: string;
  bind?: boolean;
  balance?: number;
};
const cases: Case[] = [
  {
    name: 'Base lookup',
    tenant: 'base',
    scenario: 'normal',
    input: '12345',
    expected: 'success',
    balance: 4250.75,
  },
  {
    name: 'Changed input',
    tenant: 'base',
    scenario: 'normal',
    input: '67890',
    expected: 'success',
    balance: 812.3,
  },
  {
    name: 'Member absent',
    tenant: 'base',
    scenario: 'normal',
    input: '99999',
    expected: 'MEMBER_NOT_FOUND',
  },
  {
    name: 'Invalid identifier',
    tenant: 'base',
    scenario: 'normal',
    input: 'abc',
    expected: 'INVALID_MEMBER_ID',
  },
  {
    name: 'Transient recovery',
    tenant: 'base',
    scenario: 'transient',
    input: '12345',
    expected: 'success',
    balance: 4250.75,
  },
  {
    name: 'Retry budget exhausted',
    tenant: 'base',
    scenario: 'persistent',
    input: '12345',
    expected: 'RECOVERY_EXHAUSTED',
  },
  {
    name: 'Permission denial',
    tenant: 'base',
    scenario: 'denied',
    input: '12345',
    expected: 'PERMISSION_DENIED',
  },
  {
    name: 'Session requires operator',
    tenant: 'base',
    scenario: 'expired',
    input: '12345',
    expected: 'INTERVENTION_REQUIRED',
  },
  {
    name: 'Correct screen, wrong member',
    tenant: 'base',
    scenario: 'wrong-member',
    input: '12345',
    expected: 'ENTITY_MISMATCH',
  },
  {
    name: 'Malformed balance',
    tenant: 'base',
    scenario: 'malformed-output',
    input: '12345',
    expected: 'OUTPUT_PARSE_FAILED',
  },
  {
    name: 'Ambiguous control',
    tenant: 'base',
    scenario: 'ambiguous',
    input: '12345',
    expected: 'AMBIGUOUS_TARGET',
  },
  {
    name: 'Harbor with binding',
    tenant: 'harbor',
    bind: true,
    scenario: 'normal',
    input: '67890',
    expected: 'success',
    balance: 812.3,
  },
  {
    name: 'Harbor without binding',
    tenant: 'harbor',
    scenario: 'normal',
    input: '12345',
    expected: 'APP_VERSION_MISMATCH',
  },
  {
    name: 'Harbor wrong member',
    tenant: 'harbor',
    bind: true,
    scenario: 'wrong-member',
    input: '12345',
    expected: 'ENTITY_MISMATCH',
  },
  {
    name: 'Harbor known outcome',
    tenant: 'harbor',
    bind: true,
    scenario: 'normal',
    input: '99999',
    expected: 'MEMBER_NOT_FOUND',
  },
];
type Row = {
  name: string;
  tenant: string;
  expected: string;
  actual: string;
  passed: boolean;
  runId: string;
  screenCheckpointMatched: boolean;
  identityRejected: boolean;
  recoveryActions: number;
  modelCalls: number;
  durationMs: number;
};
const rows: Row[] = [];
await mkdir(values.output, { recursive: true });
await writeFile(join(values.output, 'artifact.json'), JSON.stringify(artifact, null, 2) + '\n');
try {
  for (const c of cases) {
    const evidence = new Evidence(values.output);
    const browser = new BrowserSurface(c.bind ? binding.effective : profile, evidence);
    const surface = c.bind ? new TenantSurface(browser, binding) : browser;
    const runner = new Runner(surface, evidence);
    try {
      await browser.launch(false, c.scenario, c.tenant);
      const start = performance.now();
      const result: RunResult = await runner.replay(artifact, { memberId: c.input });
      const durationMs = Math.round(performance.now() - start);
      const events = (await readFile(join(evidence.dir, 'events.jsonl'), 'utf8'))
        .trim()
        .split('\n')
        .map((s) => JSON.parse(s));
      const actual = result.status === 'success' ? 'success' : result.code;
      const passed =
        actual === c.expected &&
        contentHash(artifact) === artifactHash &&
        (result.status !== 'success' ||
          (result.outputs.balance === c.balance && result.outputs.currency === 'USD'));
      const row: Row = {
        name: c.name,
        tenant: c.tenant,
        expected: c.expected,
        actual,
        passed,
        runId: evidence.runId,
        screenCheckpointMatched: await surface
          .check(profile.success.target, profile.success.text)
          .catch(() => false),
        identityRejected: events.some(
          (e) => e.type === 'postcondition_checked' && e.passed === false,
        ),
        recoveryActions: events.filter((e) => e.type === 'recovery_action').length,
        modelCalls: events.filter((e) => e.type === 'model_response').length,
        durationMs,
      };
      rows.push(row);
      console.log(`${passed ? 'PASS' : 'FAIL'} | ${c.name} | ${actual}`);
    } finally {
      await runner.handoff.close();
      await browser.close();
    }
  }
  const passed = rows.filter((r) => r.passed).length;
  const counterexamples = rows.filter(
    (r) => r.screenCheckpointMatched && r.identityRejected,
  ).length;
  const report = {
    schemaVersion: '1.0',
    generatedAt: new Date().toISOString(),
    sourceKind: artifact.provenance.kind,
    artifactHash,
    tenantBindingHash: binding.hash,
    summary: {
      cases: rows.length,
      passed,
      modelCalls: rows.reduce((n, r) => n + r.modelCalls, 0),
      screenOnlyFalseSuccessCounterexamples: counterexamples,
    },
    limitations: [
      'Synthetic deterministic scenarios, not a statistical estimate of production reliability.',
      artifact.provenance.kind === 'llm_discovery'
        ? 'One genuine discovery run does not establish model reliability across other goals or applications.'
        : 'Authored fixture runs do not satisfy the genuine LLM discovery requirement.',
      'Tenant labels still require semantic review; a constrained overlay does not prove a label identifies a safe business action.',
    ],
    rows,
  };
  await writeFile(join(values.output, 'index.json'), JSON.stringify(report, null, 2) + '\n');
  const lines = [
    '# Capability Assurance Lab',
    '',
    `**${passed}/${rows.length} expected behaviors verified · ${report.summary.modelCalls} model calls during replay · one unchanged capability across two tenant presentations.**`,
    '',
    `Source: \`${artifact.provenance.kind}\`. Capability content hash: \`${artifactHash}\`. This is a fault-corpus result, not a production success-rate claim.`,
    '',
    '## The counterexample that matters',
    '',
    `In ${counterexamples} cases, the expected account screen was visible but the displayed member was wrong. A heading-only success check would have accepted that state. Input-bound identity postconditions rejected it before balance extraction. Raw member values remain inside the browser adapter.`,
    '',
    '## Reproduction',
    '',
    'Run `npm run demo:assurance`. To assess a real discovered capability, run `npm run demo:assurance -- --artifact artifacts/lookup-savings.json`.',
    '',
    '| Case | Tenant | Observed result | Expected behavior verified | Model calls | Evidence |',
    '| --- | --- | --- | --- | ---: | --- |',
    ...rows.map(
      (r) =>
        `| ${r.name} | ${r.tenant} | \`${r.actual}\` | ${r.passed ? 'Yes' : 'No'} | ${r.modelCalls} | [run](${r.runId}/events.jsonl) |`,
    ),
    '',
    '## What the experiment supports',
    '',
    '- One artifact runs unchanged on both presentations when an explicit compatible binding is supplied.',
    '- An unbound tenant fails closed. Duplicate controls are rejected, rather than selecting the first match.',
    '- Business outcomes are separate from operational failures; known recovery is bounded.',
    '- The same entity-identity invariant protects both tenant presentations.',
    '',
    '## What it does not establish',
    '',
    ...report.limitations.map((s) => `- ${s}`),
    '',
    'See [machine-readable results](index.json) and [the unchanged capability](artifact.json). Per-case timings are local diagnostics, not comparable performance benchmarks.',
    '',
  ];
  await writeFile(join(values.output, 'SUMMARY.md'), lines.join('\n'));
  if (passed !== rows.length) process.exitCode = 1;
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
