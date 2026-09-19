import io
import json
import os
import unittest
from unittest.mock import patch

from automation_api.worker import main
from test_providers import response


class WorkerTests(unittest.TestCase):
    def run_worker(self, raw):
        output = io.StringIO()
        with patch('sys.stdin', io.TextIOWrapper(io.BytesIO(raw))), patch('sys.stdout', output):
            main()
        return json.loads(output.getvalue())

    def test_request_through_connector_and_response_normalization(self):
        with patch.dict(os.environ, {'LLM_MODEL': 'test', 'OPENAI_API_KEY': 'test-secret'}, clear=True), \
                patch('automation_api.providers.post_json', return_value=response()):
            result = self.run_worker(b'{"version":1,"context":{"goal":"Read"}}')
        self.assertTrue(result['ok'])
        self.assertEqual(result['responseId'], 'test_response')
        self.assertEqual(result['decision']['done'], True)

    def test_bad_protocol_rejected_before_api_call(self):
        with patch('automation_api.providers.post_json') as transport:
            for raw in [b'{}', b'[]', b'invalid', b'{"version":true,"context":{}}',
                        b'{"version":2,"context":{}}', b'{"version":1,"context":{},"extra":1}',
                        b'x' * 1_048_577]:
                with self.subTest(raw=raw[:50]):
                    self.assertEqual(self.run_worker(raw)['code'], 'MODEL_PROTOCOL_ERROR')
            transport.assert_not_called()

    def test_unexpected_errors_are_sanitized(self):
        with patch('automation_api.worker.decide', side_effect=RuntimeError('test-secret')):
            result = self.run_worker(b'{"version":1,"context":{}}')
        self.assertEqual(result, {'version': 1, 'ok': False, 'code': 'MODEL_UNAVAILABLE'})
