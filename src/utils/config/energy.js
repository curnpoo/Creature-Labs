/**
 * Energy System Parameters
 * Controls energy costs, regeneration, and efficiency
 */
export const ENERGY_CONFIG = {
  // Core Energy Settings
  enabled: false,               // Enable/disable energy system
  maxEnergy: 100,               // Maximum energy capacity
  startingEnergy: 100,          // Starting energy (% of max, or absolute value)

  // Energy Costs
  usagePerActuation: 1.0, // Energy cost per unit of muscle actuation (0-1 range)
  baseDrain: 0.01, // Low base drain - ~2.4/sec with 4 muscles, sustainable with rest
  minEnergyForActuation: 0, // Minimum energy required to actuate muscles (0 = always allow)

  // Energy Regeneration
  regenRate: 8, // Lower base regen - must rest to recover
  regenInactivityBonus: true,   // Bonus regen when muscles are inactive
  regenMinMultiplier: 0.5,      // Minimum regen even when fully active (50% of regenRate) - up from 20%
  regenWhileGrounded: 1.0,      // Regen multiplier when grounded (1.0 = normal)
  regenWhileAirborne: 0.8,      // Regen multiplier when airborne - up from 0.5

  // Energy-Based Strength Modifiers - Less punishing curve
  strengthAtFullEnergy: 1.0,  // Strength multiplier at 100% energy
  strengthAt75Energy: 0.9,    // Strength at 75% energy
  strengthAt50Energy: 0.75,   // Strength at 50% energy - still decent
  strengthAt25Energy: 0.55,   // Strength at 25% energy - weakened but not crippled
  strengthAt20Energy: 0.45,   // Strength at 20% energy
  strengthAtZeroEnergy: 0.35, // Strength at 0% energy - 35% is minimum

  // Fitness Rewards
  efficiencyBonus: 0.5,         // Fitness bonus for energy efficiency (distance/energy)
  penaltyForDepletion: 0,       // Penalty if energy hits zero (0 = no penalty)
};
