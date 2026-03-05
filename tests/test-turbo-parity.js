import { CONFIG } from '../src/utils/config.js';
import { createEngine, createGround, Vec2, SCALE, cleanup } from '../src/sim/Physics.js';
import { Creature } from '../src/sim/Creature.js';
import { creatureScoreFromFitness } from '../src/sim/fitnessScore.js';

const FIXED_DT = 1 / CONFIG.fixedStepHz;
const GROUND_Y = 720;
const SPAWN_X = 60;
const SHARED_SPAWN_SPACING_PX = 500;

function seededRng(seed = 123456789) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function withSeed(seed, fn) {
  const previousRandom = Math.random;
  Math.random = seededRng(seed);
  try {
    return fn();
  } finally {
    Math.random = previousRandom;
  }
}

function buildToyDesign() {
  return {
    nodes: [
      { id: 1, x: 0, y: 0, fixed: false },
      { id: 2, x: 40, y: 0, fixed: false },
      { id: 3, x: 20, y: -26, fixed: false }
    ],
    constraints: [
      { type: 'bone', n1: 1, n2: 2 },
      { type: 'bone', n1: 2, n2: 3 },
      { type: 'bone', n1: 1, n2: 3 },
      { type: 'muscle', n1: 1, n2: 2, minLength: 0.85, maxLength: 1.2 }
    ]
  };
}

function getBounds(nodes) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  nodes.forEach(n => {
    minX = Math.min(minX, n.x);
    maxX = Math.max(maxX, n.x);
    minY = Math.min(minY, n.y);
    maxY = Math.max(maxY, n.y);
  });
  return { minX, maxX, minY, maxY };
}

function buildSimConfig() {
  return {
    gravity: CONFIG.defaultGravity,
    groundFriction: CONFIG.defaultGroundFriction,
    simDuration: CONFIG.defaultSimDuration,
    deathWallEnabled: false,
    deathWallStartBehindMeters: CONFIG.defaultDeathWallStartBehindMeters,
    deathWallSpeedMps: CONFIG.defaultDeathWallSpeedMps,
    deathWallThicknessPx: CONFIG.defaultDeathWallThicknessPx,
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
    groundedThreshold: CONFIG.defaultGroundedThreshold,
    tiltLimitEnabled: CONFIG.defaultTiltLimitEnabled,
    maxTiltDeg: CONFIG.defaultMaxTiltDeg,
    maxTiltRad: (CONFIG.defaultMaxTiltDeg * Math.PI) / 180,
    groundedVerticalForceScale: CONFIG.defaultGroundedVerticalForceScale,
    groundedDeadbandErrorPx: CONFIG.defaultGroundedDeadbandErrorPx,
    groundedDeadbandVelPxPerSec: CONFIG.defaultGroundedDeadbandVelPxPerSec,
    groundedSoftZoneErrorPx: CONFIG.defaultGroundedSoftZoneErrorPx,
    groundedSoftZoneForceScale: CONFIG.defaultGroundedSoftZoneForceScale,
    groundedForceRateLimit: CONFIG.defaultGroundedForceRateLimit,
    groundedSignFlipDeadband: CONFIG.defaultGroundedSignFlipDeadband,
    groundedMinForceMagnitude: CONFIG.defaultGroundedMinForceMagnitude,
    maxHorizontalVelocity: CONFIG.defaultMaxHorizontalVelocity,
    maxVerticalVelocity: CONFIG.defaultMaxVerticalVelocity,
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
    currentGeneration: 1
  };
}

const scoreWeights = {
  distanceRewardWeight: CONFIG.defaultDistanceRewardWeight,
  coordinationBonusWeight: CONFIG.defaultCoordinationBonusWeight,
  actuationJerkPenalty: CONFIG.defaultActuationJerkPenalty,
  groundSlipPenaltyWeight: CONFIG.defaultGroundSlipPenaltyWeight,
  uprightPenaltyWeight: CONFIG.defaultUprightPenaltyWeight,
  backwardsPenalty: CONFIG.defaultBackwardsPenalty,
  groundedRatioBonusWeight: CONFIG.defaultGroundedRatioBonusWeight,
  airtimePenaltyWeight: CONFIG.defaultAirtimePenaltyWeight,
  verticalSpeedPenalty: CONFIG.defaultVerticalSpeedPenalty,
  energyEnabled: CONFIG.defaultEnergyEnabled,
  energyEfficiencyBonus: CONFIG.defaultEnergyEfficiencyBonus
};

function applyStabilization(creature, simConfig, groundY) {
  const angularDampingPerStep = 0.985;
  creature.bodies.forEach(b => {
    const pos = b.getPosition();
    const vel = b.getLinearVelocity();
    let vx = vel.x;
    let vy = vel.y;
    const grounded = (pos.y * SCALE + CONFIG.nodeRadius) >= (groundY - simConfig.groundedThreshold);
    if (grounded) {
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
}

function evaluateSharedWorld(pop, design, simConfig, spawnCenterX) {
  const world = createEngine(simConfig.gravity);
  createGround(world, GROUND_Y, { friction: simConfig.groundFriction, thickness: 16 });
  const bounds = getBounds(design.nodes);
  const relMaxY = bounds.maxY - bounds.minY;
  const startY = GROUND_Y - CONFIG.spawnClearance - CONFIG.nodeRadius - relMaxY;
  const spawnCenters = [];
  const creatures = pop.map((dnaObj, idx) => {
    // Keep shared-world stepping but avoid creature-vs-creature contact contamination.
    const xOffset = idx * SHARED_SPAWN_SPACING_PX;
    const creature = new Creature(
      world,
      SPAWN_X + xOffset,
      startY,
      design.nodes,
      design.constraints,
      dnaObj,
      bounds.minX,
      bounds.minY,
      simConfig,
      idx
    );
    spawnCenters[idx] = spawnCenterX + xOffset;
    return creature;
  });

  const steps = Math.floor(simConfig.simDuration / FIXED_DT);
  for (let step = 0; step < steps; step++) {
    const time = step * FIXED_DT * 10;
    creatures.forEach(c => {
      if (!c.dead) c.update(time, GROUND_Y, FIXED_DT);
    });
    world.step(FIXED_DT);
    creatures.forEach(c => {
      if (!c.dead) {
        applyStabilization(c, simConfig, GROUND_Y);
        c.sampleFitness(FIXED_DT, GROUND_Y);
      }
    });
  }

  const scores = creatures.map((c, idx) => {
    const fitness = c.getFitnessSnapshot();
    return {
      idx,
      score: creatureScoreFromFitness(fitness, c.getX(), spawnCenters[idx], scoreWeights)
    };
  }).sort((a, b) => b.score - a.score);

  creatures.forEach(c => c.destroy());
  cleanup(world);
  return scores;
}

function evaluateIsolatedWorlds(pop, design, simConfig, spawnCenterX) {
  const bounds = getBounds(design.nodes);
  const relMaxY = bounds.maxY - bounds.minY;
  const startY = GROUND_Y - CONFIG.spawnClearance - CONFIG.nodeRadius - relMaxY;

  const ranking = pop.map((dnaObj, idx) => {
    const world = createEngine(simConfig.gravity);
    createGround(world, GROUND_Y, { friction: simConfig.groundFriction, thickness: 16 });
    const creature = new Creature(
      world,
      SPAWN_X,
      startY,
      design.nodes,
      design.constraints,
      dnaObj,
      bounds.minX,
      bounds.minY,
      simConfig,
      idx
    );
    const steps = Math.floor(simConfig.simDuration / FIXED_DT);
    for (let step = 0; step < steps; step++) {
      const time = step * FIXED_DT * 10;
      if (!creature.dead) creature.update(time, GROUND_Y, FIXED_DT);
      world.step(FIXED_DT);
      if (!creature.dead) {
        applyStabilization(creature, simConfig, GROUND_Y);
        creature.sampleFitness(FIXED_DT, GROUND_Y);
      }
    }
    const fitness = creature.getFitnessSnapshot();
    const score = creatureScoreFromFitness(fitness, creature.getX(), spawnCenterX, scoreWeights);
    creature.destroy();
    cleanup(world);
    return { idx, score };
  }).sort((a, b) => b.score - a.score);

  return ranking;
}

function topMismatchCount(a, b, topN = 8) {
  const n = Math.min(topN, a.length, b.length);
  let mismatch = 0;
  for (let i = 0; i < n; i++) {
    if (a[i].idx !== b[i].idx) mismatch++;
  }
  return { mismatch, n };
}

function topSetOverlapRatio(a, b, topN = 8) {
  const n = Math.min(topN, a.length, b.length);
  const setA = new Set(a.slice(0, n).map(item => item.idx));
  const setB = new Set(b.slice(0, n).map(item => item.idx));
  let overlap = 0;
  setA.forEach(idx => {
    if (setB.has(idx)) overlap++;
  });
  return n > 0 ? overlap / n : 0;
}

function spearmanRank(a, b) {
  const n = Math.min(a.length, b.length);
  if (n <= 1) return 1;
  const rankA = new Map();
  const rankB = new Map();
  a.slice(0, n).forEach((item, i) => rankA.set(item.idx, i + 1));
  b.slice(0, n).forEach((item, i) => rankB.set(item.idx, i + 1));
  let sumD2 = 0;
  rankA.forEach((ra, idx) => {
    const rb = rankB.get(idx);
    if (!Number.isFinite(rb)) return;
    const d = ra - rb;
    sumD2 += d * d;
  });
  return 1 - ((6 * sumD2) / (n * (n * n - 1)));
}

function median(values) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((x, y) => x - y);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
  return sorted[mid];
}

function dnaChecksum(pop) {
  let sum = 0;
  pop.forEach((entry, idx) => {
    const dna = entry?.dna;
    if (!(dna instanceof Float32Array)) return;
    for (let i = 0; i < dna.length; i++) {
      sum += dna[i] * (idx + 1) * (i + 1);
    }
  });
  return Number(sum.toFixed(6));
}

function main() {
  withSeed(42, () => {
    const rng = seededRng(42);
    const design = buildToyDesign();
    const bounds = getBounds(design.nodes);
    const spawnCenterX = SPAWN_X + (bounds.maxX - bounds.minX) / 2;
    const simConfig = buildSimConfig();

    // Create one prototype creature to discover DNA length for this morphology.
    const protoWorld = createEngine(simConfig.gravity);
    createGround(protoWorld, GROUND_Y, { friction: simConfig.groundFriction, thickness: 16 });
    const relMaxY = bounds.maxY - bounds.minY;
    const startY = GROUND_Y - CONFIG.spawnClearance - CONFIG.nodeRadius - relMaxY;
    const proto = new Creature(
      protoWorld, SPAWN_X, startY, design.nodes, design.constraints,
      null, bounds.minX, bounds.minY, simConfig, 0
    );
    const baseDNA = Array.from(proto.dna);
    const baseArch = proto.architecture;
    proto.destroy();
    cleanup(protoWorld);

    const popSize = 16;
    const pop = Array.from({ length: popSize }, () => {
      const dna = baseDNA.map(w => w + (rng() - 0.5) * 0.4);
      return { dna: new Float32Array(dna), architecture: baseArch };
    });

    const checksumBefore = dnaChecksum(pop);
    const sharedRank = evaluateSharedWorld(pop, design, simConfig, spawnCenterX);
    const checksumAfterShared = dnaChecksum(pop);
    const isolatedRank = evaluateIsolatedWorlds(pop, design, simConfig, spawnCenterX);
    const checksumAfterIsolated = dnaChecksum(pop);
    const { mismatch, n } = topMismatchCount(sharedRank, isolatedRank, 8);
    const pct = n ? (mismatch / n) : 0;
    const overlapRatio = topSetOverlapRatio(sharedRank, isolatedRank, 8);
    const rankSpearman = spearmanRank(sharedRank, isolatedRank);
    const sharedMedian = median(sharedRank.map(r => r.score));
    const isolatedMedian = median(isolatedRank.map(r => r.score));
    const medianDeltaPct = Math.abs(sharedMedian - isolatedMedian) / Math.max(1e-6, Math.abs(isolatedMedian)) * 100;
    console.log('Shared top rank:', sharedRank.slice(0, 8).map(r => r.idx).join(', '));
    console.log('Isolated top rank:', isolatedRank.slice(0, 8).map(r => r.idx).join(', '));
    console.log(`Top-${n} mismatch: ${mismatch}/${n} (${(pct * 100).toFixed(1)}%)`);
    console.log(`Top-${n} set overlap: ${(overlapRatio * 100).toFixed(1)}%`);
    console.log(`Rank Spearman: ${rankSpearman.toFixed(3)}`);
    console.log(`Median scores: shared=${sharedMedian.toFixed(4)} isolated=${isolatedMedian.toFixed(4)}`);
    console.log(`Median score delta: ${medianDeltaPct.toFixed(2)}%`);
    console.log(`DNA checksum: before=${checksumBefore} afterShared=${checksumAfterShared} afterIsolated=${checksumAfterIsolated}`);

    const dnaStable = Math.abs(checksumBefore - checksumAfterShared) < 1e-6
      && Math.abs(checksumAfterShared - checksumAfterIsolated) < 1e-6;
    if (!dnaStable || overlapRatio < 0.5 || rankSpearman < 0.5 || medianDeltaPct > 20) {
      console.error('Turbo parity test failed: mismatch threshold exceeded.');
      process.exit(1);
    }
    console.log('Turbo parity test passed.');
  });
}

main();
