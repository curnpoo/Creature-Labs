/**
 * Fitness Function Parameters
 * Controls rewards and penalties for evolved behaviors
 */
export const FITNESS_CONFIG = {
  // Primary Rewards
  distanceWeight: 250,          // Reward for distance traveled (primary objective)
  speedWeight: 0.25,            // Reward for movement speed
  stabilityWeight: 1.0,         // Reward for upright/stable posture
  rewardStability: true,        // Enable by default - gentle upright encouragement helps locomotion

  // Gait Quality Penalties (REDUCED to allow learning)
  spinPenalty: 2000,            // Penalty for spinning - reduced from 15000
  spinAccumulatedPenalty: 20,   // Penalty for total accumulated spin - reduced from 150
  jitterPenalty: 5,             // Penalty for erratic muscle actuation - reduced from 60
  groundSlipPenalty: 5,         // Penalty for slipping on ground - reduced from 35
  airtimePenalty: 0.1,          // Penalty for time spent airborne - reduced from 0.3
  stumblePenalty: 2,            // Penalty for stumbling - reduced from 15
  stumblePenaltyWeight: 2,     // UI-configurable stumble penalty weight

  // Advanced Penalties
  energyViolationPenalty: 500,  // Penalty for suspicious energy gains (exploit detection)

  // Penalty Scaling
  gaitPenaltyScale: 1.5,        // Multiplier for gait penalties when stability is enabled
  distanceScaling: 0.02,        // Distance-based penalty scaling (longer = stricter)

  // Actuation Bonuses
  actuationLevelBonus: 0.8,     // Speed bonus for high actuation (0.2 base + 0.8 × actuation)
};
