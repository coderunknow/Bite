# DESIGN_LOG.md — Bite Studio (Scratch-like 3D Visual Programming Studio)

> Persistent record of user intent, design decisions, implementation history and verified status.
> This log is **append-only by default** (see Section 10 for the correction policy). Historical entries
> are preserved; status changes are recorded as new dated entries. Read Section 6 (Current Project Status)
> and Section 9 (Outstanding Requirements) first when resuming work.

---

## 1. Project Purpose and Design Philosophy

**Purpose.** Bite Studio is a Scratch 3.0–inspired visual programming environment in which the programmed
objects live in a real-time 3D scene with physics, sound, content-creation tools and project management.
A user should be able to build a small interactive 3D experience without writing text code, using
drag-and-drop blocks.

**Philosophy (derived from the original prompt; must not be undermined by later work):**

1. *Familiar to Scratch 3.0 users*: block toolbox by category, snapping drag-and-drop, Run / Stop controls, project workflow.
2. *Real 3D*: objects are real 3D meshes; every block that is displayed has real runtime behaviour in the 3D scene.
3. *Coherent conventions*: one coordinate system, one time model, one physics ownership model, documented and used
   consistently across editor, runtime, physics and inspector.
4. *Responsive*: a script with an infinite loop must never freeze the page; Stop must always work.
5. *Honest status*: nothing is marked complete without evidence; unverified targets are reported as unverified.
6. *Shared logic*: web and desktop share one application codebase; the desktop shell only adds native integration.
7. *Data safety*: projects are persistent user data. Malformed imports never corrupt the open project; unsaved work is protected.

## 2. Original User Prompts and Design Intent

### P-001 — Initial task: "Build a Scratch-Like 3D Visual Programming Studio from Scratch"

- **Date recorded:** 2026-10-09 (UTC). **Branch:** `arena/d5e7b64a-bite` (fixed for this session), base `main` @ `f77e3ac`.
- **Relationship:** first entry; initial scope definition.
- **Version label supplied by user:** `v0.1.0-beta1` (appears at the end of the prompt).

**Original user request (verbatim):**

<details open>
<summary>Full original prompt text (verbatim, preserved for continuity)</summary>

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
  
**Begin by inspecting the repository and environment, then implement, test, fix, verify, and open the pull request. Do not return only a plan or a recommendation.**  
  
17. Mandatory Design Intent and Project History Log — DESIGN_LOG.md  
`DESIGN_LOG.md` is the project's persistent record of original user intent, design philosophy, prompts, implementation history, and actual completion status. It must remain useful across multiple prompts, coding sessions, agents, branches, and pull requests.  
  
**Creating and maintaining this file is mandatory. Do not treat it as optional documentation.**  
  
(Sections A–I of the logging policy follow in the original prompt: inspect and initialize the log; record the original intent of every user prompt; track actual implementation progress with statuses Completed / Implemented, not verified / In progress / Not started / Blocked / Failed / Deferred; update the log throughout; preserve continuity across agents and sessions; append-only history and corrections; required log structure of ten sections; Scratch 3D-specific requirement tracking; pull request and completion requirements.)

THINK CAREFULLY, ULTRA EFFORT.  
  
Please create a useful plan before coding.  
  
Test and fix bugs clearly.  
  
Ask me anything for the best app.  
  
Finally, create a PR and check for any bug.  
  
This version is v0.1.0-beta1.
```

</details>

**Intended outcome (user's goal, separate from agent interpretation):** A usable, packaged web + desktop 3D
Scratch-like studio where a non-programmer-by-text can build and run an interactive 3D scene using blocks, with
physics, sound and persistent projects; delivered as a pull request with honest verification evidence.

**Agent interpretation (not user-approved, recorded for transparency):** see Section 4 (D-series decisions).

## 3. Confirmed Requirements and Constraints

Sourced from the original prompt (P-001). These are user requirements, not agent assumptions.

| ID | Requirement | Source |
|----|-------------|--------|
| R-01 | Web app: reproducible dev setup, production build, verified in a real browser | P-001 §11 |
| R-02 | Desktop app: real packaged build (not a browser link); main workflows available; document build/launch | P-001 §11 |
| R-03 | Block toolbox by category; drag, snap, edit, add/remove blocks; save/restore scripts | P-001 §5 |
| R-04 | Events: green flag, supported key press, broadcast, when-I-receive | P-001 §5 |
| R-05 | Motion: move forward relative to orientation; set/change X/Y/Z; set/change rotation; documented coordinate conventions | P-001 §5 |
| R-06 | Looks: show/hide, appearance, size/scale, colours, simple speech/status text | P-001 §5 |
| R-07 | Control: wait, repeat N, repeat forever, if, if/else, stop this / all scripts | P-001 §5 |
| R-08 | Infinite loops must not freeze the UI; Stop must always work | P-001 §5 |
| R-09 | Sensing: keyboard, contact/collision, distance, scene/runtime info | P-001 §5 |
| R-10 | Operators: arithmetic, comparison, boolean, random | P-001 §5 |
| R-11 | Variables: create, read, set, change; clear scope rules shown in UI | P-001 §5 |
| R-12 | Sound: play, play-and-wait, stop, volume control | P-001 §5, §9 |
| R-13 | Every displayed block has real runtime behaviour | P-001 §5 |
| R-14 | Real-time 3D stage: camera controls, selection, lighting, materials, transforms, feedback | P-001 §6 |
| R-15 | Editor camera separate from runtime/play camera | P-001 §6 |
| R-16 | Gravity, rigid bodies, collision shapes, collision response, ground, per-object mass etc. in inspector | P-001 §7 |
| R-17 | Physics + programmed movement interaction defined; no conflicting writers | P-001 §7 |
| R-18 | Tests: falling under gravity, resting on ground, colliding with another object | P-001 §7 |
| R-19 | Content creation: primitives, select/rename, transforms, colours/materials, duplicate/delete, hierarchy, lights/cameras, physics props | P-001 §8 |
| R-20 | glTF/GLB import: optional; must not compromise required features | P-001 §8 |
| R-21 | Audio: add/select sound assets; playback, stop, volume; gesture gating UI; graceful errors; no remote service | P-001 §9 |
| R-22 | Projects: new, rename, save, open, duplicate, delete with safeguards, autosave/recovery, export/import (portable, self-contained) | P-001 §10 |
| R-23 | Documented project format; malformed input never silently corrupts current project | P-001 §10 |
| R-24 | Tests: unit, integration, E2E; build/lint/type checks; report exact limitations | P-001 §13 |
| R-25 | PR with description per §15; no merge, no release, no tag | P-001 §15 |
| R-26 | This log maintained per §17 | P-001 §17 |
| R-27 | Version label `v0.1.0-beta1` | P-001 (end of prompt) |
| R-28 | Always work on branch `arena/d5e7b64a-bite`; do not switch branches | System instruction |

**Constraints / environment facts (verified by agent, see Section 7):**

- Repository `coderunknow/Bite` initially contained only `README.md` (`# Bite`). No `AGENTS.md`/`AGENT.md` exists → no
  agent-instruction conflict; no change to such a file is needed.
- Sandbox: Node 22.22.3, npm 10.9.8, Python 3.11, git, gh 2.23. No browser, no X server, no `apt` access.
- Reachable hosts: `registry.npmjs.org`, `pypi.org`, `files.pythonhosted.org`, `github.com` (HTTP 302 only; release-asset
  hosts `objects.githubusercontent.com` and `cdn.playwright.dev` are NOT reachable).
- Electron's binary is downloaded from GitHub release assets at install time → **cannot be fetched in this sandbox**.
  Shared system libraries needed by Electron/Qt WebEngine (libnss3, GTK, GL/EGL, ALSA, libgbm, libdbus) are absent.
- A Chromium 153 binary is available via the npm package `@sparticuz/chromium` (kept **outside** the repo in `/tmp/tools`);
  it runs headless with WebGL2 (SwiftShader) once its bundled `al2023` shared libraries are on `LD_LIBRARY_PATH`.

## 4. Design Decisions and Rationale

Decisions are numbered `D-xxx`. Each has a status: *Adopted* (in effect), *Superseded* (see later entry), or *Proposed*.

| ID | Decision | Rationale | Status |
|----|----------|-----------|--------|
| D-001 | Stack: TypeScript + Vite + React 19 for the application shell; a single codebase for web and desktop. | Shared logic (R-01/R-02, P-001 §11). React suits panel-based UI; Vite gives fast reproducible dev/build. | Adopted (see D-002 for the stack pin) |
| D-002 | Versions pinned at the latest stable on npm on 2026-10-09: vite 8.3, @vitejs/plugin-react 6, react 19.3, typescript 5.9 (TypeScript 7 native preview not used), vitest 4.1, three 0.186, blockly 13.3, @dimforge/rapier3d-compat 0.21, zustand 5, fflate 0.8, fake-indexeddb 6, @playwright/test 1.64, electron 44, electron-builder 26. | Current, maintained releases. TypeScript 7 is a new toolchain generation; 5.9 is the mature line. | Adopted |
| D-003 | Block editor: **Blockly 13** (Google, Apache-2.0) rendered inside React, with a Scratch-like custom block set/theme. Blockly is the editor only; scripts are converted to our own **BlockNode** model. | Drag, snap, flyouts, field editing and undo are hard to get right; Blockly is a mature library. Scratch's own `scratch-blocks` is a Blockly fork not published as a usable npm package, and reusing a Scratch application is forbidden. | Adopted |
| D-004 | Runtime is independent of Blockly: it interprets our BlockNode JSON with JS generators (one generator per script thread). | Generators give cooperative scheduling: loops `yield` each frame so the UI never freezes; `gen.return()` gives reliable Stop with `finally` semantics; execution is testable without a DOM. | Adopted |
| D-005 | 3D rendering: **three.js** with a React-hosted canvas. Editor uses OrbitControls + TransformControls; play mode uses a separate stage camera. | De-facto web 3D library; compatible with integrated GPUs via WebGL2; examples provide gizmo/orbit controls. | Adopted |
| D-006 | Physics: **Rapier** (`@dimforge/rapier3d-compat`, WASM embedded as base64, deterministic fixed-step). | Rust-based, actively maintained, cross-platform, works without SharedArrayBuffer or extra fetches (works in Electron and file://). | Adopted |
| D-007 | Coordinate conventions (see Section 4.1 below). | Required by P-001 §5. | Adopted |
| D-008 | Simulation time model: fixed 60 Hz simulation tick (`dt = 1/60 s`); `wait` and tweens use simulation time; rendering is decoupled and on-demand. | Determinism for tests; consistent physics; avoids spiral-of-death by capping substeps per animation frame. | Adopted |
| D-009 | Physics ownership (see 4.2). Script-written poses are pushed into physics as teleports (dynamic) or kinematic targets; physics results overwrite the pose only for dynamic bodies; velocities are set by explicit physics blocks only. | Requirement P-001 §7 "avoid conflicting systems that unpredictably overwrite one another". | Adopted |
| D-010 | Play semantics (see 4.3): Run snapshots the authored scene; Stop freezes scripts and physics; Reset restores the authored snapshot and returns to editing. | Unity-like separation between authored state and play state; keeps the inspector's edits meaningful. | Adopted (product default; see Section 9 question Q-2) |
| D-011 | Audio: WebAudio `AudioContext` behind an `AudioEngine` interface; decoded buffers cached per asset; a user gesture ("Enable audio") is required by browsers and is surfaced in the UI. Built-in procedurally generated sounds (WAV) are stored as ordinary project assets so no remote audio service is needed. | P-001 §9; browser autoplay policy. | Adopted |
| D-012 | Persistence: **IndexedDB** via a small in-house wrapper (no dependency). Each project has a *working copy* (autosaved, debounced) and a *saved snapshot* (explicit Save). Unsaved state is visible; "Revert to saved" is available. | Scratch-like Save semantics with autosave protection (P-001 §10). | Adopted |
| D-013 | Portable project format `.bite` = ZIP (fflate) containing `project.json` (format v1) + `assets/<assetId>.<ext>`. Plain `project.json` import is also accepted for projects without sounds. Import always creates a *new* project; it never overwrites the open one. | Self-contained packages; no absolute paths; protects current work (P-001 §10). | Adopted |
| D-014 | Desktop shell: **Electron** with electron-builder packaging (AppImage, deb, NSIS, dmg). Shared renderer code; the desktop preload exposes only file dialog/IO primitives. | Industry standard for web-tech desktop apps with WebGL/WebAudio. The binary cannot be downloaded in this sandbox, so desktop *launch* is not verifiable here (see Section 8). | Adopted — verification limited (see D-014a) |
| D-014a | Because Electron cannot be fetched/launched in this sandbox, desktop **build verification** is limited to: TypeScript compilation of main/preload, unit tests of the IPC/file-dialog layer with a mocked `electron` boundary, and the renderer bundle being verified in Chromium. The packaged app launch is **not verified**. | Honest reporting per P-001 §11/§13. | Adopted |
| D-015 | Browser E2E testing uses Playwright Test with a Chromium executable supplied by environment variable `BITE_CHROMIUM_PATH` (falls back to Playwright's bundled browser when unset). | Lets CI or developers use their own browser; this sandbox uses the sparticuz build. | Adopted |
| D-016 | Scope of blocks — see Section 5 (Block catalog). Stage (global) target has a restricted toolbox; objects get the full toolbox. | Blocks without a valid target would be dead UI (R-13). | Adopted |
| D-017 | Parenting exists for grouping and transform inheritance (visual). Physics is simulated only for top-level objects; children with physics settings get a visible warning. Scripts/inspector use local transforms; sensing uses world transforms. | Full hierarchical physics adds complexity disproportionate to v0.1 scope; limitation disclosed. | Adopted |
| D-018 | glTF/GLB import is **deferred** to a later slice unless time allows after core verification (R-20 is optional). | P-001 §8 explicitly makes it optional. | Adopted — see Section 9 |

### 4.1 Coordinate system and conventions (D-007)

- Right-handed, **Y-up**, units are **metres**. The ground plane is `y = 0`. Default gravity is `(0, -9.81, 0)` m/s².
- Positions are `[x, y, z]` in metres. Rotations are stored and edited as **degrees**, Euler order **`YXZ`** (yaw about the
  world Y axis is applied first, then pitch about local X, then roll about local Z). This keeps "yaw" (heading) intuitive
  when the object is pitched or rolled.
- **Forward** is the object's local **−Z** axis (the three.js convention, also used by `lookAt`). With yaw 0 an object faces −Z,
  i.e. away from the default stage camera at +Z.
- **Positive yaw turns counter-clockwise** when viewed from above (+Y). "Turn right by N" therefore subtracts N from yaw;
  "turn left" adds N. Documented in the block tooltips and the user guide.
- Scale is a per-axis multiplier. The "size" block works in percent and sets uniform scale (`size/100`).
- Inspector, blocks and the project file all use the same convention; the viewport gizmo uses world or local space as
  selected in the toolbar.
- **Local vs world:** object transforms are *local* to the parent (or world when top-level). Sensing blocks (distance, touching,
  "position of") report *world* positions. This is documented in the block tooltips.

### 4.2 Physics ownership model (D-009)

Each simulation tick (fixed `dt = 1/60 s`) runs in this order:

1. **Scripts run** and may write object poses (position/rotation/scale) and physical intents (impulse, velocity set).
2. **Script-to-physics push**: for each object whose pose was written by scripts since the last push:
   - dynamic body → teleport the body to the pose (`setTranslation/Rotation`), keeping its linear/angular velocity;
   - kinematic body → set the kinematic target for this step (`setNextKinematicTranslation/Rotation`);
   - static body → teleport (documented as "moved static"); no velocity.
3. Pending impulses/velocity sets are applied to dynamic bodies.
4. **Physics step** (Rapier, gravity from scene settings, per-body gravity scale).
5. **Physics-to-object pull**: dynamic bodies overwrite the object's pose with the simulated pose. Kinematic and static
   bodies are not written back.
6. Scripts observe the pose produced by step 5 on the next tick.

Consequence: a script that moves a dynamic body every tick by teleport will fight gravity—this is the expected, documented
behaviour; the blocks "set velocity" / "apply impulse" are the physically consistent options.

### 4.3 Play session semantics (D-010)

- **Edit mode:** the authored project is the scene. The viewport shows it; no physics or scripts run. Editing is enabled.
- **Run (▶):** if editing, snapshot the authored scene, build physics bodies from the snapshot and start green-flag scripts.
  If already stopped in a session, Run restarts green-flag scripts from the current state (Scratch-like).
- **Stop (■):** halts all scripts, stops sounds, freezes physics and time. The scene keeps its current state for inspection.
  Editing is disabled until Reset.
- **Reset (⟲):** halts everything, discards the runtime state, restores the authored scene and returns to edit mode.

### 4.4 Product defaults and assumptions (recorded 2026-10-09)

These were chosen without asking, because the user asked for the best app and to decide defaults and record them.
Each can be changed; the change would be a Section 10 entry.

- **A-01 Pre-run checks do not block Run.** Problems found before Run (deleted object, message, variable or sound
  references; a sound that is missing from storage or fails to decode; physics on a child object) are written to the
  Console and marked on the blocks. A broken block that is never reached is harmless. A broken block that runs still
  reports its error when it runs.
- **A-02 Autosave.** Edits are written to the working copy 700 ms after the last change. Explicit Save copies the working
  copy to the saved snapshot. "Dirty" means the working copy differs from the saved snapshot. Reload with a dirty project
  shows a recovery banner with Keep and Discard.
- **A-03 Rename is metadata.** Renaming a project also renames its saved snapshot, so a rename alone never marks a
  project as unsaved.
- **A-04 Duplicate.** Duplicating copies the working copy and marks the copy as saved. The name gets " (copy)".
- **A-05 Delete.** Deleting an object removes its children. Deleting a project requires typing its name. Deleting the
  open project opens the most recently changed remaining project, or creates a starter project.
- **A-06 Import.** Every import creates a new project with a new id. An existing project is never overwritten.
- **A-07 Export stamp.** Exported `project.json` records the writing app version in `appVersion`.
- **A-08 Sound limits.** The app accepts a sound up to 25 MB; the format allows 512 MB per asset. Sounds are stored in
  browser storage (IndexedDB), with an in-memory fallback that warns the user the data is lost on close.
- **A-09 Blockly.** Blockly's icons are served from the app (`public/blockly/media`, Apache-2.0, from Blockly 13). Its
  UI click sounds are off, so the editor makes no remote requests (the Blockly CDN is not used).
- **A-10 Keyboard and pointer during Play.** Keys and pointer position are read from the window while Run is active.
  Typing in an input field does not reach the project. Space and arrow keys do not scroll the page during Play.
- **A-11 Play camera.** The play camera is the scene camera chosen in Stage settings. With none chosen, the stage camera
  (position, target and field of view stored in the project) is used.
- **A-12 Scale and rotation.** Rotation is stored in degrees (Euler, YXZ). Positive yaw turns counter-clockwise when
  viewed from above; "turn left" adds degrees, "turn right" subtracts them (see §4.1).
- **A-13 Development hook.** `window.__BITE__` exposes a read-only snapshot and a screenshot function for the browser
  tests. It is not part of the product UI and does not change project data.
- **A-14 Physics bundle size.** The physics engine (`@dimforge/rapier3d-compat`) inlines its WebAssembly, so the physics
  chunk is about 4.3 MB (1.7 MB gzip). Build output warns about chunk size. Left as is for beta; see Section 8.

### 4.5 Dependency installation: `legacy-peer-deps` (`.npmrc`)

- **Decision:** `.npmrc` sets `legacy-peer-deps=true`. `audit=false` and `fund=false` keep install output quiet.
- **Reason:** with the strict resolver, `npm install` fails. Reproduced on 2026-10-09 with npm 10.9.8 and the repository's
  `package.json` (`npm install --package-lock-only --ignore-scripts`, `legacy-peer-deps=false`), the exact output was:
  `npm error Cannot read properties of null (reading 'edgesOut')`. This is an npm arborist failure. The `.npmrc` comment
  attributes it to Blockly 13 declaring jsdom as a peer dependency with an optional `canvas` peer; that attribution
  was not separately verified.
- **Effect:** `jsdom` is listed explicitly in devDependencies, so the installed set is the same. Installation with the
  flag succeeded: `added 489 packages`.
- **Electron:** `ELECTRON_SKIP_BINARY_DOWNLOAD=1` was used for the install in this sandbox, because the Electron binary
  is downloaded from GitHub release assets (see Section 8).

## 5. Block catalog (initial scope, D-016)

The catalog (single source of truth in code: `src/blocks/catalog.ts`) is the authoritative list; this section summarises it.
Status of each category is in Section 6.

- **Events:** when green flag clicked; when key pressed; when this object clicked; when I receive; broadcast; broadcast and wait.
- **Motion (objects):** move N units forward; turn right/left N degrees; go to x y z; glide over N seconds to x y z; set/change
  position axis; set/change rotation axis; point towards object; reporter: position of axis; reporter: rotation of axis.
- **Physics (objects):** apply impulse (x,y,z); set velocity (x,y,z); reporter: velocity axis; reporter: is touching ground → uses
  "touching" semantics.
- **Looks (objects):** show; hide; reporter: is visible; set colour; set opacity; set size %; change size %; set material
  (metalness/roughness); say for N seconds; clear speech.
- **Sound:** start sound; play sound until done; stop sound; stop all sounds; set master volume %; change master volume by;
  reporter: master volume %.
- **Control:** wait N s; wait until; repeat N; repeat forever; repeat until; if; if/else; stop this script; stop all; stop other
  scripts of this object.
- **Sensing:** key pressed?; mouse down?; touching object?; distance to object; attribute of object; timer; reset timer.
- **Operators:** + − × ÷; mod; round; math function (abs, floor, ceil, sqrt, sin, cos, tan); pick random a to b; <, =, >; and, or, not; join; length of text.
- **Variables:** variable reporter; set variable to; change variable by.
- **Scene (stage only):** set gravity (x,y,z); set background colour; use camera object; reset camera.

Each block listed above is implemented in the runtime (Section 6 gives status). Anything not listed is out of scope for v0.1.0-beta1.

## 6. Current Project Status

**As of 2026-10-09 (session start, agent working on `arena/d5e7b64a-bite`):**

| Area (R-ids) | Status | Evidence |
|---|---|---|
| Repository bootstrap, DESIGN_LOG (R-26) | In progress | This file created |
| Block editor & serialization (R-03, R-13) | Not started | — |
| Block runtime / control / events (R-04, R-07, R-08) | Not started | — |
| Motion/Looks/Sensing/Operators/Variables blocks (R-05, R-06, R-09, R-10, R-11) | Not started | — |
| Sound blocks & audio engine (R-12, R-21) | Not started | — |
| 3D stage & editor camera (R-14, R-15) | Not started | — |
| Physics (R-16, R-17, R-18) | Not started | — |
| Content creation & hierarchy (R-19) | Not started | — |
| glTF/GLB import (R-20) | Deferred (D-018) | — |
| Project persistence, export/import (R-22, R-23) | Not started | — |
| Web production build (R-01) | Not started | — |
| Web browser E2E (R-01, R-24) | Not started | — |
| Desktop build/package (R-02) | Not started | — |
| Desktop launch verification (R-02) | Not started — **blocked by environment** (D-014a) | — |
| Pull request (R-25) | Not started | — |

**Status update (end of session, 2026-10-09):** the table above is the start-of-session snapshot and is kept for the
record. The current status is in Section 8.2 and the command record is in Section 12.

## 7. Verification Evidence and Test Results

*(Populated during implementation. Each entry lists the exact command, the date and the actual outcome.)*

- 2026-10-09 — Environment probe: `node -v` → v22.22.3; `npm -v` → 10.9.8; `python3 --version` → 3.11.2; `gh` 2.23.0.
- 2026-10-09 — Browser probe: `@sparticuz/chromium@153` + `playwright-core@1.64` launched Chromium 153.0.8010.0 headless with
  `LD_LIBRARY_PATH=/tmp/al2023/lib:/tmp`; WebGL2 context created (title "webgl2 ok"). Confirms E2E feasibility.
- 2026-10-09 — Electron probe: `https://github.com/electron/electron/releases/...` → HTTP 302 to a host that is not reachable
  (`objects.githubusercontent.com` → no connection). Electron binary cannot be installed here.
- 2026-10-09 — Shared-library probe: `libnss3`, `libgtk-3`, `libGL`, `libEGL`, `libasound`, `libgbm`, `libdbus-1`, `libxkbcommon`
  not present on the system; apt is unreachable.

## 8. Known Defects, Blockers, and Unverified Behavior

- **BLOCKER (environment) — Desktop launch not verifiable here.** Electron binary cannot be downloaded (D-014a). Desktop build
  steps that do not need the binary (TypeScript, Vite renderer bundle, unit tests of the desktop IPC layer) can be run.
  Desktop launch and packaging on Windows/macOS/Linux are **unverified**.
- Tested operating systems: **Linux x86_64 (Debian 12) — web/browser only** (Chromium 153 headless). No macOS/Windows verification.

### 8.1 Items found during verification (2026-10-09)

- **Corrected during verification:** the `.bite` export wrote `appVersion` as a copy of the old value. It now records the
  writing app's version (`APP_VERSION`), see A-07.
- **Corrected during verification:** Blockly fetched its click sounds and icon sheet from `static.blockly.com`, which
  violated the CSP and the no-remote-service rule. Fixed: local media and sounds off (A-09). Found by the browser test.
- **Corrected during verification:** the audio engine ignored the volume argument that the runtime passed to `play()`.
  Each playback now has its own gain node, and the engine clamps it to 0..1.
- **Corrected during verification:** `rename` left the saved snapshot with the old name, so a rename marked the
  project unsaved (A-03).
- **Corrected during verification:** the variable dropdown offered only stage variables. It now offers the selected
  object's variables and the stage's variables.
- **Corrected during verification:** the in-app Stop path called `audio.close()` on unmount, which would break React
  StrictMode's double mount. The audio device is now released only by `closeAudio()`.
- **Corrected during verification:** the `app://` path check was tested for traversal. URL normalisation removes plain
  `../` and `%2e%2e` before the check; encoded slashes (`%2f`) survive it. The unit test covers both kinds.
- **Corrected during verification:** `docs/PROJECT_FORMAT.md` was written after the code referred to it. Several
  statements were checked against `src/model/validate.ts` and `src/storage/bundle.ts` and corrected before commit
  (unknown keys are ignored, not rejected; unknown opcodes are rejected).

### 8.2 Verification status summary (2026-10-09, end of session)

| Area | Status |
|---|---|
| Web production build (R-01) | Verified (Section 12) |
| Web browser E2E (R-01, R-24) | Verified, 14 tests, Chromium 153 on Linux |
| Desktop build (TypeScript, shell compiled) (R-02) | Verified (`electron:build`) |
| Desktop launch (R-02) | **Not verified** — Electron binary blocked (D-014a) |
| Desktop packaging with electron-builder (R-02) | **Not verified** — needs the Electron binary |
| Windows / macOS | **Not verified** |
| Blockly drag-and-drop editing | **Not verified by test**: the tests check rendering and the starter script. Block drag, drop and dropdown changes are not automated. |
| Read-only Blockly during Play | Implemented (`setReadOnly`); **not verified by test** |
| Audible sound output | **Not verified** (headless browser, no audio device). Playback is unit-tested against a fake AudioContext. |
| Physics chunk size (A-14) | Known; build warning |
| Dependency audit | Not run (`audit=false`) |

## 9. Outstanding Requirements and Next Actions

**Open questions for the user (non-blocking; defaults applied, see Section 10 if changed later):**

- Q-1: Desktop shell — Electron (current default, D-014) or another shell (for example Tauri, which needs a Rust toolchain)?
- Q-2: Stop semantics — defaults per D-010 (Stop freezes, Reset restores). Prefer Scratch-style "Stop keeps the moved state and Run continues"?
- Q-3: Scope for glTF/GLB import (D-018) — include in v0.1.0-beta1 or defer to v0.2?
- Q-4: Is English-only UI acceptable for v0.1.0-beta1?

**Next actions:** see the implementation plan in Section 11.

### 9.1 Status of the open questions (2026-10-09)

- Q-1 (desktop shell): Electron is implemented (`electron/`), with a sandboxed renderer, context isolation and no preload.
  The shell is compiled (`npm run electron:build`) but has not been launched (Section 8).
- Q-2 (Stop semantics): implemented per D-010 (Stop freezes, Reset restores). Not changed.
- Q-3 (glTF/GLB import): deferred to v0.2, as planned (D-018).
- Q-4 (English-only UI): English-only for beta. All UI strings are in the components.

## 10. Corrections and Changes to Earlier Decisions

*(None yet. Corrections are appended here with: entry id, what was incorrect, evidence, corrected information.)*

## 11. Implementation plan (vertical slices)

1. Scaffold: Vite+React+TS, Vitest, ESLint, Playwright config, npm scripts, README skeleton.
2. Model + validation + project store (IndexedDB) + export/import bundle — unit-tested.
3. Blockly editor + catalog + model bridge (round-trip tested) + toolbox per target.
4. Runtime interpreter (events, control, motion, looks, operators, variables, sensing) on LiveState — unit-tested with real scene adapter.
5. 3D viewport: scene manager, editor camera, selection, transform gizmo, primitives, lights, camera objects — tested via scene-manager unit tests + browser checks.
6. Physics (Rapier) integration with ownership model — tests for gravity, rest, collision, teleport, impulse.
7. Audio engine, built-in sounds, sound blocks, gesture gating — tests with boundary fake + browser check.
8. UI integration: toolbar, hierarchy, inspector, sound & variable panels, console, dialogs, splitters.
9. Web production build; Playwright E2E for core workflows; screenshots.
10. Desktop: Electron main/preload, IPC tests, electron-builder config; type-check; document unverified launch.
11. Final QA pass (lint, typecheck, tests, build, E2E), review diff, PR.

## 12. Build and Verification Record (2026-10-09)

Each row is a command that was run, with the exit code and the observed result.

| Command | Exit | Result |
|---|---|---|
| `npm install --legacy-peer-deps` (with `ELECTRON_SKIP_BINARY_DOWNLOAD=1`) | 0 | added 489 packages |
| `npm install` (strict, reproduction in a scratch dir, `--package-lock-only`) | 1 | `npm error Cannot read properties of null (reading 'edgesOut')` |
| `npx tsc -p tsconfig.json --noEmit` | 0 | no errors |
| `npx tsc -p tsconfig.electron.json` | 0 | `dist-electron/main.js`, `paths.js` |
| `npm run lint` (`eslint .`) | 0 | no problems |
| `npx vitest run tests/unit` | 0 | 8 files, 120 tests passed (runtime 41, model 17, storage 20, edit 9, catalog 2, audio engine 12, pre-run 15, Electron path mapping 4) |
| `npm run electron:build` | 0 | writes `dist-electron/package.json` with `"type": "commonjs"` |
| `npm run build` (typecheck + `vite build`) | 0 | `dist/` built; physics chunk 4.3 MB (warning) |
| `npx playwright test` (Chromium 153 headless, Linux, swiftshader WebGL) | 0 | 14 E2E tests passed |

E2E coverage (`tests/e2e/studio.spec.ts`): starter project loads with no console errors and no remote requests;
add, rename and move an object, then Save; numeric validation (empty and out-of-range values rejected); Run with real
physics (fall, Space jump with speech, Stop freeze, Reset restore); no runtime messages in the starter Run;
autosave, reload recovery banner and discard; code editor shows the cube script with local Blockly; projects
create, rename, duplicate, typed-name delete; export then import round trip; malformed `.bite` refused without
changing anything; sound add, persist across reload, remove; non-audio file refused; screenshots.

Screenshots (generated by the E2E run, committed under `docs/screenshots/`): `scene-edit.png`, `running.png`,
`code-editor.png`, `projects.png`.

**Not run:** `npm run desktop:start`, `npm run desktop:build`, `npm run desktop:dist`. Reason: the Electron binary
cannot be downloaded in this sandbox (Section 8, D-014a).

## Appendix A — Implementation History

- **2026-10-09** — Investigated repository (only `README.md`); environment probes (Section 7). Created this log (P-001).

- 2026-10-09 — Full session record in Section 12 (commands, exit codes, outcomes). Section 4.4 and 4.5 record product
  defaults and the dependency decision. Section 8.1 records corrections made during verification.
