# Architecture

LLM Automation Platform separates model-driven discovery from deterministic execution. Both paths operate through a surface adapter and policy boundary. The model sees a live inventory of reviewed visible controls, selects a typed action, and receives the next observation. Private parameter values are resolved inside the adapter. Successful discovery records actions and observed checkpoints into a capability. Replay consumes that artifact without importing a model client.

The concrete surface is LedgerDesk, a local synthetic banking application with server-rendered tables and a named iframe. The app profile supplies locators, permissions, and condition detectors, not action order. This deliberately trades open-ended exploration for a small auditable control vocabulary. A single Node.js process, JSON files, and an in-process local operator server make ownership and debugging easy to follow. The sandbox has no data API used by automation.

The main hypothesis is that a capability can preserve business correctness across presentation differences while failing closed on semantic uncertainty. The [assurance lab](evidence/assurance/SUMMARY.md) exercises 15 cases across two presentations. Genuine API discovery evidence is still pending model credentials; fixture runs must not be presented as that evidence.

# Artifact schema

A schema 1.1 capability has schema/capability versions, product/version binding, a profile digest, explicit targets, typed inputs/outputs, ordered actions, checkpoints, input-bound identity postconditions, and provenance. Actions are a closed union: navigate, fill from an input binding, click, or extract into a declared output. There is no arbitrary JavaScript, credential field, or coordinate macro. Output sensitivity is separate from type. Old 1.0 artifacts are archived and rejected, rather than silently acquiring unverified safety assertions.

Targets use exact role/name, label, or text within an explicit frame. Replay preflights every action, binding, and postcondition before browser interaction. The capability describes the flow; the profile defines controls, entry state, and application conditions. Canonical hashes bind content independently of object-key order. Deployment origin is excluded to support explicitly chosen instances. These hashes detect mismatches, not authenticity or human approval.

# Determinism & error handling

Determinism means a fixed interpreter, reviewed locators, declared checkpoints, and bounded recovery. Playwright waits for visibility/actionability; selectors must identify exactly one control. A heading checkpoint is insufficient: before extraction and final success, the adapter privately compares the displayed entity with the bound input. The lab deliberately returns the wrong member on an otherwise correct account screen. Both tenant variants reject this with `ENTITY_MISMATCH` before reading the balance. Numeric parsing also rejects malformed outputs.

Known conditions have separate meanings: missing members and invalid identifiers return business outcomes; transient service errors invoke the reviewed retry control at most twice; permission denial stops with a hard failure. A session expiry or unknown state at a recorded checkpoint requests intervention. An uncertain click is never automatically repeated. The operator may establish its postcondition. Irreversible actions are blocked entirely.

Failures include step, expected state, observed controls, and a sanitized DOM diagnostic with selectors, match counts, and geometry. Logs capture actions, invariant verdicts, recoveries, model metadata, and control transfers. The lab verifies 15/15 expected behaviors and zero replay model calls, linking each case to its evidence and the same capability hash. This counts correct outcomes and correct rejections; it is not a 100% business-success rate or a production reliability estimate. Recorder tests use labeled test doubles.

# Heterogeneity & multi-tenant

`ManagedSurface` separates observe/act/check/evidence and session ownership from the flow interpreter. The current browser adapter uses scoped semantic locators and supports the demo's iframe/table surface without test IDs. This does not solve every legacy UI: a desktop adapter would need accessibility or image-anchor target variants, capability negotiation, deterministic target resolution, and a desktop-session transport. Screenshot interpretation during discovery cannot simply become an unreliable fixed coordinate during replay.

Cross-tenant reuse is implemented with `TenantSurface`: an unchanged canonical capability executes against a compiled presentation overlay. Harbor CU changes branding, iframe title, labels, and headings. The overlay is pinned to the base digest and cannot add routes, permissions, targets, output mappings, recovery rules, or remove identity assertions. Unknown fields, known-risk aliases, locator collisions, and base drift are rejected. The lab shows bound success and unbound failure. Label semantics still require review; schema restrictions cannot prove a renamed control is safe. Production needs approval history, per-tenant isolation, and version invalidation, not automatic unreviewed fallback.

# Escalation & handoff

Ownership moves from automation to paused to human, then back to automation only after a verified resume checkpoint. The operator console displays capability, step, reason, and expected state. The actual browser window is the live state to inspect. Automation rejects actions while it lacks ownership. Human click/input/control events are recorded without entered values. The same page, cookies, and browser context survive the transfer.

The local console uses a per-run nonce, loopback binding, abort, and a five-minute timeout. Resume waits briefly for navigation to settle; invalid restoration fails closed. Identity is checked again before extraction. Without interactive mode, the request is persisted and the run stops. Discovery routes repeated-state loops and exhausted budgets to intervention. Manual discovery changes require a fresh recording, so unobserved human steps cannot become an incomplete capability. Operator tests are simulations. A remote console would need authenticated operators, leases, durable session routing, and an event transport.

# Safety

The profile enforces exact origin/path and action/target allowlists. Direct navigation is restricted to the configured entry point. Browser request interception also blocks out-of-scope destinations, disallowed methods, downloads, popups, WebSockets, and service workers. The only permitted POST is synthetic session restoration during human control. Transfer controls are blocked before interaction. No model-generated code executes.

The model receives approved static control labels and parameter names, not account names, balances, URLs with identifiers, or input values. Bound inputs and sensitive outputs are redacted structurally before JSON persistence; secrets and common identifiers receive additional filtering. Provider responses/errors and raw browser errors are not dumped. OpenAI requests use `store:false`; this is not a claim of zero provider-side retention. The operator is a trusted local user, and policy cannot prevent that person using unrelated applications. Reviewed labels and profiles are trusted configuration. New applications require data classification, audited extraction targets, and stronger isolation before real financial use.

# Cuts

No production banking integration, credential vault, desktop transport, distributed queue, tenancy database, approval registry, or write transaction is included. Tenant variants share a synthetic server; this demonstrates compatibility, not tenant isolation. Training-session restoration is synthetic. The semantic control inventory is hand-authored; unknown widgets are outside its scope. Invalid model decisions stop without unbounded repair.

Next: collect genuine discovery and linked replay, conduct a real operator walkthrough, then challenge the adapter against an independently built legacy application. Identity checks cannot detect an application lying consistently about both identifier and balance; write workflows also need application-level idempotency and reconciliation. See [decision notes](docs/DECISIONS.md) for alternatives and falsification criteria. Submission remains incomplete until genuine discovery evidence exists.
