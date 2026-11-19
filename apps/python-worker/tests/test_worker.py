import json
import os
import subprocess
import sys
import unittest

WORKER_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
MAIN_PY = os.path.join(WORKER_DIR, "main.py")
if WORKER_DIR not in sys.path:
    sys.path.insert(0, WORKER_DIR)

from worker.protocol import make_error_response, make_success_response  # noqa: E402
from main import process_line  # noqa: E402


class TestPythonWorker(unittest.TestCase):
    def test_ping_command(self) -> None:
        req = json.dumps({"id": "1", "command": "ping", "payload": {"message": "hello"}})
        res = process_line(req)
        self.assertTrue(res["ok"])
        self.assertEqual(res["id"], "1")
        self.assertTrue(res["data"]["pong"])
        self.assertEqual(res["data"]["echo"], "hello")

    def test_health_check_command(self) -> None:
        req = json.dumps({"id": "2", "command": "health_check"})
        res = process_line(req)
        self.assertTrue(res["ok"])
        self.assertEqual(res["data"]["status"], "healthy")
        self.assertIn("pythonVersion", res["data"])

    def test_unknown_command(self) -> None:
        req = json.dumps({"id": "3", "command": "non_existent"})
        res = process_line(req)
        self.assertFalse(res["ok"])
        self.assertEqual(res["error"]["code"], "UNKNOWN_COMMAND")

    def test_invalid_json(self) -> None:
        res = process_line("{bad json")
        self.assertFalse(res["ok"])
        self.assertEqual(res["error"]["code"], "INVALID_JSON")

    def test_subprocess_ndjson_roundtrip(self) -> None:
        proc = subprocess.Popen(
            [sys.executable, MAIN_PY],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            cwd=WORKER_DIR,
        )
        assert proc.stdin is not None
        assert proc.stdout is not None

        proc.stdin.write(json.dumps({"id": "sub-1", "command": "ping"}) + "\n")
        proc.stdin.write(json.dumps({"id": "sub-2", "command": "shutdown"}) + "\n")
        proc.stdin.flush()

        line1 = json.loads(proc.stdout.readline())
        line2 = json.loads(proc.stdout.readline())
        exit_code = proc.wait(timeout=5)

        self.assertEqual(exit_code, 0)
        self.assertTrue(line1["ok"])
        self.assertEqual(line1["id"], "sub-1")
        self.assertTrue(line2["data"]["shuttingDown"])


if __name__ == "__main__":
    unittest.main()
