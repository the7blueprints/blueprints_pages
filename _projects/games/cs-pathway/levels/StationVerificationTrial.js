/**
 * Student-facing output checks for Toolchain Trail. The browser can inspect
 * pasted output, but only a future trusted service can confirm it ran locally.
 */

import { verifyStationOutput, PASTE_PROMPTS } from '@assets/js/projects/cs-pathway/model/stationVerifiers.js';
export default class StationVerificationTrial {
  /**
   * @param {Object} opts
   * @param {Object} opts.station - station descriptor, see GameLevelCsPath2Toolchain.js STATIONS
   * @param {string} opts.station.id
   * @param {string} opts.station.name - in-world display name (e.g. "Terminal Town Gate")
   * @param {string} opts.station.skill - real-world skill label (e.g. "Shell fundamentals and package management")
   * @param {string} opts.station.narrativeHook - 1-2 sentence flavor text shown before the terminal
   * @param {string[]} opts.station.instructions - ordered list of real-world steps to show the student
   * @param {RegExp} opts.station.expectedCommandPattern - pattern the mock terminal checks input against
   * @param {string} opts.station.exampleCommand - a valid example command (shown as a hint)
   * @param {string} opts.station.funFact - fun fact shown by the NPC popup on success (level owns the popup, not this trial)
   * @param {Function} [opts.onComplete] - called with { stationId } when verified
   * @param {Function} [opts.onClose] - called when the student closes without completing
   */
   constructor({ station, os, onComplete, onClose } = {}) {
    this.station = station || {};
    this.os = os || 'linux';
    this.onComplete = onComplete || (() => {});
    this.onClose = onClose || (() => {});
    this.overlay = null;
    this.verified = false;
  }

  start() {
    this._render();
  }

  _render() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'svt-overlay';

    const instructions = Array.isArray(this.station.instructions) ? this.station.instructions : [];

    this.overlay.innerHTML = `
      <style>
        .svt-overlay {
          position: fixed;
          inset: 0;
          /* Above the level's status panels (10000) and zone alerts (100010). */
          z-index: 100040;
          background: radial-gradient(circle at 50% 20%, rgba(30,10,60,0.92), rgba(2,2,10,0.97));
          display: flex;
          align-items: center;
          justify-content: center;
          box-sizing: border-box;
          padding: 20px;
          font-family: "Courier New", monospace;
          color: #dbeafe;
        }

        .svt-modal {
          width: min(820px, 100%);
          max-height: calc(100vh - 40px);
          overflow: hidden;
          background: linear-gradient(180deg, #0b1026, #030410);
          border: 2px solid #7dd3fc;
          border-radius: 16px;
          box-shadow: 0 0 40px rgba(125, 211, 252, 0.35), 0 0 90px rgba(139, 92, 246, 0.15);
          display: flex;
          flex-direction: column;
        }

        .svt-header {
          padding: 14px 18px;
          border-bottom: 1px solid rgba(125, 211, 252, 0.35);
          background: rgba(8, 12, 32, 0.9);
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
        }

        .svt-title {
          font-size: 18px;
          font-weight: bold;
          color: #67e8f9;
          letter-spacing: 0.5px;
          line-height: 1.25;
        }

        .svt-skill {
          font-size: 11px;
          color: #a5b4fc;
          margin-top: 4px;
        }

        .svt-hook {
          font-size: 12px;
          color: #e0e7ff;
          margin-top: 10px;
          line-height: 1.5;
          font-style: italic;
          border-left: 2px solid #7dd3fc;
          padding-left: 10px;
        }

        .svt-close {
          background: transparent;
          border: 1px solid rgba(248, 113, 113, 0.6);
          color: #fca5a5;
          border-radius: 8px;
          padding: 5px 10px;
          cursor: pointer;
          font-family: inherit;
          font-size: 11px;
          flex-shrink: 0;
        }
        .svt-close:hover { background: rgba(127, 29, 29, 0.35); }

        .svt-body {
          padding: 16px 18px;
          overflow: auto;
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr);
          gap: 14px;
        }

        .svt-panel {
          background: rgba(10, 14, 36, 0.85);
          border: 1px solid rgba(125, 211, 252, 0.25);
          border-radius: 12px;
          padding: 12px;
          min-width: 0;
        }

        .svt-panel h4 {
          margin: 0 0 8px;
          color: #93c5fd;
          font-size: 12px;
          letter-spacing: 1px;
        }

        .svt-steps {
          margin: 0;
          padding-left: 18px;
          font-size: 12.5px;
          line-height: 1.7;
          color: #dbeafe;
        }

        .svt-terminal {
          background: #000;
          border: 1px solid #22d3ee;
          border-radius: 10px;
          padding: 12px;
          font-size: 13px;
          min-height: 190px;
          display: flex;
          flex-direction: column;
          box-shadow: inset 0 0 24px rgba(34, 211, 238, 0.12);
        }

        .svt-terminal-log {
          flex: 1;
          overflow-y: auto;
          color: #4ade80;
          white-space: pre-wrap;
          margin-bottom: 8px;
        }

        .svt-terminal-row {
          display: flex;
          align-items: center;
          gap: 6px;
          color: #22d3ee;
        }

        .svt-terminal-row input {
          flex: 1;
          background: transparent;
          border: none;
          outline: none;
          color: #e0f2fe;
          font-family: inherit;
          font-size: 13px;
        }

        .svt-hint {
          margin-top: 8px;
          font-size: 11px;
          color: #94a3b8;
        }

        .svt-hint code {
          color: #fbbf24;
          background: rgba(30, 41, 59, 0.7);
          padding: 1px 5px;
          border-radius: 4px;
        }

        .svt-status {
          margin-top: 10px;
          font-size: 12px;
          min-height: 16px;
        }
        .svt-status.pending { color: #fbbf24; }
        .svt-status.ok { color: #4ade80; }
        .svt-status.err { color: #f87171; }

        .svt-actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          padding: 12px 18px;
          border-top: 1px solid rgba(125, 211, 252, 0.3);
          background: rgba(8, 12, 32, 0.9);
        }

        .svt-btn {
          border: 1px solid #7dd3fc;
          background: rgba(56, 189, 248, 0.12);
          color: #e0f2fe;
          border-radius: 10px;
          padding: 9px 16px;
          cursor: pointer;
          font-family: inherit;
          font-weight: bold;
          font-size: 12px;
        }
        .svt-btn:hover { background: rgba(56, 189, 248, 0.25); }
        .svt-btn.primary {
          background: #38bdf8;
          color: #061225;
        }
        .svt-btn:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }

        .svt-checks {
          margin-top: 10px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .svt-check {
          font-size: 12px;
          line-height: 1.4;
          padding: 6px 8px;
          border-radius: 6px;
        }
        .svt-check.pass {
          color: #4ade80;
          background: rgba(34, 197, 94, 0.08);
        }
        .svt-check.fail {
          color: #f87171;
          background: rgba(248, 113, 113, 0.08);
        }
        .svt-check-detail {
          display: block;
          margin-top: 2px;
          font-size: 11px;
          color: #fca5a5;
        }

        .svt-verify {
          margin-top: 12px;
          padding: 10px 12px;
          border: 1px dashed rgba(251, 191, 36, 0.6);
          border-radius: 8px;
          font-size: 12px;
          line-height: 1.5;
          color: #fde68a;
        }
        .svt-verify strong { color: #fbbf24; }

        .svt-prompt {
          font-size: 12px;
          color: #fbbf24;
          margin-bottom: 8px;
          line-height: 1.5;
        }

        .svt-paste {
          flex: 1;
          min-height: 170px;
          resize: vertical;
          background: transparent;
          border: none;
          outline: none;
          color: #e0f2fe;
          font-family: inherit;
          font-size: 12px;
          white-space: pre;
        }

        @media (max-width: 860px) {
          .svt-body { grid-template-columns: 1fr; }
        }

        @media (max-width: 520px) {
          .svt-overlay { padding: 10px; }
          .svt-modal { max-height: calc(100vh - 20px); }
          .svt-header {
            padding: 12px;
            flex-direction: column;
          }
          .svt-body { padding: 12px; }
          .svt-actions {
            padding: 12px;
            flex-direction: column-reverse;
          }
          .svt-btn { width: 100%; }
        }
      </style>

      <div class="svt-modal">
        <div class="svt-header">
          <div>
            <div class="svt-title">⚙ ${this._escape(this.station.name || 'Station')}</div>
            <div class="svt-skill">${this._escape(this.station.skill || '')}</div>
            <div class="svt-hook">${this._escape(this.station.narrativeHook || '')}</div>
          </div>
          <button class="svt-close" id="svt-close">✕ Close</button>
        </div>

        <div class="svt-body">
          <div class="svt-panel">
            <h4>MISSION BRIEFING</h4>
            <ol class="svt-steps">
              ${instructions.map((step) => `<li>${this._escape(step)}</li>`).join('')}
            </ol>
                        <div class="svt-verify"><strong>FINAL STEP, VERIFY:</strong> ${this._escape(PASTE_PROMPTS[this.station.id] || 'Run the command and paste its output.')}</div>
          </div>

          <div class="svt-panel">
            <h4>VERIFY YOUR OUTPUT</h4>
            <div class="svt-prompt">${this._escape(PASTE_PROMPTS[this.station.id] || 'Run the command and paste its output.')}</div>
            <div class="svt-terminal">
              <textarea class="svt-paste" id="svt-input" spellcheck="false" placeholder="Paste your terminal output here..."></textarea>
            </div>
            <div class="svt-hint">
              Paste terminal output for practice feedback. This page cannot confirm that a command ran on your computer. Never paste passwords, tokens, or private keys.
            </div>
            <div class="svt-status" id="svt-status"></div>
            <div class="svt-checks" id="svt-checks"></div>
          </div>
        </div>

        <div class="svt-actions">
          <button class="svt-btn" id="svt-cancel">Not Now</button>
          <button class="svt-btn primary" id="svt-run" disabled>Verify Output</button>
        </div>
      </div>
    `;

    document.body.appendChild(this.overlay);

    this.logEl = this.overlay.querySelector('#svt-log');
    this.statusEl = this.overlay.querySelector('#svt-status');
    this.checksEl = this.overlay.querySelector('#svt-checks');
    this.inputEl = this.overlay.querySelector('#svt-input');
    this.runBtn = this.overlay.querySelector('#svt-run');

    this.overlay.querySelector('#svt-close').onclick = () => this._close();
    this.overlay.querySelector('#svt-cancel').onclick = () => this._close();
    this.runBtn.onclick = () => this._attemptVerify();

    this.inputEl.addEventListener('input', () => {
      this.runBtn.disabled = this.inputEl.value.trim().length === 0;
    });
  

    this.inputEl.focus();
  }

  async _attemptVerify() {
    const pasted = this.inputEl.value;
    if (!pasted.trim()) return;

    this._setStatus('pending', 'Checking your output...');
    this._renderChecks([]);
    this.runBtn.disabled = true;
    await new Promise((r) => setTimeout(r, 300));

    const result = verifyStationOutput(this.station.id, pasted, { os: this.os });
    this._renderChecks(result.checks);

    if (result.ok) {
      this._setStatus('ok', '✓ Verified! Unlocking next station...');
      this.verified = true;
      setTimeout(() => {
        this.onComplete({ stationId: this.station.id });
        this._close(false);
      }, 1200);
    } else {
      const passed = result.checks.filter((c) => c.passed).length;
      const total = result.checks.length;
      this._setStatus(
        'err',
        total > 0
          ? `${passed}/${total} checks passed. Fix the ✗ items and paste again.`
          : result.summary,
      );
      this.runBtn.disabled = false;
      this.inputEl.focus();
    }
  }
    _renderChecks(checks = []) {
    if (!this.checksEl) return;
    this.checksEl.innerHTML = checks.map((c) => `
      <div class="svt-check ${c.passed ? 'pass' : 'fail'}">
        ${c.passed ? '✓' : '✗'} ${this._escape(c.label)}
        ${!c.passed && c.detail ? `<span class="svt-check-detail">${this._escape(c.detail)}</span>` : ''}
      </div>
    `).join('');
  }

  _appendLog(line) {
    if (!this.logEl) return;
    this.logEl.textContent += `\n${line}`;
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }

  _setStatus(kind, text) {
    if (!this.statusEl) return;
    this.statusEl.className = `svt-status ${kind}`;
    this.statusEl.textContent = text;
  }

  _close(callCallback = true) {
    this.overlay?.remove();
    this.overlay = null;
    if (callCallback && !this.verified) {
      this.onClose?.();
    }
  }

  destroy() {
    this._close(false);
  }

  _escape(value = '') {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }
}
