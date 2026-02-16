# Configuration Guide

Complete guide to all tunable parameters in the Creature Evolution Simulator.

## Quick Start

All configuration is organized into **6 modules** in `src/utils/config/`:

1. **physics.js** - Matter.js engine, friction, constraints
2. **energy.js** - Energy system costs and regeneration
3. **muscle.js** - Muscle strength, speed, range
4. **fitness.js** - Rewards and penalties for evolution
5. **evolution.js** - Population, mutation, neural network
6. **visual.js** - Camera, rendering, UI settings

## Configuration Presets

Use presets for common scenarios:

```javascript
import { PRESETS, applyPreset } from './utils/config';

// Fast evolution (4x speed, shorter generations)
const speedConfig = PRESETS.SPEED;

// Emphasize realistic walking gaits
const walkingConfig = PRESETS.WALKING;

// Energy-efficient movement
const efficientConfig = PRESETS.EFFICIENT;
```

Available presets:
- `SPEED` - Fast but potentially unstable evolution
- `STABLE` - Slow but very stable physics
- `WALKING` - Emphasize realistic walking gaits
- `EXPLORATORY` - Rapid evolution with looser constraints
- `EFFICIENT` - Energy-efficient movement patterns

---

## 1. Physics Configuration

**File:** `src/utils/config/physics.js`

### Core Engine Settings

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| `fixedStepHz` | 60 | 30-120 | Physics update rate (Hz). Higher = more accurate but slower. Don't change unless needed. |
| `maxPhysicsStepsPerFrame` | 240 | 60-480 | Maximum physics steps per render frame. Prevents spiral of death. |
| `gravity` | 1.0 | 0.1-3.0 | Gravity strength. 1.0 = Earth normal. |

### Ground/Surface Properties

⚠️ **Matter.js friction range is 0-1** (not 0-100)

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| `groundFriction` | 0.5 | 0.2-0.8 | Ground kinetic friction. 0.5 = realistic walking surface. |
| `groundStaticFriction` | 0.8 | 0.4-1.0 | Ground static friction. Resistance to start sliding. |
| `tractionDamping` | 0.93 | 0.80-0.98 | Velocity damping when grounded. 0.93 = keeps 7% of velocity. |

**Research basis:**
- Walking RCOF (Required Coefficient of Friction): 0.17-0.23
- Safety threshold: 0.40
- Turning: 0.38-0.54

### Body/Node Properties

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| `bodyFriction` | 0.4 | 0.2-0.6 | Body-to-body kinetic friction. Lower than ground to allow limb sliding. |
| `bodyStaticFriction` | 0.6 | 0.3-0.8 | Body-to-body static friction. |
| `bodyAirFriction` | 0.08 | 0.0-0.2 | Air resistance when airborne. |
| `bodyDensity` | 0.0035 | 0.001-0.01 | Body mass density. Affects inertia. |
| `bodyRestitution` | 0 | 0.0-0.3 | Bounciness. 0 = no bounce (realistic). |
| `bodySlop` | 0.01 | 0.005-0.05 | Collision separation buffer. Prevents tunneling. |

### Constraint/Joint Properties

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| `boneStiffness` | 1.0 | 0.9-1.0 | Bone rigidity. 1.0 = completely rigid. |
| `boneDamping` | 0.12 | 0.05-0.20 | Bone damping. Reduces oscillation. |
| `muscleStiffness` | 0.70 | 0.5-0.9 | Muscle stiffness. 0.70 = viscoelastic (realistic). |
| `muscleDamping` | 0.30 | 0.15-0.45 | Muscle damping. Mimics muscle-tendon units. |

**Research basis:**
- Real muscles are viscoelastic (not rigid springs)
- Tendons have spring constant ~161 N/mm with significant damping
- Critical damping prevents runaway resonance

### Solver Iterations

Higher = more stable but slower. Double these for complex creatures (10+ nodes).

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| `positionIterations` | 20 | 10-40 | Position constraint resolution iterations. |
| `velocityIterations` | 16 | 8-32 | Velocity constraint resolution iterations. |
| `constraintIterations` | 24 | 12-48 | Constraint resolution iterations. |
| `enableSleeping` | false | - | Disable to prevent energy accumulation exploits. |

### Anti-Exploit Stabilization

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| `angularDamping` | 0.96 | 0.90-0.99 | Angular velocity damping per step. Prevents spinning. |
| `maxAngularVelocity` | 3 | 1-10 | Maximum angular velocity (rad/s). Caps spinning speed. |

---

## 2. Energy System Configuration

**File:** `src/utils/config/energy.js`

Energy prevents overpowered constant actuation by requiring strategic rest phases.

### Core Settings

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| `enabled` | true | - | Enable/disable entire energy system. |
| `maxEnergy` | 100 | 50-500 | Maximum energy capacity. |
| `startingEnergy` | 100 | 50-100% | Starting energy (% of max or absolute). |

### Energy Costs

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| `usagePerActuation` | 0.8 | 0.3-2.0 | Energy cost per unit of muscle actuation. Higher = more expensive. |
| `minEnergyForActuation` | 0 | 0-20 | Minimum energy required to actuate. 0 = always allow some actuation. |

### Energy Regeneration

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| `regenRate` | 25 | 10-50 | Base energy regeneration per second when idle. |
| `regenInactivityBonus` | true | - | Bonus regen when muscles are inactive. Encourages rest phases. |
| `regenWhileGrounded` | 1.0 | 0.5-1.5 | Regen multiplier when grounded. 1.0 = normal. |
| `regenWhileAirborne` | 0.5 | 0.0-1.0 | Regen multiplier when airborne. 0.5 = half speed. |

### Energy-Based Strength

Muscle strength scales with available energy to prevent depletion exploitation.

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| `strengthAtFullEnergy` | 1.0 | 1.0 | Strength multiplier at 100% energy. |
| `strengthAt50Energy` | 0.85 | 0.7-1.0 | Strength multiplier at 50% energy. |
| `strengthAt20Energy` | 0.5 | 0.3-0.7 | Strength multiplier at 20% energy. |
| `strengthAtZeroEnergy` | 0.3 | 0.1-0.5 | Strength multiplier at 0% energy (never fully disabled). |

### Fitness Integration

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| `efficiencyBonus` | 0.5 | 0.0-2.0 | Fitness bonus for energy efficiency (distance/energy). |
| `penaltyForDepletion` | 0 | 0-100 | Penalty if energy hits zero. 0 = no penalty. |

**How energy works:**
1. Every muscle actuation costs energy
2. Low actuation = high regeneration (forces rest phases)
3. Low energy = reduced muscle strength
4. Efficient movement = fitness bonus
5. Natural rhythmic gaits emerge: push → recover → push

---

## 3. Muscle & Actuation Configuration

**File:** `src/utils/config/muscle.js`

### Base Muscle Properties

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| `strength` | 1.0 | 0.5-2.0 | Base muscle strength. 1.0 = balanced. Higher allows exploits. |
| `moveSpeed` | 0.7 | 0.3-1.5 | Joint movement speed. Lower = more controlled, prevents explosive actuation. |
| `range` | 0.8 | 0.5-1.2 | Muscle contraction range multiplier. |
| `rangeScale` | 0.18 | 0.10-0.25 | Base range scale (% of base length). Effective range = range × rangeScale. |
| `smoothing` | 0.22 | 0.05-0.50 | Muscle signal smoothing. Higher = smoother but less responsive. |

**Effective contraction range:**
- Default: 0.8 × 0.18 = **14.4%** (realistic)
- Human muscles: 15-20% active ROM
- Too high (>20%): enables momentum exploits

### Ground-Dependent Strength

Prevents "pushing off air" exploits by requiring ground contact.

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| `groundedBothBodies` | 1.0 | 1.0 | Strength when both muscle endpoints grounded (100%). |
| `groundedOneBody` | 0.7 | 0.5-0.9 | Strength when one endpoint grounded (can push off ground). |
| `groundedNoBodies` | 0.15 | 0.0-0.3 | Strength when fully airborne (internal tension only). |

**How it works:**
- Leg muscles touching ground: **100% strength** ✓
- One end grounded: **70% strength** (can push off that end)
- Fully airborne: **15% strength** (can't push off air)

### Other

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| `maxForcePerStep` | 0.4 | 0.2-0.8 | Max force per step (fraction of base length). Prevents impulse exploits. |
| `jointFreedom` | 1.0 | 0.0-1.0 | Joint freedom. 1.0 = free, 0.0 = rigid/locked. |

---

## 4. Fitness Function Configuration

**File:** `src/utils/config/fitness.js`

Balances rewards and penalties to encourage realistic walking gaits.

### Primary Rewards

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| `distanceWeight` | 250 | 100-500 | Reward for distance traveled (primary objective). |
| `speedWeight` | 0.25 | 0.0-1.0 | Reward for movement speed. |
| `stabilityWeight` | 0.9 | 0.0-5.0 | Reward for stable upright posture. |
| `rewardStability` | true | - | Enable stability rewards. |

### Gait Quality Penalties

**Anti-Exploit Penalties:**

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| `spinPenalty` | 15000 | 5000-30000 | Penalty for spinning (applied **quadratically**: spin² × weight). |
| `spinAccumulatedPenalty` | 150 | 50-300 | Penalty for total accumulated spin over lifetime. |
| `jitterPenalty` | 60 | 20-120 | Penalty for erratic muscle actuation (power 1.5). |
| `groundSlipPenalty` | 35 | 10-80 | Penalty for slipping on ground (poor foot placement). |
| `airtimePenalty` | 0.3 | 0.0-1.0 | Penalty for time spent airborne. |
| `stumblePenalty` | 15 | 5-30 | Penalty for stumbling (center of mass too low). |

**Advanced:**

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| `energyViolationPenalty` | 500 | 0-1000 | Harsh penalty for suspicious energy gains (exploit detection). |

### Penalty Scaling

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| `gaitPenaltyScale` | 1.5 | 1.0-3.0 | Multiplier for gait penalties when stability enabled. |
| `distanceScaling` | 0.02 | 0.0-0.1 | Distance-based penalty increase. Longer runs = stricter gait requirements. |

### Actuation Bonuses

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| `actuationLevelBonus` | 0.8 | 0.0-1.0 | Speed bonus for high actuation (0.2 base + 0.8 × actuation). |

**How fitness balancing works:**

Evolution optimizes: `distance × 250 - spin² × 15000 - jitter^1.5 × 60 - ...`

- Distance rewards should be **moderate** (not dominant)
- Spin penalties are **quadratic** (2× spin = 4× penalty!)
- Cumulative spin tracking prevents "brief spin" exploits
- Distance scaling makes longer runs require better gaits

---

## 5. Evolution Configuration

**File:** `src/utils/config/evolution.js`

### Population

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| `populationSize` | 24 | 10-100 | Number of creatures per generation. More = slower but more diverse. |

### Selection

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| `eliteCount` | 2 | 1-5 | Number of best creatures kept unchanged each generation. |
| `tournamentSize` | 3 | 2-7 | Tournament selection size. Higher = stronger selection pressure. |

### Mutation

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| `mutationRate` | 0.08 | 0.01-0.30 | Base probability of gene mutation (per weight). |
| `mutationSize` | 1.0 | 0.1-3.0 | Magnitude of mutations. Higher = larger jumps. |
| `maxMutationRate` | 0.95 | 0.50-0.99 | Maximum mutation rate during stagnation. |
| `stagnantMutBonus` | 0.015 | 0.0-0.05 | Mutation rate increase per stagnant generation. |

**Adaptive mutation:**
- Stagnation detection: no improvement for N generations
- Mutation rate increases: `baseRate + stagnantGens × bonus`
- Helps escape local optima

### Simulation Duration

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| `generationDuration` | 8 | 3-30 | Seconds per generation. Longer = more evaluation time. |
| `simulationSpeed` | 1 | 1-8 | Speed multiplier. Higher = faster evolution (more physics steps per frame). |

**About simulation speed:**
- Speed=1: Normal (1 physics step per frame)
- Speed=4: 4× faster (4 physics steps per frame)
- Each step uses same fixed timestep (1/60s), so physics should be consistent
- Very high speeds (>8) may cause numerical issues

### Neural Network

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| `hiddenLayers` | 1 | 1-3 | Number of hidden layers. More = more complex behaviors but slower evolution. |
| `neuronsPerLayer` | 12 | 4-32 | Neurons per hidden layer. More = more capacity but larger search space. |
| `activation` | 'tanh' | - | Activation function. tanh maps to [-1, 1] for muscle control. |

**Network architecture:**
```
Input → [12 neurons] → Output
  ↑                      ↓
  Body states        Muscle signals
  (position, velocity, ground contact, time)
```

### Creature Behavior

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| `selfCollision` | false | - | Enable collision between creature's own bodies. Usually disabled to prevent jitter. |

---

## 6. Visual Configuration

**File:** `src/utils/config/visual.js`

### Camera

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| `defaultZoom` | 1.0 | 0.3-3.0 | Default zoom level. |
| `cameraMode` | 'lock' | 'lock'/'free' | Camera follows leader ('lock') or free pan. |

### History & Replay

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| `ghostMaxAge` | 10 | 5-50 | Max generations a ghost trail persists. |
| `replayMax` | 180 | 50-500 | Maximum replay history entries. |

### Spawn

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| `spawnX` | 60 | 30-200 | X coordinate for creature spawn (pixels). |

---

## Tuning Recommendations

### For Realistic Walking Gaits

```javascript
// Emphasize smooth, coordinated movement
muscleStrength: 0.9
moveSpeed: 0.6
spinPenalty: 20000
jitterPenalty: 80
airtimePenalty: 0.5
```

### For Faster Evolution

```javascript
// More exploration, less strict
populationSize: 32
mutationRate: 0.12
generationDuration: 6
simulationSpeed: 4
```

### For Energy Efficiency

```javascript
// Make energy management critical
usagePerActuation: 1.2
regenRate: 20
efficiencyBonus: 1.0
strengthAt20Energy: 0.4
```

### For Complex Creatures (10+ nodes)

```javascript
// More solver iterations for stability
positionIterations: 30
velocityIterations: 24
constraintIterations: 36
hiddenLayers: 2
neuronsPerLayer: 16
```

---

## Common Issues & Solutions

### Creatures still spinning?
- ✅ Increase `spinPenalty` to 20000-30000
- ✅ Reduce `muscleStrength` to 0.8-0.9
- ✅ Reduce `moveSpeed` to 0.5-0.6
- ✅ Check friction values are in 0-1 range

### Evolution too slow?
- ✅ Increase `simulationSpeed` to 2-4
- ✅ Reduce `generationDuration` to 5-6
- ✅ Reduce `populationSize` to 16-20

### Creatures unstable/jittery?
- ✅ Increase solver iterations (×1.5)
- ✅ Reduce `moveSpeed`
- ✅ Increase `muscleDamping` to 0.35-0.40
- ✅ Check `selfCollision` is disabled

### No progress after many generations?
- ✅ Increase `mutationRate` to 0.12-0.15
- ✅ Increase `mutationSize` to 1.5
- ✅ Reduce penalty weights (too harsh)
- ✅ Check if energy system is too restrictive

### Energy depletes too fast?
- ✅ Reduce `usagePerActuation` to 0.5-0.6
- ✅ Increase `regenRate` to 30-35
- ✅ Reduce penalty for low energy

---

## Research References

- [Evolved Virtual Creatures - Karl Sims (1994)](https://www.karlsims.com/papers/siggraph94.pdf)
- [Evolutionary Robotics](https://www.frontiersin.org/journals/robotics-and-ai/articles/10.3389/frobt.2015.00004/full)
- [Required Coefficient of Friction in Walking](https://pmc.ncbi.nlm.nih.gov/articles/PMC4054705/)
- [Matter.js Documentation](https://brm.io/matter-js/docs/)
- [Muscle-Tendon Biomechanics](https://pmc.ncbi.nlm.nih.gov/articles/PMC5031668/)
- [Joint Range of Motion](https://pmc.ncbi.nlm.nih.gov/articles/PMC8476262/)

---

## API Usage

### Access all configs programmatically:

```javascript
import {
  PHYSICS_CONFIG,
  ENERGY_CONFIG,
  MUSCLE_CONFIG,
  FITNESS_CONFIG,
  EVOLUTION_CONFIG,
  VISUAL_CONFIG,
  getAllTunableParams
} from './utils/config';

// Get all parameters
const allParams = getAllTunableParams();

// Modify specific module
MUSCLE_CONFIG.strength = 0.9;

// Use preset
import { PRESETS, applyPreset } from './utils/config';
const walkingPreset = PRESETS.WALKING;
```

### Backward compatibility:

```javascript
// Old flat CONFIG still works
import { CONFIG } from './utils/config';
const friction = CONFIG.defaultGroundFriction;
```
