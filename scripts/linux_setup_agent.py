#!/usr/bin/env python3
"""Offline Linux setup diagnostics. Never executes pasted commands or fixes."""
import argparse
import platform
import shutil
import subprocess
import sys
from pathlib import Path


def diagnose(log, debian):
    """Return evidence-matched advice; absence of matches is not success."""
    lower = log.lower()
    advice = []
    if "externally-managed-environment" in lower:
        advice.append("System Python rejected installation. From the project folder: python3 -m venv venv; source venv/bin/activate; python -m pip install -r requirements.txt. Do not use sudo pip or --break-system-packages.")
    if "ensurepip is not available" in lower or "no module named venv" in lower:
        advice.append("Python venv support is missing. " + (
            "Run sudo apt update then sudo apt install python3-venv for the distribution Python; custom Python versions need matching venv support. Retry python3 -m venv venv."
            if debian else "Install venv support for your exact Python version using your distribution documentation; then retry python3 -m venv venv."))
    if "activate" in lower and "no such file or directory" in lower:
        advice.append("Activation path was not found. Check pwd and ls venv/bin/activate in the project folder. If venv does not exist, run python3 -m venv venv. Bash/zsh: source venv/bin/activate. Fish: source venv/bin/activate.fish.")
    if "permission denied" in lower:
        advice.append("Access was denied; the log alone does not establish why. Check ls -ld on the named path and confirm you own the project. Do not apply blanket sudo or chmod 777.")
    if "could not get lock" in lower or "unable to acquire the dpkg" in lower:
        advice.append("A package-manager lock could not be acquired. Check whether another updater is running and let it finish. Do not delete lock files.")
    if "temporary failure resolving" in lower or "could not resolve host" in lower:
        advice.append("Name resolution failed. Check network connectivity and DNS for the hostname in the error, then retry the original command.")
    if "command not found" in lower:
        advice.append("A command is missing from PATH. Identify the exact command in the error and check command -v <command>. For Python use python3 before activation. A missing command alone does not prove the package is uninstalled.")
    if "could not find gem" in lower or "bundler::gemnotfound" in lower:
        advice.append("Bundler cannot find a required gem. From the folder containing Gemfile, run bundle install and then bundle check. Python venv does not install Ruby gems.")
    return advice


def probe(command):
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=10)
        output = (result.stdout or result.stderr).strip().splitlines()
        return result.returncode == 0, output[0][:240] if output else "No version output"
    except (OSError, subprocess.TimeoutExpired) as exc:
        return False, str(exc)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--log', type=Path, help='Analyze a saved terminal error locally')
    parser.add_argument('--distro', choices=['debian', 'other'], help='Target Linux family for saved logs; useful when analyzing on a Mac')
    args = parser.parse_args()
    is_linux = platform.system() == 'Linux'
    info = platform.freedesktop_os_release() if is_linux else {}
    family = (info.get('ID', '') + ' ' + info.get('ID_LIKE', '')).split()
    debian = args.distro == 'debian' or (args.distro is None and bool(set(family) & {'debian', 'ubuntu', 'linuxmint', 'kali'}))
    print('Linux setup helper — local, rule-based feedback; no AI service or uploads.')
    print('Host:', info.get('PRETTY_NAME', platform.system()))
    if args.log:
        try:
            log = args.log.read_text(errors='replace')
        except OSError as exc:
            parser.error(str(exc))
        advice = diagnose(log, debian)
        for item in advice:
            print('Possible cause / next check:', item)
        if not advice:
            print('Unresolved: no known error pattern matched. Supply the exact command, full error, Linux distribution, and shell to your assistant. This does not establish success.')
        return 1 if advice else 2
    if not is_linux:
        print('Linux system checks skipped. Run this script inside Linux or WSL, or use --log with --distro to analyze Linux output here.')
        return 2
    failed = False
    for name, flag in [('python3', '--version'), ('git', '--version'), ('ruby', '--version'), ('gem', '--version'), ('bundle', '--version'), ('make', '--version')]:
        executable = shutil.which(name)
        ok, detail = probe([executable, flag]) if executable else (False, 'Not found in PATH')
        print(('OK' if ok else 'CHECK') + ': ' + name + ': ' + detail)
        failed |= not ok
    print('Python interpreter:', sys.executable)
    active = sys.prefix != sys.base_prefix
    print('OK: running inside a venv' if active else 'CHECK: not running inside a venv. From the project folder: source venv/bin/activate, then rerun with python.')
    failed |= not active
    ok, detail = probe([sys.executable, '-m', 'pip', '--version'])
    print(('OK' if ok else 'CHECK') + ': pip: ' + detail)
    failed |= not ok
    print('These checks cover tool availability, not a complete site build. Verify dependencies with python -m pip check and bundle check, then follow the project Makefile.')
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
