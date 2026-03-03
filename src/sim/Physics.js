import planck from 'planck-js';
import { PHYSICS_CONFIG } from '../utils/config/physics.js';

const { World, Vec2, Body, Circle, Box, Edge, PrismaticJoint, DistanceJoint, RevoluteJoint } = planck;

// Scale factor: Planck uses meters, we use pixels
// 30 pixels = 1 meter
export const SCALE = 30;

export function createEngine(gravity = 10) {
  const world = World({
    gravity: Vec2(0, gravity),
    // Planck.js solver iterations are set in the World config
    positionIterations: PHYSICS_CONFIG.positionIterations,
    velocityIterations: PHYSICS_CONFIG.velocityIterations
  });
  
  return world;
}

export function createGround(world, groundY, options = {}) {
  const thicknessPx = options.thickness ?? 16;
  const halfHeight = (thicknessPx / 2) / SCALE;
  const halfWidthPx = options.halfWidth ?? 100000;
  const halfWidth = halfWidthPx / SCALE;
  const ground = world.createBody({
    type: 'static',
    position: Vec2(0, (groundY + thicknessPx / 2) / SCALE)
  });
  
  // Create a thick ground slab (more stable than a zero-thickness edge)
  ground.createFixture({
    shape: Box(halfWidth, halfHeight),
    friction: options.friction ?? 0.8,
    restitution: 0.0
  });
  
  return ground;
}

export function cleanup(world) {
  if (world) {
    // Destroy all bodies
    let body = world.getBodyList();
    while (body) {
      const next = body.getNext();
      world.destroyBody(body);
      body = next;
    }
  }
}

// Helper to create a creature node (circle body)
export function createNode(world, x, y, radius, options = {}) {
  const body = world.createBody({
    type: 'dynamic',
    position: Vec2(x / SCALE, y / SCALE),
    angularDamping: options.angularDamping ?? 0.05,
    linearDamping: options.linearDamping ?? 0.0
  });
  
  body.createFixture({
    shape: Circle(radius / SCALE),
    density: options.density ?? 1.0,
    friction: options.friction ?? 0.6,
    restitution: options.restitution ?? 0.0,
    filterCategoryBits: options.categoryBits ?? 0x0002,
    filterMaskBits: options.maskBits ?? 0x0001,
    filterGroupIndex: options.group ?? 0
  });
  
  return body;
}

// Create a rigid bone (distance joint) - BONES CANNOT STRETCH
export function createBone(world, bodyA, bodyAOffset, bodyB, bodyBOffset, length, options = {}) {
  const joint = world.createJoint(DistanceJoint({
    bodyA: bodyA,
    bodyB: bodyB,
    frequencyHz: options.frequencyHz ?? 15, // Soft enough to avoid ground chattering
    dampingRatio: options.dampingRatio ?? 1.0, // Critically damped by default — no oscillation
    length: length / SCALE,
    localAnchorA: bodyAOffset ? Vec2(bodyAOffset.x / SCALE, bodyAOffset.y / SCALE) : Vec2(0, 0),
    localAnchorB: bodyBOffset ? Vec2(bodyBOffset.x / SCALE, bodyBOffset.y / SCALE) : Vec2(0, 0)
  }));

  return joint;
}

// Create a local angle-lock brace between two neighboring bodies around a fixed node.
// This is implemented as a stiff distance joint and intentionally does not pin to world.
export function createAngleLimiter(world, bodyA, bodyB, length, options = {}) {
  const joint = world.createJoint(DistanceJoint({
    bodyA: bodyA,
    bodyB: bodyB,
    frequencyHz: options.frequencyHz ?? 22,
    dampingRatio: options.dampingRatio ?? 1.0,
    length: Math.max(0, Number(length) || 0) / SCALE,
    localAnchorA: options.bodyAOffset ? Vec2(options.bodyAOffset.x / SCALE, options.bodyAOffset.y / SCALE) : Vec2(0, 0),
    localAnchorB: options.bodyBOffset ? Vec2(options.bodyBOffset.x / SCALE, options.bodyBOffset.y / SCALE) : Vec2(0, 0)
  }));

  return joint;
}

// Create a piston muscle (prismatic joint with motor)
export function createMuscle(world, bodyA, bodyAOffset, bodyB, bodyBOffset, axis, options = {}) {
  // Calculate initial anchor points in world space
  const posA = bodyA.getPosition();
  const posB = bodyB.getPosition();
  
  // Default axis is along the line between bodies
  if (!axis) {
    const dx = posB.x - posA.x;
    const dy = posB.y - posA.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    axis = Vec2(dx / len, dy / len);
  }
  
  // Calculate world anchor point (midpoint)
  const worldAnchor = Vec2(
    (posA.x + posB.x) / 2,
    (posA.y + posB.y) / 2
  );
  
  // Create prismatic joint with LIMITED range to prevent over-extension
  const restLengthMeters = options.restLength / SCALE;
  const minLen = options.minLength ? (options.minLength / SCALE) : restLengthMeters * 0.7; // 70% min
  const maxLen = options.maxLength ? (options.maxLength / SCALE) : restLengthMeters * 1.3; // 130% max
  
  const joint = world.createJoint(PrismaticJoint({
    bodyA: bodyA,
    bodyB: bodyB,
    localAnchorA: bodyA.getLocalPoint(worldAnchor),
    localAnchorB: bodyB.getLocalPoint(worldAnchor),
    localAxisA: axis,
    enableLimit: true,
    lowerTranslation: minLen - restLengthMeters, // Relative to rest position
    upperTranslation: maxLen - restLengthMeters, // Relative to rest position
    enableMotor: true,
    motorSpeed: 0,
    maxMotorForce: options.maxForce ?? 35
  }));
  
  return joint;
}

// Create a passive revolute joint (for fixed joints)
export function createRevoluteJoint(world, bodyA, bodyB, anchor, options = {}) {
  const joint = world.createJoint(RevoluteJoint({
    bodyA: bodyA,
    bodyB: bodyB,
    localAnchorA: bodyA.getLocalPoint(anchor),
    localAnchorB: bodyB.getLocalPoint(anchor),
    enableLimit: true,
    lowerAngle: options.lowerAngle ?? -Math.PI / 2,  // -90 degrees
    upperAngle: options.upperAngle ?? Math.PI / 2,   // +90 degrees (180 degree total range)
    enableMotor: false
  }));

  return joint;
}

export { planck, World, Vec2, Body, Circle, Box, Edge, PrismaticJoint, DistanceJoint, RevoluteJoint };
