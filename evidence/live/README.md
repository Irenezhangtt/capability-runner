# Genuine discovery and replay evidence

## Result

A real Anthropic API discovery run using `claude-sonnet-5` completed the savings lookup in the local LedgerDesk UI. Seven model responses produced a seven-step capability, including the initial navigation. The model selected actions from live observations; no authored action sequence was passed to the planner.

- [Discovery events](b204f2c2-158d-4abd-b742-77c52f75549b/events.jsonl): provider response IDs, model decisions, observed controls, actions, and success.
- [Discovered capability](b204f2c2-158d-4abd-b742-77c52f75549b/artifact.json): `provenance.kind = llm_discovery` and the source run ID.
- [Discovery result](b204f2c2-158d-4abd-b742-77c52f75549b/result.json): successful result with sensitive outputs redacted.
- [Replay corpus](replay-corpus/SUMMARY.md): **15/15 expected outcomes**, including changed input, known business outcomes, bounded recovery, hard failures, and tenant reuse.
- [Handoff events](walkthrough/89d01576-2eb0-4415-987e-c7802a8b46ce/events.jsonl): pause, control transfer, scripted operator actions, resume, and success on the same browser page.
- [Browser walkthrough](../../docs/DEMO.md): eight screenshots captured using the discovered capability.

All replay runs use the exact discovered artifact. The corpus ran in a separate process with model keys and model configuration removed, and recorded **zero model calls**. The two wrong-member scenarios were rejected before extraction.

The handoff driver simulates the operator's clicks against the real local console and browser session. It does not represent a human usability study. The public GitHub Pages app remains an independent, labeled simulation.

## Reproduce

Configure your provider credentials in the ignored local `.env`, then run:

```bash
npm run demo:live
npm run demo:capture -- --artifact artifacts/lookup-savings.json --evidence evidence/live/walkthrough
npm run check:submission
```

The committed discovery was captured at `2026-09-21T04:34:17.619Z`. Re-running discovery creates a new run and may produce a different valid action sequence. One successful model run establishes the required end-to-end demonstration, not a statistical reliability estimate or compatibility with other model providers.

JSON and JSONL files were parsed and scanned before publication. No configured API keys or synthetic private member identifiers, names, or balances were found in these records. Screenshots intentionally display clearly labeled synthetic training data.
