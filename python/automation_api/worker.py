"""One JSON request on stdin, one JSON response on stdout. No HTTP listener."""
from __future__ import annotations

import json
import os
import sys

from automation_api.providers import MAX_BYTES, ProviderError, decide


def main() -> None:
    try:
        raw = sys.stdin.buffer.read(MAX_BYTES + 1)
        if len(raw) > MAX_BYTES:
            raise ProviderError("MODEL_PROTOCOL_ERROR")
        request = json.loads(raw)
        if (not isinstance(request, dict) or set(request) != {"version", "context"}
                or type(request["version"]) is not int or request["version"] != 1
                or not isinstance(request["context"], dict)):
            raise ProviderError("MODEL_PROTOCOL_ERROR")
        result = {"version": 1, "ok": True, **decide(request["context"], os.environ)}
    except ProviderError as error:
        result = {"version": 1, "ok": False, "code": error.code}
    except (ValueError, UnicodeError):
        result = {"version": 1, "ok": False, "code": "MODEL_PROTOCOL_ERROR"}
    except Exception:
        # Exceptions may contain headers or prompt text. Do not print a traceback.
        result = {"version": 1, "ok": False, "code": "MODEL_UNAVAILABLE"}
    sys.stdout.write(json.dumps(result, allow_nan=False) + "\n")


if __name__ == "__main__":
    main()
