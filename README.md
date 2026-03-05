# PolyEvolve Lab

PolyEvolve Lab is an open-source creature locomotion evolution sandbox built with JavaScript, Planck.js physics, and a custom neuroevolution stack.

It supports:
- real-time normal simulation
- high-throughput turbo training in Web Workers
- dense and NEAT-style controller evolution
- replay/diagnostics tooling for iterative tuning

## What This Project Is

This project is focused on **evolutionary locomotion under physics constraints**:
- creatures are built from nodes, bones, muscles, and optional polygon body parts
- neural controllers drive muscle actuation
- generations are selected by distance-first fitness under configurable constraints

The emphasis is experimental iteration and observability, not framework-heavy app architecture.

## System Overview

### 1) Physics System
- Engine: `planck-js`
- Units: `SCALE = 30` px/m
- Fixed-step simulation in both normal and turbo modes
- Creature structures:
  - nodes (dynamic circle bodies)
  - bones (distance joints)
  - muscles (prismatic joints with actuator control)
  - optional polygon bodies connected via joints

Key files:
- `src/sim/Physics.js`
- `src/sim/Creature.js`
- `src/sim/Simulation.js`

### 2) Actuation + Contact Behavior
- Muscles are controlled by neural outputs with smoothing/rate limiting
- Ground interaction is contact-driven
- Near no-slip grounded behavior is available to suppress drag-snap ratchet exploits

Related config:
- `src/utils/config/muscle.js`
- `src/utils/config/physics.js`

### 3) Evolution System
Two controller families are supported:
- Dense feed-forward (`legacy` mode)
- NEAT-style topology evolution (`neat` mode)

Evolution operations include selection, crossover, mutation, and architecture/genome tracking.

Key files:
- `src/nn/Evolution.js`
- `src/nn/TopologyNeuralNetwork.js`
- `src/nn/neat/*`
- `src/nn/runtime/*`

### 4) Scoring System
Shared score logic is centralized so normal and turbo remain consistent.

Core scoring file:
- `src/sim/fitnessScore.js`

Primary objective is distance progression with additional penalties/bonuses as configured.

### 5) Runtime Modes
#### Normal mode
- Main-thread simulation and rendering
- Full per-frame creature visualization

#### Turbo mode
- Off-thread generation evaluation via workers
- Designed for fast generation throughput
- Parity safeguards and diagnostics to track divergence risk

Key files:
- `src/sim/TurboCoordinator.js`
- `src/sim/TurboWorker.js`
- `src/sim/Simulation.js`

### 6) UI + Diagnostics
- Right-side controls panel for runtime tuning
- HUD and charting for progress/training health
- Diagnostics snapshots for debugging/parity checks

Key files:
- `src/ui/Controls.js`
- `src/ui/HUD.js`
- `src/ui/ProgressChart.js`
- `src/ui/Visualizer.js`

## Project Structure

```text
src/
  index.html
  main.js
  nn/
    Evolution.js
    NeuralNetwork.js
    TopologyNeuralNetwork.js
    neat/
    runtime/
  sim/
    Creature.js
    Physics.js
    Simulation.js
    TurboCoordinator.js
    TurboWorker.js
    fitnessScore.js
  ui/
    Controls.js
    HUD.js
    ProgressChart.js
    Visualizer.js
  utils/
    config/
      physics.js
      muscle.js
      energy.js
      fitness.js
      evolution.js
      visual.js
    EvolutionMonitor.js

tests/
  test-topology.js
  test-neat-runtime.js
  test-turbo-parity.js
  benchmark-evolution.js
```

## Tech Stack

- JavaScript (ES modules)
- Vite
- Planck.js
- Tailwind CSS

## Setup

```bash
npm install
```

## Run

```bash
npm run dev
```

Open `http://localhost:5173`.

## Build

```bash
npm run build
```

## Tests / Validation Scripts

```bash
node tests/test-topology.js
node tests/test-neat-runtime.js
node tests/test-turbo-parity.js
node tests/benchmark-evolution.js
```

Recommended quick validation after sim/runtime changes:

```bash
npm run build
node tests/test-turbo-parity.js
```

## Configuration

Centralized in `src/utils/config/` and flattened through `src/utils/config/index.js`.

When adding runtime parameters:
1. Add to module config
2. Export via flattened defaults in config index
3. Thread through simulation runtime and turbo payload if applicable

## Contribution Notes

- Keep normal and turbo behavior aligned for any physics/scoring/runtime logic changes.
- Prefer small, verifiable edits.
- Avoid hidden correction hacks unless explicitly requested.
- This repo does not currently use ESLint/Prettier/Jest.

## License

MIT (see project license file if present).
