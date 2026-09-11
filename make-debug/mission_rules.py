"""
Mission Tools rule set used by shell_monitor.py to evaluate each command the
student runs against the expected OCS onboarding sequence.

Each rule matches a command pattern. When matched, it's checked against the
exit code to decide PASS/FAIL, and can supply a real-time hint for the
student when something looks wrong.

Generic error detection (that isn't tied to a specific mission step) also
runs on every command, so unexpected problems still get flagged even if they
don't match a known step.
"""

import re

# Ordered so more specific patterns are checked before general ones.
STEP_RULES = [
    {
        "step": "homebrew_or_apt",
        "pattern": re.compile(r"^\s*(brew|sudo apt(-get)?)\s+install\b"),
        "fail_hint": "Package install failed. Check your internet connection and re-run the command.",
    },
    {
        "step": "python3_installed",
        "pattern": re.compile(r"^\s*python3\s+--version\b"),
        "fail_hint": "python3 isn't available yet. Run the OS setup script (e.g. ./scripts/activate_ubuntu.sh) first.",
    },
    {
        "step": "pip_available",
        "pattern": re.compile(r"^\s*python3\s+-m\s+pip\s+--version\b"),
        "fail_hint": "pip isn't available. Try: python3 -m ensurepip --upgrade",
    },
    {
        "step": "venv_support",
        "pattern": re.compile(r"^\s*python3\s+-m\s+venv\b"),
        "fail_hint": "Python's venv module isn't available. On Ubuntu try: sudo apt install python3-venv",
    },
    {
        "step": "git_installed",
        "pattern": re.compile(r"^\s*git\s+--version\b"),
        "fail_hint": "git isn't installed yet. Run: sudo apt install git",
    },
    {
        "step": "github_auth",
        "pattern": re.compile(r"^\s*(ssh\s+-T\s+git@github\.com|gh\s+auth\s+status)\b"),
        "fail_hint": "GitHub isn't authenticated yet. Set up SSH keys or run: gh auth login",
    },
    {
        "step": "repo_clone",
        "pattern": re.compile(r"^\s*git\s+clone\b"),
        "fail_hint": "Clone failed. Double check the repository URL and that you have access.",
    },
    {
        "step": "venv_create",
        "pattern": re.compile(r"^\s*(\./scripts/venv\.sh|python3\s+-m\s+venv\s+\S+)\b"),
        "fail_hint": "Creating the virtual environment failed. Check the error above and try again.",
    },
    {
        "step": "venv_activate",
        "pattern": re.compile(r"^\s*source\s+venv/bin/activate\b"),
        "fail_hint": "Couldn't activate the virtual environment. Make sure ./scripts/venv.sh ran successfully first.",
    },
    {
        "step": "install_requirements",
        "pattern": re.compile(r"^\s*python3\s+-m\s+pip\s+install\s+-r\b"),
        "fail_hint": "Installing dependencies failed. Make sure your virtual environment is activated (source venv/bin/activate).",
    },
    {
        "step": "verify_tools_script",
        "pattern": re.compile(r"^\s*\./scripts/verifyTools\.sh\b"),
        "fail_hint": "verifyTools.sh reported a problem. Scroll up and look for the first [BLOCKED] or [FAIL] line.",
    },
    {
        "step": "agent_start",
        "pattern": re.compile(r"^\s*python3\s+make-debug/analyze\.py\b"),
        "fail_hint": "The agent didn't start cleanly. Confirm the virtual environment is active and dependencies are installed.",
    },
    {
        "step": "jekyll_build",
        "pattern": re.compile(r"^\s*make\b|^\s*bundle\s+exec\s+jekyll\b"),
        "fail_hint": "The Jekyll build failed. Check _config.yml and the error above for the failing step.",
    },
]

# Generic signals that something's wrong, independent of which step it is.
GENERIC_ERROR_PATTERNS = [
    re.compile(r"command not found", re.IGNORECASE),
    re.compile(r"No such file or directory", re.IGNORECASE),
    re.compile(r"Permission denied", re.IGNORECASE),
    re.compile(r"ModuleNotFoundError", re.IGNORECASE),
    re.compile(r"fatal:", re.IGNORECASE),
]

# Commands where a non-zero exit is expected/normal and shouldn't be flagged
# (e.g. grep finding no matches, test/[ conditionals).
BENIGN_NONZERO = re.compile(r"^\s*(grep|test|\[)\b")


def evaluate_command(cmd: str, exit_code: int) -> dict:
    """
    Returns a dict: {status, step, note, hint}
      status: "PASS" | "FAIL" | "WARN" | "INFO"
      step:   matched mission step name, or None
      note:   short human-readable explanation
      hint:   text to show the student right now, or None if nothing to say
    """
    if not cmd:
        return {"status": "INFO", "step": None, "note": "empty command", "hint": None}

    matched_step = None
    fail_hint = None
    for rule in STEP_RULES:
        if rule["pattern"].search(cmd):
            matched_step = rule["step"]
            fail_hint = rule["fail_hint"]
            break

    if matched_step:
        if exit_code == 0:
            return {
                "status": "PASS",
                "step": matched_step,
                "note": f"'{cmd}' completed successfully.",
                "hint": None,
            }
        else:
            return {
                "status": "FAIL",
                "step": matched_step,
                "note": f"'{cmd}' exited with code {exit_code}.",
                "hint": fail_hint,
            }

    # No specific mission step matched - fall back to generic error detection.
    if exit_code != 0 and not BENIGN_NONZERO.search(cmd):
        return {
            "status": "WARN",
            "step": None,
            "note": f"'{cmd}' exited with code {exit_code}.",
            "hint": f"That last command ('{cmd}') didn't succeed (exit {exit_code}). "
                    f"Worth checking the output above before moving on.",
        }

    return {"status": "INFO", "step": None, "note": f"'{cmd}' ran normally.", "hint": None}