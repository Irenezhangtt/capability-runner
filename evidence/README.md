# Execution evidence

## Local validation

Validated on 2026-09-18 using Node.js 24 and installed Google Chrome:

- TypeScript check passed.
- All 16 tests passed, including browser replay, recorder integration, network policy, and same-session handoff.
- Five offline browser runs produced the expected success, business-outcome, and failure results.
- All 9 generated JSON files and 66 JSONL events parsed successfully; a scan found none of the synthetic member identifiers, account names, or balances in persisted evidence.
- The sandbox's search and savings-detail screens were also inspected visually.
- Submission check correctly reports incomplete: real API discovery and its linked replay are absent.

## Offline evidence

`offline/authored-artifact.json` is an explicitly authored fixture. `offline/index.json` indexes actual browser replay runs of that fixture. It does not claim an LLM performed discovery.

Each run contains:

- `events.jsonl`: structured, redacted actions, conditions, and control transfers;
- `result.json`: redacted execution result;
- `failure-dom.json`, when applicable: sanitized control inventory, selector definitions, match counts, and geometry.

Sensitive outputs are returned in memory to callers but replaced with `[REDACTED]` in evidence. The sandbox uses synthetic records throughout.

## Live evidence — pending

Run the README's discovery and replay commands with `--evidence evidence/live`. A genuine discovery directory must contain `model_response` events with provider response IDs, a successful result, and `artifact.json` with `provenance.kind = llm_discovery`. A subsequent replay must reference that source run and succeed without model events.

Run `npm run check:submission` to check those linked files. This is an evidence-completeness check, not cryptographic proof of authenticity.

The automated handoff tests simulate an operator. A real operator walkthrough is recommended separately, using `--human` and the same live browser window.
