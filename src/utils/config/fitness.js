/**
 * Fitness Function Parameters
 * Controls rewards and penalties for evolved behaviors
 */
export const FITNESS_CONFIG = {
  // Primary Rewards
  distanceWeight: 250,          // Reward for distance traveled (primary objective)
  speedWeight: 0.25,            // Reward for movement speed
  stabilityWeight: 1.0,         // Reward for upright/stable posture - reduced from 5.0
  rewardStability: false,       // Disable by default - let creatures learn movement first

  // Gait Quality Penalties (REDUCED to allow learning)
  spinPenalty: 2000,            // Penalty for spinning - reduced from 15000
  spinAccumulatedPenalty: 20,   // Penalty for total accumulated spin - reduced from 150
  jitterPenalty: 5,             // Penalty for erratic muscle actuation - reduced from 60
  groundSlipPenalty: 5,         // Penalty for slipping on ground - reduced from 35
  airtimePenalty: 0.1,          // Penalty for time spent airborne - reduced from 0.3
  stumblePenalty: 2,            // Penalty for stumbling - reduced from 15

  // Advanced Penalties
  energyViolationPenalty: 500,  // Penalty for suspicious energy gains (exploit detection)

  // Penalty Scaling
  gaitPenaltyScale: 1.5,        // Multiplier for gait penalties when stability is enabled
  distanceScaling: 0.02,        // Distance-based penalty scaling (longer = stricter)

  // Actuation Bonuses
  actuationLevelBonus: 0.8,     // Speed bonus for high actuation (0.2 base + 0.8 × actuation)
};
