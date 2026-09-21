# Reviewer guide

[← Platform overview](../README.md) · [Design report](../REPORT.md) · [Running guide](RUNNING.md)

Start with the **[two-minute visual demo](DEMO.md)**: real application and operator-console screenshots, with no setup required.

## Project map

```text
src/schema.ts       Typed artifacts, actions, contracts, and result types
src/profile.ts      Reviewed app adapter configuration and policy
src/tenant.ts       Presentation-only tenant overlays and binding validation
src/surface.ts      Browser adapter, network boundaries, private observations
src/planner.ts      API-backed next-action decisions
src/engine.ts       Discovery recorder and deterministic replay
src/handoff.ts      Session ownership and local operator console
src/evidence.ts     Structured redacted evidence
src/demo-app.ts     Synthetic legacy-style banking sandbox
tests/             Contract, policy, browser, and handoff tests
scripts/assurance-lab.ts  Reproducible cross-tenant fault corpus
evidence/          Explicitly labeled execution evidence
REPORT.md          Design decisions and deliberate cuts
```

## Before submitting

### Assignment coverage

| Requirement                               | Implementation / evidence                                                                | Status                                                                           |
| ----------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 3.1 Goal-driven agent loop                | `src/engine.ts`, `src/planner.ts`; live observations and bounded typed decisions         | Verified with genuine Claude API discovery                                       |
| 3.2 Structured capability                 | `src/schema.ts`; versioned inputs, outputs, targets, actions, checkpoints and provenance | Implemented                                                                      |
| 3.3 Deterministic replay                  | `src/engine.ts`; identity assertions, browser tests and assurance corpus                 | Verified with the Claude-discovered capability                                   |
| 3.4 Safety and policy                     | `src/profile.ts`, `src/surface.ts`, `src/evidence.ts`                                    | Tested on synthetic data                                                         |
| 3.5 Evidence and observability            | Structured events, redacted results and sanitized DOM diagnostics                        | Live discovery, linked replay, and diagnostics present                           |
| 3.6 Human escalation and handoff          | `src/handoff.ts`; same-page ownership transfer and verified resume                       | Tested with simulated operator; real walkthrough recommended                     |
| 3.7 Heterogeneity and multi-tenant design | `REPORT.md`, `ManagedSurface`, `src/tenant.ts`                                           | Two presentations reuse one artifact; desktop and tenancy infrastructure omitted |

GitHub Actions runs type checking and browser tests without model credentials. Passing CI does not establish submission readiness: the workflow separately reports whether real discovery and its linked replay evidence exist.

Current artifacts use **schema 1.1**, which requires identity postconditions. Historical schema 1.0 evidence is preserved under `evidence/archive/v1.0/`; those artifacts are intentionally rejected by the current interpreter. Regenerate the offline fixture or re-record discovery instead of silently upgrading a capability that lacks the required safety contract.

Run `npm run check:submission` to verify linked discovery and replay evidence. It now passes for the committed [live evidence](../evidence/live/README.md), including replay artifact-hash linkage. Review `evidence/` for sensitive content, rerun tests, and publish the source to a public repository. Submission instructions from the assignment require the repository URL by email; this project does not send that email automatically.

## Python API layer

Discovery uses the [Python model connectors](PYTHON.md); TypeScript keeps execution and policy authority. Run `npm run test:python` for connector/protocol tests. These use mocked responses and do not replace genuine discovery evidence.
