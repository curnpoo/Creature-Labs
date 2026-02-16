import Matter from 'matter-js';

const { Engine, Bodies, Composite, Body } = Matter;

export function createEngine(gravity = 1.0) {
  const engine = Engine.create();
  engine.world.gravity.y = gravity;
  engine.positionIterations = 10;
  engine.velocityIterations = 8;
  engine.constraintIterations = 12;
  return engine;
}

export function createGround(engine, groundY, options = {}) {
  const groundHeight = 800;
  const ground = Bodies.rectangle(0, groundY + groundHeight / 2, 1000000, groundHeight, {
    isStatic: true,
    friction: options.friction ?? 2,
    frictionStatic: options.frictionStatic ?? 8,
    restitution: 0
  });
  Composite.add(engine.world, [ground]);
  return ground;
}

export function cleanup(engine) {
  if (engine) {
    Composite.clear(engine.world, false);
  }
}

export { Matter, Engine, Bodies, Composite, Body };
export const { Constraint, Vector } = Matter;
