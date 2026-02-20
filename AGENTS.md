# AGENTS.md - PolyEvolve Lab

## Overview

PolyEvolve Lab is a browser-based creature evolution simulator using neuroevolution with Matter.js/Planck.js physics engines. The project uses Vite for bundling and Electron for desktop distribution.

## Build Commands

### Development
```bash
npm run dev          # Start Vite dev server at http://localhost:5173
npm run app          # Run as Electron desktop app
```

### Build
```bash
npm run build        # Production build (outputs to dist/)
npm run build:win    # Build Windows portable executable
npm run build:mac    # Build macOS DMG installer
```

### Testing
```bash
node tests/test-topology.js    # Run topology neural network tests
```

There is no test runner framework configured. Tests are standalone scripts that can be executed directly with Node.js.

---

## Code Style Guidelines

### General Conventions
- **Language**: Plain JavaScript (ES Modules)
- **Module System**: ES Modules with `import`/`export`
- **File Extension**: `.js` for all JavaScript files

### Naming Conventions
| Type | Convention | Example |
|------|------------|---------|
| Classes | PascalCase | `NeuralNetwork`, `Simulation`, `Creature` |
| Functions/Variables | camelCase | `forward()`, `creatures`, `simSpeed` |
| Constants | SCREAMING_SNAKE_CASE | `STORAGE_KEYS`, `CONFIG` |
| Files (classes) | PascalCase.js | `NeuralNetwork.js`, `Physics.js` |
| Files (utilities) | camelCase.js | `config.js`, `presets.js` |

### Import Style
```javascript
// Named imports from local modules
import { NeuralNetwork } from './nn/NeuralNetwork.js';
import { PHYSICS_CONFIG, ENERGY_CONFIG } from './utils/config/index.js';

// Namespace import from physics
import { planck } from '../sim/Physics.js';
```

- Use relative imports with `./` or `../`
- Include `.js` extension in imports
- Order: external → internal → local (grouped)

### Documentation
Use JSDoc comments for classes and public methods:

```javascript
/**
 * Feedforward Neural Network with Float32Array weights.
 * Supports arbitrary layer sizes with tanh activation.
 */
export class NeuralNetwork {
  /**
   * @param {number[]} layerSizes - e.g. [14, 10, 4]
   */
  constructor(layerSizes) {
    // ...
  }

  /**
   * Forward propagation with tanh activation.
   * @param {number[]|Float32Array} inputs
   * @returns {Float32Array} output activations
   */
  forward(inputs) {
    // ...
  }
}
```

### Type Annotations
No TypeScript is used. Use JSDoc `@param` and `@returns` for type hints:

```javascript
/**
 * @param {Float32Array} dna
 * @param {number} fitness
 * @param {object} [architecture]
 * @returns {object}
 */
```

### Error Handling
- Use try/catch for operations that may fail (DNA parsing, network reconstruction)
- Return `null` for optional operations that fail (e.g., `mutateAddLayer()` may return null if at max size)
- Log errors to console with descriptive messages

```javascript
try {
  const net = new TopologyNeuralNetwork(dna);
  architectures.push(net.layerSizes.join('-'));
} catch (e) {
  console.error(`DNA ${i} failed:`, e.message);
  architectures.push('ERROR');
}
```

### Code Formatting
No Prettier/ESLint configured. Follow these practices:
- 2-space indentation
- One space after commas and around operators
- Opening brace on same line
- Semicolons at end of statements

### Physics Constants
- **Important**: Matter.js friction values are in range 0-1 (not 0-100)
- Use `planck.js` for new physics code (more actively maintained)
- Scale factor: `SCALE = 30` pixels per meter

---

## Project Structure

```
src/
├── nn/                      # Neural network & evolution
│   ├── NeuralNetwork.js     # Basic feedforward NN
│   ├── TopologyNeuralNetwork.js  # NN with evolving topology
│   └── Evolution.js         # Neuroevolution algorithm
├── sim/                     # Simulation & physics
│   ├── Simulation.js        # Main simulation loop
│   ├── Creature.js          # Creature definition & muscle control
│   └── Physics.js           # Matter.js/Planck.js wrapper
├── ui/                      # User interface
│   ├── Controls.js          # Right panel controls
│   ├── Visualizer.js        # Canvas rendering
│   └── HUD.js               # Heads-up display
├── utils/
│   ├── config/              # Modular configuration
│   │   ├── physics.js
│   │   ├── energy.js
│   │   ├── muscle.js
│   │   ├── fitness.js
│   │   ├── evolution.js
│   │   └── visual.js
│   └── presets.js          # Configuration presets
├── index.html               # Entry point
└── main.js                  # Main application logic

tests/
└── test-topology.js         # Standalone test script

vite.config.js               # Vite configuration
postcss.config.cjs          # PostCSS + Tailwind
tailwind.config.cjs          # Tailwind CSS config
```

---

## Configuration System

Configuration is organized in `src/utils/config/` with six modules:
- `physics.js` - Matter.js engine, friction, constraints
- `energy.js` - Energy system costs and regeneration
- `muscle.js` - Muscle strength, speed, range
- `fitness.js` - Rewards and penalties
- `evolution.js` - Population, mutation, neural network
- `visual.js` - Camera, rendering, UI settings

Access via `src/utils/config/index.js` which exports a unified `CONFIG` object.

---

## Common Patterns

### Creature DNA
- DNA is a `Float32Array` containing all neural network weights
- Topology DNA: `[numLayers, layerSizes..., weights...]`
- Serialization via `toDNA()` / constructor from DNA

### Simulation Loop
```javascript
// Run with: node tests/test-topology.js
import { TopologyNeuralNetwork } from '../src/nn/TopologyNeuralNetwork.js';
import { Evolution } from '../src/nn/Evolution.js';

const net = new TopologyNeuralNetwork([4, 6, 3]);
const outputs = net.forward(inputs);
```

### Adding New Configuration
1. Add to appropriate module in `src/utils/config/`
2. Export from `src/utils/config/index.js`
3. Add to backward-compatible `CONFIG` object if needed

---

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| vite | ^7.3.1 | Build tool |
| electron | ^31.7.7 | Desktop runtime |
| matter-js | ^0.20.0 | Physics engine |
| planck-js | ^1.3.0 | Alternative physics |
| tailwindcss | ^4.1.18 | Styling |

---

## Notes for Agents

- This is a legacy codebase - not all code follows modern patterns
- No lint/typecheck commands configured
- Tests are manual scripts, not automated
- The codebase is a simulation/research project, not a production application
- Configuration presets available: `SPEED`, `STABLE`, `WALKING`, `EXPLORATORY`, `EFFICIENT`
