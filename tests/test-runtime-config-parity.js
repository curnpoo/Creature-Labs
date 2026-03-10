import assert from 'node:assert/strict';

import { Simulation } from '../src/sim/Simulation.js';

const RUNTIME_KEYS = [
  'jointFreedom',
  'muscleStrength',
  'jointMoveSpeed',
  'muscleRange',
  'muscleMinLength',
  'muscleMaxLength',
  'muscleSmoothing',
  'muscleSignalRateLimit',
  'muscleSpringConstant',
  'muscleDamping',
  'groundedBothBodies',
  'groundedOneBody',
  'groundedNoBodies',
  'groundedVerticalForceScale',
  'groundedDeadbandErrorPx',
  'groundedDeadbandVelPxPerSec',
  'groundedSoftZoneErrorPx',
  'groundedSoftZoneForceScale',
  'groundedForceRateLimit',
  'groundedSignFlipDeadband',
  'groundedMinForceMagnitude',
  'maxHorizontalVelocity',
  'maxVerticalVelocity',
  'groundNoSlipEnabled',
  'groundNoSlipFactor',
  'groundNoSlipEpsilon',
  'tractionDamping',
  'muscleActionBudget',
  'phaseLockEnabled',
  'gaitHz',
  'commandDeadband',
  'maxCommandDeltaPerStep',
  'bodyFriction',
  'bodyStaticFriction',
  'bodyAirFriction',
  'groundedThreshold',
  'tiltLimitEnabled',
  'maxTiltDeg',
  'hiddenLayers',
  'neuronsPerLayer',
  'energyEnabled',
  'maxEnergy',
  'energyRegenRate',
  'energyUsagePerActuation',
  'minEnergyForActuation',
  'baseDrain',
  'trainingAlgorithm'
];

const sim = new Simulation();
const creature = {
  simConfig: {},
  bodies: []
};

sim.creatures = [creature];
sim.syncCreatureRuntimeSettings();

const simConfig = sim.getSimConfig();

RUNTIME_KEYS.forEach((key) => {
  assert.ok(key in simConfig, `getSimConfig() is missing runtime key "${key}"`);
  assert.equal(
    creature.simConfig[key],
    simConfig[key],
    `syncCreatureRuntimeSettings() drifted for "${key}"`
  );
});

console.log('test-runtime-config-parity: OK');
