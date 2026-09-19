import io
import json
import unittest
from unittest.mock import patch
from urllib.error import HTTPError, URLError

from automation_api.providers import (
    Config, MAX_BYTES, NoRedirect, ProviderError, build_request, decide, normalize, post_json,
)

DECISION = {"done": True, "reason": "Goal verified"}


def response(provider="openai"):
    common = {"id": "test_response", "usage": {"input_tokens": 12, "output_tokens": 4,
                                              "private_text": "do-not-log", "total_tokens": -1}}
    text = json.dumps(DECISION)
    if provider == "openai":
        return {**common, "status": "completed", "output": [
            {"type": "reasoning"}, {"content": [{"type": "output_text", "text": text}]}]}
    if provider == "anthropic":
        return {**common, "stop_reason": "end_turn", "content": [{"type": "text", "text": text}]}
    return {**common, "choices": [{"finish_reason": "stop", "message": {"content": text}}]}


class ProviderTests(unittest.TestCase):
    def config(self, provider="openai", **updates):
        env = {"LLM_PROVIDER": provider, "LLM_MODEL": "test-model",
               "OPENAI_API_KEY": "test-secret", "ANTHROPIC_API_KEY": "test-secret", **updates}
        return Config.from_env(env)

    def test_all_provider_requests_and_normalization(self):
        for provider, suffix in [("openai", "/responses"), ("anthropic", "/messages"),
                                 ("compatible", "/chat/completions")]:
            with self.subTest(provider=provider):
                config = self.config(provider)
                headers, body = build_request(config, {"goal": "Read balance", "controls": []})
                self.assertTrue(config.endpoint.endswith(suffix))
                self.assertEqual(body["model"], "test-model")
                self.assertNotIn("test-secret", json.dumps(body))
                self.assertNotIn("test-secret", repr(config))
                self.assertEqual(headers.get("x-api-key", headers.get("Authorization")),
                                 "test-secret" if provider == "anthropic" else "Bearer test-secret")
                result = normalize(provider, response(provider))
                self.assertEqual(result["decision"], DECISION)
                self.assertEqual(result["usage"], {"input_tokens": 12, "output_tokens": 4})
                if provider == "openai":
                    self.assertIs(body["store"], False)
                    self.assertEqual(body["text"]["format"]["type"], "json_object")

    def test_configuration_rejects_unsafe_endpoints(self):
        for base in ["http://api.example/v1", "https://user:secret@api.example/v1",
                     "https://api.example/v1?key=x", "https://api.example/v1#fragment",
                     "https:///v1", "https://api.example:bad/v1"]:
            with self.subTest(base=base), self.assertRaisesRegex(ProviderError, "MODEL_CONFIG"):
                self.config(LLM_BASE_URL=base)
        for updates in [{"LLM_MODEL": ""}, {"OPENAI_API_KEY": ""}, {"LLM_PROVIDER": "unknown"}]:
            with self.assertRaises(ProviderError):
                self.config(**updates)

    def test_incomplete_refused_or_malformed_output_is_rejected(self):
        cases = [("openai", {**response(), "status": "incomplete"}),
                 ("anthropic", {**response("anthropic"), "stop_reason": "max_tokens"}),
                 ("compatible", {**response("compatible"), "choices": []}),
                 ("openai", {**response(), "output": [{"content": [{"type": "refusal"}]}]}),
                 ("openai", {**response(), "id": "private value with spaces"})]
        for provider, data in cases:
            with self.subTest(provider=provider), self.assertRaisesRegex(ProviderError, "MODEL_INVALID_RESPONSE"):
                normalize(provider, data)

    def test_network_errors_do_not_echo_provider_content_or_retry(self):
        for error, code in [(HTTPError("https://example", 401, "test-secret", {}, io.BytesIO(b"private")), "MODEL_HTTP_ERROR"),
                            (URLError("test-secret"), "MODEL_UNAVAILABLE"),
                            (TimeoutError("private"), "MODEL_UNAVAILABLE")]:
            with patch("automation_api.providers.build_opener") as factory:
                factory.return_value.open.side_effect = error
                with self.assertRaisesRegex(ProviderError, code) as caught:
                    post_json("https://example", {}, {})
                self.assertNotIn("test-secret", str(caught.exception))
                factory.return_value.open.assert_called_once()

    def test_transport_bounds_and_parses_response(self):
        for raw, valid in [(json.dumps(response()).encode(), True), (b"not-json", False),
                           (b"[]", False), (b"x" * (MAX_BYTES + 1), False)]:
            with patch("automation_api.providers.build_opener") as factory:
                factory.return_value.open.return_value.__enter__.return_value.read.return_value = raw
                if valid:
                    self.assertEqual(post_json("https://example", {}, {}), response())
                else:
                    with self.assertRaisesRegex(ProviderError, "MODEL_INVALID_RESPONSE"):
                        post_json("https://example", {}, {})

    def test_redirect_is_not_followed(self):
        with self.assertRaisesRegex(ProviderError, "MODEL_HTTP_ERROR"):
            NoRedirect().redirect_request(None, None, 302, "", {}, "https://other.example")

    def test_connector_integration_uses_transport(self):
        with patch("automation_api.providers.post_json", return_value=response()) as transport:
            result = decide({"goal": "Read"}, {"LLM_MODEL": "test", "OPENAI_API_KEY": "test-secret"})
            self.assertEqual(result["decision"], DECISION)
            self.assertEqual(transport.call_args.args[0], "https://api.openai.com/v1/responses")


if __name__ == "__main__":
    unittest.main()
