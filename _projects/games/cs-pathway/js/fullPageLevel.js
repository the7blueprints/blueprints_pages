// fullPageLevel.js
// Boots a single CS Pathway level that fills the whole browser window.
// Used by the standalone level pages in navigation/ (styles: sass/full-page-level.scss).
import Game from '@assets/js/GameEnginev1.1/essentials/Game.js';
import GameControl from '@assets/js/GameEnginev1.1/essentials/GameControl.js';

export function startFullPageLevel({ containerId, levelClass, path }) {
  const gameContainer = document.getElementById(containerId);
  if (!gameContainer) {
    throw new Error(`startFullPageLevel: container #${containerId} not found`);
  }

  // Same options the game runner passes, but sized to the whole window.
  return Game.main({
    path,
    gameContainer,
    gameLevelClasses: [levelClass],
    innerWidth: gameContainer.clientWidth,
    innerHeight: gameContainer.clientHeight,
    disablePauseMenu: true,
    disableContainerAdjustment: true,
  }, GameControl);
}
