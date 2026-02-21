/**
 * Fitness Function Parameters
 * Controls rewards and penalties for evolved behaviors.
 *
 * Fields used directly in Simulation.creatureScore():
 *   distanceWeight, coordinationBonusWeight, actuationJerkPenalty,
 *   groundSlipPenalty, spinThreshold, spinPenalty, stumblePenalty, backwardsPenalty
 *
 * Legacy fields kept for config/index.js backward compatibility
 * (referenced as CONFIG.defaultSpeedRewardWeight etc.) but not applied in the score:
 *   speedWeight, stabilityWeight, stumblePenaltyWeight, jitterPenalty, spinAccumulatedPenalty
 */
export const FITNESS_CONFIG = {
  // PRIMARY reward: distance traveled × this multiplier
  distanceWeight: 10,

  // REAL GAIT BONUS: reward anti-phase muscle alternation (walking pattern)
  coordinationBonusWeight: 2,

  // ANTI-FLAIL: penalize chaotic high-frequency actuation changes
  actuationJerkPenalty: 5,

  // ANTI-DRAG: penalize grounded nodes sliding horizontally
  groundSlipPenalty: 0.15,

  // ANTI-SPIN: sustained rotation threshold and per-unit penalty
  spinThreshold: 0.5,
  spinPenalty: 6,

  // ANTI-COLLAPSE: penalty per stumble event
  stumblePenalty: 3,

  // ANTI-BACKWARDS: extra multiplier for negative distance
  backwardsPenalty: 8,

  // --- Legacy fields (read by config/index.js, not applied in creatureScore) ---
  speedWeight: 0,
  stabilityWeight: 0,
  stumblePenaltyWeight: 3,
  jitterPenalty: 5,
  spinAccumulatedPenalty: 0,
  rewardStability: false,
};
