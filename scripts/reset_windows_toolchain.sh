#!/bin/bash

## TESTING ONLY: undoes the Windows (WSL Ubuntu) tool setup from the Toolchain
## Trail game so the setup steps can be tried again from scratch.
##
## Run inside WSL Ubuntu from the blueprints_pages folder:
##   bash scripts/reset_windows_toolchain.sh            # lists what it will remove, then asks
##   bash scripts/reset_windows_toolchain.sh --dry-run  # only lists, changes nothing
##   bash scripts/reset_windows_toolchain.sh --yes      # skips the confirmation
##
## Run it from your own blueprints_pages checkout, not from ~/opencs/pages,
## because it deletes ~/opencs/pages.
##
## Removes what the trail's Windows steps add, as listed in
## scripts/reset_windows_toolchain_items.txt: the pages clone the game checks
## (with its venv and .bundle), the apt packages and /opt/gems from
## activate_ubuntu.sh, its ~/.bashrc lines, and the global git name, email and
## credential helper. It also stops the Toolchain Trail agent and deletes its
## log, and deletes setup-report.md. python3 and git stay installed because
## Ubuntu itself depends on them. Windows-side apps (VS Code, Git Credential
## Manager) cannot be removed from WSL, so the steps for those are printed.

set -euo pipefail

PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
ITEMS_FILE="$PROJECT_ROOT/scripts/reset_windows_toolchain_items.txt"
AGENT="$PROJECT_ROOT/scripts/toolchain_agent.py"
BASHRC="$HOME/.bashrc"
SETUP_REPORT="$PROJECT_ROOT/setup-report.md"

# Prints the values of one kind from the items file, one per line, with ~/ as $HOME/.
items_of_kind() {
    awk -v kind="$1" -v home="$HOME" '
        $1 == kind {
            value = substr($0, length(kind) + 2)
            if (substr(value, 1, 2) == "~/") value = home substr(value, 2)
            print value
        }
    ' "$ITEMS_FILE"
}

mapfile -t APT_PACKAGES < <(items_of_kind apt-package)
mapfile -t SYSTEM_FOLDERS < <(items_of_kind system-folder)
mapfile -t FOLDERS < <(items_of_kind folder)
mapfile -t FILES < <(items_of_kind file)
mapfile -t BASHRC_LINES < <(items_of_kind bashrc-line)
mapfile -t GIT_SETTINGS < <(items_of_kind git-setting)

DRY_RUN=false
ASSUME_YES=false

usage() {
    sed -n 's/^## \{0,1\}//p' "$0"
}

for arg in "$@"; do
    case "$arg" in
        --dry-run) DRY_RUN=true ;;
        --yes) ASSUME_YES=true ;;
        -h|--help) usage; exit 0 ;;
        *) echo "Unknown option: $arg" >&2; usage >&2; exit 2 ;;
    esac
done

if ! grep -qi microsoft /proc/version 2>/dev/null; then
    echo "This reset is for Windows WSL Ubuntu only. Open Ubuntu from Windows Terminal and run it there." >&2
    exit 2
fi

# Never delete the checkout this script is running from.
for folder in "${FOLDERS[@]}"; do
    case "$PROJECT_ROOT/" in
        "$folder"/*)
            echo "This script is running from inside $folder, which it would delete. Run it from another blueprints_pages checkout." >&2
            exit 2
            ;;
    esac
done

log() {
    echo "=== $1 ==="
}

installed_packages() {
    local package
    for package in "${APT_PACKAGES[@]}"; do
        if dpkg-query -W -f='${Status}' "$package" 2>/dev/null | grep -q 'install ok installed'; then
            echo "$package"
        fi
    done
}

list_planned_changes() {
    local packages
    packages="$(installed_packages | tr '\n' ' ')"
    echo "This will remove (testing only):"
    echo "  apt packages:     ${packages:-none installed}"
    local path
    for path in "${SYSTEM_FOLDERS[@]}"; do
        [ -d "$path" ] && echo "  folder:           $path"
    done
    for path in "${FOLDERS[@]}"; do
        [ -d "$path" ] && echo "  folder:           $path (any unpushed work there is lost)"
    done
    for path in "${FILES[@]}" "$SETUP_REPORT"; do
        [ -f "$path" ] && echo "  file:             $path"
    done
    echo "  agent:            the Toolchain Trail agent is stopped if it is running"
    echo "  ~/.bashrc:        Toolchain Trail lines (backup saved first)"
    echo "  git --global:     ${GIT_SETTINGS[*]}"
}

reset_bashrc() {
    [ -f "$BASHRC" ] || return 0
    local backup="$BASHRC.before-toolchain-reset.$(date +%Y%m%d%H%M%S)"
    cp "$BASHRC" "$backup"
    local filtered
    filtered="$(mktemp)"
    # Drop the exact added lines plus the 7-line virtualenv prompt block.
    # Lines go through the environment because awk -v rejects embedded newlines.
    TOOLCHAIN_LINES="$(printf '%s\n' "${BASHRC_LINES[@]}")" awk '
        BEGIN { count = split(ENVIRON["TOOLCHAIN_LINES"], list, "\n"); for (i = 1; i <= count; i++) if (list[i] != "") drop[list[i]] = 1 }
        skip > 0 { skip--; next }
        $0 == "# Show Python virtualenv in prompt" { skip = 6; next }
        !($0 in drop)
    ' "$BASHRC" > "$filtered"
    cat "$filtered" > "$BASHRC"
    rm -f "$filtered"
    echo "Saved the old ~/.bashrc as $backup"
}

reset_git_config() {
    local key
    for key in "${GIT_SETTINGS[@]}"; do
        git config --global --unset-all "$key" 2>/dev/null || true
    done
}

remove_packages() {
    local packages
    mapfile -t packages < <(installed_packages)
    if [ "${#packages[@]}" -gt 0 ]; then
        sudo apt-get purge -y "${packages[@]}"
        sudo apt-get autoremove -y
    fi
}

print_windows_steps() {
    cat <<'EOF'

Finish the reset on the Windows side (WSL cannot change Windows apps):
  1. Settings > Apps > Installed apps: uninstall "Microsoft Visual Studio Code"
     and "Git" (this removes Git Credential Manager).
  2. Delete the WSL VS Code server so it reinstalls: rm -rf ~/.vscode-server
  3. In the browser running the game, clear the site's localStorage key
     ocs-toolchain-agent-session so the agent pairs again.
  4. Close this terminal and open a new Ubuntu terminal before starting the trail.
To also redo "wsl --install", run in PowerShell: wsl --unregister Ubuntu-24.04
(this deletes the whole Ubuntu install, including this checkout).
EOF
}

list_planned_changes
if [ "$DRY_RUN" = true ]; then
    echo "Dry run: nothing was changed."
    exit 0
fi
if [ "$ASSUME_YES" != true ]; then
    read -r -p "Type RESET to continue: " answer
    if [ "$answer" != "RESET" ]; then
        echo "Cancelled; nothing was changed."
        exit 1
    fi
fi

log "Stopping the Toolchain Trail agent"
python3 "$AGENT" --stop
log "Removing apt packages"
remove_packages
log "Removing trail folders and files"
sudo rm -rf "${SYSTEM_FOLDERS[@]}"
for folder in "${FOLDERS[@]}"; do
    rm -rf "$folder"
    rmdir "$(dirname "$folder")" 2>/dev/null || true  # the trail made the parent (opencs) for the clone; kept if anything else is in it
done
rm -f "${FILES[@]}" "$SETUP_REPORT"
log "Cleaning ~/.bashrc"
reset_bashrc
log "Clearing global git identity and credential helper"
reset_git_config

echo "WSL reset complete."
print_windows_steps
