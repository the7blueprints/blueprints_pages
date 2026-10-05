import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const source = await readFile(new URL('../_projects/games/cs-pathway/model/systemSetupReport.js', import.meta.url), 'utf8');
const { getSystemSetupConfig, parseSystemSetupReport } = await import(
  `data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`
);

const scriptsDir = fileURLToPath(new URL('../scripts/', import.meta.url));
const linuxReport = execFileSync('python3', ['-c', `
import sys
sys.path.insert(0, ${JSON.stringify(scriptsDir)})
from linux_setup_agent import format_setup_report
print(format_setup_report([
    {'id': 'git', 'label': 'Git', 'passed': True, 'fix': ''},
    {'id': 'vscode', 'label': 'VS Code code command', 'passed': False, 'fix': 'Install VS Code.'},
], 'LINUX'))
`], { encoding: 'utf8' });

test('parses a Linux report produced by the real agent formatter', () => {
  const report = parseSystemSetupReport(linuxReport, 'linux');
  assert.equal(report.error, null);
  assert.equal(report.passedCount, 1);
  assert.equal(report.totalCount, 2);
  assert.equal(report.checks[1].fix, 'Install VS Code.');
});

test('accepts Linux reports for Kasm', () => {
  assert.equal(parseSystemSetupReport(linuxReport, 'kasm').totalCount, 2);
});

test('accepts a Windows report only for the Windows selection', () => {
  const windowsReport = linuxReport.replaceAll('LINUX', 'WINDOWS');
  assert.equal(parseSystemSetupReport(windowsReport, 'windows').error, null);
  assert.match(parseSystemSetupReport(linuxReport, 'windows').error, /No Windows\/WSL setup report/);
});

test('provides the correct agent command for each supported system', () => {
  assert.match(getSystemSetupConfig('linux').command, /linux_setup_agent\.py --check$/);
  assert.match(getSystemSetupConfig('windows').command, /windows_setup_agent\.py --check/);
  assert.match(getSystemSetupConfig('windows').command, /clip\.exe$/);
  assert.equal(getSystemSetupConfig('macos'), null);
});

test('rejects empty, incomplete, and unsupported reports', () => {
  assert.match(parseSystemSetupReport('', 'linux').error, /No Linux setup report/);
  assert.match(parseSystemSetupReport('=== LINUX SETUP CHECK v1 ===', 'linux').error, /No Linux setup report/);
  assert.match(parseSystemSetupReport('', 'macos').error, /Choose Linux/);
});
