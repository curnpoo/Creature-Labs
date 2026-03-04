/**
 * Muscle & Actuation Parameters
 * Controls muscle strength, speed, and range of motion
 */
export const MUSCLE_CONFIG = {
  // Base Muscle Properties
  strength: 2.0, // Base muscle strength (200% default power)
  moveSpeed: 0.1, // Muscle response speed (0.1 = slow/minimum)
  range: 1.0,                   // Muscle range multiplier (1.0 = 80% max change with 0.8 amplitude)
  smoothing: 0.05,              // Muscle signal smoothing (5% default)
  signalRateLimit: 0.08,        // Max activation change per physics step (prevents snap impulses)

  // Spring physics (controls muscle impulse behavior)
  springConstant: 2.8,          // Softer spring to avoid kick/spike behavior
  damping: 8.0,                 // Strong damping to prevent oscillation

  // Ground-Dependent Strength (prevents air-pushing exploits)
  groundedBothBodies: 1.0,      // Strength when both bodies grounded (100%)
  groundedOneBody: 0.7,         // Strength when one body grounded (70%)
  groundedNoBodies: 0.03,       // Strength when airborne (3% - strongly suppress flap-like propulsion)
  groundedVerticalForceScale: 0.3, // Vertical muscle-force scale when either endpoint is grounded
  groundedDeadbandErrorPx: 1.25, // Grounded error deadband where micro spring corrections are ignored
  groundedDeadbandVelPxPerSec: 10, // Grounded relative velocity deadband along muscle axis
  groundedSoftZoneErrorPx: 4, // Error range where grounded force is tapered before full force kicks in
  groundedSoftZoneForceScale: 0.35, // Minimum force scale inside grounded soft-zone
  groundedForceRateLimit: 10, // Max grounded spring-force change per physics step (prevents rapid force flips)
  groundedSignFlipDeadband: 8, // Zero tiny grounded force sign flips around equilibrium
  groundedMinForceMagnitude: 3, // Ignore grounded forces below this post-slew threshold

  // Force Limiting
  maxForcePerStep: 0.4,         // Max force per step (as fraction of base length)

  // Joint Freedom/Stiffness
  jointFreedom: 1.0, // Joint freedom (1.0 = free, 0.0 = rigid)

  // Action Budget (frames between muscle state changes)
  actionBudget: 3, // Default 3 frames per action update (~0.05s at 60Hz)

  // Phase-locked control
  phaseLockEnabled: false,     // Let NEAT learn timing directly instead of fixed carrier gating
  gaitHz: 1.6,                 // Base gait carrier frequency in Hz
  commandDeadband: 0.01,       // Keep tiny control signals instead of flattening exploration
  maxCommandDeltaPerStep: 0.06,// Stronger slew limit for stable actuation

  // Muscle Length Limits (as ratio of base length)
  minLength: 0.5,   // 50% minimum length
  maxLength: 1.5,   // 150% maximum length
};
