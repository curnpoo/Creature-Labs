# AGENTS.md - PolyEvolve Lab

## Overview
PolyEvolve Lab is a browser + Electron creature-evolution simulator.

Current runtime is based on **Planck.js** physics plus a custom neuroevolution stack:
- Dense feed-forward controller (legacy mode)
- NEAT-style evolving topology controller (default mode)
- Normal mode simulation in main thread
- Turbo mode simulation in Web Workers with parity safeguards

The project favors iteration speed over framework-heavy tooling.

---

## Build / Run Commands

### Development
```bash
npm run dev          # Vite dev server (http://localhost:5173)
npm run app          # Electron desktop app
```

### Production build
```bash
npm run build        # Web build to dist/
npm run build:win    # Windows portable build
npm run build:mac    # macOS DMG build
```

### Tests (standalone scripts)
```bash
node tests/test-topology.js
node tests/test-neat-runtime.js
node tests/test-turbo-parity.js
node tests/benchmark-evolution.js
```

No Jest/Vitest runner is configured; tests are script-based.

---

## Current Architecture (Important)

### Simulation core
- `src/sim/Simulation.js`
  - Main app orchestration and generation lifecycle
  - Normal mode fixed-step loop
  - Turbo mode coordinator lifecycle
  - Runtime config propagation (`getSimConfig`, `syncCreatureRuntimeSettings`)

- `src/sim/Creature.js`
  - Creature body construction from node/constraint schema
  - Muscle actuation control loop
  - Fitness telemetry sampling
  - Ground-contact helpers (`isBodyGrounded`, strict contact checks)

- `src/sim/Physics.js`
  - Planck world/bodies/joints factory helpers
  - Scale constants and wrappers

- `src/sim/TurboCoordinator.js`
  - Worker orchestration for turbo generations
  - Result aggregation + diagnostics

- `src/sim/TurboWorker.js`
  - Off-thread generation evaluation
  - Shared-world batch stepping for parity behavior

### Evolution + NN
- `src/nn/Evolution.js` - population evolution for dense mode
- `src/nn/neat/*` - NEAT genome/speciation/mutation/crossover
- `src/nn/runtime/*` - runtime evaluators
- `src/nn/TopologyNeuralNetwork.js` - topology-aware dense model

### Scoring
- `src/sim/fitnessScore.js`
  - Distance-first score composition
  - Slip gating helpers
  - Shared scoring logic across normal/turbo

### UI layer
- `src/ui/Controls.js` - right panel controls and labels
- `src/ui/HUD.js` - top HUD stats
- `src/ui/ProgressChart.js` - training/testing charts
- `src/ui/Visualizer.js` - render/camera/overlays

---

## Physics + Behavior Notes

### Engine and units
- Physics engine: **Planck.js** (`planck-js`)
- Coordinate scale: `SCALE = 30` px per meter
- Fixed timestep: `CONFIG.fixedStepHz`

### Contact and anti-exploit behavior
- Creature self-collision suppression is done via connected-body checks
- Near no-slip grounded enforcement exists in runtime:
  - grounded tangential velocity damping to suppress drag-snap ratchet locomotion
  - configured in `src/utils/config/physics.js`

### Muscle model
- Muscles are prismatic-joint-driven actuators
- Command smoothing/rate limiting is used to avoid twitch instability
- Actuation behavior must stay consistent between normal and turbo paths

---

## Configuration System
All tunables live under `src/utils/config/` and are flattened via `src/utils/config/index.js`.

Key modules:
- `physics.js`
- `muscle.js`
- `energy.js`
- `fitness.js`
- `evolution.js`
- `visual.js`

When adding a new runtime tunable:
1. Add it to the appropriate config module
2. Export in `config/index.js` flattened defaults if Simulation uses flat defaults
3. Thread it through `Simulation` (`constructor`, `getSimConfig`, `syncCreatureRuntimeSettings`)
4. Mirror it in turbo payload/worker when relevant

---

## Code Style and Conventions
- Language: plain JavaScript (ES modules)
- Indentation: 2 spaces
- Semicolons: yes
- Imports: include `.js` extensions
- Naming:
  - `PascalCase` classes
  - `camelCase` functions/vars
  - `SCREAMING_SNAKE_CASE` constants

Prefer small focused edits; avoid broad refactors unless requested.

---

## Agent Guidelines (Project-Specific)

### 1) Preserve normal/turbo parity
Any simulation, scoring, or runtime-control change should be mirrored between:
- `Simulation` normal loop
- `TurboWorker` evaluation path

Run:
```bash
node tests/test-turbo-parity.js
```
after parity-sensitive changes.

### 2) Avoid hidden physics hacks
Do not introduce non-physical teleports or correction forces unless explicitly requested.
Keep behavior explainable and contact-driven.

### 3) Keep scoring and physics concerns separate
If the user requests physics realism, prefer physics-layer fixes over score shaping.

### 4) Validate with build + targeted scripts
For most changes:
```bash
npm run build
node tests/test-turbo-parity.js
```

### 5) Respect existing worktree state
The repo may be intentionally dirty. Do not revert unrelated user changes.

---

## Common Pitfalls
- Updating only normal mode and forgetting turbo worker logic
- Adding config fields without flattening/exporting defaults
- Assuming old README architecture (it may be stale)
- Treating Matter.js semantics as active runtime behavior (Planck is active runtime)

---

## Quick File Map
- App entry: `src/main.js`
- HTML shell: `src/index.html`
- Sim orchestration: `src/sim/Simulation.js`
- Creature runtime: `src/sim/Creature.js`
- Turbo worker: `src/sim/TurboWorker.js`
- Scoring: `src/sim/fitnessScore.js`
- Config index: `src/utils/config/index.js`

