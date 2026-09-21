# Capability Assurance Lab

**15/15 expected behaviors verified · 0 model calls during replay · one unchanged capability across two tenant presentations.**

Source: `llm_discovery`. Capability content hash: `da794485c46ceeb37157e4b48eb1d3ea6c6a436edfcad00764a233dfecd2110a`. This is a fault-corpus result, not a production success-rate claim.

## The counterexample that matters

In 2 cases, the expected account screen was visible but the displayed member was wrong. A heading-only success check would have accepted that state. Input-bound identity postconditions rejected it before balance extraction. Raw member values remain inside the browser adapter.

## Reproduction

Run `npm run demo:assurance`. To assess a real discovered capability, run `npm run demo:assurance -- --artifact artifacts/lookup-savings.json`.

| Case | Tenant | Observed result | Expected behavior verified | Model calls | Evidence |
| --- | --- | --- | --- | ---: | --- |
| Base lookup | base | `success` | Yes | 0 | [run](ef9f3ddd-8f80-4b28-8bfa-b160698ae806/events.jsonl) |
| Changed input | base | `success` | Yes | 0 | [run](2b48a688-b37f-4bd9-8815-2555f5d83d23/events.jsonl) |
| Member absent | base | `MEMBER_NOT_FOUND` | Yes | 0 | [run](73b2d7ee-8869-462a-af82-f4851852e4a0/events.jsonl) |
| Invalid identifier | base | `INVALID_MEMBER_ID` | Yes | 0 | [run](8013f571-56f8-46ec-83e9-29b83529db62/events.jsonl) |
| Transient recovery | base | `success` | Yes | 0 | [run](b98e239c-c61b-4400-8371-9d0b7159db6c/events.jsonl) |
| Retry budget exhausted | base | `RECOVERY_EXHAUSTED` | Yes | 0 | [run](30d04f18-606c-4c3a-8921-d89decd15a11/events.jsonl) |
| Permission denial | base | `PERMISSION_DENIED` | Yes | 0 | [run](2c9d43f1-2b94-4944-b2ab-ba5f4f619a66/events.jsonl) |
| Session requires operator | base | `INTERVENTION_REQUIRED` | Yes | 0 | [run](a991e53d-0176-4ea1-af7e-50e1be1b4053/events.jsonl) |
| Correct screen, wrong member | base | `ENTITY_MISMATCH` | Yes | 0 | [run](db0956e7-cb39-47bd-8b86-90f1c284755a/events.jsonl) |
| Malformed balance | base | `OUTPUT_PARSE_FAILED` | Yes | 0 | [run](ee61ecda-c430-4408-824a-febfb741f46d/events.jsonl) |
| Ambiguous control | base | `AMBIGUOUS_TARGET` | Yes | 0 | [run](5e69c6b9-80f0-4be6-98af-b51f2bcf3566/events.jsonl) |
| Harbor with binding | harbor | `success` | Yes | 0 | [run](c8fba0ca-3c94-4abc-afc8-49ed69dddd37/events.jsonl) |
| Harbor without binding | harbor | `APP_VERSION_MISMATCH` | Yes | 0 | [run](b0246806-3568-4ba8-abb4-df04197c37ca/events.jsonl) |
| Harbor wrong member | harbor | `ENTITY_MISMATCH` | Yes | 0 | [run](86031cad-8ae5-47e1-83ef-62a47196ab66/events.jsonl) |
| Harbor known outcome | harbor | `MEMBER_NOT_FOUND` | Yes | 0 | [run](a73c353c-4f8d-4718-90d7-a52b8baa1eef/events.jsonl) |

## What the experiment supports

- One artifact runs unchanged on both presentations when an explicit compatible binding is supplied.
- An unbound tenant fails closed. Duplicate controls are rejected, rather than selecting the first match.
- Business outcomes are separate from operational failures; known recovery is bounded.
- The same entity-identity invariant protects both tenant presentations.

## What it does not establish

- Synthetic deterministic scenarios, not a statistical estimate of production reliability.
- One genuine discovery run does not establish model reliability across other goals or applications.
- Tenant labels still require semantic review; a constrained overlay does not prove a label identifies a safe business action.

See [machine-readable results](index.json) and [the unchanged capability](artifact.json). Per-case timings are local diagnostics, not comparable performance benchmarks.
