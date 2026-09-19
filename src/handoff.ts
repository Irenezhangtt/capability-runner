import { createServer, type Server } from 'node:http';
import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { ManagedSurface } from './surface.js';
import { RunError } from './schema.js';

export type Intervention = {step:string; code:string; capability:string; expected:string};
export class Handoff {
  server?: Server;
  url?: string;
  pending?: Intervention;
  private token = randomBytes(24).toString('hex');
  private finish?: (resume: boolean) => void;
  constructor(private surface: ManagedSurface, private enabled: boolean, private timeoutMs = 300_000) {}
  async start() {
    if (!this.enabled) return;
    this.server = createServer(async (req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      res.setHeader('Cache-Control','no-store');
      res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'");
      res.setHeader('Referrer-Policy','no-referrer');
      if (url.searchParams.get('token') !== this.token) { res.writeHead(403).end('Forbidden'); return; }
      const action = url.pathname;
      if (req.method === 'POST' && this.pending) {
        // Loopback-only plus per-run nonce; no ambient-cookie authorization.
        if (action === '/take' && this.surface.owner === 'paused') {
          this.surface.owner = 'human';
          await this.surface.evidence.event('control_transferred', {from:'paused',to:'human',step:this.pending.step});
        } else if (action === '/resume' && this.surface.owner === 'human') {
          this.surface.owner = 'paused';
          await this.surface.evidence.event('human_returned_control', {step:this.pending.step});
          this.finish?.(true);
        } else if (action === '/abort') this.finish?.(false);
        else { res.writeHead(409).end('Invalid control transition'); return; }
        res.writeHead(303,{Location:`/?token=${this.token}`}).end();
        return;
      }
      if (req.method !== 'GET' || action !== '/') { res.writeHead(404).end(); return; }
      const pending = this.pending;
      const context = pending ? `<dt>Capability</dt><dd>${safe(pending.capability)}</dd><dt>Step</dt><dd>${safe(pending.step)}</dd><dt>Reason</dt><dd>${safe(pending.code)}</dd><dt>Expected</dt><dd>${safe(pending.expected)}</dd>` : '<p>No intervention is pending. Refresh to check for requests.</p>';
      const form = (path: string, label: string) => `<form method="post" action="/${path}?token=${this.token}"><button>${label}</button></form>`;
      res.setHeader('Content-Type','text/html; charset=utf-8');
      res.end(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Capability Runner | Operator</title><style>body{font:16px system-ui;background:#f3f6fa;color:#193149;max-width:760px;margin:60px auto;padding:24px}section{background:white;border:1px solid #dce4ef;padding:28px;border-radius:12px}dt{color:#61758a;font-size:13px;margin-top:18px}dd{margin:5px 0}button{padding:12px 18px;background:#126b61;color:white;border:0;border-radius:6px;cursor:pointer}form{display:inline-block;margin:8px}p{line-height:1.6}</style><h1>Operator handoff</h1><section><strong>Control owner: ${this.surface.owner}</strong><dl>${context}</dl><p>Take control, operate the existing LedgerDesk browser window, then return control. For an expired training session, click “Restore training session” inside that window. The runner will verify the expected checkpoint before continuing.</p>${pending && this.surface.owner === 'paused' ? form('take','Take control') : ''}${pending && this.surface.owner === 'human' ? form('resume','Return control') : ''}${pending ? form('abort','Abort run') : ''}<p><a href="/?token=${this.token}">Refresh status</a></p></section></html>`);
    });
    await new Promise<void>(resolve => this.server!.listen(0,'127.0.0.1',resolve));
    const port = (this.server.address() as AddressInfo).port;
    this.url = `http://127.0.0.1:${port}/?token=${this.token}`;
  }
  async request(request: Intervention, restored: () => Promise<boolean>) {
    this.surface.owner = 'paused';
    const evidence = await this.surface.failureEvidence();
    await this.surface.evidence.event('intervention_requested', {...request,evidence});
    if (!this.enabled) throw new RunError('INTERVENTION_REQUIRED', 'Rerun headed with --human for live session handoff');
    this.pending = request;
    console.log(`Intervention required (${request.code}). Operator console: ${this.url}`);
    const resume = await new Promise<boolean>(resolve => {
      const timer = setTimeout(() => resolve(false), this.timeoutMs);
      this.finish = value => { clearTimeout(timer); resolve(value); };
    });
    this.finish = undefined;
    this.pending = undefined;
    if (!resume) throw new RunError('INTERVENTION_ABORTED', 'Operator aborted or handoff timed out');
    // A human can return control while the final navigation is still settling.
    const deadline = Date.now()+2500;
    let verified = false;
    while (Date.now() < deadline) {
      if (await restored()) { verified = true; break; }
      await new Promise(r => setTimeout(r,100));
    }
    if (!verified) throw new RunError('RESUME_CHECK_FAILED', 'Operator returned control outside the expected state');
    this.surface.owner = 'automation';
    await this.surface.evidence.event('control_transferred', {from:'human',to:'automation',step:request.step});
  }
  async close() {
    this.finish?.(false);
    if (this.server) await new Promise<void>(resolve => this.server!.close(() => resolve()));
  }
}
function safe(s: string) { return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!)); }
