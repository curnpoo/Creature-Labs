import planck from 'planck-js';
import { PHYSICS_CONFIG } from '../utils/config/physics.js';
import earcut from 'earcut';

const { World, Vec2, Body, Circle, Box, Edge, Polygon, PrismaticJoint, DistanceJoint, RevoluteJoint } = planck;

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
    angularDamping: options.angularDamping ?? 0.5, // Moderate damping
    linearDamping: options.linearDamping ?? 0.1
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

// Create a solid polygon body (static, for creature body parts)
export function createPolygonBody(world, vertices, options = {}) {
  if (vertices.length < 3) return null;
  
  // Convert vertices to flat array for earcut
  const flatVertices = [];
  vertices.forEach(v => {
    flatVertices.push(v.x / SCALE, v.y / SCALE);
  });
  
  // Triangulate the polygon
  const triangles = earcut(flatVertices);
  
  // Calculate centroid for body position
  let cx = 0, cy = 0;
  vertices.forEach(v => {
    cx += v.x;
    cy += v.y;
  });
  cx = (cx / vertices.length) / SCALE;
  cy = (cy / vertices.length) / SCALE;
  
  // Create solid body at centroid (DYNAMIC so creatures can move it)
  const body = world.createBody({
    type: 'dynamic',
    position: Vec2(cx, cy),
    linearDamping: 0.1,
    angularDamping: 0.5
  });
  
  // Create fixtures for each triangle
  for (let i = 0; i < triangles.length; i += 3) {
    const i0 = triangles[i] * 2;
    const i1 = triangles[i + 1] * 2;
    const i2 = triangles[i + 2] * 2;
    
    const triangleVertices = [
      Vec2(flatVertices[i0] - cx, flatVertices[i0 + 1] - cy),
      Vec2(flatVertices[i1] - cx, flatVertices[i1 + 1] - cy),
      Vec2(flatVertices[i2] - cx, flatVertices[i2 + 1] - cy)
    ];
    
    body.createFixture({
      shape: Polygon(triangleVertices),
      density: 2.0, // Dense so it has mass but isn't too heavy
      friction: options.friction ?? 0.6,
      restitution: options.restitution ?? 0.0,
      filterCategoryBits: options.categoryBits ?? 0x0002,
      filterMaskBits: options.maskBits ?? 0x0003,
      filterGroupIndex: options.group ?? 0
    });
  }
  
  return body;
}

// Create a rigid bone (distance joint) - BONES CANNOT STRETCH
export function createBone(world, bodyA, bodyAOffset, bodyB, bodyBOffset, length, options = {}) {
  const joint = world.createJoint(DistanceJoint({
    bodyA: bodyA,
    bodyB: bodyB,
    frequencyHz: options.frequencyHz ?? 60, // Stiff but stable (60Hz)
    dampingRatio: options.dampingRatio ?? 0.7, // Good damping to prevent oscillation
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
    maxMotorForce: options.maxForce ?? 50, // Reduced from 100
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
    lowerAngle: options.lowerAngle ?? -Math.PI / 2,  // -90 degrees
    upperAngle: options.upperAngle ?? Math.PI / 2,   // +90 degrees (180 degree total range)
    enableMotor: false
  }));

  return joint;
}

export { planck, World, Vec2, Body, Circle, Box, Edge, PrismaticJoint, DistanceJoint, RevoluteJoint };
