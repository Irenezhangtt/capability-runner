import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { startDemo } from '../src/demo-app.js';
import { Evidence } from '../src/evidence.js';
import { BrowserSurface } from '../src/surface.js';
import { Runner } from '../src/engine.js';
import type { Planner } from '../src/engine.js';
import type { ActionSpec } from '../src/schema.js';
import { loadProfile, fixture } from './fixture.js';

let server: Server;
let origin: string;
before(async () => { server = await startDemo(0); origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; });
after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });

async function setup(scenario = 'normal',human = false) {
  const profile = await loadProfile(origin);
  const root = await mkdtemp(join(tmpdir(),'capability-browser-'));
  const evidence = new Evidence(root,['12345','67890','99999']);
  const surface = new BrowserSurface(profile,evidence);
  await surface.launch(false,scenario);
  const runner = new Runner(surface,evidence,human,10_000);
  await runner.handoff.start();
  return {profile,evidence,surface,runner,close:async () => {await runner.handoff.close();await surface.close();}};
}
for (const [scenario,id,status,detail] of [
  ['normal','12345','success',4250.75],
  ['normal','67890','success',812.3],
  ['normal','99999','business_outcome','MEMBER_NOT_FOUND'],
  ['normal','abc','business_outcome','INVALID_MEMBER_ID'],
  ['transient','12345','success',4250.75],
  ['persistent','12345','failure','RECOVERY_EXHAUSTED'],
  ['denied','12345','failure','PERMISSION_DENIED'],
  ['expired','12345','failure','INTERVENTION_REQUIRED'],
] as const) test(`browser replay: ${scenario} / ${id}`, async () => {
  const s = await setup(scenario);
  try {
    const result = await s.runner.replay(await fixture(s.profile),{memberId:id});
    assert.equal(result.status,status,JSON.stringify(result));
    if (result.status === 'success') assert.equal(result.outputs.balance,detail);
    else assert.equal(result.code,detail);
    const logs = await readFile(join(s.evidence.dir,'events.jsonl'),'utf8');
    assert.ok(!logs.includes('model_decision'));
    if (scenario === 'transient') assert.ok(logs.includes('recovery_action'));
    for (const secret of ['12345','67890','4250.75','812.3','Jordan Example']) assert.ok(!logs.includes(secret));
  } finally { await s.close(); }
});

test('handoff transfers the same live page, audits manual action and validates resume', async () => {
  const s = await setup('expired',true);
  try {
    const originalPage = s.surface.page;
    const resultPromise = s.runner.replay(await fixture(s.profile),{memberId:'12345'});
    for (let i=0;i<100 && !s.runner.handoff.pending;i++) await new Promise(r => setTimeout(r,50));
    assert.ok(s.runner.handoff.pending);
    assert.equal(s.surface.owner,'paused');
    await assert.rejects(s.surface.act({type:'click',target:'savings'},{},{}),/does not own/);
    const endpoint = new URL(s.runner.handoff.url!);
    const resumeEarly = new URL(endpoint); resumeEarly.pathname='/resume';
    assert.equal((await fetch(resumeEarly,{method:'POST',redirect:'manual'})).status,409);
    endpoint.pathname='/take';
    assert.equal((await fetch(endpoint,{method:'POST',redirect:'manual'})).status,303);
    assert.equal(s.surface.owner,'human');
    // Test driver simulates an operator; this is not claimed as real human evidence.
    await s.surface.page.frameLocator(s.profile.frame).getByRole('button',{name:'Restore training session'}).click();
    await s.surface.locator('complete').waitFor({state:'visible'});
    endpoint.pathname='/resume';
    await fetch(endpoint,{method:'POST',redirect:'manual'});
    const result = await resultPromise;
    assert.equal(result.status,'success',JSON.stringify(result));
    assert.equal(s.surface.page,originalPage);
    const logs = await readFile(join(s.evidence.dir,'events.jsonl'),'utf8');
    assert.ok(logs.includes('human_action'));
    assert.ok(logs.includes('control_transferred'));
  } finally { await s.close(); }
});
test('unapproved resume fails closed', async () => {
  const s = await setup('expired',true);
  try {
    const pending = s.runner.replay(await fixture(s.profile),{memberId:'12345'});
    for (let i=0;i<100 && !s.runner.handoff.pending;i++) await new Promise(r => setTimeout(r,50));
    assert.ok(s.runner.handoff.pending);
    const u = new URL(s.runner.handoff.url!);
    u.pathname='/take'; await fetch(u,{method:'POST',redirect:'manual'});
    u.pathname='/resume'; await fetch(u,{method:'POST',redirect:'manual'});
    const result = await pending;
    assert.equal(result.status,'failure');
    if (result.status === 'failure') assert.equal(result.code,'RESUME_CHECK_FAILED');
  } finally { await s.close(); }
});

test('discovery records observed steps, parameterizes them, and replays with a new input', async () => {
  const s = await setup();
  let calls = 0;
  const planner: Planner = {
    kind:'test_fixture',provider:'test',model:'observation-driven-test-double',
    async decide(context) {
      calls++;
      const state = context.state as {visibleTargets:string[]};
      const history = context.history as {action:ActionSpec}[];
      const extracted = context.extractedOutputs as string[];
      let action: ActionSpec;
      if (state.visibleTargets.includes('complete')) {
        if (!extracted.includes('balance')) action = {type:'extract',target:'balance',output:'balance'};
        else if (!extracted.includes('currency')) action = {type:'extract',target:'currency',output:'currency'};
        else return {done:true,reason:'All declared outputs are present'};
      } else if (state.visibleTargets.includes('savings')) action = {type:'click',target:'savings'};
      else if (state.visibleTargets.includes('openMember')) action = {type:'click',target:'openMember'};
      else if (!history.some(h => h.action.type === 'fill')) action = {type:'fill',target:'memberId',input:'memberId'};
      else action = {type:'click',target:'search'};
      return {done:false,reason:'Test-double next action from observed controls',action};
    },
  };
  try {
    const base = await fixture(s.profile);
    const {result,artifact} = await s.runner.discover('Read savings balance',base,{memberId:'12345'},planner);
    assert.equal(result.status,'success',JSON.stringify(result));
    assert.ok(artifact);
    assert.equal(artifact.provenance.kind,'authored_fixture');
    assert.ok(!JSON.stringify(artifact).includes('12345'));
    const second = await setup();
    try {
      const before = calls;
      const replayed = await second.runner.replay(artifact,{memberId:'67890'});
      assert.equal(replayed.status,'success',JSON.stringify(replayed));
      if (replayed.status === 'success') assert.equal(replayed.outputs.balance,812.3);
      assert.equal(calls,before,'Replay must not call the planner');
    } finally { await second.close(); }
  } finally { await s.close(); }
});

test('browser prevents disallowed navigation before an external request', async () => {
  const s = await setup();
  try {
    await s.surface.act({type:'navigate',path:'/app'},{},{});
    await assert.rejects(s.surface.page.goto('https://example.com/'));
    await assert.rejects(s.surface.healthy(),/boundary/);
  } finally { await s.close(); }
});
