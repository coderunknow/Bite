# Bite project format (`.bite`), version 1

Status: **v0.1.0-beta1**. Format name `bite-project`, `formatVersion` 1. The format is stable within
version 1: a future writer that adds optional fields keeps `formatVersion` 1; a breaking change bumps it,
and this app rejects files with a `formatVersion` it does not know.

## 1. Container

A `.bite` file is a **ZIP archive** (deflate or stored entries, standard central directory).

```
project.bite (zip)
├── project.json          required — the Project document (UTF-8 JSON)
└── assets/<id>.<ext>     one file per sound referenced by project.sounds
```

- `<id>` matches `^[A-Za-z0-9_-]{1,128}$` and equals the sound's `id` in `project.json`.
- `<ext>` is the sound's `extension` (see §4).
- Any other entry is ignored with a warning shown on import. Paths must be relative, must not contain `\`,
  must not be empty segments and must not contain `..`. Such an archive is rejected.

A **plain `project.json`** (no ZIP) is also accepted, but only for projects with **no sounds**. A plain file
that references sounds is rejected with a message asking for the `.bite` archive.

## 2. `project.json`

Top-level object (all keys required unless noted):

| Key | Type | Notes |
|---|---|---|
| `format` | `"bite-project"` | Fixed string. |
| `formatVersion` | `1` | Fixed number. |
| `appVersion` | string | Version of the app that wrote the file. Informational only. |
| `id` | string | Project id. On import a **new** id is always assigned. |
| `name` | string | Display name. |
| `createdAt`, `updatedAt` | ISO-8601 string | |
| `settings` | object | `gravity` (3 numbers), `backgroundColor` (`#rrggbb`), `shadows` (bool), `masterVolume` (0–100), `activeCameraId` (id or null), `stageCamera` (`position`, `target` as 3-number arrays, `fov` in degrees). |
| `stage` | object | `scripts` (array of Script), `variables` (array of Variable). |
| `objects` | array of SceneObject | Project order is the render and hierarchy order. |
| `messages` | array of string | Broadcast names. |
| `sounds` | array of SoundAsset | Built-in and user sounds. |

**Script**: `{ id, position: {x, y}, nodes: BlockNode[] }`. `nodes[0]` is the hat block.

**BlockNode**: `{ id, opcode, fields?, inputs?, stacks? }`
- `fields` — dropdown and other non-value fields, keyed by argument name (for example `"KEY": "space"`).
- `inputs` — value inputs: a literal (`string | number | boolean`) or a nested BlockNode (a reporter or boolean).
- `stacks` — C-block bodies: `{ "BODY": BlockNode[] }`.
- Opcodes are the catalog names (for example `event_whenkeypressed`, `physics_applyImpulse`). An unknown opcode makes the
  file invalid, so it is rejected on import.

**SceneObject**: `{ id, name, kind, parentId (id or null), visible, transform, material, light?, camera?, physics, variables, scripts }`
- `kind`: `cube | sphere | cylinder | plane | group | light | camera`.
- `transform`: `position`, `rotation` (Euler degrees, YXZ order), `scale` — each a 3-number array.
- `material`: `color` (`#rrggbb`), `opacity` (0–1), `metalness` (0–1), `roughness` (0–1).
- `light` (kind `light` only): `{ kind: "directional" | "point", intensity }`.
- `camera` (kind `camera` only): `{ fov }`.
- `physics`: `bodyType` (`none | static | dynamic | kinematic`), `shape` (`auto | box | sphere | cylinder`),
  `mass`, `friction`, `restitution`, `gravityScale`, `lockRotation`. Physics applies to top-level objects only.

**Variable**: `{ id, name, value }`; `value` is a number or a string.

**SoundAsset**: `{ id, name, extension, mimeType, byteLength, durationSec (number or null), builtIn }`.

Validation (`src/model/validate.ts`) checks types, ranges, string lengths and id references. Any field that is
not a finite number, colour, string or known value is an **error**, and the whole file is rejected with the list
of problems; nothing is partly imported. Keys the format does not define are **ignored** (not preserved).

## 3. Import rules

1. Files larger than **256 MB** are refused.
2. A ZIP whose total unpacked size exceeds **512 MB** is refused.
3. Every archive entry name must pass the path rules in §1; otherwise the whole archive is refused.
4. `project.json` must be present, valid JSON and valid per §2.
5. Every sound must have a matching `assets/<id>.<ext>` entry. A size mismatch with `byteLength` is a warning.
6. Import always creates a **new project** with a new id. An existing project is never overwritten.
7. Errors are shown in the app and nothing is written to storage.

## 4. Sound files

Allowed extensions: `wav`, `mp3`, `ogg`, `m4a`, `flac`, `aac`, `webm` (the validator). The app's own
"Add sound" accepts `wav, mp3, ogg, oga, flac, m4a, aac` and enforces **25 MB per file** at that point.
The format limit is 512 MB per asset. Decoding happens in the browser (WebAudio); a file the browser cannot
decode is reported before Run and its blocks report an error when they run.

## 5. Export

Export writes `project.json` (with `appVersion` set to the writing app) and every sound asset from browser
storage. If any sound's bytes are missing from storage, export stops and names the missing sound.

## 6. Versioning and compatibility

- Keys the format does not define are ignored on import and are not written back on export.
- Unknown files inside the archive are ignored with a warning.
- A future `formatVersion` 2 would be imported only by a version of the app that knows it.
