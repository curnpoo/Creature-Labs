import { SCALE } from './Physics.js';

const SLIP_GATE_FAIL_BASE_SCORE = -1_000_000_000;

export function distMetersFromX(x, spawnCenterX) {
  return Math.max(0, (x - spawnCenterX) / SCALE);
}

export function resolveSlipGate(weights) {
  const thresholdRaw = Number(weights?.groundSlipFailThreshold);
  const graceRaw = Number(weights?.slipGraceSeconds);
  const threshold = Number.isFinite(thresholdRaw) ? Math.max(0, thresholdRaw) : Number.POSITIVE_INFINITY;
  const graceSeconds = Number.isFinite(graceRaw) ? Math.max(0, graceRaw) : 0;
  return { threshold, graceSeconds };
}

export function normalizedGroundSlip(fitness) {
  const normalized = Number(fitness?.groundSlipRate);
  if (Number.isFinite(normalized) && normalized >= 0) return normalized;
  return Number(fitness?.groundSlip) || 0;
}

export function fitnessPassesSlipGate(fitness, weights, elapsedSec = Number.POSITIVE_INFINITY) {
  if (fitness?.deathReason === 'death_wall') return true;
  const { threshold, graceSeconds } = resolveSlipGate(weights);
  if (!Number.isFinite(threshold)) return true;
  if (Number(elapsedSec) < graceSeconds) return true;
  const slip = normalizedGroundSlip(fitness);
  return slip <= threshold;
}

export function creatureScoreFromFitness(fitness, creatureX, spawnCenterX, weights, elapsedSec = Number.POSITIVE_INFINITY) {
  const slip = normalizedGroundSlip(fitness);
  if (!fitnessPassesSlipGate(fitness, weights, elapsedSec)) {
    return SLIP_GATE_FAIL_BASE_SCORE - slip * 1000;
  }

  const resolvedMaxX = Number.isFinite(fitness.maxX) ? fitness.maxX : creatureX;
  const distance = distMetersFromX(resolvedMaxX, spawnCenterX);
  const signedDistance = (creatureX - spawnCenterX) / SCALE;
  const cappedDistance = Math.min(distance, 200);
  const groundedRatio = Math.max(0, 1 - (fitness.airtimePct || 0) / 100);
  // Keep distance as the dominant objective while still preferring grounded gait.
  // The previous squared term heavily suppressed forward progress and favored shimmy.
  const airtimeDiscount = Math.max(0.35, 0.55 + (groundedRatio * 0.45));

  let score = cappedDistance * weights.distanceRewardWeight * airtimeDiscount;
  score += (fitness.coordinationBonus || 0) * weights.coordinationBonusWeight;
  score -= (fitness.actuationJerk || 0) * weights.actuationJerkPenalty;
  score -= slip * weights.groundSlipPenaltyWeight;

  if (signedDistance < 0) {
    score -= Math.abs(signedDistance) * weights.backwardsPenalty;
  }

  if (Number.isFinite(fitness.groundedRatio)) {
    score += fitness.groundedRatio * weights.groundedRatioBonusWeight;
  }
  if (Number.isFinite(fitness.airtimePct)) {
    score -= (fitness.airtimePct / 100) * weights.airtimePenaltyWeight;
  }
  if (Number.isFinite(fitness.verticalSpeed)) {
    score -= fitness.verticalSpeed * weights.verticalSpeedPenalty;
  }
  if (Number.isFinite(fitness.airtimePct) && distance > 60 && fitness.airtimePct > 85) {
    score -= (distance - 60) * 8;
  }
  if (Number.isFinite(fitness.energyViolations) && fitness.energyViolations > 0) {
    score -= fitness.energyViolations * 0.5;
  }
  if (Number.isFinite(fitness.teleportViolations) && fitness.teleportViolations > 0) {
    score -= 5000 * fitness.teleportViolations;
  }
  if (Number.isFinite(fitness.invalidGenome) && fitness.invalidGenome > 0) {
    score -= 100000 * fitness.invalidGenome;
  }
  if (weights.energyEnabled && fitness.energyEfficiency > 0) {
    score += fitness.energyEfficiency * weights.energyEfficiencyBonus;
  }

  return score;
}

export function extractScoreWeights(sim) {
  return {
    distanceRewardWeight: sim.distanceRewardWeight,
    coordinationBonusWeight: sim.coordinationBonusWeight,
    actuationJerkPenalty: sim.actuationJerkPenalty,
    // Slip pressure is intentionally disabled for now; wall + distance should drive selection.
    groundSlipPenaltyWeight: 0,
    backwardsPenalty: sim.backwardsPenalty,
    groundedRatioBonusWeight: sim.groundedRatioBonusWeight,
    airtimePenaltyWeight: sim.airtimePenaltyWeight,
    verticalSpeedPenalty: sim.verticalSpeedPenalty,
    energyEnabled: sim.energyEnabled,
    energyEfficiencyBonus: sim.energyEfficiencyBonus,
    groundSlipFailThreshold: Number.POSITIVE_INFINITY,
    slipGraceSeconds: 0
  };
}
