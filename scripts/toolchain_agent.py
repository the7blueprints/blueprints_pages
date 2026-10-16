#!/usr/bin/env python3
"""
toolchain_agent
---------------
Local agent for Toolchain Trail. Works on macOS, Windows, Linux and WSL, using
only the Python standard library (nothing to pip install).

How it fits together (one-time device pairing, once for the whole trail):
  1. At the first station, the signed-in game gets a pairing code from the
     Spring backend. The code works once and expires in 5 minutes.
  2. The student runs this agent and pastes the code. The code is read
     without echoing, like a password.
  3. The agent exchanges the code for an agent token that only works for that
     student's trail session. The token is kept in memory, never written to disk.
  4. The agent stays open. Each time the game asks for a station to be checked,
     the agent runs that station's real commands and sends the results with
     "Authorization: Bearer <agent-token>". The backend decides pass/fail.
  5. The game polls the backend and updates the quest when the station is verified.

Usage (run it from inside your cloned pages repository):
    macOS / Linux / WSL:  python3 scripts/toolchain_agent.py
    Windows (PowerShell): py scripts\\toolchain_agent.py
    Local backend:        python3 scripts/toolchain_agent.py --server http://localhost:8585

The check ids below must match ToolchainStations.java in blueprint-spring.
"""

import argparse
import getpass
import json
import os
import platform
import shutil
import ssl
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Callable, Dict, List, Optional, Tuple
from urllib.parse import urlparse

DEFAULT_SERVER = "https://spring.opencodingsociety.com"
COMMAND_TIMEOUT_SECONDS = 30
MAX_OUTPUT_LENGTH = 4000  # the backend keeps at most this much per check
REQUEST_TIMEOUT_SECONDS = 20
DEFAULT_POLL_SECONDS = 2.0  # how often the agent asks which station the game wants checked; --poll-seconds overrides

# (exit code, combined stdout + stderr)
CommandResult = Tuple[int, str]


def detect_os() -> str:
    """macos, windows, linux, or wsl (Linux running inside Windows)."""
    system = platform.system()
    if system == "Darwin":
        return "macos"
    if system == "Windows":
        return "windows"
    if os.environ.get("WSL_DISTRO_NAME") or os.environ.get("WSL_INTEROP"):
        return "wsl"
    try:
        if "microsoft" in Path("/proc/version").read_text(errors="replace").lower():
            return "wsl"
    except OSError:
        pass
    return "linux"


def run_command(command: List[str], cwd: Optional[Path] = None) -> CommandResult:
    """Run one read-only command; a missing tool or a hang is a failed check, not a crash."""
    # shutil.which finds code.cmd, gem.bat, etc. on Windows (it applies PATHEXT).
    executable = shutil.which(command[0])
    if executable is None:
        return 127, f"command not found: {command[0]}"
    env = dict(os.environ, GIT_TERMINAL_PROMPT="0")  # never hang on a git password prompt
    try:
        completed = subprocess.run(
            [executable] + command[1:],
            cwd=str(cwd) if cwd else None,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=COMMAND_TIMEOUT_SECONDS,
            env=env,
            stdin=subprocess.DEVNULL,
        )
    except subprocess.TimeoutExpired:
        return 124, f"timed out after {COMMAND_TIMEOUT_SECONDS}s"
    except OSError as error:
        return 126, f"could not run {command[0]}: {error}"
    return completed.returncode, (completed.stdout or "") + (completed.stderr or "")


def first_success(*results: CommandResult) -> CommandResult:
    for result in results:
        if result[0] == 0:
            return result
    return results[0]


def redact_email(output: str) -> str:
    """Send only enough to show an email is set: 'ada@example.org' -> 'a***@example.org'."""
    value = output.strip()
    if "@" not in value:
        return value
    local, _, domain = value.partition("@")
    return f"{local[:1]}***@{domain}"


def find_trail_folder(cwd: Path, home: Path) -> Optional[Path]:
    for base in (cwd, home, cwd.parent):
        candidate = base / "toolchain-trail"
        if candidate.is_dir():
            return candidate
    return None


Runner = Callable[[List[str], Optional[Path]], CommandResult]


def collect_evidence(station_id: str, repo: Path, runner: Optional[Runner] = None) -> List[Dict]:
    """Run the commands for one station and return [{id, exitCode, output}]."""
    runner = runner or run_command
    python = [sys.executable]  # the Python 3 running this agent; python3 is not on PATH on Windows
    checks: List[Tuple[str, CommandResult]] = []

    if station_id == "terminal-town-gate":
        cwd = Path.cwd()
        folder = find_trail_folder(cwd, Path.home())
        checks = [
            ("working-folder", (0, str(cwd))),
            ("trail-folder", (0, str(folder)) if folder else (1, "toolchain-trail folder not found")),
        ]
    elif station_id == "compiler-canyon-forge":
        checks = [
            ("python", runner(python + ["--version"], None)),
            ("pip", runner(python + ["-m", "pip", "--version"], None)),
            ("ruby", runner(["ruby", "-v"], None)),
            ("bundler", runner(["bundle", "-v"], None)),
            ("rubygems", runner(["gem", "--version"], None)),
        ]
    elif station_id == "editor-isle-tower":
        checks = [("editor", first_success(runner(["code", "--version"], None), runner(["cursor", "--version"], None)))]
    elif station_id == "git-village-hall":
        code, email = runner(["git", "config", "--global", "user.email"], None)
        checks = [
            ("git", runner(["git", "--version"], None)),
            ("git-name", runner(["git", "config", "--global", "user.name"], None)),
            ("git-email", (code, redact_email(email))),
        ]
    elif station_id == "github-gateway-arch":
        checks = [
            ("github-remote", runner(["git", "remote", "-v"], repo)),
            ("remote-branch", runner(["git", "ls-remote", "--heads", "origin"], repo)),
        ]
    elif station_id == "build-bridge":
        checks = [("bundle-check", runner(["bundle", "check"], repo))]
    elif station_id == "integration-summit":
        checks = [
            ("recent-commit", runner(["git", "log", "-1", "--oneline"], repo)),
            ("push-dry-run", runner(["git", "push", "--dry-run"], repo)),
        ]
    else:
        raise ValueError(f"This agent does not know the station '{station_id}'. Update your pages repository.")

    return [{"id": check_id, "exitCode": code, "output": output[:MAX_OUTPUT_LENGTH]}
            for check_id, (code, output) in checks]


class AgentError(Exception):
    """A problem to show the student in one line, without a traceback."""

    def __init__(self, message: str, status: Optional[int] = None):
        super().__init__(message)
        self.status = status  # HTTP status when the server refused the request


def require_safe_server(server: str) -> str:
    """Evidence goes over HTTPS; plain http is only allowed to a backend on this computer."""
    parsed = urlparse(server)
    local = parsed.hostname in ("localhost", "127.0.0.1", "::1")
    if parsed.scheme == "https" or (parsed.scheme == "http" and local):
        return server.rstrip("/")
    raise AgentError("The server must use https:// (http:// is only allowed for localhost).")


def post_json(url: str, body: Dict, token: Optional[str] = None) -> Dict:
    return request_json("POST", url, body, token)


def get_json(url: str, token: Optional[str] = None) -> Dict:
    return request_json("GET", url, None, token)


def request_json(method: str, url: str, body: Optional[Dict], token: Optional[str]) -> Dict:
    headers = {"Accept": "application/json", "User-Agent": "toolchain-trail-agent/2"}
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode("utf-8")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        try:
            message = json.loads(error.read().decode("utf-8")).get("error")
        except (ValueError, AttributeError):
            message = None
        raise AgentError(message or f"The server answered HTTP {error.code}.", error.code) from None
    except urllib.error.URLError as error:
        if isinstance(error.reason, ssl.SSLCertVerificationError):
            hint = ""
            if detect_os() == "macos":
                hint = " On macOS with Python from python.org, run 'Install Certificates.command' in your Python folder."
            raise AgentError("Python could not verify the server's HTTPS certificate." + hint) from None
        raise AgentError(f"Could not reach {url}: {error.reason}") from None


def print_results(view: Dict) -> None:
    for check in view.get("checks") or []:
        mark = "PASS" if check.get("passed") else "FAIL"
        print(f"  {mark}  {check.get('label')}")
        if not check.get("passed") and check.get("detail"):
            print(f"        {check.get('detail')}")


def check_station(server: str, session_id: str, token: str, station_id: str, os_name: str, repo: Path) -> None:
    """Run one station's commands, send them, and print what the server decided."""
    print(f"\nChecking {station_id}...")
    evidence = collect_evidence(station_id, repo)
    try:
        view = post_json(f"{server}/api/toolchain/sessions/{session_id}/results",
                         {"os": os_name, "stationId": station_id, "checks": evidence}, token=token)
    except AgentError as error:
        if error.status == 409:  # the student moved to another station while this ran
            print("  The game moved on to another station; skipping these results.")
            return
        raise
    print_results(view)
    if view.get("status") == "VERIFIED":
        print("  Station verified! Go back to the game.")
    else:
        print("  Fix the FAIL items, then click Check again in the game.")
        if any(item["exitCode"] == 127 for item in evidence):
            print("  (Just installed something? Restart this agent so it sees your new PATH,"
                  " then use Pair a new agent in the game.)")


def serve(server: str, session_id: str, token: str, os_name: str, repo: Path,
          poll_seconds: float = DEFAULT_POLL_SECONDS, sleep: Callable[[float], None] = time.sleep) -> int:
    """Wait for check requests from the game until the token expires or the student presses Ctrl+C."""
    last_request = None
    offline = False
    while True:
        try:
            view = get_json(f"{server}/api/toolchain/sessions/{session_id}/next", token=token)
            if offline:
                print("Connected to the server again.")
                offline = False
        except AgentError as error:
            if error.status == 401:
                print("This pairing has ended. Run the agent again and use Pair a new agent in the game.")
                return 1
            if not offline:  # Wi-Fi blip or server restart: keep trying quietly
                print(f"Lost contact with the server ({error}). Retrying...")
                offline = True
            sleep(poll_seconds)
            continue

        request_id = (view.get("stationId"), view.get("requestedAt"))
        if view.get("status") == "CHECKING" and request_id != last_request:
            last_request = request_id
            try:
                check_station(server, session_id, token, view["stationId"], os_name, repo)
            except AgentError as error:
                if error.status == 401:
                    print("This pairing has ended. Run the agent again and use Pair a new agent in the game.")
                    return 1
                print(f"Could not send results: {error}. Click Check again in the game to retry.")
            print("\nWaiting for the next station...")
        sleep(poll_seconds)


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Pair with Toolchain Trail and verify stations as you play.")
    parser.add_argument("--server", default=os.environ.get("TOOLCHAIN_SERVER", DEFAULT_SERVER),
                        help=f"backend URL (default {DEFAULT_SERVER})")
    parser.add_argument("--repo", default=".", help="repository the git and build checks run in (default: current folder)")
    parser.add_argument("--poll-seconds", type=float,
                        default=float(os.environ.get("TOOLCHAIN_POLL_SECONDS", DEFAULT_POLL_SECONDS)),
                        help=f"how often to ask the server for the next station (default {DEFAULT_POLL_SECONDS:g})")
    args = parser.parse_args(argv)

    os_name = detect_os()
    try:
        server = require_safe_server(args.server)
        print(f"Toolchain Trail agent ({os_name}). Paste the pairing code from the game.")
        code = getpass.getpass("Pairing code (hidden): ").strip()
        if not code:
            raise AgentError("No pairing code entered.")

        paired = post_json(f"{server}/api/toolchain/pair", {"pairingCode": code})
        print("Paired! Leave this window open while you play Toolchain Trail.")
        print("Do your setup work in a second terminal window. Press Ctrl+C here to stop the agent.")
        return serve(server, paired["sessionId"], paired["agentToken"], os_name, Path(args.repo).resolve(),
                     poll_seconds=args.poll_seconds)
    except AgentError as error:
        print(f"Error: {error}", file=sys.stderr)
        return 2
    except ValueError as error:
        print(f"Error: {error}", file=sys.stderr)
        return 2
    except (KeyboardInterrupt, EOFError):
        print("\nAgent stopped.")
        return 130


if __name__ == "__main__":
    sys.exit(main())
