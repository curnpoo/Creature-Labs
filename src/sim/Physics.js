import Matter from 'matter-js';

const { Engine, Bodies, Composite, Body } = Matter;

export function createEngine(gravity = 1.0) {
  const engine = Engine.create();
  engine.world.gravity.y = gravity;
  return engine;
}

export function createGround(engine, groundY) {
  const ground = Bodies.rectangle(0, groundY + 100, 1000000, 200, {
    isStatic: true,
    friction: 1
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
