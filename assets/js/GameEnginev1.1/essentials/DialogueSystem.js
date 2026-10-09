// VOICE_SETTINGS_START
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
  speed: 1.0,    // 0.4–2, multiplies each level's voiceRate
  pitch: 1.0,    // 0.1–2, multiplies each level's voicePitch
  language: 'en',  // base language code: 'en', 'es', 'zh', ...
  voiceName: '',   // '' = automatic voice for the chosen language
});

// Max natural voices listed per language, so the picker stays short.
const MAX_VOICES_PER_LANGUAGE = 8;
const MAX_GOOFY_VOICES_PER_LANGUAGE = 20;

// Voices confirmed to sound distinct in your browser (lowercase, cleaned names).
// If any are listed, ONLY these show in the Voice dropdown.
// Leave empty ([]) to show the automatic short list.
const ALLOWED_VOICES = [];

// Voices that were explicitly removed stay hidden.
const HIDDEN_VOICES = new Set(['daniel']);

// Real novelty voices supplied by the operating system. They are shown in a
// separate group when installed, and are never selected automatically.
const GOOFY_SYSTEM_VOICES = new Set([
  'albert', 'bad news', 'bahh', 'bells', 'boing', 'bubbles', 'cellos',
  'deranged', 'good news', 'hysterical', 'jester', 'junior', 'organ',
  'pipe organ', 'princess', 'ralph', 'superstar', 'trinoids', 'whisper',
  'wobble', 'zarvox', 'fred', 'kathy',
]);

// Favorites always appear first. Unavailable favorites stay visible but disabled.
const COMMON_LANGUAGES = Object.freeze([
  { code: 'en', label: 'English' },
  { code: 'zh', label: '中文 (Chinese)' },
  { code: 'es', label: 'Español (Spanish)' },
]);

const VOICE_TEST_SAMPLES = Object.freeze({
  en: 'This is how dialogue will sound.',
  es: 'Así sonará el diálogo.',
  zh: '这就是对话的声音。',
});

// Natural-sounding voices to list first when they exist.
const PREFERRED_VOICES = Object.freeze({
  en: [
    'samantha', 'karen', 'moira', 'tessa', 'rishi', 'shelley',
    'eddy', 'flo', 'grandma', 'grandpa', 'reed', 'rocko', 'sandy',
    'google us english', 'google uk english female', 'google uk english male',
  ],
  es: [
    'mónica', 'monica', 'paulina', 'jorge', 'marisol', 'carlos',
    'google español', 'google español de estados unidos', 'sabina', 'helena', 'pablo',
  ],
  zh: [
    'ting-ting', 'sin-ji', 'mei-jia', 'li-mu', 'google 普通话（中国大陆）',
    'google 國語（臺灣）', 'google 粤語（香港）', 'huihui', 'yaoyao', 'kangkang',
  ],
  default: ['thomas', 'amelie', 'anna', 'alice'],
});

/** "Shelley (English (United States))" -> "Shelley"; "Google español" stays. */
const cleanVoiceName = (name = '') => name.replace(/\s*\(.*\)\s*$/, '').trim() || name;

/** Normalize BCP-47 bases and common browser aliases to our picker codes. */
const baseLanguage = (lang = '') => {
  const base = String(lang).toLowerCase().split(/[-_]/)[0];
  return ({ cmn: 'zh', yue: 'zh', zho: 'zh', iw: 'he', in: 'id', nb: 'no', nn: 'no' })[base] || base;
};

/** "es" -> "Spanish" (falls back to the code if the browser can't name it). */
const languageLabel = (code) => {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) || code;
  } catch (_) {
    return code;
  }
};

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
      speed: clamp(s.speed, 0.4, 2, DEFAULTS.speed),
      pitch: clamp(s.pitch, 0.1, 2, DEFAULTS.pitch),
      language: typeof s.language === 'string' && s.language ? baseLanguage(s.language) : 'en',
      voiceName: typeof s.voiceName === 'string' ? s.voiceName : '',
    };
  }

  // ── Voice catalog (short, cleaned-up lists) ─────────────────────

  static _allVoices() {
    return window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
  }

  /** Favorites first, followed by every other language with an installed voice. */
  static getLanguages() {
    const codes = new Set(
      VoiceSettings._allVoices()
        .filter((v) => !HIDDEN_VOICES.has(cleanVoiceName(v.name).toLowerCase()))
        .map((v) => baseLanguage(v.lang))
        .filter(Boolean),
    );
    // English can use the browser's default voice even before voices finish loading.
    codes.add('en');
    const favoriteCodes = new Set(COMMON_LANGUAGES.map((language) => language.code));
    const favorites = COMMON_LANGUAGES.map((language) => ({
      ...language,
      favorite: true,
      available: language.code === 'en' || codes.has(language.code),
    }));
    const others = [...codes]
      .filter((code) => !favoriteCodes.has(code))
      .map((code) => ({ code, label: languageLabel(code) }))
      .sort((a, b) => a.label.localeCompare(b.label))
      .map((language) => ({ ...language, favorite: false, available: true }));
    return [...favorites, ...others];
  }

  // ── Translation (English dialogue -> chosen language) ───────────
  //
  // Chrome's built-in on-device Translator API keeps dialogue on the device.
  // If translation is unavailable, the line is spoken in English instead.

  static _translationCache = new Map();
  static _translators = new Map();

  static async translate(text, language) {
    if (!text || !language || language === 'en') return text;

    const key = `${language}|${text}`;
    if (VoiceSettings._translationCache.has(key)) {
      return VoiceSettings._translationCache.get(key);
    }

    let result = null;
    try {
      result = await VoiceSettings._translateBuiltIn(text, language);
    } catch (_) {
      result = null;
    }

    if (result) VoiceSettings._translationCache.set(key, result);
    return result; // null = translation failed
  }

  /** Start downloading Chrome's on-device model (call from a click/change). */
  static prepareTranslation(language) {
    if (language && language !== 'en') {
      VoiceSettings._getBuiltInTranslator(language).catch(() => {});
    }
  }

  static async _getBuiltInTranslator(language) {
    if (typeof self === 'undefined' || !('Translator' in self)) return null;
    if (VoiceSettings._translators.has(language)) {
      return VoiceSettings._translators.get(language);
    }

    const options = { sourceLanguage: 'en', targetLanguage: language };
    const availability = await self.Translator.availability(options);
    if (availability === 'unavailable') return null;

    const pending = self.Translator.create(options).catch(() => null);
    VoiceSettings._translators.set(language, pending);
    const translator = await pending;
    // Creation can fail before the model is downloaded; allow a retry later.
    if (!translator) VoiceSettings._translators.delete(language);
    return translator;
  }

  static async _translateBuiltIn(text, language) {
    const translator = await VoiceSettings._getBuiltInTranslator(language);
    if (!translator) return null;
    const out = await translator.translate(text);
    return out && out.trim() ? out : null;
  }

  static getVoicesFor(language = 'en') {
    language = baseLanguage(language);
    const seen = new Set();
    const preferred = PREFERRED_VOICES[language] || PREFERRED_VOICES.default;
    const rank = (label) => {
      const i = preferred.indexOf(label.toLowerCase());
      return i === -1 ? preferred.length : i;
    };

    let candidates = VoiceSettings._allVoices()
      .filter((v) => baseLanguage(v.lang) === language)
      .map((v) => {
        const label = cleanVoiceName(v.name);
        return {
          name: v.name,
          label,
          voice: v,
          local: v.localService,
          goofySystem: GOOFY_SYSTEM_VOICES.has(label.toLowerCase()),
        };
      })
      .filter((v) => !HIDDEN_VOICES.has(v.label.toLowerCase()));

    // Use the confirmed-working list when this language has any of them.
    if (ALLOWED_VOICES.length > 0) {
      const allowed = candidates.filter((v) =>
        v.goofySystem || ALLOWED_VOICES.includes(v.label.toLowerCase()));
      if (allowed.length > 0) candidates = allowed;
    }

    const unique = candidates
      .sort((a, b) => Number(a.goofySystem) - Number(b.goofySystem)
        || rank(a.label) - rank(b.label)
        || (b.local - a.local)
        || a.label.localeCompare(b.label))
      .filter((v) => {
        const key = v.label.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

    const natural = unique.filter((v) => !v.goofySystem).slice(0, MAX_VOICES_PER_LANGUAGE);
    const goofy = unique.filter((v) => v.goofySystem).slice(0, MAX_GOOFY_VOICES_PER_LANGUAGE);
    return [...natural, ...goofy];
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
  static apply(utterance, base = {}, language = VoiceSettings.get().language) {
    const s = VoiceSettings.get();
    language = baseLanguage(language);
    utterance.volume = clamp((base.volume ?? 1) * s.volume, 0, 1, 1);
    utterance.rate = clamp((base.rate ?? 1) * s.speed, 0.1, 10, 1);
    utterance.pitch = clamp((base.pitch ?? 1) * s.pitch, 0, 2, 1);

    if (!window.speechSynthesis) return false;

    // The voice the player picked, if it speaks this language.
    if (s.voiceName) {
      const chosen = VoiceSettings._allVoices().find((v) => v.name === s.voiceName);
      if (chosen && baseLanguage(chosen.lang) === language
          && !HIDDEN_VOICES.has(cleanVoiceName(chosen.name).toLowerCase())) {
        utterance.voice = chosen;
        utterance.lang = chosen.lang;
        return true;
      }
    }

    // Automatic voice for a non-English language: first voice on the short list.
    if (language !== 'en') {
      const first = VoiceSettings.getVoicesFor(language).find((voice) => !voice.goofySystem);
      if (first) {
        utterance.voice = first.voice;
        utterance.lang = first.voice.lang;
        return true;
      }
    }

    // English + Automatic: let DialogueSystem use its built-in preference.
    return false;
  }

  static async testVoice() {
    if (!window.speechSynthesis || !VoiceSettings.get().enabled) return;
    VoiceSettings.stopSpeech();

    const { language } = VoiceSettings.get();
    const englishSample = VOICE_TEST_SAMPLES.en;
    const localizedSample = VOICE_TEST_SAMPLES[language]
      || (language === 'en' ? englishSample : await VoiceSettings.translate(englishSample, language));
    const canSpeakLanguage = language === 'en' || VoiceSettings.getVoicesFor(language).length > 0;

    const utterance = new SpeechSynthesisUtterance(canSpeakLanguage && localizedSample ? localizedSample : englishSample);
    VoiceSettings.apply(utterance, { rate: 0.9, pitch: 1, volume: 1 }, canSpeakLanguage && localizedSample ? language : 'en');
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
        <input type="range" id="ocs-vs-speed" min="0.4" max="2" step="0.05">
      </label>
      <label class="ocs-vs-row">
        <span class="ocs-vs-label">Pitch <b id="ocs-vs-pitch-val"></b></span>
        <input type="range" id="ocs-vs-pitch" min="0.1" max="2" step="0.05">
      </label>
      <label class="ocs-vs-row">
        <span class="ocs-vs-label">Language</span>
        <select id="ocs-vs-language"></select>
      </label>
      <label class="ocs-vs-row">
        <span class="ocs-vs-label">Voice</span>
        <select id="ocs-vs-voice"></select>
      </label>
      <div class="ocs-vs-note" id="ocs-vs-note"></div>
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
      $('ocs-vs-language').disabled = !cur.enabled;
      $('ocs-vs-voice').disabled = !cur.enabled;
      $('ocs-vs-note').textContent = cur.language === 'en'
        ? ''
        : 'The browser translates spoken lines on-device when supported; otherwise it uses English. On-screen text stays in English.';
      $('ocs-vs-test').disabled = !cur.enabled;
    };

    const fillLanguages = () => {
      const select = $('ocs-vs-language');
      if (!select) return;
      const languages = VoiceSettings.getLanguages();
      const current = VoiceSettings.get().language;

      select.innerHTML = '';
      const favorites = document.createElement('optgroup');
      favorites.label = 'Favorites';
      const more = document.createElement('optgroup');
      more.label = 'More languages';
      languages.forEach((language) => {
        const suffix = language.available ? '' : ' — voice unavailable';
        const option = new Option(`${language.label}${suffix}`, language.code);
        option.disabled = !language.available;
        (language.favorite ? favorites : more).appendChild(option);
      });
      select.appendChild(favorites);
      if (more.children.length > 0) select.appendChild(more);
      select.value = languages.some((language) => language.code === current && language.available)
        ? current
        : 'en';
    };

    const fillVoices = () => {
      const select = $('ocs-vs-voice');
      if (!select) return;
      const { language, voiceName } = VoiceSettings.get();
      const voices = VoiceSettings.getVoicesFor(language);

      select.innerHTML = '';
      const natural = document.createElement('optgroup');
      natural.label = 'Natural voices';
      natural.appendChild(new Option('Automatic', ''));
      const goofy = document.createElement('optgroup');
      goofy.label = 'Goofy system voices';
      voices.forEach((voice) => {
        const option = new Option(voice.goofySystem ? `🤪 ${voice.label}` : voice.label, voice.name);
        (voice.goofySystem ? goofy : natural).appendChild(option);
      });
      select.appendChild(natural);
      if (goofy.children.length > 0) select.appendChild(goofy);

      // A voice saved on another computer may not exist here; show Automatic.
      select.value = voices.some((v) => v.name === voiceName) ? voiceName : '';
    };

    const fillVoicesAndLanguages = () => {
      fillLanguages();
      fillVoices();
    };

    fillVoicesAndLanguages();
    sync();

    // Chrome loads voices asynchronously, so refill when they arrive.
    if (window.speechSynthesis?.addEventListener) {
      VoiceSettings._voicesHandler = () => {
        fillVoicesAndLanguages();
        sync();
      };
      window.speechSynthesis.addEventListener('voiceschanged', VoiceSettings._voicesHandler);
    }

    $('ocs-vs-enabled').addEventListener('change', (event) => {
      VoiceSettings.set({ enabled: event.target.checked });
      sync();
    });

    sliders.forEach((key) => {
      $(`ocs-vs-${key}`).addEventListener('input', (event) => {
        const saved = VoiceSettings.set({ [key]: Number(event.target.value) });
        $(`ocs-vs-${key}-val`).textContent = FORMAT[key](saved[key]);
        sync();
      });
    });

    $('ocs-vs-language').addEventListener('change', (event) => {
      const language = event.target.value;
      const selected = VoiceSettings.getLanguages().find((candidate) => candidate.code === language);
      if (!selected?.available) return;
      // New language: start from its automatic voice.
      VoiceSettings.set({ language, voiceName: '' });
      // Runs during the user's click, so Chrome may download its translator.
      VoiceSettings.prepareTranslation(language);
      fillVoices();
      sync();
    });

    $('ocs-vs-voice').addEventListener('change', (event) => {
      VoiceSettings.set({ voiceName: event.target.value });
    });

    $('ocs-vs-test').addEventListener('click', () => VoiceSettings.testVoice());

    $('ocs-vs-reset').addEventListener('click', () => {
      VoiceSettings.reset();
      fillVoicesAndLanguages();
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
        width: min(320px, calc(100vw - 32px)); max-height: calc(100vh - 84px);
        overflow-y: auto; box-sizing: border-box;
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
      #${PANEL_ID} option:disabled { color: var(--ocs-game-muted, #a5b4fc); }
      #${PANEL_ID} .ocs-vs-note {
        font-size: 11px; line-height: 1.4; margin: -4px 0 10px;
        color: var(--ocs-game-muted, #a5b4fc);
      }
      #${PANEL_ID} .ocs-vs-note:empty { display: none; }
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

// VOICE_SETTINGS_END


// ════════════════════════════════════════════════════════════════

// DialogueSystem.js - Enhanced with permanent default features
// All NPCs get: voice, typewriter, neon glow, animations by default
//
// Voice output respects the player's global VoiceSettings (corner 🔊 button),
// which persist across every level.


class DialogueSystem {
constructor(options = {}) {
  // Default dialogue arrays
  this.dialogues = options.dialogues || [
    "You've come far, traveler. The skies whisper your name.",
    "The End holds secrets only the brave dare uncover.",
    "Retrieve the elytra and embrace your destiny!"
  ];
  this.id = options.id || "dialogue_" + Math.random().toString(36).substr(2, 9);
  // Make a CSS-safe id for use in element ids and class names
  this.safeId = String(this.id).replace(/\s+/g, '-').replace(/[^A-Za-z0-9\-_]/g, '');
  this.lastShownIndex = -1;
   this.dialogueBox = null;
  this.dialogueText = null;
  this.closeBtn = null;
  this.controlsRow = null;
  this.actionButtonGroup = null;
   // Game control reference for pausing
  this.gameControl = options.gameControl || null;
  // Track if this dialogue system paused the game
  this.didPauseGame = false;
   // Sound effect option
  this.enableSound = options.enableSound !== undefined ? options.enableSound : false;
  this.soundUrl = options.soundUrl || "./sounds/dialogue.mp3";
  this.sound = this.enableSound ? new Audio(this.soundUrl) : null;
   // Typewriter effect options - DEFAULT ENABLED
  this.typewriterSpeed = options.typewriterSpeed !== undefined ? options.typewriterSpeed : 50;
  this.enableTypewriter = options.enableTypewriter !== undefined ? options.enableTypewriter : true;
  this.typewriterTimeoutId = null;
   // Voice synthesis options - DEFAULT ENABLED
  this.enableVoice = options.enableVoice !== undefined ? options.enableVoice : true;
  this.voiceRate = options.voiceRate !== undefined ? options.voiceRate : 0.9;
  this.voicePitch = options.voicePitch !== undefined ? options.voicePitch : 1.0;
  this.voiceVolume = options.voiceVolume !== undefined ? options.voiceVolume : 1.0;
  this.lifecycleSession = null;
   // Create the dialogue box
  this.createDialogueBox();
   // Keep track of whether the dialogue is currently open
  this.isOpen = false;

  // Global voice settings button (singleton: mounted once, survives level changes)
  VoiceSettings.ensureButton();
}

 // Shared speech state so dialogue lines from different DialogueSystem instances
 // are spoken in sequence instead of interrupting each other.
 static getSpeechState() {
   if (!DialogueSystem._speechState) {
     DialogueSystem._speechState = {
       queue: [],
       speaking: false,
       generation: 0, // bumps on every flush; late translations check it
     };
   }
   return DialogueSystem._speechState;
 }
 
 static flushSpeechQueue() {
   const state = DialogueSystem.getSpeechState();
   state.queue = [];
   state.speaking = false;
   state.generation += 1;
 
   if (window.speechSynthesis) {
     window.speechSynthesis.cancel();
   }
 }
 
 static drainSpeechQueue() {
   const state = DialogueSystem.getSpeechState();
   if (state.speaking) return;
   if (!window.speechSynthesis) return;
 
   const nextUtterance = state.queue.shift();
   if (!nextUtterance) return;
 
   state.speaking = true;
 
   nextUtterance.onend = () => {
     state.speaking = false;
     DialogueSystem.drainSpeechQueue();
   };
 
   nextUtterance.onerror = () => {
     state.speaking = false;
     DialogueSystem.drainSpeechQueue();
   };
 
   window.speechSynthesis.speak(nextUtterance);
 }


// Voice synthesis helper
speakText(text) {
  if (!this.enableVoice || !window.speechSynthesis) {
    return; // Voice synthesis not available or disabled for this level
  }

  // Player turned voice off with the corner settings button
  if (!VoiceSettings.get().enabled) {
    return;
  }

  const { language } = VoiceSettings.get();
  if (language === 'en') {
    this.queueSpeech(text, 'en');
    return;
  }

  // Never read translated text with a voice from the wrong language.
  // A setting saved on another computer may not be available on this one.
  if (VoiceSettings.getVoicesFor(language).length === 0) {
    this.queueSpeech(text, 'en');
    return;
  }

  // Translate first. If the dialogue was closed or advanced while waiting,
  // the generation changes and this late line is dropped.
  const generation = DialogueSystem.getSpeechState().generation;
  VoiceSettings.translate(text, language).then((translated) => {
    if (DialogueSystem.getSpeechState().generation !== generation) return;
    if (!this.enableVoice || !VoiceSettings.get().enabled) return;
    // Translation failed: speak the English line with an English voice.
    this.queueSpeech(translated || text, translated ? language : 'en');
  });
}

// Build an utterance for text already in `language` and add it to the queue.
queueSpeech(text, language) {
  const utterance = new SpeechSynthesisUtterance(text);

  // Level values × player's volume/speed/pitch settings.
  // Returns true if a voice for this language was chosen.
  const usedChosenVoice = VoiceSettings.apply(utterance, {
    rate: this.voiceRate,
    pitch: this.voicePitch,
    volume: this.voiceVolume,
  }, language);

  if (!usedChosenVoice && baseLanguage(language) === 'en') {
    // Automatic voice: try to set Australian male voice
    // (English only, skipping hidden voices such as Daniel)
    const voices = window.speechSynthesis.getVoices().filter((voice) =>
      baseLanguage(voice.lang) === 'en' &&
      !HIDDEN_VOICES.has(cleanVoiceName(voice.name).toLowerCase())
      && !GOOFY_SYSTEM_VOICES.has(cleanVoiceName(voice.name).toLowerCase())
    );

    // First, look for Australian English voices
    let australianVoice = voices.find((voice) =>
      voice.lang.includes('en-AU') && voice.name.toLowerCase().includes('male')
    );

    // If no Australian male voice found, look for any Australian voice
    if (!australianVoice) {
      australianVoice = voices.find((voice) => voice.lang.includes('en-AU'));
    }

    // If still no Australian voice, look for any male voice
    if (!australianVoice) {
      australianVoice = voices.find((voice) => voice.name.toLowerCase().includes('male'));
    }

    // If no male voice found, just pick the first voice
    if (!australianVoice && voices.length > 0) {
      australianVoice = voices[0];
    }

    if (australianVoice) {
      utterance.voice = australianVoice;
      utterance.lang = australianVoice.lang;
    }
  }

  const state = DialogueSystem.getSpeechState();
  state.queue.push(utterance);
  DialogueSystem.drainSpeechQueue();
}




createDialogueBox() {
  // Create style element for animations if not already created
  if (!document.getElementById('dialogue-animations-' + this.safeId)) {
    const styleSheet = document.createElement('style');
    styleSheet.id = 'dialogue-animations-' + this.safeId;
    styleSheet.textContent = `
      @keyframes char-pop-${this.safeId} {
        0% {
          opacity: 0;
          transform: scale(0.5) translateY(-10px);
        }
        50% {
          transform: scale(1.1) translateY(0);
        }
        100% {
          opacity: 1;
          transform: scale(1) translateY(0);
        }
      }
    
      .dialogue-char-${this.safeId} {
        display: inline-block;
        animation: char-pop-${this.safeId} 0.3s ease-out;
      }
    `;
    document.head.appendChild(styleSheet);
  }
   // Create the main dialogue container with unique ID
  this.dialogueBox = document.createElement("div");
  this.dialogueBox.id = "custom-dialogue-box-" + this.safeId;
   // Set styles for the dialogue box
  Object.assign(this.dialogueBox.style, {
    position: "fixed",
    bottom: "100px",
    left: "50%",
    transform: "translateX(-50%)",
    padding: "20px",
    maxWidth: "80%",
    fontFamily: "'Press Start 2P', cursive, monospace",
    fontSize: "14px",
    textAlign: "center",
    borderRadius: "12px",
    zIndex: "100050",
    display: "none"
  });




  // Create the avatar container for character portraits
  const avatarContainer = document.createElement("div");
  avatarContainer.id = "dialogue-avatar-" + this.safeId;
  Object.assign(avatarContainer.style, {
    width: "50px",
    height: "50px",
    marginRight: "15px",
    backgroundSize: "contain",
    backgroundRepeat: "no-repeat",
    backgroundPosition: "center",
    display: "none" // Hidden by default
  });




  // Create the header with character name
  const speakerName = document.createElement("div");
  speakerName.id = "dialogue-speaker-" + this.safeId;
  Object.assign(speakerName.style, {
    fontWeight: "bold",
    marginBottom: "10px",
    fontSize: "16px"
  });




  // Create the text content area
  this.dialogueText = document.createElement("div");
  this.dialogueText.id = "dialogue-text-" + this.safeId;
  Object.assign(this.dialogueText.style, {
    marginBottom: "15px",
    lineHeight: "1.5",
    minHeight: "40px"
  });




  // Create close button
  this.closeBtn = document.createElement("button");
  this.closeBtn.id = "dialogue-close-btn-" + this.safeId;
  this.closeBtn.innerText = "Close";
  Object.assign(this.closeBtn.style, {
    marginTop: "0",
    padding: "10px 20px",
    border: "none",
    borderRadius: "5px",
    cursor: "pointer",
    fontFamily: "'Press Start 2P', cursive, monospace",
    fontSize: "12px",
    flexShrink: "0"
  });
   // Add click handler
  this.closeBtn.onclick = () => {
    this.closeDialogue();
  };

  this.controlsRow = document.createElement("div");
  this.controlsRow.id = "dialogue-controls-" + this.safeId;
  Object.assign(this.controlsRow.style, {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "10px",
    marginTop: "10px",
    flexWrap: "wrap"
  });

  this.actionButtonGroup = document.createElement("div");
  Object.assign(this.actionButtonGroup.style, {
    display: "flex",
    justifyContent: "flex-end",
    gap: "10px",
    flexWrap: "wrap",
    marginLeft: "auto"
  });




  // Create content container to hold text and avatar side by side
  const contentContainer = document.createElement("div");
  contentContainer.style.display = "flex";
  contentContainer.style.alignItems = "flex-start";
  contentContainer.style.marginBottom = "10px";
  contentContainer.appendChild(avatarContainer);
   // Create text container for speaker + dialogue
  const textContainer = document.createElement("div");
  textContainer.style.flexGrow = "1";
  textContainer.appendChild(speakerName);
  textContainer.appendChild(this.dialogueText);
  contentContainer.appendChild(textContainer);




  // Assemble the dialogue box
  this.controlsRow.appendChild(this.closeBtn);
  this.controlsRow.appendChild(this.actionButtonGroup);
  this.dialogueBox.appendChild(contentContainer);
  this.dialogueBox.appendChild(this.controlsRow);
   // Add to the document
  document.body.appendChild(this.dialogueBox);
   // Also listen for Escape key to close dialogue
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && this.isOpen) {
      this.closeDialogue();
    }
  });
}

setLifecycleSession(session) {
  this.lifecycleSession = session || null;
}




// Typewriter effect helper with character animations
typewriteText(element, text, speed = this.typewriterSpeed) {
  element.innerHTML = ""; // Clear the element
  let charIndex = 0;
   const typeNextChar = () => {
    if (charIndex < text.length) {
      const char = text.charAt(charIndex);
  
      // If it's a space, just add it directly
      if (char === ' ') {
        element.appendChild(document.createTextNode(' '));
      } else {
        const charSpan = document.createElement('span');
        charSpan.className = `dialogue-char-${this.safeId}`;
        charSpan.textContent = char;
        element.appendChild(charSpan);
      }
  
      charIndex++;
      this.typewriterTimeoutId = setTimeout(typeNextChar, speed);
    }
  };
   typeNextChar();
}




// Show a specific dialogue message
showDialogue(message, speaker = "", avatarSrc = null, spriteData = null) {
  // Clear any existing typewriter timeout
  if (this.typewriterTimeoutId) {
    clearTimeout(this.typewriterTimeoutId);
  }
   // Set the content (with unique element IDs)
  const speakerElement = document.getElementById("dialogue-speaker-" + this.safeId);
  if (speakerElement) {
    speakerElement.textContent = speaker;
    speakerElement.style.display = speaker ? "block" : "none";
  }
   // Set avatar if provided
  const avatarElement = document.getElementById("dialogue-avatar-" + this.safeId);
  if (avatarElement) {
    if (avatarSrc) {
      avatarElement.style.backgroundImage = `url('${avatarSrc}')`;
      avatarElement.style.display = "block";
      
      // If sprite data provided with orientation (sprite sheet), show only down row, column 0
      if (spriteData && spriteData.orientation && spriteData.pixels && spriteData.down) {
        const { rows, columns } = spriteData.orientation;
        const { width, height } = spriteData.pixels;
        const { row } = spriteData.down;
        
        // Calculate frame dimensions
        const frameWidth = width / columns;
        const frameHeight = height / rows;
        
        // Scale avatar to fit nicely (max 80px on longest side)
        const maxAvatarSize = 80;
        const aspectRatio = frameWidth / frameHeight;
        let displayWidth, displayHeight;
        
        if (frameWidth > frameHeight) {
          displayWidth = Math.min(maxAvatarSize, frameWidth);
          displayHeight = displayWidth / aspectRatio;
        } else {
          displayHeight = Math.min(maxAvatarSize, frameHeight);
          displayWidth = displayHeight * aspectRatio;
        }
        
        // Calculate scale factor for background image
        const scale = displayWidth / frameWidth;
        const scaledSpriteWidth = width * scale;
        const scaledSpriteHeight = height * scale;
        
        // Calculate background position to show down row, column 0
        const bgPosX = 0; // Column 0
        const bgPosY = -(row * frameHeight * scale); // Down row
        
        // Set styles to crop to single frame
        avatarElement.style.width = `${displayWidth}px`;
        avatarElement.style.height = `${displayHeight}px`;
        avatarElement.style.backgroundSize = `${scaledSpriteWidth}px ${scaledSpriteHeight}px`;
        avatarElement.style.backgroundPosition = `${bgPosX}px ${bgPosY}px`;
      } else {
        // No orientation data, show entire image
        avatarElement.style.width = "50px";
        avatarElement.style.height = "50px";
        avatarElement.style.backgroundSize = "contain";
        avatarElement.style.backgroundPosition = "center";
      }
    } else {
      avatarElement.style.display = "none";
    }
  }
   // Apply typewriter effect or set text directly
  if (this.enableTypewriter) {
    this.typewriteText(this.dialogueText, message, this.typewriterSpeed);
  } else {
    this.dialogueText.textContent = message;
  }
   // Show the dialogue box
  this.dialogueBox.style.display = "block";
   // Pause the game if gameControl is available and not already paused
  if (this.gameControl && typeof this.gameControl.pause === 'function') {
    // Only pause if the game isn't already paused
    if (!this.gameControl.isPaused) {
      this.gameControl.pause();
      this.didPauseGame = true; // Mark that we paused it
    } else {
      this.didPauseGame = false; // We didn't pause it
    }
  }
   // Play sound effect if enabled
  if (this.sound) {
    this.sound.currentTime = 0;
    this.sound.play().catch(e => console.log("Sound play error:", e));
  }
   // Speak the dialogue text
  this.speakText(message);
   this.isOpen = true;
   // Return the dialogue box element for custom button addition
  return this.dialogueBox;
}




// Show the next dialogue from the dialogues array (cycles through sequentially)
showRandomDialogue(speaker = "", avatarSrc = null, spriteData = null) {
  if (this.dialogues.length === 0) return;
   // Increment to next dialogue, wrapping around to 0 when reaching the end
  this.lastShownIndex = (this.lastShownIndex + 1) % this.dialogues.length;
   // Show the dialogue
  const dialogue = this.dialogues[this.lastShownIndex];
  return this.showDialogue(dialogue, speaker, avatarSrc, spriteData);
}




// Close the dialogue box
closeDialogue() {
  if (!this.isOpen) return;

  if (this.lifecycleSession) {
    this.lifecycleSession.cancel();
    this.lifecycleSession = null;
  }

   // Clear typewriter timeout
  if (this.typewriterTimeoutId) {
    clearTimeout(this.typewriterTimeoutId);
    this.typewriterTimeoutId = null;
  }

  DialogueSystem.flushSpeechQueue();

   // Hide the dialogue box
  this.dialogueBox.style.display = "none";
  this.isOpen = false;
   // Resume the game only if we were the ones who paused it
  if (this.gameControl && typeof this.gameControl.resume === 'function' && this.didPauseGame) {
    this.gameControl.resume();
    this.didPauseGame = false; // Reset the flag
  }

  if (this.actionButtonGroup) {
    this.actionButtonGroup.innerHTML = '';
  }

  if (this.closeBtn) {
    this.closeBtn.innerText = 'Close';
    this.closeBtn.onclick = () => {
      this.closeDialogue();
    };
    this.closeBtn.style.marginRight = '0';
    this.closeBtn.style.marginLeft = '0';
    this.closeBtn.style.float = 'none';
  }
}




/**
 * Remove all DOM nodes injected by this DialogueSystem instance.
 * Call this when the owning NPC or level is destroyed so elements
 * do not persist in document.body across level transitions.
 * (The global voice settings button is intentionally NOT removed.)
 */
destroy() {
    // Close first so any pending typewriter/speech is cancelled cleanly.
    if (this.isOpen) {
      try { this.closeDialogue(); } catch (_) { /* ignore */ }
    }

    // Remove the dialogue box from document.body forcibly.
    try {
      if (this.dialogueBox) {
        // Try parentNode removal first
        if (this.dialogueBox.parentNode) {
          this.dialogueBox.parentNode.removeChild(this.dialogueBox);
        }
        // If element is still in document, remove it directly
        if (document.body.contains(this.dialogueBox)) {
          document.body.removeChild(this.dialogueBox);
        }
      }
    } catch (e) {
      console.warn('DialogueSystem: error removing dialogueBox', e);
    }

    this.dialogueBox = null;
    this.dialogueText = null;
    this.closeBtn = null;
    this.controlsRow = null;
    this.actionButtonGroup = null;

    // Remove the injected <style> animation block.
    try {
      const styleEl = document.getElementById('dialogue-animations-' + this.safeId);
      if (styleEl) {
        if (styleEl.parentNode) {
          styleEl.parentNode.removeChild(styleEl);
        } else if (document.head.contains(styleEl)) {
          document.head.removeChild(styleEl);
        }
      }
    } catch (e) {
      console.warn('DialogueSystem: error removing style element', e);
    }
  }

  // Check if dialogue is currently open
  isDialogueOpen() {
    return this.isOpen;
  }

  // Add buttons to the dialogue
  addButtons(buttons) {
    if (!this.isOpen || !buttons || !Array.isArray(buttons) || buttons.length === 0 || !this.actionButtonGroup) return;

    this.actionButtonGroup.innerHTML = '';
  
    // Add each button
    buttons.forEach(button => {
      if (!button || !button.text) return;
      
      const btn = document.createElement('button');
      btn.textContent = button.text;
      btn.className = button.primary ? 'primary-button' : 'secondary-button';
      btn.style.padding = '8px 15px';
      btn.style.border = 'none';
      btn.style.borderRadius = '5px';
      btn.style.cursor = 'pointer';
      
      // Add click handler
      btn.onclick = () => {
        if (button.action && typeof button.action === 'function') {
          button.action();
        }
      };
      
      this.actionButtonGroup.appendChild(btn);
    });
  }
}

// Turning voice off in the settings panel also clears any queued lines.
VoiceSettings.setStopHandler(() => DialogueSystem.flushSpeechQueue());

export { VoiceSettings };
export default DialogueSystem;
