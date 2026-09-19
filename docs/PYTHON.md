# Python API integration

[← Platform overview](../README.md)

Python owns the model API connectors. TypeScript owns browser execution, workflow contracts, safety policy, and operator handoff. `npm run discover` uses both; deterministic replay needs only Node.js and a browser.

## Why this boundary?

Provider authentication, request formats, and response formats belong in one integration layer. Python gives future model experiments and provider integrations a reusable starting point. The browser runtime still validates every returned decision using the existing Zod schema and application policy. A model response cannot bypass those checks.

This is a local subprocess, not a deployed API service. It uses Python's standard library, so there are no extra packages or servers to install. Each decision starts a short-lived worker; that adds process startup overhead but keeps lifecycle management simple for this prototype. It is not an OS security sandbox.

## Setup and use

Install Python 3.10+ (CI uses 3.12). Existing `.env` settings still select the provider, model, and key. Node loads `.env` and passes only the selected provider key and required configuration to Python. Set `PYTHON_BIN` if Python is installed under a different executable path.

```dotenv
LLM_PROVIDER=openai
LLM_MODEL=YOUR_ENABLED_MODEL_ID
OPENAI_API_KEY=YOUR_LOCAL_KEY
# PYTHON_BIN=/absolute/path/to/python3
```

Then use the existing [discovery and replay commands](RUNNING.md). No new command is required for live discovery.

| Provider     | Python connector        | Configuration                                 |
| ------------ | ----------------------- | --------------------------------------------- |
| `openai`     | Responses API           | `OPENAI_API_KEY`, `LLM_MODEL`                 |
| `anthropic`  | Messages API            | `ANTHROPIC_API_KEY`, `LLM_MODEL`              |
| `compatible` | Chat Completions format | `OPENAI_API_KEY`, `LLM_MODEL`, `LLM_BASE_URL` |

Compatible services must support JSON mode and return a response ID, a `stop` finish reason, and decision text. Compatibility with an arbitrary endpoint is not guaranteed. Configured endpoints must use HTTPS, with no URL credentials, query, or fragment. Redirects are rejected. OpenAI requests set `store: false`; this is not a claim of zero provider retention.

## Process contract

`src/planner.ts` invokes `python/run_planner.py` without a shell. One versioned JSON request travels through stdin and one response returns through stdout. Keys use the child environment, never command arguments or the JSON request. The context contains the existing approved observations and parameter names; private bound values stay in the browser runtime.

```json
{ "version": 1, "context": { "goal": "Read the requested account", "controls": [] } }
```

Success returns `version`, `ok`, `decision`, `responseId`, and numeric token `usage`. Failure returns only `version`, `ok`, and a stable error `code`. Raw provider error bodies, tracebacks, and stderr are not added to evidence. Accepted decisions produce a `model_response` event with `transport: "python"`.

Requests and responses are limited to 1 MiB. HTTP operations use a 30-second socket timeout; the parent kills the worker after 35 seconds to bound the whole call. There are no automatic retries or provider fallbacks. Incomplete, refused, or invalid responses stop discovery rather than silently switching models or manufacturing an action.

## Development and verification

- `python/automation_api/providers.py`: configuration, HTTP transport, request construction, response normalization.
- `python/automation_api/instructions.txt`: bounded discovery prompt.
- `python/automation_api/worker.py`: versioned stdin/stdout protocol and safe errors.
- `tests/planner.test.ts`: process bridge and TypeScript decision validation.
- `python/tests/`: connector and protocol tests using mocked provider responses.

```bash
npm run test:python
node --import tsx --test tests/planner.test.ts
```

Tests cover the three request formats, normalization, unsafe URLs, redirects, HTTP failures, timeouts, malformed and incomplete responses, size limits, protocol errors, and secret-safe failure handling. These tests do not establish live provider compatibility. Genuine API-backed discovery and linked replay evidence remain pending credentials.

API references: [OpenAI Responses](https://developers.openai.com/api/reference/resources/responses/methods/create), [Anthropic Messages](https://platform.claude.com/docs/en/api/messages/create).
