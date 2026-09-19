# Architecture

Capability Runner separates model-driven discovery from deterministic execution. Both paths operate through a surface adapter and policy boundary. The model sees a live inventory of reviewed visible controls, selects a typed action, and receives the next observation. Private parameter values are resolved inside the adapter. Successful discovery records actions and observed checkpoints into a capability. Replay consumes that artifact without importing a model client.

The concrete surface is LedgerDesk, a local synthetic banking application with server-rendered tables and a named iframe. The app profile supplies locators, permissions, and condition detectors, not action order. This deliberately trades open-ended exploration for a small auditable control vocabulary. A single Node.js process, JSON files, and an in-process local operator server make ownership and debugging easy to follow. The sandbox has no data API used by automation.

Current validation includes real browser replay and an observation-driven discovery test double. Genuine API discovery evidence is still pending model credentials; fixture runs must not be presented as that evidence.

# Artifact schema

A capability has schema and capability versions, product/version binding, a digest of the reviewed profile, explicit target descriptors, typed input/output fields, ordered actions, checkpoints, a final success condition, and provenance. Actions are a closed union: navigate, fill from an input binding, click, or extract into a declared output. There is no arbitrary JavaScript, raw credential field, or coordinate macro. The output contract declares sensitivity separately from type.

Target descriptors use exact role/name, label, or text matches within an explicit frame. Replay validates that embedded targets, output bindings, and checkpoints match the reviewed profile, so a modified artifact cannot silently expand its authority. The capability describes the flow; the profile describes supported controls and known application conditions. Their digest binding prevents unnoticed edits to either targeting or policy. Deployment origin is excluded from that digest to permit the same reviewed application on another explicitly supplied origin.

# Determinism & error handling

Determinism means a fixed interpreter, reviewed locators, declared checkpoints, and bounded recovery. It does not mean ignoring runtime state. Playwright waits for visibility and actionability; selectors must identify one control. Checkpoints confirm exact expected text. Final success requires the verified account screen and every declared typed output. Numeric output parsing rejects unexpected content.

Known conditions have separate meanings: missing members and invalid identifiers return business outcomes; transient service errors invoke the reviewed retry control at most twice; permission denial stops with a hard failure. A session expiry or unknown state at a recorded checkpoint requests intervention. An uncertain click is never automatically repeated. The operator may establish its postcondition. Irreversible actions are blocked entirely.

Failure results identify the step, expected state, observed reviewed controls, and a sanitized DOM diagnostic containing selector definitions, match counts, and geometry. Structured logs record actions, conditions, recoveries, model response metadata, and control transfers. Model operational justifications are logged, but raw page text, traces, and screenshots are not persisted. Tests cover changed input, business outcomes, recovery exhaustion, policy rejection, profile drift, same-session handoff, invalid resume, and redaction. Recorder tests use explicitly labeled test doubles; replay tests make no model calls.

# Heterogeneity & multi-tenant

`ManagedSurface` separates observe/act/check/evidence and session ownership from the flow interpreter. The current browser adapter uses scoped semantic locators and supports the demo's iframe/table surface without test IDs. This does not solve every legacy UI: a desktop adapter would need accessibility or image-anchor target variants, capability negotiation, deterministic target resolution, and a desktop-session transport. Screenshot interpretation during discovery cannot simply become an unreliable fixed coordinate during replay.

For multi-tenant reuse, keep a base capability per vendor/product version and reviewed tenant profiles for frame names, labels, entry origins, and permitted routes. Merge overrides before validation, hash the effective profile, and certify each supported binding through replay checks. The current implementation intentionally fails on mismatched profiles rather than silently accepting overrides. Fingerprints, missing/ambiguous controls, and checkpoints detect incompatible instances. A production registry would track compatible bindings, approval history, and invalidations. Multi-tenant infrastructure is not implemented.

# Escalation & handoff

Ownership moves from automation to paused to human, then back to automation only after a verified resume checkpoint. The operator console displays capability, step, reason, and expected state. The actual browser window is the live state to inspect. Automation rejects actions while it lacks ownership. Human click/input/control events are recorded without entered values. The same page, cookies, and browser context survive the transfer.

The local console requires a per-run nonce, binds to loopback, rejects invalid transitions, and supports abort and a five-minute timeout. Resume briefly waits for an in-flight navigation to settle. Invalid restoration fails closed. Without interactive mode, an intervention request is persisted and the run stops. Tests simulate an operator using the same page; they are labeled accordingly. Manual changes during discovery are not silently converted into replayable actions: a stuck discovery can be handed off, but recording requires a fresh run afterward. A remote console would add authenticated operators, leases, durable session routing, and an event transport.

# Safety

The profile enforces exact origin/path and action/target allowlists. Direct navigation is restricted to the configured entry point. Browser request interception also blocks out-of-scope destinations, disallowed methods, downloads, popups, WebSockets, and service workers. The only permitted POST is synthetic session restoration during human control. Transfer controls are blocked before interaction. No model-generated code executes.

The model receives approved static control labels and parameter names, not account names, balances, URLs with identifiers, or input values. Bound inputs and sensitive outputs are redacted structurally before JSON persistence; secrets and common identifiers receive additional filtering. Provider responses/errors and raw browser errors are not dumped. OpenAI requests use `store:false`; this is not a claim of zero provider-side retention. The operator is a trusted local user, and policy cannot prevent that person using unrelated applications. Reviewed labels and profiles are trusted configuration. New applications require data classification, audited extraction targets, and stronger isolation before real financial use.

# Cuts

No production banking integration, credential vault, remote desktop transport, distributed queue, tenancy database, approval registry, or write transaction is included. The operator console is intentionally minimal; training-session restoration is synthetic. The app's small semantic control inventory is hand-authored, and arbitrary unknown widgets are outside its capabilities. JSON decisions are validated locally; malformed model output stops instead of launching an unbounded repair loop.

Next: collect a genuine model discovery and linked replay, conduct a real operator walkthrough, then implement one reviewed tenant variant. Broader surface support would require new target types and adapter contract tests before additional infrastructure. The submission should be described as incomplete until genuine discovery evidence exists.
