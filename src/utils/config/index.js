/**
 * Main Configuration Index
 * Exports all config modules and provides unified CONFIG object
 */

import { PHYSICS_CONFIG } from './physics.js';
import { ENERGY_CONFIG } from './energy.js';
import { MUSCLE_CONFIG } from './muscle.js';
import { FITNESS_CONFIG } from './fitness.js';
import { EVOLUTION_CONFIG } from './evolution.js';
import { VISUAL_CONFIG } from './visual.js';

/**
 * Unified CONFIG object for backward compatibility
 * Maps new modular configs to old flat structure
 */
export const CONFIG = {
  // Population & Evolution
  defaultPopSize: EVOLUTION_CONFIG.populationSize,
  defaultEliteCount: EVOLUTION_CONFIG.eliteCount,
  defaultTournamentSize: EVOLUTION_CONFIG.tournamentSize,
  defaultMutationRate: EVOLUTION_CONFIG.mutationRate,
  defaultMutationSize: EVOLUTION_CONFIG.mutationSize,
  stagnantMutBonus: EVOLUTION_CONFIG.stagnantMutBonus,
  maxMutationRate: EVOLUTION_CONFIG.maxMutationRate,

  // Simulation Timing
  defaultSimDuration: EVOLUTION_CONFIG.generationDuration,
  defaultSimSpeed: EVOLUTION_CONFIG.simulationSpeed,
  fixedStepHz: PHYSICS_CONFIG.fixedStepHz,
  maxPhysicsStepsPerFrame: PHYSICS_CONFIG.maxPhysicsStepsPerFrame,

  // Physics
  defaultGravity: PHYSICS_CONFIG.gravity,
  defaultGroundFriction: PHYSICS_CONFIG.groundFriction,
  defaultGroundStaticFriction: PHYSICS_CONFIG.groundStaticFriction,
  defaultTractionDamping: PHYSICS_CONFIG.tractionDamping,
  defaultBodyFriction: PHYSICS_CONFIG.bodyFriction,
  defaultBodyStaticFriction: PHYSICS_CONFIG.bodyStaticFriction,
  defaultBodyAirFriction: PHYSICS_CONFIG.bodyAirFriction,

  // Muscle Properties
  defaultMuscleStrength: MUSCLE_CONFIG.strength,
  defaultJointMoveSpeed: MUSCLE_CONFIG.moveSpeed,
  defaultJointFreedom: MUSCLE_CONFIG.jointFreedom,
  defaultMuscleRange: MUSCLE_CONFIG.range,
  defaultMuscleSmoothing: MUSCLE_CONFIG.smoothing,
  defaultMuscleActionBudget: MUSCLE_CONFIG.actionBudget,

  // Fitness Weights
  defaultDistanceRewardWeight: FITNESS_CONFIG.distanceWeight,
  defaultSpeedRewardWeight: FITNESS_CONFIG.speedWeight,
  defaultStabilityRewardWeight: FITNESS_CONFIG.stabilityWeight,
  defaultJitterPenaltyWeight: FITNESS_CONFIG.jitterPenalty,
  defaultGroundSlipPenaltyWeight: FITNESS_CONFIG.groundSlipPenalty,
  defaultSpinPenaltyWeight: FITNESS_CONFIG.spinPenalty,

  // Energy System
  defaultEnergyEnabled: ENERGY_CONFIG.enabled,
  defaultMaxEnergy: ENERGY_CONFIG.maxEnergy,
  defaultEnergyRegenRate: ENERGY_CONFIG.regenRate,
  defaultEnergyUsagePerActuation: ENERGY_CONFIG.usagePerActuation,
  defaultMinEnergyForActuation: ENERGY_CONFIG.minEnergyForActuation,
  defaultEnergyEfficiencyBonus: ENERGY_CONFIG.efficiencyBonus,

  // Neural Network
  defaultHiddenLayers: EVOLUTION_CONFIG.hiddenLayers,
  defaultNeuronsPerLayer: EVOLUTION_CONFIG.neuronsPerLayer,
  defaultActivation: EVOLUTION_CONFIG.activation,

  // Visual
  nodeRadius: PHYSICS_CONFIG.nodeRadius,
  spawnClearance: PHYSICS_CONFIG.spawnClearance,
  ghostMaxAge: VISUAL_CONFIG.ghostMaxAge,
  replayMax: VISUAL_CONFIG.replayMax,
  defaultZoom: VISUAL_CONFIG.defaultZoom,
};

export const STORAGE_KEYS = {
  modulePrefix: 'polyevolve.module.'
};

/**
 * Export individual config modules for granular access
 */
export {
  PHYSICS_CONFIG,
  ENERGY_CONFIG,
  MUSCLE_CONFIG,
  FITNESS_CONFIG,
  EVOLUTION_CONFIG,
  VISUAL_CONFIG,
};

/**
 * Config Presets for different scenarios
 */
export const PRESETS = {
  // Fast but potentially unstable evolution
  SPEED: {
    ...EVOLUTION_CONFIG,
    simulationSpeed: 4,
    generationDuration: 6,
  },

  // Slow but very stable physics
  STABLE: {
    ...PHYSICS_CONFIG,
    positionIterations: 30,
    velocityIterations: 24,
    constraintIterations: 36,
  },

  // Emphasize realistic walking
  WALKING: {
    ...MUSCLE_CONFIG,
    strength: 0.9,
    moveSpeed: 0.6,
    ...FITNESS_CONFIG,
    spinPenalty: 20000,
    airtimePenalty: 0.5,
  },

  // Rapid evolution with reduced constraints
  EXPLORATORY: {
    ...MUSCLE_CONFIG,
    strength: 1.3,
    moveSpeed: 1.0,
    ...EVOLUTION_CONFIG,
    mutationRate: 0.15,
    mutationSize: 1.5,
  },

  // Energy-efficient gaits
  EFFICIENT: {
    ...ENERGY_CONFIG,
    usagePerActuation: 1.2,
    regenRate: 20,
    efficiencyBonus: 1.0,
  },
};

/**
 * Helper function to merge preset with current config
 */
export function applyPreset(currentConfig, presetName) {
  const preset = PRESETS[presetName];
  if (!preset) {
    console.warn(`Preset "${presetName}" not found`);
    return currentConfig;
  }
  return { ...currentConfig, ...preset };
}

/**
 * Helper to get all tunable parameters with their current values
 */
export function getAllTunableParams() {
  return {
    physics: { ...PHYSICS_CONFIG },
    energy: { ...ENERGY_CONFIG },
    muscle: { ...MUSCLE_CONFIG },
    fitness: { ...FITNESS_CONFIG },
    evolution: { ...EVOLUTION_CONFIG },
    visual: { ...VISUAL_CONFIG },
  };
}
