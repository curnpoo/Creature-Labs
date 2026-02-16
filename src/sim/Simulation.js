import { CONFIG } from '../utils/config.js';
import { createEngine, createGround, cleanup, Engine, Body } from './Physics.js';
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
    this.spawnX = 60;
    this.mutationRate = CONFIG.defaultMutationRate;
    this.mutationSize = CONFIG.defaultMutationSize;
    this.zoom = CONFIG.defaultZoom;
    this.cameraX = 0;
    this.cameraMode = 'lock';
    this.panning = false;
    this.panX = 0;

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
      hiddenLayers: this.hiddenLayers,
      neuronsPerLayer: this.neuronsPerLayer
    };
  }

  spawnGeneration(dnaArray = null) {
    this.creatures.forEach(c => c.destroy());
    this.creatures = [];

    const bounds = this.designBounds();
    const relMaxY = bounds.maxY - bounds.minY;
    const startX = this.spawnX;
    const startY = this.getGroundY() - CONFIG.spawnClearance - CONFIG.nodeRadius - relMaxY;

    for (let i = 0; i < this.popSize; i++) {
      const dna = dnaArray ? dnaArray[i] : null;
      this.creatures.push(
        new Creature(
          this.engine, startX, startY,
          this.nodes, this.constraints,
          dna, bounds.minX, bounds.minY,
          this.getSimConfig()
        )
      );
    }
  }

  startSimulation() {
    if (this.nodes.length < 2 || this.constraints.length < 1) return false;

    this.stopLoop();
    this.clearSimulation();

    this.engine = createEngine(this.gravity);
    this.ground = createGround(this.engine, this.getGroundY());

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
    this.lastFrame = performance.now();
    this.fpsSmoothed = 60;

    this.spawnGeneration();
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
    if (this.engine) {
      cleanup(this.engine);
      this.engine = null;
    }
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
    return (
      distance * 320 +
      fitness.speed * 0.35 +
      fitness.stability * 0.5 -
      fitness.airtimePct * 0.2 -
      fitness.stumbles * 10 -
      fitness.spin * 30 -
      (fitness.actuationJerk || 0) * 40
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

    const popDistances = this.creatures.map(c => this.distMetersContinuousFromX(c.getX()));
    const popFitness = this.creatures.map(c => c.getFitnessSnapshot());
    const avgDist = popDistances.reduce((a, b) => a + b, 0) / Math.max(1, popDistances.length);
    const avgSpeed = popFitness.reduce((a, f) => a + f.speed, 0) / Math.max(1, popFitness.length);
    const avgStability = popFitness.reduce((a, f) => a + f.stability, 0) / Math.max(1, popFitness.length);
    const avgStumbles = popFitness.reduce((a, f) => a + f.stumbles, 0) / Math.max(1, popFitness.length);
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
      evoScore,
      bestFitness: winnerFitness,
      championFitness: this.championFitness
    });
    if (this.progressHistory.length > 120) this.progressHistory.shift();

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
                x: b.velocity.x * 0.8,
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
        y: groundY + 100
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
      this.endGeneration();
    }

    if (this.onFrame) {
      this.onFrame(leader, simulatedSec);
    }
  }
}
