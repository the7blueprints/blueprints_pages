import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const voiceSource = await readFile(
  new URL('../assets/js/GameEnginev1.1/essentials/VoiceSettings.js', import.meta.url),
  'utf8',
);
const dialogueSource = await readFile(
  new URL('../assets/js/GameEnginev1.1/essentials/DialogueSystem.js', import.meta.url),
  'utf8',
);

let installedVoices = [];
let spoken = [];
const saved = new Map();

globalThis.localStorage = {
  getItem: (key) => saved.get(key) || null,
  setItem: (key, value) => saved.set(key, value),
  clear: () => saved.clear(),
};
globalThis.document = { getElementById: () => null };
globalThis.window = {
  speechSynthesis: {
    getVoices: () => installedVoices,
    cancel: () => {},
    speak: (utterance) => spoken.push(utterance),
  },
};
globalThis.SpeechSynthesisUtterance = class {
  constructor(text) { this.text = text; }
};

const voiceModule = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(voiceSource)}`);
const dialogueModule = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(dialogueSource)}`);
const VoiceSettings = voiceModule.default;
const EmbeddedVoiceSettings = dialogueModule.VoiceSettings;
const DialogueSystem = dialogueModule.default;

const naturalVoices = [
  { name: 'Samantha', lang: 'en-US', localService: true },
  { name: 'Ting-Ting', lang: 'cmn-CN', localService: true },
  { name: 'Sin-Ji', lang: 'yue-HK', localService: true },
  { name: 'Mónica', lang: 'es-MX', localService: true },
  { name: 'Thomas', lang: 'fr-FR', localService: true },
  { name: 'Zarvox', lang: 'en-US', localService: true },
];

function reset(voices = naturalVoices) {
  installedVoices = voices;
  spoken = [];
  saved.clear();
  VoiceSettings._settings = null;
  EmbeddedVoiceSettings._settings = null;
}

test('standalone and embedded voice settings stay synchronized', () => {
  const start = dialogueSource.indexOf('// VOICE_SETTINGS_START');
  const marker = '// VOICE_SETTINGS_END';
  const end = dialogueSource.indexOf(marker, start) + marker.length;
  const embedded = dialogueSource.slice(start, end);
  const standalone = voiceSource.slice(0, voiceSource.indexOf(marker) + marker.length);
  assert.equal(standalone, embedded);
});

test('English, Chinese, and Spanish are favorites in that order', () => {
  reset();
  const languages = VoiceSettings.getLanguages();
  assert.deepEqual(languages.slice(0, 3).map(({ code }) => code), ['en', 'zh', 'es']);
  assert.ok(languages.slice(0, 3).every(({ favorite, available }) => favorite && available));
  assert.equal(languages[3].code, 'fr');
});

test('an unavailable favorite remains visible but is marked unavailable', () => {
  reset(naturalVoices.filter((voice) => !['cmn-CN', 'yue-HK'].includes(voice.lang)));
  const chinese = VoiceSettings.getLanguages().find(({ code }) => code === 'zh');
  assert.equal(chinese.favorite, true);
  assert.equal(chinese.available, false);
});

test('Mandarin and Cantonese voices are grouped as Chinese without leaking English voices', () => {
  reset();
  assert.deepEqual(VoiceSettings.getVoicesFor('zh').map(({ name }) => name), ['Ting-Ting', 'Sin-Ji']);
  assert.deepEqual(VoiceSettings.getVoicesFor('es').map(({ name }) => name), ['Mónica']);
  assert.ok(!VoiceSettings.getVoicesFor('en').some(({ name }) => name === 'Zarvox'));
});

test('a saved voice from the wrong language is replaced by a matching automatic voice', () => {
  reset();
  VoiceSettings.set({ language: 'es', voiceName: 'Samantha' });
  const utterance = {};
  assert.equal(VoiceSettings.apply(utterance, {}, 'es'), true);
  assert.equal(utterance.voice.name, 'Mónica');
  assert.equal(utterance.lang, 'es-MX');
});

test('goofy presets update pitch and speed while keeping the selected language', () => {
  reset();
  VoiceSettings.set({ language: 'zh' });
  const settings = VoiceSettings.applyPreset('chipmunk');
  assert.equal(settings.language, 'zh');
  assert.equal(settings.preset, 'chipmunk');
  assert.equal(settings.speed, 1.25);
  assert.equal(settings.pitch, 1.45);
});

test('favorite-language voice tests use a matching sample and voice', async () => {
  reset();
  VoiceSettings.set({ language: 'zh' });
  await VoiceSettings.testVoice();
  assert.equal(spoken.length, 1);
  assert.equal(spoken[0].text, '这就是对话的声音。');
  assert.equal(spoken[0].voice.name, 'Ting-Ting');
});

test('dialogue falls back to English before translation when no matching voice exists', () => {
  reset(naturalVoices.filter((voice) => voice.lang !== 'es-MX'));
  EmbeddedVoiceSettings.set({ language: 'es' });
  const queued = [];
  DialogueSystem.prototype.speakText.call({
    enableVoice: true,
    queueSpeech: (text, language) => queued.push({ text, language }),
  }, 'Welcome to the trail.');
  assert.deepEqual(queued, [{ text: 'Welcome to the trail.', language: 'en' }]);
});
