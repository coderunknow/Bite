# Bite

Bite is a Scratch-inspired 3D visual programming studio. Drag blocks to script objects in a real-time 3D stage with
gravity, collisions and sound, then press **Run**. Everything runs in the browser; the desktop app is the same code in
an Electron shell.

Version: **v0.1.0-beta1**. See `DESIGN_LOG.md` for the decisions, the verification record and the open questions.

## Features (beta)

- Blocks: events, control, motion, looks, sound, sensing, operators, variables, physics and scene blocks, with
  dropdowns that follow the project (objects, cameras, variables, messages, sounds, keys).
- 3D stage: cube, sphere, cylinder, plane, group, light and camera objects; transform gizmo; hierarchy; materials.
- Physics (Rapier): gravity, static/dynamic/kinematic bodies, colliders, mass, friction, bounce, impulses.
- Play: Run snapshots the authored project; Stop freezes; Reset returns to editing with the authored scene.
- Sound: built-in and imported sounds (WAV, MP3, OGG, FLAC, M4A, AAC), per-sound playback, master volume. Audio
  waits for a user gesture (the Run button or a key press).
- Projects: create, rename, duplicate, delete (typed confirmation), autosave to browser storage, explicit Save,
  Revert, recovery after reload, export and import of portable `.bite` files (see `docs/PROJECT_FORMAT.md`).

## Commands

| Command | What it does |
|---|---|
| `npm install` | Installs dependencies. Uses `legacy-peer-deps` (see DESIGN_LOG §4.5). |
| `npm run dev` | Dev server on `0.0.0.0:5173`. |
| `npm run build` | Typecheck and production web build into `dist/`. |
| `npm run lint` | ESLint. |
| `npm run typecheck` | TypeScript for the app and the Electron main process. |
| `npm test` | Unit and integration tests (Vitest). |
| `npm run test:e2e` | Browser tests (Playwright). Needs `npm run build` first. |
| `npm run electron:build` | Compiles the Electron main process into `dist-electron/`. |
| `npm run desktop:start` | Builds and starts the desktop app (needs the Electron binary). |
| `npm run desktop:dist` | Builds installers with electron-builder (`release/`). |

Environment variables for the browser tests: `BITE_CHROMIUM_PATH` (a Chromium executable to use instead of the
Playwright download), `BITE_E2E_NO_SERVER=1` (use an already running server), `BITE_SCREENSHOT_DIR`.

## Layout

```
src/app/        React UI, Zustand store, Studio controller, project actions
src/blocks/     block catalog, Blockly definitions and the Blockly <-> project bridge
src/runtime/    interpreter (generators per script), block opcodes, pre-run validation
src/physics/    Rapier integration
src/audio/      WebAudio playback behind the runtime's audio port
src/scene/      three.js view, gizmo and picking
src/editor/     pure project edit operations (rename, duplicate, delete, ...)
src/model/      project data model, defaults, validation
src/storage/    project service, IndexedDB and memory storage, `.bite` bundles
electron/       desktop shell (sandboxed renderer, app:// protocol)
tests/          unit, helpers, Playwright E2E
docs/           project file format, screenshots
```

## Known limits (beta)

- Desktop launch and packaging have not been verified on any operating system yet (see DESIGN_LOG §8).
- The 3D editor and the code editor have been tested in headless Chromium on Linux only.
- glTF/GLB model import is not included (deferred).
