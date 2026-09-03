// Level 2: "Toolchain Trail" — Tools Setup World (SPACE THEME)
//
// Implements game-progression-plan.md's 7-zone onboarding map (Terminal →
// Compiler → Editor → Git → GitHub → Build → Integration Summit boss level)
// as a hub-and-spoke space-station map, reusing the same engine shell as
// Level 1 (Identity Forge / Wayfinding World / Mission Tooling):
//   - Same top engine bar / Game Status banner (untouched, lives outside this file)
//   - Same PLAYER PROFILE sidebar pattern (StatusPanel), extended with a
//     "Toolchain Trail" section per the design doc
//   - Same FriendlyNpc "gatekeeper" + DialogueSystem pattern for stations
//   - Same ProfileManager / LocalProfile persistence pattern (see the
//     'toolchain-trail' bucket added to localProfile.js / persistentProfile.js)
//
// WHAT'S NEW (see StationVerificationTrial.js for full notes):
//   - A mock "terminal verification" modal stands in for the real
//     terminal-watching agent described in the progression plan, so the
//     full station flow (briefing → verify → fun fact → unlock next) is
//     demoable today without a backend agent.
//   - Station visual states (locked / active / stuck / complete) are drawn
//     using CSS filters on each gatekeeper's existing canvas element —
//     no new rendering system required.
//
// ASSET TODO (see design doc section 6 "Assets Needed" — not blocking):
//   - Swap `npc/gatekeeper2.png` for real robot/alien station-guardian art
//   - Swap the background image below for a real space-station backdrop
//   - Add real per-zone NPC portraits for the fun-fact popup
//
// File location: @assets/js/projects/cs-pathway/GameLevelCsPath2Toolchain.js

import GamEnvBackground from '@assets/js/GameEnginev1.1/essentials/GameEnvBackground.js';
import CsPathwayPlayer from './CsPathwayPlayer.js';
import StatusPanel from '@assets/js/GameEnginev1.1/essentials/StatusPanel.js';
import FriendlyNpc from '@assets/js/GameEnginev1.1/essentials/FriendlyNpc.js';
import DialogueSystem from '@assets/js/GameEnginev1.1/essentials/DialogueSystem.js';
import ProfileManager from '@assets/js/projects/cs-pathway/model/ProfileManager.js';
import LocalProfile from '@assets/js/projects/cs-pathway/model/localProfile.js';
import StationVerificationTrial from './StationVerificationTrial.js';
import TrailPath from './TrailPath.js';
import {
  STATION_STATUS,
  formatStationGlyph,
  STATION_VISUAL_FILTERS,
  STUCK_THRESHOLD_MS,
} from '@assets/js/projects/cs-pathway/model/stationStatus.js';

const PROFILE_PANEL_ID = 'toolchain-trail-profile-panel';

/**
 * Per-station hue-rotate applied on top of STATION_VISUAL_FILTERS so every
 * station's shared placeholder sprite (gatekeeper2.png) reads as a distinct
 * "character" while awaiting real per-station art (see TODO(art) below).
 * Degrees chosen to land near each station's accentColor family.
 */
const STATION_HUE_ROTATE = Object.freeze({
  'comm-relay': 'hue-rotate(0deg)',
  'fusion-reactor': 'hue-rotate(60deg)',
  'nav-console': 'hue-rotate(160deg)',
  'cryo-archive': 'hue-rotate(220deg)',
  'deep-space-gate': 'hue-rotate(280deg)',
  'assembly-bay': 'hue-rotate(320deg)',
  'singularity-core': 'hue-rotate(40deg)',
});

/**
 * GameLevelCsPath2Toolchain - "Toolchain Trail" (Level 2, Tools Setup World)
 *
 * Hub-and-spoke space station map. The player walks between six station
 * modules arranged around a central hub ("The Setup Grounds"), each gating
 * a real dev-environment milestone, plus a 7th boss station ("The
 * Singularity Core") that oonly unfogs once the first six are complete.
 *
 * @class
 */
class GameLevelCsPath4Toolchain {
  static levelId = 'toolchain-trail';
  static displayName = 'Toolchain Trail';

  constructor(gameEnv) {
    this.gameEnv = gameEnv;
    this.levelDisplayName = GameLevelCsPath4Toolchain.displayName;
    this.logPrefix = GameLevelCsPath4Toolchain.displayName;

    const width = gameEnv.innerWidth;
    const height = gameEnv.innerHeight;
    const path = gameEnv.path;
    this._path = path;

    // FriendlyNpc / proximity helpers expect these level references.
    this.gameEnv.currentLevel = this;
    this.gameEnv.gameLevel = this;

    /**
     * Section: shared UI theme (space palette, same shell/typography as Level 1).
     */
    this.uiTheme = {
      background: 'var(--ocs-game-panel-bg, rgba(6,8,22,0.94))',
      borderColor: 'var(--ocs-game-accent, #38bdf8)',
      textColor: 'var(--ocs-game-text, #dbeafe)',
      secondaryTextColor: 'var(--ocs-game-muted, #a5b4fc)',
      accentColor: 'var(--ocs-game-accent, #38bdf8)',
      inputBackground: 'var(--ocs-game-surface-alt, #0b1026)',
      buttonBackground: 'var(--ocs-game-accent, #38bdf8)',
      buttonTextColor: 'var(--ocs-game-surface-contrast, #04060f)',
      secondaryButtonBackground: 'var(--ocs-game-surface-alt, #0b1026)',
      secondaryButtonTextColor: 'var(--ocs-game-text, #dbeafe)',
      overlayBackground: 'var(--ocs-game-overlay, rgba(4,6,15,0.75))',
      boxShadow: '0 0 20px rgba(56,189,248,0.18)',
    };
    const uiTheme = this.uiTheme;

    /**
     * Section: station definitions (the 7 zones from game-progression-plan.md,
     * reskinned as space-station modules).
     */
    this.STATIONS = [
      {
        id: 'comm-relay',
        name: 'Comm Relay Station',
        icon: '🖥️',
        accentColor: '#38bdf8',
        skill: 'Navigating the shell',
        zone: 1,
        position: { x: width * 0.16, y: height * 0.28 },
        narrativeHook: "The relay won't sync until you prove you can pilot the terminal.",
        instructions: [
          'Open your terminal application.',
          'Run pwd to see where you currently are.',
          'Run ls (or dir on Windows) to list files.',
          'Create a new folder with mkdir toolchain-trail.',
        ],
        expectedCommandPattern: /^(mkdir\s+\S+|ls|dir|pwd)/i,
        exampleCommand: 'mkdir toolchain-trail',
        funFact: "Fun fact: 'ls' has been a Unix command since 1971 — older than most operating systems still in use today.",
      },
      {
        id: 'fusion-reactor',
        name: 'Fusion Reactor Core',
        icon: '☕',
        accentColor: '#f97316',
        skill: 'Java installed & working',
        zone: 2,
        position: { x: width * 0.45, y: height * 0.18 },
        narrativeHook: 'The reactor only ignites for a verified compiler.',
        instructions: [
          'Run java -version to confirm the JDK is installed.',
          'Write a one-line Hello.java file.',
          'Compile it with javac Hello.java.',
          'Run it with java Hello.',
        ],
        expectedCommandPattern: /^(javac?\s+.*|java\s+-version)/i,
        exampleCommand: 'java -version',
        funFact: "Fun fact: Java was originally called 'Oak', named after a tree outside its creator's office.",
      },
      {
        id: 'nav-console',
        name: 'Nav Console Bay',
        icon: '🧭',
        accentColor: '#8b5cf6',
        skill: 'Code editor set up',
        zone: 3,
        position: { x: width * 0.76, y: height * 0.24 },
        narrativeHook: 'Plot your course — install a real editor before the console will respond.',
        instructions: [
          'Install VS Code (or your editor of choice).',
          "Open this project's folder in it.",
          'Install one recommended extension.',
        ],
        expectedCommandPattern: /^code\s+\.?/i,
        exampleCommand: 'code .',
        funFact: 'Fun fact: VS Code is built on Electron — the same framework behind Slack and Discord.',
      },
      {
        id: 'cryo-archive',
        name: 'Cryo Archive Vault',
        icon: '🌿',
        accentColor: '#22c55e',
        skill: 'Git installed & identity configured',
        zone: 4,
        position: { x: width * 0.16, y: height * 0.72 },
        narrativeHook: "The archive won't preserve your work until it knows who you are.",
        instructions: [
          'Run git --version to confirm git is installed.',
          'Set your name: git config --global user.name "Your Name".',
          'Set your email: git config --global user.email you@example.com.',
          'Run git init in a folder.',
        ],
        expectedCommandPattern: /^git\s+(config|init|--version)/i,
        exampleCommand: 'git init',
        funFact: 'Fun fact: Linus Torvalds wrote Git in 2005 — in about a weekend — to manage Linux kernel development.',
      },
      {
        id: 'deep-space-gate',
        name: 'Deep Space Relay Gate',
        icon: '🐙',
        accentColor: '#ec4899',
        skill: 'Remote repos & auth',
        zone: 5,
        position: { x: width * 0.45, y: height * 0.82 },
        narrativeHook: 'No signal reaches the fleet without an authenticated uplink.',
        instructions: [
          'Confirm you have a GitHub account.',
          'Set up SSH key or token auth.',
          'Clone the class starter repo with git clone.',
        ],
        expectedCommandPattern: /^git\s+clone\s+\S+/i,
        exampleCommand: 'git clone <starter-repo-url>',
        funFact: 'Fun fact: GitHub hosts over 100 million repositories — more code than any library in human history.',
      },
      {
        id: 'assembly-bay',
        name: 'Assembly Bay',
        icon: '🔧',
        accentColor: '#eab308',
        skill: 'Build tool sanity check',
        zone: 6,
        position: { x: width * 0.76, y: height * 0.72 },
        narrativeHook: 'Nothing launches from this bay until the build actually succeeds.',
        instructions: [
          "Run the class's build command (e.g. mvn package or ./gradlew build).",
          'Confirm it completes successfully.',
        ],
        expectedCommandPattern: /^(mvn|gradle|\.\/gradlew|make)\s+\S+/i,
        exampleCommand: 'mvn package',
        funFact: "Fun fact: Maven's name comes from a word for 'accumulator of knowledge' — fitting for a build tool.",
      },
      {
        id: 'singularity-core',
        name: 'The Singularity Core',
        icon: '⭐',
        accentColor: '#fbbf24',
        skill: 'Everything together (boss)',
        zone: 7,
        isBoss: true,
        position: { x: width * 0.93, y: height * 0.48 },
        narrativeHook: 'Only a fully assembled toolchain can survive the Core.',
        instructions: [
          'Clone the starter project.',
          'Build it successfully.',
          'Run the provided test suite.',
          'Make one commit.',
          'Push it.',
        ],
        expectedCommandPattern: /^git\s+push/i,
        exampleCommand: 'git push',
        funFact: 'Every piece of your dev environment, wired together and proven end-to-end. Welcome to the fleet.',
      },
    ];
    this._stationById = Object.fromEntries(this.STATIONS.map((s) => [s.id, s]));
    this._nonBossOrder = this.STATIONS.filter((s) => !s.isBoss).map((s) => s.id);

    // In-memory only: when each active station was first shown, used for the
    // client-side "stuck" fallback heuristic (see stationStatus.js).
    this._stationActivatedAt = {};
    this._stuckCheckInterval = null;

    /**
     * Section: loading overlay (self-contained — this level does not depend
     * on GameLevelCsPathIdentity's shared loading-screen helpers).
     */
    this._loadingOverlay = null;
    this._showLoading('Charting the Toolchain Trail...');

    /**
     * Section: profile persistence (same ProfileManager pattern as Level 1).
     */
    this.profileManager = new ProfileManager();
    this.profileData = {};
    this.completedStations = new Set();
    this.profileManagerReady = this.profileManager.initialize().then(async (restored) => {
      if (restored?.profileData) {
        this.profileData = { ...restored.profileData };
        const savedStations = restored.profileData.toolchainMeta?.stations || {};
        Object.entries(savedStations).forEach(([id, status]) => {
          if (status === STATION_STATUS.COMPLETE) this.completedStations.add(id);
        });
      }
    }).catch((err) => {
      console.warn(`${this.logPrefix}: ProfileManager initialization failed`, err);
    }).finally(() => {
      this._recomputeStationStates(false);
      this._hideLoading();
    });

    /**
     * Section: background (space station backdrop).
     */
    const bg_data = {
      name: GameLevelCsPath4Toolchain.displayName,
      greeting: 'Docking sequence complete. Welcome to the Toolchain Trail.',
      src: path + '/images/projects/cs-pathway/bg/toolchain-trail-space.png',
    };

    /**
     * Section: player (avatar carries over unchanged from Level 1).
     */
    const PLAYER_SCALE_FACTOR = 5;
    const player_data = {
      id: 'Minimalist_Toolchain',
      greeting: 'Systems nominal. Ready to explore the Toolchain Trail!',
      src: path + '/images/projects/cs-pathway/player/minimalist.png',
      SCALE_FACTOR: PLAYER_SCALE_FACTOR,
      STEP_FACTOR: 1000,
      ANIMATION_RATE: 50,
      INIT_POSITION: { x: width * 0.5, y: height * 0.52 },
      pixels: { height: 1024, width: 1024 },
      orientation: { rows: 2, columns: 2 },
      down: { row: 0, start: 0, columns: 1 },
      downRight: { row: 0, start: 0, columns: 1, rotate: Math.PI / 16 },
      downLeft: { row: 0, start: 0, columns: 1, rotate: -Math.PI / 16 },
      left: { row: 1, start: 0, columns: 1, mirror: true },
      right: { row: 1, start: 0, columns: 1 },
      up: { row: 0, start: 1, columns: 1 },
      upLeft: { row: 1, start: 0, columns: 1, mirror: true, rotate: Math.PI / 16 },
      upRight: { row: 1, start: 0, columns: 1, rotate: -Math.PI / 16 },
      hitbox: { widthPercentage: 0.4, heightPercentage: 0.4 },
      keypress: { up: 87, left: 65, down: 83, right: 68 },
    };

    /**
     * Section: station gatekeeper NPC factory (mirrors Forge's createGatekeeperData).
     */
    const level = this;
    const gatekeeperBaseData = {
      // TODO(art): swap for a robot/alien station-guardian sprite once available.
      src: path + '/images/projects/cs-pathway/npc/gatekeeper2.png',
      SCALE_FACTOR: PLAYER_SCALE_FACTOR,
      ANIMATION_RATE: 50,
      pixels: { width: 1024, height: 1024 },
      orientation: { rows: 2, columns: 2 },
      down: { row: 0, start: 0, columns: 1, wiggle: 0.005 },
      up: { row: 0, start: 1, columns: 1 },
      left: { row: 1, start: 0, columns: 1 },
      right: { row: 1, start: 1, columns: 1 },
      hitbox: { widthPercentage: 0.4, heightPercentage: 0.4 },
    };

    const createStationGatekeeperData = (station) => ({
      ...gatekeeperBaseData,
      id: station.id,
      greeting: station.name,
      INIT_POSITION: { ...station.position },
      interactDistance: 120,
      alertDistance: 0.22,
      zoneMessage: `${station.name}: Press E to interact.`,
      reaction: function () {
        void level.runStation(station.id, true);
        if (level.showToast) level.showToast('Press E to interact');
      },
      interact: async function () {
        await level.runStation(station.id, false);
      },
    });

    this.classes = [
      { class: GamEnvBackground, data: bg_data },
      {
        class: TrailPath,
        data: {
          stations: this.STATIONS,
          getStatus: (stationId) => level.getStationStatus(stationId),
        },
      },
      { class: CsPathwayPlayer, data: player_data },
      ...this.STATIONS.map((station) => ({
        class: FriendlyNpc,
        data: createStationGatekeeperData(station),
      })),
    ];

    /**
     * Section: dialogue system (same Promise-queue helper pattern as Level 1).
     */
    this.levelDialogueSystem = new DialogueSystem({
      id: 'toolchain-trail-dialogue',
      dialogues: [],
      gameControl: gameEnv.gameControl,
      enableVoice: true,
      enableTypewriter: true,
      typewriterSpeed: 24,
      voiceRate: 0.9,
    });

    this.showDialogue = function (speakerName, lines, options = {}) {
      const queue = Array.isArray(lines) ? lines.filter(Boolean) : [String(lines || '')];
      if (queue.length === 0) return Promise.resolve();

      return new Promise((resolve) => {
        let index = 0;
        let finished = false;

        const finish = () => {
          if (finished) return;
          finished = true;
          this.levelDialogueSystem.closeDialogue();
          resolve();
        };

        const showStep = () => {
          if (finished) return;
          const message = queue[index];
          const isLast = index === queue.length - 1;

          this.levelDialogueSystem.closeDialogue();
          this.levelDialogueSystem.showDialogue(
            message,
            speakerName,
            options.avatarSrc || null,
            options.spriteData || null,
          );

          this.levelDialogueSystem.closeBtn.textContent = isLast ? 'Close' : 'Skip';
          this.levelDialogueSystem.closeBtn.onclick = () => finish();

          this.levelDialogueSystem.addButtons([
            {
              text: isLast ? 'Done' : 'Next',
              primary: true,
              action: () => {
                index += 1;
                if (index < queue.length) {
                  showStep();
                } else {
                  finish();
                }
              },
            },
          ]);
        };

        showStep();
      });
    };

    /**
     * Section: toast + zone alert (self-contained, same visual language as Level 1).
     */
    const createNotificationStyle = (top, zIndex) => `
      position: fixed; top: ${top}; right: 20px;
      z-index: ${zIndex}; pointer-events: none;
      background: ${uiTheme.background};
      border: 2px solid ${uiTheme.borderColor};
      color: ${uiTheme.accentColor};
      font-family: "Courier New", monospace;
      font-size: 13px;
      padding: 10px 16px; border-radius: 8px; letter-spacing: 0.6px;
      box-shadow: ${uiTheme.boxShadow};
      width: min(360px, 32vw); text-align: left;
    `;

    this.showToast = function (message) {
      if (message === 'Press E to interact') return;
      const isActiveLevel = this.gameEnv?.currentLevel === this || this.gameEnv?.gameLevel === this;
      if (!isActiveLevel) return;

      if (this._toastEl?.parentNode) this._toastEl.parentNode.removeChild(this._toastEl);
      if (this._toastTimer) clearTimeout(this._toastTimer);

      const toast = document.createElement('div');
      toast.style.cssText = createNotificationStyle('20px', 100020);
      toast.textContent = message;
      document.body.appendChild(toast);

      this._toastEl = toast;
      this._toastTimer = setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
        if (this._toastEl === toast) this._toastEl = null;
      }, 2200);
    };

    this.setZoneAlert = function (message) {
      const isActiveLevel = this.gameEnv?.currentLevel === this || this.gameEnv?.gameLevel === this;
      if (!isActiveLevel) return;
      if (!this._zoneAlertEl) {
        const zoneAlert = document.createElement('div');
        zoneAlert.style.cssText = createNotificationStyle('84px', 100010);
        document.body.appendChild(zoneAlert);
        this._zoneAlertEl = zoneAlert;
      }
      this._zoneAlertEl.textContent = message;
    };

    this.clearZoneAlert = function () {
      if (this._zoneAlertEl?.parentNode) this._zoneAlertEl.parentNode.removeChild(this._zoneAlertEl);
      this._zoneAlertEl = null;
    };

    /**
     * Section: sidebar (PLAYER PROFILE carried over + new Toolchain Trail block).
     */
    const panelFields = [
      { key: 'name', label: 'Name', emptyValue: '—' },
      { key: 'email', label: 'Email', emptyValue: '—' },
      { key: 'githubID', label: 'GitHub ID', emptyValue: '—' },
      { key: 'persona', label: 'Persona', emptyValue: '—' },
      { type: 'section', title: 'Completion Status', marginTop: '10px' },
      { key: 'completionIdentityForge', label: 'Identity Forge', emptyValue: '—' },
      { key: 'completionWayfindingWorld', label: 'Wayfinding World', emptyValue: '—' },
      { key: 'completionMissionTools', label: 'Mission Tools', emptyValue: '—' },
      { type: 'section', title: 'Toolchain Trail', marginTop: '10px' },
      ...this.STATIONS.map((station) => ({
        key: `station_${station.id}`,
        label: `${station.icon} ${station.name}`,
        emptyValue: '—',
      })),
      { key: 'toolchainScore', label: 'Level 2 Score', emptyValue: '0.000' },
    ];

    const panelConfig = {
      id: PROFILE_PANEL_ID,
      title: 'PLAYER PROFILE',
      fields: panelFields,
      actions: [
        ...(this.profileManager.isAuthenticated ? [
          {
            label: 'Snapshot Progress',
            title: 'Save current progress to server',
            onClick: async () => {
              try {
                const complete = LocalProfile.load();
                if (complete) await (await import('@assets/js/projects/cs-pathway/model/persistentProfile.js')).default.save(complete);
                level.showToast('✦ Progress saved to server!');
              } catch (error) {
                console.error(`${level.logPrefix}: snapshot failed`, error);
              }
            },
          },
        ] : []),
        {
          label: '🔄 Reset Toolchain Trail',
          title: 'Clear only this level\'s station progress',
          danger: true,
          onClick: () => level._showResetModal(),
        },
      ],
      theme: uiTheme,
    };

    this.profilePanelView = new StatusPanel(panelConfig);
    this.profilePanelView.render();

    /**
     * Section: station status derivation + persistence.
     */

    // status per station id, recomputed whenever completedStations changes.
    this.stationStatus = {};

    this.getStationStatus = function (stationId) {
      return this.stationStatus[stationId] || STATION_STATUS.LOCKED;
    };

    this._recomputeStationStates = function (persist = true) {
      const nowLocked = {};
      let firstIncompleteIndex = this._nonBossOrder.findIndex((id) => !this.completedStations.has(id));
      if (firstIncompleteIndex === -1) firstIncompleteIndex = this._nonBossOrder.length; // all 6 done

      this._nonBossOrder.forEach((id, index) => {
        if (this.completedStations.has(id)) {
          nowLocked[id] = STATION_STATUS.COMPLETE;
        } else if (index === firstIncompleteIndex) {
          const activatedAt = this._stationActivatedAt[id] || (this._stationActivatedAt[id] = Date.now());
          const stuck = Date.now() - activatedAt > STUCK_THRESHOLD_MS;
          nowLocked[id] = stuck ? STATION_STATUS.STUCK : STATION_STATUS.ACTIVE;
        } else {
          nowLocked[id] = STATION_STATUS.LOCKED;
        }
      });

      const bossId = this.STATIONS.find((s) => s.isBoss)?.id;
      if (bossId) {
        if (this.completedStations.has(bossId)) {
          nowLocked[bossId] = STATION_STATUS.COMPLETE;
        } else if (firstIncompleteIndex >= this._nonBossOrder.length) {
          const activatedAt = this._stationActivatedAt[bossId] || (this._stationActivatedAt[bossId] = Date.now());
          const stuck = Date.now() - activatedAt > STUCK_THRESHOLD_MS;
          nowLocked[bossId] = stuck ? STATION_STATUS.STUCK : STATION_STATUS.ACTIVE;
        } else {
          nowLocked[bossId] = STATION_STATUS.LOCKED;
        }
      }

      this.stationStatus = nowLocked;
      this._applyStationVisuals();
      this._updatePanel();

      if (persist) {
        const score = this.completedStations.size / this.STATIONS.length;
        const allDone = this.completedStations.size === this.STATIONS.length;
        void this.profileManager.saveToolchainProgress(
          this.stationStatus,
          this._getActiveStationId(),
          score,
          allDone ? new Date().toISOString() : null,
        );
      }
    };

    this._getActiveStationId = function () {
      const activeId = Object.entries(this.stationStatus).find(
        ([, status]) => status === STATION_STATUS.ACTIVE || status === STATION_STATUS.STUCK,
      );
      return activeId ? activeId[0] : null;
    };

    this._applyStationVisuals = function () {
      const objects = this.gameEnv?.gameObjects || [];
      this.STATIONS.forEach((station) => {
        const obj = objects.find((o) => o?.spriteData?.id === station.id || o?.data?.id === station.id);
        if (!obj?.canvas) return;
        const status = this.getStationStatus(station.id);
        const hueRotate = STATION_HUE_ROTATE[station.id] || '';
        obj.canvas.style.filter = `${hueRotate} ${STATION_VISUAL_FILTERS[status] || 'none'}`.trim();
      });
    };

    this._updatePanel = function () {
      const values = {
        name: this.profileData?.name || '—',
        email: this.profileData?.email || '—',
        githubID: this.profileData?.githubID || '—',
        persona: this.profileData?.persona || '—',
        completionIdentityForge: '✓',
        completionWayfindingWorld: '✓',
        completionMissionTools: '✓',
        toolchainScore: (this.completedStations.size / this.STATIONS.length).toFixed(3),
      };
      this.STATIONS.forEach((station) => {
        values[`station_${station.id}`] = formatStationGlyph(this.getStationStatus(station.id), station.isBoss);
      });
      this.profilePanelView.update(values);
    };

    /**
     * Section: station interaction flow.
     */
    this.runStation = async function (stationId, showIntro = false) {
      const station = this._stationById[stationId];
      if (!station) return;
      if (this._stationTrialOpen) return;

      const status = this.getStationStatus(stationId);

      if (status === STATION_STATUS.LOCKED) {
        await this.showDialogue(`${station.icon} ${station.name}`, [
          station.isBoss
            ? 'The Singularity Core is sealed until every other station is verified.'
            : 'This station is still sealed. Complete the earlier stations first.',
        ]);
        return;
      }

      if (status === STATION_STATUS.COMPLETE) {
        await this.showDialogue(`${station.icon} ${station.name}`, [
          `${station.name} is already verified.`,
          station.funFact,
        ]);
        return;
      }

      if (showIntro) {
        await this.showDialogue(`${station.icon} ${station.name}`, [station.narrativeHook]);
      }

      this._stationTrialOpen = true;
      const trial = new StationVerificationTrial({
        station,
        onComplete: async ({ stationId: completedId }) => {
          this._stationTrialOpen = false;
          this.completedStations.add(completedId);
          this._recomputeStationStates(true);

          this.showToast(`✦ ${station.name} verified`);
          await this.showDialogue(`${station.icon} ${station.name}`, [
            `${station.name} verified!`,
            station.funFact,
          ]);

          if (this.completedStations.size === this.STATIONS.length) {
            this.showToast('★ Toolchain Trail complete!');
            this.markLevelComplete?.();
          }
        },
        onClose: () => {
          this._stationTrialOpen = false;
        },
      });
      trial.start();
    };

    /**
     * Section: reset (level-scoped — does not touch other levels' progress).
     */
    this._showResetModal = function () {
      const overlay = document.createElement('div');
      overlay.style.cssText = [
        'position:fixed', 'inset:0', 'z-index:99999',
        'background:rgba(0,0,0,0.72)',
        'display:flex', 'align-items:center', 'justify-content:center',
      ].join(';');

      const btnBase = [
        'display:block', 'width:100%', 'padding:10px 0',
        'border-radius:6px', 'border:1px solid #38bdf8',
        'font-family:"Courier New",monospace', 'font-size:0.92em',
        'cursor:pointer',
      ].join(';');

      const box = document.createElement('div');
      box.style.cssText = [
        'background:#04060f', 'border:1.5px solid #38bdf8', 'padding:26px 30px',
        'border-radius:10px', 'font-family:"Courier New",monospace', 'color:#dbeafe',
        'max-width:380px', 'width:90%', 'box-sizing:border-box',
      ].join(';');

      box.innerHTML = `
        <div style="font-size:1.05em;font-weight:bold;margin-bottom:10px;">🔄 Reset Toolchain Trail</div>
        <div style="font-size:0.86em;line-height:1.6;margin-bottom:18px;">
          This clears your progress on this level's 7 stations only.
          Identity Forge, Wayfinding World, and Mission Tools are untouched.
        </div>
        <div style="display:flex;flex-direction:column;gap:10px;">
          <button id="tt-reset-confirm" style="${btnBase}background:#3d0000;color:#fca5a5;border-color:#fca5a5;">
            Reset This Level
          </button>
          <button id="tt-reset-cancel" style="${btnBase}background:transparent;color:#94a3b8;border-color:#334155;">
            Cancel
          </button>
        </div>`;

      overlay.appendChild(box);
      document.body.appendChild(overlay);

      box.querySelector('#tt-reset-confirm').onclick = async () => {
        overlay.remove();
        this.completedStations.clear();
        this._stationActivatedAt = {};
        this._recomputeStationStates(true);
        this.showToast('✦ Toolchain Trail progress reset');
      };
      box.querySelector('#tt-reset-cancel').onclick = () => overlay.remove();
    };

    this._stationGatekeeperIds = this.STATIONS.map((s) => s.id);
  }

  /**
   * Section: loading overlay helpers (self-contained for this level).
   */
  _showLoading(message) {
    if (this._loadingOverlay) return;
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 100050;
      background: radial-gradient(circle at 50% 40%, rgba(20,10,50,0.96), rgba(2,2,10,0.98));
      display: flex; align-items: center; justify-content: center;
      color: #93c5fd; font-family: "Courier New", monospace; font-size: 14px;
      letter-spacing: 1px;
    `;
    overlay.textContent = message;
    document.body.appendChild(overlay);
    this._loadingOverlay = overlay;
  }

  _hideLoading() {
    if (this._loadingOverlay?.parentNode) this._loadingOverlay.parentNode.removeChild(this._loadingOverlay);
    this._loadingOverlay = null;
  }

  /**
   * Level initialization: bind gatekeeper reactions, seed sidebar, start stuck-check loop.
   */
  initialize() {
    const objects = this.gameEnv?.gameObjects || [];
    const gatekeepers = objects.filter((obj) => this._stationGatekeeperIds?.includes(obj?.spriteData?.id));
    gatekeepers.forEach((gk) => {
      if (typeof gk?.reaction !== 'function' && typeof gk?.spriteData?.reaction === 'function') {
        gk.reaction = gk.spriteData.reaction;
      }
    });
    this._gatekeeperObjects = gatekeepers;
    this._activeZoneStationId = null;

    this.profilePanelView.ensureMounted();
    this._recomputeStationStates(false);

    // Client-side stuck fallback: re-check every 30s (see stationStatus.js note
    // that the backend's authoritative flag should win once it exists).
    this._stuckCheckInterval = setInterval(() => this._recomputeStationStates(false), 30000);
  }

  /**
   * Per-frame proximity detection for zone alerts (same pattern as Level 1).
   */
  update() {
    const player = this.gameEnv?.gameObjects?.find((obj) => obj?.constructor?.name === 'Player' || obj?.constructor?.name === 'CsPathwayPlayer');
    if (!player || !Array.isArray(this._gatekeeperObjects)) return;

    const nearest = this._findNearestGatekeeperInZone(player, this._gatekeeperObjects);
    if (nearest) {
      const zoneMessage = nearest.spriteData?.zoneMessage || 'Press E to interact';
      this.setZoneAlert(zoneMessage);
      this._activeZoneStationId = nearest.spriteData?.id || null;
    } else if (this._activeZoneStationId) {
      this.clearZoneAlert();
      this._activeZoneStationId = null;
    }
  }

  _getObjectCenter(object) {
    return {
      x: (object?.position?.x || 0) + (object?.width || 0) / 2,
      y: (object?.position?.y || 0) + (object?.height || 0) / 2,
    };
  }

  _getGatekeeperAlertDistancePx(gatekeeper) {
    const alertMultiplier = gatekeeper?.spriteData?.alertDistance ?? 1.25;
    if ((gatekeeper?.width || 0) > 0) return gatekeeper.width * alertMultiplier;
    return (gatekeeper?.interactDistance || 120) * 1.5;
  }

  _findNearestGatekeeperInZone(player, gatekeepers) {
    const playerCenter = this._getObjectCenter(player);
    const collisionIds = player?.state?.collisionEvents || [];

    let nearest = null;
    let nearestDistance = Infinity;

    for (const gatekeeper of gatekeepers) {
      if ((gatekeeper?.width || 0) === 0) continue;
      const gkCenter = this._getObjectCenter(gatekeeper);
      const distance = Math.hypot(playerCenter.x - gkCenter.x, playerCenter.y - gkCenter.y);
      const inCollision = collisionIds.includes(gatekeeper?.spriteData?.id);
      const inZone = inCollision || distance < this._getGatekeeperAlertDistancePx(gatekeeper);
      if (inZone && distance < nearestDistance) {
        nearest = gatekeeper;
        nearestDistance = distance;
      }
    }
    return nearest;
  }

  markLevelComplete() {
    // Hook for whatever cross-level "completion" bookkeeping Level 1 uses
    // elsewhere in the codebase (e.g. cs_pathway_completion key). Left as a
    // simple no-op placeholder here so teammates can wire it to the shared
    // completion tracker without this file needing to know its internals.
    console.log(`${this.logPrefix}: level complete`);
  }

  destroy() {
    console.log(`[${this.logPrefix}] tearing down level...`);
    if (this._stuckCheckInterval) clearInterval(this._stuckCheckInterval);
    this._hideLoading();
    this.clearZoneAlert?.();
    if (this._toastEl?.parentNode) this._toastEl.parentNode.removeChild(this._toastEl);
    if (this.levelDialogueSystem) {
      if (typeof this.levelDialogueSystem.destroy === 'function') {
        this.levelDialogueSystem.destroy();
      } else {
        this.levelDialogueSystem.closeDialogue?.();
      }
    }
    if (this.profilePanelView) this.profilePanelView.destroy();
  }
}

export default GameLevelCsPath4Toolchain;
