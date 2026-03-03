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
  defaultTrainingAlgorithm: EVOLUTION_CONFIG.trainingAlgorithm,

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
  defaultGroundedThreshold: PHYSICS_CONFIG.groundedThreshold,
  defaultGroundedUpwardDamping: PHYSICS_CONFIG.groundedUpwardDamping,
  defaultGroundedDownwardDamping: PHYSICS_CONFIG.groundedDownwardDamping,
  defaultMaxHorizontalVelocity: PHYSICS_CONFIG.maxHorizontalVelocity,
  defaultMaxVerticalVelocity: PHYSICS_CONFIG.maxVerticalVelocity,
  defaultGroundNoSlipEnabled: PHYSICS_CONFIG.groundNoSlipEnabled,
  defaultGroundNoSlipFactor: PHYSICS_CONFIG.groundNoSlipFactor,
  defaultGroundNoSlipEpsilon: PHYSICS_CONFIG.groundNoSlipEpsilon,
  defaultTiltLimitEnabled: PHYSICS_CONFIG.tiltLimitEnabled,
  defaultMaxTiltDeg: PHYSICS_CONFIG.maxTiltDeg,
  defaultBodyFriction: PHYSICS_CONFIG.bodyFriction,
  defaultBodyStaticFriction: PHYSICS_CONFIG.bodyStaticFriction,
  defaultBodyAirFriction: PHYSICS_CONFIG.bodyAirFriction,

  // Muscle Properties
  defaultMuscleStrength: MUSCLE_CONFIG.strength,
  defaultJointMoveSpeed: MUSCLE_CONFIG.moveSpeed,
  defaultJointFreedom: MUSCLE_CONFIG.jointFreedom,
  defaultMuscleRange: MUSCLE_CONFIG.range,
  defaultMuscleMinLength: MUSCLE_CONFIG.minLength,
  defaultMuscleMaxLength: MUSCLE_CONFIG.maxLength,
  defaultMuscleSmoothing: MUSCLE_CONFIG.smoothing,
  defaultMuscleSignalRateLimit: MUSCLE_CONFIG.signalRateLimit,
  defaultMuscleSpringConstant: MUSCLE_CONFIG.springConstant,
  defaultMuscleDamping: MUSCLE_CONFIG.damping,
  defaultGroundedBothBodies: MUSCLE_CONFIG.groundedBothBodies,
  defaultGroundedOneBody: MUSCLE_CONFIG.groundedOneBody,
  defaultGroundedNoBodies: MUSCLE_CONFIG.groundedNoBodies,
  defaultGroundedVerticalForceScale: MUSCLE_CONFIG.groundedVerticalForceScale,
  defaultGroundedDeadbandErrorPx: MUSCLE_CONFIG.groundedDeadbandErrorPx,
  defaultGroundedDeadbandVelPxPerSec: MUSCLE_CONFIG.groundedDeadbandVelPxPerSec,
  defaultGroundedSoftZoneErrorPx: MUSCLE_CONFIG.groundedSoftZoneErrorPx,
  defaultGroundedSoftZoneForceScale: MUSCLE_CONFIG.groundedSoftZoneForceScale,
  defaultGroundedForceRateLimit: MUSCLE_CONFIG.groundedForceRateLimit,
  defaultGroundedSignFlipDeadband: MUSCLE_CONFIG.groundedSignFlipDeadband,
  defaultGroundedMinForceMagnitude: MUSCLE_CONFIG.groundedMinForceMagnitude,
  defaultMuscleActionBudget: MUSCLE_CONFIG.actionBudget,
  defaultPhaseLockEnabled: MUSCLE_CONFIG.phaseLockEnabled,
  defaultGaitHz: MUSCLE_CONFIG.gaitHz,
  defaultCommandDeadband: MUSCLE_CONFIG.commandDeadband,
  defaultMaxCommandDeltaPerStep: MUSCLE_CONFIG.maxCommandDeltaPerStep,

  // Fitness Weights
  defaultDistanceRewardWeight: FITNESS_CONFIG.distanceWeight,
  defaultSpeedRewardWeight: FITNESS_CONFIG.speedWeight,
  defaultStabilityRewardWeight: FITNESS_CONFIG.stabilityWeight,
  defaultStumblePenaltyWeight: FITNESS_CONFIG.stumblePenaltyWeight,
  defaultJitterPenaltyWeight: FITNESS_CONFIG.jitterPenalty,
  defaultGroundSlipPenaltyWeight: FITNESS_CONFIG.groundSlipPenalty,
  defaultSpinPenaltyWeight: FITNESS_CONFIG.spinPenalty,
  defaultCoordinationBonusWeight: FITNESS_CONFIG.coordinationBonusWeight,
  defaultActuationJerkPenalty: FITNESS_CONFIG.actuationJerkPenalty,
  defaultSpinThreshold: FITNESS_CONFIG.spinThreshold,
  defaultStumblePenalty: FITNESS_CONFIG.stumblePenalty,
  defaultUprightPenaltyWeight: FITNESS_CONFIG.uprightPenaltyWeight,
  defaultBackwardsPenalty: FITNESS_CONFIG.backwardsPenalty,
  defaultGroundedRatioBonusWeight: FITNESS_CONFIG.groundedRatioBonusWeight,
  defaultAirtimePenaltyWeight: FITNESS_CONFIG.airtimePenaltyWeight,
  defaultVerticalSpeedPenalty: FITNESS_CONFIG.verticalSpeedPenalty,
  defaultDeathWallEnabled: FITNESS_CONFIG.deathWallEnabled,
  defaultDeathWallStartBehindMeters: FITNESS_CONFIG.deathWallStartBehindMeters,
  defaultDeathWallSpeedMps: FITNESS_CONFIG.deathWallSpeedMps,
  defaultDeathWallThicknessPx: FITNESS_CONFIG.deathWallThicknessPx,

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

  // Full config modules (for direct access)
  PHYSICS_CONFIG,
  MUSCLE_CONFIG,
  FITNESS_CONFIG,
  EVOLUTION_CONFIG,
  ENERGY_CONFIG,
  VISUAL_CONFIG,

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
