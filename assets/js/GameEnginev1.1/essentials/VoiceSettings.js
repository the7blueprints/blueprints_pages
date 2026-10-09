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
  preset: 'natural',
  voiceName: '',   // '' = automatic voice for the chosen language
});

// Max voices listed per language, so the picker stays short.
const MAX_VOICES_PER_LANGUAGE = 8;

// Voices confirmed to sound distinct in your browser (lowercase, cleaned names).
// If any are listed, ONLY these show in the Voice dropdown.
// Leave empty ([]) to show the automatic short list.
const ALLOWED_VOICES = [];

// Voices never listed or auto-picked: macOS novelty/effect voices, plus
// voices removed on request. Add more names here (lowercase) to hide them.
const NOVELTY_VOICES = new Set([
  'daniel',
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

// Pitch/rate presets work with every language, unlike OS-specific novelty voices.
// `group` keeps the picker readable as the exaggerated effects grow.
const VOICE_PRESETS = Object.freeze([
  { id: 'natural', label: 'Natural', speed: 1, pitch: 1, group: 'regular' },
  { id: 'chipmunk', label: '🐿️ Chipmunk', speed: 1.25, pitch: 1.45, group: 'goofy' },
  { id: 'sleepy-giant', label: '🥱 Sleepy Giant', speed: 0.72, pitch: 0.62, group: 'goofy' },
  { id: 'space-robot', label: '🤖 Space Robot', speed: 0.9, pitch: 0.78, group: 'goofy' },
  { id: 'dramatic-villain', label: '🦹 Dramatic Villain', speed: 0.78, pitch: 0.68, group: 'goofy' },
  { id: 'hyper-gremlin', label: '👹 Hyper Gremlin', speed: 1.55, pitch: 1.35, group: 'goofy' },
  { id: 'bass-cannon', label: '🎸 Bass Cannon', speed: 0.5, pitch: 0.1, group: 'extreme' },
  { id: 'cursed-tuba', label: '🎺 Cursed Tuba', speed: 0.68, pitch: 0.22, group: 'extreme' },
  { id: 'demon-squeal', label: '👹 Demon Squeal', speed: 1.15, pitch: 2, group: 'extreme' },
  { id: 'helium-goblin', label: '🎈 Helium Goblin', speed: 1.85, pitch: 2, group: 'extreme' },
  { id: 'cave-monster', label: '🧟 Cave Monster', speed: 0.42, pitch: 0.15, group: 'extreme' },
  { id: 'broken-cassette', label: '📼 Broken Cassette', speed: 0.52, pitch: 1.72, group: 'extreme' },
  { id: 'microscopic-mouse', label: '🐭 Microscopic Mouse', speed: 2, pitch: 2, group: 'extreme' },
  { id: 'unnecessarily-dramatic', label: '🎭 Unnecessarily Dramatic', speed: 0.4, pitch: 0.55, group: 'extreme' },
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
      preset: (VOICE_PRESETS.some((preset) => preset.id === s.preset) || s.preset === 'custom')
        ? s.preset
        : DEFAULTS.preset,
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
        .filter((v) => !NOVELTY_VOICES.has(cleanVoiceName(v.name).toLowerCase()))
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
      .map((v) => ({ name: v.name, label: cleanVoiceName(v.name), voice: v, local: v.localService }))
      .filter((v) => !NOVELTY_VOICES.has(v.label.toLowerCase()));

    // Use the confirmed-working list when this language has any of them.
    if (ALLOWED_VOICES.length > 0) {
      const allowed = candidates.filter((v) => ALLOWED_VOICES.includes(v.label.toLowerCase()));
      if (allowed.length > 0) candidates = allowed;
    }

    return candidates
      .sort((a, b) => rank(a.label) - rank(b.label) || (b.local - a.local) || a.label.localeCompare(b.label))
      .filter((v) => {
        const key = v.label.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, MAX_VOICES_PER_LANGUAGE);
  }

  static applyPreset(presetId) {
    const preset = VOICE_PRESETS.find((candidate) => candidate.id === presetId) || VOICE_PRESETS[0];
    return VoiceSettings.set({ preset: preset.id, speed: preset.speed, pitch: preset.pitch });
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
          && !NOVELTY_VOICES.has(cleanVoiceName(chosen.name).toLowerCase())) {
        utterance.voice = chosen;
        utterance.lang = chosen.lang;
        return true;
      }
    }

    // Automatic voice for a non-English language: first voice on the short list.
    if (language !== 'en') {
      const first = VoiceSettings.getVoicesFor(language)[0];
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
        <span class="ocs-vs-label">Voice effect</span>
        <select id="ocs-vs-preset"></select>
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
      $('ocs-vs-preset').value = VOICE_PRESETS.some((preset) => preset.id === cur.preset)
        ? cur.preset
        : 'custom';
      $('ocs-vs-preset').disabled = !cur.enabled;
      $('ocs-vs-language').disabled = !cur.enabled;
      $('ocs-vs-voice').disabled = !cur.enabled;
      const languageNote = cur.language === 'en'
        ? ''
        : 'The browser translates spoken lines on-device when supported; otherwise it uses English. On-screen text stays in English.';
      const presetNote = cur.preset !== 'natural' && cur.preset !== 'custom'
        ? 'Voice effects exaggerate speed and pitch while keeping the correct language voice.'
        : '';
      $('ocs-vs-note').textContent = [languageNote, presetNote].filter(Boolean).join(' ');
      $('ocs-vs-test').disabled = !cur.enabled;
    };

    const fillPresets = () => {
      const select = $('ocs-vs-preset');
      select.innerHTML = '';
      const regular = document.createElement('optgroup');
      regular.label = 'Regular';
      const goofy = document.createElement('optgroup');
      goofy.label = 'Goofy voices';
      const extreme = document.createElement('optgroup');
      extreme.label = 'Extreme effects';
      VOICE_PRESETS.forEach((preset) => {
        const option = new Option(preset.label, preset.id);
        ({ regular, goofy, extreme }[preset.group] || goofy).appendChild(option);
      });
      regular.appendChild(new Option('Custom sliders', 'custom'));
      select.append(regular, goofy, extreme);
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
      select.appendChild(new Option('Automatic', ''));
      voices.forEach((v) => select.appendChild(new Option(v.label, v.name)));

      // A voice saved on another computer may not exist here; show Automatic.
      select.value = voices.some((v) => v.name === voiceName) ? voiceName : '';
    };

    const fillVoicesAndLanguages = () => {
      fillLanguages();
      fillVoices();
    };

    fillPresets();
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
        const saved = VoiceSettings.set({ [key]: Number(event.target.value), preset: 'custom' });
        $(`ocs-vs-${key}-val`).textContent = FORMAT[key](saved[key]);
        sync();
      });
    });

    $('ocs-vs-preset').addEventListener('change', (event) => {
      if (event.target.value === 'custom') {
        VoiceSettings.set({ preset: 'custom' });
      } else {
        VoiceSettings.applyPreset(event.target.value);
      }
      sync();
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

export default VoiceSettings;
