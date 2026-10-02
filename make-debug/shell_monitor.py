#!/usr/bin/env python3
"""
OCS Onboarding Agent - Live Shell Monitor (WSL/Ubuntu)

Wraps the student's bash shell in a pseudo-terminal so the agent can watch
the commands they run, check them against the expected Windows/WSL
onboarding sequence, and tell them right there in the terminal whether they
got it right -- and if so, what to do next. If something failed, it
explains what likely went wrong and how to fix it.

Once the student finishes the "first-time setup" steps (specifically, once
./scripts/venv.sh succeeds), the agent automatically runs a full version
check across every required tool (python, pip, ruby, bundle, gem, git) and
prints a consolidated PASS/FAIL summary -- the same check is also available
any time by typing `ocscheck`.

This is purely a live, in-terminal helper -- nothing is written to disk or
sent anywhere. Everything happens in the moment, for the student in front
of the screen.

Usage:
    python3 shell_monitor.py

Then use the terminal exactly as normal. Type `exit` to end the monitored
session and return to your regular shell.

Only runs on POSIX systems (WSL/Ubuntu/macOS/Linux) since it relies on the
`pty` module, which is unavailable on native Windows.
"""

import argparse
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

from mission_rules import evaluate_command, SETUP_COMPLETE_STEP, FINAL_CHECK_COMMANDS, FINAL_CHECK_SCRIPT

# Marker used by the injected PROMPT_COMMAND to report each finished command
# and its exit code back to us. Deliberately unlikely to collide with real
# output. We strip this out of what the student actually sees.
MARK_START = "@@OCS_MON_START@@"
MARK_END = "@@OCS_MON_END@@"
MARKER_RE = re.compile(
    re.escape(MARK_START.encode()) + rb"(?P<cmd>.*?)\|\|OCS_EXIT=(?P<exit>-?\d+)" + re.escape(MARK_END.encode()),
    re.DOTALL,
)

# Markers wrapping the output of the `ocscheck` function (defined in the
# injected rc file). Each tool's result is reported as its own
# "OCS_ITEM:<tool>:<exit_code>" line inside the block; the real version
# output around those lines is left visible to the student as normal.
CHECK_START = "@@OCS_CHECK_START@@"
CHECK_END = "@@OCS_CHECK_END@@"
CHECK_BLOCK_RE = re.compile(
    re.escape(CHECK_START.encode()) + rb"(?P<body>.*?)" + re.escape(CHECK_END.encode()),
    re.DOTALL,
)
CHECK_ITEM_LINE_RE = re.compile(rb"^OCS_ITEM:(?P<tool>[A-Za-z0-9_]+):(?P<code>-?\d+)\r?\n?", re.MULTILINE)

MARK_START_B = MARK_START.encode()
CHECK_START_B = CHECK_START.encode()
_MAX_PREFIX_LEN = max(len(MARK_START_B), len(CHECK_START_B))


def build_rcfile() -> str:
    """
    Build a temporary bash rc file that:
      1) sources the student's normal ~/.bashrc (so their setup still works),
      2) forces a clean, standard bash prompt afterward -- some machines
         (macOS in particular) have a zsh-style PS1 (using %n/%m/%# etc.)
         sitting in the environment, which bash can't expand and just
         prints literally. This is purely cosmetic -- it has no effect on
         whether commands actually run or files actually get created -- but
         it's confusing to look at, so we override it with a normal bash
         prompt here. (`python -m venv`'s activate script still correctly
         prepends "(venv) " to whatever PS1 is at the time it's sourced.)
      3) adds a PROMPT_COMMAND hook that reports the last command + exit code
         back to us after every command, and
      4) defines an `ocscheck` shell function the student (or the monitor
         itself) can invoke to run a full tool-version verification pass.
    """
    user_bashrc = Path.home() / ".bashrc"
    lines = []
    if user_bashrc.exists():
        lines.append(f'source "{user_bashrc}" 2>/dev/null || true')
    lines.append(r"export PS1='\u@\h \W\$ '")

    # $? must be captured as the FIRST thing in the hook, before anything
    # else runs and overwrites it. `history 1` gives us the command text.
    #
    # bash also runs PROMPT_COMMAND once before the very first prompt is
    # shown, i.e. before the student has typed anything in this session --
    # at that point `history 1` would return the LAST command from a
    # previous session's saved ~/.bash_history, which is not something that
    # just happened here. We skip reporting on that first firing so we
    # never surface a "phantom" result for a command the student didn't
    # just run.
    hook = (
        'OCS_LAST_EXIT=$?; '
        'if [ -z "$OCS_SEEN_FIRST_PROMPT" ]; then '
        'export OCS_SEEN_FIRST_PROMPT=1; '
        'else '
        'OCS_LAST_CMD=$(HISTTIMEFORMAT= history 1 | sed -E "s/^[[:space:]]*[0-9]+[[:space:]]*//"); '
        f'printf "%s%s||OCS_EXIT=%s%s" "{MARK_START}" "$OCS_LAST_CMD" "$OCS_LAST_EXIT" "{MARK_END}"; '
        'fi'
    )
    lines.append(f"PROMPT_COMMAND='{hook}'")
    lines.append("export HISTCONTROL=ignoredups")

    # ocscheck: prefers running the project's own verifyToolsTerminal.sh (a
    # much more thorough check -- repo/config setup, venv, Gemfile.lock,
    # and that Jekyll actually builds, not just tool versions) when it
    # exists and is executable. Falls back to a simple per-tool version
    # check otherwise (e.g. when testing the monitor outside a real
    # project checkout). Either way, real output is shown to the student,
    # and each result is reported back to us via an OCS_ITEM sentinel line.
    check_lines = [f'echo "{CHECK_START}"']
    check_lines.append(f'if [ -x "{FINAL_CHECK_SCRIPT}" ]; then')
    check_lines.append(f'  "{FINAL_CHECK_SCRIPT}"; echo "OCS_ITEM:verifyToolsTerminal:$?"')
    check_lines.append('else')
    for tool, cmd in FINAL_CHECK_COMMANDS:
        check_lines.append(f'  {cmd}; echo "OCS_ITEM:{tool}:$?"')
    check_lines.append('fi')
    check_lines.append(f'echo "{CHECK_END}"')
    ocscheck_fn = "ocscheck() {\n  " + "\n  ".join(check_lines) + "\n}"
    lines.append(ocscheck_fn)

    fd, path = tempfile.mkstemp(prefix="ocs_monitor_rc_", suffix=".sh")
    with os.fdopen(fd, "w") as f:
        f.write("\n".join(lines) + "\n")
    return path


def make_banner(text: str, color: str = "33") -> bytes:
    # 32 = green (correct), 31 = red (failed), 33 = yellow (unmatched warning)
    return f"\r\n\033[1;{color}m[OCS Agent] {text}\033[0m\r\n".encode()


def run_monitor(shell: str):
    rcfile = build_rcfile()

    print("[OCS Agent] Monitoring started.")
    print("[OCS Agent] Type 'exit' to end the monitored session, or 'ocscheck' any time to re-verify your tools.\n")

    old_tty = termios.tcgetattr(sys.stdin)
    buffer = b""
    master_fd_holder = {}  # populated once the pty exists, read inside closures below

    def handle_check_block(match) -> bytes:
        body = match.group("body")
        results = []
        for item in CHECK_ITEM_LINE_RE.finditer(body):
            tool = item.group("tool").decode()
            try:
                code = int(item.group("code"))
            except ValueError:
                code = -1
            results.append((tool, code))

        # Strip only the sentinel lines, keep the real version/script output visible.
        visible_body = CHECK_ITEM_LINE_RE.sub(b"", body)

        passed = [t for t, c in results if c == 0]
        failed = [t for t, c in results if c != 0]

        ran_real_script = len(results) == 1 and results[0][0] == "verifyToolsTerminal"
        if ran_real_script:
            # verifyToolsTerminal.sh already printed its own detailed
            # PASS/WARN/FAIL report and next steps -- don't repeat it,
            # just add a short confirming banner underneath.
            if failed:
                summary_lines = [
                    "Setup verification found problems -- see the report above for exactly "
                    "which checks failed and what to do next."
                ]
            else:
                summary_lines = ["Correct! Full environment verification passed (see report above)."]
        elif failed:
            summary_lines = [f"Setup verification: {len(passed)}/{len(results)} tools OK"]
        else:
            summary_lines = [f"Correct! All {len(results)}/{len(results)} tools verified -- your environment is fully set up."]

        if not ran_real_script:
            for tool, code in results:
                mark = "PASS" if code == 0 else "FAIL"
                summary_lines.append(f"  [{mark}] {tool}")
            if failed:
                summary_lines.append("Fix the failing tool(s) above, then type 'ocscheck' again to re-verify.")

        color = "32" if not failed else "31"
        banner = make_banner("\n[OCS Agent] ".join(summary_lines), color=color)
        return visible_body + banner

    def handle_marker(match) -> bytes:
        cmd = match.group("cmd").decode(errors="replace").strip()
        try:
            exit_code = int(match.group("exit"))
        except ValueError:
            exit_code = -1

        if not cmd:
            return b""

        result = evaluate_command(cmd, exit_code)

        if result["hint"]:
            # Green for a confirmed-correct step, red for a real failure,
            # yellow for an unmatched-but-still-off warning.
            if result["status"] == "PASS":
                color = "32"
            elif result["status"] == "FAIL":
                color = "31"
            else:
                color = "33"
            os.write(sys.stdout.fileno(), make_banner(result["hint"], color=color))

        # Auto-trigger: once the setup-completing step passes, run the full
        # verification pass automatically, as if the student typed it.
        if result["step"] == SETUP_COMPLETE_STEP and result["status"] == "PASS":
            os.write(sys.stdout.fileno(), make_banner(
                "Tool setup looks complete -- running a full version check now...", color="33"))
            mfd = master_fd_holder.get("fd")
            if mfd is not None:
                os.write(mfd, b"ocscheck\n")

        return b""  # strip the marker so the student never sees it

    def read_and_forward(fd) -> bool:
        # `ocscheck` and other multi-line output can arrive split across
        # several os.read() calls, so a marker's start and end may not land
        # in the same chunk. We accumulate into a persistent buffer, resolve
        # every *complete* marker we can find, and only flush bytes to the
        # real terminal once we're sure they aren't part of an in-progress
        # (not-yet-closed) marker -- holding back an unterminated start, or
        # a trailing few bytes that could be the beginning of one.
        nonlocal buffer
        try:
            data = os.read(fd, 4096)
        except OSError:
            return False
        if not data:
            return False

        buffer += data
        # Resolve check blocks first (more specific pattern), then ordinary
        # per-command markers on whatever's left. Each sub() only touches
        # fully-matched (start+end present) occurrences.
        buffer = CHECK_BLOCK_RE.sub(handle_check_block, buffer)
        buffer = MARKER_RE.sub(handle_marker, buffer)

        # Find the earliest still-unterminated marker start, if any.
        starts = [i for i in (buffer.find(MARK_START_B), buffer.find(CHECK_START_B)) if i != -1]
        if starts:
            safe_len = min(starts)
        else:
            # No unterminated marker start yet -- but the last few bytes
            # might be the beginning of one that hasn't fully arrived.
            hold = 0
            for n in range(1, min(_MAX_PREFIX_LEN - 1, len(buffer)) + 1):
                tail = buffer[-n:]
                if MARK_START_B.startswith(tail) or CHECK_START_B.startswith(tail):
                    hold = n
            safe_len = len(buffer) - hold

        to_flush, buffer = buffer[:safe_len], buffer[safe_len:]
        if to_flush:
            os.write(sys.stdout.fileno(), to_flush)
        return True

    try:
        tty.setraw(sys.stdin.fileno())
        pid, master_fd = pty.fork()

        if pid == 0:
            # Child process: exec the student's shell with our rc hook loaded.
            os.execvp(shell, [shell, "--rcfile", rcfile, "-i"])
        else:
            master_fd_holder["fd"] = master_fd
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
        try:
            os.remove(rcfile)
        except OSError:
            pass
        print("\n[OCS Agent] Monitoring ended.")


def main():
    parser = argparse.ArgumentParser(description="OCS Onboarding Agent - Live Shell Monitor")
    parser.add_argument("--shell", default=shutil.which("bash") or "/bin/bash", help="Shell to wrap")
    parser.add_argument(
        "--start-dir",
        default=str(Path.home()),
        help="Directory the monitored shell starts in (default: your home directory, "
             "matching what a fresh WSL/Ubuntu terminal looks like for a student). "
             "Pass '.' to stay in the current directory instead.",
    )
    args = parser.parse_args()

    if os.name != "posix":
        print("This monitor must be run inside WSL/Ubuntu (a POSIX shell), not native Windows.")
        sys.exit(1)

    start_dir = Path.cwd() if args.start_dir == "." else Path(args.start_dir).expanduser()
    try:
        os.chdir(start_dir)
    except OSError as e:
        print(f"Couldn't start in '{start_dir}': {e}")
        sys.exit(1)

    print(f"[OCS Agent] Starting in {start_dir} (use --start-dir to change, or '.' to stay where you launched from).")
    run_monitor(args.shell)


if __name__ == "__main__":
    main()