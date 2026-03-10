import { Vec2 } from './Physics.js';

function normalizeAngleRad(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function shouldDisableSelfContact(bodyA, bodyB) {
  return bodyA?.creatureId === bodyB?.creatureId
    && bodyA?.connectedBodies
    && bodyA.connectedBodies.has(bodyB);
}

function handleFilteredContact(contact, onContactBodies) {
  const bodyA = contact.getFixtureA().getBody();
  const bodyB = contact.getFixtureB().getBody();
  onContactBodies?.(bodyA, bodyB);
  if (shouldDisableSelfContact(bodyA, bodyB)) {
    contact.setEnabled(false);
  }
}

export function bindSharedCreatureContactFiltering(world, onContactBodies) {
  world.on('begin-contact', contact => {
    handleFilteredContact(contact, onContactBodies);
  });
  world.on('pre-solve', contact => {
    handleFilteredContact(contact, onContactBodies);
  });
}

export function applyBodySafetyClamp(bodies, options) {
  const {
    isBodyGroundedStrict,
    groundNoSlipEnabled,
    groundNoSlipFactor,
    groundNoSlipEpsilon,
    maxHorizontalVelocity,
    maxVerticalVelocity,
    tiltLimitEnabled,
    maxTiltRad,
    onNoSlipApplied
  } = options;

  bodies.forEach(body => {
    const vel = body.getLinearVelocity();
    let vx = vel.x;
    const vy = vel.y;

    if (groundNoSlipEnabled && isBodyGroundedStrict(body)) {
      vx *= groundNoSlipFactor;
      if (Math.abs(vx) < groundNoSlipEpsilon) vx = 0;
      onNoSlipApplied?.(Math.abs(vx));
    }

    const clampedVx = Math.max(-maxHorizontalVelocity, Math.min(maxHorizontalVelocity, vx));
    const clampedVy = Math.max(-maxVerticalVelocity, Math.min(maxVerticalVelocity, vy));
    if (clampedVx !== vel.x || clampedVy !== vel.y) {
      body.setLinearVelocity(Vec2(clampedVx, clampedVy));
    }

    let angularVelocity = body.getAngularVelocity();
    if (tiltLimitEnabled) {
      const angle = normalizeAngleRad(body.getAngle());
      const pushingFurtherOut = (angle >= maxTiltRad && angularVelocity > 0)
        || (angle <= -maxTiltRad && angularVelocity < 0);
      if (pushingFurtherOut) angularVelocity = 0;
    }

    const clampedAngularVelocity = Math.max(-5, Math.min(5, angularVelocity));
    if (clampedAngularVelocity !== body.getAngularVelocity()) {
      body.setAngularVelocity(clampedAngularVelocity);
    }
  });
}
