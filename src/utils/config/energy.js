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
  usagePerActuation: 0.05,      // Energy cost per unit of muscle actuation (0-1 range) - reduced from 0.8
  minEnergyForActuation: 0,     // Minimum energy required to actuate muscles (0 = always allow)

  // Energy Regeneration
  regenRate: 60,                // Base energy regeneration per second - increased from 35
  regenInactivityBonus: true,   // Bonus regen when muscles are inactive
  regenMinMultiplier: 0.5,      // Minimum regen even when fully active (50% of regenRate) - up from 20%
  regenWhileGrounded: 1.0,      // Regen multiplier when grounded (1.0 = normal)
  regenWhileAirborne: 0.8,      // Regen multiplier when airborne - up from 0.5

  // Energy-Based Strength Modifiers - DRAMATIC falloff (energy is critical!)
  strengthAtFullEnergy: 1.0, // Strength multiplier at 100% energy
  strengthAt75Energy: 0.85, // Strength at 75% energy
  strengthAt50Energy: 0.6, // Strength at 50% energy - significantly weaker
  strengthAt25Energy: 0.3, // Strength at 25% energy - barely functional
  strengthAt20Energy: 0.15, // Strength at 20% energy - nearly depleted
  strengthAtZeroEnergy: 0.05, // Strength at 0% energy - almost no movement

  // Fitness Rewards
  efficiencyBonus: 0.5,         // Fitness bonus for energy efficiency (distance/energy)
  penaltyForDepletion: 0,       // Penalty if energy hits zero (0 = no penalty)
};
