<!-- 
NOTE: This file serves as the English documentation and explanation for `AGENTS.md` (which is maintained in Chinese to maximize token efficiency and context retention). Any updates or new rules added to `AGENTS.md` must also be translated and updated in this file.
-->

# Agent Programming Guidelines

## Core Principles

### Single Responsibility Principle (SRP)

* Every function, class, and module should have one clear reason to change.
* Avoid "god functions" that handle multiple concerns.
* If you describe a function with "and", it likely violates SRP.
* Prefer composition over large multi-purpose units.

### Simplicity over Cleverness

* Prefer readable code over "clever" abstractions.
* Avoid premature optimization.
* If a junior engineer can’t understand it in 30 seconds → simplify.

### Explicit Over Implicit

* Make dependencies visible.
* Avoid hidden state changes.
* Avoid "magic behavior" (implicit globals, side effects).
* Isolate I/O, network, and filesystem operations where possible.

## Architecture Rules

### Separation of Concerns

Split logic into clear layers:

* UI / interface layer
* Business logic layer
* Data / persistence layer
* Utility/helpers (pure functions)
**Agent rule:** Never mix data access with business logic unless explicitly justified.

### Feature-based Modularity

* Prefer modular files over large monoliths.
* Keep file sizes reasonable (soft rule: <300–500 lines).
* Group by feature, not by type (often better for scaling systems).
* Prefer modular monolith over microservices unless scale demands it.

## System-Specific Rules

### Ecosystem & Tooling Defaults

* **Prioritize SASS:** Use SASS (`.scss`) for styling instead of standard CSS or inline styles.
* **SASS compatibility:** The current Jekyll build uses Ruby Sass. Use `rgba(0, 0, 0, 0.15)` for transparent colors, not unsupported `rgb(0 0 0 / 15%)` syntax. Validate through the Makefile's Jekyll build.
* **Use `_projects`:** Leverage the modular project auto-registration system in the `_projects/` directory for new projects.
* **System Expansion:** Work within the existing systems and expand them if needed, rather than creating completely new parallel architectures.
* **Calendar pages:** Keep layout and modal styling out of `navigation/calendar.md`; use semantic classes and SCSS instead of utility-heavy inline markup.
* **Cross-origin APIs:** Spring endpoints consumed from `pages.opencodingsociety.com` should explicitly allow credentialed cross-origin requests.
* **Documentation:** Create detailed documentation for difficult or complex implementations as necessary.
* **Commenting:** Add comments for non-trivial logic, but keep them minimal and focused on *why* rather than *what*.
* **Ask Questions:** If system-level constraints, requirements, or patterns are unclear, pause and ask the user questions before proceeding.

### Project Workflow

* Treat [Makefile](Makefile) as the single source of truth; common targets are `make`/`make serve-current`, `make dev`, `make stop`, `make convert`, and `make convert-single` (details in [README.md](README.md)).
* Order matters: stop → build projects → convert notebooks/docx → split courses → jekyll serve (follow [Makefile](Makefile)).
* Project builds must run the [SASS import generator](scripts/generate_sass_imports.py) to create `_sass/projects/_all.scss`; `build-registered-projects` owns this dependency so Jekyll can resolve `projects/all`.
* Use template-generated project Makefiles. Do not add local npm manifests, `.gitignore` files or Makefile overrides for shared browser libraries. Keep shared runtime libraries in `assets/js/vendor/` with licenses and version documentation; ordinary builds need no npm installation.

### Sources vs Generated Files

* Courses owns curriculum composition in [_projects/systems/courses/](_projects/systems/courses/); [Blogs](_projects/systems/blogs/README.md) owns shared document layouts, catalog/reader, completion helpers and viewer styles. See [architecture](_projects/systems/courses/docs/ARCHITECTURE.md). Both are `:dev` projects using the shared generated Makefile and disjoint distribution manifests. Edit sources, not root generated copies. The Blogs post layout delegates course rendering to Courses' `course-document-player.html`; standalone documents must render without Courses. Submission/Runners remain shared dependencies; Grading derives from Submission. On old checkouts publish Courses before Blogs to release cached ownership; never delete caches indiscriminately. Tests: `bundle exec ruby scripts/test_blogs_system.rb`, `bundle exec ruby scripts/test_course_distribution.rb`. Restart watchers after boundary/template changes.
* [Topics](_projects/systems/topics/README.md) uses `categories` as independent, intersecting reference filters, never weeks or `lesson_topic`/`lesson_language`. `/topics/` replaces the Search menu; `/search/` redirects. Its generated `/topics/view/` documents keep interactive content and original submission identity but suppress course rendering/chat. Do not change original course routes. Card and Lunr results share one filtered collection. Use `topics-browser.html course_context=true` for course-hosted cards with week labels/original links. Test: `bundle exec ruby scripts/test_topics.rb` and `node --test tests/topics.test.mjs`.
* Topics prominence comes from [_projects/systems/topics/data/topics_primary.yml](_projects/systems/topics/data/topics_primary.yml), not a `topics:` document field. Both selection boxes filter `categories`. Search shows highlighted title cards followed by body/description excerpt matches, with no duplicate title results and no filter escape. Render highlights with plain-text nodes and Lunr positions.

* Course home sources are [_projects/systems/courses/navigation/](_projects/systems/courses/navigation/). Preserve `/navigation/courses/<course>/`; use `layout: post` and `player_page: {course: <course>, kind: home}` to share the sidebar and existing announcement/calendar UI. Course pills must resolve `current_course` on lessons, not only `page.course`. Encode Liquid values in JavaScript with `jsonify`, especially quoted titles. Validate with `bundle exec ruby scripts/test_course_landing_pages.rb` and a mobile navigation check.
* Course navigation state is owned by [_projects/systems/courses/js/player/course-navigation-state.js](_projects/systems/courses/js/player/course-navigation-state.js): preserve sections, scroll, and last document per course/panel. Blogs stays in the main pane while the last document is highlighted for resuming; do not redirect or change completion. Expand selected ancestors idempotently, never by toggling. Do not rebuild mobile navigation on resize. Test: `node --test tests/course_navigation_state.test.mjs`.
* Top-menu course entry uses [_projects/systems/courses/js/player/course-entry.js](_projects/systems/courses/js/player/course-entry.js) and `[data-course-entry]` to link directly to `/navigation/courses/<course>/` (Home/Announcements), not Blogs or the legacy chooser/catalog. Keep the last document highlighted in the navigation panel without redirecting to it. Blogs breadcrumbs show Home > selected course > Blogs. Persist `ocs-selected-course` on course visits; use enrolled selections for signed-in users and `_config.yml`'s `default_course` for new visitors. Test: `node --test tests/course_entry.test.mjs`.

* Sources live in [notebook sources](_notebooks/) and [docx sources](_docx/); converted Markdown is written to [generated posts](_posts/) (generated, do not hand-edit).
* Course-split outputs (`*_csp.md`/`*_csa.md`/`*_csse.md`/`*_content.md`) are generated; never edit them. See [scripts/split_multi_course_files.py](scripts/split_multi_course_files.py).
* Lesson player pages (each course's `/<course>/sprint-<n>/`, `/<course>/week-<w>/`, `/<course>/week-<w>/chat/`, and `/<course>/blogs/`) have no source files: [_projects/systems/courses/plugins/lesson_player_pages.rb](_projects/systems/courses/plugins/lesson_player_pages.rb) makes them at build time from the project's `data/<course>.yml`, with week and chat pages only for weeks that have lessons. Edit their bodies in [_projects/systems/courses/_includes/player-pages/](_projects/systems/courses/_includes/player-pages/); the links in [_projects/systems/courses/_includes/lesson-sidebar-nav.html](_projects/systems/courses/_includes/lesson-sidebar-nav.html) must use the same URLs. Test: `bundle exec ruby scripts/test_player_pages.rb`.
* Conversion behavior is defined in [scripts/convert_notebooks.py](scripts/convert_notebooks.py) and [scripts/convert_docx.py](scripts/convert_docx.py).
* Project notebooks (including GameBuilder) convert directly from `_projects/<category>/<project>/` into `_posts/projects/<project>/`. Old `_notebooks/projects/` copies are excluded from global conversion and splitting. The shared template uses one batch per project (at most four workers by default); `.notebook-conversion-cache/` invalidates on source/converter content or output changes, and identical Markdown is not rewritten. Use `CONVERT_FLAGS=--force` to force conversion. `make dev` no longer cleans or converts twice; restart watchers after pipeline changes. Generated Makefiles refresh untracked template copies but preserve tracked overrides; persistent changes belong in [_projects/_template/Makefile](_projects/_template/Makefile). Validate with `venv/bin/python -m unittest discover -s tests -p test_convert_notebooks.py`.
* CSA content belongs to registered projects under `_projects/lessons/` in ownership order `cs112 > cs113 > csa1 > csa2 > ds2`. Keep `notebooks/` and `docs/` flat, and preserve permalinks and `courses.csa.week` during migration. `articulation` records curriculum alignment, not earned credit. Drafts use `lesson_status: draft` and `planned_week` without `courses`: the timeline does not exclude lessons based on `hide`. See [_projects/REGISTRATION.md](_projects/REGISTRATION.md). Validate with `node --test tests/csa_curriculum.test.mjs`.
* CSA weeks 13-37 follow `_data/csa.yml`: at most three primary documents per instructional week. AP FRQ runners already aligned to CS112 may exceed the limit as `lesson_type: ap-practice` in matching instructional weeks. Use topic-first titles/filenames and preserve permalinks. Supplemental selections are in `tests/fixtures/csa_frq_practice.json`; primary selections are in `tests/fixtures/csa_week_schedule.json`. Other examples remain unscheduled references. Summative, AP-review, presentation, and finals weeks use checklists linking earlier lessons, not new assignments. `lesson_notes` exposes authoring gaps. After source moves, remove only confirmed orphan generated files so stale titles/weeks do not reappear.
* Keep AP FRQ category and historical question number separate: `ap_frq_category` is 1 methods/control, 2 class writing/design, 3 arrays/ArrayLists, or 4 2D arrays; `ap_exam_year`/`ap_exam_question` preserve historical identity. Use titles such as `FRQ 3 - Array or ArrayList Manipulation - 2017 Exam Q1 - CS112`. Audit actual exercise requirements, not old titles or exam ordering. Older questions can span skills; the nine-point category description does not change historical scoring guides. Frontmatter descriptions must be plain text without Liquid or `#`: cards do not recursively render variables, and the converter's unquoted YAML output truncates comments.
* The CS112/CS113 reports follow MiraCosta's original five sections and Lab Outline through `_data/cs112_topics.json` and `_data/cs113_topics.json`, sharing `curriculum-outline-report.html` and matching stable permalinks rather than filenames or AP categories. Show current titles/weeks, gaps, and PBL extensions; clearly label unfinished drafts. New unmapped lessons remain visible and deleted lessons do not create dead links. CS113 from-scratch layers are differentiated extensions; library use is not implementation mastery. Update mappings and coverage notes with source additions/removals. Validate with `bundle exec ruby scripts/test_cs112_report.rb` and `bundle exec ruby scripts/test_cs113_report.rb`.

### Project Registry & Styling
* College report topics may include Java library permalinks in `supporting_lessons`, separate from owned `lessons`. Keep Java source ownership, articulation metadata, and weeks unchanged; label supporting references and link `/navigation/java-reference/` in curriculum navigation. Audit existing Java coverage before declaring gaps. Validate with `bundle exec ruby scripts/test_java_curriculum_references.rb`.

* New projects must follow [_projects/REGISTRATION.md](_projects/REGISTRATION.md); architecture reference in [_projects/ARCHITECTURE.md](_projects/ARCHITECTURE.md).
* Use SCSS-first styling; theme and styling conventions are in [README.md](README.md).
* Theme presets ([assets/js/user-preferences.js](assets/js/user-preferences.js)) set every `span`, `div`, `p`, `li`, and heading to the theme's text color with `!important`. Put a button's icon and label straight inside the `ocs__btn`, like the Submit buttons in [_layouts/post.html](_layouts/post.html), not in a `<span>`; otherwise a `fill` button's label takes the theme's text color and can become unreadable.

### Backend Boundary

* The backend service lives under [node_backend/README.md](node_backend/README.md) and is separate from the site build pipeline; read it before making backend changes.

## Coding Standards

### Naming Conventions

Names should:

* Explain *intent*, not implementation.
* Avoid abbreviations unless standard.
* Be consistent across the codebase.
* Example: Use `normalizeUserTransactionData()` instead of `procData2()`.

### Error Handling

* **Fail Fast:** Validate inputs early, raise errors immediately with clear messages, and don't silently ignore failures.
* **Defensive Programming:** Assume inputs are invalid or malicious, add guards for edge cases, and never trust external data sources.
* **Discipline:** Never swallow exceptions silently. Always include context in errors and use typed/custom errors where appropriate.

### Logging Rules

* Log meaningful events, not noise.
* Logs should answer: *what happened and why?*
* Avoid logging sensitive data.

## Testing Rules

### Behavior-driven Tests

* Tests should describe behavior, not implementation.
* Every critical logic path should be testable.
* Prefer unit tests for logic, integration tests for flows.

### Critical Path Coverage Required

* **Agent rule:** If code changes behavior, update or add tests.
* Ensure deterministic behavior (avoid randomness unless explicitly required, fix seeds when needed).

## Agent Behavior Rules

### Plan Before Coding

* For non-trivial tasks: write a short plan before coding.
* Break into steps before implementation.

### Minimize Diffs

* Prefer minimal diffs over refactors unless required.
* Don’t rewrite working code without reason.

### Follow Existing Patterns

* Match existing codebase style and structure.
* Don’t introduce new architecture unless necessary.
* **Verify Assumptions:** If unclear, infer cautiously and flag assumptions. Never silently guess critical requirements.

### Self-Updating and Continuous Learning

* **Update this file:** As you iterate, make mistakes, and learn new system patterns or constraints, actively update `AGENTS.md` (and its optimized counterpart) with important notes so the system improves over time.

## CS Pathway level scores

* **Data flow:** each level's score is its percent complete (0–100). The game records it through [model/pathwayScores.js](_projects/games/cs-pathway/model/pathwayScores.js) (`completeLevelTask` for task-based levels, `recordLevelRatio` for ratio levels like Mission Tools and Toolchain Trail) and saves it via [services/PathwayScoreApi.js](_projects/games/cs-pathway/services/PathwayScoreApi.js) to Spring `PUT /api/cs-pathway/scores/{levelKey}`. The student comes from the Spring JWT cookie; never send a uid in the body.
* **Storage:** Spring (blueprint-spring `mvc/cspathway`) reuses the existing `stats` table: `module = "cs-pathway"`, `submodule` 0–4 for the five levels, `grades` = percent, `finished` = reached 100%. Don't change the `stats` schema or renumber submodules. Scores only go up, on both client and server.
* **Adding tasks/levels:** add task ids to `PATHWAY_LEVELS` and keep level keys in sync with Spring's `CsPathwayLevel` enum. The `PathwayScoreboard` scores bar (top-centre on every level page; the top-right is reserved for each level's toasts and "Press E" alerts, the top-left for its status panel) picks them up. Teacher view: Spring `/mvc/cs-pathway/read`.
* **Mac setup check:** when macOS is selected, Toolchain Trail shows a "Set up & check my Mac" button ([levels/MacSetupCheck.js](_projects/games/cs-pathway/levels/MacSetupCheck.js)). A web page can't run programs on a student's computer, so the panel lists commands to paste into their own Terminal, in order: `source scripts/mac_setup_agent.zsh` (agent on) → `bash scripts/activate_macos.sh` (install) → `source ~/.zshrc` → `bash scripts/verifyToolsTerminal.sh` (verify). The student pastes the verifier output back and [model/verifyToolsReport.js](_projects/games/cs-pathway/model/verifyToolsReport.js) parses it; if verifyToolsTerminal.sh's output format changes, update the parser too (`tests/test_verify_tools_report.mjs` runs the real script as a contract test). Scripts lack the execute bit, so always run them as `bash scripts/...`.
* **Station verification (pair once):** each Toolchain Trail station is verified through Spring `/api/toolchain` by [levels/StationVerificationTrial.js](_projects/games/cs-pathway/levels/StationVerificationTrial.js). The student runs `python3 scripts/toolchain_agent.py --server <backend>` once for the whole trail (macOS, Windows and Linux; stdlib only) and enters one pairing code. After that, at each station the game calls `POST /sessions/{id}/check` and the agent, polling `GET /sessions/{id}/next` with its Bearer token (valid 4 hours), runs the checks and posts results. The paired sessionId lives in localStorage `ocs-toolchain-agent-session`. Game timings live in [data/toolchainTrailSettings.js](_projects/games/cs-pathway/data/toolchainTrailSettings.js) and the agent's poll interval is `--poll-seconds`; don't hardcode them in code. Check ids must match Spring's `ToolchainStations`; run `python3 scripts/test_toolchain_agent.py` after changing the agent.
* **Automatic Mac results upload:** a Terminal has no login cookie, so for a signed-in student the panel first asks Spring for a pairing code valid for 30 minutes (`POST /api/cs-pathway/setup-report/pairing-code`, [services/SetupReportApi.js](_projects/games/cs-pathway/services/SetupReportApi.js)) and swaps the verify command for `bash scripts/verifyToolsTerminal.sh --report <upload URL>`. The script writes the results to `setup-report.md` in the repo root (gitignored) and POSTs the raw text to that URL; the panel polls `GET /api/cs-pathway/setup-report` every 4 seconds and shows the results by itself. Without a sign-in, or if the upload fails, the paste flow remains (pasted results are shown only, never saved). Spring stores reports in its own `cs_pathway_setup_report` table (one row per student, latest report only; the `stats` table is untouched) and the teacher view gains a "Setup check" column. The upload endpoint is public and the report is self-reported, so do not award score from it automatically. Spring reads the `Overall:`/`Summary:` lines with regexes, so keep it in sync when the script's output format changes. The script also prints `Started: <date time zone>` and `Duration: N seconds` (how long the checks took); the parser reads them as `startedAt`/`durationSeconds` (null for output from older copies of the script).
* **Linux/Windows results upload:** the Linux/Kasm/Windows panel ([levels/SystemSetupCheck.js](_projects/games/cs-pathway/levels/SystemSetupCheck.js)) uses the same pairing code, upload endpoint, and 4-second polling, swapping its command for `python3 scripts/linux_setup_agent.py --check --report <upload URL>` (Windows: `windows_setup_agent.py`, run inside WSL). The agent saves `setup-report.md` and POSTs with urllib. The report between the `=== ... SETUP CHECK v1 ===` markers also contains `Started:`, `Duration:`, `Summary: N passed, 0 warned, M failed`, and `Overall:` lines, because Spring requires `Summary:`/`Overall:` when saving; [model/systemSetupReport.js](_projects/games/cs-pathway/model/systemSetupReport.js) reads `startedAt`/`durationSeconds`. Each student keeps only their latest report regardless of OS, so the panel ignores an uploaded report for another system. Spring's AI review also reads `FAIL <id> | <label>` lines. Tests: `tests/test_system_setup_report.mjs` and `scripts/test_linux_setup_agent.py`.
* **Nested-project gotcha:** `make`'s `watch-projects` derives the wrong folder name for nested projects like `games/cs-pathway`, so it won't rebuild them. After edits, run `make -C _projects/games/cs-pathway build` and restart `make`.

## Anti-Patterns

### God Functions

* Avoid functions that do too many things. Stick to SRP.

### Hidden Side Effects

* Ensure predictability by keeping side effects explicit and well-documented.

### Over-engineering

* **YAGNI (You Aren’t Gonna Need It):** Don’t build features unless required now. Avoid speculative generalization.
* Optimize only after correctness is guaranteed (Profile before optimizing).

## Linux terminal setup assistance

For Linux tool installation or virtual-environment troubleshooting, follow
[the Linux setup assistant guide](docs/linux-setup-agent.md). Run
`scripts/linux_setup_agent.py` in the affected Linux terminal; local Mac
checks are not evidence about another user's Linux system.
