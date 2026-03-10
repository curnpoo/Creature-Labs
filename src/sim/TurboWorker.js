import { createEngine, createGround, Vec2, Box, SCALE, cleanup, planck } from './Physics.js';
import { Creature } from './Creature.js';
import { creatureScoreFromFitness, distMetersFromX } from './fitnessScore.js';
import { applyBodySafetyClamp, bindSharedCreatureContactFiltering } from './parityHelpers.js';
import {
  TURBO_RESULT_FLOAT_STRIDE,
  TURBO_RESULT_INT_STRIDE,
  encodeTurboDeathReason
} from './turboRuntime.js';

function createDeathWall(world, deathWallX, groundY, thicknessPx) {
  const wallHalfWidth = Math.max(4, thicknessPx / 2) / SCALE;
  const wall = world.createBody({
    type: 'kinematic',
    position: Vec2(deathWallX / SCALE, groundY / SCALE)
  });
  wall.createFixture({
    shape: Box(wallHalfWidth, 5000 / SCALE),
    isSensor: true,
    filterCategoryBits: 0x0008,
    filterMaskBits: 0x0006
  });
  wall.isDeathWall = true;
  return wall;
}

function createChallengeBodies(world, terrainSnapshot, friction) {
  const created = [];
  const groundProfile = terrainSnapshot?.groundProfile || [];
  const obstacles = terrainSnapshot?.obstacles || [];
  const segmentHalfHeight = (10 / 2) / SCALE;
  for (let i = 1; i < groundProfile.length; i++) {
    const p1 = groundProfile[i - 1];
    const p2 = groundProfile[i];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    if (length < 2) continue;
    const angle = Math.atan2(dy, dx);
    const body = world.createBody({
      type: 'static',
      position: Vec2((p1.x + p2.x) / 2 / SCALE, (p1.y + p2.y) / 2 / SCALE),
      angle
    });
    body.createFixture({
      shape: Box(length / 2 / SCALE, segmentHalfHeight),
      friction,
      restitution: 0
    });
    created.push(body);
  }
  obstacles.forEach(raw => {
    const o = {
      type: raw.type || 'box',
      x: Number(raw.x),
      y: Number(raw.y),
      w: Number(raw.w),
      h: Number(raw.h)
    };
    if (!Number.isFinite(o.x) || !Number.isFinite(o.y) || !Number.isFinite(o.w) || !Number.isFinite(o.h)) return;
    const body = world.createBody({
      type: 'static',
      position: Vec2(o.x / SCALE, o.y / SCALE)
    });
    if (o.type === 'triangle') {
      const hw = o.w / 2 / SCALE;
      const hh = o.h / 2 / SCALE;
      body.createFixture({
        shape: planck.Polygon([Vec2(0, -hh), Vec2(-hw, hh), Vec2(hw, hh)]),
        friction,
        restitution: 0
      });
    } else {
      body.createFixture({
        shape: Box(o.w / 2 / SCALE, o.h / 2 / SCALE),
        friction,
        restitution: 0
      });
    }
    created.push(body);
  });
  return created;
}

function extractActuationDiagnostics(fitness) {
  return {
    intentUpdateHz: Number(fitness?.intentUpdateHz) || 0,
    commandOscillationHz: Number(fitness?.commandOscillationHz) || 0,
    avgCommandDeltaPerSec: Number(fitness?.avgCommandDeltaPerSec) || 0,
    microActuationIndex: Number(fitness?.microActuationIndex) || 0,
    slipWhileGrounded: Number(fitness?.groundSlipRate) || Number(fitness?.groundSlip) || 0
  };
}

function isBodyGroundedStrict(body, creatureId) {
  let edge = body.getContactList();
  while (edge) {
    const contact = edge.contact;
    if (contact && contact.isTouching()) {
      const fixtureA = contact.getFixtureA();
      const fixtureB = contact.getFixtureB();
      const bodyA = fixtureA.getBody();
      const bodyB = fixtureB.getBody();
      const selfIsA = bodyA === body;
      const selfFixture = selfIsA ? fixtureA : fixtureB;
      const otherFixture = selfIsA ? fixtureB : fixtureA;
      const otherBody = selfIsA ? bodyB : bodyA;
      if (
        !selfFixture.isSensor() &&
        !otherFixture.isSensor() &&
        otherBody !== body &&
        otherBody.creatureId !== creatureId &&
        !otherBody.isDeathWall
      ) {
        return true;
      }
    }
    edge = edge.next;
  }
  return false;
}

function evaluateBatchShared(payload) {
  const simConfig = payload.simConfig;
  const design = payload.designSnapshot;
  const captureReplay = payload.captureReplay === true;
  const world = createEngine(simConfig.gravity);
  const groundY = payload.groundY;
  const fixedDtSec = payload.fixedDtSec;
  createGround(world, groundY, {
    friction: simConfig.groundFriction,
    thickness: 16
  });
  const challengeBodies = createChallengeBodies(world, payload.terrainSnapshot, simConfig.groundFriction);

  const bounds = design.bounds;
  const startX = payload.spawnX;
  const spawnCenterX = payload.spawnCenterX;
  const relMaxY = bounds.maxY - bounds.minY;
  const startY = groundY - payload.spawnClearance - payload.nodeRadius - relMaxY;
  let deathWallX = spawnCenterX - simConfig.deathWallStartBehindMeters * SCALE;
  let deathWall = null;
  const pendingDeathWallKills = new Set();
  const queueDeathWallKill = (bodyA, bodyB) => {
    const wallA = bodyA?.isDeathWall === true;
    const wallB = bodyB?.isDeathWall === true;
    if (!wallA && !wallB) return;
    const creatureBody = wallA ? bodyB : bodyA;
    if (!Number.isInteger(creatureBody?.creatureId)) return;
    pendingDeathWallKills.add(creatureBody.creatureId);
  };
  bindSharedCreatureContactFiltering(world, (bodyA, bodyB) => {
    queueDeathWallKill(bodyA, bodyB);
  });

  const records = payload.dnaBatch.map((item, idx) => {
    const dnaObj = (item.dna || item.genome)
      ? {
          controllerType: item.controllerType || 'dense',
          genomeId: Number.isFinite(item.genomeId) ? item.genomeId : null,
          genome: item.genome || null,
          dna: item.dna instanceof Float32Array ? item.dna : new Float32Array(item.dna),
          architecture: item.architecture || null
        }
      : null;
    const creature = new Creature(
      world,
      startX,
      startY,
      design.nodes,
      design.constraints,
      dnaObj,
      bounds.minX,
      bounds.minY,
      simConfig,
      idx
    );
    return {
      item,
      creature,
      path: captureReplay ? [] : null,
      replayFrames: captureReplay ? [] : null,
      replaySampleAccumSec: 0,
      deathReason: 'timer',
      deathWallKillCount: 0,
      noSlipAppliedSteps: 0,
      noSlipTangentialResidualAccum: 0,
      noSlipTangentialSamples: 0
    };
  });
  const recordById = new Map(records.map(r => [r.creature.id, r]));

  // Match main-thread behavior: anchor wall behind the true leftmost spawned body.
  let leftmostSpawnX = Number.POSITIVE_INFINITY;
  records.forEach((record) => {
    (record.creature.bodies || []).forEach((body) => {
      const pos = body.getPosition();
      if (!pos) return;
      const x = (pos.x * SCALE) - payload.nodeRadius;
      if (Number.isFinite(x)) leftmostSpawnX = Math.min(leftmostSpawnX, x);
    });
  });
  const deathWallAnchorX = Number.isFinite(leftmostSpawnX) ? leftmostSpawnX : spawnCenterX;
  deathWallX = deathWallAnchorX - simConfig.deathWallStartBehindMeters * SCALE;
  if (simConfig.deathWallEnabled) {
    deathWall = createDeathWall(world, deathWallX, groundY, simConfig.deathWallThicknessPx);
  }

  let simTimeElapsed = 0;
  let timer = simConfig.simDuration;
  const replaySampleIntervalSec = payload.replaySampleIntervalSec || (1 / 20);
  const groundNoSlipEnabled = simConfig.groundNoSlipEnabled !== false;
  const groundNoSlipFactor = Number.isFinite(simConfig.groundNoSlipFactor) ? simConfig.groundNoSlipFactor : 0.1;
  const groundNoSlipEpsilon = Number.isFinite(simConfig.groundNoSlipEpsilon) ? simConfig.groundNoSlipEpsilon : 0.02;
  const deepDiagnostics = payload.testingModeEnabled === true || payload.mobileHeadless !== true;
  const compactResults = payload.mobileHeadless === true && payload.testingModeEnabled !== true;
  const sharedFloatView = payload.sharedResults?.floatBuffer ? new Float64Array(payload.sharedResults.floatBuffer) : null;
  const sharedIntView = payload.sharedResults?.intBuffer ? new Int32Array(payload.sharedResults.intBuffer) : null;
  let executedSteps = 0;
  const getAliveCount = () => records.reduce((acc, r) => acc + (r.creature.dead ? 0 : 1), 0);

  while (timer > 0 && getAliveCount() > 0) {
    executedSteps++;
    const time = simTimeElapsed * 10;
    records.forEach(r => {
      if (!r.creature.dead) r.creature.update(time, groundY, fixedDtSec);
    });
    world.step(fixedDtSec);

    if (simConfig.deathWallEnabled && deathWall) {
      deathWallX += simConfig.deathWallSpeedMps * SCALE * fixedDtSec;
      const pos = deathWall.getPosition();
      deathWall.setTransform(Vec2(deathWallX / SCALE, pos.y), 0);
      deathWall.setLinearVelocity(Vec2(0, 0));
    }

    if (pendingDeathWallKills.size > 0) {
      pendingDeathWallKills.forEach(creatureId => {
        const record = recordById.get(creatureId);
        if (!record || record.creature.dead) return;
        record.creature.dead = true;
        record.deathReason = 'death_wall';
        record.creature.deathReason = 'death_wall';
        record.creature.deathAt = simTimeElapsed;
        const deathX = record.creature.getX();
        if (Number.isFinite(deathX)) {
          record.creature.stats.maxX = Math.max(record.creature.stats.maxX, deathX);
        }
        record.creature.destroy();
        record.deathWallKillCount++;
      });
      pendingDeathWallKills.clear();
    }

    // Minimal post-step safety clamps only (no non-physical traction or angle teleporting).
    records.forEach(r => {
      if (r.creature.dead) return;
      applyBodySafetyClamp(r.creature.bodies, {
        isBodyGroundedStrict: body => isBodyGroundedStrict(body, r.creature.id),
        groundNoSlipEnabled,
        groundNoSlipFactor,
        groundNoSlipEpsilon,
        maxHorizontalVelocity: simConfig.maxHorizontalVelocity,
        maxVerticalVelocity: simConfig.maxVerticalVelocity,
        tiltLimitEnabled: simConfig.tiltLimitEnabled,
        maxTiltRad: simConfig.maxTiltRad,
        onNoSlipApplied: residual => {
          r.noSlipAppliedSteps++;
          r.noSlipTangentialResidualAccum += residual;
          r.noSlipTangentialSamples++;
        }
      });
    });

    records.forEach(r => {
      if (r.creature.dead) return;
      r.creature.sampleFitness(fixedDtSec, groundY);
      if (captureReplay) {
        const center = r.creature.getCenter();
        r.replaySampleAccumSec += fixedDtSec;
        if (r.replaySampleAccumSec >= replaySampleIntervalSec) {
          r.replaySampleAccumSec = 0;
          const nodes = r.creature.bodies.map(b => {
            const p = b.getPosition();
            return { x: p.x * SCALE, y: p.y * SCALE };
          });
          if (nodes.length) {
            r.replayFrames.push({ nodes, center: { x: center.x, y: center.y } });
            if (r.replayFrames.length > 320) r.replayFrames.shift();
          }
        }
        if (!r.path.length || Math.abs(center.x - r.path[r.path.length - 1].x) > 5) {
          if (r.path.length > 200) r.path.shift();
          r.path.push({ x: center.x, y: center.y });
        }
      }
    });

    timer -= fixedDtSec;
    simTimeElapsed += fixedDtSec;
  }

  const results = records.map((r, resultIndex) => {
    const creature = r.creature;
    const fitness = creature.getFitnessSnapshot();
    fitness.deathReason = r.deathReason;
    const actuationDiagnostics = extractActuationDiagnostics(fitness);
    const expectedInputs = 5 + creature.muscles.length * 2;
    const expectedOutputs = creature.muscles.length;
    const score = creatureScoreFromFitness(
      fitness,
      creature.getX(),
      spawnCenterX,
      payload.scoreWeights,
      simTimeElapsed
    );
    const peakX = Number.isFinite(fitness.maxX) ? fitness.maxX : creature.getX();
    const distance = distMetersFromX(peakX, spawnCenterX);
    const diagnostics = {
      expectedSteps: Math.max(1, Math.round(simTimeElapsed / Math.max(1e-6, fixedDtSec))),
      executedSteps,
      fixedDtExpectedSec: fixedDtSec,
      fixedDtObservedSec: executedSteps > 0 ? (simTimeElapsed / executedSteps) : fixedDtSec,
      deathReason: r.deathReason,
      deathWallKillCount: r.deathWallKillCount
    };
    if (deepDiagnostics) {
      diagnostics.remainingTimerSec = timer;
      diagnostics.phaseLockEnabled = !!simConfig.phaseLockEnabled;
      diagnostics.expectedInputs = expectedInputs;
      diagnostics.expectedOutputs = expectedOutputs;
      diagnostics.noSlipAppliedSteps = r.noSlipAppliedSteps;
      diagnostics.groundTangentialResidual = r.noSlipTangentialSamples > 0
        ? (r.noSlipTangentialResidualAccum / r.noSlipTangentialSamples)
        : 0;
      Object.assign(diagnostics, actuationDiagnostics);
    }

    const result = {
      sourceIndex: Number.isFinite(r.item?.sourceIndex) ? r.item.sourceIndex : null,
      genomeId: Number.isFinite(r.item?.genomeId) ? r.item.genomeId : (Number.isFinite(creature?.genome?.id) ? creature.genome.id : null),
      controllerType: creature.controllerType || r.item.controllerType || 'dense',
      score,
      distance,
      durationSec: simTimeElapsed,
      fitness,
      finalX: creature.getX(),
      diagnostics
    };
    if (!compactResults) {
      result.dna = creature.dna instanceof Float32Array ? creature.dna.slice() : new Float32Array(creature.dna);
      result.architecture = creature.architecture;
    }
    if (captureReplay) {
      result.path = r.path || [];
      result.replayFrames = r.replayFrames || [];
    }
    if (!compactResults && creature?.genome?.toSerializable) {
      result.genome = creature.genome.toSerializable();
    } else if (!compactResults && r.item?.genome) {
      result.genome = r.item.genome;
    }
    if (compactResults && sharedFloatView && sharedIntView) {
      const floatOffset = resultIndex * TURBO_RESULT_FLOAT_STRIDE;
      const intOffset = resultIndex * TURBO_RESULT_INT_STRIDE;
      sharedFloatView[floatOffset] = score;
      sharedFloatView[floatOffset + 1] = distance;
      sharedFloatView[floatOffset + 2] = simTimeElapsed;
      sharedFloatView[floatOffset + 3] = creature.getX();
      sharedFloatView[floatOffset + 4] = Number(fitness?.groundSlipRate) || Number(fitness?.groundSlip) || 0;
      sharedFloatView[floatOffset + 5] = Number(fitness?.actuationLevel) || 0;
      sharedFloatView[floatOffset + 6] = fixedDtSec;
      sharedFloatView[floatOffset + 7] = executedSteps > 0 ? (simTimeElapsed / executedSteps) : fixedDtSec;
      sharedIntView[intOffset] = Number.isFinite(r.item?.sourceIndex) ? r.item.sourceIndex : resultIndex;
      sharedIntView[intOffset + 1] = executedSteps;
      sharedIntView[intOffset + 2] = Math.max(1, Math.round(simTimeElapsed / Math.max(1e-6, fixedDtSec)));
      sharedIntView[intOffset + 3] = r.deathWallKillCount;
      sharedIntView[intOffset + 4] = encodeTurboDeathReason(r.deathReason);
      return null;
    }
    return result;
  });

  records.forEach(r => {
    if (!r.creature.dead) r.creature.destroy();
  });
  challengeBodies.forEach(body => world.destroyBody(body));
  cleanup(world);
  return sharedFloatView && sharedIntView ? [] : results.filter(Boolean);
}

function splitIntoSubBatches(dnaBatch, subBatchCount) {
  if (!Array.isArray(dnaBatch) || dnaBatch.length === 0) return [];
  const count = Math.max(1, Math.min(dnaBatch.length, Math.round(Number(subBatchCount) || 1)));
  if (count <= 1) return [dnaBatch];
  const out = [];
  const chunkSize = Math.ceil(dnaBatch.length / count);
  for (let i = 0; i < dnaBatch.length; i += chunkSize) {
    out.push(dnaBatch.slice(i, i + chunkSize));
  }
  return out;
}

let cachedStaticPayload = null;
let cachedStaticPayloadVersion = 0;

self.onmessage = e => {
  const payload = e.data;
  try {
    if (payload.staticPayload) {
      cachedStaticPayload = payload.staticPayload;
      cachedStaticPayloadVersion = Number(payload.staticPayloadVersion) || (cachedStaticPayloadVersion + 1);
    }
    if (!cachedStaticPayload) {
      throw new Error('Turbo worker missing static payload.');
    }

    const runPayload = {
      ...cachedStaticPayload,
      ...payload,
      staticPayload: undefined
    };
    const startedAt = performance.now();
    const subBatches = splitIntoSubBatches(runPayload.dnaBatch || [], runPayload.subBatchCount);
    const results = [];
    if (subBatches.length <= 1) {
      results.push(...evaluateBatchShared(runPayload));
    } else {
      subBatches.forEach(dnaBatch => {
        results.push(...evaluateBatchShared({
          ...runPayload,
          dnaBatch
        }));
      });
    }
    self.postMessage({
      ok: true,
      generation: runPayload.generation,
      workerId: runPayload.workerId,
      staticPayloadVersion: cachedStaticPayloadVersion,
      results,
      useSharedResults: !!(runPayload.sharedResults?.floatBuffer && runPayload.sharedResults?.intBuffer),
      batchSize: Array.isArray(runPayload.dnaBatch) ? runPayload.dnaBatch.length : 0,
      subBatchCount: subBatches.length,
      elapsedMs: performance.now() - startedAt
    });
  } catch (err) {
    self.postMessage({
      ok: false,
      generation: payload.generation,
      workerId: payload.workerId,
      error: err instanceof Error ? err.message : String(err)
    });
  }
};
