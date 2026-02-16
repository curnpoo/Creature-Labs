/**
 * Physics Simulation Parameters
 * Controls Matter.js engine behavior, friction, and physical properties
 */
export const PHYSICS_CONFIG = {
  // Core Physics Engine
  fixedStepHz: 60,              // Physics update rate (Hz) - don't change unless needed
  maxPhysicsStepsPerFrame: 240, // Maximum physics steps per render frame
  gravity: 1.0,                 // Gravity strength (1.0 = normal)

  // Ground/Surface Properties (Matter.js range: 0-1)
  groundFriction: 0.5,          // Ground kinetic friction (0.5 = realistic walking surface)
  groundStaticFriction: 0.8,    // Ground static friction (resistance to start sliding)
  tractionDamping: 0.93,        // Velocity damping on ground contact (0.93 = keep 7%)

  // Body/Node Properties (Matter.js range: 0-1)
  bodyFriction: 0.4,            // Body-to-body kinetic friction
  bodyStaticFriction: 0.6,      // Body-to-body static friction
  bodyAirFriction: 0.08,        // Air resistance when airborne
  bodyDensity: 0.0035,          // Body mass density
  bodyRestitution: 0,           // Bounciness (0 = no bounce)
  bodySlop: 0.01,               // Collision separation (prevents tunneling)

  // Constraint/Joint Properties
  boneStiffness: 1.0,           // Bone constraint stiffness (1.0 = rigid)
  boneDamping: 0.12,            // Bone constraint damping
  muscleStiffness: 0.70,        // Muscle constraint stiffness (0.70 = viscoelastic)
  muscleDamping: 0.30,          // Muscle constraint damping (mimics muscle-tendon)

  // Solver Iterations (higher = more stable but slower)
  positionIterations: 20,       // Position constraint resolution iterations
  velocityIterations: 16,       // Velocity constraint resolution iterations
  constraintIterations: 24,     // Constraint resolution iterations
  enableSleeping: false,        // Disable sleeping to prevent energy accumulation

  // Anti-Exploit Stabilization
  angularDamping: 0.96,         // Angular velocity damping per step
  maxAngularVelocity: 3,        // Maximum angular velocity (rad/s)

  // Visual
  nodeRadius: 10,               // Creature node radius (pixels)
  spawnClearance: 34,           // Clearance above ground for spawning
};
