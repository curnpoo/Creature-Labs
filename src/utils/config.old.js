export const CONFIG = {
  defaultPopSize: 24,
  nodeRadius: 10,
  spawnClearance: 34,
  ghostMaxAge: 10,
  replayMax: 180,
  fixedStepHz: 60,
  maxPhysicsStepsPerFrame: 240,

  // Neural network defaults
  defaultHiddenLayers: 1,
  defaultNeuronsPerLayer: 12,
  defaultActivation: 'tanh',

  // Evolution defaults
  defaultEliteCount: 2,
  defaultTournamentSize: 3,
  defaultMutationRate: 0.08,
  defaultMutationSize: 1.0,
  stagnantMutBonus: 0.015,
  maxMutationRate: 0.95,

  // Simulation
  defaultSimDuration: 8,
  defaultSimSpeed: 1,
  defaultGravity: 1.0,
  defaultMuscleStrength: 1.0,       // Reduced from 1.4 for coordinated movement
  defaultJointMoveSpeed: 0.7,       // Reduced from 1.1 to prevent explosive actuation
  defaultJointFreedom: 1.0,
  defaultGroundFriction: 0.5,       // Matter.js range: 0-1 (was incorrectly 15.0!)
  defaultGroundStaticFriction: 0.8, // Matter.js range: 0-1 (was incorrectly 25.0!)
  defaultTractionDamping: 0.93,     // Keep only 7% velocity (increased from 0.85)
  defaultBodyFriction: 0.4,         // Matter.js range: 0-1 (was incorrectly 10.0!)
  defaultBodyStaticFriction: 0.6,   // Matter.js range: 0-1 (was incorrectly 20.0!)
  defaultBodyAirFriction: 0.08,
  defaultMuscleRange: 0.8,          // Reduced from 1.0 (effective range: 14.4% vs 18%)
  defaultMuscleSmoothing: 0.22,
  defaultDistanceRewardWeight: 250, // Reduced from 320 to balance gait quality
  defaultSpeedRewardWeight: 0.25,   // Reduced from 0.35
  defaultStabilityRewardWeight: 0.9,
  defaultJitterPenaltyWeight: 60,   // Increased from 40 for smoother gaits
  defaultGroundSlipPenaltyWeight: 35, // Increased from 20
  defaultSpinPenaltyWeight: 15000,  // Increased from 10000
  defaultZoom: 1.0,

  // Energy System (NEW)
  defaultEnergyEnabled: true,
  defaultMaxEnergy: 100,            // Maximum energy capacity
  defaultEnergyRegenRate: 25,       // Energy regenerated per second when idle
  defaultEnergyUsagePerActuation: 0.8, // Energy cost per unit of muscle actuation
  defaultMinEnergyForActuation: 0,  // Minimum energy to allow any actuation (0 = always allow some)
  defaultEnergyEfficiencyBonus: 0.5, // Reward multiplier for energy efficiency
};

export const STORAGE_KEYS = {
  modulePrefix: 'polyevolve.module.'
};
