import planck from 'planck-js';
import { PHYSICS_CONFIG } from '../utils/config/physics.js';

const { World, Vec2, Body, Circle, Box, Edge, PrismaticJoint, DistanceJoint, RevoluteJoint } = planck;

// Scale factor: Planck uses meters, we use pixels
// 30 pixels = 1 meter
export const SCALE = 30;

export function createEngine(gravity = 10) {
  const world = World({
    gravity: Vec2(0, gravity)
  });
  
  return world;
}

export function createGround(world, groundY, options = {}) {
  const ground = world.createBody({
    type: 'static',
    position: Vec2(0, groundY / SCALE)
  });
  
  // Create a long ground plane
  ground.createFixture({
    shape: Edge(Vec2(-10000, 0), Vec2(10000, 0)),
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
    angularDamping: options.angularDamping ?? 0.5,
    linearDamping: options.linearDamping ?? 0.1
  });
  
  body.createFixture({
    shape: Circle(radius / SCALE),
    density: options.density ?? 1.0,
    friction: options.friction ?? 0.6,
    restitution: options.restitution ?? 0.0,
    filterCategoryBits: options.categoryBits ?? 0x0002,
    filterMaskBits: options.maskBits ?? 0x0001
  });
  
  return body;
}

// Create a rigid bone (distance joint)
export function createBone(world, bodyA, bodyAOffset, bodyB, bodyBOffset, length, options = {}) {
  const joint = world.createJoint(DistanceJoint({
    bodyA: bodyA,
    bodyB: bodyB,
    frequencyHz: options.frequencyHz ?? 15, // High frequency = stiff
    dampingRatio: options.dampingRatio ?? 0.5,
    length: length / SCALE,
    localAnchorA: bodyAOffset ? Vec2(bodyAOffset.x / SCALE, bodyAOffset.y / SCALE) : Vec2(0, 0),
    localAnchorB: bodyBOffset ? Vec2(bodyBOffset.x / SCALE, bodyBOffset.y / SCALE) : Vec2(0, 0)
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
  
  // Create prismatic joint
  const joint = world.createJoint(PrismaticJoint({
    bodyA: bodyA,
    bodyB: bodyB,
    localAnchorA: bodyA.getLocalPoint(worldAnchor),
    localAnchorB: bodyB.getLocalPoint(worldAnchor),
    localAxisA: axis,
    enableLimit: true,
    lowerTranslation: options.minLength ? (options.minLength / SCALE) : -(options.restLength / SCALE) * 0.2,
    upperTranslation: options.maxLength ? (options.maxLength / SCALE) : (options.restLength / SCALE) * 0.2,
    enableMotor: true,
    maxMotorForce: options.maxForce ?? 100,
    motorSpeed: 0
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
    lowerAngle: options.lowerAngle ?? -Math.PI / 4,
    upperAngle: options.upperAngle ?? Math.PI / 4,
    enableMotor: false
  }));

  return joint;
}

export { planck, World, Vec2, Body, Circle, Box, Edge, PrismaticJoint, DistanceJoint, RevoluteJoint };
