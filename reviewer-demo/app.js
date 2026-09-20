// Presentation-only state machine. It never invokes the model or Playwright runtime.
const $ = (id) => document.getElementById(id);
const members = {
  12345: { name: 'Jordan Example', balance: '4,250.75' },
  67890: { name: 'Taylor Sample', balance: '812.30' },
};
const help = {
  normal: 'Verify the requested member before reading the balance.',
  'wrong-member': 'The page looks right. The identity is wrong. Will the workflow catch it?',
  expired: 'Take control, restore the sample session, then return control to automation.',
  transient: 'See one bounded recovery attempt before the sample workflow continues.',
  denied: 'A permission error stops execution. The workflow does not bypass access controls.',
};
let generation = 0;
let mode = 'demo';
let state = 'idle';
let config;
let events = [];
let runId;

function log(message, type = 'STEP') {
  const event = { sequence: events.length + 1, type, message, simulated: true };
  events.push(event);
  if (events.length === 1) $('trace').replaceChildren();
  const row = document.createElement('li');
  for (const [value, className] of [
    [String(event.sequence).padStart(2, '0'), 'trace-index'],
    [message, 'trace-message'],
    [`SIMULATED / ${type}`, 'trace-type'],
  ]) {
    const span = document.createElement('span');
    span.className = className;
    span.textContent = value;
    row.append(span);
  }
  $('trace').append(row);
}
function controls(locked) {
  for (const id of ['tenant', 'member', 'scenario', 'demo-mode', 'live-mode'])
    $(id).disabled = locked;
  $('run').disabled = locked || mode === 'live';
}
function screen(stage, displayed = config?.member || $('member').value) {
  const tenant = config?.tenant || $('tenant').value;
  const person = members[displayed];
  const harbor = tenant === 'harbor';
  const container = $('app-screen');
  container.classList.toggle('harbor', harbor);
  // Interpolated values are restricted to fixed option values and constants, never user text.
  let content = `<h3>${harbor ? 'Client directory' : 'Member search'}</h3><p>Find a member to review their accounts.</p><div class="mock-label">${harbor ? 'Client number' : 'Member ID'}</div><div class="mock-input">${stage === 'ready' ? 'Waiting for workflow input' : displayed}</div><span class="mock-button">${harbor ? 'Find client' : 'Find member'}</span>`;
  if (stage === 'results')
    content = `<h3>${harbor ? 'Matching clients' : 'Search results'}</h3><div class="mock-card"><p>${person.name} · ${displayed}</p><span class="mock-button">${harbor ? 'View client' : 'Open member'}</span></div>`;
  if (stage === 'account')
    content = `<h3>${harbor ? 'Savings summary' : 'Savings account details'}</h3><p>${harbor ? 'Client reference' : 'Member reference'} · ${displayed}</p><div class="mock-card"><p>${harbor ? 'Available funds' : 'Available balance'}</p><div class="balance">${person.balance} <small>USD</small></div></div>`;
  if (stage === 'expired')
    content =
      '<div class="mock-card mock-warning"><h3>Session expired</h3><p>An operator must restore this sample session before the workflow can continue.</p></div>';
  if (stage === 'denied')
    content =
      '<div class="mock-card mock-warning"><h3>Permission denied</h3><p>This operator cannot view this account.</p></div>';
  if (stage === 'missing')
    content =
      '<h3>No matching member</h3><p>No record matches the supplied identifier. This is a business outcome, not a technical failure.</p>';
  if (stage === 'transient')
    content =
      '<div class="mock-card mock-warning"><h3>Service temporarily unavailable</h3><p>A reviewed retry action is available. Recovery budget: 2 attempts.</p></div>';
  container.innerHTML = `<div class="app-header">${harbor ? 'Harbor Credit Union' : 'LedgerDesk'}<span>SAMPLE WORKSPACE</span></div><div class="app-content">${content}<p class="training">Synthetic data · Interactive simulation · No real transactions</p></div>`;
}
function check(id, passed, detail) {
  $(id + '-check').textContent = passed ? '✓' : '×';
  $(id + '-check').className = `check-icon ${passed ? 'good' : 'bad'}`;
  $(id + '-detail').textContent = detail;
}
function finish(status, text) {
  state = 'finished';
  controls(false);
  $('run-status').textContent = status;
  $('outcome').textContent = text;
  $('outcome').className =
    `outcome ${status === 'Verified result' ? 'success' : status === 'Stopped safely' ? 'failure' : ''}`;
  $('handoff').hidden = true;
  $('ownership').textContent = 'Control: automation';
  $('download').disabled = false;
}
function verify() {
  const displayed =
    config.scenario === 'wrong-member'
      ? config.member === '12345'
        ? '67890'
        : '12345'
      : config.member;
  screen('account', displayed);
  check('screen', true, 'Savings account screen matched');
  log('Expected savings account screen matched.', 'CHECK');
  if (displayed !== config.member) {
    check('identity', false, `Requested ${config.member}; displayed ${displayed}`);
    log('ENTITY_MISMATCH — extraction blocked before reading the balance.', 'STOP');
    finish(
      'Stopped safely',
      'ENTITY_MISMATCH · Correct screen, wrong member. No balance was returned.',
    );
  } else {
    check('identity', true, `Member ${config.member} matches input`);
    log('Member identity matches the requested input.', 'CHECK');
    log('Read balance and currency after identity verification.', 'OUTPUT');
    finish(
      'Verified result',
      `Sample result: ${members[config.member].balance} USD · Identity verified · 0 model calls.`,
    );
  }
}
async function wait(id) {
  await new Promise((resolve) => setTimeout(resolve, 550));
  return id === generation;
}
function reset() {
  generation++;
  state = 'idle';
  config = undefined;
  events = [];
  runId = undefined;
  $('handoff').hidden = true;
  $('download').disabled = true;
  $('trace').innerHTML =
    '<li class="empty-trace">Your sample run will appear here. Every event is labeled as simulated.</li>';
  $('run-status').textContent = 'Ready to run';
  $('ownership').textContent = 'Control: automation';
  for (const id of ['screen', 'identity']) {
    $(id + '-check').className = 'check-icon';
    $(id + '-check').textContent = '—';
  }
  $('screen-detail').textContent = 'Waiting for savings account';
  $('identity-detail').textContent = 'Must match the requested input';
  $('outcome').className = 'outcome';
  $('outcome').textContent = 'Choose a condition and run the sample to inspect its outcome.';
  controls(false);
  screen('ready');
}
$('run-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (mode !== 'demo' || ['running', 'paused', 'human', 'restored'].includes(state)) return;
  reset();
  config = { tenant: $('tenant').value, member: $('member').value, scenario: $('scenario').value };
  runId = crypto.randomUUID();
  state = 'running';
  controls(true);
  const id = generation;
  $('run-status').textContent = 'Running sample';
  $('outcome').textContent = 'Inspecting the simulated workflow…';
  log(
    `Bind lookupSavings v1.0.0 to ${config.tenant === 'harbor' ? 'Harbor CU presentation' : 'LedgerDesk presentation'}.`,
    'BIND',
  );
  screen('search');
  log(`Fill member ID ${config.member}.`);
  if (!(await wait(id))) return;
  if (config.scenario === 'transient' && config.member !== '99999') {
    screen('transient');
    log('Temporary service error. Perform reviewed retry 1 of 2.', 'RECOVER');
    if (!(await wait(id))) return;
  }
  if (config.member === '99999') {
    screen('missing');
    log('MEMBER_NOT_FOUND — expected business outcome.', 'OUTCOME');
    finish(
      'No matching member',
      'MEMBER_NOT_FOUND · No record matched. No account data was returned.',
    );
    return;
  }
  screen('results');
  log('Open the matching member and savings account.');
  if (!(await wait(id))) return;
  if (config.scenario === 'denied') {
    screen('denied');
    log('PERMISSION_DENIED — stop without bypassing permissions.', 'STOP');
    finish(
      'Stopped safely',
      'PERMISSION_DENIED · Access was denied. No retry or bypass attempted.',
    );
    return;
  }
  if (config.scenario === 'expired') {
    screen('expired');
    state = 'paused';
    $('run-status').textContent = 'Waiting for an operator';
    $('ownership').textContent = 'Control: paused';
    $('handoff').hidden = false;
    $('take').hidden = false;
    $('restore').hidden = true;
    $('resume').hidden = true;
    $('handoff-message').textContent =
      'The session expired. Take control to restore it before automation continues.';
    $('outcome').textContent = 'SESSION_EXPIRED · Automation paused. No outputs extracted.';
    log('SESSION_EXPIRED — pause and preserve the simulated session.', 'HANDOFF');
    return;
  }
  verify();
});
$('take').addEventListener('click', () => {
  if (state !== 'paused') return;
  state = 'human';
  $('ownership').textContent = 'Control: human';
  $('take').hidden = true;
  $('restore').hidden = false;
  $('handoff-message').textContent =
    'You have control. Restore the sample session, then return it to automation.';
  log('Operator took control. Automation remains paused.', 'HANDOFF');
});
$('restore').addEventListener('click', () => {
  if (state !== 'human') return;
  state = 'restored';
  screen('account');
  $('restore').hidden = true;
  $('resume').hidden = false;
  $('handoff-message').textContent =
    'Sample session restored. Return control to verify the screen and member.';
  log('Operator restored the sample session.', 'HUMAN');
});
$('resume').addEventListener('click', () => {
  if (state !== 'restored') return;
  log('Operator returned control. Recheck the expected state and identity.', 'HANDOFF');
  verify();
});
$('abort').addEventListener('click', () => {
  if (!['paused', 'human', 'restored'].includes(state)) return;
  log('Operator aborted the sample run.', 'STOP');
  finish('Stopped safely', 'INTERVENTION_ABORTED · Run stopped. No outputs returned.');
});
function setMode(value) {
  if (['running', 'paused', 'human', 'restored'].includes(state)) return;
  mode = value;
  $('demo-mode').setAttribute('aria-pressed', String(value === 'demo'));
  $('live-mode').setAttribute('aria-pressed', String(value === 'live'));
  $('token-notice').hidden = value !== 'live';
  $('run').disabled = value === 'live';
  $('run').firstChild.textContent =
    value === 'live' ? 'API token unavailable ' : 'Run sample workflow ';
}
$('demo-mode').addEventListener('click', () => setMode('demo'));
$('live-mode').addEventListener('click', () => setMode('live'));
$('back-demo').addEventListener('click', () => setMode('demo'));
$('reset').addEventListener('click', reset);
for (const id of ['tenant', 'member', 'scenario'])
  $(id).addEventListener('change', () => {
    reset();
    $('scenario-help').textContent = help[$('scenario').value];
  });
$('download').addEventListener('click', () => {
  if (!runId || state !== 'finished') return;
  const blob = new Blob(
    [
      JSON.stringify(
        {
          kind: 'interactive_simulation',
          isExecutionEvidence: false,
          runId,
          configuration: config,
          result: $('outcome').textContent,
          modelCalls: 0,
          events,
        },
        null,
        2,
      ),
    ],
    { type: 'application/json' },
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'simulated-workflow-trace.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
reset();

// Optional structured read access in browsers implementing WebMCP.
if (document.modelContext?.registerTool) {
  const lifecycle = new AbortController();
  try {
    Promise.resolve(
      document.modelContext.registerTool(
        {
          name: 'read_demo_run',
          title: 'Read simulated workflow state',
          description:
            'Read the visible interactive simulation state, result, and trace. This is not live automation evidence.',
          inputSchema: { type: 'object', properties: {}, additionalProperties: false },
          annotations: { readOnlyHint: true, untrustedContentHint: false },
          execute(input) {
            if (
              !input ||
              typeof input !== 'object' ||
              Array.isArray(input) ||
              Object.keys(input).length
            )
              throw new Error('Expected an empty object');
            return {
              simulated: true,
              state,
              mode,
              result: $('outcome').textContent,
              events: events.map((event) => ({ ...event })),
            };
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => {});
  } catch {
    /* Ordinary browsers keep the same complete UI. */
  }
  window.addEventListener('pagehide', () => lifecycle.abort(), { once: true });
}
