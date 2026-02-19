import { CONFIG } from '../utils/config.js';
import { createEngine, createGround, cleanup, SCALE, planck, World, Vec2, Body, Circle, Box } from './Physics.js';
import { Creature } from './Creature.js';
import { Evolution } from '../nn/Evolution.js';

/**
 * Simulation manager: game loop, generation lifecycle, evolution.
 * Migrated to Planck.js physics engine.
 */
export class Simulation {
  constructor() {
    this.sandboxPaused = false; // pause flag for sandbox mode
    this.world = null;
    this.ground = null;
    this.creatures = [];
    this.generation = 1;
    this.timer = 0;
    this.paused = false;
    this.frameId = null;
    this.lastFrame = 0;
    this.fpsSmoothed = 60;
    this.simTimeElapsed = 0;
    this.selfCollision = true; // Enabled by default to prevent folding

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
    this.showGhosts = true;

    // Callbacks
    this.onGenerationEnd = null;
    this.onFrame = null;

    // Settings
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
    this.muscleActionBudget = CONFIG.defaultMuscleActionBudget;
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
    this.polygons = [];
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
      muscleActionBudget: this.muscleActionBudget,
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
      minEnergyForActuation: this.minEnergyForActuation,
      // Auto-evolving NN architecture
      currentGeneration: this.generation,
      baseFitness: this.championFitness > 0 ? this.championFitness : 0
    };
  }

  spawnGeneration(dnaArray = null, winnerArchitecture = null) {
    // console.log('Spawning generation');
    this.creatures.forEach(c => c.destroy());
    this.creatures = [];

    const bounds = this.designBounds();
    // console.log('Design bounds:', bounds);
    const relMaxY = bounds.maxY - bounds.minY;
    const startX = this.spawnX;
    const startY = this.getGroundY() - CONFIG.spawnClearance - CONFIG.nodeRadius - relMaxY;
    // console.log(`Spawn position: (${startX}, ${startY})`);

    const creatureCount = this.sandboxMode ? 1 : this.popSize;
    
    // console.log(`Spawning ${creatureCount} creatures`);
    
    // Create config that includes parent architecture for inheritance
    const spawnConfig = this.getSimConfig();
    
    for (let i = 0; i < creatureCount; i++) {
      const creatureConfig = { ...spawnConfig };
      
      // Pass architecture info to creature
      if (dnaArray && dnaArray[i] && dnaArray[i].architecture) {
        // Offspring inherits architecture from parent
        creatureConfig.parentHiddenLayers = dnaArray[i].architecture.hiddenLayers;
        creatureConfig.parentNeuronsPerLayer = dnaArray[i].architecture.neuronsPerLayer;
      } else if (winnerArchitecture) {
        // Generation 2+: inherit from winner with some mutation
        let mutatedLayers = winnerArchitecture.hiddenLayers;
        let mutatedNeurons = winnerArchitecture.neuronsPerLayer;
        
        // Architecture mutation: 10% chance to add/remove layer, 15% chance to change neuron count
        if (Math.random() < 0.10) {
          // Mutate layer count
          const delta = Math.random() < 0.5 ? -1 : 1;
          mutatedLayers = Math.max(0, Math.min(6, mutatedLayers + delta));
        }
        if (Math.random() < 0.15) {
          // Mutate neuron count
          const delta = (Math.floor(Math.random() * 4) - 2) * 2; // -4, -2, 0, 2, 4
          mutatedNeurons = Math.max(4, Math.min(32, mutatedNeurons + delta));
        }
        
        creatureConfig.parentHiddenLayers = mutatedLayers;
        creatureConfig.parentNeuronsPerLayer = mutatedNeurons;
      }
      
      const dna = dnaArray && dnaArray[i] ? dnaArray[i].dna : null;
      // console.log(`Creating creature ${i}`);
      const creature = new Creature(
        this.world, startX, startY,
        this.nodes, this.constraints, this.polygons,
        dna, bounds.minX, bounds.minY,
        creatureConfig,
        i
      );
      
      // Store creature's architecture for next generation
      creature.storedArchitecture = creature.architecture;
      // console.log(`Created creature ${i} with ${creature.bodies.length} bodies and ${creature.muscles.length} muscles`);
      this.creatures.push(creature);
    }
    // console.log(`Spawned ${this.creatures.length} creatures`);
  }

  startSimulation() {
    if (this.nodes.length < 2 || this.constraints.length < 1) {
      return false;
    }

    // Guard: don't start if already running
    if (this.frameId) {
      return true;
    }
    
    this.stopLoop();
    this.clearSimulation();

    this.world = createEngine(this.gravity); // Earth gravity ~9.8 m/s²

    // Set up collision filtering
this.world.on('begin-contact', (contact) => {
  const fixtureA = contact.getFixtureA();
  const fixtureB = contact.getFixtureB();
  const bodyA = fixtureA.getBody();
  const bodyB = fixtureB.getBody();

  // Skip collision ONLY between DIRECTLY connected bodies (jointed together)
  // Non-connected bodies from same creature should collide (self-collision)
  if (bodyA.creatureId === bodyB.creatureId) {
    if (bodyA.connectedBodies && bodyA.connectedBodies.has(bodyB)) {
      contact.setEnabled(false); // Connected bodies don't collide
    }
  }
});

this.world.on('pre-solve', (contact) => {
  const fixtureA = contact.getFixtureA();
  const fixtureB = contact.getFixtureB();
  const bodyA = fixtureA.getBody();
  const bodyB = fixtureB.getBody();

  // Skip collision ONLY between DIRECTLY connected bodies (jointed together)
  // Non-connected bodies from same creature should collide (self-collision)
  if (bodyA.creatureId === bodyB.creatureId) {
    if (bodyA.connectedBodies && bodyA.connectedBodies.has(bodyB)) {
      contact.setEnabled(false); // Connected bodies don't collide
    }
    // else: non-connected bodies DO collide (prevents folding)
  }
});

    this.ground = createGround(this.world, this.getGroundY(), {
      friction: this.groundFriction
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
    this.frameId = requestAnimationFrame(timestamp => this.gameLoop(timestamp));
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
    if (this.world) {
      cleanup(this.world);
      this.world = null;
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
    if (!this.world) return;
    
    // Remove existing challenge bodies
    this.challengeBodies.forEach(body => {
      this.world.destroyBody(body);
    });
    this.challengeBodies = [];

    // Create ground profile segments
    const bodies = [];
    for (let i = 1; i < this.groundProfile.length; i++) {
      const p1 = this.groundProfile[i - 1];
      const p2 = this.groundProfile[i];
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const length = Math.sqrt(dx * dx + dy * dy);
      if (length < 2) continue;
      const angle = Math.atan2(dy, dx);
      
      const body = this.world.createBody({
        type: 'static',
        position: Vec2((p1.x + p2.x) / 2 / SCALE, (p1.y + p2.y) / 2 / SCALE),
        angle: angle
      });
      
      body.createFixture({
        shape: Box(length / 2 / SCALE, 20 / SCALE),
        friction: this.groundFriction,
        restitution: 0
      });
      
      bodies.push(body);
    }

    // Create obstacles
    this.obstacles.forEach(o => {
      const body = this.world.createBody({
        type: 'static',
        position: Vec2(o.x / SCALE, o.y / SCALE)
      });
      
      body.createFixture({
        shape: Box(o.w / 2 / SCALE, o.h / 2 / SCALE),
        friction: this.groundFriction,
        restitution: 0
      });
      
      bodies.push(body);
    });

    this.challengeBodies = bodies;
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

    const distanceScale = 1 + distance * 0.02;

    const energyBonus = this.energyEnabled && fitness.energyEfficiency > 0
      ? fitness.energyEfficiency * this.energyEfficiencyBonus
      : 0;

    // SIMPLIFIED FITNESS: Distance-first approach
    // Let creatures discover walking naturally, only penalize extremes
    
    // Base score: primarily distance traveled
    let score = distance * 10; // Strong distance reward
    
    // Small bonus for speed (encourages forward movement)
    score += fitness.speed * 0.5;
    
    // Energy efficiency bonus (if enabled)
    score += energyBonus;
    
    // ONLY EXTREME PENALTIES:
    // 1. Falling over (stumbles) - moderate penalty
    score -= fitness.stumbles * 2;
    
    // 2. Excessive spinning (> 1 rad/s sustained) - creatures shouldn't just spin
    if (fitness.spin > 1.0) {
      score -= (fitness.spin - 1.0) * 5;
    }
    
    // 3. Going backwards (negative distance)
    if (distance < 0) {
      score -= Math.abs(distance) * 5;
    }
    
    // That's it! No penalties for:
    // - Being unstable while learning
    // - Air time while jumping
    // - Ground slip while finding grip
    // - Movement jerkiness while experimenting
    // - Minor spinning while balancing
    
    return score;
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
    
    // SIMPLIFIED EVO SCORE: Distance-first, minimal penalties
    // Focus on actual progress, not punishing experimental behaviors
    
    let evoScore = genBest * 10; // Strong reward for distance
    evoScore += avgDist * 5; // Reward population average too
    
    // Small bonuses for good behaviors (not required, just nice)
    evoScore += avgSpeed * 0.1; // Forward movement is good
    
    // Only penalize clear failures
    evoScore -= avgStumbles * 0.5; // Falling is actually bad
    if (avgSpin > 2.0) {
      evoScore -= (avgSpin - 2.0) * 2; // Only penalize excessive spinning
    }
    
    // No stagnation penalty - let creatures take time to discover walking

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
      this.championArchitecture = winner.architecture; // Store winning architecture
      this.championAwards++;
    }

    // Use Evolution engine for next generation
    const evalCreatures = this.creatures.map(c => ({
      dna: c.dna,
      fitness: this.creatureScore(c),
      architecture: c.architecture // Include architecture
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

    // Pass winner's architecture for inheritance
    this.spawnGeneration(nextGenDNA, this.championArchitecture || winner.architecture);

    if (this.onGenerationEnd) {
      this.onGenerationEnd({
        generation: this.generation - 1,
        genBest,
        allTimeBest: this.allTimeBest,
        improvement: this.allTimeBest - this.prevAllTimeBest
      });
    }
  }

  gameLoop(timestamp) {
    // Game loop running - frame requested
    this.frameId = requestAnimationFrame(ts => this.gameLoop(ts));

    const dtMs = Math.max(1, timestamp - this.lastFrame);
    this.lastFrame = timestamp;
    this.fpsSmoothed = this.fpsSmoothed * 0.88 + (1000 / dtMs) * 0.12;

    const fixedDtSec = 1 / CONFIG.fixedStepHz;
    const groundY = this.getGroundY();

    let simulatedSec = 0;
    if (!this.paused && (!this.sandboxMode || !this.sandboxPaused) && this.world) {
      const stepsToRun = Math.min(CONFIG.maxPhysicsStepsPerFrame, Math.max(1, this.simSpeed));

      for (let i = 0; i < stepsToRun; i++) {
        this.syncCreatureRuntimeSettings();
        const time = (this.simTimeElapsed + i * fixedDtSec) * 10;
        this.creatures.forEach(c => c.update(time, groundY));
        
        // Step physics
        this.world.step(fixedDtSec);
        
        // Anti-spin stabilization - apply AFTER each physics step
        this.creatures.forEach(c => {
          c.bodies.forEach(b => {
            const pos = b.getPosition();
            const grounded = (pos.y * SCALE + CONFIG.nodeRadius) >= (groundY - 1.5);
            if (grounded) {
              const vel = b.getLinearVelocity();
              b.setLinearVelocity(Vec2(vel.x * this.tractionDamping, vel.y));
            }
            // Moderate angular damping to prevent spinning
            const damped = b.getAngularVelocity() * 0.90;
            b.setAngularVelocity(Math.max(-5, Math.min(5, damped)));
          });
        });
      }
    simulatedSec = stepsToRun * fixedDtSec;
    this.simTimeElapsed += simulatedSec;
    this.timer -= simulatedSec;
    
    // Debug: log timer every second
    if (Math.floor(this.simTimeElapsed) % 1 === 0 && Math.floor(this.simTimeElapsed) > 0) {
      // console.log(`Timer: ${this.timer.toFixed(1)}s, Gen: ${this.generation}`);
    }
  }

    // Update ground position (only X changes to follow camera, Y stays fixed)
    if (this.ground) {
      const currentPos = this.ground.getPosition();
      this.ground.setPosition(Vec2(
        (this.cameraX + window.innerWidth / 2) / SCALE,
        currentPos.y
      ));
    }

    // Leader tracking
    const rawLeader = this.getLeader();
    if (rawLeader) {
      this.creatures.forEach(c => c.sampleFitness(simulatedSec, groundY));

    if (!this.visualLeader || !this.creatures.includes(this.visualLeader)) {
      this.visualLeader = rawLeader;
      this.lastLeaderSwitchAt = timestamp;
    } else {
      const currentX = this.visualLeader.getX();
      if (rawLeader.getX() > currentX + 25 && (timestamp - this.lastLeaderSwitchAt) > 400) {
        this.visualLeader = rawLeader;
        this.lastLeaderSwitchAt = timestamp;
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
      console.log(`Generation ${this.generation} ended. Best: ${this.genBestDist}m`);
      if (this.sandboxMode) {
        this.restartSandboxRun();
      } else {
        this.endGeneration();
        console.log(`Generation ${this.generation} started with ${this.creatures.length} creatures`);
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
      c.simConfig.muscleActionBudget = this.muscleActionBudget;
      c.simConfig.selfCollision = this.selfCollision;
      c.simConfig.bodyFriction = this.bodyFriction;
      c.simConfig.bodyStaticFriction = this.bodyStaticFriction;
      c.simConfig.bodyAirFriction = this.bodyAirFriction;

      c.updateRuntimeSettings();

      // Update body friction
      c.bodies.forEach(b => {
        let fixture = b.getFixtureList();
        while (fixture) {
          fixture.setFriction(this.bodyFriction);
          fixture = fixture.getNext();
        }
      });
    });

    if (this.ground) {
      let fixture = this.ground.getFixtureList();
      while (fixture) {
        fixture.setFriction(this.groundFriction);
        fixture = fixture.getNext();
      }
    }
    
    this.challengeBodies.forEach(b => {
      let fixture = b.getFixtureList();
      while (fixture) {
        fixture.setFriction(this.groundFriction);
        fixture = fixture.getNext();
      }
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
    this.sandboxPaused = false; // Reset pause state when entering sandbox
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
    this._sandboxGraphData = null; // Reset graph data
    this.sandboxRuns = 0;
  }

  restartSandboxRun() {
    if (!this.sandboxBrainDNA) return;
    this.sandboxRuns += 1;
    this.timer = Infinity; // Unlimited time in sandbox mode
    this.sandboxPaused = false; // Reset pause state
    this.visualLeader = null;
    this.currentGhostPath = [];
    this._sandboxGraphData = null; // Reset graph data
    this.spawnGeneration([new Float32Array(this.sandboxBrainDNA)]);
  }
}
