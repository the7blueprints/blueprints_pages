"""Tests for toolchain_agent.py (the Toolchain Trail pairing agent).

Run from the repository root:
    python3 -m unittest discover -s scripts -p 'test_toolchain_agent.py' -v
"""
import io
import json
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))

import toolchain_agent  # noqa: E402


def fake_runner(outputs):
    def run(command, cwd=None):
        key = " ".join(command[1:]) if command[0] == sys.executable else " ".join(command)
        return outputs.get(key, (127, f"command not found: {command[0]}"))
    return run


class CollectEvidenceTest(unittest.TestCase):
    def test_git_village_redacts_the_email(self):
        runner = fake_runner({
            "git --version": (0, "git version 2.46.0.windows.1\n"),
            "git config --global user.name": (0, "Ada Lovelace\n"),
            "git config --global user.email": (0, "ada@lovelace.dev\n"),
        })
        evidence = toolchain_agent.collect_evidence("git-village-hall", Path("."), runner)
        by_id = {item["id"]: item for item in evidence}
        self.assertEqual(by_id["git-email"]["output"], "a***@lovelace.dev")
        self.assertEqual(by_id["git"]["exitCode"], 0)

    def test_compiler_forge_uses_the_running_python(self):
        runner = fake_runner({"--version": (0, "Python 3.12.4"), "-m pip --version": (0, "pip 24.2 from x")})
        evidence = toolchain_agent.collect_evidence("compiler-canyon-forge", Path("."), runner)
        by_id = {item["id"]: item for item in evidence}
        self.assertEqual(by_id["python"]["output"], "Python 3.12.4")
        self.assertEqual(by_id["ruby"]["exitCode"], 127)
        self.assertEqual([item["id"] for item in evidence], ["python", "pip", "ruby", "bundler", "rubygems"])

    def test_editor_falls_back_to_cursor(self):
        runner = fake_runner({"cursor --version": (0, "0.42.3\nabc\narm64")})
        evidence = toolchain_agent.collect_evidence("editor-isle-tower", Path("."), runner)
        self.assertEqual(evidence[0]["exitCode"], 0)

    def test_terminal_gate_finds_the_folder_in_home(self):
        with tempfile.TemporaryDirectory() as home, tempfile.TemporaryDirectory() as cwd:
            (Path(home) / "toolchain-trail").mkdir()
            with mock.patch.object(Path, "home", return_value=Path(home)), mock.patch.object(Path, "cwd", return_value=Path(cwd)):
                evidence = toolchain_agent.collect_evidence("terminal-town-gate", Path("."))
        by_id = {item["id"]: item for item in evidence}
        self.assertEqual(by_id["working-folder"]["output"], cwd)
        self.assertTrue(by_id["trail-folder"]["output"].endswith("toolchain-trail"))

    def test_every_station_the_backend_knows_has_checks(self):
        runner = fake_runner({})
        for station in ["terminal-town-gate", "compiler-canyon-forge", "editor-isle-tower", "git-village-hall",
                        "github-gateway-arch", "build-bridge", "integration-summit"]:
            self.assertTrue(toolchain_agent.collect_evidence(station, Path("."), runner), station)

    def test_output_is_capped(self):
        runner = fake_runner({"bundle check": (0, "x" * 10000)})
        evidence = toolchain_agent.collect_evidence("build-bridge", Path("."), runner)
        self.assertEqual(len(evidence[0]["output"]), toolchain_agent.MAX_OUTPUT_LENGTH)


class ServerTest(unittest.TestCase):
    def test_only_https_or_localhost_http(self):
        self.assertEqual(toolchain_agent.require_safe_server("https://spring.opencodingsociety.com/"),
                         "https://spring.opencodingsociety.com")
        self.assertEqual(toolchain_agent.require_safe_server("http://localhost:8585"), "http://localhost:8585")
        with self.assertRaises(toolchain_agent.AgentError):
            toolchain_agent.require_safe_server("http://spring.opencodingsociety.com")

    def test_real_command_runner_reports_missing_tools(self):
        code, output = toolchain_agent.run_command(["definitely-not-a-real-tool-xyz"])
        self.assertEqual(code, 127)
        self.assertIn("command not found", output)


class ServeTest(unittest.TestCase):
    """The agent stays open and checks each station the game asks about, once per request."""

    def run_serve(self, next_views, post=None):
        views = iter(next_views)
        posts = []

        def fake_get(url, token=None):
            self.assertEqual(token, "secret-token")
            item = next(views)
            if isinstance(item, Exception):
                raise item
            return item

        def fake_post(url, body, token=None):
            posts.append((url, body, token))
            return post(body) if post else {"status": "VERIFIED", "checks": []}

        def stop_after_views(_seconds):
            pass

        with mock.patch.object(toolchain_agent, "get_json", side_effect=fake_get), \
                mock.patch.object(toolchain_agent, "post_json", side_effect=fake_post), \
                mock.patch.object(toolchain_agent, "run_command", side_effect=fake_runner({"code --version": (0, "1.94.2")})), \
                redirect_stdout(io.StringIO()) as out:
            try:
                code = toolchain_agent.serve("http://localhost:8585", "abc", "secret-token", "linux", Path("."),
                                             sleep=stop_after_views)
            except StopIteration:
                code = None
        return code, posts, out.getvalue()

    def test_checks_each_new_request_once(self):
        editor = {"status": "CHECKING", "stationId": "editor-isle-tower", "requestedAt": 1}
        code, posts, _ = self.run_serve([
            {"status": "CHECKING", "stationId": "build-bridge", "requestedAt": 0},
            editor, editor,
            {"status": "VERIFIED", "stationId": "editor-isle-tower", "requestedAt": 1},
            {"status": "CHECKING", "stationId": "editor-isle-tower", "requestedAt": 2},  # Check again
        ])
        self.assertIsNone(code)
        self.assertEqual([body["stationId"] for _, body, _ in posts],
                         ["build-bridge", "editor-isle-tower", "editor-isle-tower"])
        self.assertTrue(all(url.endswith("/api/toolchain/sessions/abc/results") for url, _, _ in posts))
        self.assertTrue(all(token == "secret-token" for _, _, token in posts))
        self.assertEqual(posts[1][1]["checks"], [{"id": "editor", "exitCode": 0, "output": "1.94.2"}])

    def test_network_blips_do_not_stop_the_agent(self):
        blip = toolchain_agent.AgentError("Could not reach server")
        code, posts, out = self.run_serve([blip, blip, {"status": "CHECKING", "stationId": "editor-isle-tower", "requestedAt": 1}])
        self.assertEqual(len(posts), 1)
        self.assertEqual(out.count("Lost contact"), 1)

    def test_expired_token_ends_the_agent(self):
        code, posts, out = self.run_serve([toolchain_agent.AgentError("expired", 401)])
        self.assertEqual(code, 1)
        self.assertIn("Pair a new agent", out)

    def test_results_for_a_station_the_game_left_are_skipped(self):
        def moved_on(_body):
            raise toolchain_agent.AgentError("different station", 409)
        code, posts, out = self.run_serve([{"status": "CHECKING", "stationId": "editor-isle-tower", "requestedAt": 1}], post=moved_on)
        self.assertIn("moved on", out)


class MainFlowTest(unittest.TestCase):
    def test_pairs_once_then_serves_with_the_token_in_memory(self):
        calls = []

        def fake_post(url, body, token=None):
            calls.append((url, body, token))
            return {"sessionId": "abc", "stationId": "editor-isle-tower", "agentToken": "secret-token"}

        with mock.patch.object(toolchain_agent.getpass, "getpass", return_value="  the-code  "), \
                mock.patch.object(toolchain_agent, "post_json", side_effect=fake_post), \
                mock.patch.object(toolchain_agent, "serve", return_value=0) as serve, \
                redirect_stdout(io.StringIO()) as out:
            self.assertEqual(toolchain_agent.main(["--server", "http://localhost:8585"]), 0)

        self.assertEqual(calls, [("http://localhost:8585/api/toolchain/pair", {"pairingCode": "the-code"}, None)])
        self.assertEqual(serve.call_args.args[:4], ("http://localhost:8585", "abc", "secret-token", toolchain_agent.detect_os()))
        self.assertNotIn("secret-token", out.getvalue())
        self.assertNotIn("the-code", out.getvalue())
        self.assertEqual(serve.call_args.kwargs["poll_seconds"], toolchain_agent.DEFAULT_POLL_SECONDS)

    def test_poll_interval_comes_from_the_command_line(self):
        with mock.patch.object(toolchain_agent.getpass, "getpass", return_value="the-code"), \
                mock.patch.object(toolchain_agent, "post_json",
                                  return_value={"sessionId": "abc", "stationId": "x", "agentToken": "t"}), \
                mock.patch.object(toolchain_agent, "serve", return_value=0) as serve, \
                redirect_stdout(io.StringIO()):
            toolchain_agent.main(["--server", "http://localhost:8585", "--poll-seconds", "5"])
        self.assertEqual(serve.call_args.kwargs["poll_seconds"], 5.0)

    def test_rejected_code_prints_the_server_message(self):
        error = toolchain_agent.AgentError("Pairing code is invalid, expired, or already used", 401)
        with mock.patch.object(toolchain_agent.getpass, "getpass", return_value="old"), \
                mock.patch.object(toolchain_agent, "post_json", side_effect=error), \
                redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()) as err:
            self.assertEqual(toolchain_agent.main([]), 2)
        self.assertIn("already used", err.getvalue())


if __name__ == "__main__":
    unittest.main()
