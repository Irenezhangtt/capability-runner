# Capability Assurance Lab

**15/15 expected behaviors verified · 0 model calls during replay · one unchanged capability across two tenant presentations.**

Source: `authored_fixture`. Capability content hash: `84b9e07f2928a4dd5b082146adbc0d6ce3fff41044ef51879a66c8a334472d9f`. This is a fault-corpus result, not a production success-rate claim.

## The counterexample that matters

In 2 cases, the expected account screen was visible but the displayed member was wrong. A heading-only success check would have accepted that state. Input-bound identity postconditions rejected it before balance extraction. Raw member values remain inside the browser adapter.

## Reproduction

Run `npm run demo:assurance`. To assess a real discovered capability, run `npm run demo:assurance -- --artifact artifacts/lookup-savings.json`.

| Case | Tenant | Observed result | Expected behavior verified | Model calls | Evidence |
| --- | --- | --- | --- | ---: | --- |
| Base lookup | base | `success` | Yes | 0 | [run](e062afa6-897f-4b32-bb30-e70d691cff24/events.jsonl) |
| Changed input | base | `success` | Yes | 0 | [run](14012b58-f85a-4e1a-a1f7-a81dcb1b6e8f/events.jsonl) |
| Member absent | base | `MEMBER_NOT_FOUND` | Yes | 0 | [run](4b565060-a3e8-4213-b487-d7e0ac79af54/events.jsonl) |
| Invalid identifier | base | `INVALID_MEMBER_ID` | Yes | 0 | [run](bb8fd224-da3c-4548-8fea-9f8f05b757df/events.jsonl) |
| Transient recovery | base | `success` | Yes | 0 | [run](2ff451b1-6e1d-4ecf-8a8c-507b5ae82f1a/events.jsonl) |
| Retry budget exhausted | base | `RECOVERY_EXHAUSTED` | Yes | 0 | [run](fd3188c1-8ac3-4c12-bdc4-1c860c07e31c/events.jsonl) |
| Permission denial | base | `PERMISSION_DENIED` | Yes | 0 | [run](387b6686-18f8-4627-bade-3a3919187733/events.jsonl) |
| Session requires operator | base | `INTERVENTION_REQUIRED` | Yes | 0 | [run](3dccd0e2-3739-4d3d-8d3a-76421e18d5d7/events.jsonl) |
| Correct screen, wrong member | base | `ENTITY_MISMATCH` | Yes | 0 | [run](900bf383-07e0-4c00-a231-3063f6ba554a/events.jsonl) |
| Malformed balance | base | `OUTPUT_PARSE_FAILED` | Yes | 0 | [run](887f72af-171c-4a32-acfc-1cf057dbe8ab/events.jsonl) |
| Ambiguous control | base | `AMBIGUOUS_TARGET` | Yes | 0 | [run](ffca55bc-aff2-4642-a7ae-65cedde65f2f/events.jsonl) |
| Harbor with binding | harbor | `success` | Yes | 0 | [run](564e8036-9f2c-4672-b5a8-c15ff02a007f/events.jsonl) |
| Harbor without binding | harbor | `APP_VERSION_MISMATCH` | Yes | 0 | [run](1746cc64-f36f-4115-bba9-8ba9c409d511/events.jsonl) |
| Harbor wrong member | harbor | `ENTITY_MISMATCH` | Yes | 0 | [run](fff06267-6b83-4231-895a-596375924f63/events.jsonl) |
| Harbor known outcome | harbor | `MEMBER_NOT_FOUND` | Yes | 0 | [run](0defd906-eee1-44ba-8bce-39e2d1dab9c0/events.jsonl) |

## What the experiment supports

- One artifact runs unchanged on both presentations when an explicit compatible binding is supplied.
- An unbound tenant fails closed. Duplicate controls are rejected, rather than selecting the first match.
- Business outcomes are separate from operational failures; known recovery is bounded.
- The same entity-identity invariant protects both tenant presentations.

## What it does not establish

- Synthetic deterministic scenarios, not a statistical estimate of production reliability.
- Authored fixture runs do not satisfy the genuine LLM discovery requirement.
- Tenant labels still require semantic review; a constrained overlay does not prove a label identifies a safe business action.

See [machine-readable results](index.json) and [the unchanged capability](artifact.json). Per-case timings are local diagnostics, not comparable performance benchmarks.
