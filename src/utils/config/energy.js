/**
 * Energy System Parameters
 * Controls energy costs, regeneration, and efficiency
 */
export const ENERGY_CONFIG = {
  // Core Energy Settings
  enabled: true,                // Enable/disable energy system
  maxEnergy: 100,               // Maximum energy capacity
  startingEnergy: 100,          // Starting energy (% of max, or absolute value)

  // Energy Costs
  usagePerActuation: 0.8,       // Energy cost per unit of muscle actuation (0-1 range)
  minEnergyForActuation: 0,     // Minimum energy required to actuate muscles (0 = always allow)

  // Energy Regeneration
  regenRate: 25,                // Base energy regeneration per second when idle
  regenInactivityBonus: true,   // Bonus regen when muscles are inactive
  regenWhileGrounded: 1.0,      // Regen multiplier when grounded (1.0 = normal)
  regenWhileAirborne: 0.5,      // Regen multiplier when airborne (0.5 = half speed)

  // Energy-Based Strength Modifiers
  strengthAtFullEnergy: 1.0,    // Strength multiplier at 100% energy
  strengthAt50Energy: 0.85,     // Strength multiplier at 50% energy
  strengthAt20Energy: 0.4,      // Strength multiplier at 20% energy
  strengthAtZeroEnergy: 0.0,    // Strength multiplier at 0% energy (complete exhaustion)

  // Fitness Rewards
  efficiencyBonus: 0.5,         // Fitness bonus for energy efficiency (distance/energy)
  penaltyForDepletion: 0,       // Penalty if energy hits zero (0 = no penalty)
};
