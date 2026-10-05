// macSetupReport.js
// Parses the report printed by `python3 scripts/mac_setup_agent.py --check`
// (format defined in scripts/mac_setup_checks.py). Pure functions only, so the
// "Check my Mac setup" panel and its tests share one parser.
// This is self-reported output: it helps students find setup gaps, it is not proof.

export const MAC_SETUP_CHECK_COMMAND = 'python3 scripts/mac_setup_agent.py --check | tee /dev/tty | pbcopy';

const REPORT_START = '=== MAC SETUP CHECK v1 ===';
const REPORT_END = '=== END MAC SETUP CHECK ===';
const CHECK_LINE = /^(PASS|FAIL)\s+([a-z0-9-]+)\s*\|\s*([^|]+?)\s*(?:\|\s*(.+))?$/;
const MAX_PASTE_LENGTH = 20000;

/**
 * @returns {{ok: boolean, error: string|null, checks: Array<{id: string, label: string, passed: boolean, fix: string}>,
 *            passedCount: number, totalCount: number}}
 */
export function parseMacSetupReport(pasted) {
  const text = String(pasted || '').slice(0, MAX_PASTE_LENGTH).replace(/\x1b\[[0-9;]*m/g, '');
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  const start = lines.indexOf(REPORT_START);
  const end = lines.indexOf(REPORT_END, start + 1);

  if (start === -1 || end === -1) {
    return failure('No Mac setup report found. Run the command, then paste everything from the first === line to the last === line.');
  }

  const checks = [];
  for (const line of lines.slice(start + 1, end)) {
    const match = CHECK_LINE.exec(line);
    if (!match) continue; // SUMMARY and any stray lines
    const [, status, id, label, fix] = match;
    checks.push({ id, label: label.trim(), passed: status === 'PASS', fix: status === 'FAIL' ? (fix || '').trim() : '' });
  }

  if (checks.length === 0) {
    return failure('The report was empty. Run the command again and paste the whole report.');
  }

  const passedCount = checks.filter((check) => check.passed).length;
  return { ok: passedCount === checks.length, error: null, checks, passedCount, totalCount: checks.length };
}

function failure(error) {
  return { ok: false, error, checks: [], passedCount: 0, totalCount: 0 };
}
