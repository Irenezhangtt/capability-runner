"""Normalize three model APIs behind one bounded, non-retrying transport."""
from __future__ import annotations

import json
import math
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Mapping
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

MAX_BYTES = 1_048_576
INSTRUCTIONS = Path(__file__).with_name("instructions.txt").read_text(encoding="utf-8")


class ProviderError(Exception):
    """Only a stable code crosses the process boundary, never provider error text."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


@dataclass(frozen=True)
class Config:
    provider: str
    model: str
    key: str = field(repr=False)
    endpoint: str

    @classmethod
    def from_env(cls, env: Mapping[str, str]) -> Config:
        provider = env.get("LLM_PROVIDER") or "openai"
        model = env.get("LLM_MODEL", "")
        key = env.get("ANTHROPIC_API_KEY" if provider == "anthropic" else "OPENAI_API_KEY", "")
        if provider not in {"openai", "anthropic", "compatible"} or not model or not key:
            raise ProviderError("MODEL_CONFIG")
        base = (env.get("LLM_BASE_URL") or "https://api.openai.com/v1").rstrip("/")
        endpoint = (
            "https://api.anthropic.com/v1/messages" if provider == "anthropic"
            else base + ("/chat/completions" if provider == "compatible" else "/responses")
        )
        try:
            url = urlsplit(endpoint)
            if (url.scheme != "https" or not url.hostname or url.username or url.password
                    or url.query or url.fragment or any(c.isspace() for c in endpoint)):
                raise ValueError()
            _ = url.port
        except ValueError:
            raise ProviderError("MODEL_CONFIG") from None
        return cls(provider, model, key, endpoint)


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # Never forward credentials to a redirected host.
        raise ProviderError("MODEL_HTTP_ERROR")


def post_json(endpoint: str, headers: dict, body: dict) -> dict:
    request = Request(endpoint, data=json.dumps(body).encode("utf-8"), headers=headers, method="POST")
    try:
        with build_opener(NoRedirect()).open(request, timeout=30) as response:
            raw = response.read(MAX_BYTES + 1)
            if len(raw) > MAX_BYTES:
                raise ProviderError("MODEL_INVALID_RESPONSE")
            data = json.loads(raw)
            if not isinstance(data, dict):
                raise ProviderError("MODEL_INVALID_RESPONSE")
            return data
    except HTTPError:
        raise ProviderError("MODEL_HTTP_ERROR") from None
    except (URLError, OSError):
        raise ProviderError("MODEL_UNAVAILABLE") from None
    except (ValueError, UnicodeError):
        raise ProviderError("MODEL_INVALID_RESPONSE") from None


def build_request(config: Config, context: dict) -> tuple[dict, dict]:
    content = json.dumps(context, ensure_ascii=False)
    headers = {"Content-Type": "application/json"}
    if config.provider == "anthropic":
        headers.update({"x-api-key": config.key, "anthropic-version": "2023-06-01"})
        body = {"model": config.model, "max_tokens": 1024, "system": INSTRUCTIONS,
                "messages": [{"role": "user", "content": content}]}
    else:
        headers["Authorization"] = "Bearer " + config.key
        if config.provider == "compatible":
            body = {"model": config.model, "messages": [
                {"role": "system", "content": INSTRUCTIONS},
                {"role": "user", "content": content}], "response_format": {"type": "json_object"}}
        else:
            body = {"model": config.model, "instructions": INSTRUCTIONS, "input": content,
                    "text": {"format": {"type": "json_object"}}, "store": False,
                    "max_output_tokens": 2048}
    return headers, body


def normalize(provider: str, data: dict) -> dict[str, Any]:
    try:
        if provider == "anthropic":
            if data.get("stop_reason") != "end_turn":
                raise ValueError()
            text = "".join(c["text"] for c in data["content"] if c["type"] == "text")
        elif provider == "compatible":
            choice = data["choices"][0]
            if choice.get("finish_reason") != "stop":
                raise ValueError()
            text = choice["message"]["content"]
        else:
            if data.get("status") != "completed":
                raise ValueError()
            text = "".join(c["text"] for o in data["output"] for c in o.get("content", [])
                           if c["type"] == "output_text")
        decision = json.loads(text)
        response_id = data["id"]
        if (not isinstance(decision, dict) or not isinstance(response_id, str)
                or not re.fullmatch(r"[A-Za-z0-9_.:-]{1,256}", response_id)):
            raise ValueError()
        # Allow only numeric token counters into evidence, not arbitrary provider metadata.
        source = data.get("usage") or {}
        usage = {k: v for k, v in source.items() if k in {
            "input_tokens", "output_tokens", "total_tokens", "prompt_tokens", "completion_tokens"
        } and type(v) in (int, float) and math.isfinite(v) and v >= 0}
        return {"decision": decision, "responseId": response_id, "usage": usage}
    except (KeyError, IndexError, TypeError, ValueError, AttributeError):
        raise ProviderError("MODEL_INVALID_RESPONSE") from None


def decide(context: dict, env: Mapping[str, str]) -> dict:
    config = Config.from_env(env)
    headers, body = build_request(config, context)
    return normalize(config.provider, post_json(config.endpoint, headers, body))
