// Parses the Linux/Windows report printed by `linux_setup_agent.py --check`.
// Windows students run the same agent inside WSL, where it identifies the host
// as Windows. Reports are pasted by the student and are not proof of execution.

const SYSTEM_CONFIG = Object.freeze({
  linux: {
    reportSystem: 'LINUX',
    label: 'Linux',
    icon: '🐧',
    terminalName: 'Terminal',
    command: 'python3 scripts/linux_setup_agent.py --check',
  },
  kasm: {
    reportSystem: 'LINUX',
    label: 'Kasm Linux',
    icon: '☁️',
    terminalName: 'Kasm Terminal',
    command: 'python3 scripts/linux_setup_agent.py --check',
  },
  windows: {
    reportSystem: 'WINDOWS',
    label: 'Windows/WSL',
    icon: '🪟',
    terminalName: 'WSL Ubuntu terminal',
    command: 'python3 scripts/windows_setup_agent.py --check | tee /dev/tty | clip.exe',
  },
});

const CHECK_LINE = /^(PASS|FAIL)\s+([a-z0-9-]+)\s*\|\s*([^|]+?)\s*(?:\|\s*(.+))?$/;
const MAX_PASTE_LENGTH = 20000;

export function getSystemSetupConfig(os) {
  return SYSTEM_CONFIG[os] || null;
}

export function parseSystemSetupReport(pasted, os) {
  const config = getSystemSetupConfig(os);
  if (!config) return failure('Choose Linux, Windows, or Kasm before checking your setup.');

  const text = String(pasted || '').slice(0, MAX_PASTE_LENGTH).replace(/\x1b\[[0-9;]*m/g, '');
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  const startMarker = `=== ${config.reportSystem} SETUP CHECK v1 ===`;
  const endMarker = `=== END ${config.reportSystem} SETUP CHECK ===`;
  const start = lines.indexOf(startMarker);
  const end = lines.indexOf(endMarker, start + 1);

  if (start === -1 || end === -1) {
    return failure(`No ${config.label} setup report found. Run the shown command in ${config.terminalName}, then paste the complete report.`);
  }

  const checks = [];
  for (const line of lines.slice(start + 1, end)) {
    const match = CHECK_LINE.exec(line);
    if (!match) continue;
    const [, status, id, label, fix] = match;
    checks.push({
      id,
      label: label.trim(),
      passed: status === 'PASS',
      fix: status === 'FAIL' ? (fix || '').trim() : '',
    });
  }

  if (checks.length === 0) return failure('The setup report was empty. Run the command again and paste the whole report.');
  const passedCount = checks.filter((check) => check.passed).length;
  return { ok: passedCount === checks.length, error: null, checks, passedCount, totalCount: checks.length };
}

function failure(error) {
  return { ok: false, error, checks: [], passedCount: 0, totalCount: 0 };
}
