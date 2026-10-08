// VoiceSettings.js - Global voice settings + corner settings button.
//
// One set of settings shared by every DialogueSystem on every level:
//   - Saved to localStorage, so choices survive level changes and page reloads.
//   - The corner button is a singleton mounted on document.body. Levels never
//     destroy it, so it stays in place across level transitions. Any
//     DialogueSystem that gets created re-mounts it if something removed it.
//
// Volume, speed, and pitch are multipliers on each level's own values, so a
// level that sets voiceRate: 0.9 still sounds slightly slower than one at 1.0.
//
// File location: @assets/js/GameEnginev1.1/essentials/VoiceSettings.js

const STORAGE_KEY = 'ocs-voice-settings';
const BUTTON_ID = 'ocs-voice-settings-button';
const PANEL_ID = 'ocs-voice-settings-panel';
const STYLE_ID = 'ocs-voice-settings-style';

const DEFAULTS = Object.freeze({
  enabled: true,
  volume: 1.0,   // 0–1, multiplies each level's voiceVolume
  speed: 1.0,    // 0.5–2, multiplies each level's voiceRate
  pitch: 1.0,    // 0.5–1.5, multiplies each level's voicePitch
  voiceName: '', // '' = automatic (DialogueSystem's built-in voice preference)
});

const clamp = (n, min, max, fallback) => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
};

const FORMAT = {
  volume: (v) => `${Math.round(v * 100)}%`,
  speed: (v) => `${v.toFixed(1)}×`,
  pitch: (v) => `${v.toFixed(2)}×`,
};

class VoiceSettings {
  static _settings = null;
  static _stopHandler = null;
  static _outsideClickHandler = null;
  static _voicesHandler = null;

  // ── Settings storage ────────────────────────────────────────────

  static get() {
    if (!VoiceSettings._settings) {
      let saved = {};
      try {
        saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {};
      } catch (_) {
        saved = {};
      }
      VoiceSettings._settings = VoiceSettings._normalize({ ...DEFAULTS, ...saved });
    }
    return { ...VoiceSettings._settings };
  }

  static set(partial = {}) {
    const next = VoiceSettings._normalize({ ...VoiceSettings.get(), ...partial });
    VoiceSettings._settings = next;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (_) {
      // Storage unavailable: settings still apply for this page session.
    }
    if (!next.enabled) VoiceSettings.stopSpeech();
    VoiceSettings._refreshButtonIcon();
    return { ...next };
  }

  static reset() {
    return VoiceSettings.set({ ...DEFAULTS });
  }

  static _normalize(s) {
    return {
      enabled: s.enabled !== false,
      volume: clamp(s.volume, 0, 1, DEFAULTS.volume),
      speed: clamp(s.speed, 0.5, 2, DEFAULTS.speed),
      pitch: clamp(s.pitch, 0.5, 1.5, DEFAULTS.pitch),
      voiceName: typeof s.voiceName === 'string' ? s.voiceName : '',
    };
  }

  // ── Speech helpers used by DialogueSystem ───────────────────────

  /** DialogueSystem registers its queue flush here so "voice off" stops everything. */
  static setStopHandler(fn) {
    VoiceSettings._stopHandler = typeof fn === 'function' ? fn : null;
  }

  static stopSpeech() {
    if (VoiceSettings._stopHandler) {
      VoiceSettings._stopHandler();
    } else if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }

  /**
   * Apply the player's settings on top of a level's base values.
   * Returns true if a specific voice was chosen, false if the caller
   * should fall back to its own automatic voice selection.
   */
  static apply(utterance, base = {}) {
    const s = VoiceSettings.get();
    utterance.volume = clamp((base.volume ?? 1) * s.volume, 0, 1, 1);
    utterance.rate = clamp((base.rate ?? 1) * s.speed, 0.1, 10, 1);
    utterance.pitch = clamp((base.pitch ?? 1) * s.pitch, 0, 2, 1);

    if (s.voiceName && window.speechSynthesis) {
      const chosen = window.speechSynthesis.getVoices().find((v) => v.name === s.voiceName);
      if (chosen) {
        utterance.voice = chosen;
        return true;
      }
    }
    return false;
  }

  static testVoice() {
    if (!window.speechSynthesis || !VoiceSettings.get().enabled) return;
    VoiceSettings.stopSpeech();
    const utterance = new SpeechSynthesisUtterance('This is how dialogue will sound.');
    VoiceSettings.apply(utterance, { rate: 0.9, pitch: 1, volume: 1 });
    window.speechSynthesis.speak(utterance);
  }

  // ── Corner button ───────────────────────────────────────────────

  static ensureButton() {
    if (typeof document === 'undefined' || !document.body) return;
    if (document.getElementById(BUTTON_ID)) return;

    VoiceSettings._injectStyles();

    const btn = document.createElement('button');
    btn.id = BUTTON_ID;
    btn.type = 'button';
    btn.setAttribute('aria-haspopup', 'dialog');
    btn.addEventListener('click', (event) => {
      event.stopPropagation();
      VoiceSettings.togglePanel();
    });
    document.body.appendChild(btn);
    VoiceSettings._refreshButtonIcon();
  }

  static _refreshButtonIcon() {
    const btn = document.getElementById(BUTTON_ID);
    if (!btn) return;
    const on = VoiceSettings.get().enabled;
    btn.textContent = on ? '🔊' : '🔇';
    btn.title = on ? 'Voice settings (voice on)' : 'Voice settings (voice off)';
    btn.setAttribute('aria-label', btn.title);
  }

  // ── Settings panel ──────────────────────────────────────────────

  static togglePanel() {
    if (document.getElementById(PANEL_ID)) {
      VoiceSettings.closePanel();
    } else {
      VoiceSettings.openPanel();
    }
  }

  static openPanel() {
    VoiceSettings.closePanel();

    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Voice settings');
    panel.innerHTML = `
      <div class="ocs-vs-title">Voice settings</div>
      <label class="ocs-vs-toggle">
        <input type="checkbox" id="ocs-vs-enabled">
        <span>Read dialogue aloud</span>
      </label>
      <label class="ocs-vs-row">
        <span class="ocs-vs-label">Volume <b id="ocs-vs-volume-val"></b></span>
        <input type="range" id="ocs-vs-volume" min="0" max="1" step="0.05">
      </label>
      <label class="ocs-vs-row">
        <span class="ocs-vs-label">Speed <b id="ocs-vs-speed-val"></b></span>
        <input type="range" id="ocs-vs-speed" min="0.5" max="2" step="0.1">
      </label>
      <label class="ocs-vs-row">
        <span class="ocs-vs-label">Pitch <b id="ocs-vs-pitch-val"></b></span>
        <input type="range" id="ocs-vs-pitch" min="0.5" max="1.5" step="0.05">
      </label>
      <label class="ocs-vs-row">
        <span class="ocs-vs-label">Voice</span>
        <select id="ocs-vs-voice"></select>
      </label>
      <div class="ocs-vs-actions">
        <button type="button" id="ocs-vs-test">Test voice</button>
        <button type="button" id="ocs-vs-reset">Reset</button>
      </div>`;

    document.body.appendChild(panel);

    const $ = (id) => panel.querySelector(`#${id}`);
    const sliders = ['volume', 'speed', 'pitch'];

    const sync = () => {
      const cur = VoiceSettings.get();
      $('ocs-vs-enabled').checked = cur.enabled;
      sliders.forEach((key) => {
        $(`ocs-vs-${key}`).value = String(cur[key]);
        $(`ocs-vs-${key}-val`).textContent = FORMAT[key](cur[key]);
        $(`ocs-vs-${key}`).disabled = !cur.enabled;
      });
      $('ocs-vs-voice').disabled = !cur.enabled;
      $('ocs-vs-test').disabled = !cur.enabled;
    };

    const fillVoices = () => {
      const select = $('ocs-vs-voice');
      if (!select) return;
      const voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
      const current = VoiceSettings.get().voiceName;

      select.innerHTML = '';
      select.appendChild(new Option('Automatic', ''));
      voices
        .slice()
        .sort((a, b) =>
          (Number(b.lang.startsWith('en')) - Number(a.lang.startsWith('en'))) ||
          a.name.localeCompare(b.name))
        .forEach((v) => select.appendChild(new Option(`${v.name} (${v.lang})`, v.name)));

      // A voice saved on another computer may not exist here; show Automatic.
      select.value = voices.some((v) => v.name === current) ? current : '';
    };

    fillVoices();
    sync();

    // Chrome loads voices asynchronously, so refill when they arrive.
    if (window.speechSynthesis?.addEventListener) {
      VoiceSettings._voicesHandler = fillVoices;
      window.speechSynthesis.addEventListener('voiceschanged', fillVoices);
    }

    $('ocs-vs-enabled').addEventListener('change', (event) => {
      VoiceSettings.set({ enabled: event.target.checked });
      sync();
    });

    sliders.forEach((key) => {
      $(`ocs-vs-${key}`).addEventListener('input', (event) => {
        const saved = VoiceSettings.set({ [key]: Number(event.target.value) });
        $(`ocs-vs-${key}-val`).textContent = FORMAT[key](saved[key]);
      });
    });

    $('ocs-vs-voice').addEventListener('change', (event) => {
      VoiceSettings.set({ voiceName: event.target.value });
    });

    $('ocs-vs-test').addEventListener('click', () => VoiceSettings.testVoice());

    $('ocs-vs-reset').addEventListener('click', () => {
      VoiceSettings.reset();
      fillVoices();
      sync();
    });

    // Keep keys (WASD, arrows on sliders, E) from reaching the game while
    // the panel has focus. Escape closes the panel.
    ['keydown', 'keyup', 'keypress'].forEach((type) => {
      panel.addEventListener(type, (event) => {
        if (type === 'keydown' && event.key === 'Escape') {
          VoiceSettings.closePanel();
          document.getElementById(BUTTON_ID)?.focus();
        }
        event.stopPropagation();
      });
    });
    panel.addEventListener('click', (event) => event.stopPropagation());

    // Close when clicking anywhere outside the panel or button.
    VoiceSettings._outsideClickHandler = (event) => {
      const btn = document.getElementById(BUTTON_ID);
      if (!panel.contains(event.target) && !(btn && btn.contains(event.target))) {
        VoiceSettings.closePanel();
      }
    };
    setTimeout(() => {
      if (VoiceSettings._outsideClickHandler) {
        document.addEventListener('pointerdown', VoiceSettings._outsideClickHandler);
      }
    }, 0);

    $('ocs-vs-enabled').focus();
  }

  static closePanel() {
    document.getElementById(PANEL_ID)?.remove();

    if (VoiceSettings._outsideClickHandler) {
      document.removeEventListener('pointerdown', VoiceSettings._outsideClickHandler);
      VoiceSettings._outsideClickHandler = null;
    }
    if (VoiceSettings._voicesHandler && window.speechSynthesis?.removeEventListener) {
      window.speechSynthesis.removeEventListener('voiceschanged', VoiceSettings._voicesHandler);
      VoiceSettings._voicesHandler = null;
    }
  }

  // ── Styles (uses each level's theme variables, so it matches every world) ──

  static _injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${BUTTON_ID} {
        position: fixed; top: 16px; right: 16px; z-index: 100070;
        width: 44px; height: 44px; padding: 0;
        display: flex; align-items: center; justify-content: center;
        border-radius: 50%;
        border: 2px solid var(--ocs-game-accent, #4ecca3);
        background: var(--ocs-game-panel-bg, rgba(13,13,26,0.92));
        color: var(--ocs-game-text, #e0e0e0);
        font-size: 20px; line-height: 1; cursor: pointer;
        box-shadow: 0 0 12px rgba(0,0,0,0.45);
      }
      #${BUTTON_ID}:hover { box-shadow: 0 0 14px var(--ocs-game-accent, #4ecca3); }
      #${BUTTON_ID}:focus-visible,
      #${PANEL_ID} :focus-visible {
        outline: 2px solid var(--ocs-game-accent, #4ecca3);
        outline-offset: 2px;
      }

      #${PANEL_ID} {
        position: fixed; top: 68px; right: 16px; z-index: 100070;
        width: min(300px, calc(100vw - 32px)); box-sizing: border-box;
        padding: 16px 18px; border-radius: 10px;
        border: 2px solid var(--ocs-game-accent, #4ecca3);
        background: var(--ocs-game-panel-bg, rgba(13,13,26,0.96));
        color: var(--ocs-game-text, #e0e0e0);
        font-family: "Courier New", monospace; font-size: 13px;
        box-shadow: 0 8px 28px rgba(0,0,0,0.5);
      }
      #${PANEL_ID} .ocs-vs-title {
        color: var(--ocs-game-accent, #4ecca3);
        font-weight: bold; font-size: 15px; margin-bottom: 14px;
      }
      #${PANEL_ID} .ocs-vs-toggle {
        display: flex; align-items: center; gap: 8px;
        margin-bottom: 14px; cursor: pointer;
      }
      #${PANEL_ID} .ocs-vs-row {
        display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px;
      }
      #${PANEL_ID} .ocs-vs-label {
        display: flex; justify-content: space-between;
      }
      #${PANEL_ID} .ocs-vs-label b { color: var(--ocs-game-accent, #4ecca3); }
      #${PANEL_ID} input[type="range"],
      #${PANEL_ID} input[type="checkbox"] {
        accent-color: var(--ocs-game-accent, #4ecca3);
      }
      #${PANEL_ID} input[type="range"] { width: 100%; margin: 0; }
      #${PANEL_ID} select {
        width: 100%; padding: 6px;
        background: var(--ocs-game-surface-alt, #1a1a2e);
        color: inherit; font-family: inherit; font-size: 12px;
        border: 1px solid var(--ocs-game-accent, #4ecca3); border-radius: 4px;
      }
      #${PANEL_ID} .ocs-vs-actions { display: flex; gap: 8px; margin-top: 4px; }
      #${PANEL_ID} .ocs-vs-actions button {
        flex: 1; padding: 8px; cursor: pointer;
        font-family: inherit; font-size: 12px; color: inherit;
        background: var(--ocs-game-surface-alt, #1a1a2e);
        border: 1px solid var(--ocs-game-accent, #4ecca3); border-radius: 6px;
      }
      #${PANEL_ID} button:disabled,
      #${PANEL_ID} input:disabled,
      #${PANEL_ID} select:disabled { opacity: 0.45; cursor: not-allowed; }
    `;
    document.head.appendChild(style);
  }
}

export default VoiceSettings;