import { CONFIG } from '../utils/config.js';
import { createEngine, createGround, cleanup, Engine, Body, Bodies, Composite, Vector, Matter } from './Physics.js';
import { Creature } from './Creature.js';
import { Evolution } from '../nn/Evolution.js';

/**
 * Simulation manager: game loop, generation lifecycle, evolution.
 */
export class Simulation {
  constructor() {
    this.engine = null;
    this.ground = null;
    this.creatures = [];
    this.generation = 1;
    this.timer = 0;
    this.paused = false;
    this.frameId = null;
    this.lastFrame = 0;
    this.fpsSmoothed = 60;
    this.simTimeElapsed = 0;
    this.selfCollision = false;

    // Evolution state
    this.genBestDist = 0;
    this.allTimeBest = 0;
    this.prevAllTimeBest = 0;
    this.stagnantGens = 0;
    this.progressHistory = [];
    this.ghosts = [];
    this.currentGhostPath = [];
    this.brainHistory = [];
    this.replayHistory = [];
    this.replayIndex = -1;
    this.replayPlaying = false;
    this.replayCursor = 0;
    this.championDNA = null;
    this.championFitness = -Infinity;
    this.championAwards = 0;
    this.visualLeader = null;
    this.lastLeaderSwitchAt = 0;
    this.groundProfile = [];
    this.obstacles = [];
    this.challengeBodies = [];
    this.importedBrainDNA = null;
    this.lastGenerationBrain = null;
    this.sandboxMode = false;
    this.sandboxBrainDNA = null;
    this.sandboxRuns = 0;

    // Callbacks
    this.onGenerationEnd = null;
    this.onFrame = null;

    // Settings (mutable, read by UI)
    this.simSpeed = CONFIG.defaultSimSpeed;
    this.simDuration = CONFIG.defaultSimDuration;
    this.popSize = CONFIG.defaultPopSize;
    this.gravity = CONFIG.defaultGravity;
    this.muscleStrength = CONFIG.defaultMuscleStrength;
    this.jointMoveSpeed = CONFIG.defaultJointMoveSpeed;
    this.jointFreedom = CONFIG.defaultJointFreedom;
    this.groundFriction = CONFIG.defaultGroundFriction;
    this.groundStaticFriction = CONFIG.defaultGroundStaticFriction;
    this.tractionDamping = CONFIG.defaultTractionDamping;
    this.bodyFriction = CONFIG.defaultBodyFriction;
    this.bodyStaticFriction = CONFIG.defaultBodyStaticFriction;
    this.bodyAirFriction = CONFIG.defaultBodyAirFriction;
    this.muscleRange = CONFIG.defaultMuscleRange;
    this.muscleSmoothing = CONFIG.defaultMuscleSmoothing;
    this.distanceRewardWeight = CONFIG.defaultDistanceRewardWeight;
    this.speedRewardWeight = CONFIG.defaultSpeedRewardWeight;
    this.stabilityRewardWeight = CONFIG.defaultStabilityRewardWeight;
    this.rewardStability = true;
    this.jitterPenaltyWeight = CONFIG.defaultJitterPenaltyWeight;
    this.groundSlipPenaltyWeight = CONFIG.defaultGroundSlipPenaltyWeight;
    this.spinPenaltyWeight = CONFIG.defaultSpinPenaltyWeight;
    this.spawnX = 60;

    // Energy system settings
    this.energyEnabled = CONFIG.defaultEnergyEnabled;
    this.maxEnergy = CONFIG.defaultMaxEnergy;
    this.energyRegenRate = CONFIG.defaultEnergyRegenRate;
    this.energyUsagePerActuation = CONFIG.defaultEnergyUsagePerActuation;
    this.minEnergyForActuation = CONFIG.defaultMinEnergyForActuation;
    this.energyEfficiencyBonus = CONFIG.defaultEnergyEfficiencyBonus;
    this.mutationRate = CONFIG.defaultMutationRate;
    this.mutationSize = CONFIG.defaultMutationSize;
    this.zoom = CONFIG.defaultZoom;
    this.cameraX = 0;
    this.cameraY = 0;
    this.cameraMode = 'lock';
    this.panning = false;
    this.panX = 0;
    this.panY = 0;

    // NN config
    this.hiddenLayers = CONFIG.defaultHiddenLayers;
    this.neuronsPerLayer = CONFIG.defaultNeuronsPerLayer;
    this.eliteCount = CONFIG.defaultEliteCount;
    this.tournamentSize = CONFIG.defaultTournamentSize;

    // Design data
    this.nodes = [];
    this.constraints = [];
  }

  getGroundY() {
    return window.innerHeight - 100;
  }

  designBounds() {
    let minX = Infinity, minY = Infinity, maxY = -Infinity;
    this.nodes.forEach(n => {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxY = Math.max(maxY, n.y);
    });
    return { minX, minY, maxY };
  }

  getSimConfig() {
    return {
      jointFreedom: this.jointFreedom,
      muscleStrength: this.muscleStrength,
      jointMoveSpeed: this.jointMoveSpeed,
      muscleRange: this.muscleRange,
      muscleSmoothing: this.muscleSmoothing,
      bodyFriction: this.bodyFriction,
      bodyStaticFriction: this.bodyStaticFriction,
      bodyAirFriction: this.bodyAirFriction,
      hiddenLayers: this.hiddenLayers,
      neuronsPerLayer: this.neuronsPerLayer,
      selfCollision: this.selfCollision,
      energyEnabled: this.energyEnabled,
      maxEnergy: this.maxEnergy,
      energyRegenRate: this.energyRegenRate,
      energyUsagePerActuation: this.energyUsagePerActuation,
      minEnergyForActuation: this.minEnergyForActuation
    };
  }

  spawnGeneration(dnaArray = null) {
    this.creatures.forEach(c => c.destroy());
    this.creatures = [];

    const bounds = this.designBounds();
    const relMaxY = bounds.maxY - bounds.minY;
    const startX = this.spawnX;
    const startY = this.getGroundY() - CONFIG.spawnClearance - CONFIG.nodeRadius - relMaxY;

    const creatureCount = this.sandboxMode ? 1 : this.popSize;
    for (let i = 0; i < creatureCount; i++) {
      const dna = dnaArray ? dnaArray[i] : null;
      this.creatures.push(
        new Creature(
          this.engine, startX, startY,
          this.nodes, this.constraints,
          dna, bounds.minX, bounds.minY,
          this.getSimConfig(),
          i
        )
      );
    }
  }

  startSimulation() {
    if (this.nodes.length < 2 || this.constraints.length < 1) return false;

    this.stopLoop();
    this.clearSimulation();

    this.engine = createEngine(this.gravity);

    // COLLISION JITTER FILTER
    // Isolation from other creatures is now handled by Matter.js Categories and Masks.
    // This handler only solves the 'jitter' caused by connected nodes fighting each other.
    const collisionFilter = (e) => {
      const pairs = e.pairs;
      for (let i = 0; i < pairs.length; i++) {
        const p = pairs[i];
        
        // If they are from the SAME creature and connected by a spine/muscle, skip collision.
        if (p.bodyA.creatureId === p.bodyB.creatureId) {
          if (p.bodyA.connectedBodies && p.bodyA.connectedBodies.has(p.bodyB.id)) {
            p.isActive = false;
          }
        }
      }
    };

    Matter.Events.on(this.engine, 'collisionStart', collisionFilter);
    Matter.Events.on(this.engine, 'collisionActive', collisionFilter);

    this.ground = createGround(this.engine, this.getGroundY(), {
      friction: this.groundFriction,
      frictionStatic: this.groundStaticFriction
    });

    this.generation = 1;
    this.timer = this.simDuration;
    this.paused = false;
    this.genBestDist = 0;
    this.allTimeBest = 0;
    this.prevAllTimeBest = 0;
    this.stagnantGens = 0;
    this.progressHistory = [];
    this.ghosts = [];
    this.currentGhostPath = [];
    this.brainHistory = [];
    this.replayHistory = [];
    this.replayIndex = -1;
    this.replayCursor = 0;
    this.replayPlaying = false;
    this.visualLeader = null;
    this.lastLeaderSwitchAt = 0;
    this.championDNA = null;
    this.championFitness = -Infinity;
    this.championAwards = 0;
    this.simTimeElapsed = 0;
    this.sandboxRuns = 0;
    this.lastFrame = performance.now();
    this.fpsSmoothed = 60;

    const sourceBrain = this.sandboxMode ? this.sandboxBrainDNA : this.importedBrainDNA;
    const count = this.sandboxMode ? 1 : this.popSize;
    const seedDNA = sourceBrain
      ? Array.from({ length: count }, () => new Float32Array(sourceBrain))
      : null;
    this.spawnGeneration(seedDNA);
    this.rebuildChallengeBodies();
    this.frameId = requestAnimationFrame(now => this.gameLoop(now));
    return true;
  }

  stopLoop() {
    if (this.frameId) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
  }

  clearSimulation() {
    this.creatures.forEach(c => c.destroy());
    this.creatures = [];
    this.challengeBodies = [];
    if (this.engine) {
      cleanup(this.engine);
      this.engine = null;
    }
  }

  setGroundProfile(points) {
    this.groundProfile = Array.isArray(points)
      ? points
        .map(p => ({ x: Number(p.x), y: Number(p.y) }))
        .filter(p => Number.isFinite(p.x) && Number.isFinite(p.y))
      : [];
    this.rebuildChallengeBodies();
  }

  addGroundPoint(point) {
    const next = this.groundProfile.slice();
    next.push({ x: Number(point.x), y: Number(point.y) });
    this.setGroundProfile(next);
  }

  clearGroundProfile() {
    this.groundProfile = [];
    this.rebuildChallengeBodies();
  }

  addObstacle(obstacle) {
    const o = {
      x: Number(obstacle.x),
      y: Number(obstacle.y),
      w: Math.max(10, Number(obstacle.w) || 60),
      h: Math.max(10, Number(obstacle.h) || 40)
    };
    if (!Number.isFinite(o.x) || !Number.isFinite(o.y)) return;
    this.obstacles.push(o);
    this.rebuildChallengeBodies();
  }

  clearObstacles() {
    this.obstacles = [];
    this.rebuildChallengeBodies();
  }

  clearChallenge() {
    this.groundProfile = [];
    this.obstacles = [];
    this.rebuildChallengeBodies();
  }

  rebuildChallengeBodies() {
    if (!this.engine) return;
    if (this.challengeBodies.length) {
      Composite.remove(this.engine.world, this.challengeBodies);
      this.challengeBodies = [];
    }

    const bodies = [];
    for (let i = 1; i < this.groundProfile.length; i++) {
      const p1 = this.groundProfile[i - 1];
      const p2 = this.groundProfile[i];
      const delta = Vector.sub(p2, p1);
      const length = Vector.magnitude(delta);
      if (length < 2) continue;
      const angle = Math.atan2(delta.y, delta.x);
      const seg = Bodies.rectangle(
        (p1.x + p2.x) * 0.5,
        (p1.y + p2.y) * 0.5,
        length,
        40,
        {
          isStatic: true,
          angle,
          friction: this.groundFriction,
          frictionStatic: this.groundStaticFriction,
          restitution: 0
        }
      );
      bodies.push(seg);
    }

    this.obstacles.forEach(o => {
      bodies.push(Bodies.rectangle(o.x, o.y, o.w, o.h, {
        isStatic: true,
        friction: this.groundFriction,
        frictionStatic: this.groundStaticFriction,
        restitution: 0
      }));
    });

    this.challengeBodies = bodies;
    if (bodies.length) Composite.add(this.engine.world, bodies);
  }

  exportBrain() {
    const leader = this.visualLeader || this.getLeader();
    const sourceDna = this.championDNA || (leader ? leader.dna : null);
    if (!sourceDna) return null;
    return {
      version: 1,
      createdAt: new Date().toISOString(),
      hiddenLayers: this.hiddenLayers,
      neuronsPerLayer: this.neuronsPerLayer,
      dna: Array.from(sourceDna)
    };
  }

  importBrain(payload) {
    if (!payload || !Array.isArray(payload.dna) || payload.dna.length < 1) {
      throw new Error('Invalid brain file.');
    }
    const dna = payload.dna.map(v => Number(v)).filter(v => Number.isFinite(v));
    if (dna.length !== payload.dna.length) {
      throw new Error('Brain file contains invalid weight values.');
    }
    if (Number.isFinite(payload.hiddenLayers)) {
      this.hiddenLayers = Math.max(1, Math.min(3, Math.round(payload.hiddenLayers)));
    }
    if (Number.isFinite(payload.neuronsPerLayer)) {
      this.neuronsPerLayer = Math.max(4, Math.min(32, Math.round(payload.neuronsPerLayer)));
    }
    this.importedBrainDNA = new Float32Array(dna);
    this.championDNA = new Float32Array(dna);
  }

  getLeader() {
    if (!this.creatures.length) return null;
    return this.creatures.reduce(
      (best, curr) => (curr.getX() > best.getX() ? curr : best),
      this.creatures[0]
    );
  }

  distMetersFromX(x) {
    return Math.max(0, Math.floor((x - this.spawnX) / 100));
  }

  distMetersContinuousFromX(x) {
    return Math.max(0, (x - this.spawnX) / 100);
  }

  creatureScore(creature) {
    const fitness = creature.getFitnessSnapshot();
    const progressX = Number.isFinite(fitness.maxX) ? fitness.maxX : creature.getX();
    const distance = this.distMetersContinuousFromX(progressX);
    const gaitPenaltyScale = this.rewardStability ? 1.5 : 1.0;

    // Distance-dependent scaling: longer runs require better gaits
    const distanceScale = 1 + distance * 0.02;

    // Energy efficiency bonus (distance per energy spent)
    const energyBonus = this.energyEnabled && fitness.energyEfficiency > 0
      ? fitness.energyEfficiency * this.energyEfficiencyBonus
      : 0;

    return (
      distance * this.distanceRewardWeight +
      fitness.speed * this.speedRewardWeight * (0.2 + (fitness.actuationLevel || 0) * 0.8) +
      (this.rewardStability ? fitness.stability * this.stabilityRewardWeight : 0) +
      energyBonus -                                                           // Reward efficient movement
      fitness.airtimePct * 0.3 * gaitPenaltyScale * distanceScale -           // Scales with distance
      fitness.stumbles * 15 * gaitPenaltyScale -                              // Slightly increased
      Math.pow(fitness.spin, 2) * this.spinPenaltyWeight * gaitPenaltyScale - // QUADRATIC!
      (fitness.spinAccumulated || 0) * 150 -                                  // Cumulative spin budget
      (fitness.energyViolations || 0) * 500 -                                 // Harsh penalty for free energy
      Math.pow(fitness.actuationJerk || 0, 1.5) * this.jitterPenaltyWeight * gaitPenaltyScale -
      (fitness.groundSlip || 0) * this.groundSlipPenaltyWeight * gaitPenaltyScale
    );
  }

  effectiveMutationRate() {
    return Math.min(
      CONFIG.maxMutationRate,
      this.mutationRate + this.stagnantGens * CONFIG.stagnantMutBonus
    );
  }

  endGeneration() {
    if (!this.creatures.length) return;

    this.creatures.sort((a, b) => this.creatureScore(b) - this.creatureScore(a));
    const winner = this.creatures[0];
    const winnerFitness = this.creatureScore(winner);
    const genBest = this.distMetersFromX(winner.getX());
    this.genBestDist = genBest;
    this.lastGenerationBrain = {
      version: 1,
      createdAt: new Date().toISOString(),
      generation: this.generation,
      distance: genBest,
      fitness: winnerFitness,
      hiddenLayers: this.hiddenLayers,
      neuronsPerLayer: this.neuronsPerLayer,
      dna: new Float32Array(winner.dna)
    };

    const popDistances = this.creatures.map(c => this.distMetersContinuousFromX(c.getX()));
    const popFitness = this.creatures.map(c => c.getFitnessSnapshot());
    const avgDist = popDistances.reduce((a, b) => a + b, 0) / Math.max(1, popDistances.length);
    const avgSpeed = popFitness.reduce((a, f) => a + f.speed, 0) / Math.max(1, popFitness.length);
    const avgStability = popFitness.reduce((a, f) => a + f.stability, 0) / Math.max(1, popFitness.length);
    const avgStumbles = popFitness.reduce((a, f) => a + f.stumbles, 0) / Math.max(1, popFitness.length);
    const avgSpin = popFitness.reduce((a, f) => a + (f.spin || 0), 0) / Math.max(1, popFitness.length);
    const avgSlip = popFitness.reduce((a, f) => a + (f.groundSlip || 0), 0) / Math.max(1, popFitness.length);
    const avgActuation = popFitness.reduce((a, f) => a + (f.actuationLevel || 0), 0) / Math.max(1, popFitness.length);
    const evoScore = genBest * 2 + avgDist + avgSpeed * 0.03 + avgStability * 0.15 - avgStumbles * 1.2;

    this.prevAllTimeBest = this.allTimeBest;
    if (genBest > this.allTimeBest) {
      this.allTimeBest = genBest;
    }
    this.stagnantGens = this.allTimeBest > this.prevAllTimeBest ? 0 : this.stagnantGens + 1;

    this.progressHistory.push({
      generation: this.generation,
      genBest,
      allBest: this.allTimeBest,
      avgDist,
      avgSpeed,
      avgStability,
      avgStumbles,
      avgSpin,
      avgSlip,
      avgActuation,
      evoScore,
      bestFitness: winnerFitness,
      championFitness: this.championFitness,
      mutationRate: this.effectiveMutationRate(),
      stagnantGens: this.stagnantGens,
      championAwards: this.championAwards,
      populationSize: this.creatures.length
    });
    if (this.progressHistory.length > 300) this.progressHistory.shift();

    // Ghost paths
    if (this.currentGhostPath.length > 5) {
      this.ghosts.push({ path: this.currentGhostPath.slice(), generation: this.generation, age: 0 });
      if (this.ghosts.length > 24) this.ghosts.shift();
      this.replayHistory.push({
        path: this.currentGhostPath.slice(),
        generation: this.generation,
        distance: genBest
      });
      if (this.replayHistory.length > CONFIG.replayMax) this.replayHistory.shift();
      this.replayIndex = this.replayHistory.length - 1;
    }
    this.currentGhostPath = [];
    this.ghosts.forEach(g => { g.age++; });
    this.ghosts = this.ghosts.filter(g => g.age <= CONFIG.ghostMaxAge);

    // Update champion
    if (winnerFitness > this.championFitness) {
      this.championFitness = winnerFitness;
      this.championDNA = new Float32Array(winner.dna);
      this.championAwards++;
    }

    // Use Evolution engine for next generation
    const evalCreatures = this.creatures.map(c => ({
      dna: c.dna,
      fitness: this.creatureScore(c)
    }));

    const nextGenDNA = Evolution.evolve(evalCreatures, this.popSize, {
      mutationRate: this.mutationRate,
      mutationSize: this.mutationSize,
      eliteCount: this.eliteCount,
      tournamentSize: this.tournamentSize,
      stagnantGens: this.stagnantGens
    });

    this.generation++;
    this.timer = this.simDuration;
    this.visualLeader = null;

    this.spawnGeneration(nextGenDNA);

    if (this.onGenerationEnd) {
      this.onGenerationEnd({
        generation: this.generation - 1,
        genBest,
        allTimeBest: this.allTimeBest,
        improvement: this.allTimeBest - this.prevAllTimeBest
      });
    }
  }

  gameLoop(now) {
    this.frameId = requestAnimationFrame(ts => this.gameLoop(ts));

    const dtMs = Math.max(1, now - this.lastFrame);
    this.lastFrame = now;
    this.fpsSmoothed = this.fpsSmoothed * 0.88 + (1000 / dtMs) * 0.12;

    const fixedDtSec = 1 / CONFIG.fixedStepHz;
    const fixedDtMs = 1000 / CONFIG.fixedStepHz;
    const groundY = this.getGroundY();

    let simulatedSec = 0;
    if (!this.paused && this.engine) {
      const stepsToRun = Math.min(CONFIG.maxPhysicsStepsPerFrame, Math.max(1, this.simSpeed));

      for (let i = 0; i < stepsToRun; i++) {
        this.syncCreatureRuntimeSettings();
        const time = this.engine.timing.timestamp * 0.006;
        this.creatures.forEach(c => c.update(time, groundY));
        Engine.update(this.engine, fixedDtMs);

        // Anti-spin stabilization
        this.creatures.forEach(c => {
          c.bodies.forEach(b => {
            const grounded = (b.position.y + CONFIG.nodeRadius) >= (groundY - 1.5);
            if (grounded) {
              // Add explicit horizontal traction to kill jitter-slide exploits.
              Body.setVelocity(b, {
                x: b.velocity.x * this.tractionDamping,
                y: b.velocity.y
              });
            }
            const damped = b.angularVelocity * 0.96;
            Body.setAngularVelocity(b, Math.max(-3, Math.min(3, damped)));
          });
        });
      }
      simulatedSec = stepsToRun * fixedDtSec;
      this.simTimeElapsed += simulatedSec;
      this.timer -= simulatedSec;
    }

    // Update ground position
    if (this.ground) {
      Body.setPosition(this.ground, {
        x: this.cameraX + window.innerWidth / 2,
        y: groundY + 400
      });
    }

    // Leader tracking
    const rawLeader = this.getLeader();
    if (rawLeader) {
      this.creatures.forEach(c => c.sampleFitness(simulatedSec, groundY));

      if (!this.visualLeader || !this.creatures.includes(this.visualLeader)) {
        this.visualLeader = rawLeader;
        this.lastLeaderSwitchAt = now;
      } else {
        const currentX = this.visualLeader.getX();
        if (rawLeader.getX() > currentX + 25 && (now - this.lastLeaderSwitchAt) > 400) {
          this.visualLeader = rawLeader;
          this.lastLeaderSwitchAt = now;
        }
      }
    }

    const leader = this.visualLeader || rawLeader;
    if (leader) {
      this.genBestDist = Math.max(this.genBestDist, this.distMetersFromX(leader.getX()));
      const center = leader.getCenter();
      if (!this.currentGhostPath.length ||
          Math.abs(center.x - this.currentGhostPath[this.currentGhostPath.length - 1].x) > 5) {
        this.currentGhostPath.push({ x: center.x, y: center.y });
        if (this.currentGhostPath.length > 1500) this.currentGhostPath.shift();
      }
    }

    if (this.timer <= 0) {
      if (this.sandboxMode) {
        this.restartSandboxRun();
      } else {
        this.endGeneration();
      }
    }

    if (this.onFrame) {
      this.onFrame(leader, simulatedSec);
    }
  }

  syncCreatureRuntimeSettings() {
    this.creatures.forEach(c => {
      c.simConfig.jointFreedom = this.jointFreedom;
      c.simConfig.muscleStrength = this.muscleStrength;
      c.simConfig.jointMoveSpeed = this.jointMoveSpeed;
      c.simConfig.muscleRange = this.muscleRange;
      c.simConfig.muscleSmoothing = this.muscleSmoothing;
      c.simConfig.selfCollision = this.selfCollision;
      c.simConfig.bodyFriction = this.bodyFriction;
      c.simConfig.bodyStaticFriction = this.bodyStaticFriction;
      c.simConfig.bodyAirFriction = this.bodyAirFriction;
      
      c.updateRuntimeSettings();

      c.bodies.forEach(b => {
        b.friction = this.bodyFriction;
        b.frictionStatic = this.bodyStaticFriction;
        b.frictionAir = this.bodyAirFriction;
      });
    });

    if (this.ground) {
      this.ground.friction = this.groundFriction;
      this.ground.frictionStatic = this.groundStaticFriction;
    }
    this.challengeBodies.forEach(b => {
      b.friction = this.groundFriction;
      b.frictionStatic = this.groundStaticFriction;
    });
  }

  getLastGenerationBrain() {
    if (!this.lastGenerationBrain) return null;
    return {
      version: this.lastGenerationBrain.version,
      createdAt: this.lastGenerationBrain.createdAt,
      generation: this.lastGenerationBrain.generation,
      distance: this.lastGenerationBrain.distance,
      fitness: this.lastGenerationBrain.fitness,
      hiddenLayers: this.lastGenerationBrain.hiddenLayers,
      neuronsPerLayer: this.lastGenerationBrain.neuronsPerLayer,
      dna: Array.from(this.lastGenerationBrain.dna)
    };
  }

  setSandboxBrain(payload) {
    if (!payload || !Array.isArray(payload.dna) || payload.dna.length < 1) {
      throw new Error('Invalid sandbox brain.');
    }
    const dna = payload.dna.map(v => Number(v)).filter(v => Number.isFinite(v));
    if (dna.length !== payload.dna.length) {
      throw new Error('Sandbox brain contains invalid weights.');
    }
    this.sandboxBrainDNA = new Float32Array(dna);
    this.sandboxMode = true;
    if (Number.isFinite(payload.hiddenLayers)) {
      this.hiddenLayers = Math.max(1, Math.min(3, Math.round(payload.hiddenLayers)));
    }
    if (Number.isFinite(payload.neuronsPerLayer)) {
      this.neuronsPerLayer = Math.max(4, Math.min(32, Math.round(payload.neuronsPerLayer)));
    }
  }

  exitSandboxMode() {
    this.sandboxMode = false;
    this.sandboxBrainDNA = null;
  }

  restartSandboxRun() {
    if (!this.sandboxBrainDNA) return;
    this.sandboxRuns += 1;
    this.timer = this.simDuration;
    this.visualLeader = null;
    this.currentGhostPath = [];
    this.spawnGeneration([new Float32Array(this.sandboxBrainDNA)]);
  }
}
