/**
 * Muscle & Actuation Parameters
 * Controls muscle strength, speed, and range of motion
 */
export const MUSCLE_CONFIG = {
  // Base Muscle Properties
  strength: 1.5, // Base muscle strength (1.5 = strong actuation)
  moveSpeed: 1.2, // Joint movement speed (1.2 = responsive)
  range: 1.2, // Muscle contraction range (1.2 = ±120% from base length for full range)
  smoothing: 0.15, // Muscle signal smoothing (0.15 = responsive but not jerky)

  // Ground-Dependent Strength (prevents air-pushing exploits)
  groundedBothBodies: 1.0,      // Strength when both bodies grounded (100%)
  groundedOneBody: 0.7,         // Strength when one body grounded (70%)
  groundedNoBodies: 0.15,       // Strength when airborne (15% - internal tension only)

  // Force Limiting
  maxForcePerStep: 0.4,         // Max force per step (as fraction of base length)

  // Joint Freedom/Stiffness
  jointFreedom: 1.0,            // Joint freedom (1.0 = free, 0.0 = rigid)
};
