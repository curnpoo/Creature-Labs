/**
 * Physics Simulation Parameters
 * Controls Matter.js engine behavior, friction, and physical properties
 */
export const PHYSICS_CONFIG = {
  // Core Physics Engine
  fixedStepHz: 60,              // Physics update rate (Hz) - don't change unless needed
  maxPhysicsStepsPerFrame: 120, // Balance between stability and performance
  gravity: 9.8,                // Earth gravity in m/s² (Planck.js uses meters)

  // Ground/Surface Properties (Matter.js range: 0-1)
  groundFriction: 0.95,         // Ground kinetic friction (0.95 = high grip, prevents sliding exploits)
  groundStaticFriction: 1.0,    // Ground static friction (maximum resistance to start sliding)
  tractionDamping: 0.97,        // Velocity damping on ground contact per step (0.97 = 3% loss/step ≈ 84% loss/sec)
  groundedThreshold: 2,         // Pixel tolerance for considering a node grounded
  groundedUpwardDamping: 0.4,   // Grounded upward y-velocity damping (kills bounce recoil)
  groundedDownwardDamping: 0.85,// Grounded downward y-velocity damping (reduces press-into-ground jitter)

  // Body/Node Properties (Matter.js range: 0-1)
  bodyFriction: 0.85,           // Body-to-body kinetic friction (increased to prevent slipping)
  bodyStaticFriction: 0.95,     // Body-to-body static friction (high to prevent jitter)
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
  positionIterations: 60, // Increased for stability with rigid bones
  velocityIterations: 40, // Increased for stability
  constraintIterations: 60, // Increased for rigid constraint stability
  enableSleeping: false, // Disable sleeping to prevent energy accumulation

  // Anti-Exploit Stabilization
  angularDamping: 0.96,         // Angular velocity damping per step
  maxAngularVelocity: 3,        // Maximum angular velocity (rad/s)
  maxHorizontalVelocity: 8,     // Hard cap for |vx| (m/s) to prevent ballistic exploit launches
  maxVerticalVelocity: 12,      // Hard cap for |vy| (m/s) to keep solver stable during impacts
  tiltLimitEnabled: false,      // Clamp node tilt to maxTiltDeg when enabled
  maxTiltDeg: 25,               // Max absolute node tilt angle (degrees)

  // Visual
  nodeRadius: 10,               // Creature node radius (pixels)
  spawnClearance: 34,           // Clearance above ground for spawning
};
