# Running the platform

[← Platform overview](../README.md)

Run all commands from the repository root. This guide contains configuration, demos, fault scenarios, and the operator walkthrough.

## Setup

Requires Node.js 22.9+ and either Google Chrome or Playwright Chromium. Live discovery also requires Python 3.10+; no Python packages need installing. Set `PYTHON_BIN` in `.env` if the executable is not `python3`. See [Python API integration](PYTHON.md) for the architecture and connector contract.

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

Supported adapters: `openai` (Responses API), `anthropic` (Messages API; use `ANTHROPIC_API_KEY`), and `compatible` (Chat Completions; set `LLM_BASE_URL` and `OPENAI_API_KEY`). Select a model supporting JSON decisions. The Anthropic adapter has completed a real discovery run; OpenAI and compatible adapters have mocked-test coverage only. Never put keys in commands, the repository, goals, or screenshots.

## Run without live services

```bash
npm run typecheck
npm run test:python
npm test
npm run demo:offline
npm run demo:assurance
```

The offline demo starts its own sandbox on a temporary loopback port. It replays an **authored fixture**, including changed input, not-found, transient error, permission denial, and session-expiry cases. Logs and sanitized failure snapshots go into `evidence/offline/`. No API key is needed. Browser tests also exercise the discovery recorder using an explicitly labeled test double, and simulate an operator on the same live page.

The assurance lab also starts its own sandbox. It tests normal results, rejected states, recovery budgets, and cross-tenant bindings. Inspect `evidence/assurance/SUMMARY.md` and `index.json`. Assess a genuinely discovered artifact with `npm run demo:assurance -- --artifact artifacts/lookup-savings.json`.

## Real discovery and deterministic replay

For a complete evidence run after configuring `.env`, use:

```bash
npm run demo:live
npm run check:submission
```

This starts a temporary sandbox, performs genuine API-backed discovery, saves the capability, and replays that exact artifact through the 15-case fault corpus. The replay subprocess receives no model credentials. Evidence is saved under `evidence/live/`; the public interactive demo is unaffected. A failed discovery stops the command without substituting an authored fixture.

For separate discovery and replay commands:

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

`--target` selects the deployment origin; the reviewed entry route comes from the profile. The default profile is `config/demo-profile.json` and the input/output contract is `config/lookup-contract.json`. Each run uses a fresh browser context. Discovery has a 24-decision and 120-second loop budget; an in-flight Python request can take up to 35 seconds. A capability is emitted only after verifying the final checkpoint and every declared output.

The programmatic runner returns real typed outputs in memory. The CLI and saved evidence redact sensitive outputs by default. `--show-outputs` opts into printing **synthetic demo** outputs to the terminal; do not use that option with real customer data. All examples use synthetic identifiers, so shell history is safe for these examples.

## One capability, two tenant presentations

After running `npm run demo:offline` and starting `npm run app`:

```bash
npm run replay -- \
  --artifact evidence/offline/authored-artifact.json \
  --inputs '{"memberId":"67890"}' \
  --tenant config/tenants/harbor.json \
  --headed
```

For live artifacts, change only `--artifact` to the discovery output. The overlay's ID selects the synthetic tenant through a sandbox-only cookie; real deployments would use separate tenant origins and isolated sessions. For visual comparison, open [LedgerDesk](http://127.0.0.1:4173/preview/base) and [Harbor CU](http://127.0.0.1:4173/preview/harbor). The manual preview routes are not in the automation allowlist.

Inspect [the overlay](../config/tenants/harbor.json) and [the compatibility boundary](../src/tenant.ts). Label mappings are trusted configuration requiring semantic review: restricting an overlay's structure cannot prove that a renamed control has the intended business meaning. A hash detects mismatches; it is not an approval signature.

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

| Scenario / input         | Result                                                          |
| ------------------------ | --------------------------------------------------------------- |
| `normal`, member `12345` | Success: 4250.75 USD (redacted in logs)                         |
| `normal`, member `67890` | Success: 812.30 USD                                             |
| `normal`, member `99999` | Business outcome: `MEMBER_NOT_FOUND`                            |
| `normal`, member `abc`   | Business outcome: `INVALID_MEMBER_ID`                           |
| `transient`              | One known retry, then success                                   |
| `persistent`             | Failure: `RECOVERY_EXHAUSTED` after two retries                 |
| `denied`                 | Failure: `PERMISSION_DENIED`                                    |
| `expired`                | Human restoration or `INTERVENTION_REQUIRED`                    |
| `unexpected`             | Checkpoint timeout and intervention                             |
| `wrong-member`           | Correct page, wrong entity: `ENTITY_MISMATCH` before extraction |
| `malformed-output`       | Failure: `OUTPUT_PARSE_FAILED`                                  |
| `ambiguous`              | Failure: `AMBIGUOUS_TARGET`; no first-match fallback            |

Pass scenarios with `--scenario NAME`. They are synthetic fault injection through an isolated context cookie, not model-selected actions. Failures return step, expected state, observed control inventory, and a sanitized DOM diagnostic. Exit code 0 covers success and known business outcomes; failure exits 1.

## Evidence readiness

Run `npm run check:submission` after collecting a real discovery and linked replay. Offline fixtures do not satisfy that requirement.

## Reference documentation

- [Playwright locators](https://playwright.dev/docs/locators): scoped roles and labels, exact matches, and auto-waiting.
- [OpenAI structured output formats](https://developers.openai.com/api/docs/guides/structured-outputs): JSON response configuration. The runner additionally validates decisions with Zod.
- [Claude authentication](https://platform.claude.com/docs/en/manage-claude/authentication): API key headers for the Messages adapter.

## Interactive reviewer demo

Run `npm run demo:web`, then open `http://127.0.0.1:4174`. This separate presentation app simulates sample workflows in the browser; it does not invoke Python, Playwright, or a model API. Live discovery intentionally displays **API token unavailable**. No credentials are requested, embedded, or stored.

Source lives in `reviewer-demo/`. GitHub Pages publishes only the four static assets in `reviewer-demo/`, using `.github/workflows/pages.yml` after changes on `main`. The public URL is https://irenezhangtt.github.io/llm-automation-platform/. The optional `npm run build:demo` command copies these assets into `dist/` for other static hosts. No application secrets or backend code are deployed. To check the interactive scenarios with the preview server running, use `node --env-file-if-exists=.env scripts/check-reviewer-demo.mjs`. Optional WebMCP read access is feature-detected; native WebMCP validation was unavailable in the test browser. Downloaded traces explicitly set `isExecutionEvidence: false`.
