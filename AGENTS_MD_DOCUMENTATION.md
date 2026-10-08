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

* Sources live in [notebook sources](_notebooks/) and [docx sources](_docx/); converted Markdown is written to [generated posts](_posts/) (generated, do not hand-edit).
* Course-split outputs (`*_csp.md`/`*_csa.md`/`*_csse.md`/`*_content.md`) are generated; never edit them. See [scripts/split_multi_course_files.py](scripts/split_multi_course_files.py).
* Conversion behavior is defined in [scripts/convert_notebooks.py](scripts/convert_notebooks.py) and [scripts/convert_docx.py](scripts/convert_docx.py).
* GameBuilder lesson notebooks are authored in [_projects/systems/gamebuilder/notebooks/](_projects/systems/gamebuilder/notebooks/); `_notebooks/projects/gamebuilder/` contains build copies. Project Makefiles are generated from [_projects/_template/Makefile](_projects/_template/Makefile), so persistent build/watch fixes belong in the template. Use a subshell for `cd` inside conversion loops so processing several notebooks does not change the loop's working directory.

### Project Registry & Styling

* New projects must follow [_projects/REGISTRATION.md](_projects/REGISTRATION.md); architecture reference in [_projects/ARCHITECTURE.md](_projects/ARCHITECTURE.md).
* Use SCSS-first styling; theme and styling conventions are in [README.md](README.md).

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
* **Automatic Mac results upload:** a Terminal has no login cookie, so for a signed-in student the panel first asks Spring for a pairing code valid for 30 minutes (`POST /api/cs-pathway/setup-report/pairing-code`, [services/SetupReportApi.js](_projects/games/cs-pathway/services/SetupReportApi.js)) and swaps the verify command for `bash scripts/verifyToolsTerminal.sh --report <upload URL>`. The script writes the results to `setup-report.md` in the repo root (gitignored) and POSTs the raw text to that URL; the panel polls `GET /api/cs-pathway/setup-report` every 4 seconds and shows the results by itself. Without a sign-in, or if the upload fails, the paste flow remains (pasted results are shown only, never saved). Spring stores reports in its own `cs_pathway_setup_report` table (one row per student, latest report only; the `stats` table is untouched) and the teacher view gains a "Setup check" column. The upload endpoint is public and the report is self-reported, so do not award score from it automatically. Spring reads the `Overall:`/`Summary:` lines with regexes, so keep it in sync when the script's output format changes. The script also prints `Started: <date time zone>` and `Duration: N seconds` (how long the checks took); the parser reads them as `startedAt`/`durationSeconds` (null for output from older copies of the script).
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
