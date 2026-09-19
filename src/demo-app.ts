import { createServer, type Server } from 'node:http';
import { pathToFileURL } from 'node:url';

const members: Record<string, { name: string; balance: string }> = {
  '12345': { name: 'Jordan Example', balance: '4250.75' },
  '67890': { name: 'Taylor Sample', balance: '812.30' },
};
const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
const style = `*{box-sizing:border-box}body{margin:0;background:#f4f6fa;color:#14233a;font:16px system-ui,sans-serif}header{background:#142b42;color:white;padding:24px 36px;display:flex;justify-content:space-between;align-items:center}header strong{font-size:24px;letter-spacing:-.7px}header small{color:#a8c2da}main{padding:32px;max-width:1100px;margin:auto}h1{font-size:28px;margin:0 0 12px}h2{font-size:22px}p{line-height:1.6;color:#53647a}.card{background:white;border:1px solid #d8e0eb;border-radius:12px;padding:28px;margin:20px 0}label{display:block;font-size:14px;font-weight:600;margin-bottom:8px}input{padding:12px;border:1px solid #a9b8ca;border-radius:6px;font:inherit;width:280px}button,.button{display:inline-block;border:0;background:#176c64;color:white;padding:13px 20px;border-radius:6px;font:600 14px system-ui;cursor:pointer;text-decoration:none;margin:8px 0}a{color:#156c67}table{border-collapse:collapse;width:100%}td,th{text-align:left;padding:16px;border-bottom:1px solid #e1e7ef}th{font-size:12px;color:#617087;text-transform:uppercase}iframe{width:100%;height:650px;border:0;background:#f4f6fa}.badge{font-size:12px;border:1px solid #7895ae;border-radius:20px;padding:7px 12px}.amount{font-size:40px;font-weight:650;letter-spacing:-1px}.warning{border-left:4px solid #b97615}.muted{font-size:12px;color:#6c7b90}.danger{background:#9d3434}`;
const html = (body: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>LedgerDesk | Sandbox</title><style>${style}</style></head><body>${body}</body></html>`;
const frame = (body: string) =>
  html(
    `<main>${body}<p class="muted">Training environment · All records are synthetic · No real transactions</p></main>`,
  );
// Independent presentation variant. These UI strings are deliberately not loaded
// from the automation profile: a broken binding must be observable in tests.
const harborLabels: [string, string][] = [
  ['LedgerDesk / release 1', 'LedgerDesk / release 1 - Harbor CU'],
  ['Account workspace', 'Client workspace'],
  ['Member search', 'Client directory'],
  ['Member ID', 'Client number'],
  ['Find member', 'Find client'],
  ['Search results', 'Matching clients'],
  ['Open member', 'View client'],
  ['Member overview', 'Client overview'],
  ['Savings account details', 'Savings summary'],
  ['Savings account', 'Deposit account'],
  ['Available balance', 'Available funds'],
  ['Currency', 'Account currency'],
  ['Member reference', 'Client reference'],
  ['No matching member', 'No matching client'],
];
export async function startDemo(port = 4173): Promise<Server> {
  const server = createServer((req, res) => {
    const u = new URL(req.url ?? '/', 'http://127.0.0.1');
    const cookies = Object.fromEntries(
      (req.headers.cookie ?? '').split(';').map((v) => v.trim().split('=')),
    );
    const scenario = cookies['scenario'] ?? 'normal';
    const tenant = cookies['demo_tenant'] ?? 'base';
    const memberId = u.searchParams.get('memberId') ?? '';
    const q = `memberId=${encodeURIComponent(memberId)}`;
    const send = (body: string, status = 200) => {
      if (tenant === 'harbor') {
        for (const [from, to] of harborLabels) body = body.replaceAll(from, to);
        body = body
          .replace('>LedgerDesk</strong>', '>Harbor Credit Union</strong>')
          .replace(
            '</style>',
            'header{background:#3a284e}.card{border-radius:2px;border-left:5px solid #73558f}table td{padding:23px}button{background:#654681}</style>',
          );
      }
      res.writeHead(status, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Security-Policy':
          "default-src 'self'; style-src 'unsafe-inline'; frame-src 'self'; form-action 'self'; script-src 'none'; base-uri 'none'",
      });
      res.end(body);
    };
    // Manual preview endpoints are deliberately outside the automation allowlist.
    if (u.pathname === '/preview/base' || u.pathname === '/preview/harbor') {
      res.writeHead(303, {
        'Set-Cookie': `demo_tenant=${u.pathname.endsWith('harbor') ? 'harbor' : 'base'}; SameSite=Strict; Path=/`,
        Location: '/app',
      });
      return res.end();
    }
    if (u.pathname === '/app')
      return send(
        html(
          `<header><strong>LedgerDesk</strong><span class="badge">SANDBOX / OPERATIONS</span><small>LedgerDesk / release 1</small></header><iframe title="Account workspace" src="/legacy/search"></iframe>`,
        ),
      );
    if (u.pathname === '/legacy/restore' && req.method === 'POST') {
      res.writeHead(303, {
        'Set-Cookie': 'restored=yes; HttpOnly; SameSite=Strict; Path=/',
        Location: `/legacy/accounts?${q}`,
      });
      return res.end();
    }
    if (u.pathname === '/legacy/search') {
      let results = '';
      if (u.searchParams.has('memberId')) {
        if (!/^\d{5}$/.test(memberId))
          results = '<div role="alert">Enter a five-digit member ID</div>';
        else if (!members[memberId]) results = '<div role="status">No matching member</div>';
        else if (scenario === 'transient' && cookies['retried'] !== 'yes') {
          res.setHeader('Set-Cookie', 'retried=yes; HttpOnly; SameSite=Strict; Path=/');
          results = `<div role="alert">Service temporarily unavailable</div><a href="/legacy/search?${q}">Retry lookup</a>`;
        } else if (scenario === 'persistent')
          results = `<div role="alert">Service temporarily unavailable</div><a href="/legacy/search?${q}">Retry lookup</a>`;
        else
          results = `<h2>Search results</h2><table><tr><th>Member</th><th>Reference</th><th>Action</th></tr><tr><td data-private>${esc(members[memberId]!.name)}</td><td data-private>${esc(memberId)}</td><td><a href="/legacy/member?${q}">Open member</a></td></tr></table>`;
      }
      return send(
        frame(
          `<h1>Member search</h1><p>Find a member to review their accounts.</p><div class="card"><form action="/legacy/search" method="get"><label for="member">Member ID</label><input id="member" name="memberId" autocomplete="off" value="${esc(memberId)}"><br><button>Find member</button></form></div><div class="card">${results || '<p>Search results will appear here.</p>'}</div>`,
        ),
      );
    }
    if (!members[memberId])
      return send(frame('<h1>Record unavailable</h1><p role="status">No matching member</p>'), 404);
    if (u.pathname === '/legacy/member')
      return send(
        frame(
          `<h1>Member overview</h1><p data-private>${esc(members[memberId]!.name)} · ${esc(memberId)}</p><div class="card"><table><tr><th>Account type</th><th>Status</th></tr><tr><td><a href="/legacy/accounts?${q}">Savings account</a>${scenario === 'ambiguous' ? `<a href="/legacy/accounts?${q}">Savings account</a>` : ''}</td><td>Active</td></tr></table></div>`,
        ),
      );
    if (u.pathname === '/legacy/accounts') {
      if (scenario === 'expired' && cookies['restored'] !== 'yes')
        return send(
          frame(
            `<div class="card warning"><h1>Session expired</h1><p>A human operator must restore this training session.</p><form method="post" action="/legacy/restore?${q}"><button>Restore training session</button></form></div>`,
          ),
        );
      if (scenario === 'denied')
        return send(
          frame(
            '<h1>Permission denied</h1><p role="alert">This operator cannot view this account.</p>',
          ),
          403,
        );
      if (scenario === 'unexpected')
        return send(
          frame('<h1>Unexpected confirmation</h1><p>The application requires manual review.</p>'),
        );
      const displayedId =
        scenario === 'wrong-member' ? (memberId === '12345' ? '67890' : '12345') : memberId;
      const displayedBalance =
        scenario === 'malformed-output' ? 'unavailable' : members[displayedId]!.balance;
      return send(
        frame(
          `<h1>Savings account details</h1><p>Member <span aria-label="Member reference" data-private>${esc(displayedId)}</span></p><div class="card"><p>Available balance</p><span class="amount" aria-label="Available balance" data-private>${displayedBalance}</span> <span aria-label="Currency">USD</span><p>Account status: Active</p></div><button class="danger" type="button">Transfer funds</button><p class="muted">Transfers are disabled in this sandbox.</p>`,
        ),
      );
    }
    send(frame('<h1>Page not found</h1>'), 404);
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 4173);
  await startDemo(port);
  console.log(`LedgerDesk sandbox: http://127.0.0.1:${port}/app`);
}
