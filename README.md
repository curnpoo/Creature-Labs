# PolyEvolve Lab
PolyEvolve Lab is a browser‑ and desktop‑based simulation platform for evolving virtual “creatures” through neuroevolutionary algorithms. The core of the system is a lightweight feed‑forward neural network that controls each creature’s behavior, while a physics engine provides realistic movement and interaction.
## Table of Contents
- [Overview](#overview)
- [Technology Stack](#technology-stack)
- [Key Features](#key-features)
- [Neural Network Core](#neural-network-core)
- [Evolution Engine](#evolution-engine)
- [Simulation & Physics](#simulation--physics)
- [User Interface](#user-interface)
- [Installation](#installation)
- [Running the Application](#running-the-application)
- [Building for Distribution](#building-for-distribution)
- [Project Structure](#project-structure)
- [Contributing](#contributing)
- [License](#license)
---
## Overview
PolyEvolve Lab demonstrates how populations of agents can learn complex locomotion and task performance solely through evolutionary pressure applied to their neural network parameters. Creatures are visualized in real time, allowing users to observe the emergence of coordinated behaviors.
## Technology Stack
| Layer | Technology | Purpose |
|-------|------------|---------|
| Runtime | **Node.js** (v18+) | Execution environment |
| Bundler | **Vite** | Fast development server and build pipeline |
| Desktop | **Electron** | Packages the web app as a native desktop executable for Windows and macOS |
| UI | **Tailwind CSS** (v4) | Utility‑first styling |
| Physics | **Matter.js** (v0.20) & **Planck‑js** (v1.3) | 2‑D rigid‑body dynamics and optional physics simulations |
| Neural Network | Custom **Float32Array** implementation | Lightweight feed‑forward network with Xavier initialization |
| Evolution | Custom neuroevolution algorithm | Tournament selection, weighted crossover, Gaussian mutation, and architecture variation |
| Build | **electron‑builder** | Generates portable installers |
## Key Features
- Real‑time visual simulation of multiple agents interacting under physics constraints.
- Neuroevolution with adjustable mutation rates, elite preservation, and adaptive mutation based on stagnation.
- Architecture mutation: Hidden layer count and neuron per layer can evolve alongside weights.
- Export/Import of population DNA for reproducibility.
- Cross‑platform desktop builds (Windows portable, macOS DMG).
- Configurable simulation parameters via JSON configuration files.
- Modular codebase separating physics, UI, evolution, and neural network logic.
## Neural Network Core
The NN implementation lives in `src/nn/NeuralNetwork.js`:
- **Layer definition**: Arbitrary sizes defined by an array (e.g., `[14, 10, 4]`).
- **Weight storage**: Single `Float32Array` containing all weights and biases for cache‑friendly access.
- **Xavier/Glorot initialization** for balanced variance across layers.
- **tanh activation** for bounded output values.
- **Forward propagation** caches activations per layer to enable visual inspection.
- **Serialization** (`toArray`, `fromArray`) for easy DNA handling.
- **Clone** method for deep copies when generating offspring.
The network is deliberately minimal to keep per‑generation evaluation fast, enabling large population sizes and many generations on modest hardware.
## Evolution Engine
Implemented in `src/nn/Evolution.js`:
- **Tournament selection** with configurable tournament size.
- **Weighted crossover** where the fitter parent contributes 90 % of the child’s DNA.
- **Gaussian mutation** with adaptive rate that increases with successive stagnant generations.
- **Elitism** preserves top‑performing individuals unchanged.
- **Immigration** introduces random individuals each generation to maintain genetic diversity.
- **Architecture mutation** allows hidden‑layer count (0–6) and neuron count (4–32) to evolve, providing a coarse search over network topology.
## Simulation & Physics
- **Matter.js** provides rigid‑body collision handling, gravity, and constraints.
- **Planck‑js** is available for alternative physics scenarios (e.g., fluid or contact‑rich environments).
- Creature bodies are generated dynamically based on the network’s output signals, enabling emergent locomotion strategies.
## User Interface
- **Controls** (`src/ui/Controls.js`) allow users to start/stop simulations, adjust population size, and tweak evolution parameters.
- **Visualizer** (`src/ui/Visualizer.js`, `EnhancedVisualizer.js`) renders agents with real‑time color mapping based on neural activation levels.
- **HUD** (`src/ui/HUD.js`) displays generation count, best fitness, and elapsed time.
- **ProgressChart** (`src/ui/ProgressChart.js`) plots fitness trends across generations.
## Installation
```bash
git clone https://github.com/yourusername/polyevolve-lab.git
cd polyevolve-lab
npm install
```
> The project is marked `"private": true` in `package.json`; it is intended for personal or organizational use rather than publishing to npm.
## Running the Application
- **Development (web)**
```bash
npm run dev
```
Opens the Vite dev server at `http://localhost:5173`.
- **Desktop (Electron)**
```bash
npm run app
```
Launches the Electron wrapper.
## Building for Distribution
- **Windows (portable)**
```bash
npm run build:win
```
- **macOS (DMG)**
```bash
npm run build:mac
```
The generated installers are placed in `release/` per the `electron-builder` configuration.
## Project Structure
```
src/
├─ nn/                # Neural network and evolution engine
│   ├─ NeuralNetwork.js
│   └─ Evolution.js
├─ sim/               # Core simulation loop and physics integration
│   ├─ Creature.js
│   ├─ Simulation.js
│   └─ Physics.js
├─ ui/                # React components for controls, visualizer, HUD
│   ├─ Controls.js
│   ├─ Visualizer.js
│   └─ ...
├─ utils/             # Configuration, presets, monitoring utilities
│   └─ config/
│       ├─ evolution.js
│       ├─ physics.js
│       └─ ...
└─ index.html         # Entry point for Vite
```
## Contributing
1. Fork the repository.
2. Create a feature branch (`git checkout -b feature/xyz`).
3. Ensure changes pass existing tests (`npm test` if test suite is added).
4. Submit a Pull Request with a concise description of the change.
## License
PolyEvolve Lab is released under the **MIT License**. See `LICENSE` for details.
---
