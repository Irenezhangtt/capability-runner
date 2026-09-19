import { chromium, type Browser, type BrowserContext, type Page, type Locator } from 'playwright';
import { join } from 'node:path';
import { Policy, type AppProfile } from './profile.js';
import { type ActionSpec, type Capability, RunError } from './schema.js';
import { Evidence } from './evidence.js';

export interface Surface {
  observe(): Promise<{ screen: string; visibleTargets: string[] }>;
  act(
    action: ActionSpec,
    inputs: Record<string, unknown>,
    outputs: Capability['outputs'],
  ): Promise<string | number | undefined>;
  visible(target: string): Promise<boolean>;
  check(target: string, text: string): Promise<boolean>;
  matchesInput(target: string, value: string | number): Promise<boolean>;
  failureEvidence(): Promise<string>;
}
export interface ManagedSurface extends Surface {
  profile: AppProfile;
  evidence: Evidence;
  owner: 'automation' | 'paused' | 'human';
  healthy(): Promise<void>;
}

export class BrowserSurface implements ManagedSurface {
  browser!: Browser;
  context!: BrowserContext;
  page!: Page;
  owner: 'automation' | 'paused' | 'human' = 'automation';
  private violation?: string;
  readonly policy: Policy;
  constructor(
    readonly profile: AppProfile,
    readonly evidence: Evidence,
  ) {
    this.policy = new Policy(profile);
  }
  async launch(headed = false, scenario = 'normal', tenant = 'base') {
    this.browser = await chromium.launch({
      headless: !headed,
      channel: process.env.BROWSER_CHANNEL || undefined,
    });
    this.context = await this.browser.newContext({
      viewport: { width: 1200, height: 850 },
      serviceWorkers: 'block',
      acceptDownloads: false,
    });
    // Enforce navigation and network boundaries before any request is sent.
    await this.context.route('**/*', async (route) => {
      try {
        this.policy.url(route.request().url());
        if (
          !['GET', 'HEAD'].includes(route.request().method()) &&
          !(this.owner === 'human' && new URL(route.request().url()).pathname === '/legacy/restore')
        ) {
          throw new RunError('POLICY_BLOCKED', 'Write requests are disabled');
        }
        await route.continue();
      } catch {
        this.violation = 'POLICY_BLOCKED';
        await route.abort('blockedbyclient');
      }
    });
    await this.context.routeWebSocket('**/*', (socket) => socket.close());
    await this.context.addCookies([
      { name: 'scenario', value: scenario, url: this.profile.origin },
    ]);
    await this.context.addCookies([
      { name: 'demo_tenant', value: tenant, url: this.profile.origin },
    ]);
    await this.context.exposeBinding(
      '__auditHuman',
      async (_source, event: { event: string; tag: string; control?: string }) => {
        if (this.owner !== 'human') return;
        const controls = Object.values(this.profile.targets)
          .map((t) => t.name)
          .concat('Restore training session');
        await this.evidence.event('human_action', {
          event: ['click', 'input', 'change', 'keydown'].includes(event.event)
            ? event.event
            : 'other',
          tag: /^[A-Z]{1,12}$/.test(event.tag) ? event.tag : 'unknown',
          control: controls.includes(event.control ?? '')
            ? event.control
            : '[unrecognized control]',
          values: '[not captured]',
        });
      },
    );
    await this.context.addInitScript(() => {
      for (const event of ['click', 'input', 'change', 'keydown'])
        document.addEventListener(
          event,
          (e) => {
            const el = e.target as HTMLElement | null;
            if (!el) return;
            const control =
              el.getAttribute('aria-label') ??
              (el instanceof HTMLInputElement
                ? el.labels?.[0]?.textContent
                : el.textContent
              )?.trim();
            const audit = (window as unknown as { __auditHuman: (e: unknown) => Promise<void> })
              .__auditHuman;
            void audit({ event, tag: el.tagName, control }).catch(() => {});
          },
          true,
        );
    });
    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(2500);
    this.page.setDefaultNavigationTimeout(8000);
    this.context.on('page', async (page) => {
      if (page !== this.page) {
        this.violation = 'UNEXPECTED_POPUP';
        await page.close();
      }
    });
    this.page.on('dialog', async (dialog) => {
      this.violation = 'UNEXPECTED_DIALOG';
      await dialog.dismiss();
    });
    this.page.on('download', async (download) => {
      this.violation = 'UNEXPECTED_DOWNLOAD';
      await download.cancel();
    });
  }
  locator(targetId: string): Locator {
    const t = this.profile.targets[targetId];
    if (!t) throw new RunError('UNKNOWN_TARGET', 'Unknown target');
    const root = t.frame ? this.page.frameLocator(t.frame) : this.page;
    if (t.by === 'label') return root.getByLabel(t.name, { exact: true });
    if (t.by === 'text') return root.getByText(t.name, { exact: true });
    return root.getByRole(t.role!, { name: t.name, exact: true });
  }
  async visible(target: string) {
    const l = this.locator(target);
    const count = await l.count();
    if (count > 1) throw new RunError('AMBIGUOUS_TARGET', `Multiple controls match ${target}`);
    return count === 1 && (await l.isVisible());
  }
  async check(target: string, text: string) {
    return (await this.visible(target)) && (await this.locator(target).innerText()).trim() === text;
  }
  async matchesInput(target: string, value: string | number) {
    await this.healthy();
    if (!(await this.visible(target))) return false;
    // Raw entity identifiers never leave this local comparison boundary.
    return (await this.locator(target).innerText()).trim() === String(value);
  }
  async healthy() {
    if (this.violation)
      throw new RunError(this.violation, 'Browser boundary or unexpected UI event stopped the run');
    this.policy.url(this.page.url());
    if (!(await this.page.getByText(this.profile.fingerprint, { exact: true }).isVisible()))
      throw new RunError('APP_VERSION_MISMATCH', 'Expected app fingerprint is absent');
  }
  async observe() {
    await this.healthy();
    const visibleTargets: string[] = [];
    for (const key of Object.keys(this.profile.targets))
      if (await this.visible(key)) visibleTargets.push(key);
    // Only reviewed static labels leave the browser. Arbitrary account text and inputs
    // never enter the model prompt or logs. Full ARIA trees may contain PII.
    const screen = visibleTargets
      .map((key) => `${key}: ${this.profile.targets[key]!.name}`)
      .join('\n');
    return { screen, visibleTargets };
  }
  async act(a: ActionSpec, inputs: Record<string, unknown>, outputs: Capability['outputs']) {
    if (this.owner !== 'automation')
      throw new RunError('CONTROL_NOT_OWNED', 'Automation does not own this session');
    this.policy.action(a);
    if (a.type === 'navigate') {
      await this.page.goto(this.policy.url(a.path), { waitUntil: 'load' });
      await this.healthy();
      return;
    }
    await this.healthy();
    const l = this.locator(a.target);
    if ((await l.count()) > 1)
      throw new RunError('AMBIGUOUS_TARGET', 'Multiple controls match the reviewed target');
    await l.waitFor({ state: 'visible' });
    if ((await l.count()) !== 1)
      throw new RunError('AMBIGUOUS_TARGET', 'Expected exactly one target');
    if (a.type === 'fill') {
      const value = inputs[a.input];
      if (value === undefined) throw new RunError('INVALID_INPUT', 'Undefined input binding');
      await l.fill(String(value));
    } else if (a.type === 'click') {
      const href = await l.getAttribute('href');
      if (href) this.policy.url(href);
      await l.click();
    } else {
      const field = outputs[a.output];
      if (!field || this.profile.outputTargets[a.output] !== a.target)
        throw new RunError('CONTRACT_MISMATCH', 'Invalid output binding');
      const text = (await l.innerText()).trim();
      const value =
        field.type === 'number' ? (/^-?\d+(\.\d+)?$/.test(text) ? Number(text) : NaN) : text;
      if (value === '' || (typeof value === 'number' && !Number.isFinite(value)))
        throw new RunError('OUTPUT_PARSE_FAILED', 'Output does not match its declared type');
      if (field.sensitive) this.evidence.protect(value);
      return value;
    }
    await this.healthy();
  }
  async failureEvidence() {
    await this.evidence.init();
    // A reconstructed DOM diagnostic contains only reviewed labels and presence.
    // It deliberately excludes arbitrary page text, input values, URLs and PII.
    const state = await this.observe().catch(() => ({
      screen: 'Observation unavailable after a boundary failure',
      visibleTargets: [],
    }));
    const controls: unknown[] = [];
    for (const [id, spec] of Object.entries(this.profile.targets)) {
      const locator = this.locator(id);
      const count = await locator.count().catch(() => 0);
      const bounds = count === 1 ? await locator.boundingBox().catch(() => null) : null;
      controls.push({ id, selector: spec, matches: count, bounds });
    }
    await this.evidence.json('failure-dom.json', {
      kind: 'sanitized_dom_snapshot',
      ...state,
      owner: this.owner,
      controls,
    });
    return join(this.evidence.dir, 'failure-dom.json');
  }
  async close() {
    await this.browser?.close();
  }
}
