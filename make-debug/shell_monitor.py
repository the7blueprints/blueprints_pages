#!/usr/bin/env python3
"""
OCS Onboarding Agent - Live Shell Monitor (WSL/Ubuntu)

Wraps the student's bash shell in a pseudo-terminal so the agent can watch
the commands they run, check them against expected onboarding steps, catch
errors as they happen, and log structured evidence for the teacher dashboard.

This is meant to be launched by the OS-selection step: when a student picks
"Windows," hand off to this script inside their WSL/Ubuntu terminal.

Usage:
    python3 shell_monitor.py --student <github_username> [--evidence-dir ./evidence]

Then use the terminal exactly as normal. Type `exit` to end the monitored
session and return to your regular shell.

Only runs on POSIX systems (WSL/Ubuntu/macOS/Linux) since it relies on the
`pty` module, which is unavailable on native Windows.
"""

import argparse
import datetime
import json
import os
import pty
import re
import select
import shutil
import sys
import tempfile
import termios
import tty
from pathlib import Path

from mission_rules import evaluate_command

# Marker used by the injected PROMPT_COMMAND to report each finished command
# and its exit code back to us. Deliberately unlikely to collide with real
# output. We strip this out of what the student actually sees.
MARK_START = "@@OCS_MON_START@@"
MARK_END = "@@OCS_MON_END@@"
# Compiled against bytes: the pty stream is raw bytes, and decoding it
# ourselves before matching risks splitting a multi-byte UTF-8 sequence
# that lands on a chunk boundary.
MARKER_RE = re.compile(
    re.escape(MARK_START.encode()) + rb"(?P<cmd>.*?)\|\|OCS_EXIT=(?P<exit>-?\d+)" + re.escape(MARK_END.encode()),
    re.DOTALL,
)


def build_rcfile() -> str:
    """
    Build a temporary bash rc file that:
      1) sources the student's normal ~/.bashrc (so their setup still works), then
      2) adds a PROMPT_COMMAND hook that reports the last command + exit code
         back to us, wrapped in unique markers, on the shell's stdout, since
         pty.fork() gives the child a single combined stdout/stderr stream.
    """
    user_bashrc = Path.home() / ".bashrc"
    lines = []
    if user_bashrc.exists():
        lines.append(f'source "{user_bashrc}" 2>/dev/null || true')

    # $? must be captured as the FIRST thing in the hook, before anything
    # else runs and overwrites it. `history 1` gives us the command text.
    hook = (
        'OCS_LAST_EXIT=$?; '
        'OCS_LAST_CMD=$(HISTTIMEFORMAT= history 1 | sed -E "s/^[[:space:]]*[0-9]+[[:space:]]*//"); '
        f'printf "%s%s||OCS_EXIT=%s%s" "{MARK_START}" "$OCS_LAST_CMD" "$OCS_LAST_EXIT" "{MARK_END}"'
    )
    lines.append(f"PROMPT_COMMAND='{hook}'")
    lines.append("export HISTCONTROL=ignoredups")

    fd, path = tempfile.mkstemp(prefix="ocs_monitor_rc_", suffix=".sh")
    with os.fdopen(fd, "w") as f:
        f.write("\n".join(lines) + "\n")
    return path


class EvidenceLog:
    """Structured, append-only evidence stream — one JSON object per line."""

    def __init__(self, student: str, evidence_dir: Path):
        evidence_dir.mkdir(parents=True, exist_ok=True)
        stamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        self.path = evidence_dir / f"{student}_{stamp}.jsonl"
        self._fh = open(self.path, "a", buffering=1)  # line-buffered

    def write(self, record: dict):
        self._fh.write(json.dumps(record) + "\n")

    def close(self):
        self._fh.close()


def make_hint_banner(text: str) -> bytes:
    # Bright yellow, bold, prefixed so it's visually distinct from normal output.
    return f"\r\n\033[1;33m[OCS Agent] {text}\033[0m\r\n".encode()


def run_monitor(student: str, evidence_dir: Path, shell: str):
    rcfile = build_rcfile()
    evidence = EvidenceLog(student, evidence_dir)

    print(f"[OCS Agent] Monitoring started for '{student}'. Evidence: {evidence.path}")
    print("[OCS Agent] Type 'exit' to end the monitored session.\n")

    old_tty = termios.tcgetattr(sys.stdin)
    buffer = b""

    def handle_marker(match) -> bytes:
        cmd = match.group("cmd").decode(errors="replace").strip()
        try:
            exit_code = int(match.group("exit"))
        except ValueError:
            exit_code = -1

        if cmd:
            result = evaluate_command(cmd, exit_code)
            record = {
                "timestamp": datetime.datetime.now().isoformat(),
                "student": student,
                "command": cmd,
                "exit_code": exit_code,
                "status": result["status"],      # PASS / WARN / FAIL / INFO
                "mission_step": result["step"],   # e.g. "python3_installed" or None
                "note": result["note"],
            }
            evidence.write(record)

            if result["hint"]:
                os.write(sys.stdout.fileno(), make_hint_banner(result["hint"]))

        return b""  # strip the marker so the student never sees it

    def read_and_forward(fd) -> bool:
        nonlocal buffer
        try:
            data = os.read(fd, 4096)
        except OSError:
            return False
        if not data:
            return False

        buffer += data
        visible = MARKER_RE.sub(handle_marker, buffer)
        os.write(sys.stdout.fileno(), visible)
        buffer = b""
        return True

    try:
        tty.setraw(sys.stdin.fileno())
        pid, master_fd = pty.fork()

        if pid == 0:
            # Child process: exec the student's shell with our rc hook loaded.
            os.execvp(shell, [shell, "--rcfile", rcfile, "-i"])
        else:
            # Parent process: relay bytes both directions, watching for markers.
            while True:
                rlist, _, _ = select.select([sys.stdin, master_fd], [], [])
                if sys.stdin in rlist:
                    data = os.read(sys.stdin.fileno(), 4096)
                    if not data:
                        break
                    os.write(master_fd, data)
                if master_fd in rlist:
                    if not read_and_forward(master_fd):
                        break
    finally:
        termios.tcsetattr(sys.stdin, termios.TCSADRAIN, old_tty)
        evidence.close()
        try:
            os.remove(rcfile)
        except OSError:
            pass
        print(f"\n[OCS Agent] Monitoring ended. Evidence saved to {evidence.path}")


def main():
    parser = argparse.ArgumentParser(description="OCS Onboarding Agent - Live Shell Monitor")
    parser.add_argument("--student", required=True, help="GitHub username / student identifier")
    parser.add_argument("--evidence-dir", default="./evidence", help="Where to write evidence JSONL files")
    parser.add_argument("--shell", default=shutil.which("bash") or "/bin/bash", help="Shell to wrap")
    args = parser.parse_args()

    if os.name != "posix":
        print("This monitor must be run inside WSL/Ubuntu (a POSIX shell), not native Windows.")
        sys.exit(1)

    run_monitor(args.student, Path(args.evidence_dir), args.shell)


if __name__ == "__main__":
    main()