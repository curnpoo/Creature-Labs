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
  defaultSimSpeed: 8,
  defaultGravity: 1.0,
  defaultMuscleStrength: 1.2,
  defaultJointMoveSpeed: 1.0,
  defaultJointFreedom: 1.0,
  defaultZoom: 1.0,
};

export const STORAGE_KEYS = {
  modulePrefix: 'polyevolve.module.'
};
