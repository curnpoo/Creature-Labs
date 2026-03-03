/**
 * Fixed-joint runtime lock tests.
 * Run with: node tests/test-fixed-joints.js
 */

import { createEngine, Vec2, cleanup } from '../src/sim/Physics.js';
import { Creature } from '../src/sim/Creature.js';

const DT = 1 / 60;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function normalizeAngleRad(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function angleAtNode(a, b, c) {
  const pa = a.getPosition();
  const pb = b.getPosition();
  const pc = c.getPosition();
  const bax = pa.x - pb.x;
  const bay = pa.y - pb.y;
  const bcx = pc.x - pb.x;
  const bcy = pc.y - pb.y;
  const cross = (bax * bcy) - (bay * bcx);
  const dot = (bax * bcx) + (bay * bcy);
  return Math.atan2(cross, dot);
}

function getBody(creature, nodeId) {
  return creature.bodies.find(b => b.nodeId === nodeId) || null;
}

function stepWorld(world, steps) {
  for (let i = 0; i < steps; i++) {
    world.step(DT);
  }
}

function createCreature(world, nodes, constraints) {
  const minX = Math.min(...nodes.map(n => n.x));
  const minY = Math.min(...nodes.map(n => n.y));
  return new Creature(
    world,
    0,
    0,
    nodes,
    constraints,
    null,
    minX,
    minY,
    {
      gravity: 0,
      bodyFriction: 0.4,
      bodyAirFriction: 0.01
    },
    0
  );
}

function testElbowLock() {
  const worldUnlocked = createEngine(0);
  const worldFixed = createEngine(0);
  try {
    const nodesUnlocked = [
      { id: 1, x: 120, y: 120, fixed: false },
      { id: 2, x: 190, y: 150, fixed: false },
      { id: 3, x: 260, y: 120, fixed: false }
    ];
    const nodesFixed = nodesUnlocked.map(n => ({ ...n, fixed: n.id === 2 }));
    const constraints = [
      { type: 'bone', n1: 1, n2: 2 },
      { type: 'bone', n1: 2, n2: 3 }
    ];

    const unlocked = createCreature(worldUnlocked, nodesUnlocked, constraints);
    const fixed = createCreature(worldFixed, nodesFixed, constraints);

    const u1 = getBody(unlocked, 1);
    const u2 = getBody(unlocked, 2);
    const u3 = getBody(unlocked, 3);
    const f1 = getBody(fixed, 1);
    const f2 = getBody(fixed, 2);
    const f3 = getBody(fixed, 3);
    assert(u1 && u2 && u3 && f1 && f2 && f3, 'Failed to create elbow bodies');

    u1.setType('static');
    f1.setType('static');

    const initialUnlocked = angleAtNode(u1, u2, u3);
    const initialFixed = angleAtNode(f1, f2, f3);

    u3.applyLinearImpulse(Vec2(0, -12), u3.getWorldCenter(), true);
    f3.applyLinearImpulse(Vec2(0, -12), f3.getWorldCenter(), true);

    stepWorld(worldUnlocked, 240);
    stepWorld(worldFixed, 240);

    const unlockedDrift = Math.abs(normalizeAngleRad(angleAtNode(u1, u2, u3) - initialUnlocked));
    const fixedDrift = Math.abs(normalizeAngleRad(angleAtNode(f1, f2, f3) - initialFixed));

    assert(unlockedDrift > 0.08, `Unlocked elbow drift too small (${unlockedDrift.toFixed(4)}rad)`);
    assert(fixedDrift < 0.03, `Fixed elbow drift too large (${fixedDrift.toFixed(4)}rad)`);
    assert(fixedDrift < unlockedDrift * 0.35, 'Fixed elbow did not significantly reduce angle drift');
    return { unlockedDrift, fixedDrift };
  } finally {
    cleanup(worldUnlocked);
    cleanup(worldFixed);
  }
}

function testCurvedLimbStability() {
  const world = createEngine(9.8);
  try {
    const nodes = [
      { id: 1, x: 120, y: 80, fixed: false },
      { id: 2, x: 170, y: 110, fixed: true },
      { id: 3, x: 220, y: 140, fixed: true },
      { id: 4, x: 270, y: 110, fixed: true },
      { id: 5, x: 320, y: 80, fixed: false }
    ];
    const constraints = [
      { type: 'bone', n1: 1, n2: 2 },
      { type: 'bone', n1: 2, n2: 3 },
      { type: 'bone', n1: 3, n2: 4 },
      { type: 'bone', n1: 4, n2: 5 }
    ];
    const creature = createCreature(world, nodes, constraints);
    const b1 = getBody(creature, 1);
    const b5 = getBody(creature, 5);
    assert(b1 && b5, 'Failed to create curved-limb endpoint bodies');
    b1.setType('static');

    const baseline = constraints.map(c => {
      const a = getBody(creature, c.n1).getPosition();
      const b = getBody(creature, c.n2).getPosition();
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      return Math.sqrt(dx * dx + dy * dy);
    });

    b5.applyLinearImpulse(Vec2(0, -10), b5.getWorldCenter(), true);
    stepWorld(world, 360);

    creature.bodies.forEach((body, idx) => {
      const p = body.getPosition();
      const v = body.getLinearVelocity();
      assert(Number.isFinite(p.x) && Number.isFinite(p.y), `Body ${idx} position is not finite`);
      assert(Number.isFinite(v.x) && Number.isFinite(v.y), `Body ${idx} velocity is not finite`);
    });

    constraints.forEach((c, i) => {
      const a = getBody(creature, c.n1).getPosition();
      const b = getBody(creature, c.n2).getPosition();
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      const ratio = len / Math.max(1e-6, baseline[i]);
      assert(ratio > 0.75 && ratio < 1.25, `Bone length drifted out of stability band (${ratio.toFixed(3)}x)`);
    });
  } finally {
    cleanup(world);
  }
}

function testMusclePivotPreservation() {
  const world = createEngine(0);
  try {
    const nodes = [
      { id: 1, x: 100, y: 120, fixed: false },
      { id: 2, x: 160, y: 120, fixed: true },
      { id: 3, x: 220, y: 120, fixed: true },
      { id: 4, x: 280, y: 120, fixed: false }
    ];
    const constraints = [
      { type: 'bone', n1: 1, n2: 2 },
      { type: 'bone', n1: 2, n2: 3 },
      { type: 'bone', n1: 3, n2: 4 },
      { type: 'muscle', n1: 1, n2: 4, minLength: 0.7, maxLength: 1.3 }
    ];
    const creature = createCreature(world, nodes, constraints);
    const b1 = getBody(creature, 1);
    assert(b1, 'Failed to create anchor body for muscle test');
    b1.setType('static');

    const muscle = creature.muscles[0];
    assert(muscle?.joint, 'Expected a muscle joint for preservation test');
    const initial = muscle.joint.getJointTranslation();
    muscle.joint.setMaxMotorForce(400);
    muscle.joint.setMotorSpeed(3.0);

    stepWorld(world, 180);
    const final = muscle.joint.getJointTranslation();
    const delta = Math.abs(final - initial);
    assert(delta > 0.01, `Muscle translation did not change enough (${delta.toFixed(5)})`);
  } finally {
    cleanup(world);
  }
}

try {
  const elbow = testElbowLock();
  testCurvedLimbStability();
  testMusclePivotPreservation();
  console.log('PASS test-fixed-joints');
  console.log(`elbow_unlocked_drift=${elbow.unlockedDrift.toFixed(5)}rad`);
  console.log(`elbow_fixed_drift=${elbow.fixedDrift.toFixed(5)}rad`);
} catch (err) {
  console.error('FAIL test-fixed-joints');
  console.error(err?.stack || err?.message || err);
  process.exit(1);
}
