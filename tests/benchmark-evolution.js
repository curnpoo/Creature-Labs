import fs from 'node:fs';
import path from 'node:path';

import { CONFIG } from '../src/utils/config.js';
import { createEngine, createGround, cleanup, SCALE, Vec2, Box } from '../src/sim/Physics.js';
import { Creature } from '../src/sim/Creature.js';
import { Evolution } from '../src/nn/Evolution.js';
import { creatureScoreFromFitness, distMetersFromX } from '../src/sim/fitnessScore.js';

const DEFAULT_CREATURE_PATH = '/Users/curren/Downloads/polycreature-2026-02-18T20-23-20-254Z.json';
const DEFAULT_GENS = 200;
const DEFAULT_SEEDS = [11, 29, 73];
const DEFAULT_GROUND_Y = 840;
const FIXED_DT = 1 / CONFIG.fixedStepHz;
const TRACK_EVERY = 10;

function seededRng(seed = 1) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function withSeed(seed, fn) {
  const prev = Math.random;
  Math.random = seededRng(seed);
  try {
    return fn();
  } finally {
    Math.random = prev;
  }
}

function parseArgs(argv) {
  const out = {
    creaturePath: DEFAULT_CREATURE_PATH,
    gens: DEFAULT_GENS,
    pop: Number(CONFIG.defaultPopSize) || 48,
    seeds: DEFAULT_SEEDS.slice(),
    deathWallEnabled: CONFIG.defaultDeathWallEnabled !== false,
    deathWallSpeedMps: Number(CONFIG.defaultDeathWallSpeedMps) || 1,
    deathWallStartBehindMeters: Number(CONFIG.defaultDeathWallStartBehindMeters) || 10
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--creature' && argv[i + 1]) {
      out.creaturePath = argv[++i];
    } else if (arg === '--gens' && argv[i + 1]) {
      out.gens = Math.max(10, Number(argv[++i]) || DEFAULT_GENS);
    } else if (arg === '--pop' && argv[i + 1]) {
      out.pop = Math.max(8, Number(argv[++i]) || out.pop);
    } else if (arg === '--seeds' && argv[i + 1]) {
      out.seeds = argv[++i]
        .split(',')
        .map(v => Number(v.trim()))
        .filter(Number.isFinite);
      if (!out.seeds.length) out.seeds = DEFAULT_SEEDS.slice();
    } else if (arg === '--wall' && argv[i + 1]) {
      const raw = String(argv[++i]).toLowerCase();
      out.deathWallEnabled = raw === '1' || raw === 'true' || raw === 'on' || raw === 'yes';
    } else if (arg === '--wall-speed' && argv[i + 1]) {
      out.deathWallSpeedMps = Math.max(0, Number(argv[++i]) || out.deathWallSpeedMps);
    } else if (arg === '--wall-start' && argv[i + 1]) {
      out.deathWallStartBehindMeters = Math.max(0, Number(argv[++i]) || out.deathWallStartBehindMeters);
    }
  }
  return out;
}

function loadDesign(creaturePath) {
  const resolved = path.resolve(creaturePath);
  const raw = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  return {
    resolved,
    nodes: Array.isArray(raw.nodes) ? raw.nodes : [],
    constraints: Array.isArray(raw.constraints) ? raw.constraints : [],
    polygons: Array.isArray(raw.polygons) ? raw.polygons : []
  };
}

function getBounds(nodes) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  nodes.forEach((n) => {
    minX = Math.min(minX, n.x);
    maxX = Math.max(maxX, n.x);
    minY = Math.min(minY, n.y);
    maxY = Math.max(maxY, n.y);
  });
  return { minX, maxX, minY, maxY };
}

function countMuscles(constraints) {
  return constraints.reduce((sum, c) => sum + ((c?.type === 'muscle') ? 1 : 0), 0);
}

function buildSimConfig(generation, wallSettings) {
  return {
    gravity: CONFIG.defaultGravity,
    simDuration: CONFIG.defaultSimDuration,
    groundFriction: CONFIG.defaultGroundFriction,
    groundStaticFriction: CONFIG.defaultGroundStaticFriction,
    tractionDamping: CONFIG.defaultTractionDamping,
    groundedThreshold: CONFIG.defaultGroundedThreshold,
    maxHorizontalVelocity: CONFIG.defaultMaxHorizontalVelocity,
    maxVerticalVelocity: CONFIG.defaultMaxVerticalVelocity,
    tiltLimitEnabled: CONFIG.defaultTiltLimitEnabled,
    maxTiltDeg: CONFIG.defaultMaxTiltDeg,
    maxTiltRad: (CONFIG.defaultMaxTiltDeg * Math.PI) / 180,
    jointFreedom: CONFIG.defaultJointFreedom,
    muscleStrength: CONFIG.defaultMuscleStrength,
    jointMoveSpeed: CONFIG.defaultJointMoveSpeed,
    muscleRange: CONFIG.defaultMuscleRange,
    muscleMinLength: CONFIG.defaultMuscleMinLength,
    muscleMaxLength: CONFIG.defaultMuscleMaxLength,
    muscleSmoothing: CONFIG.defaultMuscleSmoothing,
    muscleSignalRateLimit: CONFIG.defaultMuscleSignalRateLimit,
    muscleSpringConstant: CONFIG.defaultMuscleSpringConstant,
    muscleDamping: CONFIG.defaultMuscleDamping,
    groundedBothBodies: CONFIG.defaultGroundedBothBodies,
    groundedOneBody: CONFIG.defaultGroundedOneBody,
    groundedNoBodies: CONFIG.defaultGroundedNoBodies,
    groundedVerticalForceScale: CONFIG.defaultGroundedVerticalForceScale,
    groundedDeadbandErrorPx: CONFIG.defaultGroundedDeadbandErrorPx,
    groundedDeadbandVelPxPerSec: CONFIG.defaultGroundedDeadbandVelPxPerSec,
    groundedSoftZoneErrorPx: CONFIG.defaultGroundedSoftZoneErrorPx,
    groundedSoftZoneForceScale: CONFIG.defaultGroundedSoftZoneForceScale,
    groundedForceRateLimit: CONFIG.defaultGroundedForceRateLimit,
    groundedSignFlipDeadband: CONFIG.defaultGroundedSignFlipDeadband,
    groundedMinForceMagnitude: CONFIG.defaultGroundedMinForceMagnitude,
    muscleActionBudget: CONFIG.defaultMuscleActionBudget,
    bodyFriction: CONFIG.defaultBodyFriction,
    bodyStaticFriction: CONFIG.defaultBodyStaticFriction,
    bodyAirFriction: CONFIG.defaultBodyAirFriction,
    energyEnabled: CONFIG.defaultEnergyEnabled,
    maxEnergy: CONFIG.defaultMaxEnergy,
    energyRegenRate: CONFIG.defaultEnergyRegenRate,
    energyUsagePerActuation: CONFIG.defaultEnergyUsagePerActuation,
    minEnergyForActuation: CONFIG.defaultMinEnergyForActuation,
    baseDrain: CONFIG.ENERGY_CONFIG.baseDrain,
    trainingAlgorithm: 'neat',
    currentGeneration: generation,
    deathWallEnabled: wallSettings.deathWallEnabled,
    deathWallStartBehindMeters: wallSettings.deathWallStartBehindMeters,
    deathWallSpeedMps: wallSettings.deathWallSpeedMps,
    deathWallThicknessPx: Number(CONFIG.defaultDeathWallThicknessPx) || 24
  };
}

function buildScoreWeights() {
  return {
    distanceRewardWeight: CONFIG.defaultDistanceRewardWeight,
    coordinationBonusWeight: CONFIG.defaultCoordinationBonusWeight,
    actuationJerkPenalty: CONFIG.defaultActuationJerkPenalty,
    groundSlipPenaltyWeight: 0,
    backwardsPenalty: CONFIG.defaultBackwardsPenalty,
    groundedRatioBonusWeight: CONFIG.defaultGroundedRatioBonusWeight,
    airtimePenaltyWeight: CONFIG.defaultAirtimePenaltyWeight,
    verticalSpeedPenalty: CONFIG.defaultVerticalSpeedPenalty,
    energyEnabled: CONFIG.defaultEnergyEnabled,
    energyEfficiencyBonus: CONFIG.defaultEnergyEfficiencyBonus,
    groundSlipFailThreshold: Number.POSITIVE_INFINITY,
    slipGraceSeconds: 0
  };
}

function createDeathWall(world, wallX, groundY, thicknessPx) {
  const wallHalfWidth = Math.max(4, thicknessPx / 2) / SCALE;
  const wallHalfHeightPx = 5000;
  const wall = world.createBody({
    type: 'kinematic',
    position: Vec2(wallX / SCALE, groundY / SCALE)
  });
  wall.createFixture({
    shape: Box(wallHalfWidth, wallHalfHeightPx / SCALE),
    isSensor: true,
    filterCategoryBits: 0x0008,
    filterMaskBits: 0x0006
  });
  wall.isDeathWall = true;
  return wall;
}

function applyStepStabilization(creatures, simConfig, groundY) {
  const tractionDamping = Number(simConfig.tractionDamping) || 1;
  const angularDampingPerStep = 1.0;

  creatures.forEach((c) => {
    if (!c || c.dead) return;
    const allBodies = c.polygonBodies && c.polygonBodies.length
      ? c.bodies.concat(c.polygonBodies)
      : c.bodies;
    allBodies.forEach((b) => {
      const pos = b.getPosition();
      const vel = b.getLinearVelocity();
      let vx = vel.x;
      let vy = vel.y;
      const grounded = c.isBodyGrounded
        ? c.isBodyGrounded(b, groundY)
        : ((pos.y * SCALE + CONFIG.nodeRadius) >= (groundY - simConfig.groundedThreshold));
      if (grounded) {
        vx *= tractionDamping;
        if (Math.abs(vx) < 0.015) vx = 0;
        if (Math.abs(vy) < 0.015) vy = 0;
      }
      const clampedVx = Math.max(-simConfig.maxHorizontalVelocity, Math.min(simConfig.maxHorizontalVelocity, vx));
      const clampedVy = Math.max(-simConfig.maxVerticalVelocity, Math.min(simConfig.maxVerticalVelocity, vy));
      if (clampedVx !== vel.x || clampedVy !== vel.y) {
        b.setLinearVelocity(Vec2(clampedVx, clampedVy));
      }
      let angularVelocity = b.getAngularVelocity() * angularDampingPerStep;
      if (simConfig.tiltLimitEnabled) {
        const angle = Math.atan2(Math.sin(b.getAngle()), Math.cos(b.getAngle()));
        const clampedAngle = Math.max(-simConfig.maxTiltRad, Math.min(simConfig.maxTiltRad, angle));
        if (clampedAngle !== angle) {
          b.setTransform(b.getPosition(), clampedAngle);
          const pushingFurtherOut = (clampedAngle >= simConfig.maxTiltRad && angularVelocity > 0)
            || (clampedAngle <= -simConfig.maxTiltRad && angularVelocity < 0);
          angularVelocity = pushingFurtherOut ? 0 : angularVelocity * 0.35;
        }
      }
      b.setAngularVelocity(Math.max(-5, Math.min(5, angularVelocity)));
    });
  });
}

function evaluateGeneration(population, design, generation, wallSettings) {
  const simConfig = buildSimConfig(generation, wallSettings);
  const scoreWeights = buildScoreWeights();
  const bounds = getBounds(design.nodes);
  const spawnX = 60;
  const spawnCenterX = spawnX + (bounds.maxX - bounds.minX) / 2;
  const relMaxY = bounds.maxY - bounds.minY;
  const startY = DEFAULT_GROUND_Y - CONFIG.spawnClearance - CONFIG.nodeRadius - relMaxY;
  const steps = Math.floor(simConfig.simDuration / FIXED_DT);

  const world = createEngine(simConfig.gravity);
  createGround(world, DEFAULT_GROUND_Y, { friction: simConfig.groundFriction, thickness: 16 });

  let deathWall = null;
  let deathWallX = spawnCenterX - simConfig.deathWallStartBehindMeters * SCALE;
  if (simConfig.deathWallEnabled) {
    deathWall = createDeathWall(world, deathWallX, DEFAULT_GROUND_Y, simConfig.deathWallThicknessPx);
  }

  const pendingDeathWallKills = new Set();
  let deathWallKillCount = 0;
  world.on('begin-contact', (contact) => {
    const fixtureA = contact.getFixtureA();
    const fixtureB = contact.getFixtureB();
    const bodyA = fixtureA.getBody();
    const bodyB = fixtureB.getBody();
    const wallA = bodyA?.isDeathWall === true;
    const wallB = bodyB?.isDeathWall === true;
    if (wallA || wallB) {
      const creatureBody = wallA ? bodyB : bodyA;
      if (Number.isInteger(creatureBody?.creatureId)) pendingDeathWallKills.add(creatureBody.creatureId);
    }
    if (bodyA.creatureId === bodyB.creatureId) {
      if (bodyA.connectedBodies && bodyA.connectedBodies.has(bodyB)) {
        contact.setEnabled(false);
      }
    }
  });
  world.on('pre-solve', (contact) => {
    const fixtureA = contact.getFixtureA();
    const fixtureB = contact.getFixtureB();
    const bodyA = fixtureA.getBody();
    const bodyB = fixtureB.getBody();
    const wallA = bodyA?.isDeathWall === true;
    const wallB = bodyB?.isDeathWall === true;
    if (wallA || wallB) {
      const creatureBody = wallA ? bodyB : bodyA;
      if (Number.isInteger(creatureBody?.creatureId)) pendingDeathWallKills.add(creatureBody.creatureId);
    }
    if (bodyA.creatureId === bodyB.creatureId) {
      if (bodyA.connectedBodies && bodyA.connectedBodies.has(bodyB)) {
        contact.setEnabled(false);
      }
    }
  });

  const creatures = population.map((entry, idx) => new Creature(
    world,
    spawnX,
    startY,
    design.nodes,
    design.constraints,
    design.polygons,
    entry,
    bounds.minX,
    bounds.minY,
    simConfig,
    idx
  ));

  let simTimeElapsed = 0;
  for (let step = 0; step < steps; step++) {
    const time = simTimeElapsed * 10;
    creatures.forEach((c) => {
      if (!c.dead) c.update(time, DEFAULT_GROUND_Y, FIXED_DT);
    });

    world.step(FIXED_DT);
    simTimeElapsed += FIXED_DT;

    if (deathWall) {
      deathWallX += simConfig.deathWallSpeedMps * SCALE * FIXED_DT;
      const pos = deathWall.getPosition();
      deathWall.setTransform(Vec2(deathWallX / SCALE, pos.y), 0);
      deathWall.setLinearVelocity(Vec2(0, 0));
    }

    if (pendingDeathWallKills.size) {
      creatures.forEach((c) => {
        if (!pendingDeathWallKills.has(c.id) || c.dead) return;
        c.dead = true;
        c.deathReason = 'death_wall';
        c.deathAt = simTimeElapsed;
        const deathX = c.getX();
        if (Number.isFinite(deathX)) c.stats.maxX = Math.max(c.stats.maxX, deathX);
        c.destroy();
        deathWallKillCount += 1;
      });
      pendingDeathWallKills.clear();
    }

    if (creatures.every(c => c.dead)) break;

    applyStepStabilization(creatures, simConfig, DEFAULT_GROUND_Y);
    creatures.forEach((c) => {
      if (!c.dead) c.sampleFitness(FIXED_DT, DEFAULT_GROUND_Y);
    });
  }

  const evaluated = creatures.map((creature) => {
    const fitness = {
      ...creature.getFitnessSnapshot(),
      deathReason: creature.deathReason || (creature.dead ? 'unknown' : 'timer')
    };
    const elapsedSec = Number.isFinite(creature?.deathAt)
      ? Math.max(0, Math.min(simConfig.simDuration, creature.deathAt))
      : simConfig.simDuration;
    const finalX = creature.getX();
    const peakX = Number.isFinite(fitness.maxX) ? fitness.maxX : finalX;
    const distance = distMetersFromX(peakX, spawnCenterX);
    const score = creatureScoreFromFitness(
      fitness,
      finalX,
      spawnCenterX,
      scoreWeights,
      elapsedSec
    );
    return {
      creature,
      fitness,
      elapsedSec,
      distance,
      score,
      genome: creature.genome,
      genomeId: Number.isFinite(creature?.genome?.id) ? creature.genome.id : undefined,
      architecture: creature.architecture,
      dna: creature.dna
    };
  });

  const sortedByScore = evaluated.slice().sort((a, b) => b.score - a.score);
  const genBestDistance = evaluated.reduce((best, item) => Math.max(best, item.distance), 0);
  const bestScore = sortedByScore.length ? sortedByScore[0].score : 0;
  const avgDist = evaluated.length
    ? evaluated.reduce((sum, item) => sum + item.distance, 0) / evaluated.length
    : 0;
  const aliveEnd = creatures.reduce((sum, c) => sum + (c.dead ? 0 : 1), 0);

  creatures.forEach(c => c.destroy());
  cleanup(world);

  return { evaluated, genBestDistance, bestScore, avgDist, aliveEnd, deathWallKillCount };
}

function buildEvolveConfig(ioInputCount, ioOutputCount, stagnation) {
  const stagnationPressure = Math.max(0, Math.min(1, stagnation / 20));
  const baseAddNodeRate = Number(CONFIG.EVOLUTION_CONFIG?.neatAddNodeRate ?? 0.035);
  const baseAddConnRate = Number(CONFIG.EVOLUTION_CONFIG?.neatAddConnRate ?? 0.12);
  return {
    stagnantGens: stagnation,
    trainingAlgorithm: 'neat',
    neatMode: true,
    neatInputCount: ioInputCount,
    neatOutputCount: ioOutputCount,
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
    initialConnectionDensity: CONFIG.EVOLUTION_CONFIG?.initialConnectionDensity,
    initialWeightStd: CONFIG.EVOLUTION_CONFIG?.initialWeightStd,
    neatAddNodeRate: Math.min(0.06, baseAddNodeRate + (0.025 * stagnationPressure)),
    neatAddConnRate: Math.min(0.30, baseAddConnRate + (0.15 * stagnationPressure))
  };
}

function evolveOneSeed(seed, design, opts) {
  return withSeed(seed, () => {
    Evolution.resetNeatState?.();

    let allTimeBest = 0;
    let stagnation = 0;
    const history = [];
    const speciesHistory = [];
    const ioInputCount = 5 + countMuscles(design.constraints) * 2;
    const ioOutputCount = countMuscles(design.constraints);
    let population = Evolution.evolve([], opts.pop, buildEvolveConfig(ioInputCount, ioOutputCount, stagnation));
    if (!Array.isArray(population) || !population.length) {
      population = Array.from({ length: opts.pop }, () => ({
        controllerType: 'neat',
        genome: null,
        dna: null
      }));
    }

    for (let generation = 1; generation <= opts.gens; generation++) {
      const evalResult = evaluateGeneration(population, design, generation, opts);
      const improved = evalResult.genBestDistance > allTimeBest + 1e-6;
      if (improved) {
        allTimeBest = evalResult.genBestDistance;
        stagnation = 0;
      } else {
        stagnation += 1;
      }

      const evolveConfig = buildEvolveConfig(ioInputCount, ioOutputCount, stagnation);

      population = Evolution.evolve(
        evalResult.evaluated.map((item) => ({
          fitness: item.score,
          genome: item.genome,
          genomeId: item.genomeId,
          architecture: item.architecture,
          dna: item.dna
        })),
        opts.pop,
        evolveConfig
      );

      const status = Evolution.getNeatStatus?.() || null;
      speciesHistory.push(Number(status?.speciesCount) || 0);
      history.push({
        generation,
        genBest: evalResult.genBestDistance,
        bestScore: evalResult.bestScore,
        allBest: allTimeBest,
        avgDist: evalResult.avgDist,
        aliveEnd: evalResult.aliveEnd,
        deathWallKills: evalResult.deathWallKillCount,
        species: Number(status?.speciesCount) || 0,
        innovations: Number(status?.innovationCount) || 0
      });
    }

    const earlyWindow = history.slice(0, Math.min(20, history.length));
    const lateWindow = history.slice(Math.max(0, history.length - 20));
    const bestAt100 = history[Math.min(99, history.length - 1)]?.allBest ?? allTimeBest;
    const avgEarly = earlyWindow.reduce((sum, row) => sum + row.genBest, 0) / Math.max(1, earlyWindow.length);
    const avgLate = lateWindow.reduce((sum, row) => sum + row.genBest, 0) / Math.max(1, lateWindow.length);
    const speciesActiveRate = speciesHistory.length
      ? speciesHistory.reduce((sum, s) => sum + (s > 1 ? 1 : 0), 0) / speciesHistory.length
      : 0;
    return {
      seed,
      history,
      summary: {
        allTimeBest,
        bestAt100,
        avgEarly,
        avgLate,
        lateOverEarly: avgEarly > 0 ? (avgLate / avgEarly) : 0,
        finalSpecies: speciesHistory[speciesHistory.length - 1] || 0,
        avgSpecies: speciesHistory.reduce((sum, s) => sum + s, 0) / Math.max(1, speciesHistory.length),
        speciesActiveRate
      }
    };
  });
}

function printSeedSummary(result) {
  const s = result.summary;
  console.log(
    `seed ${result.seed} | allBest=${s.allTimeBest.toFixed(2)}m | best@100=${s.bestAt100.toFixed(2)}m | ` +
    `late/early=${s.lateOverEarly.toFixed(2)}x | species(avg/final)=${s.avgSpecies.toFixed(2)}/${s.finalSpecies}`
  );
}

function printAggregate(results) {
  const summaries = results.map(r => r.summary);
  const avg = (key) => summaries.reduce((sum, s) => sum + (Number(s[key]) || 0), 0) / Math.max(1, summaries.length);
  const min = (key) => Math.min(...summaries.map(s => Number(s[key]) || 0));
  const max = (key) => Math.max(...summaries.map(s => Number(s[key]) || 0));

  console.log('\nAggregate:');
  console.log(`  allBest avg/min/max: ${avg('allTimeBest').toFixed(2)} / ${min('allTimeBest').toFixed(2)} / ${max('allTimeBest').toFixed(2)} m`);
  console.log(`  best@100 avg/min/max: ${avg('bestAt100').toFixed(2)} / ${min('bestAt100').toFixed(2)} / ${max('bestAt100').toFixed(2)} m`);
  console.log(`  late/early avg: ${avg('lateOverEarly').toFixed(2)}x`);
  console.log(`  species avg: ${avg('avgSpecies').toFixed(2)} | species>1 rate avg: ${(avg('speciesActiveRate') * 100).toFixed(1)}%`);

  const passCount = summaries.reduce((count, s) => {
    const improving = s.bestAt100 >= 12 && s.lateOverEarly >= 1.15;
    return count + (improving ? 1 : 0);
  }, 0);
  console.log(`  evolution pass heuristic (best@100>=12m and late/early>=1.15x): ${passCount}/${summaries.length}`);
}

function printSampleHistory(results) {
  const first = results[0];
  if (!first) return;
  console.log('\nSample generation trace (seed', first.seed, '):');
  first.history.forEach((row) => {
    if (row.generation % TRACK_EVERY !== 0 && row.generation !== 1 && row.generation !== first.history.length) return;
    console.log(
      `  g${String(row.generation).padStart(3, ' ')} | ` +
      `genBest=${row.genBest.toFixed(2)}m allBest=${row.allBest.toFixed(2)}m avgDist=${row.avgDist.toFixed(2)}m ` +
      `bestScore=${row.bestScore.toFixed(2)} species=${row.species} innov=${row.innovations} wallKills=${row.deathWallKills}`
    );
  });
}

function main() {
  const opts = parseArgs(process.argv);
  const design = loadDesign(opts.creaturePath);
  const muscles = countMuscles(design.constraints);
  if (!design.nodes.length || !design.constraints.length || muscles <= 0) {
    throw new Error('Invalid design file: expected nodes/constraints with at least one muscle.');
  }

  const t0 = Date.now();
  console.log('Benchmark config:');
  console.log(`  creature: ${design.resolved}`);
  console.log(`  pop=${opts.pop}, gens=${opts.gens}, seeds=${opts.seeds.join(',')}`);
  console.log(`  wall=${opts.deathWallEnabled ? 'on' : 'off'} speed=${opts.deathWallSpeedMps}m/s startBehind=${opts.deathWallStartBehindMeters}m`);
  console.log(`  muscles=${muscles}, neatIO=${5 + muscles * 2}->${muscles}`);

  const results = opts.seeds.map((seed) => evolveOneSeed(seed, design, opts));
  results.forEach(printSeedSummary);
  printAggregate(results);
  printSampleHistory(results);

  const elapsedSec = (Date.now() - t0) / 1000;
  console.log(`\nElapsed: ${elapsedSec.toFixed(2)}s`);
}

main();
