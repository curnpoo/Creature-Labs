/**
 * Fitness Function Parameters
 * Controls rewards and penalties for evolved behaviors
 */
export const FITNESS_CONFIG = {
  // Primary Rewards
  distanceWeight: 250,          // Reward for distance traveled (primary objective)
  speedWeight: 0.25,            // Reward for movement speed
  stabilityWeight: 0.9,         // Reward for stable posture
  rewardStability: true,        // Enable stability rewards

  // Gait Quality Penalties
  spinPenalty: 15000,           // Penalty for spinning (quadratic + cumulative)
  spinAccumulatedPenalty: 150,  // Penalty for total accumulated spin
  jitterPenalty: 60,            // Penalty for erratic muscle actuation (power 1.5)
  groundSlipPenalty: 35,        // Penalty for slipping on ground
  airtimePenalty: 0.3,          // Penalty for time spent airborne
  stumblePenalty: 15,           // Penalty for stumbling (center too low)

  // Advanced Penalties
  energyViolationPenalty: 500,  // Penalty for suspicious energy gains (exploit detection)

  // Penalty Scaling
  gaitPenaltyScale: 1.5,        // Multiplier for gait penalties when stability is enabled
  distanceScaling: 0.02,        // Distance-based penalty scaling (longer = stricter)

  // Actuation Bonuses
  actuationLevelBonus: 0.8,     // Speed bonus for high actuation (0.2 base + 0.8 × actuation)
};
