---
layout: post
title: Open Coding Society - Course Exploration
description: Start interactive experience by pressing "Play".
permalink: /cs-pathway
codemirror: True
hide: True
toc: False
step1: {'replay_label': 'Clear Cookies & Replay', 'locked_mission_label': 'Mission details unlock after you complete the mini challenge.'}
---

<div class="ui-runner">



<script>
(function() {

// =======================================
// COURSE OBJECTS - Page-level course data
// =======================================
class Course {
  constructor(code, title, subtitle, mission, unlockThreshold, learningJourney = [], zoneTitle = '') {
    this.code = code;
    this.title = title;
    this.subtitle = subtitle;
    this.mission = mission;
    this.unlockThreshold = unlockThreshold;
    this.learningJourney = learningJourney;
    this.zoneTitle = zoneTitle || code + ' Zone - ' + title;
  }

  isUnlocked(totalClicks) {
    return totalClicks >= this.unlockThreshold;
  }

  getRemainingClicks(totalClicks) {
    return Math.max(0, this.unlockThreshold - totalClicks);
  }
}

// Define courses from the shared YAML-backed course data
const courseDefinitions = {
  CSSE: {{ site.data.csse.course | jsonify }},
  CSP: {{ site.data.csp.course | jsonify }},
  CSA: {{ site.data.csa.course | jsonify }},
  CSH: {{ site.data.csh.course | jsonify }}
};

window.ocsCourses = Object.fromEntries(
  Object.entries(courseDefinitions).map(([code, config]) => {
    const course = new Course(
      config.code || code,
      config.title || (code + ' Course'),
      config.subtitle || '',
      config.mission || '',
      config.progression_key || 0,
      config.learning_journey || [],
      config.zone_title || (code + ' Zone')
    );
    return [code, course];
  })
);

// Expose classes globally for use in other cells
window.Course = Course;

// Let dependent cells initialize even if script execution order shifts.
window.dispatchEvent(new CustomEvent('ocs-courses-ready', {
  detail: { courseKeys: Object.keys(window.ocsCourses || {}) }
}));

})();
</script>
</div>






{% capture container_panel_home_zone_preview_left %}
<div class="ui-runner">

<div id="course-preview-panel" class="runner-side-panel">
  <p><button id="clear-cookies-btn" style="padding: 0.4rem 0.7rem; font-size: 0.9rem;">{{ page.step1.replay_label }}</button></p>
  <div id="course-preview-output">
    <h4>Welcome</h4>
    <p>Navigate to CSSE, CSP, CSA, or CSH to launch the mini challenge.</p>
    <ul>
      <li>Step 1: NPC interact (press E)</li>
      <li>Step 2: Cookie click challenge</li>
      <li>Unlock course: CSSE 5, CSP 10, CSA 15, CSH 20</li>
    </ul>
    <p><strong>Progress:</strong> <span id="course-progress-readout">0</span> total cookies</p>
    <p><strong>Status:</strong> <span id="course-gate-status">Waiting for selection</span></p>
  </div>
</div>

<script>
(function() {
(function setupCoursePreviewPanel() {
  const output = document.getElementById('course-preview-output');
  const clearButton = document.getElementById('clear-cookies-btn');
  if (!output) return;

  let latestPreview = null;

  const welcomeMarkup = '' +
    '<h4>Welcome</h4>' +
    '<p>Select CSSE, CSP, CSA, or CSH to launch the mini challenge.</p>' +
    '<ul>' +
    '<li>Stage 1: Course NPC select</li>' +
    '<li>Stage 2: Mini challenge awards +5 cookies</li>' +
    '<li>Unlock targets: CSSE 5, CSP 10, CSA 15, CSH 20</li>' +
    '</ul>' +
    '<p><strong>Progress:</strong> <span id="course-progress-readout">0</span> total cookies</p>' +
    '<p><strong>Status:</strong> <span id="course-gate-status">Waiting for selection</span></p>';

  const readProgress = function() {
    const raw = localStorage.getItem('ocsZoneProgress');
    if (!raw) return { totalClicks: 0, unlocked: {}, selectedZone: null };
    try {
      const parsed = JSON.parse(raw);
      return {
        totalClicks: parsed.totalClicks || 0,
        unlocked: parsed.unlocked || {},
        selectedZone: parsed.selectedZone || null
      };
    } catch (error) {
      return { totalClicks: 0, unlocked: {}, selectedZone: null };
    }
  };

  const getProgressReadout = function() {
    return document.getElementById('course-progress-readout');
  };

  const getGateStatus = function() {
    return document.getElementById('course-gate-status');
  };

  const updateProgressReadout = function() {
    const progress = readProgress();
    const progressReadout = getProgressReadout();
    if (progressReadout) progressReadout.textContent = String(progress.totalClicks || 0);
  };

  const setGateStatus = function(text) {
    const gateStatus = getGateStatus();
    if (gateStatus) gateStatus.textContent = text;
  };

  const renderCourse = function(payload) {
    if (!payload) return;
    latestPreview = payload;

    const progress = readProgress();
    const total = progress.totalClicks || 0;
    const threshold = payload.unlockThreshold || 0;
    const isUnlocked = total >= threshold;

    const missionBlock = isUnlocked
      ? '<p style="margin-top: 1rem;">' + (payload.mission || '') + '</p>'
      : '<p style="margin-top: 1rem;"><em>{{ page.step1.locked_mission_label }}</em></p>';

    output.innerHTML = '' +
      '<h2>' + payload.title + '</h2>' +
      '<h3 style="margin-top: 0.5rem; color: #667eea;">' + (payload.subtitle || '') + '</h3>' +
      '<p><strong>Unlock target:</strong> ' + threshold + ' cookies</p>' +
      '<p><strong>Progress:</strong> <span id="course-progress-readout">' + total + '</span> total cookies</p>' +
      '<p><strong>Status:</strong> <span id="course-gate-status">' + (isUnlocked ? 'Unlocked. Course is available.' : 'Starting mini challenge...') + '</span></p>';
  };

  const resetPreview = function() {
    latestPreview = null;
    output.innerHTML = welcomeMarkup;
    updateProgressReadout();
    setGateStatus('Progress cleared. Pick a course to start again.');
  };

  window.addEventListener('cs-pathway-course-preview', function(event) {
    renderCourse(event.detail);
  });

  window.addEventListener('cs-pathway-gate-start', function(event) {
    setGateStatus('Mini challenge started for ' + (event.detail.courseCode || 'course') + '.');
    updateProgressReadout();
  });

  window.addEventListener('cs-pathway-gate-exit', function(event) {
    const detail = event.detail || {};
    setGateStatus(detail.unlocked
      ? 'Unlocked ' + detail.courseCode + '. Course is available.'
      : 'Need more cookies for ' + detail.courseCode + '.');
    if (latestPreview) {
      renderCourse(latestPreview);
    } else {
      updateProgressReadout();
    }
  });

  if (clearButton) {
    clearButton.addEventListener('click', function() {
      localStorage.removeItem('ocsZoneProgress');
      window.dispatchEvent(new CustomEvent('cs-pathway-progress-cleared'));
      resetPreview();
    });
  }

  updateProgressReadout();
})();
})();
</script>
</div>

{% endcapture %}

{% capture container_panel_home_zone_preview_right %}

{% capture challenge0 %}
Course Brief Explorer
{% endcapture %}

{% capture code0 %}
import GameControl from '@assets/js/GameEnginev1.1/essentials/GameControl.js';
import Player from '@assets/js/GameEnginev1.1/essentials/Player.js';
import Npc from '@assets/js/GameEnginev1.1/essentials/Npc.js';
import Clicker from '@assets/js/GameEnginev1.1/essentials/Clicker.js';

class CourseBriefExplorer {
  constructor(gameEnv) {
    const path = gameEnv.path;
    const width = gameEnv.innerWidth;
    const height = gameEnv.innerHeight;

    const courses = window.ocsCourses || {};
    const courseKeys = Object.keys(courses);
    if (courseKeys.length === 0) {
      console.warn('[CourseBriefExplorer] No course definitions found on window.ocsCourses');
    }

    const storageKey = 'ocsZoneProgress';
    const readProgress = function() {
      const raw = localStorage.getItem(storageKey);
      if (!raw) {
        return { totalClicks: 0, unlocked: {}, selectedZone: null };
      }
      try {
        const parsed = JSON.parse(raw);
        return {
          totalClicks: parsed.totalClicks || 0,
          unlocked: parsed.unlocked || {},
          selectedZone: parsed.selectedZone || null
        };
      } catch (error) {
        return { totalClicks: 0, unlocked: {}, selectedZone: null };
      }
    };

    const saveProgress = function(progress) {
      localStorage.setItem(storageKey, JSON.stringify(progress));
    };

    const recomputeUnlocks = function(progressState) {
      const next = progressState;
      courseKeys.forEach(function(code) {
        const course = courses[code];
        const threshold = course ? (course.unlockThreshold || 0) : 0;
        next.unlocked[code] = (next.totalClicks || 0) >= threshold;
      });
      return next;
    };

    const awardCookies = function(amount, selectedCode) {
      const progress = readProgress();
      progress.totalClicks = (progress.totalClicks || 0) + amount;
      progress.selectedZone = selectedCode || progress.selectedZone || null;
      recomputeUnlocks(progress);
      saveProgress(progress);
      return progress;
    };

    const launchMiniGate = function(courseCode) {
      const course = courses[courseCode];
      if (!course) return;

      const parentControl = gameEnv.gameControl;
      if (!parentControl || !gameEnv.game) return;
      if (gameEnv.game.activeGameControl && gameEnv.game.activeGameControl !== parentControl) return;

      let completed = false;
      let sessionClicks = 0;
      const spriteOptions = [
        path + '/hacks/cookie-clicker/assets/baseCookie.png',
        path + '/hacks/cookie-clicker/assets/grandma.png'
      ];

      class CookieGateMiniLevel {
        constructor(miniEnv) {
          const miniWidth = miniEnv.innerWidth;
          const miniHeight = miniEnv.innerHeight;

          const spriteData = {
            id: 'Gate Cookie',
            greeting: 'Collect 5 cookies to unlock ' + courseCode + '.',
            src: spriteOptions[0],
            SCALE_FACTOR: 7,
            pixels: { height: 512, width: 512 },
            INIT_POSITION: { x: 0, y: 0 },
            orientation: { rows: 1, columns: 1 },
            down: { row: 0, start: 0, columns: 1, wiggle: 0.15 },
            up: { row: 0, start: 0, columns: 1, wiggle: 0.15 },
            left: { row: 0, start: 0, columns: 1, wiggle: 0.15 },
            right: { row: 0, start: 0, columns: 1, wiggle: 0.15 },
            hitbox: { widthPercentage: 0.2, heightPercentage: 0.2 },
            walkingArea: {
              xMin: Math.max(0, miniWidth * 0.05),
              xMax: Math.max(0, miniWidth * 0.95),
              yMin: Math.max(0, miniHeight * 0.08),
              yMax: Math.max(0, miniHeight * 0.92)
            },
            speed: 1.2,
            moveDirection: { x: 1, y: 1 },
            interact: function(clicks, objectId, clickerObject) {
              if (clickerObject && clickerObject.__counted) return;
              if (clickerObject) {
                clickerObject.__counted = true;
                clickerObject.visible = false;
                clickerObject.interact = null;
                clickerObject.spriteData.greeting = false;
              }

              sessionClicks += 1;
              window.dispatchEvent(new CustomEvent('cs-pathway-gate-progress', {
                detail: {
                  courseCode: courseCode,
                  sessionClicks: sessionClicks,
                  sessionTarget: 5
                }
              }));

              if (sessionClicks >= 5 && !completed) {
                completed = true;
                const progress = awardCookies(5, courseCode);
                window.dispatchEvent(new CustomEvent('cs-pathway-gate-award', {
                  detail: {
                    courseCode: courseCode,
                    totalClicks: progress.totalClicks || 0,
                    unlocked: !!progress.unlocked[courseCode]
                  }
                }));
                if (miniEnv.gameControl) {
                  setTimeout(function() {
                    miniEnv.gameControl.endLevel();
                  }, 180);
                }
              }
            }
          };

          this.classes = [{
            class: Clicker,
            data: spriteData,
            spawn: {
              count: 5,
              ranges: {
                INIT_POSITION: {
                  x: [Math.max(0, miniWidth * 0.05), Math.max(0, miniWidth * 0.9)],
                  y: [Math.max(0, miniHeight * 0.1), Math.max(0, miniHeight * 0.78)]
                },
                speed: [0.9, 1.9]
              },
              pickOne: {
                src: spriteOptions,
                moveDirection: [
                  { x: 1, y: 1 },
                  { x: 1, y: -1 },
                  { x: -1, y: 1 },
                  { x: -1, y: -1 }
                ]
              }
            }
          }];
        }
      }

      window.dispatchEvent(new CustomEvent('cs-pathway-gate-start', {
        detail: { courseCode: courseCode }
      }));

      const nestedControl = new GameControl(gameEnv.game, [CookieGateMiniLevel], {
        parentControl: parentControl
      });
      nestedControl.start();

      const exitWatcher = setInterval(function() {
        if (gameEnv.game.activeGameControl === parentControl) {
          clearInterval(exitWatcher);
          const latest = readProgress();
          const unlocked = !!(latest.unlocked && latest.unlocked[courseCode]);
          window.dispatchEvent(new CustomEvent('cs-pathway-gate-exit', {
            detail: {
              courseCode: courseCode,
              unlocked: unlocked,
              completed: completed,
              totalClicks: latest.totalClicks || 0
            }
          }));
        }
      }, 200);
    };

    // Course-specific NPC sprites for clearer visual identity in Step 1.
    const courseNpcSpriteMap = {
      CSSE: path + '/images/projects/cs-pathway/courses/csse.png',
      CSP: path + '/images/projects/cs-pathway/courses/csp.png',
      CSA: path + '/images/projects/cs-pathway/courses/csa.png',
      CSH: path + '/images/projects/cs-pathway/courses/csh.png'
    };
    const defaultNpcSprite = path + '/images/projects/cs-pathway/npc/gatekeeper.png';

    const playerData = {
      id: 'CoursePreviewGuide',
      greeting: false,
      src: path + '/images/projects/cs-pathway/player/minimalist.png',
      SCALE_FACTOR: 5,
      STEP_FACTOR: 900,
      ANIMATION_RATE: 45,
      INIT_POSITION: { x: width * 0.08, y: height * 0.62 },
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
      keypress: { up: 87, left: 65, down: 83, right: 68, interact: 69 },
      touchOptions: { interactLabel: 'e', position: 'left' },
    };

    const startX = width * 0.14;
    const spacing = Math.max(70, width * 0.2);
    const npcY = height * 0.18;

    const npcClasses = courseKeys.map(function(code, idx) {
      const course = courses[code];
      const npcSprite = courseNpcSpriteMap[code] || defaultNpcSprite;
      return {
        class: Npc,
        data: {
          id: 'Course_' + code,
          greeting: code + ': ' + (course.subtitle || course.title),
          src: npcSprite,
          SCALE_FACTOR: 4,
          ANIMATION_RATE: 8,
          INIT_POSITION: { x: startX + idx * spacing, y: npcY },
          orientation: { rows: 1, columns: 1 },
          down: { row: 0, start: 0, columns: 1 },
          up: { row: 0, start: 0, columns: 1 },
          left: { row: 0, start: 0, columns: 1 },
          right: { row: 0, start: 0, columns: 1 },
          hitbox: { widthPercentage: 0.05, heightPercentage: 0.05 },
          interactDistance: 125,
          interact: function() {
            window.dispatchEvent(new CustomEvent('cs-pathway-course-preview', {
              detail: {
                code: code,
                title: course.title || code,
                subtitle: course.subtitle || '',
                mission: course.mission || '',
                unlockThreshold: course.unlockThreshold || 0
              }
            }));

            window.dispatchEvent(new CustomEvent('cs-pathway-course-selected', {
              detail: { code: code }
            }));

            const progress = readProgress();
            const threshold = course.unlockThreshold || 0;
            const alreadyUnlocked = (progress.totalClicks || 0) >= threshold;
            if (alreadyUnlocked) {
              progress.unlocked[code] = true;
              progress.selectedZone = code;
              saveProgress(progress);
              window.dispatchEvent(new CustomEvent('cs-pathway-gate-exit', {
                detail: {
                  courseCode: code,
                  unlocked: true,
                  completed: false,
                  totalClicks: progress.totalClicks || 0
                }
              }));
              return;
            }

            launchMiniGate(code);
          }
        }
      };
    });

    this.classes = [
      { class: Player, data: playerData },
      ...npcClasses
    ];
  }
}

export const gameLevelClasses = [CourseBriefExplorer];
export { GameControl };
{% endcapture %}

{% include runners/game.html
   runner_id="cs-pathway-0"
   challenge=challenge0
   code=code0
   hide_edit="true"
   autostart="true"
   width="100%"
   height="280px"
%}

{% endcapture %}

{% include container-panel.html
   panel_id="home_zone_preview"
   layout="row"
   gap="1rem"
   left_width="35%"
   right_width="65%"
   left=container_panel_home_zone_preview_left
   right=container_panel_home_zone_preview_right
%}



<div class="ui-runner">



<script>
(function() {

/** ===============================================
 ZONE STATE MANAGER - Manages zone states 
 ==================================================
 ocsZoneProgress:
 {
    "totalClicks": 20,
    "unlocked": {
        "CSSE": true,
        "CSP": true,
        "CSA": true,
        "CSH": true
    },
    "selectedZone": "CSSE"
}
*/

class ZoneStateManager {
  constructor(storageKey = 'ocsZoneProgress') {
    this.storageKey = storageKey;
    this.totalClicks = 0;
    this.unlocked = {};
    this.selectedZone = null;
    this.load();
  }

  load() {
    const saved = localStorage.getItem(this.storageKey);
    if (saved) {
      try {
        const data = JSON.parse(saved);
        this.totalClicks = data.totalClicks || 0;
        this.unlocked = data.unlocked || {};
        this.selectedZone = data.selectedZone || null;
      } catch (e) {
        console.error('Error loading progress:', e);
      }
    }
  }

  save() {
    localStorage.setItem(this.storageKey, JSON.stringify({
      totalClicks: this.totalClicks,
      unlocked: this.unlocked,
      selectedZone: this.selectedZone
    }));
  }

  addClicks(amount) {
    this.totalClicks += amount;
    this.save();
  }

  clear() {
    localStorage.removeItem(this.storageKey);
    this.totalClicks = 0;
    this.unlocked = {};
    this.selectedZone = null;
  }

  selectZone(zoneCode) {
    this.selectedZone = zoneCode || null;
    this.save();
  }

  isUnlocked(zoneCode) {
    return this.unlocked[zoneCode] || false;
  }

  setUnlocked(zoneCode, unlocked) {
    this.unlocked[zoneCode] = unlocked;
  }

  syncFromStorage() {
    this.load();
  }
}

function updateZoneSectionVisibility(selectedZone) {
  const courses = window.ocsCourses || {};
  const progressRaw = localStorage.getItem('ocsZoneProgress');
  let progress = { totalClicks: 0, unlocked: {}, selectedZone: null };

  if (progressRaw) {
    try {
      const parsed = JSON.parse(progressRaw);
      progress = {
        totalClicks: parsed.totalClicks || 0,
        unlocked: parsed.unlocked || {},
        selectedZone: parsed.selectedZone || null
      };
    } catch (e) {
      progress = { totalClicks: 0, unlocked: {}, selectedZone: null };
    }
  }

  Object.keys(courses).forEach(function(courseCode) {
    const course = courses[courseCode];
    const threshold = course ? (course.unlockThreshold || 0) : 0;
    const unlocked = (progress.totalClicks || 0) >= threshold;

    progress.unlocked[courseCode] = unlocked;

    const isActive = selectedZone === courseCode && unlocked;
    const section = document.getElementById('zone-section-' + courseCode);
    if (section) {
      section.style.display = isActive ? 'block' : 'none';
    }

    const contentBlock = document.querySelector('.zone-content[data-zone="' + courseCode + '"]');
    if (contentBlock) {
      contentBlock.style.display = isActive ? 'block' : 'none';
    }
  });

  progress.selectedZone = selectedZone || null;
  localStorage.setItem('ocsZoneProgress', JSON.stringify(progress));
}

(function initZoneActivationFromGameFlow() {
  if (window.__csPathwayZoneActivationBound) return;
  window.__csPathwayZoneActivationBound = true;

  const bootstrap = function() {
    const raw = localStorage.getItem('ocsZoneProgress');
    if (!raw) {
      updateZoneSectionVisibility(null);
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      const selected = parsed.selectedZone || null;
      updateZoneSectionVisibility(selected);
    } catch (e) {
      updateZoneSectionVisibility(null);
    }
  };

  window.addEventListener('cs-pathway-gate-start', function() {
    // While mini game runs, hide all lower sections.
    updateZoneSectionVisibility(null);
  });

  window.addEventListener('cs-pathway-gate-exit', function(event) {
    const detail = event.detail || {};
    if (detail.unlocked && detail.courseCode) {
      updateZoneSectionVisibility(detail.courseCode);
      return;
    }
    updateZoneSectionVisibility(null);
  });

  window.addEventListener('cs-pathway-progress-cleared', function() {
    updateZoneSectionVisibility(null);
  });

  window.addEventListener('ocs-courses-ready', function() {
    bootstrap();
  });

  bootstrap();
})();

// Expose classes globally for use in other cells
window.ZoneStateManager = ZoneStateManager;

})();
</script>
</div>


* **Legacy Navigation:** [Home]({{ site.baseurl }}/home-legacy)

---

{% comment %}
CSSE Zone Section - Start
Hidden container div - shown when CSSE is selected
{% endcomment %}

<div id="zone-section-CSSE" class="zone-section" style="display: none;">
  <script>
  {
    const section = document.getElementById('zone-section-CSSE');
    if (section && window.ocsCourses?.CSSE) {
      const course = window.ocsCourses.CSSE;
      section.innerHTML = `
        <h2>${course.title}</h2>
        <h3 style="margin-top: 0.5rem; color: #667eea;">${course.subtitle}</h3>
        <p style="margin-top: 1rem;">${course.mission}</p>
      `;
    }
  }
  </script>






{% capture challenge1 %}
CS Pathway
{% endcapture %}

{% capture code1 %}
import GameControl from '@assets/js/GameEnginev1.1/essentials/GameControl.js';
import GameLevelCsPath0Forge from '@assets/js/projects/cs-pathway/levels/GameLevelCsPath0Forge.js';
import GameLevelCsPath1Way from '@assets/js/projects/cs-pathway/levels/GameLevelCsPath1Way.js';
import GameLevelCsPath2Mission from '@assets/js/projects/cs-pathway/levels/GameLevelCsPath2Mission.js';
import GameLevelCsPath3Analytics from '@assets/js/projects/cs-pathway/levels/GameLevelCsPath3Analytics.js';
import GameLevelCsPath4Toolchain from '@assets/js/projects/cs-pathway/levels/GameLevelCsPath4Toolchain.js';


export const gameLevelClasses = [GameLevelCsPath0Forge, GameLevelCsPath1Way, GameLevelCsPath2Mission, GameLevelCsPath3Analytics, GameLevelCsPath4Toolchain];
export { GameControl };
{% endcapture %}

{% include runners/game.html
   runner_id="cs-pathway-1"
   challenge=challenge1
   code=code1
   hide_edit="true"
   width="100%"
   height="640px"
%}


{% comment %}
CSSE Zone Section - End
Closes the zone-section-CSSE div
{% endcomment %}

</div><!-- Closes #zone-section-CSSE -->

{% comment %}
CSP Zone Section - Start
Hidden container div - shown when CSP is selected
{% endcomment %}

<div id="zone-section-CSP" class="zone-section" style="display: none;">
  <script>
  {
    const section = document.getElementById('zone-section-CSP');
    if (section && window.ocsCourses?.CSP) {
      const course = window.ocsCourses.CSP;
      section.innerHTML = `
        <h2>${course.title}</h2>
        <h3 style="margin-top: 0.5rem; color: #667eea;">${course.subtitle}</h3>
        <p style="margin-top: 1rem;">${course.mission}</p>
      `;
    }
  }
  </script>



{% comment %}
CSP Zone Section - End
Closes the zone-section-CSP div
{% endcomment %}

</div><!-- Closes #zone-section-CSP -->

{% comment %}
CSA Zone Section - Start
Hidden container div - shown when CSA is selected
{% endcomment %}

<div id="zone-section-CSA" class="zone-section" style="display: none;">
  <script>
  {
    const section = document.getElementById('zone-section-CSA');
    if (section && window.ocsCourses?.CSA) {
      const course = window.ocsCourses.CSA;
      section.innerHTML = `
        <h2>${course.title}</h2>
        <h3 style="margin-top: 0.5rem; color: #667eea;">${course.subtitle}</h3>
        <p style="margin-top: 1rem;">${course.mission}</p>
      `;
    }
  }
  </script>



{% comment %}
CSA Zone Section - End
Closes the zone-section-CSA div
{% endcomment %}

</div><!-- Closes #zone-section-CSA -->

{% comment %}
CSH Zone Section - Start
Hidden container div - shown when CSH is selected
{% endcomment %}

<div id="zone-section-CSH" class="zone-section" style="display: none;">
  <script>
  {
    const section = document.getElementById('zone-section-CSH');
    if (section && window.ocsCourses?.CSH) {
      const course = window.ocsCourses.CSH;
      section.innerHTML = `
        <h2>${course.title}</h2>
        <h3 style="margin-top: 0.5rem; color: #667eea;">${course.subtitle}</h3>
        <p style="margin-top: 1rem;">${course.mission}</p>
      `;
    }
  }
  </script>



{% comment %}
CSH Zone Section - End
Closes the zone-section-CSH div
{% endcomment %}

</div><!-- Closes #zone-section-CSH -->

<div class="ui-runner">


<!-- Styles defined in: _sass/open-coding/forms/home-gamified.scss -->
<div class="zone-content" data-zone="CSSE" style="display: none;">
  <h4>Learning Journey:</h4>
  <ul class="zone-journey-list" id="journey-list-CSSE">
    <!-- Populated dynamically from window.ocsCourses -->
  </ul>
</div>


<script>
(function() {
  const journeyList = document.getElementById('journey-list-CSSE');
  if (journeyList) {
    window.ocsCourses.CSSE.learningJourney.forEach(item => {
      const li = document.createElement('li');
      li.textContent = item;
      journeyList.appendChild(li);
    });
  }
})();
</script>
</div>

<div class="ui-runner">

<!-- Styles defined in: _sass/open-coding/forms/home-gamified.scss -->
<div class="zone-content" data-zone="CSP" style="display: none;">
  <h4>Learning Journey:</h4>
  <ul class="zone-journey-list" id="journey-list-CSP">
    <!-- Populated dynamically from window.ocsCourses -->
  </ul>
</div>


<script>
(function() {
  const journeyList = document.getElementById('journey-list-CSP');
  if (journeyList) {
    window.ocsCourses.CSP.learningJourney.forEach(item => {
      const li = document.createElement('li');
      li.textContent = item;
      journeyList.appendChild(li);
    });
  }
})();
</script>
</div>

<div class="ui-runner">


<!-- Styles defined in: _sass/open-coding/forms/home-gamified.scss -->
<div class="zone-content" data-zone="CSA" style="display: none;">
  <h4>Learning Journey:</h4>
  <ul class="zone-journey-list" id="journey-list-CSA">
    <!-- Populated dynamically from window.ocsCourses -->
  </ul>
</div>


<script>
(function() {
  const journeyList = document.getElementById('journey-list-CSA');
  if (journeyList) {
    window.ocsCourses.CSA.learningJourney.forEach(item => {
      const li = document.createElement('li');
      li.textContent = item;
      journeyList.appendChild(li);
    });
  }
})();
</script>
</div>

<div class="ui-runner">


<!-- Styles defined in: _sass/open-coding/forms/home-gamified.scss -->
<div class="zone-content" data-zone="CSH" style="display: none;">
  <h4>Learning Journey:</h4>
  <ul class="zone-journey-list" id="journey-list-CSH">
    <!-- Populated dynamically from window.ocsCourses -->
  </ul>
</div>


<script>
(function() {
  const journeyList = document.getElementById('journey-list-CSH');
  if (journeyList) {
    window.ocsCourses.CSH.learningJourney.forEach(item => {
      const li = document.createElement('li');
      li.textContent = item;
      journeyList.appendChild(li);
    });
  }
})();
</script>
</div>
