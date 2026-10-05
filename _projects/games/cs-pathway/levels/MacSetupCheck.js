// MacSetupCheck.js
// "Check my Mac setup" button + panel for Toolchain Trail (shown when macOS is
// the selected OS). A web page cannot run programs on the student's Mac, so the
// panel copies a Terminal command that runs the Mac setup agent's read-only
// checks; the student pastes the report back and the panel shows each result.
// Results are only shown, never saved. Styles: sass/mac-setup-check.scss.
import { MAC_SETUP_CHECK_COMMAND, parseMacSetupReport } from '../model/macSetupReport.js';

class MacSetupCheck {
  constructor() {
    this.button = null;
    this.overlay = null;
  }

  setVisible(visible) {
    if (visible && !this.button) {
      this.button = document.createElement('button');
      this.button.type = 'button';
      this.button.className = 'cs-pathway-mac-check-button';
      this.button.textContent = '🍎 Check my Mac setup';
      this.button.addEventListener('click', () => this.open());
      document.body.appendChild(this.button);
    } else if (!visible && this.button) {
      this.button.remove();
      this.button = null;
      this.close();
    }
  }

  open() {
    if (this.overlay) return;
    this.overlay = document.createElement('div');
    this.overlay.className = 'cs-pathway-mac-check';
    this.overlay.innerHTML = `
      <div class="cs-pathway-mac-check__dialog" role="dialog" aria-modal="true" aria-labelledby="mac-check-title">
        <button type="button" class="cs-pathway-mac-check__close" aria-label="Close">×</button>
        <h2 id="mac-check-title">Check my Mac setup</h2>
        <p><strong>1.</strong> In Terminal, go to your <code>blueprints_pages</code> folder and run:</p>
        <div class="cs-pathway-mac-check__command">
          <code></code>
          <button type="button" class="cs-pathway-mac-check__copy">Copy command</button>
        </div>
        <p class="cs-pathway-mac-check__note">It only reads versions and settings; nothing is installed or changed.
          The report prints in Terminal and is copied to your clipboard.
          If <code>python3</code> is not found, run <code>xcode-select --install</code> first.</p>
        <p><strong>2.</strong> Paste the report here:</p>
        <textarea rows="7" spellcheck="false" placeholder="=== MAC SETUP CHECK v1 === ..."></textarea>
        <button type="button" class="cs-pathway-mac-check__submit">Check my setup</button>
        <div class="cs-pathway-mac-check__results" aria-live="polite"></div>
      </div>`;

    this.overlay.querySelector('.cs-pathway-mac-check__command code').textContent = MAC_SETUP_CHECK_COMMAND;
    this.overlay.querySelector('.cs-pathway-mac-check__close').addEventListener('click', () => this.close());
    this.overlay.querySelector('.cs-pathway-mac-check__copy').addEventListener('click', (event) => this.copyCommand(event.currentTarget));
    this.overlay.querySelector('.cs-pathway-mac-check__submit').addEventListener('click', () => this.showResults());
    this.overlay.addEventListener('click', (event) => {
      if (event.target === this.overlay) this.close();
    });
    // Keep typing in the panel from moving the player; Escape closes it.
    this.overlay.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Escape') this.close();
    });

    document.body.appendChild(this.overlay);
    this.overlay.querySelector('textarea').focus();
  }

  async copyCommand(copyButton) {
    try {
      await navigator.clipboard.writeText(MAC_SETUP_CHECK_COMMAND);
      copyButton.textContent = 'Copied!';
    } catch (error) {
      // Clipboard access can be blocked; the command is still visible to copy by hand.
      console.warn('[MacSetupCheck] clipboard unavailable:', error);
      copyButton.textContent = 'Select and copy it';
    }
  }

  showResults() {
    const report = parseMacSetupReport(this.overlay.querySelector('textarea').value);
    const results = this.overlay.querySelector('.cs-pathway-mac-check__results');
    results.replaceChildren();

    const summary = document.createElement('p');
    summary.className = 'cs-pathway-mac-check__summary';
    if (report.error) {
      summary.textContent = report.error;
      summary.classList.add('is-error');
      results.appendChild(summary);
      return;
    }
    summary.textContent = report.ok
      ? `All ${report.totalCount} checks passed. Your Mac is set up!`
      : `${report.passedCount} of ${report.totalCount} checks passed. Fix the items marked ✗, then run the check again.`;
    summary.classList.add(report.ok ? 'is-ok' : 'is-partial');
    results.appendChild(summary);

    const list = document.createElement('ul');
    for (const check of report.checks) {
      const item = document.createElement('li');
      item.className = check.passed ? 'is-pass' : 'is-fail';
      const label = document.createElement('span');
      label.textContent = `${check.passed ? '✓' : '✗'} ${check.label}`;
      item.appendChild(label);
      if (check.fix) {
        const fix = document.createElement('code');
        fix.textContent = check.fix;
        item.appendChild(fix);
      }
      list.appendChild(item);
    }
    results.appendChild(list);
  }

  close() {
    this.overlay?.remove();
    this.overlay = null;
  }

  destroy() {
    this.setVisible(false);
  }
}

export default MacSetupCheck;
