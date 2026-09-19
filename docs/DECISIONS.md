# Design decisions and failure boundaries

## 1. Verify the entity, not just the page

**Problem.** A stale or incorrectly selected record can display a perfectly valid savings page. A heading, URL shape, and parseable balance can all pass while the business answer is wrong.

**Decision.** Schema 1.1 requires input-bound postconditions. Immediately before extraction, a local adapter compares the displayed member reference with the invocation's member ID. The model receives only control labels; evidence records the boolean verdict, never the compared values. The condition is enforced again before returning success and applies to tenant bindings too.

**Evidence.** The assurance corpus contains `wrong-member` for both tenants. The screen checkpoint is true while the identity verdict is false, and no balance is returned. This is a concrete counterexample to heading-only acceptance.

**Boundary.** An application that falsely displays the requested identifier beside someone else's balance can defeat this check. Independent reconciliation would be needed for that threat. This project does not claim to verify the bank's source of truth. There is also a read/check race in a concurrently changing application; a future adapter could read identity and outputs in one consistent observation. The synthetic app is server-rendered and static between navigations.

## 2. Constrain compatibility overrides

**Problem.** Re-recording every tenant duplicates workflows and safety decisions. Allowing unrestricted per-tenant override code can silently change what a capability is authorized to do.

**Decision.** Keep workflow, input/output contract, policy, recovery taxonomy, and invariants canonical. Allow only known-target labels, a frame title, and an application fingerprint to change. Pin an overlay to its base profile digest and log the overlay and effective-profile hashes on execution. Do not mutate or re-emit the capability to apply a tenant binding.

**Rejected alternatives.** Full per-tenant flow forks multiply review effort. Automatic fuzzy matching can choose a semantically wrong control. An open-ended model fallback would change the production execution contract. The current implementation takes the narrower, explainable compatibility boundary.

**Boundary.** Presentation restrictions cannot guarantee semantic equivalence. A reviewer must still confirm what “Find client” does. Known risky aliases are blocked, but arbitrary newly named dangerous controls are not semantically classified. A fingerprint is an expected UI marker, not attestation. Hashes detect content differences, not malicious edits to both configuration and expected hashes.

**Falsification.** The lab must fail on an unbound tenant, base-digest drift, added permissions, conflicting locators, and the same wrong-member fault that protects the base app. A second tenant passing only the happy path is insufficient evidence.

## 3. Treat an uncertain action as uncertain

**Problem.** A timeout after a click cannot establish whether the application applied the action. Blindly retrying a financial action can duplicate it.

**Decision.** Only a specifically recognized transient condition invokes a predeclared retry control, with a budget of two. Other uncertain clicks require the operator to establish the recorded postcondition; they are not automatically repeated. Irreversible actions are blocked in this read-only implementation.

**Boundary.** This does not solve write idempotency. A future transfer capability needs a transaction identifier, preconditions, an idempotency mechanism where available, and post-action reconciliation. “Retries with exponential backoff” alone would be an unsafe design answer.

## 4. Preserve evidence without preserving account data

**Problem.** Screenshots, full DOM dumps, trace files, and raw browser exceptions can capture PII, input values, session identifiers, or balances.

**Decision.** Persist structured actions, known-control presence, match counts, geometry, and invariant verdicts. Keep raw inputs and extracted outputs in memory, redact sensitive outputs before JSON serialization, and avoid logging provider/browser error payloads. A structured log remains parseable after redaction.

**Trade-off.** A control inventory is less useful than a screenshot for investigating unknown UI. We accept that limitation rather than claim generic redaction is complete. Extending to unfamiliar surfaces requires reviewed capture masks or a separately protected evidence store with explicit retention and access policies.

## 5. Make measurement claims narrow

The assurance report binds cases to a capability hash and includes both positive and negative tests. A case passes if the observed outcome matches its declared expectation, including a deliberate rejection. Thus 15/15 expected behaviors is not a 100% task-completion rate. Timings are local diagnostics, not benchmarks. An authored fixture validates replay and compatibility; it cannot prove a model discovered the workflow. The submission-readiness check preserves that distinction.
