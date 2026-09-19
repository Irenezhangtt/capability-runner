# Capability Runner

An LLM discovers a UI workflow once. A typed capability records that workflow. A deterministic executor replays it with new inputs, handles known outcomes, and transfers a live session to a human when required.

**Status:** The local implementation and offline browser demonstration are available. A genuine API-backed discovery run and replay of its resulting artifact are still required before submission. Offline fixtures are explicitly labeled and are not evidence of LLM discovery.

## What the demo does

LedgerDesk is a local banking sandbox with synthetic records, server-rendered pages, an iframe, and table-based account views. The flow is member search → member detail → savings account → typed balance and currency. There are no test IDs. Automation interacts with the rendered UI; it never calls a banking data API.

The app profile defines an unordered inventory of reviewed controls, permitted actions, and error detectors. It does **not** specify the workflow. During discovery, the model chooses each next action from controls actually visible in the live browser. During replay, the runner imports no model client.

## Setup

Requires Node.js 22.9+ and either Google Chrome or Playwright Chromium.

```bash
npm ci
cp .env.example .env
```

The example configuration uses installed Chrome (`BROWSER_CHANNEL=chrome`). If Chrome is unavailable:

```bash
npx playwright install chromium
```

Then leave `BROWSER_CHANNEL` empty in `.env`. On Linux CI, use `npx playwright install --with-deps chromium`.

For live discovery, edit `.env` locally:

```dotenv
LLM_PROVIDER=openai
LLM_MODEL=YOUR_ENABLED_MODEL_ID
OPENAI_API_KEY=YOUR_LOCAL_KEY
BROWSER_CHANNEL=chrome
```

Supported adapters: `openai` (Responses API), `anthropic` (Messages API; use `ANTHROPIC_API_KEY`), and `compatible` (Chat Completions; set `LLM_BASE_URL` and `OPENAI_API_KEY`). Select a model supporting JSON decisions. Provider adapters remain unverified against a live account until real evidence is generated. Never put keys in commands, the repository, goals, or screenshots.

## Run without live services

```bash
npm run typecheck
npm test
npm run demo:offline
```

The offline demo starts its own sandbox on a temporary loopback port. It replays an **authored fixture**, including changed input, not-found, transient error, permission denial, and session-expiry cases. Logs and sanitized failure snapshots go into `evidence/offline/`. No API key is needed. Browser tests also exercise the discovery recorder using an explicitly labeled test double, and simulate an operator on the same live page.

## Real discovery and deterministic replay

Terminal 1:

```bash
npm run app
```

Terminal 2, after configuring `.env`:

```bash
npm run discover -- \
  --goal "Look up the supplied member and read their available savings balance and currency." \
  --target http://127.0.0.1:4173 \
  --inputs '{"memberId":"12345"}' \
  --artifact artifacts/lookup-savings.json \
  --evidence evidence/live \
  --headed

npm run replay -- \
  --artifact artifacts/lookup-savings.json \
  --inputs '{"memberId":"67890"}' \
  --evidence evidence/live

npm run replay -- \
  --artifact artifacts/lookup-savings.json \
  --inputs '{"memberId":"99999"}' \
  --evidence evidence/live
```

`--target` selects the deployment origin; the reviewed entry route comes from the profile. The default profile is `config/demo-profile.json` and the input/output contract is `config/lookup-contract.json`. Each run uses a fresh browser context. Discovery has a 24-decision and 120-second loop budget; an in-flight request can take up to 30 seconds. A capability is emitted only after verifying the final checkpoint and every declared output.

The programmatic runner returns real typed outputs in memory. The CLI and saved evidence redact sensitive outputs by default. `--show-outputs` opts into printing **synthetic demo** outputs to the terminal; do not use that option with real customer data. All examples use synthetic identifiers, so shell history is safe for these examples.

## Live human handoff

Start the app, then run either a discovered artifact or the offline fixture:

```bash
npm run replay -- \
  --artifact evidence/offline/authored-artifact.json \
  --inputs '{"memberId":"12345"}' \
  --scenario expired --human
```

1. The runner opens a headed browser and pauses at the expired session.
2. Open the loopback operator-console URL printed in the terminal.
3. Click **Take control**. Use the existing LedgerDesk window, not a new banking session.
4. Click **Restore training session** in LedgerDesk. Wait for the account details.
5. Click **Return control** in the console. The runner verifies the recorded checkpoint, extracts outputs, and completes.

The restoration button simulates authentication; it is not a real identity system. Ownership transfer, paused execution, same-session operation, auditing, and resume validation are real. The console is available only for the run and uses an unguessable per-run token. It times out after five minutes. `--human` implies a headed browser. Without this flag, the runner emits an intervention request and returns `INTERVENTION_REQUIRED` instead of waiting indefinitely.

## Results and fault scenarios

| Scenario / input | Result |
| --- | --- |
| `normal`, member `12345` | Success: 4250.75 USD (redacted in logs) |
| `normal`, member `67890` | Success: 812.30 USD |
| `normal`, member `99999` | Business outcome: `MEMBER_NOT_FOUND` |
| `normal`, member `abc` | Business outcome: `INVALID_MEMBER_ID` |
| `transient` | One known retry, then success |
| `persistent` | Failure: `RECOVERY_EXHAUSTED` after two retries |
| `denied` | Failure: `PERMISSION_DENIED` |
| `expired` | Human restoration or `INTERVENTION_REQUIRED` |
| `unexpected` | Checkpoint timeout and intervention |

Pass scenarios with `--scenario NAME`. They are synthetic fault injection through an isolated context cookie, not model-selected actions. Failures return step, expected state, observed control inventory, and a sanitized DOM diagnostic. Exit code 0 covers success and known business outcomes; failure exits 1.

## Project map

```text
src/schema.ts       Typed artifacts, actions, contracts, and result types
src/profile.ts      Reviewed app adapter configuration and policy
src/surface.ts      Browser adapter, network boundaries, private observations
src/planner.ts      API-backed next-action decisions
src/engine.ts       Discovery recorder and deterministic replay
src/handoff.ts      Session ownership and local operator console
src/evidence.ts     Structured redacted evidence
src/demo-app.ts     Synthetic legacy-style banking sandbox
tests/             Contract, policy, browser, and handoff tests
evidence/          Explicitly labeled execution evidence
REPORT.md          Design decisions and deliberate cuts
```

## Before submitting

### Assignment coverage

| Requirement | Implementation / evidence | Status |
| --- | --- | --- |
| 3.1 Goal-driven agent loop | `src/engine.ts`, `src/planner.ts`; live observations and bounded typed decisions | Implemented; real API run pending |
| 3.2 Structured capability | `src/schema.ts`; versioned inputs, outputs, targets, actions, checkpoints and provenance | Implemented |
| 3.3 Deterministic replay | `src/engine.ts`; browser tests and `evidence/offline/` | Verified with authored fixture |
| 3.4 Safety and policy | `src/profile.ts`, `src/surface.ts`, `src/evidence.ts` | Tested on synthetic data |
| 3.5 Evidence and observability | Structured events, redacted results and sanitized DOM diagnostics | Offline evidence present; live evidence pending |
| 3.6 Human escalation and handoff | `src/handoff.ts`; same-page ownership transfer and verified resume | Tested with simulated operator; real walkthrough recommended |
| 3.7 Heterogeneity and multi-tenant design | `REPORT.md`, `ManagedSurface`, reviewed profile binding | Design documented; desktop and tenant infrastructure intentionally omitted |

GitHub Actions runs type checking and browser tests without model credentials. Passing CI does not establish submission readiness: the workflow separately reports whether real discovery and its linked replay evidence exist.

Run `npm run check:submission` after generating real discovery and replay evidence. It intentionally fails while only offline fixtures exist. Review `evidence/` for sensitive content, rerun tests, and publish the source to a public repository. Submission instructions from the assignment require the repository URL by email; this project does not send that email automatically.

## Reference documentation

- [Playwright locators](https://playwright.dev/docs/locators): scoped roles and labels, exact matches, and auto-waiting.
- [OpenAI structured output formats](https://developers.openai.com/api/docs/guides/structured-outputs): JSON response configuration. The runner additionally validates decisions with Zod.
- [Claude authentication](https://platform.claude.com/docs/en/manage-claude/authentication): API key headers for the Messages adapter.
