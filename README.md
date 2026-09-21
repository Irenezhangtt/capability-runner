# LLM Automation Platform for Operations Teams

**Product & Engineering Report · Irene Zhang**

[Interactive demo](https://irenezhangtt.github.io/llm-automation-platform/) · [Browser walkthrough](docs/DEMO.md) · [Technical design](REPORT.md) · [Run locally](docs/RUNNING.md)

## About

LLM Automation Platform is a prototype for automating repeatable tasks in business applications without usable APIs. It is designed for operations teams, with automation engineers configuring workflows and operators resolving exceptions.

The reference task is a savings-account lookup: find a member, open the account, verify the member's identity, and return the balance and currency. It runs against a synthetic banking application with server-rendered pages, tables, and an iframe.

The central design decision is to separate workflow discovery from execution. An LLM can help identify the steps needed to complete a task. Once recorded, those steps become a versioned contract with defined inputs, permitted actions, outputs, and success conditions. Repeated runs follow that contract without further model calls. This makes execution easier to inspect and puts a limit on what the automation can do.

**Delivery status:** the browser runtime, Python API connectors, exception handling, and local operator console are implemented. Replay is validated against synthetic applications. Live API-backed discovery evidence is still pending; this is not a production banking deployment.

## Users and operating model

| User                        | Responsibility                                        | Product support                                                                            |
| --------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Operations specialist       | Complete a lookup and resolve interrupted work        | Structured outcomes; takeover of the existing browser session                              |
| Automation engineer         | Configure application controls and maintain workflows | Typed capabilities, application policies, version checks, and tenant presentation adapters |
| Operations lead or reviewer | Understand why a run succeeded or stopped             | Redacted event logs, identity-check results, and failure diagnostics                       |

The intended use case is a stable, repetitive workflow whose result can be checked explicitly. New applications still require an engineer to define and review their controls. Arbitrary websites, desktop applications, and financial write transactions are outside the current scope.

## Product design

![Architecture: model-led discovery produces a versioned capability, which a deterministic runtime executes within safety policy and human oversight.](docs/assets/platform-overview.svg)

| Stage     | Implementation                                                                                                                    | Design consequence                                                                                                |
| --------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Discover  | Python connects to OpenAI, Anthropic, or compatible model APIs. The model selects bounded actions from reviewed visible controls. | Provider integration stays separate from browser execution. Model decisions remain subject to runtime validation. |
| Record    | A successful discovery produces a typed, versioned capability with parameters, checkpoints, and identity conditions.              | The workflow is inspectable and reusable with new inputs.                                                         |
| Execute   | TypeScript and Playwright interpret the capability, check the application state, and extract validated outputs.                   | Replay requires no model calls. Unknown or ambiguous states stop execution.                                       |
| Intervene | A local console transfers control to an operator, then verifies the restored state before resuming.                               | The browser page, cookies, and session survive the interruption.                                                  |

Two choices are particularly important:

- **Verify the business entity.** A correct-looking account page can belong to the wrong member. The runtime compares the displayed identifier with the requested input before extracting a balance.
- **Constrain reuse across institutions.** A presentation adapter handles differences in labels and frames. It cannot expand permissions, change output definitions, or remove identity checks. The same capability runs against LedgerDesk and Harbor CU.

These choices require more configuration than unrestricted browser exploration. The tradeoff is a smaller execution surface and explicit conditions under which a run must stop. See [design decisions](docs/DECISIONS.md) for the alternatives and remaining limitations.

## Exceptions and controls

| Condition                                            | Runtime response                                                  |
| ---------------------------------------------------- | ----------------------------------------------------------------- |
| Member absent or identifier invalid                  | Return a defined business outcome                                 |
| Recognized temporary service error                   | Apply the reviewed recovery action, with a maximum of two retries |
| Wrong member, ambiguous control, or malformed output | Stop with a specific failure code                                 |
| Permission denied                                    | Stop without attempting a bypass                                  |
| Expired session or unexpected checkpoint             | Request operator intervention; verify state before resuming       |

Application policy restricts routes and actions. Bound inputs and sensitive outputs are redacted before evidence is written. Provider errors are not copied into logs. These controls are implemented for the local prototype; remote operation would require authenticated operators, durable session ownership, and tenant isolation.

## Validation and evidence

| Evidence                                      | Result                                     | Scope                                                                                                            |
| --------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| TypeScript/browser tests                      | 31 passed                                  | Contracts, replay, safety, tenant bindings, handoff, and Python process bridge                                   |
| Python tests                                  | 10 passed                                  | Provider request formats, response handling, protocol validation, and safe errors; provider responses are mocked |
| [Fault corpus](evidence/assurance/SUMMARY.md) | 15/15 expected outcomes                    | Two synthetic presentations; includes correct rejections and recovery behavior                                   |
| [Browser captures](docs/DEMO.md)              | Four verified scenarios, eight screenshots | Successful lookup, tenant reuse, wrong-member rejection, and scripted operator restoration                       |

Both presentations reject the wrong-member counterexample before extraction. Recorded replay cases make zero model calls. These results establish behavior within the test corpus; they do not establish production reliability, time savings, or model-discovery accuracy.

## Review the product

**[Open the interactive workflow studio](https://irenezhangtt.github.io/llm-automation-platform/)** to try sample inputs, failure conditions, human takeover, and trace download. No account or API key is required. Live AI discovery displays **“API token unavailable.”**

The public website is an explicitly labeled browser-side simulation. Its downloaded traces are not execution evidence. The [separate browser walkthrough](docs/DEMO.md) shows the actual Playwright runtime and operator console. Source for both experiences is included in this repository.

## Production readiness

Before a production pilot, the next acceptance gates are:

1. Record genuine API-backed discovery and successful replay of the resulting artifact with changed inputs.
2. Validate the adapter against an independently built application and conduct an operator-led recovery exercise.
3. Add authentication, secret management, isolated tenant sessions, durable run storage, and workflow approval history.
4. Measure task correctness, intervention rate, recovery success, latency, and model cost on representative workloads.

No production SLA or measured business-efficiency claim is made. Financial writes would additionally require application-level idempotency and reconciliation.

<details>
<summary><strong>Developer quick start</strong></summary>

Requires Node.js 22.9+ and Google Chrome or Playwright Chromium. Live discovery also requires Python 3.10+ and a configured model provider.

```bash
npm ci
cp .env.example .env

# Interactive simulation, without a model key:
npm run demo:web

# Real browser replay using an authored capability:
npm run demo:assurance

# Full live evidence run: configure the provider key and LLM_MODEL in .env.
npm run demo:live
npm run check:submission

# Or run discovery and replay separately.
# Start the sandbox in a separate terminal:
npm run app
npm run discover -- --inputs '{"memberId":"12345"}' --evidence evidence/live
npm run replay -- --inputs '{"memberId":"67890"}' --evidence evidence/live
```

Discovery writes `artifacts/lookup-savings.json`; replay loads that artifact. Keep credentials in the ignored local `.env` file.

[Setup and commands](docs/RUNNING.md) · [Python integration](docs/PYTHON.md) · [Assignment coverage](docs/REVIEW.md)

</details>
