/**
 * Muscle & Actuation Parameters
 * Controls muscle strength, speed, and range of motion
 */
export const MUSCLE_CONFIG = {
  // Base Muscle Properties
  strength: 1.0, // Base muscle strength (1.0 = 100%, normal strength)
  moveSpeed: 0.1, // Muscle response speed (0.1 = slow/minimum)
  range: 1.0,                   // Muscle range multiplier (1.0 = 80% max change with 0.8 amplitude)
  smoothing: 0.10,              // Muscle signal smoothing (0.10 = responsive)

  // Ground-Dependent Strength (prevents air-pushing exploits)
  groundedBothBodies: 1.0,      // Strength when both bodies grounded (100%)
  groundedOneBody: 0.7,         // Strength when one body grounded (70%)
  groundedNoBodies: 0.15,       // Strength when airborne (15% - internal tension only)

  // Force Limiting
  maxForcePerStep: 0.4,         // Max force per step (as fraction of base length)

  // Joint Freedom/Stiffness
  jointFreedom: 1.0, // Joint freedom (1.0 = free, 0.0 = rigid)

  // Action Budget (frames between muscle state changes)
  actionBudget: 3, // Minimum frames between muscle actions (1 = every frame, 10 = every 10 frames)

  // Muscle Length Limits (as ratio of base length)
  minLength: 0.8,   // 80% - can shrink to 80% of base length
  maxLength: 1.1,   // 110% - can extend to 110% of base length
};
