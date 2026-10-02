---
layout: opencs
title: Open Coding Society - Wayfinding World
description: Explore the Wayfinding World level of the CS Pathway on its own page.
permalink: /cs-pathway/wayfinding
hide: true
toc: false
---

{% comment %}
Standalone, full-window page for the Wayfinding World level. It was split out
of the CSSE game runner on /cs-pathway; the Identity Forge portal there still
splices this level in at runtime, so both entry points share the same level
and profile data. Styles live in sass/main.scss (.cs-pathway-fullpage).
{% endcomment %}

<div id="cs-pathway-wayfinding" class="cs-pathway-fullpage"></div>

<script type="module">
import Game from '@assets/js/GameEnginev1.1/essentials/Game.js';
import GameControl from '@assets/js/GameEnginev1.1/essentials/GameControl.js';
import GameLevelCsPath1Way from '@assets/js/projects/cs-pathway/levels/GameLevelCsPath1Way.js';

const gameContainer = document.getElementById('cs-pathway-wayfinding');

// Same options the game runner passes, but sized to the whole window.
Game.main({
  path: '{{ site.baseurl }}',
  gameContainer,
  gameLevelClasses: [GameLevelCsPath1Way],
  innerWidth: gameContainer.clientWidth,
  innerHeight: gameContainer.clientHeight,
  disablePauseMenu: true,
  disableContainerAdjustment: true,
}, GameControl);
</script>
