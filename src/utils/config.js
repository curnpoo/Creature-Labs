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
  defaultMuscleStrength: 1.4,
  defaultJointMoveSpeed: 1.1,
  defaultJointFreedom: 1.0,
  defaultGroundFriction: 3.0,
  defaultGroundStaticFriction: 12.0,
  defaultTractionDamping: 0.65,
  defaultBodyFriction: 3.0,
  defaultBodyStaticFriction: 12.0,
  defaultBodyAirFriction: 0.08,
  defaultMuscleRange: 0.18,
  defaultMuscleSmoothing: 0.22,
  defaultDistanceRewardWeight: 320,
  defaultSpeedRewardWeight: 0.35,
  defaultStabilityRewardWeight: 0.9,
  defaultJitterPenaltyWeight: 40,
  defaultGroundSlipPenaltyWeight: 20,
  defaultZoom: 1.0,
};

export const STORAGE_KEYS = {
  modulePrefix: 'polyevolve.module.'
};
