# Execution evidence

## Local validation

Validated on 2026-09-18 using Node.js 24 and installed Google Chrome:

- TypeScript check passed.
- All 27 tests passed, including cross-tenant bindings, identity assertions, discovery limits, network policy, and same-session handoff.
- Five offline browser runs produced the expected success, business-outcome, and failure results.
- The assurance corpus verified all 15 expected behaviors across two tenant presentations, including two heading-only false-success counterexamples and zero replay model calls.
- All 43 JSON files and 333 JSONL events (including historical evidence) parsed successfully; a scan found none of the synthetic member identifiers, account names, or balances in persisted evidence.
- Current artifacts bind to the current profile; all assurance runs reference the same verified capability hash.
- The base and Harbor sandbox presentations were also inspected visually.
- Submission check correctly reports incomplete: real API discovery and its linked replay are absent.

## Offline evidence

`offline/authored-artifact.json` is an explicitly authored fixture. `offline/index.json` indexes actual browser replay runs of that fixture. It does not claim an LLM performed discovery.

Each run contains:

- `events.jsonl`: structured, redacted actions, conditions, and control transfers;
- `result.json`: redacted execution result;
- `failure-dom.json`, when applicable: sanitized control inventory, selector definitions, match counts, and geometry.

Sensitive outputs are returned in memory to callers but replaced with `[REDACTED]` in evidence. The sandbox uses synthetic records throughout.

## Cross-tenant assurance evidence

Start with [the experiment summary](assurance/SUMMARY.md). `assurance/index.json` holds case expectations, observed results, invariant verdicts, timing diagnostics, and evidence links. `assurance/artifact.json` is the same canonical capability used across cases. Regenerate with `npm run demo:assurance`; use `--artifact PATH` to evaluate a real discovered capability.

## Historical evidence

`archive/v1.0/` preserves the previously published schema 1.0 fixture and runs. The original logged paths refer to their locations at capture time. They are retained for provenance and are not executable under the current schema 1.1 interpreter, which requires identity postconditions. Use the current `offline/` artifact for demonstrations.

## Live evidence — pending

Run the README's discovery and replay commands with `--evidence evidence/live`. A genuine discovery directory must contain `model_response` events with provider response IDs, a successful result, and `artifact.json` with `provenance.kind = llm_discovery`. A subsequent replay must reference that source run and succeed without model events.

Run `npm run check:submission` to check those linked files. This is an evidence-completeness check, not cryptographic proof of authenticity.

The automated handoff tests simulate an operator. A real operator walkthrough is recommended separately, using `--human` and the same live browser window.
