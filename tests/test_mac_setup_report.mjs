import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const source = await readFile(new URL("../_projects/games/cs-pathway/model/macSetupReport.js", import.meta.url), "utf8");
const { parseMacSetupReport, MAC_SETUP_CHECK_COMMAND } = await import(
  `data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`
);

// Contract test: format a report with the real Python agent code, then parse it here.
const scriptsDir = fileURLToPath(new URL("../scripts/", import.meta.url));
const pythonReport = execFileSync("python3", ["-c", `
import sys
sys.path.insert(0, ${JSON.stringify(scriptsDir)})
from mac_setup_checks import CheckResult, format_report
print(format_report([
    CheckResult("homebrew", "Homebrew", True, "Install it from https://brew.sh, then restart your terminal."),
    CheckResult("vscode", "VS Code code command", False, "In VS Code: Cmd+Shift+P, then run Shell Command: Install 'code' command in PATH"),
    CheckResult("git-email", "Git user.email set", False, 'Run: git config --global user.email "you@example.com"'),
]))
`], { encoding: "utf8" });

test("parses a report produced by the Python agent", () => {
  const report = parseMacSetupReport(pythonReport);
  assert.equal(report.error, null);
  assert.equal(report.ok, false);
  assert.equal(report.passedCount, 1);
  assert.equal(report.totalCount, 3);
  assert.deepEqual(report.checks[0], { id: "homebrew", label: "Homebrew", passed: true, fix: "" });
  assert.equal(report.checks[1].fix, "In VS Code: Cmd+Shift+P, then run Shell Command: Install 'code' command in PATH");
  assert.equal(report.checks[2].fix, 'Run: git config --global user.email "you@example.com"');
});

test("an all-pass report is ok", () => {
  const report = parseMacSetupReport([
    "=== MAC SETUP CHECK v1 ===",
    "PASS git | Git",
    "PASS python3 | Python 3",
    "SUMMARY 2/2 passed",
    "=== END MAC SETUP CHECK ===",
  ].join("\n"));
  assert.equal(report.ok, true);
  assert.equal(report.totalCount, 2);
});

test("finds the report inside extra Terminal text, Windows line endings, and colors", () => {
  const pasted = [
    "Last login: Mon Oct  5 on ttys001",
    "ada@mac blueprints_pages % python3 scripts/mac_setup_agent.py --check",
    "Copy everything from the first === line to the last === line into the website.",
    "",
    "  === MAC SETUP CHECK v1 ===  ",
    "\x1b[32mPASS git | Git\x1b[0m",
    "=== END MAC SETUP CHECK ===",
    "ada@mac blueprints_pages %",
  ].join("\r\n");
  const report = parseMacSetupReport(pasted);
  assert.equal(report.error, null);
  assert.equal(report.checks[0].label, "Git");
});

test("text without a report asks the student to paste the whole report", () => {
  for (const pasted of ["", "zsh: command not found: python3", "=== MAC SETUP CHECK v1 ===\nPASS git | Git"]) {
    const report = parseMacSetupReport(pasted);
    assert.equal(report.ok, false);
    assert.match(report.error, /No Mac setup report found/);
  }
});

test("an empty report is rejected", () => {
  const report = parseMacSetupReport("=== MAC SETUP CHECK v1 ===\nSUMMARY 0/0 passed\n=== END MAC SETUP CHECK ===");
  assert.equal(report.ok, false);
  assert.match(report.error, /empty/);
});

test("the copied command runs the agent's check mode and copies the report", () => {
  assert.match(MAC_SETUP_CHECK_COMMAND, /^python3 scripts\/mac_setup_agent\.py --check\b/);
  assert.match(MAC_SETUP_CHECK_COMMAND, /pbcopy$/);
});
