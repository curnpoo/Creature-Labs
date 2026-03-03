import { CONFIG } from '../utils/config.js';
import { createEngine, createGround, cleanup, SCALE, planck, World, Vec2, Body, Circle, Box } from './Physics.js';
import { Creature } from './Creature.js';
import { Evolution } from '../nn/Evolution.js';
import { TurboCoordinator } from './TurboCoordinator.js';
import {
  creatureScoreFromFitness,
  distMetersFromX,
  extractScoreWeights,
  fitnessPassesSlipGate,
  normalizedGroundSlip
} from './fitnessScore.js';

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
    this.importedBrainEntry = null;
    this.lastGenerationBrain = null;
    this.sandboxMode = false;
    this.sandboxBrainDNA = null;
    this.sandboxBrainEntry = null;
    this.sandboxRuns = 0;
    this.showGhosts = true;
    this.viewMode = 'training';
    this.trainingMode = 'normal';
    this.turboEnabled = false;
    this.turboTargetSpeed = 50;
    this.turboCaptureReplay = false;
    this.turboStatus = 'idle';
    this.turboWallPolicy = 'full';
    this.turboWallSoftSpeedScale = 0.35;
    this.turboWallSoftStartScale = 1.8;
    this.turboGenPoleHistory = [];
    this.turboGenPoleCount = 5;
    this.bestRunQueue = [];
    this.bestRunActive = null;
    this.bestRunCursor = 0;
    this.bestRunLoop = false;
    this.bestRunDurationSec = 3;
    this.turboLatestRun = null;
    this.turboAllTimeBestRun = null;
    this.bestRunTrigger = 'everyGen';
    this._turboParityEveryGens = 8;
    this._lastTurboParityGen = 0;
    this.lastTurboUiFrameAt = 0;
    this._turboRunning = false;
    this._turboGenerationDNA = null;
    this._turboCoordinator = new TurboCoordinator();
    this._turboSessionId = 0;
    this.lastTurboError = null;
    this.turboPopulationLive = 0;
    this._replayFramesByCreature = new Map();
    this._replayDistanceByCreature = new Map();
    this._replaySampleAccumSec = 0;
    this._replaySampleIntervalSec = 1 / 20;
    this.testingModeEnabled = false;
    this.testingStatus = 'idle';
    this.testingCycleEveryGens = 1;
    this.testingHistory = [];
    this.lastTestingResult = null;
    this._testingCycleCounter = 0;
    this._testingBudgetMs = 90;
    this._testingBudgetOverruns = 0;
    this._testingTrendWindow = 10;
    this.lastTurboDiagnostics = null;
    this.lastTurboGenerationSummary = null;
    this.trainingAlgorithm = (CONFIG.defaultTrainingAlgorithm || 'neat') === 'legacy' ? 'legacy' : 'neat';
    this.neatStatus = null;

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
    this.groundedThreshold = CONFIG.defaultGroundedThreshold;
    this.groundedUpwardDamping = CONFIG.defaultGroundedUpwardDamping;
    this.groundedDownwardDamping = CONFIG.defaultGroundedDownwardDamping;
    this.maxHorizontalVelocity = CONFIG.defaultMaxHorizontalVelocity;
    this.maxVerticalVelocity = CONFIG.defaultMaxVerticalVelocity;
    this.groundNoSlipEnabled = CONFIG.defaultGroundNoSlipEnabled ?? true;
    this.groundNoSlipFactor = CONFIG.defaultGroundNoSlipFactor ?? 0.1;
    this.groundNoSlipEpsilon = CONFIG.defaultGroundNoSlipEpsilon ?? 0.02;
    this.tiltLimitEnabled = false;
    this.maxTiltDeg = CONFIG.defaultMaxTiltDeg;
    this.maxTiltRad = (this.maxTiltDeg * Math.PI) / 180;
    this.bodyFriction = CONFIG.defaultBodyFriction;
    this.bodyStaticFriction = CONFIG.defaultBodyStaticFriction;
    this.bodyAirFriction = CONFIG.defaultBodyAirFriction;
    this.muscleRange = CONFIG.defaultMuscleRange;
    this.muscleMinLength = CONFIG.defaultMuscleMinLength;
    this.muscleMaxLength = CONFIG.defaultMuscleMaxLength;
    this.muscleSmoothing = CONFIG.defaultMuscleSmoothing;
    this.muscleSignalRateLimit = CONFIG.defaultMuscleSignalRateLimit;
    this.muscleSpringConstant = CONFIG.defaultMuscleSpringConstant;
    this.muscleDamping = CONFIG.defaultMuscleDamping;
    this.groundedBothBodies = CONFIG.defaultGroundedBothBodies;
    this.groundedOneBody = CONFIG.defaultGroundedOneBody;
    this.groundedNoBodies = CONFIG.defaultGroundedNoBodies;
    this.groundedVerticalForceScale = CONFIG.defaultGroundedVerticalForceScale;
    this.groundedDeadbandErrorPx = CONFIG.defaultGroundedDeadbandErrorPx;
    this.groundedDeadbandVelPxPerSec = CONFIG.defaultGroundedDeadbandVelPxPerSec;
    this.groundedSoftZoneErrorPx = CONFIG.defaultGroundedSoftZoneErrorPx;
    this.groundedSoftZoneForceScale = CONFIG.defaultGroundedSoftZoneForceScale;
    this.groundedForceRateLimit = CONFIG.defaultGroundedForceRateLimit;
    this.groundedSignFlipDeadband = CONFIG.defaultGroundedSignFlipDeadband;
    this.groundedMinForceMagnitude = CONFIG.defaultGroundedMinForceMagnitude;
    this.muscleActionBudget = CONFIG.defaultMuscleActionBudget;
    this.distanceRewardWeight = CONFIG.defaultDistanceRewardWeight;
    this.speedRewardWeight = CONFIG.defaultSpeedRewardWeight;
    this.stabilityRewardWeight = CONFIG.defaultStabilityRewardWeight;
    this.rewardStability = false;
    this.jitterPenaltyWeight = CONFIG.defaultJitterPenaltyWeight;
    this.groundSlipPenaltyWeight = Number.isFinite(CONFIG.defaultGroundSlipPenaltyWeight)
      ? CONFIG.defaultGroundSlipPenaltyWeight
      : 0;
    this.groundSlipFailThreshold = Number.isFinite(CONFIG.defaultGroundSlipFailThreshold)
      ? CONFIG.defaultGroundSlipFailThreshold
      : Number.POSITIVE_INFINITY;
    this.slipGraceSeconds = Number.isFinite(CONFIG.defaultSlipGraceSeconds)
      ? CONFIG.defaultSlipGraceSeconds
      : 0;
    this.spinPenaltyWeight = CONFIG.defaultSpinPenaltyWeight;
    this.coordinationBonusWeight = CONFIG.defaultCoordinationBonusWeight;
    this.actuationJerkPenalty = CONFIG.defaultActuationJerkPenalty;
    this.spinThreshold = CONFIG.defaultSpinThreshold;
    this.stumblePenalty = CONFIG.defaultStumblePenalty;
    this.uprightPenaltyWeight = CONFIG.defaultUprightPenaltyWeight;
    this.backwardsPenalty = CONFIG.defaultBackwardsPenalty;
    this.groundedRatioBonusWeight = CONFIG.defaultGroundedRatioBonusWeight;
    this.airtimePenaltyWeight = CONFIG.defaultAirtimePenaltyWeight;
    this.verticalSpeedPenalty = CONFIG.defaultVerticalSpeedPenalty;
    this.spawnX = 60;
    this.spawnCenterX = 60; // updated at spawn time to creature's center pixel
    this.spawnLeftmostX = 60; // updated at spawn time to creature's leftmost point (pixels)
    this.deathWallEnabled = CONFIG.defaultDeathWallEnabled ?? true;
    this.deathWallStartBehindMeters = CONFIG.defaultDeathWallStartBehindMeters ?? 20;
    this.deathWallSpeedMps = CONFIG.defaultDeathWallSpeedMps ?? 1.0;
    this.deathWallThicknessPx = CONFIG.defaultDeathWallThicknessPx ?? 24;
    this.deathWallX = this.spawnCenterX - this.deathWallStartBehindMeters * SCALE;
    this.deathWallBody = null;
    this.pendingDeathWallKills = new Set();
    this.deathWallKillsThisGen = 0;
    this.noSlipAppliedSteps = 0;
    this.noSlipTangentialResidualAccum = 0;
    this.noSlipTangentialSamples = 0;

    // Energy system settings
    this.energyEnabled = false;
    this.maxEnergy = CONFIG.defaultMaxEnergy;
    this.energyRegenRate = CONFIG.defaultEnergyRegenRate;
    this.energyUsagePerActuation = CONFIG.defaultEnergyUsagePerActuation;
    this.minEnergyForActuation = CONFIG.defaultMinEnergyForActuation;
    this.baseDrain = CONFIG.ENERGY_CONFIG.baseDrain;
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
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    this.nodes.forEach(n => {
      minX = Math.min(minX, n.x);
      maxX = Math.max(maxX, n.x);
      minY = Math.min(minY, n.y);
      maxY = Math.max(maxY, n.y);
    });
    return { minX, maxX, minY, maxY };
  }

  resetDeathWall() {
    const anchorX = Number.isFinite(this.spawnLeftmostX) ? this.spawnLeftmostX : this.spawnCenterX;
    this.deathWallX = anchorX - this.deathWallStartBehindMeters * SCALE;
    this.pendingDeathWallKills.clear();
    this.deathWallKillsThisGen = 0;
    if (this.deathWallBody) {
      const pos = this.deathWallBody.getPosition();
      this.deathWallBody.setTransform(Vec2(this.deathWallX / SCALE, pos.y), 0);
      this.deathWallBody.setLinearVelocity(Vec2(0, 0));
      this.deathWallBody.setAngularVelocity(0);
    }
  }

  createDeathWallBody() {
    if (!this.world || !this.deathWallEnabled || this.sandboxMode) {
      this.deathWallBody = null;
      return;
    }
    const wallHalfWidth = Math.max(4, this.deathWallThicknessPx / 2) / SCALE;
    const wallHalfHeightPx = 5000;
    const wall = this.world.createBody({
      type: 'kinematic',
      position: Vec2(this.deathWallX / SCALE, this.getGroundY() / SCALE)
    });
    wall.createFixture({
      shape: Box(wallHalfWidth, wallHalfHeightPx / SCALE),
      isSensor: true,
      filterCategoryBits: 0x0008,
      filterMaskBits: 0x0006
    });
    wall.isDeathWall = true;
    this.deathWallBody = wall;
  }

  queueDeathWallKill(bodyA, bodyB) {
    const wallA = bodyA?.isDeathWall === true;
    const wallB = bodyB?.isDeathWall === true;
    if (!wallA && !wallB) return;
    const creatureBody = wallA ? bodyB : bodyA;
    if (!Number.isInteger(creatureBody?.creatureId)) return;
    this.pendingDeathWallKills.add(creatureBody.creatureId);
  }

  processDeathWallKills() {
    if (!this.pendingDeathWallKills.size) return;
    this.creatures.forEach(creature => {
      if (!this.pendingDeathWallKills.has(creature.id) || creature.dead) return;
      creature.dead = true;
      creature.deathReason = 'death_wall';
      creature.deathAt = this.simTimeElapsed;
      const deathX = creature.getX();
      if (Number.isFinite(deathX)) {
        creature.stats.maxX = Math.max(creature.stats.maxX, deathX);
      }
      creature.destroy();
      this.deathWallKillsThisGen++;
    });
    this.pendingDeathWallKills.clear();
  }

  updateDeathWall(dtSec) {
    if (!this.deathWallEnabled || !this.deathWallBody || this.sandboxMode || dtSec <= 0) return;
    this.deathWallX += this.deathWallSpeedMps * SCALE * dtSec;
    const pos = this.deathWallBody.getPosition();
    this.deathWallBody.setTransform(Vec2(this.deathWallX / SCALE, pos.y), 0);
    this.deathWallBody.setLinearVelocity(Vec2(0, 0));
  }

  getSimConfig() {
    return {
      jointFreedom: this.jointFreedom,
      muscleStrength: this.muscleStrength,
      jointMoveSpeed: this.jointMoveSpeed,
      muscleRange: this.muscleRange,
      muscleMinLength: this.muscleMinLength,
      muscleMaxLength: this.muscleMaxLength,
      muscleSmoothing: this.muscleSmoothing,
      muscleSignalRateLimit: this.muscleSignalRateLimit,
      muscleSpringConstant: this.muscleSpringConstant,
      muscleDamping: this.muscleDamping,
      groundedBothBodies: this.groundedBothBodies,
      groundedOneBody: this.groundedOneBody,
      groundedNoBodies: this.groundedNoBodies,
      groundedVerticalForceScale: this.groundedVerticalForceScale,
      groundedDeadbandErrorPx: this.groundedDeadbandErrorPx,
      groundedDeadbandVelPxPerSec: this.groundedDeadbandVelPxPerSec,
      groundedSoftZoneErrorPx: this.groundedSoftZoneErrorPx,
      groundedSoftZoneForceScale: this.groundedSoftZoneForceScale,
      groundedForceRateLimit: this.groundedForceRateLimit,
      groundedSignFlipDeadband: this.groundedSignFlipDeadband,
      groundedMinForceMagnitude: this.groundedMinForceMagnitude,
      maxHorizontalVelocity: this.maxHorizontalVelocity,
      maxVerticalVelocity: this.maxVerticalVelocity,
      groundNoSlipEnabled: this.groundNoSlipEnabled,
      groundNoSlipFactor: this.groundNoSlipFactor,
      groundNoSlipEpsilon: this.groundNoSlipEpsilon,
      tractionDamping: this.tractionDamping,
      muscleActionBudget: this.muscleActionBudget,
      bodyFriction: this.bodyFriction,
      bodyStaticFriction: this.bodyStaticFriction,
      bodyAirFriction: this.bodyAirFriction,
      groundedThreshold: this.groundedThreshold,
      tiltLimitEnabled: this.tiltLimitEnabled,
      maxTiltDeg: this.maxTiltDeg,
      hiddenLayers: this.hiddenLayers,
      neuronsPerLayer: this.neuronsPerLayer,
      energyEnabled: this.energyEnabled,
      maxEnergy: this.maxEnergy,
      energyRegenRate: this.energyRegenRate,
      energyUsagePerActuation: this.energyUsagePerActuation,
      minEnergyForActuation: this.minEnergyForActuation,
      baseDrain: this.baseDrain ?? CONFIG.ENERGY_CONFIG.baseDrain,
      trainingAlgorithm: this.trainingAlgorithm,
      // Auto-evolving NN architecture
      currentGeneration: this.generation,
      baseFitness: this.championFitness > 0 ? this.championFitness : 0
    };
  }

  _setupWorldListeners() {
    this.world.on('begin-contact', (contact) => {
      const fixtureA = contact.getFixtureA();
      const fixtureB = contact.getFixtureB();
      const bodyA = fixtureA.getBody();
      const bodyB = fixtureB.getBody();
      this.queueDeathWallKill(bodyA, bodyB);
      if (bodyA.creatureId === bodyB.creatureId) {
        if (bodyA.connectedBodies && bodyA.connectedBodies.has(bodyB)) {
          contact.setEnabled(false);
        }
      }
    });
    this.world.on('pre-solve', (contact) => {
      const fixtureA = contact.getFixtureA();
      const fixtureB = contact.getFixtureB();
      const bodyA = fixtureA.getBody();
      const bodyB = fixtureB.getBody();
      this.queueDeathWallKill(bodyA, bodyB);
      if (bodyA.creatureId === bodyB.creatureId) {
        if (bodyA.connectedBodies && bodyA.connectedBodies.has(bodyB)) {
          contact.setEnabled(false);
        }
      }
    });
  }

  _recreateWorld() {
    if (this.world) {
      cleanup(this.world);
      this.world = null;
    }
    // Reset challenge body references — they belonged to the old world
    this.challengeBodies = [];
    this.world = createEngine(this.gravity);
    this._setupWorldListeners();
    this.ground = createGround(this.world, this.getGroundY(), {
      friction: this.groundFriction,
      thickness: 16
    });
    this.createDeathWallBody();
    this.rebuildChallengeBodies();
  }

  spawnGeneration(dnaArray = null, winnerArchitecture = null) {
    // console.log('Spawning generation');
    this.creatures.forEach(c => c.destroy());
    this.creatures = [];
    this._recreateWorld();        // fresh physics world each generation
    this.simTimeElapsed = 0;      // fresh gait clock each generation

    const bounds = this.designBounds();
    // console.log('Design bounds:', bounds);
    const relMaxY = bounds.maxY - bounds.minY;
    const startX = this.spawnX;
    this.spawnCenterX = this.spawnX + (bounds.maxX - bounds.minX) / 2;
    this.spawnLeftmostX = startX;
    const startY = this.getGroundY() - CONFIG.spawnClearance - CONFIG.nodeRadius - relMaxY;
    // console.log(`Spawn position: (${startX}, ${startY})`);

    const creatureCount = this.sandboxMode ? 1 : this.popSize;
    
    // console.log(`Spawning ${creatureCount} creatures`);
    
    // Create config that includes parent architecture for inheritance
    const spawnConfig = this.getSimConfig();
    
    for (let i = 0; i < creatureCount; i++) {
      const creatureConfig = { ...spawnConfig };
      
      // Architecture is now handled entirely by Evolution.js
      // Pass full DNA object (with architecture) to creature for proper inheritance
      const dna = dnaArray && dnaArray[i] ? dnaArray[i] : null;
      
      // console.log(`Creating creature ${i}`);
      const creature = new Creature(
        this.world, startX, startY,
        this.nodes, this.constraints,
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
    // DEBUG: Check creatures spawned correctly
    const validCreatures = this.creatures.filter(c => c.bodies.length > 0).length;

    // Anchor death wall behind the actual leftmost spawned body point.
    let leftmost = Number.POSITIVE_INFINITY;
    this.creatures.forEach((creature) => {
      (creature.bodies || []).forEach((body) => {
        const pos = body.getPosition();
        if (!pos) return;
        const x = (pos.x * SCALE) - CONFIG.nodeRadius;
        if (Number.isFinite(x)) leftmost = Math.min(leftmost, x);
      });
    });
    this.spawnLeftmostX = Number.isFinite(leftmost) ? leftmost : startX;
    this.resetDeathWall();
    const creaturesWithMuscles = this.creatures.filter(c => c.muscles.length > 0).length;
    if (validCreatures !== this.creatures.length) {
      console.error(`Gen ${this.generation}: Only ${validCreatures}/${this.creatures.length} creatures have bodies!`);
    }
    if (creaturesWithMuscles === 0) {
      console.error(`Gen ${this.generation}: No creatures have muscles!`);
    }
    console.log(`Gen ${this.generation}: Spawned ${this.creatures.length} creatures, ${validCreatures} with bodies, ${creaturesWithMuscles} with muscles`);
    this._initReplayCaptureForGeneration();
    this._captureReplayFrame(true);
  }

  _initReplayCaptureForGeneration() {
    this._replayFramesByCreature = new Map();
    this._replayDistanceByCreature = new Map();
    this._replaySampleAccumSec = 0;
    this.creatures.forEach(c => {
      this._replayFramesByCreature.set(c.id, []);
      const mx = Number.isFinite(c.stats?.maxX) ? c.stats.maxX : c.getX();
      this._replayDistanceByCreature.set(c.id, mx);
    });
  }

  _captureReplayFrame(force = false, dtSec = 0) {
    this._replaySampleAccumSec += Math.max(0, dtSec);
    if (!force && this._replaySampleAccumSec < this._replaySampleIntervalSec) return;
    this._replaySampleAccumSec = 0;
    this.creatures.forEach(c => {
      const frames = this._replayFramesByCreature.get(c.id);
      if (!frames || !c.bodies || !c.bodies.length) return;
      const nodes = c.bodies.map(b => {
        const p = b.getPosition();
        return { x: p.x * SCALE, y: p.y * SCALE };
      });
      if (!nodes.length) return;
      const center = c.getCenter();
      frames.push({ nodes, center: { x: center.x, y: center.y } });
      if (frames.length > 320) frames.shift();
      const mx = Number.isFinite(c.stats?.maxX) ? c.stats.maxX : c.getX();
      const prev = this._replayDistanceByCreature.get(c.id);
      this._replayDistanceByCreature.set(c.id, Number.isFinite(prev) ? Math.max(prev, mx) : mx);
    });
  }

  startSimulation() {
    if (this.nodes.length < 2 || this.constraints.length < 1) {
      return false;
    }

    this.stopLoop();
    this.clearSimulation();
    this._turboSessionId++;
    if (typeof Evolution.resetNeatState === 'function') {
      Evolution.resetNeatState();
    }
    this.neatStatus = null;

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
    this.bestRunQueue = [];
    this.bestRunActive = null;
    this.bestRunCursor = 0;
    this.turboLatestRun = null;
    this.turboAllTimeBestRun = null;
    this.testingHistory = [];
    this.lastTestingResult = null;
    this.testingStatus = (this.testingModeEnabled && this.turboEnabled && !this.sandboxMode) ? 'running' : 'idle';
    this._testingCycleCounter = 0;
    this._testingBudgetOverruns = 0;
    this.lastTurboDiagnostics = null;
    this.lastTurboGenerationSummary = null;
    this.visualLeader = null;
    this.lastLeaderSwitchAt = 0;
    this.championDNA = null;
    this.championFitness = -Infinity;
    this.championAwards = 0;
    this.simTimeElapsed = 0;
    this.sandboxRuns = 0;
    this.lastFrame = performance.now();
    this.fpsSmoothed = 60;
    this.turboStatus = this.turboEnabled ? 'warming' : 'idle';
    this.lastTurboError = null;
    this.turboPopulationLive = 0;

    const sourceEntry = this.sandboxMode ? this.sandboxBrainEntry : this.importedBrainEntry;
    const sourceBrain = sourceEntry?.dna || (this.sandboxMode ? this.sandboxBrainDNA : this.importedBrainDNA);
    const count = this.sandboxMode ? 1 : this.popSize;
    const seedDNA = sourceEntry
      ? Array.from({ length: count }, () => this._normalizeDnaEntry({
          ...sourceEntry,
          dna: sourceEntry.dna ? new Float32Array(sourceEntry.dna) : null
        }))
      : (sourceBrain
        ? Array.from({ length: count }, () => ({
            controllerType: 'dense',
            dna: new Float32Array(sourceBrain)
          }))
        : null);
    const initialPopulation = (!seedDNA && this.trainingAlgorithm === 'neat' && !this.sandboxMode)
      ? this._evolvePopulation([])
      : seedDNA;
    
    if (this.turboEnabled && !this.sandboxMode) {
      this.trainingMode = 'turbo';
      this._turboGenerationDNA = initialPopulation
        ? initialPopulation.map(item => this._normalizeDnaEntry(item))
        : null;
      this.spawnGeneration(this._turboGenerationDNA);
      if (!this._turboGenerationDNA || !this._turboGenerationDNA.length) {
        this._turboGenerationDNA = this.creatures.map(c => this._buildCreatureSeed(c));
      }
      this.rebuildChallengeBodies();
      this.frameId = requestAnimationFrame(timestamp => this.gameLoop(timestamp));
      this._startTurboLoop();
    } else {
      this.trainingMode = 'normal';
      this.spawnGeneration(initialPopulation);
      this.rebuildChallengeBodies();
      this.frameId = requestAnimationFrame(timestamp => this.gameLoop(timestamp));
    }
    return true;
  }

  stopLoop() {
    if (this.frameId) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }
    this._turboRunning = false;
  }

clearSimulation() {
this.creatures.forEach(c => c.destroy());
this.creatures = [];
this.challengeBodies = [];
this.pendingDeathWallKills.clear();
this.deathWallBody = null;
this.deathWallKillsThisGen = 0;

// Clear memory leak sources
this.progressHistory = [];
this.ghosts = [];
this.currentGhostPath = [];
this.brainHistory = [];
this.replayHistory = [];
this.turboLatestRun = null;
this.turboAllTimeBestRun = null;
this.turboGenPoleHistory = [];
this.bestRunQueue = [];
this.bestRunActive = null;
this.bestRunCursor = 0;
this.testingHistory = [];
this.lastTestingResult = null;
this.testingStatus = (this.testingModeEnabled && this.turboEnabled && !this.sandboxMode) ? 'running' : 'idle';
this._testingCycleCounter = 0;
this._testingBudgetOverruns = 0;
this.lastTurboDiagnostics = null;
this.lastTurboGenerationSummary = null;
this._turboGenerationDNA = null;
this._turboRunning = false;
this.turboStatus = this.turboEnabled ? 'warming' : 'idle';
this.neatStatus = null;
this._sandboxGraphData = null;

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
      type: 'box',
      x: Number(obstacle.x),
      y: Number(obstacle.y),
      w: Math.max(10, Number(obstacle.w) || 60),
      h: Math.max(10, Number(obstacle.h) || 40)
    };
    if (!Number.isFinite(o.x) || !Number.isFinite(o.y)) return;
    this.obstacles.push(o);
    this.rebuildChallengeBodies();
  }

  addTriangleObstacle(obstacle) {
    const o = {
      type: 'triangle',
      x: Number(obstacle.x),
      y: Number(obstacle.y),
      w: Math.max(10, Number(obstacle.w) || 50),
      h: Math.max(10, Number(obstacle.h) || 50)
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
    const segmentThicknessPx = 10;
    const segmentHalfHeight = (segmentThicknessPx / 2) / SCALE;
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
        shape: Box(length / 2 / SCALE, segmentHalfHeight),
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
      
      if (o.type === 'triangle') {
        const hw = o.w / 2 / SCALE;
        const hh = o.h / 2 / SCALE;
        body.createFixture({
          shape: planck.Polygon([
            Vec2(0, -hh),
            Vec2(-hw, hh),
            Vec2(hw, hh)
          ]),
          friction: this.groundFriction,
          restitution: 0
        });
      } else {
        body.createFixture({
          shape: Box(o.w / 2 / SCALE, o.h / 2 / SCALE),
          friction: this.groundFriction,
          restitution: 0
        });
      }
      
      bodies.push(body);
    });

    this.challengeBodies = bodies;
  }

  exportBrain() {
    const leader = this.visualLeader || this.getLeader();
    if (leader?.controllerType === 'neat' && leader?.genome?.toSerializable) {
      return {
        version: 2,
        controllerType: 'neat',
        trainingAlgorithm: this.trainingAlgorithm,
        createdAt: new Date().toISOString(),
        genome: leader.genome.toSerializable(),
        meta: {
          inputCount: Number(leader.genome.inputIds?.length) || 0,
          outputCount: Number(leader.genome.outputIds?.length) || 0,
          nodeCount: Number(leader.genome.nodes?.size) || 0,
          connectionCount: Number(leader.genome.connections?.size) || 0,
          genomeId: Number(leader.genome.id) || null,
          parentIds: Array.isArray(leader.genome.parentIds) ? [...leader.genome.parentIds] : [null, null]
        }
      };
    }
    const sourceDna = this.championDNA || (leader ? leader.dna : null);
    if (!sourceDna) return null;
    return {
      version: 2,
      controllerType: 'dense',
      trainingAlgorithm: this.trainingAlgorithm,
      createdAt: new Date().toISOString(),
      hiddenLayers: this.hiddenLayers,
      neuronsPerLayer: this.neuronsPerLayer,
      dna: Array.from(sourceDna),
      meta: {
        inputCount: null,
        outputCount: null,
        nodeCount: null,
        connectionCount: sourceDna.length,
        genomeId: null,
        parentIds: [null, null]
      }
    };
  }

  importBrain(payload) {
    if (!payload || typeof payload !== 'object') {
      throw new Error('Invalid brain file.');
    }
    const version = Number(payload.version) || 1;
    if (version >= 2 && payload.controllerType === 'neat' && payload.genome) {
      this.importedBrainEntry = this._normalizeDnaEntry({
        controllerType: 'neat',
        genome: payload.genome,
        genomeId: Number(payload?.meta?.genomeId) || null
      });
      this.importedBrainDNA = null;
      return;
    }
    if (!Array.isArray(payload.dna) || payload.dna.length < 1) {
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
    this.importedBrainEntry = this._normalizeDnaEntry({
      controllerType: 'dense',
      dna: this.importedBrainDNA,
      architecture: { hiddenLayers: this.hiddenLayers, neuronsPerLayer: this.neuronsPerLayer }
    });
    this.championDNA = new Float32Array(dna);
  }

  getLeader() {
    if (!this.creatures.length) return null;
    const alive = this.creatures.filter(c => !c.dead);
    const pool = alive.length ? alive : this.creatures;
    return pool.reduce((best, curr) => {
      const bestX = Number.isFinite(best?.stats?.maxX) ? best.stats.maxX : best.getX();
      const currX = Number.isFinite(curr?.stats?.maxX) ? curr.stats.maxX : curr.getX();
      return currX > bestX ? curr : best;
    }, pool[0]);
  }

  getAliveCreatureCount() {
    return this.creatures.reduce((count, c) => count + (c.dead ? 0 : 1), 0);
  }

  distMetersFromX(x) {
    return distMetersFromX(x, this.spawnCenterX);
  }

  distMetersContinuousFromX(x) {
    return distMetersFromX(x, this.spawnCenterX);
  }

  creatureScore(creature) {
    const fitness = creature.getFitnessSnapshot();
    const elapsedSec = Number.isFinite(creature?.deathAt)
      ? Math.max(0, Math.min(this.simDuration, creature.deathAt))
      : this.simDuration;
    return creatureScoreFromFitness(
      fitness,
      creature.getX(),
      this.spawnCenterX,
      extractScoreWeights(this),
      elapsedSec
    );
  }

  _normalizeDnaEntry(entry) {
    if (!entry) return { dna: null };
    if (entry instanceof Float32Array) return { dna: new Float32Array(entry) };
    if (Array.isArray(entry)) return { dna: new Float32Array(entry) };
    if (typeof entry === 'object') {
      const normalized = {};
      normalized.controllerType = entry.controllerType === 'neat' ? 'neat' : 'dense';
      if (entry.dna instanceof Float32Array) {
        normalized.dna = new Float32Array(entry.dna);
      } else if (Array.isArray(entry.dna)) {
        normalized.dna = new Float32Array(entry.dna);
      } else {
        normalized.dna = null;
      }
      if (Number.isFinite(entry.genomeId)) normalized.genomeId = Number(entry.genomeId);
      if (entry.genome != null) normalized.genome = entry.genome;
      if (Array.isArray(entry.parents)) normalized.parents = [entry.parents[0] ?? null, entry.parents[1] ?? null];
      if (Number.isFinite(entry.speciesId)) normalized.speciesId = entry.speciesId;
      if (Number.isFinite(entry.generationBorn)) normalized.generationBorn = entry.generationBorn;
      if (entry.architecture != null) normalized.architecture = entry.architecture;
      if (entry.prevArchitecture != null) normalized.prevArchitecture = entry.prevArchitecture;
      return normalized;
    }
    return { dna: null };
  }

  _buildCreatureSeed(creature) {
    const seed = {
      controllerType: creature.controllerType === 'neat' ? 'neat' : 'dense',
      dna: new Float32Array(creature.dna || [])
    };
    if (Number.isFinite(creature?.genome?.id)) seed.genomeId = creature.genome.id;
    if (creature?.genome?.toSerializable) seed.genome = creature.genome.toSerializable();
    if (creature.architecture != null) seed.architecture = creature.architecture;
    if (creature.prevArchitecture != null) seed.prevArchitecture = creature.prevArchitecture;
    return seed;
  }

  _fitnessPassesSlipGate(fitness, elapsedSec) {
    return fitnessPassesSlipGate(fitness || {}, extractScoreWeights(this), elapsedSec);
  }

  _inferMuscleCount() {
    if (Array.isArray(this.constraints) && this.constraints.length) {
      const count = this.constraints.reduce(
        (sum, c) => sum + ((c?.type === 'muscle' || c?.kind === 'muscle') ? 1 : 0),
        0
      );
      if (count > 0) return count;
    }
    const creature = this.creatures.find(c => Array.isArray(c?.muscles) && c.muscles.length > 0);
    return creature ? creature.muscles.length : 0;
  }

  _resolveNeatIoShape(evalCreatures) {
    for (let i = 0; i < evalCreatures.length; i++) {
      const genome = evalCreatures[i]?.genome;
      const inputCount = Number(genome?.inputIds?.length) || 0;
      const outputCount = Number(genome?.outputIds?.length) || 0;
      if (inputCount > 0 && outputCount > 0) {
        return { neatInputCount: inputCount, neatOutputCount: outputCount };
      }
    }

    const muscles = this._inferMuscleCount();
    if (muscles > 0) {
      return {
        neatInputCount: 5 + (muscles * 2),
        neatOutputCount: muscles
      };
    }

    return { neatInputCount: 0, neatOutputCount: 0 };
  }

  _rankPopulationCandidates(candidates) {
    const gateEnabled = Number.isFinite(this.groundSlipFailThreshold);
    const useSlipTieBreak = gateEnabled || (Number(this.groundSlipPenaltyWeight) > 0);
    const prepared = candidates.map((item, idx) => {
      const fitness = item.fitness || {};
      const groundSlip = Number(fitness.groundSlip) || 0;
      const normalizedSlip = normalizedGroundSlip(fitness);
      const distance = Number(item.distance) || 0;
      const score = Number(item.score) || 0;
      const elapsedSec = Number.isFinite(item.elapsedSec) ? Math.max(0, item.elapsedSec) : this.simDuration;
      const slipPass = gateEnabled ? this._fitnessPassesSlipGate(fitness, elapsedSec) : true;
      return { ...item, idx, fitness, groundSlip, normalizedSlip, distance, score, elapsedSec, slipPass };
    });

    const slipPassCount = prepared.reduce((count, item) => count + (item.slipPass ? 1 : 0), 0);
    const allFail = slipPassCount === 0;
    const ranked = prepared.slice().sort((a, b) => {
      if (!allFail && a.slipPass !== b.slipPass) return a.slipPass ? -1 : 1;
      if (allFail) {
        if (useSlipTieBreak && a.normalizedSlip !== b.normalizedSlip) return a.normalizedSlip - b.normalizedSlip;
        if (a.distance !== b.distance) return b.distance - a.distance;
        if (a.score !== b.score) return b.score - a.score;
      } else {
        if (a.score !== b.score) return b.score - a.score;
        if (useSlipTieBreak && a.normalizedSlip !== b.normalizedSlip) return a.normalizedSlip - b.normalizedSlip;
        if (a.distance !== b.distance) return b.distance - a.distance;
      }
      return a.idx - b.idx;
    });

    const topFive = ranked.slice(0, 5);
    const top5AvgSlip = topFive.length
      ? topFive.reduce((sum, item) => sum + item.normalizedSlip, 0) / topFive.length
      : 0;
    return {
      ranked,
      slipPassCount,
      slipPassRate: prepared.length ? (slipPassCount / prepared.length) : 0,
      top5AvgSlip,
      allFail,
      allFailRate: allFail ? 1 : 0
    };
  }

  _computeAverageSpeedMps(entries) {
    if (!Array.isArray(entries) || !entries.length) return 0;
    const total = entries.reduce((sum, item) => {
      const distance = Number(item?.distance) || 0;
      const elapsed = Number(item?.elapsedSec);
      const safeElapsed = Number.isFinite(elapsed)
        ? Math.max(1e-3, elapsed)
        : Math.max(1e-3, this.simDuration);
      const speed = Math.max(0, distance / safeElapsed);
      return sum + speed;
    }, 0);
    return total / entries.length;
  }

  _evolvePopulation(evalCreatures) {
    const ioShape = this._resolveNeatIoShape(evalCreatures);
    const stagnationPressure = Math.max(0, Math.min(1, this.stagnantGens / 20));
    const baseAddNodeRate = Number(CONFIG.EVOLUTION_CONFIG?.neatAddNodeRate ?? 0.06);
    const baseAddConnRate = Number(CONFIG.EVOLUTION_CONFIG?.neatAddConnRate ?? 0.12);
    const config = {
      mutationRate: this.effectiveMutationRate(),
      mutationSize: this.mutationSize,
      stagnantGens: this.stagnantGens,
      trainingAlgorithm: this.trainingAlgorithm,
      neatMode: this.trainingAlgorithm === 'neat',
      neatInputCount: ioShape.neatInputCount,
      neatOutputCount: ioShape.neatOutputCount,
      neatSurvivalRate: CONFIG.EVOLUTION_CONFIG?.neatSurvivalRate,
      neatTournamentSize: CONFIG.EVOLUTION_CONFIG?.neatTournamentSize,
      neatSpeciesStagnation: CONFIG.EVOLUTION_CONFIG?.neatSpeciesStagnation,
      neatCrossoverRate: CONFIG.EVOLUTION_CONFIG?.neatCrossoverRate,
      neatCompatThreshold: CONFIG.EVOLUTION_CONFIG?.neatCompatThreshold,
      neatCompatThresholdMin: CONFIG.EVOLUTION_CONFIG?.neatCompatThresholdMin,
      neatCompatThresholdMax: CONFIG.EVOLUTION_CONFIG?.neatCompatThresholdMax,
      neatTargetSpeciesMin: CONFIG.EVOLUTION_CONFIG?.neatTargetSpeciesMin,
      neatTargetSpeciesMax: CONFIG.EVOLUTION_CONFIG?.neatTargetSpeciesMax,
      neatCompatAdjustStep: CONFIG.EVOLUTION_CONFIG?.neatCompatAdjustStep,
      neatC1: CONFIG.EVOLUTION_CONFIG?.neatC1,
      neatC2: CONFIG.EVOLUTION_CONFIG?.neatC2,
      neatC3: CONFIG.EVOLUTION_CONFIG?.neatC3,
      neatWeightMutRate: CONFIG.EVOLUTION_CONFIG?.neatWeightMutRate,
      neatWeightPerturbRate: CONFIG.EVOLUTION_CONFIG?.neatWeightPerturbRate,
      neatWeightPerturbStd: CONFIG.EVOLUTION_CONFIG?.neatWeightPerturbStd,
      neatWeightResetStd: CONFIG.EVOLUTION_CONFIG?.neatWeightResetStd,
      neatBiasMutRate: CONFIG.EVOLUTION_CONFIG?.neatBiasMutRate,
      neatBiasPerturbStd: CONFIG.EVOLUTION_CONFIG?.neatBiasPerturbStd,
      neatToggleRate: CONFIG.EVOLUTION_CONFIG?.neatToggleRate,
      neatDisableInheritedRate: CONFIG.EVOLUTION_CONFIG?.neatDisableInheritedRate,
      neatReenableBias: CONFIG.EVOLUTION_CONFIG?.neatReenableBias,
      neatSparseEnabledTarget: CONFIG.EVOLUTION_CONFIG?.neatSparseEnabledTarget,
      initialConnectionDensity: CONFIG.EVOLUTION_CONFIG?.initialConnectionDensity,
      initialWeightStd: CONFIG.EVOLUTION_CONFIG?.initialWeightStd,
      // Structural exploration ramps up during prolonged stagnation.
      neatAddNodeRate: Math.min(0.06, baseAddNodeRate + (0.025 * stagnationPressure)),
      neatAddConnRate: Math.min(0.30, baseAddConnRate + (0.15 * stagnationPressure))
    };

    let rawNextGen = null;
    rawNextGen = Evolution.evolve(evalCreatures, this.popSize, config);

    this.neatStatus = this.trainingAlgorithm === 'neat'
      ? (Evolution.getNeatStatus?.() || this.neatStatus)
      : null;

    const asArray = Array.isArray(rawNextGen) ? rawNextGen : [];
    if (!asArray.length) return [];
    return asArray.map(entry => this._normalizeDnaEntry(entry));
  }

  effectiveMutationRate() {
    return Math.min(
      CONFIG.maxMutationRate,
      this.mutationRate + this.stagnantGens * CONFIG.stagnantMutBonus
    );
  }

  enqueueBestRun(payload) {
    if (!payload || !Array.isArray(payload.path) || payload.path.length < 2) return;
    this.bestRunActive = {
      ...payload,
      durationSec: Number.isFinite(payload.durationSec) ? payload.durationSec : this.simDuration
    };
    this.bestRunQueue = [];
    this.bestRunCursor = 0;
  }

  _startNextBestRun() {
    // no-op kept for compatibility; replay now tracks latest completed generation
  }

  _ensureBestRunFromHistory() {
    if (this.bestRunActive) return;
    const latest = this.replayHistory.length ? this.replayHistory[this.replayHistory.length - 1] : null;
    if (!latest || !Array.isArray(latest.path) || latest.path.length < 2) return;
    this.bestRunActive = {
      generation: latest.generation,
      distance: latest.distance,
      path: latest.path.slice(),
      replayFrames: Array.isArray(latest.replayFrames) ? latest.replayFrames.slice() : [],
      isAllTimeBest: false,
      durationSec: Number.isFinite(latest.durationSec) ? latest.durationSec : this.simDuration,
      createdAt: new Date().toISOString()
    };
    this.bestRunCursor = 0;
  }

  advanceBestRun(simulatedSec) {
    this._ensureBestRunFromHistory();
    if (!this.bestRunActive || simulatedSec <= 0) return;
    const replayFrames = Array.isArray(this.bestRunActive.replayFrames) ? this.bestRunActive.replayFrames : [];
    const path = this.bestRunActive.path || [];
    const frameCount = replayFrames.length || path.length;
    if (!frameCount) {
      return;
    }
    const durationSec = Number.isFinite(this.bestRunActive.durationSec)
      ? this.bestRunActive.durationSec
      : this.bestRunDurationSec;
    const samplesPerSec = frameCount / Math.max(0.1, durationSec);
    this.bestRunCursor += simulatedSec * samplesPerSec;
    if (this.bestRunCursor >= frameCount) {
      this.bestRunCursor = this.bestRunLoop ? 0 : frameCount;
    }
  }

  getBestRunSample() {
    this._ensureBestRunFromHistory();
    if (!this.bestRunActive || !this.bestRunActive.path.length) return null;
    const replayFrames = Array.isArray(this.bestRunActive.replayFrames) ? this.bestRunActive.replayFrames : [];
    const frameCount = replayFrames.length || this.bestRunActive.path.length;
    const playbackFinished = !this.bestRunLoop && this.bestRunCursor >= frameCount;
    const idx = Math.max(0, Math.min(frameCount - 1, Math.floor(this.bestRunCursor)));
    const pathLength = this.bestRunActive.path.length;
    const headIdx = playbackFinished
      ? (pathLength - 1)
      : Math.max(0, Math.min(pathLength - 1, idx));
    const upto = playbackFinished
      ? pathLength
      : Math.max(2, Math.min(pathLength, idx + 1));
    return {
      generation: this.bestRunActive.generation,
      distance: this.bestRunActive.distance,
      isAllTimeBest: this.bestRunActive.isAllTimeBest,
      playbackFinished,
      headPoint: this.bestRunActive.path[headIdx],
      points: this.bestRunActive.path.slice(0, upto),
      replayFrame: (!playbackFinished && replayFrames.length) ? replayFrames[idx] : null
    };
  }

  getTurboAllTimeBestRun() {
    if (!this.turboAllTimeBestRun || !Array.isArray(this.turboAllTimeBestRun.path)) return null;
    return this.turboAllTimeBestRun;
  }

  endGeneration() {
    if (!this.creatures.length) return;
    const genElapsedSec = Math.max(0, Math.min(this.simDuration, this.simTimeElapsed));

    const scoreWeights = extractScoreWeights(this);
    const evaluated = this.creatures.map(creature => {
      const fitness = {
        ...creature.getFitnessSnapshot(),
        deathReason: creature.deathReason || (creature.dead ? 'unknown' : 'timer')
      };
      const elapsedSec = Number.isFinite(creature?.deathAt)
        ? Math.max(0, Math.min(this.simDuration, creature.deathAt))
        : this.simDuration;
      const finalX = creature.getX();
      const peakX = Number.isFinite(fitness.maxX) ? fitness.maxX : finalX;
      return {
        creature,
        fitness,
        elapsedSec,
        finalX,
        distance: this.distMetersFromX(peakX),
        score: creatureScoreFromFitness(
          fitness,
          finalX,
          this.spawnCenterX,
          scoreWeights,
          elapsedSec
        )
      };
    });
    const ranking = this._rankPopulationCandidates(evaluated);
    const ranked = ranking.ranked;
    this.creatures = ranked.map(item => item.creature);
    const winnerEntry = ranked[0];
    const winner = winnerEntry.creature;
    const winnerFitness = winnerEntry.score;
    const distanceWinner = evaluated.reduce((best, curr) => (curr.distance > best.distance ? curr : best), evaluated[0]);
    const winnerDist = Number.isFinite(distanceWinner?.distance) ? distanceWinner.distance : 0;
    // genBestDist tracks peak of ANY creature during the gen; use the higher of that or winner's distance
    const genBest = Math.max(winnerDist, this.genBestDist);
    this.genBestDist = 0; // reset for next generation — live tracking will fill it in
    this.lastGenerationBrain = {
      version: 2,
      controllerType: winner.controllerType || 'dense',
      trainingAlgorithm: this.trainingAlgorithm,
      createdAt: new Date().toISOString(),
      generation: this.generation,
      distance: genBest,
      fitness: winnerFitness,
      hiddenLayers: this.hiddenLayers,
      neuronsPerLayer: this.neuronsPerLayer,
      dna: new Float32Array(winner.dna || []),
      genome: winner?.genome?.toSerializable ? winner.genome.toSerializable() : null,
      meta: {
        inputCount: Number(winner?.genome?.inputIds?.length) || 0,
        outputCount: Number(winner?.genome?.outputIds?.length) || 0,
        nodeCount: Number(winner?.genome?.nodes?.size) || 0,
        connectionCount: Number(winner?.genome?.connections?.size) || 0,
        genomeId: Number(winner?.genome?.id) || null,
        parentIds: Array.isArray(winner?.genome?.parentIds) ? [...winner.genome.parentIds] : [null, null]
      }
    };

    const popDistances = ranked.map(item => item.distance);
    const popFitness = ranked.map(item => item.fitness);
    const avgDist = popDistances.reduce((a, b) => a + b, 0) / Math.max(1, popDistances.length);
    const avgSpeedMps = this._computeAverageSpeedMps(ranked);
    const avgSpeed = avgSpeedMps * SCALE; // legacy compatibility for consumers that still expect px/sec
    const avgSlip = popFitness.reduce((a, f) => a + normalizedGroundSlip(f), 0) / Math.max(1, popFitness.length);
    const avgActuation = popFitness.reduce((a, f) => a + (f.actuationLevel || 0), 0) / Math.max(1, popFitness.length);
    
    // SIMPLIFIED EVO SCORE: Distance-first, minimal penalties
    // Focus on actual progress, not punishing experimental behaviors
    
    let evoScore = genBest * 10; // Strong reward for distance
    evoScore += avgDist * 5; // Reward population average too
    
    // Small bonuses for good behaviors (not required, just nice)
    evoScore += avgSpeedMps * 0.1; // Forward movement is good
    
    // No stagnation penalty - let creatures take time to discover walking

    this.prevAllTimeBest = this.allTimeBest;
    const isAllTimeBest = genBest > this.allTimeBest;
    if (isAllTimeBest) {
      this.allTimeBest = genBest;
    }
    this.stagnantGens = this.allTimeBest > this.prevAllTimeBest ? 0 : this.stagnantGens + 1;

    this.progressHistory.push({
      generation: this.generation,
      genBest,
      genElapsedSec,
      allBest: this.allTimeBest,
      avgDist,
      avgSpeedMps,
      avgSpeed,
      avgSlip,
      avgActuation,
      evoScore,
      bestFitness: winnerFitness,
      championFitness: this.championFitness,
      mutationRate: this.effectiveMutationRate(),
      stagnantGens: this.stagnantGens,
      championAwards: this.championAwards,
      populationSize: this.creatures.length,
      slipPassCount: ranking.slipPassCount,
      slipPassRate: ranking.slipPassRate,
      top5AvgSlip: ranking.top5AvgSlip,
      allFailRate: ranking.allFailRate,
      neatStatus: this.neatStatus
    });
    if (this.progressHistory.length > 300) this.progressHistory.shift();

    // Ghost paths
    if (this.currentGhostPath.length > 5) {
      const replayWinnerId = distanceWinner?.creature?.id;
      const replayFramesRaw = this._replayFramesByCreature.get(replayWinnerId) || [];
      const replayFrames = replayFramesRaw.map(f => ({
        nodes: f.nodes.map(n => ({ x: n.x, y: n.y })),
        center: { x: f.center.x, y: f.center.y }
      }));
      const replayPath = replayFrames.map(f => ({ x: f.center.x, y: f.center.y }));
      const safePath = replayPath.length > 1 ? replayPath : this.currentGhostPath.slice();
      const replayPayload = {
        path: safePath,
        replayFrames,
        generation: this.generation,
        distance: genBest,
        durationSec: Math.max(
          this._replaySampleIntervalSec,
          replayFrames.length * this._replaySampleIntervalSec
        )
      };
      this.ghosts.push({ path: this.currentGhostPath.slice(), generation: this.generation, age: 0 });
      if (this.ghosts.length > 24) this.ghosts.shift();
      this.replayHistory.push(replayPayload);
      if (this.replayHistory.length > CONFIG.replayMax) this.replayHistory.shift();
      this.replayIndex = this.replayHistory.length - 1;
      const shouldQueue = this.bestRunTrigger === 'everyGen' || (this.bestRunTrigger === 'allTimeBest' && isAllTimeBest);
      if (shouldQueue) {
        this.enqueueBestRun({
          ...replayPayload,
          durationSec: replayPayload.durationSec,
          isAllTimeBest,
          createdAt: new Date().toISOString()
        });
      }
    }
    this.currentGhostPath = [];
    this.ghosts.forEach(g => { g.age++; });
    this.ghosts = this.ghosts.filter(g => g.age <= CONFIG.ghostMaxAge);

    // Update champion
    if (winnerFitness > this.championFitness) {
      this.championFitness = winnerFitness;
      this.championDNA = new Float32Array(winner.dna);
      if (winner.architecture != null) this.championArchitecture = winner.architecture;
      this.championAwards++;
    }

    const evalCreatures = ranked.map(item => {
      const c = item.creature;
      const base = {
        controllerType: c.controllerType || (c.genome ? 'neat' : 'dense'),
        genomeId: Number.isFinite(c?.genome?.id) ? c.genome.id : null,
        dna: c.dna,
        fitness: ranking.allFail
          ? (-(item.normalizedSlip * 1000) + item.distance)
          : (item.slipPass ? item.score : (item.score - 1_000_000))
      };
      if (Array.isArray(c?.genome?.parentIds)) base.parents = [...c.genome.parentIds];
      if (Number.isFinite(c?.genome?.speciesId)) base.speciesId = c.genome.speciesId;
      if (Number.isFinite(c?.genome?.generationBorn)) base.generationBorn = c.genome.generationBorn;
      if (c.architecture != null) base.architecture = c.architecture;
      if (c.prevArchitecture != null) base.prevArchitecture = c.prevArchitecture;
      if (c.genome != null) base.genome = c.genome;
      return base;
    });

    const nextGenDNA = this._evolvePopulation(evalCreatures);

    this.generation++;
    this.timer = this.simDuration;
    this.visualLeader = null;

    this.spawnGeneration(nextGenDNA);

    if (this.onGenerationEnd) {
      this.onGenerationEnd({
        generation: this.generation - 1,
        genBest,
        allTimeBest: this.allTimeBest,
        improvement: this.allTimeBest - this.prevAllTimeBest,
        slipPassCount: ranking.slipPassCount,
        slipPassRate: ranking.slipPassRate,
        top5AvgSlip: ranking.top5AvgSlip,
        allFailRate: ranking.allFailRate
      });
    }
  }

  setViewMode(mode) {
    this.viewMode = 'training';
  }

  setTrainingMode(mode) {
    const wasTurbo = this.trainingMode === 'turbo';
    const normalized = mode === 'turbo' ? 'turbo' : 'normal';
    this.trainingMode = normalized;
    this.turboEnabled = normalized === 'turbo';
    if (!this.turboEnabled) {
      this.turboStatus = 'idle';
      this._turboRunning = false;
      if (this.testingModeEnabled) this.testingStatus = 'idle';
      if (wasTurbo) {
        // Invalidate any in-flight worker results before hydrating the live world.
        this._turboSessionId++;
        const hasDesign = this.nodes.length > 1 && this.constraints.length > 0;
        const hasDNA = Array.isArray(this._turboGenerationDNA) && this._turboGenerationDNA.length > 0;
        if (hasDesign && hasDNA && !this.sandboxMode) {
          this.spawnGeneration(this._turboGenerationDNA);
          this.timer = this.simDuration;
          this.paused = false;
          this.visualLeader = null;
          this.viewMode = 'training';
        }
      }
    } else if (!this.sandboxMode) {
      this.turboStatus = 'warming';
      if (this.testingModeEnabled) this.testingStatus = 'running';
      if (this.creatures.length) {
        this._turboGenerationDNA = this.creatures.map(c => this._buildCreatureSeed(c));
      }
    }
  }

  setTrainingAlgorithm(mode) {
    this.trainingAlgorithm = mode === 'legacy' ? 'legacy' : 'neat';
  }

  setBestRunTrigger(mode) {
    this.bestRunTrigger = 'everyGen';
  }

  setTestingMode(enabled) {
    this.testingModeEnabled = !!enabled;
    this.testingStatus = this.testingModeEnabled
      ? (this.trainingMode === 'turbo' ? 'running' : 'idle')
      : 'idle';
  }

  setTurboWallPolicy(policy) {
    const normalized = (policy === 'off' || policy === 'soft' || policy === 'full') ? policy : 'full';
    this.turboWallPolicy = normalized;
  }

  setTurboGenPoleCount(count) {
    const next = Math.max(1, Math.min(20, Math.round(Number(count) || 5)));
    this.turboGenPoleCount = next;
    if (this.turboGenPoleHistory.length > next) {
      this.turboGenPoleHistory = this.turboGenPoleHistory.slice(-next);
    }
  }

  getTurboGenPoleHistory() {
    return Array.isArray(this.turboGenPoleHistory) ? this.turboGenPoleHistory : [];
  }

  resolveTurboWallConfig() {
    const base = {
      deathWallEnabled: !!this.deathWallEnabled,
      deathWallStartBehindMeters: this.deathWallStartBehindMeters,
      deathWallSpeedMps: this.deathWallSpeedMps,
      deathWallThicknessPx: this.deathWallThicknessPx
    };
    if (!base.deathWallEnabled) return base;
    if (this.turboWallPolicy === 'off') {
      return { ...base, deathWallEnabled: false };
    }
    if (this.turboWallPolicy === 'soft') {
      return {
        ...base,
        deathWallStartBehindMeters: base.deathWallStartBehindMeters * this.turboWallSoftStartScale,
        deathWallSpeedMps: base.deathWallSpeedMps * this.turboWallSoftSpeedScale
      };
    }
    return base;
  }

  async _startTurboLoop() {
    if (this._turboRunning || !this.turboEnabled || this.sandboxMode) return;
    this._turboRunning = true;
    this.turboStatus = 'warming';
    try {
      await this._turboCoordinator.init();
      this.turboStatus = 'running';
      while (this._turboRunning && this.turboEnabled && !this.paused && !this.sandboxMode) {
        await this._runTurboGeneration();
      }
    } catch (err) {
      this.lastTurboError = err instanceof Error ? err.message : String(err);
      this.turboStatus = 'fallback';
      if (this.testingModeEnabled) this.testingStatus = 'fail';
      this.turboEnabled = false;
      this.trainingMode = 'normal';
    } finally {
      this._turboRunning = false;
    }
  }

  _makeSeedDNA(count) {
    if (this.importedBrainEntry) {
      return Array.from({ length: count }, () => this._normalizeDnaEntry({
        ...this.importedBrainEntry,
        dna: this.importedBrainEntry.dna ? new Float32Array(this.importedBrainEntry.dna) : null
      }));
    }
    const sourceBrain = this.importedBrainDNA;
    if (!sourceBrain) return null;
    return Array.from({ length: count }, () => ({
      controllerType: 'dense',
      dna: new Float32Array(sourceBrain)
    }));
  }

  _serializeDesignSnapshot() {
    const bounds = this.designBounds();
    return {
      nodes: this.nodes,
      constraints: this.constraints,
      bounds
    };
  }

  async _runTurboGeneration() {
    if (!this.turboEnabled || this.sandboxMode) return;
    const runStartedAt = performance.now();
    const sessionId = this._turboSessionId;
    const targetPop = Math.max(1, Number(this.popSize) || 1);
    const seed = this._makeSeedDNA(targetPop) || Array.from({ length: targetPop }, () => ({ dna: null }));
    const source = Array.isArray(this._turboGenerationDNA) && this._turboGenerationDNA.length
      ? this._turboGenerationDNA
      : seed;
    const dnaArray = source.length >= targetPop
      ? source.slice(0, targetPop)
      : source.concat(seed.slice(0, targetPop - source.length));
    const simConfig = this.getSimConfig();
    simConfig.fixedStepHz = CONFIG.fixedStepHz;
    simConfig.simDuration = this.simDuration;
    simConfig.groundFriction = this.groundFriction;
    simConfig.gravity = this.gravity;
    const turboWallCfg = this.resolveTurboWallConfig();
    simConfig.deathWallEnabled = turboWallCfg.deathWallEnabled;
    simConfig.deathWallStartBehindMeters = turboWallCfg.deathWallStartBehindMeters;
    simConfig.deathWallSpeedMps = turboWallCfg.deathWallSpeedMps;
    simConfig.deathWallThicknessPx = turboWallCfg.deathWallThicknessPx;
    simConfig.maxTiltRad = this.maxTiltRad;
    const designSnapshot = this._serializeDesignSnapshot();
    const spawnCenterX = this.spawnX + (designSnapshot.bounds.maxX - designSnapshot.bounds.minX) / 2;
    const payload = {
      generation: this.generation,
      dnaArray,
      simConfig,
      designSnapshot,
      terrainSnapshot: {
        groundProfile: this.groundProfile || [],
        obstacles: this.obstacles || []
      },
      spawnX: this.spawnX,
      spawnCenterX,
      spawnClearance: CONFIG.spawnClearance,
      nodeRadius: CONFIG.nodeRadius,
      groundY: this.getGroundY(),
      fixedDtSec: 1 / CONFIG.fixedStepHz,
      replaySampleIntervalSec: this._replaySampleIntervalSec,
      captureReplay: this.turboCaptureReplay,
      scoreWeights: extractScoreWeights(this)
    };
    const result = await this._turboCoordinator.evaluateGeneration(payload);
    result.elapsedMs = performance.now() - runStartedAt;
    result.requestedPopulation = targetPop;
    if (sessionId !== this._turboSessionId) return;
    this._applyTurboGenerationResult(result);
  }

  _applyTurboGenerationResult(result) {
    if (!result?.results?.length) return;
    const invalid = result.results.some(r => !Number.isFinite(r.score) || !Number.isFinite(r.distance));
    if (invalid) {
      console.warn('Turbo parity guard: non-finite score detected, falling back to normal mode.');
      this.turboStatus = 'fallback';
      this.turboEnabled = false;
      this.trainingMode = 'normal';
      return;
    }
    const scoreWeights = extractScoreWeights(this);
    const evaluated = result.results.map((entry, idx) => {
      const diagnostics = entry?.diagnostics || {};
      const stepCount = Number(diagnostics.executedSteps) || 0;
      const dt = Number(diagnostics.fixedDtObservedSec) || Number(diagnostics.fixedDtExpectedSec) || (1 / CONFIG.fixedStepHz);
      const elapsedSec = stepCount > 0 ? (stepCount * dt) : this.simDuration;
      const fitness = {
        ...(entry.fitness || {}),
        deathReason: diagnostics.deathReason || 'timer'
      };
      const finalX = Number.isFinite(entry.finalX) ? entry.finalX : Number.NEGATIVE_INFINITY;
      const score = creatureScoreFromFitness(
        fitness,
        finalX,
        this.spawnCenterX,
        scoreWeights,
        elapsedSec
      );
      return {
        raw: entry,
        idx,
        score,
        fitness,
        elapsedSec,
        distance: Number(entry.distance) || 0
      };
    });
    const ranking = this._rankPopulationCandidates(evaluated);
    const ranked = ranking.ranked.map(item => ({
      ...item.raw,
      score: item.score,
      fitness: item.fitness,
      elapsedSec: item.elapsedSec,
      distance: item.distance
    }));
    this.lastTurboDiagnostics = {
      ...(result.diagnostics || {}),
      requestedPopulation: Number(result.requestedPopulation) || this.popSize,
      turboWallPolicy: this.turboWallPolicy
    };
    this.turboPopulationLive = ranked.length;
    this._runTurboParityGuardIfDue(result.results);
    const distanceWinner = result.results.reduce((best, curr) => {
      const bestDist = Number.isFinite(best?.distance) ? best.distance : -Infinity;
      const currDist = Number.isFinite(curr?.distance) ? curr.distance : -Infinity;
      return currDist > bestDist ? curr : best;
    }, result.results[0]);
    const winner = ranked[0];
    const genElapsedSec = Number.isFinite(winner?.elapsedSec)
      ? Math.max(0, Math.min(this.simDuration, Number(winner.elapsedSec)))
      : this.simDuration;
    const winnerFitness = winner.score;
    const genBest = Math.max(winner.distance || 0, this.genBestDist || 0);
    this.genBestDist = 0;
    this.lastGenerationBrain = {
      version: 2,
      controllerType: winner.controllerType || 'dense',
      trainingAlgorithm: this.trainingAlgorithm,
      createdAt: new Date().toISOString(),
      generation: this.generation,
      distance: genBest,
      fitness: winnerFitness,
      hiddenLayers: this.hiddenLayers,
      neuronsPerLayer: this.neuronsPerLayer,
      dna: new Float32Array(winner.dna || []),
      genome: winner?.genome || null,
      meta: {
        inputCount: Number(winner?.genome?.inputIds?.length) || 0,
        outputCount: Number(winner?.genome?.outputIds?.length) || 0,
        nodeCount: Number(Array.isArray(winner?.genome?.nodes) ? winner.genome.nodes.length : 0),
        connectionCount: Number(Array.isArray(winner?.genome?.connections) ? winner.genome.connections.length : 0),
        genomeId: Number(winner?.genomeId) || Number(winner?.genome?.id) || null,
        parentIds: Array.isArray(winner?.parents) ? [...winner.parents] : [null, null]
      }
    };

    const popDistances = ranked.map(r => r.distance || 0);
    const popFitness = ranked.map(r => r.fitness || {});
    const avgDist = popDistances.reduce((a, b) => a + b, 0) / Math.max(1, popDistances.length);
    const avgSpeedMps = this._computeAverageSpeedMps(ranked);
    const avgSpeed = avgSpeedMps * SCALE; // legacy compatibility for consumers that still expect px/sec
    const avgSlip = popFitness.reduce((a, f) => a + normalizedGroundSlip(f), 0) / Math.max(1, popFitness.length);
    const avgActuation = popFitness.reduce((a, f) => a + (f.actuationLevel || 0), 0) / Math.max(1, popFitness.length);
    let evoScore = genBest * 10;
    evoScore += avgDist * 5;
    evoScore += avgSpeedMps * 0.1;

    this.prevAllTimeBest = this.allTimeBest;
    const isAllTimeBest = genBest > this.allTimeBest;
    if (isAllTimeBest) this.allTimeBest = genBest;
    this.stagnantGens = this.allTimeBest > this.prevAllTimeBest ? 0 : this.stagnantGens + 1;
    const poleDistance = Math.max(0, Number(genBest) || 0);
    this.turboGenPoleHistory.push({
      generation: this.generation,
      distance: poleDistance,
      x: this.spawnCenterX + poleDistance * SCALE,
      isAllTimeBest
    });
    if (this.turboGenPoleHistory.length > this.turboGenPoleCount) {
      this.turboGenPoleHistory = this.turboGenPoleHistory.slice(-this.turboGenPoleCount);
    }
    this.progressHistory.push({
      generation: this.generation,
      genBest,
      genElapsedSec,
      allBest: this.allTimeBest,
      avgDist,
      avgSpeedMps,
      avgSpeed,
      avgSlip,
      avgActuation,
      evoScore,
      bestFitness: winnerFitness,
      championFitness: this.championFitness,
      mutationRate: this.effectiveMutationRate(),
      stagnantGens: this.stagnantGens,
      championAwards: this.championAwards,
      populationSize: ranked.length,
      slipPassCount: ranking.slipPassCount,
      slipPassRate: ranking.slipPassRate,
      top5AvgSlip: ranking.top5AvgSlip,
      allFailRate: ranking.allFailRate,
      neatStatus: this.neatStatus
    });
    if (this.progressHistory.length > 300) this.progressHistory.shift();
    this.lastTurboGenerationSummary = {
      generation: this.generation,
      elapsedMs: Number(result.elapsedMs) || 0,
      population: ranked.length,
      winnerDistance: Number(genBest) || 0,
      winnerFitness: Number(winnerFitness) || 0,
      allTimeBest: Number(this.allTimeBest) || 0,
      slipPassCount: ranking.slipPassCount,
      slipPassRate: ranking.slipPassRate,
      top5AvgSlip: ranking.top5AvgSlip,
      allFailRate: ranking.allFailRate
    };

    if (distanceWinner?.path?.length > 5) {
      const replayFrames = Array.isArray(distanceWinner.replayFrames) ? distanceWinner.replayFrames.slice() : [];
      const replayPayload = {
        path: distanceWinner.path.slice(),
        replayFrames,
        generation: this.generation,
        distance: genBest,
        durationSec: Number.isFinite(distanceWinner.durationSec)
          ? distanceWinner.durationSec
          : Math.max(this._replaySampleIntervalSec, replayFrames.length * this._replaySampleIntervalSec)
      };
      this.turboLatestRun = {
        ...replayPayload,
        isAllTimeBest
      };
      if (isAllTimeBest) {
        this.turboAllTimeBestRun = {
          ...replayPayload,
          isAllTimeBest: true
        };
      }
      this.ghosts.push({ path: replayPayload.path.slice(), generation: this.generation, age: 0 });
      if (this.ghosts.length > 24) this.ghosts.shift();
      this.replayHistory.push(replayPayload);
      if (this.replayHistory.length > CONFIG.replayMax) this.replayHistory.shift();
      this.replayIndex = this.replayHistory.length - 1;
      const shouldQueue = this.trainingMode === 'turbo'
        || this.bestRunTrigger === 'everyGen'
        || (this.bestRunTrigger === 'allTimeBest' && isAllTimeBest);
      if (shouldQueue) {
        this.enqueueBestRun({
          ...replayPayload,
          durationSec: replayPayload.durationSec,
          isAllTimeBest,
          createdAt: new Date().toISOString()
        });
      }
    }

    if (winnerFitness > this.championFitness) {
      this.championFitness = winnerFitness;
      this.championDNA = new Float32Array(winner.dna || []);
      if (winner.architecture != null) this.championArchitecture = winner.architecture;
      this.championAwards++;
    }

    const evalCreatures = ranked.map(c => {
      const fitness = c.fitness || {};
      const groundSlip = normalizedGroundSlip(fitness);
      const distance = Number(c.distance) || 0;
      const slipPass = this._fitnessPassesSlipGate(fitness, Number(c.elapsedSec) || this.simDuration);
      const evolved = {
        controllerType: c.controllerType || (c.genome ? 'neat' : 'dense'),
        genomeId: Number.isFinite(c?.genomeId) ? c.genomeId : (Number.isFinite(c?.genome?.id) ? c.genome.id : null),
        dna: new Float32Array(c.dna || []),
        fitness: ranking.allFail
          ? (-(groundSlip * 1000) + distance)
          : (slipPass ? c.score : (c.score - 1_000_000))
      };
      if (Array.isArray(c?.parents)) evolved.parents = [...c.parents];
      if (Number.isFinite(c?.speciesId)) evolved.speciesId = c.speciesId;
      if (Number.isFinite(c?.generationBorn)) evolved.generationBorn = c.generationBorn;
      if (c.architecture != null) evolved.architecture = c.architecture;
      if (c.prevArchitecture != null) evolved.prevArchitecture = c.prevArchitecture;
      if (c.genome != null) evolved.genome = c.genome;
      return evolved;
    });
    const nextGenDNA = this._evolvePopulation(evalCreatures);
    this._turboGenerationDNA = nextGenDNA.map(item => this._normalizeDnaEntry(item));

    this._runTurboTestingCycle({
      generation: this.generation,
      ranked,
      rawResults: result.results,
      diagnostics: result.diagnostics || null
    });

    this.generation++;
    this.timer = this.simDuration;
    this.simTimeElapsed += this.simDuration;
    if (this.onGenerationEnd) {
      this.onGenerationEnd({
        generation: this.generation - 1,
        genBest,
        allTimeBest: this.allTimeBest,
        improvement: this.allTimeBest - this.prevAllTimeBest,
        slipPassCount: ranking.slipPassCount,
        slipPassRate: ranking.slipPassRate,
        top5AvgSlip: ranking.top5AvgSlip,
        allFailRate: ranking.allFailRate
      });
    }
  }

  _runTurboParityGuardIfDue(results) {
    if (!Array.isArray(results) || !results.length) return;
    if ((this.generation - this._lastTurboParityGen) < this._turboParityEveryGens) return;
    this._lastTurboParityGen = this.generation;
    const recomputed = results.map((r, idx) => ({
      genomeId: Number.isFinite(r?.genomeId) ? r.genomeId : idx,
      score: creatureScoreFromFitness(
        r.fitness || {},
        Number.isFinite(r.finalX) ? r.finalX : Number.NEGATIVE_INFINITY,
        this.spawnCenterX,
        extractScoreWeights(this)
      )
    }));
    const byTurbo = results.map((r, idx) => ({
      genomeId: Number.isFinite(r?.genomeId) ? r.genomeId : idx,
      score: r.score
    })).sort((a, b) => b.score - a.score);
    const byMain = recomputed.sort((a, b) => b.score - a.score);
    const topN = Math.min(5, byTurbo.length, byMain.length);
    let mismatches = 0;
    for (let i = 0; i < topN; i++) {
      if (byTurbo[i].genomeId !== byMain[i].genomeId) mismatches++;
    }
    if (mismatches > Math.ceil(topN * 0.4)) {
      console.warn(`Turbo parity warning (G${this.generation}): ${mismatches}/${topN} top-rank mismatch vs main-thread score recompute.`);
    }
  }

  _runTurboTestingCycle(ctx) {
    if (!this.testingModeEnabled || this.trainingMode !== 'turbo') return;
    if (!ctx || !Array.isArray(ctx.rawResults) || !ctx.rawResults.length) return;
    if (ctx.generation % Math.max(1, this.testingCycleEveryGens) !== 0) return;

    const startedAt = performance.now();
    const expectedDtSec = 1 / CONFIG.fixedStepHz;
    const diagnostics = ctx.diagnostics || {};
    const fixedDtObserved = Number.isFinite(diagnostics.fixedDtObservedSec)
      ? diagnostics.fixedDtObservedSec
      : expectedDtSec;
    const totalExpectedSteps = Math.max(1, Number(diagnostics.expectedSteps) || 0);
    const totalExecutedSteps = Math.max(0, Number(diagnostics.executedSteps) || totalExpectedSteps);
    const stepCoverageRatio = Math.min(2, totalExecutedSteps / Math.max(1, totalExpectedSteps));

    const turboOrder = ctx.rawResults
      .map((r, idx) => ({ idx, score: Number(r.score) || 0 }))
      .sort((a, b) => b.score - a.score);
    const recomputedOrder = ctx.rawResults
      .map((r, idx) => ({
        idx,
        score: creatureScoreFromFitness(
          r.fitness || {},
          Number.isFinite(r.finalX) ? r.finalX : Number.NEGATIVE_INFINITY,
          this.spawnCenterX,
          extractScoreWeights(this)
        )
      }))
      .sort((a, b) => b.score - a.score);

    const rankMap = new Map();
    recomputedOrder.forEach((item, i) => rankMap.set(item.idx, i + 1));
    let sumD2 = 0;
    turboOrder.forEach((item, i) => {
      const r1 = i + 1;
      const r2 = rankMap.get(item.idx) || r1;
      const d = r1 - r2;
      sumD2 += d * d;
    });
    const n = Math.max(1, turboOrder.length);
    const rankSpearman = n > 1 ? Math.max(-1, Math.min(1, 1 - (6 * sumD2) / (n * (n * n - 1)))) : 1;

    const k = Math.min(8, turboOrder.length, recomputedOrder.length);
    let rankTopKMismatch = 0;
    for (let i = 0; i < k; i++) {
      if (turboOrder[i].idx !== recomputedOrder[i].idx) rankTopKMismatch++;
    }

    const turboWinner = ctx.rawResults[turboOrder[0].idx];
    const baselineWinner = ctx.rawResults[recomputedOrder[0].idx];
    const winnerDistanceTurbo = Number(turboWinner?.distance) || 0;
    const winnerDistanceBaseline = Number(baselineWinner?.distance) || 0;
    const winnerDistanceDeltaPct = Math.abs(winnerDistanceTurbo - winnerDistanceBaseline)
      / Math.max(1e-6, Math.abs(winnerDistanceBaseline) || 1) * 100;

    const median = arr => {
      if (!arr.length) return 0;
      const sorted = arr.slice().sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) * 0.5;
    };
    const turboMedian = median(ctx.rawResults.map(r => Number(r.score) || 0));
    const baselineMedian = median(recomputedOrder.map(r => Number(r.score) || 0));
    const scoreMedianDeltaPct = Math.abs(turboMedian - baselineMedian)
      / Math.max(1e-6, Math.abs(baselineMedian) || 1) * 100;

    const slope = points => {
      if (!Array.isArray(points) || points.length < 2) return 0;
      const nPts = points.length;
      let sumX = 0;
      let sumY = 0;
      let sumXY = 0;
      let sumXX = 0;
      for (let i = 0; i < nPts; i++) {
        const x = i;
        const y = Number(points[i]?.genBest) || 0;
        sumX += x;
        sumY += y;
        sumXY += x * y;
        sumXX += x * x;
      }
      const denom = nPts * sumXX - sumX * sumX;
      if (!denom) return 0;
      return (nPts * sumXY - sumX * sumY) / denom;
    };
    const recentWindow = Math.max(8, this._testingTrendWindow);
    const recent = this.progressHistory.slice(-recentWindow);
    const previous = this.progressHistory.slice(-(recentWindow * 2), -recentWindow);
    const improvementSlopeTurbo = slope(recent);
    const improvementSlopeBaseline = previous.length >= 3 ? slope(previous) : improvementSlopeTurbo;
    const trendRatio = improvementSlopeBaseline > 1e-6
      ? (improvementSlopeTurbo / improvementSlopeBaseline)
      : (improvementSlopeTurbo >= 0 ? 1 : 0);

    const reasons = [];
    if (stepCoverageRatio < 0.98) reasons.push(`step_coverage_low (${(stepCoverageRatio * 100).toFixed(1)}%)`);
    if (rankSpearman < 0.98) reasons.push(`rank_correlation_low (${rankSpearman.toFixed(2)})`);
    if (rankTopKMismatch > 2) reasons.push(`topk_mismatch_high (${rankTopKMismatch})`);
    if (winnerDistanceDeltaPct > 1.5) reasons.push(`winner_delta_high (${winnerDistanceDeltaPct.toFixed(1)}%)`);
    if (scoreMedianDeltaPct > 2.5) reasons.push(`median_delta_high (${scoreMedianDeltaPct.toFixed(1)}%)`);
    if (trendRatio < 0.7) reasons.push(`trend_ratio_low (${(trendRatio * 100).toFixed(0)}%)`);

    const hardFail = stepCoverageRatio < 0.9;
    let status = 'pass';
    if (hardFail || reasons.length >= 2) status = 'fail';
    else if (reasons.length === 1) status = 'warn';

    const elapsedMs = performance.now() - startedAt;
    const workerElapsedMs = Math.max(1, Number(diagnostics.workerElapsedMs) || 0);
    const simulatedSec = Number(this.simDuration) || 0;
    const throughputX = simulatedSec > 0 ? (simulatedSec * 1000) / workerElapsedMs : 0;
    const deathWallKills = Number(diagnostics.deathWallKillCount) || 0;
    const deathWallKillRate = this.popSize > 0 ? deathWallKills / this.popSize : 0;
    if (this.deathWallEnabled && deathWallKillRate <= 0.001) {
      reasons.push('death_wall_no_kills');
    }
    if (elapsedMs > this._testingBudgetMs) {
      this._testingBudgetOverruns += 1;
      reasons.push(`test_budget_exceeded (${elapsedMs.toFixed(0)}ms)`);
      if (status === 'pass') status = 'warn';
      if (this._testingBudgetOverruns >= 3) {
        this.testingCycleEveryGens = Math.min(10, this.testingCycleEveryGens + 2);
      }
    } else if (this._testingBudgetOverruns > 0) {
      this._testingBudgetOverruns -= 1;
    }

    const cycle = {
      generation: ctx.generation,
      timestamp: Date.now(),
      fixedDtExpected: expectedDtSec,
      fixedDtObserved,
      stepCoverageRatio,
      rankTopKMismatch,
      rankSpearman,
      winnerDistanceDeltaPct,
      scoreMedianDeltaPct,
      throughputX,
      deathWallKills,
      deathWallKillRate,
      improvementSlopeTurbo,
      improvementSlopeBaseline,
      status,
      reasons
    };

    this.testingHistory.push(cycle);
    if (this.testingHistory.length > 200) this.testingHistory.shift();
    this.lastTestingResult = cycle;
    this.testingStatus = status;
    this._testingCycleCounter += 1;
  }

  getTurboTestSnapshot() {
    const recent = this.testingHistory.slice(-20);
    const passCount = recent.filter(item => item.status === 'pass').length;
    const passRate = recent.length ? passCount / recent.length : 0;
    return {
      enabled: this.testingModeEnabled,
      status: this.testingStatus,
      cadence: this.testingCycleEveryGens,
      cycles: this.testingHistory.length,
      passRate,
      last: this.lastTestingResult
    };
  }

  buildDiagnosticsSnapshot() {
    const scoreWeights = extractScoreWeights(this);
    const leader = this.getLeader();
    const designFixedNodeCount = Array.isArray(this.nodes)
      ? this.nodes.reduce((count, node) => count + (node?.fixed ? 1 : 0), 0)
      : 0;
    const leaderAngleLimiterCount = Array.isArray(leader?.angleLimiters)
      ? leader.angleLimiters.length
      : 0;
    const summarizeCreature = creature => {
      if (!creature) return null;
      const center = creature.getCenter ? creature.getCenter() : { x: 0, y: 0 };
      const fitness = creature.getFitnessSnapshot ? creature.getFitnessSnapshot() : {};
      const bodyPreview = Array.isArray(creature.bodies)
        ? creature.bodies.slice(0, 8).map((b, idx) => {
            const p = b.getPosition();
            const v = b.getLinearVelocity();
            return {
              bodyIndex: idx,
              xPx: Number((p.x * SCALE).toFixed(2)),
              yPx: Number((p.y * SCALE).toFixed(2)),
              vx: Number(v.x.toFixed(4)),
              vy: Number(v.y.toFixed(4)),
              omega: Number(b.getAngularVelocity().toFixed(4))
            };
          })
        : [];
      return {
        id: creature.id,
        dead: !!creature.dead,
        xPx: Number((creature.getX ? creature.getX() : 0).toFixed(2)),
        centerPx: { x: Number(center.x.toFixed(2)), y: Number(center.y.toFixed(2)) },
        fitness,
        score: Number(this.creatureScore(creature).toFixed(5)),
        bodyCount: Array.isArray(creature.bodies) ? creature.bodies.length : 0,
        muscleCount: Array.isArray(creature.muscles) ? creature.muscles.length : 0,
        fixedNodeCount: Number(creature.fixedNodeCount) || 0,
        angleLimiterCount: Array.isArray(creature.angleLimiters) ? creature.angleLimiters.length : 0,
        bodyPreview
      };
    };

    const replay = this.getBestRunSample ? this.getBestRunSample() : null;
    const replayTail = this.replayHistory.slice(-5).map(item => ({
      generation: item.generation,
      distance: item.distance,
      pathPoints: Array.isArray(item.path) ? item.path.length : 0,
      replayFrames: Array.isArray(item.replayFrames) ? item.replayFrames.length : 0
    }));
    const latestProgress = this.progressHistory.slice(-30);
    const latestTesting = this.testingHistory.slice(-50);
    const creaturePreview = this.creatures.slice(0, 3).map(summarizeCreature);
    const turboWallEffective = this.resolveTurboWallConfig();
    return {
      createdAt: new Date().toISOString(),
      simulation: {
        generation: this.generation,
        timer: this.timer,
        simTimeElapsed: this.simTimeElapsed,
        paused: this.paused,
        sandboxMode: this.sandboxMode,
        viewMode: this.viewMode,
        trainingMode: this.trainingMode,
        turboEnabled: this.turboEnabled,
        turboStatus: this.turboStatus,
        turboTargetSpeed: this.turboTargetSpeed,
        turboWallPolicy: this.turboWallPolicy,
        turboPopulationLive: this.turboPopulationLive
      },
      physics: {
        fixedStepHz: CONFIG.fixedStepHz,
        fixedDtSec: 1 / CONFIG.fixedStepHz,
        simDuration: this.simDuration,
        simSpeed: this.simSpeed,
        gravity: this.gravity,
        groundFriction: this.groundFriction,
        bodyFriction: this.bodyFriction,
        deathWallEnabled: this.deathWallEnabled,
        deathWallSpeedMps: this.deathWallSpeedMps,
        turboWallEffective,
        maxHorizontalVelocity: this.maxHorizontalVelocity,
        maxVerticalVelocity: this.maxVerticalVelocity,
        groundNoSlipEnabled: this.groundNoSlipEnabled,
        groundNoSlipFactor: this.groundNoSlipFactor,
        groundNoSlipEpsilon: this.groundNoSlipEpsilon,
        tiltLimitEnabled: this.tiltLimitEnabled,
        maxTiltDeg: this.maxTiltDeg
      },
      evolution: {
        popSize: this.popSize,
        mutationRate: this.mutationRate,
        mutationSize: this.mutationSize,
        effectiveMutationRate: this.effectiveMutationRate(),
        stagnantGens: this.stagnantGens,
        championFitness: this.championFitness,
        championAwards: this.championAwards,
        allTimeBest: this.allTimeBest,
        bestRunTrigger: this.bestRunTrigger,
        scoreWeights,
        neatStatus: this.neatStatus
      },
      diagnostics: {
        turbo: this.lastTurboDiagnostics,
        turboSummary: this.lastTurboGenerationSummary,
        testing: this.getTurboTestSnapshot(),
        locking: {
          fixedNodeCount: designFixedNodeCount,
          angleLimiterCount: leaderAngleLimiterCount
        },
        noSlip: {
          appliedSteps: this.noSlipAppliedSteps,
          groundTangentialResidual: this.noSlipTangentialSamples > 0
            ? (this.noSlipTangentialResidualAccum / this.noSlipTangentialSamples)
            : 0
        },
        populationMismatch: this.lastTurboDiagnostics
          ? Math.max(0, (Number(this.lastTurboDiagnostics.requestedPopulation) || 0) - (Number(this.lastTurboGenerationSummary?.population) || 0))
          : null
      },
      history: {
        progress: latestProgress,
        testing: latestTesting
      },
      replay: replay ? {
        generation: replay.generation,
        distance: replay.distance,
        pointCount: Array.isArray(replay.points) ? replay.points.length : 0,
        hasReplayFrame: !!replay.replayFrame
      } : null,
      replayTail,
      terrain: {
        groundProfile: this.groundProfile,
        obstacles: this.obstacles
      },
      creatureState: {
        aliveCount: this.getAliveCreatureCount(),
        total: this.creatures.length,
        leader: summarizeCreature(leader),
        preview: creaturePreview
      }
    };
  }

  buildCompactDiagnosticsSnapshot() {
    const full = this.buildDiagnosticsSnapshot();
    const progressTail = (full.history?.progress || []).slice(-12).map(item => ({
      generation: item.generation,
      genBest: item.genBest,
      allBest: item.allBest,
      avgDist: item.avgDist,
      bestFitness: item.bestFitness,
      mutationRate: item.mutationRate,
      stagnantGens: item.stagnantGens
    }));
    const testingTail = (full.history?.testing || []).slice(-20).map(item => ({
      generation: item.generation,
      status: item.status,
      throughputX: item.throughputX,
      stepCoverageRatio: item.stepCoverageRatio,
      rankSpearman: item.rankSpearman,
      deathWallKillRate: item.deathWallKillRate,
      trendRatioPct: item.improvementSlopeBaseline && Math.abs(item.improvementSlopeBaseline) > 1e-6
        ? (item.improvementSlopeTurbo / item.improvementSlopeBaseline) * 100
        : (item.improvementSlopeTurbo >= 0 ? 100 : 0),
      reasons: item.reasons
    }));
    const alerts = [];
    if (full.evolution?.stagnantGens >= 20) alerts.push('stagnation_high');
    if ((full.diagnostics?.populationMismatch || 0) > 0) alerts.push('population_mismatch');
    if ((full.diagnostics?.testing?.passRate || 0) < 0.4) alerts.push('testing_pass_rate_low');
    if ((full.diagnostics?.turbo?.deathWallKillCount || 0) === 0 && full.physics?.deathWallEnabled) alerts.push('wall_not_killing');

    return {
      createdAt: full.createdAt,
      simulation: full.simulation,
      physics: full.physics,
      evolution: {
        popSize: full.evolution.popSize,
        mutationRate: full.evolution.mutationRate,
        mutationSize: full.evolution.mutationSize,
        effectiveMutationRate: full.evolution.effectiveMutationRate,
        stagnantGens: full.evolution.stagnantGens,
        championFitness: full.evolution.championFitness,
        allTimeBest: full.evolution.allTimeBest,
        neatStatus: full.evolution.neatStatus || null
      },
      diagnostics: full.diagnostics,
      replay: full.replay,
      creatureStateSummary: {
        aliveCount: full.creatureState.aliveCount,
        total: full.creatureState.total,
        leader: full.creatureState.leader
          ? {
              id: full.creatureState.leader.id,
              dead: full.creatureState.leader.dead,
              xPx: full.creatureState.leader.xPx,
              score: full.creatureState.leader.score,
              bodyCount: full.creatureState.leader.bodyCount,
              muscleCount: full.creatureState.leader.muscleCount,
              fixedNodeCount: full.creatureState.leader.fixedNodeCount,
              angleLimiterCount: full.creatureState.leader.angleLimiterCount
            }
          : null
      },
      history: {
        progress: progressTail,
        testing: testingTail
      },
      alerts
    };
  }

  getDiagnosticsClipboardTextFull() {
    const payload = this.buildDiagnosticsSnapshot();
    return `# Creature-Labs Diagnostics\n` +
      `Generated: ${payload.createdAt}\n` +
      `Mode: ${payload.simulation.trainingMode}/${payload.simulation.viewMode}\n` +
      `Generation: ${payload.simulation.generation}\n\n` +
      `\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\`\n`;
  }

  getDiagnosticsClipboardTextCompact() {
    const payload = this.buildCompactDiagnosticsSnapshot();
    return `# Creature-Labs Diagnostics (Compact)\n` +
      `Generated: ${payload.createdAt}\n` +
      `Mode: ${payload.simulation.trainingMode}/${payload.simulation.viewMode}\n` +
      `Generation: ${payload.simulation.generation}\n\n` +
      `\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\`\n`;
  }

  getDiagnosticsClipboardText() {
    return this.getDiagnosticsClipboardTextFull();
  }

  gameLoop(timestamp) {
    // Game loop running - frame requested
    this.frameId = requestAnimationFrame(ts => this.gameLoop(ts));

    const dtMs = Math.max(1, timestamp - this.lastFrame);
    this.lastFrame = timestamp;
    this.fpsSmoothed = this.fpsSmoothed * 0.88 + (1000 / dtMs) * 0.12;

    if (this.trainingMode === 'turbo' && this.turboEnabled && !this.sandboxMode) {
      if (!this.paused && !this._turboRunning) {
        this._startTurboLoop();
      }
      const turboPlaybackSec = this.paused ? 0 : (dtMs / 1000) * Math.max(1, this.simSpeed);
      this.advanceBestRun(turboPlaybackSec);
      const shouldRenderUi = !this.lastTurboUiFrameAt || (timestamp - this.lastTurboUiFrameAt) >= 80;
      if (shouldRenderUi && this.onFrame) {
        this.lastTurboUiFrameAt = timestamp;
        const leader = this.visualLeader || this.getLeader();
        this.onFrame(leader, turboPlaybackSec);
      }
      return;
    }

    const fixedDtSec = 1 / CONFIG.fixedStepHz;
    const groundY = this.getGroundY();

    let simulatedSec = 0;
    if (!this.paused && (!this.sandboxMode || !this.sandboxPaused) && this.world) {
      // Clamp physics steps to prevent lag spikes while maintaining accuracy
      const stepsToRun = Math.min(25, Math.max(1, this.simSpeed));

      for (let i = 0; i < stepsToRun; i++) {
        this.syncCreatureRuntimeSettings();
        const time = (this.simTimeElapsed + i * fixedDtSec) * 10;
        this.creatures.forEach(c => {
          if (!c.dead) c.update(time, groundY, fixedDtSec);
        });
        
        // Step physics
        this.world.step(fixedDtSec);
        this.updateDeathWall(fixedDtSec);
        this.processDeathWallKills();
        if (this.getAliveCreatureCount() === 0) {
          break;
        }
        
        // Minimal post-step safety clamps only (no non-physical traction or angle teleporting).
        this.creatures.forEach(c => {
          if (c.dead) return;
          c.bodies.forEach(b => {
            const vel = b.getLinearVelocity();
            let vx = vel.x;
            const vy = vel.y;

            if (this.groundNoSlipEnabled && c.isBodyGroundedStrict && c.isBodyGroundedStrict(b)) {
              vx *= this.groundNoSlipFactor;
              if (Math.abs(vx) < this.groundNoSlipEpsilon) vx = 0;
              this.noSlipAppliedSteps++;
              this.noSlipTangentialResidualAccum += Math.abs(vx);
              this.noSlipTangentialSamples++;
            }

            const clampedVx = Math.max(-this.maxHorizontalVelocity, Math.min(this.maxHorizontalVelocity, vx));
            const clampedVy = Math.max(-this.maxVerticalVelocity, Math.min(this.maxVerticalVelocity, vy));
            if (clampedVx !== vel.x || clampedVy !== vel.y) {
              b.setLinearVelocity(Vec2(clampedVx, clampedVy));
            }

            const angle = this.normalizeAngleRad(b.getAngle());
            let angularVelocity = b.getAngularVelocity();
            if (this.tiltLimitEnabled) {
              const pushingFurtherOut = (angle >= this.maxTiltRad && angularVelocity > 0)
                || (angle <= -this.maxTiltRad && angularVelocity < 0);
              if (pushingFurtherOut) angularVelocity = 0;
            }

            const clampedAngularVelocity = Math.max(-5, Math.min(5, angularVelocity));
            if (clampedAngularVelocity !== b.getAngularVelocity()) {
              b.setAngularVelocity(clampedAngularVelocity);
            }
          });
        });

        this._captureReplayFrame(false, fixedDtSec);
      }
    simulatedSec = stepsToRun * fixedDtSec;
    this.simTimeElapsed += simulatedSec;
    this.timer -= simulatedSec;

    if (this.creatures.length > 0 && this.getAliveCreatureCount() === 0) {
      this.timer = 0;
    }
    
    // Debug: log timer every second
    if (Math.floor(this.simTimeElapsed) % 1 === 0 && Math.floor(this.simTimeElapsed) > 0) {
      // console.log(`Timer: ${this.timer.toFixed(1)}s, Gen: ${this.generation}`);
    }
  }

    // Leader tracking
    const rawLeader = this.getLeader();
    if (rawLeader) {
      this.creatures.forEach(c => {
        if (!c.dead) c.sampleFitness(simulatedSec, groundY);
      });

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
      // Track peak across all creatures so a backslide can't erase the record
      const peakThisFrame = this.creatures.reduce((best, c) => {
        const mx = c.stats.maxX;
        return Number.isFinite(mx) ? Math.max(best, mx) : best;
      }, -Infinity);
      if (Number.isFinite(peakThisFrame)) {
        this.genBestDist = Math.max(this.genBestDist, this.distMetersFromX(peakThisFrame));
      }
      const center = leader.getCenter();
      if (!this.currentGhostPath.length ||
        Math.abs(center.x - this.currentGhostPath[this.currentGhostPath.length - 1].x) > 5) {
// Limit ghost path length to prevent memory bloat
if (this.currentGhostPath.length > 200) {
this.currentGhostPath.shift();
}
this.currentGhostPath.push({ x: center.x, y: center.y });
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

    const playbackSec = this.paused ? 0 : simulatedSec;
    this.advanceBestRun(playbackSec);

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
      c.simConfig.muscleMinLength = this.muscleMinLength;
      c.simConfig.muscleMaxLength = this.muscleMaxLength;
      c.simConfig.muscleSmoothing = this.muscleSmoothing;
      c.simConfig.muscleSignalRateLimit = this.muscleSignalRateLimit;
      c.simConfig.muscleSpringConstant = this.muscleSpringConstant;
      c.simConfig.muscleDamping = this.muscleDamping;
      c.simConfig.groundedBothBodies = this.groundedBothBodies;
      c.simConfig.groundedOneBody = this.groundedOneBody;
      c.simConfig.groundedNoBodies = this.groundedNoBodies;
      c.simConfig.groundedThreshold = this.groundedThreshold;
      c.simConfig.tiltLimitEnabled = this.tiltLimitEnabled;
      c.simConfig.maxTiltDeg = this.maxTiltDeg;
      c.simConfig.groundedVerticalForceScale = this.groundedVerticalForceScale;
      c.simConfig.groundedDeadbandErrorPx = this.groundedDeadbandErrorPx;
      c.simConfig.groundedDeadbandVelPxPerSec = this.groundedDeadbandVelPxPerSec;
      c.simConfig.groundedSoftZoneErrorPx = this.groundedSoftZoneErrorPx;
      c.simConfig.groundedSoftZoneForceScale = this.groundedSoftZoneForceScale;
      c.simConfig.groundedForceRateLimit = this.groundedForceRateLimit;
      c.simConfig.groundedSignFlipDeadband = this.groundedSignFlipDeadband;
      c.simConfig.groundedMinForceMagnitude = this.groundedMinForceMagnitude;
      c.simConfig.maxHorizontalVelocity = this.maxHorizontalVelocity;
      c.simConfig.maxVerticalVelocity = this.maxVerticalVelocity;
      c.simConfig.groundNoSlipEnabled = this.groundNoSlipEnabled;
      c.simConfig.groundNoSlipFactor = this.groundNoSlipFactor;
      c.simConfig.groundNoSlipEpsilon = this.groundNoSlipEpsilon;
      c.simConfig.muscleActionBudget = this.muscleActionBudget;
      c.simConfig.bodyFriction = this.bodyFriction;
      c.simConfig.bodyStaticFriction = this.bodyStaticFriction;
      c.simConfig.bodyAirFriction = this.bodyAirFriction;
      c.simConfig.energyEnabled = this.energyEnabled;

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

  normalizeAngleRad(angle) {
    return Math.atan2(Math.sin(angle), Math.cos(angle));
  }

  getLastGenerationBrain() {
    if (!this.lastGenerationBrain) return null;
    const payload = { ...this.lastGenerationBrain };
    if (payload.dna instanceof Float32Array) payload.dna = Array.from(payload.dna);
    return payload;
  }

  _clonePlain(value, fallback = null) {
    if (value == null) return fallback;
    try {
      if (typeof structuredClone === 'function') return structuredClone(value);
    } catch {
      // Fall through.
    }
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return fallback;
    }
  }

  _captureCreatureRuntimeSnapshot(creature) {
    if (!creature) return null;
    const bodyState = body => {
      if (!body || typeof body.getPosition !== 'function') return null;
      const p = body.getPosition();
      const v = body.getLinearVelocity();
      return {
        x: p.x * SCALE,
        y: p.y * SCALE,
        angle: body.getAngle(),
        vx: v.x,
        vy: v.y,
        omega: body.getAngularVelocity()
      };
    };
    const captureMuscle = muscle => ({
      intent: Number.isFinite(muscle?.intent) ? muscle.intent : 0,
      command: Number.isFinite(muscle?.command) ? muscle.command : 0,
      prevCommandDelta: Number.isFinite(muscle?.prevCommandDelta) ? muscle.prevCommandDelta : 0,
      commandOscillationCount: Number.isFinite(muscle?.commandOscillationCount) ? muscle.commandOscillationCount : 0,
      commandDeltaAbsWindow: Number.isFinite(muscle?.commandDeltaAbsWindow) ? muscle.commandDeltaAbsWindow : 0,
      smoothSignal: Number.isFinite(muscle?.smoothSignal) ? muscle.smoothSignal : 0,
      currentLength: Number.isFinite(muscle?.currentLength) ? muscle.currentLength : 0,
      currentExtension: Number.isFinite(muscle?.currentExtension) ? muscle.currentExtension : 0,
      prevLengthForDiag: Number.isFinite(muscle?.prevLengthForDiag) ? muscle.prevLengthForDiag : 0,
      currentSignal: Number.isFinite(muscle?.currentSignal) ? muscle.currentSignal : 0,
      prevActivation: Number.isFinite(muscle?.prevActivation) ? muscle.prevActivation : 0
    });
    return {
      id: creature.id,
      dead: !!creature.dead,
      deathReason: creature.deathReason || null,
      deathAt: Number.isFinite(creature.deathAt) ? creature.deathAt : null,
      stats: this._clonePlain(creature.stats, {}),
      energy: this._clonePlain(creature.energy, {}),
      bodies: Array.isArray(creature.bodies) ? creature.bodies.map(bodyState).filter(Boolean) : [],
      muscles: Array.isArray(creature.muscles) ? creature.muscles.map(captureMuscle) : []
    };
  }

  captureSessionSnapshot() {
    if (this.sandboxMode || !this.world || !this.creatures.length) return null;
    const populationEntries = this.creatures.map(c => this._buildCreatureSeed(c));
    const creatureStates = this.creatures.map(c => this._captureCreatureRuntimeSnapshot(c));
    return {
      runtime: {
        generation: this.generation,
        timer: this.timer,
        simTimeElapsed: this.simTimeElapsed,
        paused: this.paused,
        trainingMode: this.trainingMode,
        turboEnabled: this.turboEnabled,
        turboStatus: this.turboStatus,
        turboTargetSpeed: this.turboTargetSpeed,
        turboPopulationLive: this.turboPopulationLive,
        turboGenPoleCount: this.turboGenPoleCount,
        viewMode: this.viewMode,
        cameraX: this.cameraX,
        cameraY: this.cameraY,
        cameraMode: this.cameraMode,
        zoom: this.zoom,
        simSpeed: this.simSpeed,
        popSize: this.popSize,
        genBestDist: this.genBestDist,
        allTimeBest: this.allTimeBest,
        prevAllTimeBest: this.prevAllTimeBest,
        stagnantGens: this.stagnantGens,
        championFitness: this.championFitness,
        championAwards: this.championAwards,
        deathWallX: this.deathWallX,
        deathWallKillsThisGen: this.deathWallKillsThisGen,
        lastLeaderSwitchAt: this.lastLeaderSwitchAt,
        visualLeaderId: Number.isFinite(this.visualLeader?.id) ? this.visualLeader.id : null
      },
      design: {
        nodes: this._clonePlain(this.nodes, []),
        constraints: this._clonePlain(this.constraints, [])
      },
      terrain: {
        groundProfile: this._clonePlain(this.groundProfile || [], []),
        obstacles: this._clonePlain(this.obstacles || [], [])
      },
      populationEntries,
      creatureStates,
      histories: {
        progressHistory: this._clonePlain(this.progressHistory || [], []),
        ghosts: this._clonePlain(this.ghosts || [], []),
        currentGhostPath: this._clonePlain(this.currentGhostPath || [], []),
        brainHistory: this._clonePlain(this.brainHistory || [], []),
        replayHistory: this._clonePlain(this.replayHistory || [], []),
        turboGenPoleHistory: this._clonePlain(this.turboGenPoleHistory || [], []),
        replayIndex: this.replayIndex,
        replayCursor: this.replayCursor,
        replayPlaying: this.replayPlaying,
        bestRunQueue: this._clonePlain(this.bestRunQueue || [], []),
        bestRunActive: this._clonePlain(this.bestRunActive, null),
        bestRunCursor: this.bestRunCursor,
        testingHistory: this._clonePlain(this.testingHistory || [], []),
        lastTestingResult: this._clonePlain(this.lastTestingResult, null),
        testingStatus: this.testingStatus,
        testingCycleCounter: this._testingCycleCounter,
        testingBudgetOverruns: this._testingBudgetOverruns,
        lastTurboDiagnostics: this._clonePlain(this.lastTurboDiagnostics, null),
        lastTurboGenerationSummary: this._clonePlain(this.lastTurboGenerationSummary, null),
        turboGenerationDNA: Array.isArray(this._turboGenerationDNA)
          ? this._turboGenerationDNA.map(item => this._normalizeDnaEntry(item))
          : null
      },
      imported: {
        importedBrainDNA: this.importedBrainDNA ? new Float32Array(this.importedBrainDNA) : null,
        importedBrainEntry: this.importedBrainEntry ? this._normalizeDnaEntry(this.importedBrainEntry) : null,
        championDNA: this._clonePlain(this.championDNA, null),
        lastGenerationBrain: this._clonePlain(this.lastGenerationBrain, null),
        lastTurboError: this.lastTurboError || null
      }
    };
  }

  _applyCreatureRuntimeSnapshot(creature, state) {
    if (!creature || !state) return;
    if (state.stats && typeof state.stats === 'object') {
      const prevCenter = state.stats.prevCenter && Number.isFinite(state.stats.prevCenter.x) && Number.isFinite(state.stats.prevCenter.y)
        ? { x: state.stats.prevCenter.x, y: state.stats.prevCenter.y }
        : null;
      creature.stats = { ...creature.stats, ...state.stats, prevCenter };
    }
    if (state.energy && typeof state.energy === 'object') {
      creature.energy = { ...creature.energy, ...state.energy };
    }

    const applyBodyState = (body, bodyState) => {
      if (!body || !bodyState) return;
      if (!Number.isFinite(bodyState.x) || !Number.isFinite(bodyState.y)) return;
      const angle = Number.isFinite(bodyState.angle) ? bodyState.angle : 0;
      body.setTransform(Vec2(bodyState.x / SCALE, bodyState.y / SCALE), angle);
      const vx = Number.isFinite(bodyState.vx) ? bodyState.vx : 0;
      const vy = Number.isFinite(bodyState.vy) ? bodyState.vy : 0;
      body.setLinearVelocity(Vec2(vx, vy));
      body.setAngularVelocity(Number.isFinite(bodyState.omega) ? bodyState.omega : 0);
    };

    (state.bodies || []).forEach((bState, idx) => applyBodyState(creature.bodies[idx], bState));

    if (Array.isArray(state.muscles)) {
      const keys = [
        'intent',
        'command',
        'prevCommandDelta',
        'commandOscillationCount',
        'commandDeltaAbsWindow',
        'smoothSignal',
        'currentLength',
        'currentExtension',
        'prevLengthForDiag',
        'currentSignal',
        'prevActivation'
      ];
      state.muscles.forEach((mState, idx) => {
        const m = creature.muscles[idx];
        if (!m || !mState) return;
        keys.forEach(key => {
          if (Number.isFinite(mState[key])) m[key] = mState[key];
        });
      });
    }

    if (state.dead) {
      creature.dead = true;
      creature.deathReason = state.deathReason || creature.deathReason || 'snapshot';
      creature.deathAt = Number.isFinite(state.deathAt) ? state.deathAt : creature.deathAt;
      creature.destroy();
    } else {
      creature.dead = false;
      creature.deathReason = null;
      creature.deathAt = Number.isFinite(state.deathAt) ? state.deathAt : null;
    }
  }

  restoreSessionSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return false;
    const runtime = snapshot.runtime || {};
    const design = snapshot.design || {};
    const terrain = snapshot.terrain || {};
    const histories = snapshot.histories || {};
    const imported = snapshot.imported || {};

    this.stopLoop();
    this.clearSimulation();

    this.sandboxMode = false;
    this.sandboxBrainDNA = null;
    this.sandboxBrainEntry = null;
    this.sandboxPaused = false;
    this.sandboxRuns = 0;

    this.nodes = this._clonePlain(design.nodes, this.nodes || []);
    this.constraints = this._clonePlain(design.constraints, this.constraints || []);
    this.groundProfile = this._clonePlain(terrain.groundProfile || [], []);
    this.obstacles = this._clonePlain(terrain.obstacles || [], []);

    this.generation = Number.isFinite(runtime.generation) ? runtime.generation : 1;
    this.popSize = Number.isFinite(runtime.popSize) ? runtime.popSize : this.popSize;
    this.trainingMode = runtime.trainingMode === 'turbo' ? 'turbo' : 'normal';
    this.turboEnabled = !!runtime.turboEnabled;
    this.turboStatus = typeof runtime.turboStatus === 'string'
      ? runtime.turboStatus
      : (this.turboEnabled ? 'running' : 'idle');
    this.turboTargetSpeed = Number.isFinite(runtime.turboTargetSpeed) ? runtime.turboTargetSpeed : this.turboTargetSpeed;
    this.turboPopulationLive = Number.isFinite(runtime.turboPopulationLive) ? runtime.turboPopulationLive : this.turboPopulationLive;
    this.turboGenPoleCount = Number.isFinite(runtime.turboGenPoleCount)
      ? Math.max(1, Math.min(20, Math.round(runtime.turboGenPoleCount)))
      : this.turboGenPoleCount;
    this.viewMode = runtime.viewMode === 'bestRun' ? 'bestRun' : 'training';
    this.cameraX = Number.isFinite(runtime.cameraX) ? runtime.cameraX : this.cameraX;
    this.cameraY = Number.isFinite(runtime.cameraY) ? runtime.cameraY : this.cameraY;
    this.cameraMode = runtime.cameraMode === 'free' ? 'free' : 'lock';
    this.zoom = Number.isFinite(runtime.zoom) ? runtime.zoom : this.zoom;
    this.simSpeed = Number.isFinite(runtime.simSpeed) ? runtime.simSpeed : this.simSpeed;
    this.genBestDist = Number.isFinite(runtime.genBestDist) ? runtime.genBestDist : 0;
    this.allTimeBest = Number.isFinite(runtime.allTimeBest) ? runtime.allTimeBest : 0;
    this.prevAllTimeBest = Number.isFinite(runtime.prevAllTimeBest) ? runtime.prevAllTimeBest : 0;
    this.stagnantGens = Number.isFinite(runtime.stagnantGens) ? runtime.stagnantGens : 0;
    this.championFitness = Number.isFinite(runtime.championFitness) ? runtime.championFitness : this.championFitness;
    this.championAwards = Number.isFinite(runtime.championAwards) ? runtime.championAwards : this.championAwards;
    this.lastLeaderSwitchAt = Number.isFinite(runtime.lastLeaderSwitchAt) ? runtime.lastLeaderSwitchAt : 0;

    this.progressHistory = this._clonePlain(histories.progressHistory || [], []);
    this.ghosts = this._clonePlain(histories.ghosts || [], []);
    this.currentGhostPath = this._clonePlain(histories.currentGhostPath || [], []);
    this.brainHistory = this._clonePlain(histories.brainHistory || [], []);
    this.replayHistory = this._clonePlain(histories.replayHistory || [], []);
    this.turboGenPoleHistory = this._clonePlain(histories.turboGenPoleHistory || [], []);
    if (this.turboGenPoleHistory.length > this.turboGenPoleCount) {
      this.turboGenPoleHistory = this.turboGenPoleHistory.slice(-this.turboGenPoleCount);
    }
    this.replayIndex = Number.isFinite(histories.replayIndex) ? histories.replayIndex : -1;
    this.replayCursor = Number.isFinite(histories.replayCursor) ? histories.replayCursor : 0;
    this.replayPlaying = !!histories.replayPlaying;
    this.bestRunQueue = this._clonePlain(histories.bestRunQueue || [], []);
    this.bestRunActive = this._clonePlain(histories.bestRunActive, null);
    this.bestRunCursor = Number.isFinite(histories.bestRunCursor) ? histories.bestRunCursor : 0;
    this.testingHistory = this._clonePlain(histories.testingHistory || [], []);
    this.lastTestingResult = this._clonePlain(histories.lastTestingResult, null);
    this.testingStatus = typeof histories.testingStatus === 'string' ? histories.testingStatus : this.testingStatus;
    this._testingCycleCounter = Number.isFinite(histories.testingCycleCounter) ? histories.testingCycleCounter : 0;
    this._testingBudgetOverruns = Number.isFinite(histories.testingBudgetOverruns) ? histories.testingBudgetOverruns : 0;
    this.lastTurboDiagnostics = this._clonePlain(histories.lastTurboDiagnostics, null);
    this.lastTurboGenerationSummary = this._clonePlain(histories.lastTurboGenerationSummary, null);
    this._turboGenerationDNA = Array.isArray(histories.turboGenerationDNA)
      ? histories.turboGenerationDNA.map(item => this._normalizeDnaEntry(item))
      : null;

    this.importedBrainDNA = imported.importedBrainDNA ? new Float32Array(imported.importedBrainDNA) : null;
    this.importedBrainEntry = imported.importedBrainEntry ? this._normalizeDnaEntry(imported.importedBrainEntry) : null;
    this.championDNA = this._clonePlain(imported.championDNA, null);
    this.lastGenerationBrain = this._clonePlain(imported.lastGenerationBrain, null);
    this.lastTurboError = imported.lastTurboError || null;

    const populationEntries = Array.isArray(snapshot.populationEntries)
      ? snapshot.populationEntries.map(item => this._normalizeDnaEntry(item))
      : null;
    if (
      this.trainingAlgorithm === 'neat'
      && Array.isArray(populationEntries)
      && populationEntries.length
      && typeof Evolution.syncNeatPopulation === 'function'
    ) {
      const ioShape = this._resolveNeatIoShape(populationEntries);
      Evolution.syncNeatPopulation(populationEntries, this.popSize, {
        trainingAlgorithm: 'neat',
        neatMode: true,
        neatInputCount: ioShape.neatInputCount,
        neatOutputCount: ioShape.neatOutputCount
      });
    }
    this.spawnGeneration(populationEntries);

    const creatureStates = Array.isArray(snapshot.creatureStates) ? snapshot.creatureStates : [];
    for (let i = 0; i < Math.min(this.creatures.length, creatureStates.length); i++) {
      this._applyCreatureRuntimeSnapshot(this.creatures[i], creatureStates[i]);
    }

    this.timer = Number.isFinite(runtime.timer) ? runtime.timer : this.simDuration;
    this.simTimeElapsed = Number.isFinite(runtime.simTimeElapsed) ? runtime.simTimeElapsed : 0;
    this.paused = !!runtime.paused;
    this.deathWallX = Number.isFinite(runtime.deathWallX) ? runtime.deathWallX : this.deathWallX;
    this.deathWallKillsThisGen = Number.isFinite(runtime.deathWallKillsThisGen) ? runtime.deathWallKillsThisGen : 0;
    if (this.deathWallBody) {
      const pos = this.deathWallBody.getPosition();
      this.deathWallBody.setTransform(Vec2(this.deathWallX / SCALE, pos.y), 0);
      this.deathWallBody.setLinearVelocity(Vec2(0, 0));
      this.deathWallBody.setAngularVelocity(0);
    }

    this.visualLeader = this.creatures.find(c => c.id === runtime.visualLeaderId) || this.getLeader() || null;
    this.lastFrame = performance.now();
    this.fpsSmoothed = Number.isFinite(this.fpsSmoothed) ? this.fpsSmoothed : 60;
    this.frameId = requestAnimationFrame(timestamp => this.gameLoop(timestamp));
    if (this.trainingMode === 'turbo' && this.turboEnabled && !this.paused && !this.sandboxMode) {
      this._startTurboLoop();
    }
    return true;
  }

  setSandboxBrain(payload) {
    if (!payload || typeof payload !== 'object') {
      throw new Error('Invalid sandbox brain.');
    }
    if (Number(payload.version) >= 2 && payload.controllerType === 'neat' && payload.genome) {
      this.sandboxBrainEntry = this._normalizeDnaEntry({
        controllerType: 'neat',
        genome: payload.genome,
        genomeId: Number(payload?.meta?.genomeId) || null
      });
      this.sandboxBrainDNA = null;
      this.sandboxMode = true;
      this.sandboxPaused = false;
      return;
    }
    if (!Array.isArray(payload.dna) || payload.dna.length < 1) {
      throw new Error('Sandbox brain contains invalid weights.');
    }
    const dna = payload.dna.map(v => Number(v)).filter(v => Number.isFinite(v));
    if (dna.length !== payload.dna.length) {
      throw new Error('Sandbox brain contains invalid weights.');
    }
    const entryHiddenLayers = Number.isFinite(payload.hiddenLayers)
      ? Math.max(1, Math.min(3, Math.round(payload.hiddenLayers)))
      : this.hiddenLayers;
    const entryNeuronsPerLayer = Number.isFinite(payload.neuronsPerLayer)
      ? Math.max(4, Math.min(32, Math.round(payload.neuronsPerLayer)))
      : this.neuronsPerLayer;

    if (Number.isFinite(payload.hiddenLayers)) {
      this.hiddenLayers = entryHiddenLayers;
    }
    if (Number.isFinite(payload.neuronsPerLayer)) {
      this.neuronsPerLayer = entryNeuronsPerLayer;
    }

    this.sandboxBrainDNA = new Float32Array(dna);
    this.sandboxBrainEntry = this._normalizeDnaEntry({
      controllerType: 'dense',
      dna: this.sandboxBrainDNA,
      architecture: { hiddenLayers: entryHiddenLayers, neuronsPerLayer: entryNeuronsPerLayer }
    });
    this.sandboxMode = true;
    this.sandboxPaused = false; // Reset pause state when entering sandbox
  }

  exitSandboxMode() {
    this.sandboxMode = false;
    this.sandboxBrainDNA = null;
    this.sandboxBrainEntry = null;
    this._sandboxGraphData = null; // Reset graph data
    this.sandboxRuns = 0;
    if (this.turboEnabled) {
      this.trainingMode = 'turbo';
      this.turboStatus = 'warming';
    }
  }

  restartSandboxRun() {
    if (!this.sandboxBrainDNA && !this.sandboxBrainEntry) return;
    this.sandboxRuns += 1;
    this.timer = Infinity; // Unlimited time in sandbox mode
    this.sandboxPaused = false; // Reset pause state
    this.visualLeader = null;
    this.currentGhostPath = [];
    this._sandboxGraphData = null; // Reset graph data
    if (this.sandboxBrainEntry) {
      this.spawnGeneration([this._normalizeDnaEntry(this.sandboxBrainEntry)]);
    } else {
      this.spawnGeneration([{
        controllerType: 'dense',
        dna: new Float32Array(this.sandboxBrainDNA),
        architecture: { hiddenLayers: this.hiddenLayers, neuronsPerLayer: this.neuronsPerLayer }
      }]);
    }
  }
}
