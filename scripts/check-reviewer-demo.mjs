import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser = await chromium.launch({
  channel: process.env.BROWSER_CHANNEL || undefined,
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
const errors = [];
const external = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('request', (request) => {
  if (!request.url().startsWith('http://127.0.0.1:4174/')) external.push(request.url());
});
try {
  await page.goto('http://127.0.0.1:4174/');
  await page.getByRole('button', { name: 'Live AI discovery', exact: true }).click();
  assert.ok(await page.getByText('API token unavailable', { exact: true }).isVisible());
  assert.ok(await page.locator('#run').isDisabled());
  await page.locator('#back-demo').click();
  const run = async (scenario, member = '12345', tenant = 'base') => {
    await page.locator('#reset').click();
    await page.locator('#tenant').selectOption(tenant);
    await page.locator('#member').selectOption(member);
    await page.locator('#scenario').selectOption(scenario);
    await page.locator('#run').click();
  };
  await run('normal');
  await page.waitForFunction(
    () => document.querySelector('#run-status').textContent === 'Verified result',
  );
  assert.match(await page.locator('#outcome').textContent(), /4,250.75 USD/);
  await page.screenshot({ path: 'tmp/interactive-demo-desktop.png', fullPage: true });
  await run('normal', '67890', 'harbor');
  await page.waitForFunction(
    () => document.querySelector('#run-status').textContent === 'Verified result',
  );
  assert.match(await page.locator('#outcome').textContent(), /812.30 USD/);
  await run('wrong-member');
  await page.waitForFunction(() =>
    document.querySelector('#outcome').textContent.includes('ENTITY_MISMATCH'),
  );
  assert.equal(await page.locator('#identity-check').textContent(), '×');
  assert.equal(await page.locator('#screen-check').textContent(), '✓');
  await run('normal', '99999');
  await page.waitForFunction(() =>
    document.querySelector('#outcome').textContent.includes('MEMBER_NOT_FOUND'),
  );
  await run('denied');
  await page.waitForFunction(() =>
    document.querySelector('#outcome').textContent.includes('PERMISSION_DENIED'),
  );
  await run('transient');
  await page.waitForFunction(
    () => document.querySelector('#run-status').textContent === 'Verified result',
  );
  assert.match(await page.locator('#trace').textContent(), /retry 1 of 2/);
  await run('expired');
  await page.locator('#take').waitFor({ state: 'visible' });
  await page.locator('#take').click();
  assert.equal(await page.locator('#ownership').textContent(), 'Control: human');
  await page.locator('#restore').click();
  await page.locator('#resume').click();
  assert.equal(await page.locator('#run-status').textContent(), 'Verified result');
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#download').click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const report = JSON.parse(Buffer.concat(chunks).toString());
  assert.equal(report.kind, 'interactive_simulation');
  assert.equal(report.isExecutionEvidence, false);
  await run('expired');
  await page.locator('#abort').waitFor({ state: 'visible' });
  await page.locator('#abort').click();
  assert.match(await page.locator('#outcome').textContent(), /INTERVENTION_ABORTED/);
  await run('normal');
  await page.locator('#reset').click();
  await page.waitForTimeout(1300);
  assert.equal(await page.locator('#run-status').textContent(), 'Ready to run');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'tmp/interactive-demo-mobile.png', fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  console.log(
    'PASS: normal, tenant change, missing member, mismatch, denial, recovery, handoff/resume, abort, reset, trace download, token-unavailable, mobile layout; zero external requests.',
  );
} finally {
  await browser.close();
}
