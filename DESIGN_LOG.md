# DESIGN_LOG — Bite: Scratch-like 3D Visual Programming Studio

> Persistent record of user intent, design decisions, implementation history, and verified status.
> Append-only by default (see Section 10 for the correction policy). The verbatim original prompt is preserved in **Appendix A**.
> Status vocabulary: **Completed** (implemented + verified), **Implemented, not verified**, **In progress**, **Not started**, **Blocked**, **Failed**, **Deferred**.

---

## 1. Project Purpose and Design Philosophy

**Purpose.** Bite is a Scratch-3.0-inspired visual programming studio in which the programmed objects live in a real-time 3D scene with physics, audio, and a project-management workflow. A user with no text-coding experience should be able to build a small interactive 3D experience by dragging blocks, placing primitives, and pressing Run.

**Philosophy (from the prompt, to be preserved):**
- Familiar Scratch workflow (block toolbox by category, drag/snap scripts, Run/Stop, project-oriented work), but the stage is a 3D world.
- Working product, not a mockup. Every block shown in the toolbox must have real runtime behavior.
- Web and desktop are both mandatory delivery targets, sharing one application codebase.
- Reuse established libraries for rendering, block editing, physics, packaging, and testing; do not reuse a finished Scratch application.
- Honest reporting: nothing is called "complete" or "verified" without evidence from commands that actually ran.
- Projects are persistent user data: never silently lose or corrupt them.

## 2. Original User Prompts and Design Intent

### PROMPT-001 — Initial mission: build the 3D Scratch-like studio (v0.1.0-beta1)
- **When:** 2026-10-09 (session start, repository `coderunknow/Bite`, branch `arena/d33f3a97-bite`, base `f77e3ac`).
- **Original request:** Verbatim in **Appendix A**. Also includes the trailing lines "THINK CAREFULLY, ULTRA EFFORT. Please create a useful plan before coding. Test and fix bugs clearly. Ask me anything for the best app. Finally, create a PR and check for any bug. This version is v0.1.0-beta1."
- **Intended outcome (user):** A complete, usable, Scratch-inspired 3D visual programming environment for web and desktop, with blocks, 3D stage, physics, sound, content creation, project management, tests, documentation, and a pull request.
- **Requirements/constraints (confirmed by the prompt):** see Section 3.
- **Philosophy:** see Section 1.
- **Open questions / assumptions:** see Section 9 ("Questions for the user"). Assumptions are labelled as such in Section 4.
- **Relationship:** This is the first and foundational entry.
- **Version:** The user states "This version is v0.1.0-beta1" → `package.json` version is `0.1.0-beta1`. No tag or release is to be created (explicit instruction).

### Repository state at intake (evidence)
- Branch `arena/d33f3a97-bite` at `f77e3ac` ("Initial commit"), tree contained only `README.md` (`# Bite`).
- No `AGENTS.md`/`AGENT.md`, no existing application code, no tests, no `DESIGN_LOG.md`. Therefore this log was created new (Section A of the mandate).
- Environment: Node 22.22.3, npm 10.9.8, Python 3.11, git 2.39.5, gh 2.23.0, Linux x86_64, 2 vCPU, ~3.9 GB RAM.

## 3. Confirmed Requirements and Constraints

Confirmed = stated explicitly in the prompt. Items marked *(engineering assumption)* are not user-approved.

**Core product**
- R1 Scratch-like block editor: drag from toolbox, snap, edit inputs, add/remove, control flow, save/restore scripts, execute, stop reliably, useful feedback when scripts can't run.
- R2 Block categories: Events (green flag, key pressed, broadcast, when I receive), Motion (3D), Looks & object properties, Control (wait, repeat, forever, if, if/else, stop), Sensing (keyboard, collision/contact, distance, runtime info), Operators (arithmetic, comparison, boolean, random), Variables (create, read, assign, change; scope defined and visible), Sound (play, play-and-wait, stop, volume).
- R3 Motion in 3D: move forward relative to orientation; set/change X/Y/Z; set/change rotation about axes; coordinate conventions defined and used consistently in editor, runtime, physics, inspector.
- R4 Looks: show/hide, appearance (color/opacity), size/scale, speech/status text.
- R5 Execution responsive; an infinite loop must not freeze the app or make Stop ineffective.
- R6 Real 3D stage: camera controls, selection, navigation, lighting, materials/colors, transforms, visual feedback. Editor camera separate from the runtime (stage) camera. Viewport resize, object create/delete without stale objects.
- R7 Physics: gravity, rigid bodies, collision shapes, collision detection/response, ground, per-object mass etc., interaction with programmed movement; physics settings in inspector; tests for falling, resting on ground, colliding.
- R8 Content creation: primitives (cube, sphere, cylinder, plane), select/rename, position/rotation/scale, color/material, duplicate/delete, hierarchy, lights and cameras, physics properties, live preview. glTF/GLB import *optional* ("consider... if it can be integrated reliably").
- R9 Audio: add/select sound assets, playback, stop, volume, script-driven events; browser audio restrictions handled with a clear enable-audio interaction; no undocumented remote service; assets remain valid through save/reopen/export/import.
- R10 Projects: new, rename, save, open, duplicate, delete (with safeguards), autosave/recovery, export to portable file, import; documented format; export includes assets (no machine-specific paths); malformed files handled without corrupting current project; unsaved work protected.
- R11 Web: reproducible dev setup, production build, verified in a browser. Desktop: real packaged desktop application (not a link to the website), documented build/launch, launch verified where technically possible. Shared application logic between web and desktop.
- R12 Performance/maintainability: integrated-GPU friendly; separation of concerns (editor, block representation/serialization, runtime, 3D scene, physics, assets, persistence, web/desktop integration); no empty catch blocks, no fake success messages.
- R13 Testing: unit, integration, e2e; the specific behaviors listed in prompt section 13 must be tested; run lint, type checks, builds.
- R14 Vertical slices; no TODOs/placeholder buttons presented as features.
- R15 PR: created from `arena/d33f3a97-bite`; description with functionality, architecture rationale, targets, build/test commands and real outcomes, verified workflows, limitations, launch instructions; include `DESIGN_LOG.md`. **Do not merge, do not create a release, do not add a tag.**
- R16 `DESIGN_LOG.md` mandatory (this file).
- R17 Version string `0.1.0-beta1` (user-stated).
- R18 Do not modify any `AGENTS.md`/`AGENT.md` without asking (none exist; nothing to change).

## 4. Design Decisions and Rationale

Each decision lists its basis. *Assumption* = engineering choice not explicitly approved by the user; revisit if the user objects.

**D-01 Web stack: Vite + React 19 + TypeScript (strict).** Fast dev server, production build, mature ecosystem, works in an integrated-GPU browser. Zustand (+immer) for UI/app state (small, explicit actions). *Assumption.*

**D-02 Block editor: Google Blockly (Apache-2.0), with our own runtime.** Blockly is the same family of technology as Scratch's own editor (scratch-blocks is a Blockly fork) and already provides drag-from-flyout, snapping, nesting, type checks, undo, copy/paste, and JSON serialization. Building a drag/snap editor from scratch would be a high-risk reinvention that the prompt explicitly allows us to avoid ("reuse appropriate libraries"). We do NOT use Blockly's JavaScript code generator; execution goes through our own interpreter, so that the runtime is testable without a DOM. *Assumption (library choice is delegated by the prompt).*

**D-03 Script persistence: Blockly's native JSON serialization** per target (object or stage) stored in the project. Runtime compiles the same JSON; tests can build JSON without Blockly. *Assumption.*

**D-04 3D rendering: three.js** with `OrbitControls` and `TransformControls` from `three/examples`. Industry standard, MIT. *Assumption.*

**D-05 Physics: Rapier (`@dimforge/rapier3d-compat`, Apache-2.0)**, WASM embedded so no separate loader/asset is needed. Chosen over cannon-es for better contact handling, kinematic bodies, and maintained WASM performance. *Assumption.*

**D-06 Audio: Web Audio API directly** (no library). Built-in sounds are synthesized in code and stored as WAV assets, so they are part of the project package like user sounds. No remote service.

**D-07 Coordinate system (authoritative, used everywhere):**
- Right-handed, Y-up, units = meters. Ground plane is y = 0. Gravity default (0, −9.81, 0).
- Object **position** = the object's origin (center of primitives).
- Object **rotation** = Euler angles in degrees, order **YXZ**: X = pitch (about X), Y = yaw/heading (about Y), Z = roll (about Z). Positive = right-hand rule (counter-clockwise when viewed from the positive axis toward the origin).
- Object **forward** = local −Z rotated by the object's full orientation. A new object at rotation (0,0,0) faces −Z ("into the screen" from the default camera at +Z).
- "Turn right N°" = clockwise when viewed from above = yaw −N. "Turn left N°" = yaw +N.
- Scale: per-axis, 1 = native size. Scratch-style "size %" = 100 × average of the three scale components; setting size sets all three.
- Default primitive sizes: cube 1×1×1, sphere diameter 1, cylinder diameter 1 × height 1, plane 1×1 (horizontal, normal +Y).

**D-08 Authored state vs live state (scene data model).**
- The **project** holds the authored layout (start transforms, variables' initial values, scripts).
- The **live scene** (runtime state) holds the current pose/visibility/appearance used by the renderer and physics.
- Edits in the inspector / viewport gizmo update *both* (so a user edit is visible immediately).
- **Run always starts from the authored layout** (and initial variable values). This is deterministic: running twice gives the same result. *Deliberate difference from Scratch*, where a second run continues from the current state.
- **Stop** ends all scripts, stops sounds and physics stepping, and **keeps** the current live state for inspection.
- **Reset** discards live state, restores the authored layout and initial variable values.

**D-09 Runtime model.** Each script = one thread implemented as a JavaScript generator. Threads yield only at loop iterations and waits (once per 60 Hz logic tick). This keeps the UI responsive and makes Stop effective immediately (`generator.return()`); a per-thread work budget guards against accidental synchronous loops. Stop-this-script uses a control signal that unwinds the thread cleanly. Fixed 60 Hz logic + physics step, render on requestAnimationFrame, with an accumulator capped to avoid spiral-of-death.

**D-10 Physics ↔ programmed movement (authoritative rule set).**
- Programmed position/rotation writes are **authoritative for the pose**: they set the current pose (teleport) for dynamic and static bodies, preserving linear velocity for dynamic bodies. Movement blocks read the *current* pose, which already includes physics motion, so e.g. "change x by 1" does not undo gravity.
- **Kinematic** bodies receive the program's pose via `setNextKinematicTranslation`/rotation so that the engine computes velocities and pushes dynamic bodies.
- Forces/impulses/velocities blocks act on dynamic bodies and are resolved by the engine during the step. Gravity acts between program writes.
- Physics readback (dynamic bodies) writes the pose back into the live scene once per step. Program writes are only pushed to physics when they changed (dirty flag), so no fighting loop occurs.
- Physics mode per object: `none` (no physical response; still detectable by "touching" via sensor colliders), `static`, `dynamic`, `kinematic`.

**D-11 "Touching".** Uses the physics world: solid pairs via contact manifolds; sensor pairs via intersection tests. Objects with physics mode `none` get sensor colliders, so they are still detectable. "Touching any object" is supported.

**D-12 Hierarchy.** Objects may have a parent (group or any object). Transforms are local to the parent (scene-graph semantics). Physics bodies are created only for top-level objects; a child with a physics mode other than `none` is reported as a warning in the inspector and the pre-run diagnostics ("physics applies to top-level objects; children move with their parent visually"). *Engineering scope decision, to document.*

**D-13 Variables.** Two scopes, Scratch-like: **global** (all targets) and **local** (one object). A local name must not collide with a global name; names unique within scope. Blocks reference variables by stable ID, so renaming keeps references. The Variables panel labels every variable with its scope and shows which scripts can read it (the object's own scripts + stage scripts for globals).

**D-14 Messages (broadcast).** Project-level list of messages referenced by ID (renames are safe). Broadcast and "when I receive" use dropdowns; "broadcast and wait" waits for threads started by the broadcast.

**D-15 Project format v1.** A project is a JSON document (`format: "bite.project"`, `formatVersion: 1`). Validated with Zod on import/open; malformed data is rejected with a readable error and the current project is untouched. Export file `.bite` = ZIP archive (`project.json` + `assets/<sha256>.<ext>` + `manifest.json` with SHA-256 digests). Import verifies digests and rejects mismatched assets. Plain `.json` project files are also accepted (no assets). *Assumption.*

**D-16 Assets.** Content-addressed (SHA-256). Stored in IndexedDB; deduplicated; garbage-collected on project deletion only when no other project references them. Sounds are referenced by asset ID. Built-in sounds are generated and stored like imports, so exported projects are self-contained.

**D-17 Persistence.** IndexedDB (`projects`, `assets`, `meta` stores). Autosave debounced (~1 s) after changes; explicit Save (Ctrl/Cmd+S); status indicator. Last-open project restored on load. Corrupt stored project → reported, not deleted, and a new project opened so the user is never stuck.

**D-18 Desktop: Electron.** Shares the built web bundle (`dist/web`). The Electron main process serves the bundle through a privileged custom protocol (`app://`) because ES modules do not load from `file://`. Preload exposes a small, typed bridge (`window.biteDesktop`) for native Save/Open dialogs; the renderer detects the bridge and falls back to browser download/upload otherwise. Packaging via `electron-builder`. *Assumption; Tauri was rejected because it needs a Rust toolchain and crates.io access, which are not reachable from this environment and would have been unverifiable here.*

**D-19 Lint/test tooling.** ESLint (flat config, typescript-eslint, react-hooks); Vitest (unit/integration, jsdom where needed); `fake-indexeddb` as a faithful IndexedDB implementation for storage tests; Playwright Test for end-to-end browser tests. In this sandbox the Chromium binary is supplied from the npm package `@sparticuz/chromium` via the `BITE_CHROMIUM_PATH` environment variable; developers use the Playwright-managed browser by default.

**D-20 Stage lighting/perf.** One directional "sun" with a 1024 shadow map, hemisphere light, optional point lights for Light objects. Pixel ratio capped at 1.5 on the viewport. No post-processing, to keep integrated GPUs responsive.

**D-21 Scope cuts (documented deferrals, not silent omissions):** clones ("create clone"), custom blocks/procedures, lists, pen/drawing, costumes/2D sprite artwork, cloud, accounts, multi-scene. These are not required by the prompt's must-have list; the prompt permits adjusting the block set with documented scope decisions.

## 5. Implementation History

### PLAN-001 (2026-10-09) — initial plan
1. Inspect environment and constraints (done: see Section 7 "Environment probes").
2. Scaffold: Vite/React/TS app, ESLint, Vitest, Playwright, Electron shell; `package.json` version `0.1.0-beta1`.
3. Vertical slice 1: block editor (Blockly) + interpreter + 3D object motion (Start → move changes position), Run/Stop with responsive loops, diagnostics.
4. Vertical slice 2: scene editing (create/select/transform/gizmo/duplicate/delete/hierarchy), inspector, materials, lights/cameras, stage vs editor camera.
5. Vertical slice 3: physics (Rapier) with gravity, colliders, ground, mass/friction/restitution, touching, impulse/velocity blocks; physics tests.
6. Vertical slice 4: audio (asset import, built-in sounds, playback/stop/volume blocks, enable-audio flow).
7. Vertical slice 5: project management (IndexedDB library, autosave, rename/duplicate/delete, export/import `.bite`, validation, templates).
8. Vertical slice 6: Electron desktop shell (native dialogs, packaging config), verify what is possible in this sandbox.
9. Testing: unit + integration (Vitest), e2e (Playwright on headless Chromium), lint, typecheck, production builds; fix defects.
10. Documentation (README, DESIGN_LOG, PR). Open PR (no merge, no release, no tag).

### Entries (append below in chronological order)

- **IMPL-000 (2026-10-09):** Repository inspected; `DESIGN_LOG.md` created; plan recorded. Status: Completed (documentation step). Implementation begins next.

## 6. Current Project Status

| Area | Status | Evidence |
|---|---|---|
| Repository inspection & log | Completed | This file, Section 2 |
| Web scaffold / build / dev | Not started | — |
| Block editor (Blockly) + toolbox | Not started | — |
| Block runtime (interpreter, threads, Stop) | Not started | — |
| 3D stage (render, select, gizmo, camera) | Not started | — |
| Physics (Rapier) | Not started | — |
| Content creation & hierarchy | Not started | — |
| Audio (assets, playback, blocks) | Not started | — |
| Project management (IndexedDB, autosave) | Not started | — |
| Export/import `.bite` | Not started | — |
| Desktop (Electron) packaging | Not started | — |
| Desktop launch verification | Not started | Blocked in this sandbox (see Section 8, B-01) |
| Tests (unit/integration/e2e) | Not started | — |
| Pull request | Not started | — |

## 7. Verification Evidence and Test Results

### Environment probes (2026-10-09, actual results)
- `npm` registry (`registry.npmjs.org`): reachable (HTTP 200). PyPI reachable. GitHub API reachable.
- `github.com` release redirects go to `objects.githubusercontent.com`: **unreachable** (connection failed). This blocks the Electron binary download and any GitHub release-asset download.
- `release-assets.githubusercontent.com`, `cdn.playwright.dev`, `playwright.download.prss.microsoft.com`, `storage.googleapis.com`, `unpkg.com`, `cdn.jsdelivr.net`: **unreachable**.
- apt mirrors (`deb.debian.org`, `archive.ubuntu.com`): **unreachable** (`apt-get update` failed). `sudo` works, but there is no package source.
- Browser: no system Chromium/Chrome/Firefox; no X server; NSS/GBM system libraries absent.
- Workaround verified: the npm package `@sparticuz/chromium` contains a headless Chromium (v153) binary plus its libraries (extracted by the package helper and run with `LD_LIBRARY_PATH`). A probe with `puppeteer-core` launched it and reported WebGL 2.0 (SwiftShader renderer). Used only for local end-to-end verification via `BITE_CHROMIUM_PATH`; not a dependency of the product.

## 8. Known Defects, Blockers, Unverified Behavior

- **B-01 (Blocker for desktop launch in this sandbox):** Electron's Linux binary cannot be downloaded (GitHub release CDN blocked). Consequence: the Electron app cannot be launched here; desktop packaging with `electron-builder` cannot run here. The desktop code will be type-checked, built to `dist/desktop`, and its main-process logic unit-tested with a mocked Electron API. Real launch remains **unverified** until run on a machine with GitHub access. Any future agent with GitHub access should run `npm run desktop:start` and `npm run desktop:dist`.
- **B-02:** `npm install electron` runs a postinstall binary download; in this sandbox this must be run with `ELECTRON_SKIP_BINARY_DOWNLOAD=1`. Documented in README.

## 9. Outstanding Requirements and Next Actions

Next actions: see PLAN-001. Questions for the user (raised, not blocking):
1. Stop vs Reset semantics: current decision (D-08) is Run-from-authored-layout, Stop keeps state, Reset restores. Keep, or prefer Scratch-style "Run continues from the current state"?
2. Export file extension `.bite` (ZIP with JSON + assets). Preferred name?
3. Should glTF/GLB import be included in this beta (planned as an optional slice) or deferred?
4. Desktop target OS priority for packaging (Windows NSIS, macOS DMG, Linux AppImage are all configured; which must be verified first)?
5. Should the viewport's "stage camera" be automatic when a camera object exists, or always opt-in?

## 10. Corrections and Changes to Earlier Decisions

None yet.

---

## Appendix A — Verbatim original prompt (PROMPT-001)

The text below is the user's prompt as received, preserved for future agents.

```text
Build a Scratch-Like 3D Visual Programming Studio from Scratch  
  
1. Mission  
  
Build a complete, usable, Scratch-inspired 3D visual programming environment from scratch.  
  
The application must combine the familiar drag-and-drop programming experience of Scratch with a real-time 3D scene, physics simulation, sound, visual content creation, and project management.  
  
The finished application must support both:  
  
- **Web:** A usable application running in a modern browser.  
- **Desktop:** A properly packaged desktop application, not merely instructions to open the website or a link to a browser.  
  
The objective is a working software product, not a prototype, UI mockup, static demonstration, or architecture proposal.  
  
You are authorized to inspect the repository, choose an appropriate technology stack, implement the application, install dependencies where permitted, run tests, diagnose failures, fix defects, and create a pull request.  
  
Make reasonable engineering decisions independently. Do not ask me to select implementation details that can be resolved by inspecting the repository, testing alternatives, or applying established engineering practices.  
  
2. Product vision and boundaries  
  
The application should feel familiar to someone who has used Scratch 3.0:  
  
- A block toolbox organized into categories.  
- A visual programming workspace where blocks can be dragged, snapped together, edited, and executed.  
- A stage where the programmed objects appear.  
- Clear Run and Stop controls.  
- A project-oriented workflow.  
  
The fundamental difference is that the stage and its objects exist in a real 3D environment.  
  
Objects should be programmable through blocks and observable in the 3D scene. The user must be able to create a small interactive 3D experience without writing code manually.  
  
You may use established libraries for rendering, visual block editing, physics, audio, packaging, and testing. Choose them based on suitability, compatibility, licensing, maintainability, performance, and the actual repository environment.  
  
Building from scratch means creating the product and its integration, runtime, project model, and user experience as a coherent application. It does not require unnecessarily reinventing low-level technologies.  
  
Do not reuse an entire existing Scratch application or another complete product as a shortcut. Reuse appropriate libraries, not a finished application that merely disguises the original task.  
  
Do not introduce unrelated gameplay systems or features that distract from the core product.  
  
3. Repository investigation  
  
Before making changes:  
  
1. Inspect the repository, Git status, current branches, existing source code, dependencies, build scripts, tests, documentation, and available execution environment.  
2. Read the repository's contributor instructions and any applicable `AGENTS.md`, `AGENT.md`, README, architecture documents, and existing design records.  
3. Determine whether the repository is empty, partially implemented, or already contains an application.  
4. Identify which web, desktop, test, and packaging commands can actually run in the available environment.  
5. Preserve unrelated work and existing user changes. Do not overwrite or discard changes merely to simplify implementation.  
  
If the repository is empty, establish an appropriate project structure. If code already exists, understand its architecture before deciding whether to extend or replace any component.  
  
Respect existing agent instructions. If modifying an existing `AGENT.md` or `AGENTS.md` becomes necessary, do not overwrite it automatically; ask me a specific question about the proposed change and its reason.  
  
Do not stop after producing a plan. After the initial investigation, proceed with implementation unless a genuine decision or environmental blocker requires my input.  
  
4. Core application interface  
  
Design a coherent, polished workspace that supports the complete programming workflow.  
  
The interface should provide, as appropriate:  
  
- A project toolbar with project name, save status, creation/opening, import/export, and other project operations.  
- Clear Run, Stop, and reset controls.  
- A block toolbox with understandable categories.  
- A visual programming workspace.  
- A live 3D viewport.  
- A hierarchy or list of scene objects.  
- An object inspector with editable properties.  
- Access to object creation, materials, physics settings, and sound assets.  
  
The layout should be usable at ordinary desktop resolutions and adapt to available space. Users should not have to fight overlapping panels, inaccessible controls, or broken drag-and-drop interactions.  
  
Use a consistent visual hierarchy, legible typography, meaningful interaction feedback, and coherent empty, loading, success, and error states.  
  
Prioritize usability and functional clarity over decorative complexity. The application should look intentionally designed rather than like an unfinished collection of default components.  
  
5. Visual block programming  
  
Implement an actual block programming system, not a collection of buttons that imitates one.  
  
Users must be able to:  
  
- Drag blocks from a toolbox.  
- Snap compatible blocks together.  
- Construct and modify scripts.  
- Edit numeric, text, boolean, and other appropriate inputs.  
- Add and remove blocks.  
- Create control-flow structures.  
- Save and restore their scripts.  
- Execute scripts in the 3D runtime.  
- Stop running scripts reliably.  
- Receive useful feedback when a script cannot execute.  
  
Provide a coherent initial set of programming categories.  
  
Events  
  
Support the essential event-driven programming workflow, including:  
  
- Start when the green-flag equivalent is activated.  
- Start when a supported keyboard key is pressed.  
- Broadcast a message.  
- Start a script when a message is received.  
  
Motion  
  
Provide practical 3D movement and rotation operations, including:  
  
- Move forward relative to the object's orientation.  
- Set or change X, Y, and Z coordinates.  
- Set or change rotation around the relevant axes.  
- Support suitable movement and orientation operations for a 3D scene.  
  
Define coordinate-system conventions clearly and use them consistently throughout the editor, runtime, physics, and inspector.  
  
Looks and object properties  
  
Include appropriate operations for:  
  
- Showing and hiding objects.  
- Changing object appearance.  
- Changing size or scale.  
- Changing colors where applicable.  
- Displaying simple speech or status text if supported by the chosen design.  
  
Control flow  
  
Implement the essential control structures:  
  
- Wait.  
- Repeat a specified number of times.  
- Repeat forever.  
- If.  
- If/else.  
- Stop the current script or all scripts.  
  
Execution must remain responsive. An infinite loop must not freeze the entire application or make Stop ineffective.  
  
Sensing  
  
Support relevant interactions such as:  
  
- Keyboard input.  
- Detecting contact or collision with objects.  
- Measuring distance between objects.  
- Accessing useful scene or runtime information.  
  
Operators and variables  
  
Include practical arithmetic, comparison, boolean, and random-value operations.  
  
Users must be able to create variables, read their values, assign values, and change values. Variable scope must be defined consistently, and the UI must make it clear which variables are available to which scripts.  
  
Sound  
  
Expose useful audio operations through blocks, including:  
  
- Play a sound.  
- Play a sound and wait for completion.  
- Stop sound playback where appropriate.  
- Control volume where supported.  
  
Every block displayed as an available programming operation must have real, defined runtime behavior. Do not expose decorative or nonfunctional blocks as completed features.  
  
You may adjust the initial set of blocks if a better technical design is justified, but preserve the essential capabilities above and document material scope decisions.  
  
6. Real-time 3D stage  
  
The stage must render and interact with actual 3D objects.  
  
Provide a functional 3D viewport with appropriate:  
  
- Camera controls.  
- Object selection.  
- Scene navigation.  
- Lighting.  
- Materials and colors.  
- Object transforms.  
- Visual feedback during editing and execution.  
  
The stage should respond to program execution in real time. For example, executing a movement block must visibly change an object's position rather than merely updating text or an unrelated UI value.  
  
Separate editor-camera behavior from the camera used by the running scene wherever the design requires it. Navigating the editor must not accidentally alter the programmed object's behavior.  
  
The rendering system should handle viewport resizing, object creation and deletion, scene changes, and application lifecycle events without leaving stale objects or broken references.  
  
7. Physics simulation  
  
Implement a functional physics system integrated with the 3D scene.  
  
At minimum, support:  
  
- Gravity.  
- Rigid-body behavior or an equivalent appropriate physics model.  
- Collision shapes.  
- Collision detection and response.  
- Ground or other collidable surfaces.  
- Useful per-object physics settings, including mass where applicable.  
- Interaction between moving objects and the surrounding scene.  
  
Expose appropriate physics properties through the object inspector. Make sure objects can be configured individually and that physical behavior can be tested in a simple scene.  
  
Physics must operate during program execution and interact correctly with programmed movement. Define how direct position changes, forces, velocities, and physics simulation interact; avoid conflicting systems that unpredictably overwrite one another.  
  
Use a suitable established physics library if that improves correctness and reliability.  
  
Test basic cases such as an object falling under gravity, resting on a ground surface, and colliding with another object.  
  
8. Content creation tools  
  
Users must be able to build a scene instead of being restricted to a fixed demonstration.  
  
Provide tools for:  
  
- Creating common primitive objects such as cubes, spheres, cylinders, and planes.  
- Selecting and renaming scene objects.  
- Changing position, rotation, and scale.  
- Editing basic colors and materials.  
- Duplicating and deleting objects.  
- Managing the scene hierarchy.  
- Creating or configuring lights and cameras where appropriate.  
- Editing physics-related properties.  
- Previewing changes in the 3D viewport.  
  
Consider support for importing common 3D asset formats, such as glTF or GLB, if it can be integrated reliably.  
  
Make sensible decisions about the initial asset scope. Do not compromise the required programming, physics, project-management, or build functionality to add optional asset features.  
  
9. Audio system  
  
Implement functional audio support.  
  
Users should be able to add or select sound assets, use them in programs, and hear the results during execution.  
  
Provide appropriate support for playback, stopping, volume control, and script-driven sound events.  
  
Handle browser audio restrictions, asset loading errors, and unsupported files gracefully. Do not require an undocumented remote service for basic audio playback.  
  
Where the platform requires a user gesture before playback, provide a clear and functional interaction for enabling audio.  
  
Audio assets and their references must remain valid when a project is saved, reopened, exported, or imported.  
  
10. Project management  
  
Treat projects as persistent user data, not temporary demonstrations.  
  
Implement a usable project workflow that includes:  
  
- Creating a new project.  
- Naming and renaming projects.  
- Saving changes.  
- Opening an existing project.  
- Duplicating a project where appropriate.  
- Deleting projects with suitable safeguards.  
- Automatic saving or recovery where practical.  
- Exporting a project to a portable file.  
- Importing an exported project.  
  
Choose a reliable project format and document it.  
  
Saving and reopening a project must preserve the information necessary to continue editing and running it, including scene objects, transforms, materials, scripts, variables, physics settings, and associated sound or other assets.  
  
The exported project must not depend on undocumented paths inside the developer's machine. Include required assets in the project package or use a clearly defined and reliable asset-reference mechanism.  
  
Handle malformed or unsupported project files without silently corrupting the current project. Protect unsaved work when switching projects or importing data.  
  
Cloud synchronization and user accounts are not required unless the repository already provides them and they materially improve the result.  
  
11. Web and desktop support  
  
Both delivery targets are mandatory.  
  
For the web version:  
  
- Provide a reproducible development setup.  
- Provide a working production build.  
- Verify that the application actually starts and that its core workflows work in a browser.  
- Handle browser-specific limitations explicitly.  
  
For the desktop version:  
  
- Provide a real desktop application build or package.  
- Ensure that the main programming, 3D, physics, audio, and project workflows are available in the desktop application.  
- Document the build and launch process.  
- Verify the packaged application can launch in the available target environment when technically possible.  
  
Prefer an architecture that shares application logic between the web and desktop versions where practical. Avoid maintaining two divergent implementations of the runtime without a compelling reason.  
  
Choose the packaging technology based on the repository and actual constraints. Do not claim desktop support merely because the web application could theoretically be opened in a browser.  
  
Clearly distinguish tested operating systems from targets that have not been verified.  
  
12. Performance, reliability, and maintainability  
  
Aim for a responsive application on ordinary consumer hardware, including systems that rely on integrated graphics rather than a dedicated GPU.  
  
Use sensible rendering quality, scene complexity, resource management, and update scheduling. Avoid unnecessary background work, uncontrolled event handlers, continuously accumulating objects, and avoidable memory leaks.  
  
Keep the system understandable and maintainable. Separate concerns where appropriate, particularly between:  
  
- The visual editor.  
- The block representation and serialization.  
- The block execution runtime.  
- The 3D scene and rendering layer.  
- Physics simulation.  
- Asset management.  
- Project persistence.  
- Web and desktop integration.  
  
Do not overengineer abstractions that have no demonstrated purpose. Equally, do not collapse major subsystems into an unmaintainable implementation merely to produce an impressive initial diff.  
  
Handle expected failure conditions explicitly. Avoid empty catch blocks, hidden runtime failures, fake success messages, and silent data loss.  
  
13. Testing and verification  
  
Testing is a required part of implementation, not an optional final step.  
  
First discover the existing testing conventions and tools. Reuse them when appropriate and add the missing tests needed to verify the product.  
  
Include appropriate unit, integration, and end-to-end tests.  
  
At minimum, verify the following behaviors.  
  
Block editor and runtime  
  
- Blocks can be created, connected, edited, removed, and serialized.  
- A valid script can be executed.  
- A Start event followed by a movement block changes the corresponding 3D object's position.  
- Conditional blocks and loops execute correctly.  
- Stop reliably terminates running scripts, including scripts with repeated execution.  
- Keyboard events and object-interaction blocks behave consistently with their documented semantics.  
- Runtime failures produce useful diagnostics rather than silently breaking execution.  
  
Scene and physics  
  
- Users can create, select, edit, duplicate, and remove 3D objects.  
- Transform changes are reflected in the scene.  
- Gravity and basic collision response work.  
- Physics settings survive save and reopen.  
- Repeated scene changes do not leave duplicate or stale objects.  
  
Audio and project persistence  
  
- Audio assets can be loaded and played through the supported workflow.  
- Sound blocks trigger the intended audio operations.  
- Saving and reopening a project preserves its relevant data.  
- Exporting and importing a project preserves scripts, objects, settings, and bundled assets.  
- Invalid project data is handled safely.  
  
Web and desktop  
  
- The web application builds successfully and can be launched.  
- Core workflows work in an actual browser or a suitable automated browser environment.  
- The desktop application builds and launches in the available target environment.  
- Critical functionality is not silently missing from one delivery target.  
  
Test actual behavior. Do not substitute fake runtime implementations or tests that merely assert that a button exists.  
  
Mocks and stubs may be used for appropriate external boundaries, but must not be used to pretend that the core editor, renderer, physics, persistence, or execution runtime works.  
  
Use deterministic tests where practical. For rendering and physics, verify meaningful observable behavior rather than relying exclusively on fragile screenshots or exact floating-point equality.  
  
Run the relevant test suite after implementation and again after correcting failures. Run linting, type checks, production builds, and other repository-required checks where applicable.  
  
If an environmental limitation prevents a test from running, record the exact limitation and distinguish it from a passing test.  
  
14. Implementation strategy  
  
Work in functional vertical slices: each slice should produce behavior that can be exercised, not just files or interfaces.  
  
Establish the minimal end-to-end programming workflow early. Then extend it to the required scene-editing, physics, audio, persistence, and packaging capabilities.  
  
Use the implementation order that best fits the discovered repository and dependencies. The objective is not to follow a rigid sequence; it is to expose architectural problems early and avoid accumulating large amounts of unverified code.  
  
At suitable checkpoints:  
  
- Run the relevant tests.  
- Exercise the application.  
- Inspect logs and errors.  
- Check the actual diff.  
- Correct defects before adding more complexity.  
  
Investigate failures instead of suppressing them. Avoid unrelated refactoring and mass rewrites unless evidence shows they are needed.  
  
Do not leave core functionality as TODOs, placeholder buttons, fake data, or disconnected UI.  
  
When encountering ambiguity that can reasonably be resolved by investigation and testing, make the best supported decision and record the rationale. Ask me only when a real product decision or blocker cannot be resolved responsibly without my input.  
  
15. Pull request and delivery  
  
Create a pull request when the implementation and verification work is ready.  
  
Do not merge the PR, create a release, or add a release tag.  
  
The PR description must include:  
  
- The main functionality implemented.  
- Important architecture and technology choices, including their rationale.  
- The supported web and desktop targets.  
- The commands used to build and test the application.  
- The actual outcomes of those commands.  
- Which important workflows were verified.  
- Any known limitations, failed checks, or unverified targets.  
- How a developer or user can launch the application.  
  
Inspect the final diff for accidental changes, generated files that should not be committed, exposed secrets, obsolete experiments, and incomplete work.  
  
Do not claim that a build, test, browser check, or desktop launch succeeded unless it actually ran successfully.  
  
If useful screenshots or other verification evidence can be produced with the available tools, include them in the PR or its supporting documentation.  
  
16. Definition of done  
  
The task is complete only when all of the following are true:  
  
1. The application is a usable Scratch-inspired 3D visual programming studio, not merely a mockup.  
2. Users can construct visual scripts and execute them against real 3D objects.  
3. The scene editor, basic physics, sound system, and project-management workflows function.  
4. Projects can be saved, reopened, exported, and imported without losing required data.  
5. Both the web and desktop delivery targets have been implemented, with their actual verification status clearly reported.  
6. Required checks have been run, failures have been investigated, and no known blocking defect is being concealed.  
7. The final implementation does not contain fake implementations of required features presented as complete.  
8. A pull request exists and contains an accurate summary of the changes and verification evidence.  
  
Zero bugs cannot be proven by a finite test suite. The goal is to eliminate known defects through systematic implementation and verification, avoid introducing obvious regressions, and disclose remaining risks honestly.  
  
If the entire scope cannot be completed within the available environment, prioritize a coherent, genuinely working product over a large, unverified code dump. State precisely what is complete, what remains, and why. Never describe unfinished or untested functionality as finished.  
  
Begin by inspecting the repository and environment, then implement, test, fix, verify, and open the pull request. Do not return only a plan or a recommendation.  
  
17. Mandatory Design Intent and Project History Log — DESIGN_LOG.md  
`DESIGN_LOG.md` is the project's persistent record of original user intent, design philosophy, prompts, implementation history, and actual completion status. It must remain useful across multiple prompts, coding sessions, agents, branches, and pull requests.  
  
Creating and maintaining this file is mandatory. Do not treat it as optional documentation.  
  
A. Inspect and initialize the log

Before substantial work, inspect the repository and read the existing `DESIGN_LOG.md`, if present.

- If the file does not exist, create it before substantial implementation work.
- If the file exists, preserve its history and continue from its established structure.
- Never replace an existing log with a newly generated summary.
- Do not assume that the existing log is complete or accurate without checking the repository and available evidence.
- If existing historical content must be corrected, follow the correction policy in Section F.
- Do not stop all implementation merely because the log already exists. Continue work that does not depend on an unresolved decision.

B. Record the original intent of every user prompt

For every new user prompt that introduces a task, changes the scope, clarifies requirements, or makes a design decision, create a distinct entry in `DESIGN_LOG.md`.

Each entry must preserve:

1. **Original user request:** Record the user's prompt verbatim whenever practical. For long prompts, retain the original text in a clearly identified section or preserve a faithful, sufficiently detailed record of the original requirements and constraints. Do not silently omit important details.
2. **Intended outcome:** Explain what the user is trying to accomplish, separately from the agent's interpretation.
3. **Requirements and constraints:** Record mandatory features, exclusions, platform targets, behavioral requirements, and explicit priorities.
4. **Design philosophy:** Preserve the user's underlying intent and any deliberate decisions that future implementation work must not undermine.
5. **Open questions and assumptions:** Identify unresolved decisions and distinguish confirmed requirements from engineering assumptions.
6. **Relationship to earlier entries:** Explain what the new prompt adds, changes, clarifies, or leaves unchanged.

Never turn an unverified assumption into a user-approved requirement. Never rewrite the original request to make it appear that the user asked for the implementation the agent happened to produce.

When the user explicitly revises a previous decision, preserve the original record and append the new decision with its source and rationale.

C. Track actual implementation progress

The log must record both what the user wants and what the agent has actually accomplished.

For each task or meaningful work item, track the following statuses as applicable:

- **Completed:** Implemented and supported by appropriate verification evidence.
- **Implemented, not verified:** Code exists, but the relevant behavior has not been adequately tested.
- **In progress:** Work has started but is incomplete.
- **Not started:** Required work has not begun.
- **Blocked:** Work cannot proceed because of a specific technical, environmental, or decision-related blocker.
- **Failed:** An attempted implementation or verification did not succeed.
- **Deferred:** Work was explicitly postponed, with the reason recorded.

Record relevant implementation details, files or subsystems affected, test outcomes, known defects, unresolved issues, and remaining work.

Do not mark a feature as completed merely because code has been written, a UI control exists, or a build succeeds. Apply the evidence required by the relevant feature and its acceptance criteria.

Do not silently remove unfinished requirements from the log simply because they were difficult, time-consuming, or outside the agent's immediate implementation plan.

D. Update the log throughout the work

Update `DESIGN_LOG.md` whenever meaningful progress, new decisions, failures, discoveries, or requirement changes occur.

At minimum:

1. Record the task and its original intent before substantial implementation.
2. Update the relevant entries at meaningful implementation checkpoints.
3. Record the actual results of important tests and verification attempts.
4. Record newly discovered defects, blockers, and remaining work.
5. Reconcile the log with the final code, test results, and pull request before reporting completion.

An interrupted or terminated session must leave enough information for another agent to determine the original objective, the last verified state, the unfinished work, and the next useful actions.

Never report an unfinished task as complete simply because the agent's session is ending.

When continuing an existing task, read the latest log entries and verify their status against the repository before proceeding. Correct stale status information transparently rather than assuming previous claims remain true.

E. Preserve continuity across agents and sessions

Before implementing, refactoring, optimizing, or removing behavior covered by the design log:

1. Identify the relevant original requirement or design decision.
2. Compare the proposed change with the recorded intent.
3. Check whether existing code and tests support the interpretation.
4. Preserve deliberate behavior even when another implementation appears simpler.
5. Resolve genuine conflicts through evidence or a direct question to the user, rather than silently choosing a different product direction.

Agents may improve implementation details, architecture, performance, maintainability, and testing without requesting permission for every routine engineering decision.

However, they must not silently change the user's intended behavior, remove mandatory requirements, replace essential features with approximations, or redefine completion criteria for convenience.

When a material design decision genuinely cannot be resolved from the recorded intent and available evidence, ask the user one direct, specific question about the unresolved decision. Continue independent work that is not blocked by that question.

F. Append-only history and corrections

Treat `DESIGN_LOG.md` as an append-only record by default.

- Append new prompt entries, decisions, progress reports, test results, and corrections instead of rewriting earlier entries.
- Keep original user intent distinct from agent interpretations and implementation decisions.
- Avoid deleting, replacing, or restructuring existing historical entries without a genuine reason.
- Do not silently rewrite a previous entry to make an unsuccessful decision or implementation appear correct.
- Do not duplicate the entire history after every update. Add a new entry or update a clearly designated current-status section while preserving the historical record.

**Historical edits are allowed when the user explicitly requests them or when an actual mistake, factual error, or misleading record needs correction.**

When correcting an earlier entry:

1. Preserve the original content whenever practical.
2. Identify what was incorrect or misleading.
3. Record the corrected information and the evidence or reason.
4. Explain the correction without disguising it as the original decision.

For routine progress updates, adding a new entry is preferred over rewriting historical content.

G. Required log structure

Use a structure appropriate to the repository, but ensure the file contains these sections or their clear equivalents:

1. **Project Purpose and Design Philosophy**
2. **Original User Prompts and Design Intent**
3. **Confirmed Requirements and Constraints**
4. **Design Decisions and Rationale**
5. **Implementation History**
6. **Current Project Status**
7. **Verification Evidence and Test Results**
8. **Known Defects, Blockers, and Unverified Behavior**
9. **Outstanding Requirements and Next Actions**
10. **Corrections and Changes to Earlier Decisions**

Each prompt entry should have a stable identifier or another unambiguous way to reference it. Include a date or timestamp when available, and identify its relationship to the relevant implementation work.

Keep the current status easy to find without discarding the historical information needed to understand how the project reached that state.

H. Scratch 3D-specific requirements

For this project, the log must explicitly track the status of:

- Scratch-style visual block editing and execution.
- The real-time 3D scene and object manipulation.
- Physics simulation and collision behavior.
- Content creation and scene-object management.
- Audio playback and sound programming blocks.
- Project creation, persistence, import, and export.
- Web implementation and production build.
- Desktop implementation, packaging, and launch verification.
- Testing, known defects, and unfinished acceptance criteria.
- Pull request creation and the actual state of the proposed changes.

These are requirements to track, not permission to declare features complete without evidence.

If a requirement is implemented differently from the original intention, document the difference and its rationale. Do not describe an approximation as equivalent without verifying that it preserves the required behavior.

I. Pull request and completion requirements

Before opening the pull request, verify that:

- `DESIGN_LOG.md` exists and contains the original task intent.
- Meaningful implementation progress has been recorded.
- Completed features are distinguished from implemented-but-unverified features.
- Unfinished requirements and known defects remain visible.
- Important test results reflect commands that actually ran.
- New design decisions and corrections are recorded accurately.
- The pull request's description agrees with both the repository and the log.

Include `DESIGN_LOG.md` in the pull request when it is newly created or has legitimate additions.

Do not merge the pull request, create a release, or add a release tag.

At the end of the task, report what was actually completed, what remains, what was verified, and what could not be verified. The log must support that report rather than merely repeat the agent's claims.

Final principle: Preserve the user's original intent, maintain an honest history of implementation progress, and make it possible for any future agent to continue the project without losing requirements, repeating completed work unnecessarily, or mistaking unfinished work for a completed product.

THINK CAREFULLY, ULTRA EFFORT.

Please create a useful plan before coding.

Test and fix bugs clearly.

Ask me anything for the best app.

Finally, create a PR and check for any bug.

This version is v0.1.0-beta1.
```

---

# Log update U-1 (2026-10-09): status, decisions, and verification after first full implementation pass

This update is appended. It supersedes the status in Section 6 and the statements in Sections 7–9 above, which were written before implementation. The earlier text is kept unchanged for the audit trail.

## 5 (continued). Implementation History

- **IMPL-001 (2026-10-09):** Scaffold (Vite, React, TypeScript, ESLint flat config, Vitest, Playwright), `package.json` at `0.1.0-beta1`, `.gitignore` (node_modules, dist, release, test-results, playwright-report). Status: Completed.
- **IMPL-002:** Block editor (Blockly 13) with nine toolbox categories (Events, Motion, Looks, Sound, Control, Sensing, Operators, Variables, Physics), a block-definition layer (`src/editor/blockDefs.ts`), and a per-target bridge (`src/editor/blocklyBridge.ts`). Blockly media are served locally from `public/blockly-media/` (Section D-22). Status: Completed; verified by unit, integration and e2e tests below.
- **IMPL-003:** Runtime (`src/runtime`, `src/engine`): threads, Run/Stop/Reset, diagnostics with block links, `ScriptError` for unsupported or misconfigured blocks. Status: Completed; 10 engine integration tests pass.
- **IMPL-004:** Stage (three.js): editor and scene cameras, selection, Move/Rotate/Scale gizmos, lights, materials, primitives (cube, sphere, cylinder, plane), hierarchy, inspector. Status: Completed for the features listed; verified by the browser screenshot and e2e tests (add and delete an object). Gizmo drag, block drag, and camera-control interaction are **not** covered by automated tests (Section 8).
- **IMPL-005:** Physics (Rapier 0.21, `src/physics`). Status: Completed; verified by unit and integration tests (rest heights, Ball on Bouncer).
- **IMPL-006:** Audio (Web Audio, `src/audio`): WAV decode through OfflineAudioContext, gesture unlock UI ("Enable audio"), built-in generated sounds (Pop, Chime, Click, Boom, Beep), user imports, play / play-and-wait / stop / volume blocks. No remote service. Status: Completed; unit tests pass; playback itself is verified only in the locked state (headless Chromium has no user gesture).
- **IMPL-007:** Project management (`src/app`, `src/storage`): IndexedDB store, autosave (800 ms debounce), new / rename / save / open / duplicate / delete (typed name required), recovery on reload, `.bite` export and import (ZIP with `manifest.json`, `project.json`, `assets/<sha256>.<ext>`), with validation of malformed files. Status: Completed; storage, package and e2e tests pass.
- **IMPL-008:** Desktop shell (`electron/main.ts`, `electron/preload.ts`, `scripts/build-desktop.mjs`, `electron-builder.yml`). Status: **Code written and bundled; not launched; not packaged** (Blocker B-01).
- **IMPL-009 (fix, found by e2e/screenshot):** Selecting the Ball crashed the whole studio. Cause: `control_forever`, `control_repeat`, `control_if` and `control_repeat_until` had a statement argument (`SUBSTACK`) that was missing from their message text, so Blockly never created the input and the load threw. The engine tests did not catch it because they never load scripts through Blockly. Fix: the placeholders were added. Regression tests were added: every argument has a placeholder, and every template script loads through Blockly. Status: Completed; verified (see Section 7).
- **IMPL-010 (fix):** A failing script load no longer crashes the app. `BlockEditor.load` returns the error, clears the workspace, makes it read-only, and shows a banner ("These scripts could not be opened… kept in the project unchanged"). The stored script is never overwritten by a partial load. Each right-hand panel and the scripts and stage panels are wrapped in a `PanelBoundary` error boundary, so one panel's render error does not blank the studio. Status: Completed; the e2e test "selecting the Ball…" covers the normal path; the failure path has no automated test yet (Section 8).
- **IMPL-011 (fix):** Stale dropdown values (for example, a deleted sound referenced by a script) were silently replaced by the first option on load, which would have changed the user's script on the next save. Fix: `KeepStaleDropdown` overrides Blockly's `doClassValidation_` for dropdowns marked `keepStaleValues`. Regression test added. Status: Completed; verified (Section 7).
- **IMPL-012 (lint/typecheck cleanup):** `require-yield` disabled file-wide in `src/runtime/blocks.ts` (see D-23); a `useEffect` dependency fixed in `Viewport.tsx`; an unused import removed; `override` modifiers added on the error boundary; a justified `no-control-regex` exception in `safeFileName`; a no-op `disabled={false}` removed from the project menu button. Status: Completed.

## 4 (continued). Design decisions recorded during implementation

**D-22 Blockly media are local.** Blockly's default media path is `static.blockly.com`, which the Content-Security-Policy blocks. The `media` inject option points to `public/blockly-media/` (from the Blockly package, licence `LICENSE.blockly.txt` included). Reason: no third-party network calls at runtime.

**D-23 `require-yield` lint exception.** Statement blocks are generator functions so that the runtime can suspend them at each frame. Most statement blocks do not yield (for example, `motion_changeposition`), and the rule flags them. The rule is disabled file-wide in `src/runtime/blocks.ts` with the justification in the file header. Other rules remain on. Alternative rejected: wrapping every non-yielding block in a fake `yield`, which would obscure the code.

**D-24 Physics contract (per tick).** `syncFromProgram` (writes script transforms to Rapier bodies for objects the program moved) runs before `step`. `step` reads back only dynamic bodies, so static bodies are never written back from physics. `touching` reflects the most recent step, so it lags by one frame. The intended consequence is that script motion and physics do not both write the same body in one tick; this ordering is the design, and the physics unit and integration tests exercise it, but no separate conflict test exists. Measured: a 1 m cube on the ground rests at y ≈ 0.495 (about 5 mm steady penetration, no drift over 10 s). A sphere on a 2 × 1 × 2 m cube rests at y ≈ 1.494.

**D-25 Primitive colliders.** Uniform scale uses ball, cuboid or cylinder colliders. Non-uniform scale uses a convex hull over the unit-primitive vertices. The plane is a thin cuboid (half-thickness 0.01 m) translated so its top surface is at the origin. A child, group, light or camera with physics mode set produces a `physicsWarnings` entry instead of silently ignoring it.

**D-26 Starter project changed.** Ball is at (-2, 6, 0), above Bouncer, so the starter's touching-and-Chime script runs when the project is started. The flag script resets X to -2. The original position is not recorded in this session. The earlier expectation that the Ball would rest on top of Bouncer was wrong (it rolls off), so the physics test checks the touch, not a rest.

**D-27 Engine audio injection.** `Engine` takes an `EngineAudio` interface in its constructor, so tests inject `FakeAudio` (`tests/helpers/fakes.ts`). Production uses `WebAudioHost`.

**D-28 Electron shell design.** Sandboxed `BrowserWindow` (`sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`). The preload exposes only `window.biteDesktop` = `{ isDesktop, saveFile(fileName, bytes, mime) }`. IPC `bite:save-file` checks the sender is the main window, limits size to 256 MB, sanitises the name with `safeFileName`, and opens a native save dialog. Navigation outside `file://` is blocked, `window.open` is denied, and permission requests are denied. Packaging targets: AppImage (Linux), NSIS (Windows), DMG (macOS) via `electron-builder.yml`, output to `release/`. The web bundle is copied from `dist/web` by `scripts/build-desktop.mjs`.

**D-29 Scripts.** `npm test` (Vitest), `npm run test:e2e` (Playwright), `npm run desktop:start` (build, then `electron .`), `npm run desktop:dist` (build, then electron-builder). The e2e README (`e2e/README.txt`) documents the environment overrides `BITE_CHROMIUM_PATH`, `BITE_CHROMIUM_ARGS`, `BITE_E2E_PORT`.

## 6 (update). Current Project Status (supersedes the Section 6 table above)

| Area | Status | Evidence |
|---|---|---|
| Repository log (this file) | Completed; updated | Sections 1–10 and Appendix A present |
| Web scaffold / build / dev | Completed | `tsc -b`, `eslint .`, `vite build` exit 0 |
| Block editor (Blockly) + toolbox | Completed | Blockly tests 9/9; e2e Ball-selection test |
| Block runtime (interpreter, threads, Stop) | Completed | Engine integration 10/10 |
| 3D stage (render, select, gizmo, camera) | Completed for listed features | Screenshot; e2e add/delete object |
| Physics (Rapier) | Completed | Unit/integration physics tests |
| Content creation & hierarchy | Completed | e2e add/delete object |
| Audio (assets, playback, blocks) | Completed (playback unverified with sound on) | Unit tests; e2e "Enable audio first" |
| Project management (IndexedDB, autosave) | Completed | Storage tests; e2e persistence and delete tests |
| Export/import `.bite` | Completed | Package tests; e2e export/import/malformed |
| Desktop (Electron) code and bundle | Completed (bundle) | `dist/desktop` written; `tsc -p tsconfig.node.json` exit 0 |
| Desktop packaging (electron-builder) | **Not verified** | Failed: TLS error (B-01) |
| Desktop launch | **Not verified** | Electron binary cannot be downloaded (B-01) |
| Tests (unit/integration/e2e) | Passing | 7 files / 96 unit+integration tests; 9/9 e2e |
| Pull request | In progress (see Section 9) | — |

## 7 (update). Verification evidence (actual runs, 2026-10-09)

Environment: Linux x64 sandbox; Node/npm from the sandbox; browser for e2e = headless Chromium 153 extracted from `@sparticuz/chromium` (`BITE_CHROMIUM_PATH=/tmp/chromium`, with `--no-sandbox --no-zygote`, `LD_LIBRARY_PATH` for its libraries). Playwright's own browser download is blocked in this sandbox. This is a local verification tool, not a product dependency.

- `npx tsc -b`: exit 0.
- `npx eslint .`: exit 0.
- `npx vitest run`: 7 files, 96 tests, all pass (unit, integration, jsdom Blockly tests).
- `npx vite build`: succeeds. Warning: main JS chunk ~6 MB (about 2.1 MB gzip). Code-splitting is a follow-up.
- `npx tsc -p tsconfig.node.json`: exit 0.
- `node scripts/build-desktop.mjs`: writes `dist/desktop` (`main.cjs`, `preload.cjs`, `web/`). Not launched.
- Playwright e2e with `BITE_CHROMIUM_PATH=/tmp/chromium`: **9/9 pass** on Chromium (Linux). Tests: starter opens without console errors; selecting the Ball opens its scripts and the project runs (regression for IMPL-009); run/stop/reset state; new project autosaves and persists across reload; delete needs exact typed name; export downloads a `.bite`, import creates a project; malformed import is refused and the open project is unchanged; built-in sounds can be added and preview only after audio is enabled; object add/delete via hierarchy.
- Screenshot (`/tmp`, not in repo): Ball's script renders in the editor after the fix; Diagnostics shows the expected runtime error when audio is off ("audio is turned off in this browser. Click Enable audio…").
- Physics probe values: see D-24 (measured earlier in this session; the probe script was deleted).

## 8 (update). Known defects, blockers, unverified behaviour

- **B-01 (blocker, unchanged):** Electron binary download fails in this sandbox (GitHub release CDN unreachable, curl exit 35). `electron --version` fails. `electron-builder --linux dir` fails with a TLS error. **Consequence: the desktop app has not been launched and no installer has been produced in this environment. Desktop status is "code and bundle only".** Next verification: run `npm run desktop:start` and `npm run desktop:dist` on a machine with GitHub access, on each target OS (Linux AppImage, Windows NSIS, macOS DMG). Per-OS status is therefore: Linux — not verified; Windows — not verified; macOS — not verified.
- **B-02:** `npm install` runs the Electron postinstall download. In this sandbox it must be run with `ELECTRON_SKIP_BINARY_DOWNLOAD=1`. Documented in the README.
- **B-03 (not covered by automated tests):** gizmo drag, block drag in the editor, camera orbit, and physics run through the UI. Listed as optional e2e expansion.
- **B-04 (not covered by automated tests):** the failure path of a script that cannot be opened (IMPL-010) is implemented but has no automated test; the cause in the original defect was a missing input, which is now covered by the definition check.
- **B-05 (not verified):** a notice toast (`.notices`) overlapping the camera controls. Placement is set at `bottom: 190px; right: 16px` in `src/styles.css`. A screenshot with a live notice was not captured in this session, so the overlap is **unverified**.
- **B-06 (not verified):** audible playback. Headless Chromium has no user gesture, so sounds are only tested with the fake audio host and the locked state. Real playback requires a manual check in a browser.
- **B-07 (not verified):** WebGL rendering on real GPUs. Tested only with SwiftShader in headless Chromium.
- **B-08:** main JS bundle is large (~6 MB). Not a functional defect; code-splitting is a follow-up.

## 9 (update). Outstanding requirements and next actions

- Pull request: open from `arena/d33f3a97-bite` into `main`, with the verification evidence in Section 7 and the blockers in Section 8. **Do not merge, release, or tag.**
- Open questions for the user (the user asked to be asked anything for the best app; these are not blocking and the decisions above stand until answered):
  1. Stop vs Reset semantics (D-08): keep "Stop keeps live state; Reset restores authored state", or switch to Scratch-style "Run continues from current state"?
  2. Export extension `.bite` (ZIP): keep, or rename?
  3. Should glTF/GLB import be in this beta, or deferred to a later version?
  4. Desktop priority: which OS must be verified first (Linux AppImage is the only one buildable here, but not runnable here either)?
  5. Should the stage camera be automatic when a camera object exists, or always opt-in?
  6. AGENTS.md: none exists in this repository. I have not created one. Ask before adding one.

## 10 (update). Corrections and changes to earlier decisions

- **C-01:** Section 6 (original) said "Not started" for every area. Superseded by the table above.
- **C-02:** Section 8 (original) said desktop code "will be type-checked, built… and main-process logic unit-tested with a mocked Electron API". The mocked-Electron unit tests for `safeFileName` and the IPC sender guard are **not yet written**. The type-check and bundle were done.
- **C-03:** Starter Ball is at (-2, 6, 0) (D-26).
- **C-04:** The earlier physics expectation that the Ball would rest on top of Bouncer was wrong; it rolls off. The test asserts the touch (D-26).
- **C-05:** `control_forever`, `control_repeat`, `control_if` and `control_repeat_until` were shipped with a missing `{SUBSTACK}` placeholder (IMPL-009). Corrected; the regression test covers every block definition.
- **C-06:** Stale dropdown values were documented as "kept", but the implementation replaced them (IMPL-011). Corrected.
