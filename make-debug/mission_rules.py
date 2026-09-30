"""
Mission Tools rule set used by shell_monitor.py to evaluate each command the
student runs against the actual Windows/WSL onboarding workflow (see the
"Windows (WSL) Operating System and Tools Setup" guide).

Each rule matches a command pattern and carries:
  - step:          a unique mission-step id (used for the post-setup
                    auto-trigger)
  - pass_message:  a confirmation shown when the command succeeds
  - fail_hint (or fail_hint_fn): a specific, actionable message shown when
                    the command fails, explaining what likely went wrong
                    and how to fix it

This rule set deliberately only confirms correctness and explains failures
-- it doesn't tell the student what to do next. The Toolchain Trail game
already walks students through the steps; the agent's job is just to be an
honest, specific check on whatever they actually typed.

Generic error detection (that isn't tied to a specific mission step) also
runs on every command, so unexpected problems still get flagged even if they
don't match a known step -- but only known steps get a "Correct!" banner,
since confirming every plain 'ls' or 'cd' would be noise.

NOTE ON SCOPE: `wsl --install`, `wsl`, `wsl --set-default`, etc. are run
from the Windows side (PowerShell / cmd, at C:\\) BEFORE Ubuntu -- and
therefore this monitor -- exists at all. They're intentionally not covered
here; this rule set starts from the first command a student runs *inside*
their new Ubuntu terminal.
"""

import re

# A git clone target that actually looks like a real repository reference --
# an http(s) URL or an ssh-style git@host:path form. Used to tell "you typed
# something that isn't a URL at all" apart from "you typed a URL but it's
# wrong/unreachable/needs auth", since those need very different advice.
_LOOKS_LIKE_GIT_URL_RE = re.compile(r"^(https?://\S+|git@\S+:\S+|ssh://\S+)$")


def _clone_target(cmd: str):
    """Best-effort extraction of the target argument from a `git clone ...`
    command -- the first token after `clone` that isn't a flag."""
    tokens = cmd.split()
    for tok in tokens[2:]:  # skip 'git' and 'clone'
        if not tok.startswith("-"):
            return tok
    return None


def _repo_clone_fail_hint(cmd: str) -> str:
    target = _clone_target(cmd)
    if not target or not _LOOKS_LIKE_GIT_URL_RE.match(target):
        # They typed something that isn't a URL at all (missing it entirely,
        # or a typo/placeholder) -- no point troubleshooting network/auth,
        # just give them the exact correct command.
        shown = f"'{target}'" if target else "nothing"
        return (
            f"{shown} isn't a repository URL, so there's nothing to clone from. "
            f"Run exactly: git clone https://github.com/Open-Coding-Society/portfolio.git"
        )
    return (
        "The clone failed. Common causes: (1) you're not connected to the internet, "
        "(2) the URL is mistyped -- it should be exactly "
        "'https://github.com/Open-Coding-Society/portfolio.git', or (3) Git Credential "
        "Manager isn't set up yet, so the login prompt from Windows never appeared. "
        "Re-check 'git config --global credential.helper' if you were never prompted to log in."
    )


# Ordered so more specific patterns are checked before general ones.
STEP_RULES = [

    # ---- First-time setup (guide: "WSL Ubuntu Setup > First-time Setup") ----

    {
        "step": "mkdir_opencs",
        "pattern": re.compile(r"^\s*mkdir\s+opencs\b"),
        "pass_message": "Correct! Your 'opencs' folder is created.",
        "fail_hint": (
            "Couldn't create the 'opencs' folder. If you see 'File exists', it's already "
            "there -- just run 'cd opencs' and continue. If you see 'Permission denied', "
            "make sure you're in your home directory (run 'cd ~' first)."
        ),
    },
    {
        "step": "cd_opencs",
        "pattern": re.compile(r"^\s*cd\s+opencs/?\s*$"),
        "pass_message": "Correct! You're in the opencs folder.",
        "fail_hint": (
            "There's no 'opencs' folder here yet. Run 'mkdir opencs' first, then 'cd opencs'."
        ),
    },
    {
        "step": "git_credential_helper",
        "pattern": re.compile(r"^\s*git\s+config\s+--global\s+credential\.helper\b"),
        "pass_message": "Correct! Git Credential Manager is linked.",
        "fail_hint": (
            "Setting the Git Credential Manager path failed. Double-check that Git for "
            "Windows (which installs GCM) is actually installed on the Windows side, and "
            "that the path '/mnt/c/Program Files/Git/mingw64/bin/git-credential-manager.exe' "
            "is typed exactly as shown in the guide, including the escaped space."
        ),
    },
    {
        "step": "repo_clone",
        "pattern": re.compile(r"^\s*git\s+clone\b"),
        "pass_message": "Correct! The portfolio repository is cloned.",
        "fail_hint_fn": _repo_clone_fail_hint,  # dynamic: distinguishes "not a URL at all" from "real URL, but broken"
    },
    {
        "step": "cd_portfolio",
        "pattern": re.compile(r"^\s*cd\s+portfolio/?\s*$"),
        "pass_message": "Correct! You're in the portfolio project folder.",
        "fail_hint": (
            "There's no 'portfolio' folder here yet. You need to clone it first: "
            "git clone https://github.com/Open-Coding-Society/portfolio.git"
        ),
    },
    {
        "step": "cd_pages",
        "pattern": re.compile(r"^\s*cd\s+pages/?\s*$"),
        "pass_message": "Correct! You're in the pages project folder.",
        "fail_hint": (
            "There's no 'pages' folder here yet. You need to clone it first: "
            "git clone https://github.com/Open-Coding-Society/pages.git "
            "(double-check the exact org/repo name if this isn't right)."
        ),
    },
    {
        "step": "activate_ubuntu_script",
        "pattern": re.compile(r"^\s*\./scripts/activate_ubuntu\.sh\b"),
        "pass_message": "Correct! Your core Ubuntu packages are installed.",
        "fail_hint": (
            "activate_ubuntu.sh failed. This script installs your core Ubuntu packages and "
            "needs your WSL password (the one you set during 'wsl --install'), entered at the "
            "sudo prompt -- note it won't show any characters as you type. If it failed instantly "
            "with 'No such file or directory', make sure you're inside the 'portfolio' folder "
            "('cd portfolio' first) and that the clone in the previous step actually succeeded."
        ),
    },
    {
        "step": "activate_script",
        "pattern": re.compile(r"^\s*\./scripts/activate\.sh\b"),
        "pass_message": "Correct! Your git identity is configured.",
        "fail_hint": (
            "activate.sh failed. This script asks for your Git username/UID and personal email "
            "to finish configuring git. Run 'git config --global --list' afterward to confirm "
            "user.name and user.email actually got set -- if they're blank, re-run this script "
            "and make sure you answer both prompts."
        ),
    },
    {
        "step": "venv_create",
        "pattern": re.compile(r"^\s*\./scripts/venv\.sh\b"),
        "pass_message": "Correct! Your virtual environment is ready -- tool setup is complete.",
        "fail_hint": (
            "venv.sh failed to create the virtual environment. This usually means Python "
            "wasn't installed correctly by activate_ubuntu.sh. Run 'python --version' -- if "
            "that also fails, re-run './scripts/activate_ubuntu.sh' first, then try venv.sh again."
        ),
    },

    # ---- System checks (guide: "System Checks (Optional)") ----

    {
        "step": "python_version_check",
        "pattern": re.compile(r"^\s*python3?\s+--version\b"),
        "pass_message": "Correct! Python is installed.",
        "fail_hint": (
            "Python isn't available. Run './scripts/activate_ubuntu.sh' again from the "
            "'portfolio' folder -- it installs Python as part of the Ubuntu package setup. "
            "If that still doesn't fix it, try 'sudo apt install python3' directly."
        ),
    },
    {
        "step": "pip_version_check",
        "pattern": re.compile(r"^\s*pip3?\s+--version\b"),
        "pass_message": "Correct! pip is installed.",
        "fail_hint": (
            "pip isn't available. If 'python --version' worked but this didn't, try "
            "'python -m ensurepip --upgrade', or 'sudo apt install python3-pip'."
        ),
    },
    {
        "step": "ruby_version_check",
        "pattern": re.compile(r"^\s*ruby\s+-v\b"),
        "pass_message": "Correct! Ruby is installed.",
        "fail_hint": (
            "Ruby isn't available (needed to run Jekyll for this project). Re-run "
            "'./scripts/activate_ubuntu.sh' -- it should install Ruby. If it's still missing "
            "afterward, try 'sudo apt install ruby-full'."
        ),
    },
    {
        "step": "bundle_version_check",
        "pattern": re.compile(r"^\s*bundle\s+(-v|--version)\b"),
        "pass_message": "Correct! Bundler is installed.",
        "fail_hint": (
            "Bundler isn't available. It comes with Ruby setup, but if it's missing, run "
            "'gem install bundler' to install it directly."
        ),
    },
    {
        "step": "gem_version_check",
        "pattern": re.compile(r"^\s*gem\s+--version\b"),
        "pass_message": "Correct! RubyGems is installed.",
        "fail_hint": (
            "RubyGems (gem) isn't available. This should have been installed alongside Ruby -- "
            "re-run './scripts/activate_ubuntu.sh' and confirm 'ruby -v' works first."
        ),
    },
    {
        "step": "git_version_check",
        "pattern": re.compile(r"^\s*git\s+--version\b"),
        "pass_message": "Correct! git is installed.",
        "fail_hint": "git isn't installed. Run: sudo apt install git",
    },
    {
        "step": "git_config_list",
        "pattern": re.compile(r"^\s*git\s+config\s+--global\s+--list\b"),
        "pass_message": "Correct! Your git identity is confirmed.",
        "fail_hint": (
            "No global git config found. This means activate.sh either wasn't run, or the "
            "prompts weren't answered. Re-run './scripts/activate.sh' from the portfolio folder."
        ),
    },

    # ---- apt / package management ----

    {
        "step": "apt_update",
        "pattern": re.compile(r"^\s*sudo\s+apt\s+update\b"),
        "pass_message": "Correct! Your package list is up to date.",
        "fail_hint": (
            "'apt update' failed. Check your internet connection first. If you see a "
            "'Permission denied' or password issue, make sure you're entering your WSL "
            "Ubuntu password (not your Windows password) at the sudo prompt."
        ),
    },
    {
        "step": "apt_upgrade",
        "pattern": re.compile(r"^\s*sudo\s+apt\s+upgrade\b"),
        "pass_message": "Correct! Your packages are upgraded.",
        "fail_hint": "'apt upgrade' failed. Try running 'sudo apt update' first, then upgrade again.",
    },
    {
        "step": "apt_install",
        "pattern": re.compile(r"^\s*sudo\s+apt(-get)?\s+install\b"),
        "pass_message": "Correct! Package installed.",
        "fail_hint": (
            "Package install failed. Run 'sudo apt update' first to refresh the package list, "
            "then double-check the exact package name you're trying to install."
        ),
    },
    {
        "step": "apt_remove",
        "pattern": re.compile(r"^\s*sudo\s+apt(-get)?\s+remove\b"),
        "pass_message": "Correct! Package removed.",
        "fail_hint": "Package removal failed. Check that the package name is spelled correctly with 'apt list --installed'.",
    },

    # ---- Git workflow ----

    {
        "step": "git_pull",
        "pattern": re.compile(r"^\s*git\s+pull\b"),
        "pass_message": "Correct! Your local repo is up to date.",
        "fail_hint": (
            "git pull failed. This is often a merge conflict or uncommitted local changes. "
            "Run 'git status' to see what's going on before trying again."
        ),
    },
    {
        "step": "git_commit",
        "pattern": re.compile(r"^\s*git\s+commit\b"),
        "pass_message": "Correct! Your changes are committed.",
        "fail_hint": (
            "git commit failed. If it says nothing to commit, you may need 'git add <file>' "
            "first. If it complains about identity, run './scripts/activate.sh' again or set "
            "user.name/user.email manually."
        ),
    },
    {
        "step": "git_push",
        "pattern": re.compile(r"^\s*git\s+push\b"),
        "pass_message": "Correct! Your changes are pushed to GitHub.",
        "fail_hint": (
            "git push failed. Most often this means you need to 'git pull' first to bring in "
            "remote changes, or your credentials expired -- check that Git Credential Manager "
            "is still configured correctly."
        ),
    },

    # ---- Daily workflow ----

    {
        "step": "venv_activate",
        "pattern": re.compile(r"^\s*source\s+venv/bin/activate\b"),
        "pass_message": "Correct! Your virtual environment is active.",
        "fail_hint": (
            "Couldn't activate the virtual environment -- it probably doesn't exist yet. "
            "Run './scripts/venv.sh' from the portfolio folder first, then try activating again."
        ),
    },
    {
        "step": "vscode_open",
        "pattern": re.compile(r"^\s*code\s+\.\s*$"),
        "pass_message": "Correct! VS Code is open and connected to WSL.",
        "fail_hint": (
            "'code .' failed to open VS Code. This usually means VS Code isn't installed on "
            "the Windows side, or the WSL extension isn't set up. Reinstall VS Code and make "
            "sure to accept the default options during setup, which include WSL integration."
        ),
    },

    # ---- Project-specific agent steps ----

    {
        "step": "verify_tools_script",
        "pattern": re.compile(r"^\s*\./scripts/verifyTools\.sh\b"),
        "pass_message": "Correct! Your environment passed full verification.",
        "fail_hint": "verifyTools.sh reported a problem. Scroll up and look for the first [FAIL] line -- each one includes its own hint.",
    },
    {
        "step": "verify_tools_terminal_script",
        "pattern": re.compile(r"^\s*\./scripts/verifyToolsTerminal\.sh\b"),
        "pass_message": "Correct! Your environment passed full verification.",
        "fail_hint": "verifyToolsTerminal.sh found problems. Scroll up to the 'Warnings and failures' and 'Next steps' sections it printed -- each failing check has its own suggested fix.",
    },
    {
        "step": "agent_start",
        "pattern": re.compile(r"^\s*python3?\s+make-debug/analyze\.py\b"),
        "pass_message": "Correct! The troubleshooting agent started successfully.",
        "fail_hint": "The agent didn't start cleanly. Confirm your virtual environment is active ('source venv/bin/activate') and dependencies are installed.",
    },
    {
        "step": "jekyll_build",
        "pattern": re.compile(r"^\s*(make\b|bundle\s+exec\s+jekyll\b)"),
        "pass_message": "Correct! The project builds successfully.",
        "fail_hint": "The Jekyll build failed. Run 'bundle install' from the repo root, then check _config.yml for typos and try again.",
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

# Matches a plain 'cd <folder>' so a failed one (folder doesn't exist yet)
# can get a more useful message than the generic fallback -- most often
# this means the student hasn't cloned or created that folder yet.
CD_COMMAND_RE = re.compile(r"^\s*cd\s+(?P<target>\S+)\s*$")

# The step whose successful completion marks "done setting up tools" --
# shell_monitor.py watches for this and automatically triggers a full
# version-check pass right after it passes.
SETUP_COMPLETE_STEP = "venv_create"

# Preferred path for the automatic post-setup verification: if the
# project's own verifyToolsTerminal.sh script exists and is executable, the
# monitor runs it directly, since it does a far more thorough job than a
# handful of version checks -- it verifies the actual repo/config setup,
# the venv, Gemfile.lock, and that Jekyll genuinely builds, not just that
# each tool is installed.
FINAL_CHECK_SCRIPT = "./scripts/verifyToolsTerminal.sh"

# Fallback list used only when verifyToolsTerminal.sh isn't present (e.g.
# while testing the monitor outside a real project checkout) -- a simple
# per-tool version check, as (label, command) tuples. Each is run for real
# inside the student's shell so it reflects whatever they actually have
# installed.
FINAL_CHECK_COMMANDS = [
    ("python", "python --version"),
    ("pip", "pip --version"),
    ("ruby", "ruby -v"),
    ("bundle", "bundle -v"),
    ("gem", "gem --version"),
    ("git", "git --version"),
]


def evaluate_command(cmd: str, exit_code: int) -> dict:
    """
    Returns a dict: {status, step, note, hint}
      status: "PASS" | "FAIL" | "WARN" | "INFO"
      step:   matched mission step id, or None
      note:   short human-readable explanation
      hint:   text to show the student right now (a "Correct! Next: ..."
              confirmation on PASS, a remediation hint on FAIL), or None
              if there's nothing worth telling them
    """
    if not cmd:
        return {"status": "INFO", "step": None, "note": "empty command", "hint": None}

    matched = None
    for rule in STEP_RULES:
        if rule["pattern"].search(cmd):
            matched = rule
            break

    if matched:
        if exit_code == 0:
            return {
                "status": "PASS",
                "step": matched["step"],
                "note": f"'{cmd}' completed successfully.",
                "hint": matched["pass_message"],
            }
        else:
            fail_hint_fn = matched.get("fail_hint_fn")
            hint = fail_hint_fn(cmd) if fail_hint_fn else matched.get("fail_hint")
            return {
                "status": "FAIL",
                "step": matched["step"],
                "note": f"'{cmd}' exited with code {exit_code}.",
                "hint": hint,
            }

    # No specific mission step matched - fall back to generic error detection.
    if exit_code != 0 and not BENIGN_NONZERO.search(cmd):
        cd_match = CD_COMMAND_RE.match(cmd)
        if cd_match:
            target = cd_match.group("target")
            return {
                "status": "WARN",
                "step": None,
                "note": f"'{cmd}' exited with code {exit_code}.",
                "hint": (
                    f"There's no '{target}' folder here yet (or the name is misspelled). "
                    f"If it's a project you haven't set up yet, create it with 'mkdir {target}' "
                    f"or clone it with 'git clone <repo-url>' first, then cd into it."
                ),
            }
        return {
            "status": "WARN",
            "step": None,
            "note": f"'{cmd}' exited with code {exit_code}.",
            "hint": f"That last command ('{cmd}') didn't succeed (exit {exit_code}). "
                    f"Worth checking the output above before moving on.",
        }

    return {"status": "INFO", "step": None, "note": f"'{cmd}' ran normally.", "hint": None}