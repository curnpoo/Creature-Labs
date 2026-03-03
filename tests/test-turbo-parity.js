import { CONFIG } from '../src/utils/config.js';
import { createEngine, createGround, Vec2, SCALE, cleanup } from '../src/sim/Physics.js';
import { Creature } from '../src/sim/Creature.js';
import { creatureScoreFromFitness } from '../src/sim/fitnessScore.js';

const FIXED_DT = 1 / CONFIG.fixedStepHz;
const GROUND_Y = 720;
const SPAWN_X = 60;

function seededRng(seed = 123456789) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
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
    ],
    polygons: []
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
  const allBodies = creature.polygonBodies && creature.polygonBodies.length
    ? creature.bodies.concat(creature.polygonBodies)
    : creature.bodies;
  allBodies.forEach(b => {
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
  const creatures = pop.map((dnaObj, idx) => new Creature(
    world,
    SPAWN_X,
    startY,
    design.nodes,
    design.constraints,
    design.polygons,
    dnaObj,
    bounds.minX,
    bounds.minY,
    simConfig,
    idx
  ));

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
      score: creatureScoreFromFitness(fitness, c.getX(), spawnCenterX, scoreWeights)
    };
  }).sort((a, b) => b.score - a.score);

  creatures.forEach(c => c.destroy());
  cleanup(world);
  return scores.map(s => s.idx);
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
      design.polygons,
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

  return ranking.map(r => r.idx);
}

function topMismatchCount(a, b, topN = 8) {
  const n = Math.min(topN, a.length, b.length);
  let mismatch = 0;
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) mismatch++;
  }
  return { mismatch, n };
}

function main() {
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
    protoWorld, SPAWN_X, startY, design.nodes, design.constraints, design.polygons,
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

  const sharedRank = evaluateSharedWorld(pop, design, simConfig, spawnCenterX);
  const isolatedRank = evaluateIsolatedWorlds(pop, design, simConfig, spawnCenterX);
  const { mismatch, n } = topMismatchCount(sharedRank, isolatedRank, 8);
  const pct = n ? (mismatch / n) : 0;
  console.log('Shared top rank:', sharedRank.slice(0, 8).join(', '));
  console.log('Isolated top rank:', isolatedRank.slice(0, 8).join(', '));
  console.log(`Top-${n} mismatch: ${mismatch}/${n} (${(pct * 100).toFixed(1)}%)`);

  if (pct > 0.5) {
    console.error('Turbo parity test failed: mismatch threshold exceeded.');
    process.exit(1);
  }
  console.log('Turbo parity test passed.');
}

main();
