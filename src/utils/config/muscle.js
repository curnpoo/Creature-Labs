/**
 * Muscle & Actuation Parameters
 * Controls muscle strength, speed, and range of motion
 */
export const MUSCLE_CONFIG = {
  // Base Muscle Properties
  strength: 1.0,                // Base muscle strength (1.0 = balanced)
  moveSpeed: 0.7,               // Joint movement speed (0.7 = controlled, prevents exploits)
  range: 0.8,                   // Muscle contraction range (0.8 = ±80% from base length)
  smoothing: 0.22,              // Muscle signal smoothing (0-1, higher = smoother)

  // Ground-Dependent Strength (prevents air-pushing exploits)
  groundedBothBodies: 1.0,      // Strength when both bodies grounded (100%)
  groundedOneBody: 0.7,         // Strength when one body grounded (70%)
  groundedNoBodies: 0.15,       // Strength when airborne (15% - internal tension only)

  // Force Limiting
  maxForcePerStep: 0.4,         // Max force per step (as fraction of base length)

  // Joint Freedom/Stiffness
  jointFreedom: 1.0,            // Joint freedom (1.0 = free, 0.0 = rigid)
};
