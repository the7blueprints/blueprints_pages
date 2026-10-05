// PathwayScoreboard.js
// Side dashboard shown on every CS Pathway level: percent complete for all
// five levels, with the level being played marked. Sits top-right so it does
// not cover each level's own status panel (top-left). It also shows a link to
// the next level's page, which is marked complete once this level hits 100%.
import StatusPanel from '@assets/js/GameEnginev1.1/essentials/StatusPanel.js';
import {
  PATHWAY_LEVELS,
  SCORES_UPDATED_EVENT,
  getCachedScores,
  getNextLevel,
  syncScoresFromServer,
} from '../model/pathwayScores.js';
import NextLevelLink from './NextLevelLink.js';

const PANEL_WIDTH_PX = 240;

class PathwayScoreboard {
  constructor({ currentLevelKey, basePath = '' }) {
    this.currentLevelKey = currentLevelKey;
    const nextLevel = getNextLevel(currentLevelKey);
    this.nextLevelLink = nextLevel ? new NextLevelLink({ nextLevel, basePath }) : null;
    this.onScoresUpdated = () => this.refresh();

    this.panel = new StatusPanel({
      id: 'cs-pathway-scoreboard',
      title: 'LEVEL SCORES',
      fields: PATHWAY_LEVELS.map((level) => ({
        key: level.key,
        label: level.key === currentLevelKey ? `▶ ${level.name}` : level.name,
        emptyValue: '0%',
      })),
      theme: {
        background: 'var(--ocs-game-panel-bg, rgba(13,13,26,0.92))',
        borderColor: 'var(--ocs-game-accent, #4ecca3)',
        textColor: 'var(--ocs-game-text, #e0e0e0)',
        accentColor: 'var(--ocs-game-accent, #4ecca3)',
      },
      // StatusPanel only positions from the left, so anchor to the right edge with calc().
      position: { top: '16px', left: `calc(100% - ${PANEL_WIDTH_PX + 16}px)` },
      width: `${PANEL_WIDTH_PX}px`,
      zIndex: '10000',
    });
  }

  show() {
    this.panel.render();
    this.nextLevelLink?.show();
    this.refresh();
    window.addEventListener(SCORES_UPDATED_EVENT, this.onScoresUpdated);
    syncScoresFromServer();
  }

  refresh() {
    const scores = getCachedScores();
    const values = {};
    PATHWAY_LEVELS.forEach((level) => {
      values[level.key] = `${Math.round(scores[level.key] || 0)}%`;
    });
    this.panel.update(values);

    this.nextLevelLink?.setComplete((scores[this.currentLevelKey] || 0) >= 100);
  }

  destroy() {
    window.removeEventListener(SCORES_UPDATED_EVENT, this.onScoresUpdated);
    this.panel.destroy();
    this.nextLevelLink?.destroy();
  }
}

export default PathwayScoreboard;
