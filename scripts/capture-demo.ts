// Real browser captures of the synthetic sandbox. Never use with customer data.
import assert from 'node:assert/strict';
import { parseArgs } from 'node:util';
import { Artifact } from '../src/schema.js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { startDemo } from '../src/demo-app.js';
import { BrowserSurface } from '../src/surface.js';
import { Runner } from '../src/engine.js';
import { Evidence } from '../src/evidence.js';
import { compileTenant, TenantSurface } from '../src/tenant.js';
import { contentHash } from '../src/profile.js';
import { fixture, loadProfile } from './fixtures.js';

const { values } = parseArgs({
  options: {
    artifact: { type: 'string' },
    evidence: { type: 'string', default: 'runs/presentation' },
  },
});
const destination = 'docs/assets/demo';
await mkdir(destination, { recursive: true });
const server = await startDemo(0);
const profile = await loadProfile(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
const artifact = values.artifact
  ? Artifact.parse(JSON.parse(await readFile(values.artifact, 'utf8')))
  : await fixture(profile);
const binding = compileTenant(
  profile,
  JSON.parse(await readFile('config/tenants/harbor.json', 'utf8')),
);
const captures: Record<string, unknown>[] = [];
try {
  for (const scenario of ['normal', 'wrong-member', 'harbor', 'expired']) {
    const evidence = new Evidence(values.evidence);
    const browser = new BrowserSurface(
      scenario === 'harbor' ? binding.effective : profile,
      evidence,
    );
    const surface = scenario === 'harbor' ? new TenantSurface(browser, binding) : browser;
    const runner = new Runner(surface, evidence, scenario === 'expired', 15_000);
    const capture = async (name: string) => {
      await browser.page.screenshot({ path: join(destination, `${name}.png`) });
    };
    try {
      await browser.launch(
        false,
        scenario === 'harbor' ? 'normal' : scenario,
        scenario === 'harbor' ? 'harbor' : 'base',
      );
      if (scenario === 'normal') {
        const act = browser.act.bind(browser);
        browser.act = async (...args) => {
          const result = await act(...args);
          const action = args[0];
          if (action.type === 'fill') await capture('01-search');
          if (action.type === 'click' && action.target === 'search') await capture('02-results');
          return result;
        };
      }
      await runner.handoff.start();
      const originalPage = browser.page;
      const pending = runner.replay(artifact, {
        memberId: scenario === 'harbor' ? '67890' : '12345',
      });
      if (scenario === 'expired') {
        for (let i = 0; i < 100 && !runner.handoff.pending; i++)
          await new Promise((resolve) => setTimeout(resolve, 50));
        assert.ok(runner.handoff.pending, 'Expected a real handoff request');
        await capture('06-session-expired');
        // Separate context for the actual operator console; no runtime policy bypass.
        const operator = await browser.browser.newPage({ viewport: { width: 1200, height: 850 } });
        await operator.goto(runner.handoff.url!);
        await operator.screenshot({ path: join(destination, '07-operator-handoff.png') });
        await operator.getByRole('button', { name: 'Take control', exact: true }).click();
        await browser.page
          .frameLocator(profile.frame)
          .getByRole('button', { name: 'Restore training session' })
          .click();
        await browser.locator('complete').waitFor({ state: 'visible' });
        await operator.getByRole('button', { name: 'Return control', exact: true }).click();
        await operator.close();
      }
      const result = await pending;
      assert.equal(browser.page, originalPage);
      if (scenario === 'wrong-member') {
        assert.equal(result.status, 'failure');
        assert.ok(result.status === 'failure' && result.code === 'ENTITY_MISMATCH');
        await capture('05-wrong-member');
      } else {
        assert.equal(result.status, 'success');
        await capture(
          scenario === 'normal'
            ? '03-verified-result'
            : scenario === 'harbor'
              ? '04-harbor'
              : '08-resumed',
        );
      }
      const events = (await readFile(join(evidence.dir, 'events.jsonl'), 'utf8'))
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      assert.equal(events.filter((e) => e.type === 'model_response').length, 0);
      captures.push({
        scenario,
        result: result.status === 'success' ? 'success' : result.code,
        artifactHash: contentHash(artifact),
        modelCalls: 0,
        runId: evidence.runId,
        operator:
          scenario === 'expired' ? 'scripted operator simulation on the same live page' : undefined,
      });
    } finally {
      await runner.handoff.close();
      await browser.close();
    }
  }
  await writeFile(
    join(destination, 'capture-manifest.json'),
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        source: 'actual Playwright browser screenshots',
        data: 'synthetic training records only',
        capability: artifact.provenance.kind,
        sourceRunId: artifact.provenance.runId,
        captures,
      },
      null,
      2,
    ) + '\n',
  );
  console.log('Captured eight real browser screenshots; all four scenarios verified.');
} finally {
  server.close();
}
