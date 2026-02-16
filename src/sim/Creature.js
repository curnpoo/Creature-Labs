import { Composite, Constraint, Vector, Bodies, Body } from '../sim/Physics.js';
import { NeuralNetwork } from '../nn/NeuralNetwork.js';
import { CONFIG } from '../utils/config.js';

/**
 * Creature with a real neural network brain.
 * DNA is a Float32Array of NN weights instead of {freq, phase, amp} objects.
 */
export class Creature {
  /**
   * @param {Matter.Engine} engine
   * @param {number} originX
   * @param {number} originY
   * @param {object[]} schemaNodes
   * @param {object[]} schemaConstraints
   * @param {Float32Array|null} dna - NN weights, null for random init
   * @param {number} minX
   * @param {number} minY
   * @param {object} simConfig - { jointFreedom, muscleStrength, jointMoveSpeed, muscleRange, muscleSmoothing }
   */
  constructor(engine, originX, originY, schemaNodes, schemaConstraints, dna, minX, minY, simConfig = {}, creatureId = 0) {
    this.engine = engine;
    this.id = creatureId;
    this.composite = Composite.create();
    this.bodies = [];
    this.muscles = [];
    this.boneConstraints = [];
    this.angleLimiters = [];
    this.simConfig = simConfig;

    this.stats = {
      speed: 0,
      stability: 100,
      airtimePct: 0,
      stumbles: 0,
      spin: 0,
      actuationJerk: 0,
      actuationLevel: 0,
      groundSlip: 0,
      frames: 0,
      airFrames: 0,
      maxX: -Infinity,
      prevCenter: null,
      stumbleLatched: false
    };

    // Create physics bodies
    const bodyMap = {};
    const category = 0x0002;
    const mask = (simConfig.selfCollision) ? 0x0003 : 0x0001; 

    schemaNodes.forEach(n => {
      const b = Bodies.circle(
        originX + (n.x - minX),
        originY + (n.y - minY),
        CONFIG.nodeRadius,
        {
          collisionFilter: { category, mask, group: 0 },
          friction: simConfig.bodyFriction ?? 2,
          frictionStatic: simConfig.bodyStaticFriction ?? 8,
          frictionAir: simConfig.bodyAirFriction ?? 0.07,
          isBullet: true,
          density: 0.0035,
          restitution: 0
        }
      );
      b.creatureId = this.id;
      bodyMap[n.id] = b;
      this.bodies.push(b);
      Composite.add(this.composite, b);
    });

    // Count muscles for NN output size
    const muscleCount = schemaConstraints.filter(c => c.type === 'muscle').length;

    // Compute NN layer sizes
    // Inputs: per body (relX, relY, vx, vy, ground) + sin(t), cos(t), avgVx, avgHeight
    const numInputs = this.bodies.length * 5 + 4;
    const numOutputs = muscleCount;

    // Hidden layer size
    const hiddenLayers = simConfig.hiddenLayers || CONFIG.defaultHiddenLayers;
    const neuronsPerLayer = simConfig.neuronsPerLayer || CONFIG.defaultNeuronsPerLayer;

    const layers = [numInputs];
    for (let i = 0; i < hiddenLayers; i++) {
      layers.push(neuronsPerLayer);
    }
    layers.push(numOutputs);

    // Create the neural network brain
    this.brain = new NeuralNetwork(layers);

    // Apply DNA if provided
    if (dna && dna.length === this.brain.getWeightCount()) {
      this.brain.fromArray(dna);
    }
    this.dna = this.brain.toArray();

    // Create constraints
    let m = 0;
    schemaConstraints.forEach(schema => {
      const bodyA = bodyMap[schema.n1];
      const bodyB = bodyMap[schema.n2];
      if (!bodyA || !bodyB) return;

      const c = Constraint.create({
        bodyA,
        bodyB,
        stiffness: schema.type === 'bone' ? 1.0 : 0.78,
        damping: schema.type === 'bone' ? 0.12 : 0.2,
        length: Vector.magnitude(Vector.sub(bodyA.position, bodyB.position))
      });

      if (schema.type === 'muscle') {
        c.baseLength = c.length;
        c.currentLength = c.length;
        this.muscles.push({ c, index: m });
        m++;
      } else {
        this.boneConstraints.push(c);
      }
      Composite.add(this.composite, c);
    });

    // Angle limiters for joint freedom
    const neighbors = new Map();
    const nodeMap = new Map();
    schemaNodes.forEach(n => nodeMap.set(n.id, n));

    schemaConstraints.forEach(schema => {
      if (!neighbors.has(schema.n1)) neighbors.set(schema.n1, new Set());
      if (!neighbors.has(schema.n2)) neighbors.set(schema.n2, new Set());
      neighbors.get(schema.n1).add(schema.n2);
      neighbors.get(schema.n2).add(schema.n1);
    });

    const bodyConnects = new Map();
    this.bodies.forEach(b => bodyConnects.set(b.id, new Set()));

    schemaConstraints.forEach(schema => {
        const bA = bodyMap[schema.n1];
        const bB = bodyMap[schema.n2];
        if (bA && bB) {
            bodyConnects.get(bA.id).add(bB.id);
            bodyConnects.get(bB.id).add(bA.id);
        }
    });
    
    // Store for collision filter
    this.bodies.forEach(b => {
        b.connectedBodies = bodyConnects.get(b.id);
    });

    const freedom = simConfig.jointFreedom !== undefined ? simConfig.jointFreedom : 1.0;
    const rigid = 1 - freedom;
    const bendStiffness = Math.max(0, Math.min(0.9, rigid * rigid * 0.9));

    neighbors.forEach((set, centerId) => {
      const ids = Array.from(set);
      if (ids.length < 2) return;
      
      const centerNode = nodeMap.get(centerId);
      const isFixed = centerNode && centerNode.fixed;
      const currentStiffness = isFixed ? 1.0 : bendStiffness; // Max stiffness for fixed joints

      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const bodyA = bodyMap[ids[i]];
          const bodyB = bodyMap[ids[j]];
          if (!bodyA || !bodyB) continue;
          const limiter = Constraint.create({
            bodyA,
            bodyB,
            length: Vector.magnitude(Vector.sub(bodyA.position, bodyB.position)),
            stiffness: isFixed ? 1.0 : bendStiffness,
            damping: isFixed ? 0.2 : 0.06
          });
          limiter.isAngleLimiter = true;
          limiter.isFixedJoint = isFixed;
          this.angleLimiters.push(limiter);
          Composite.add(this.composite, limiter);
        }
      }
    });

    // Precompute creature span for normalization
    this._computeSpan();

    Composite.add(engine.world, this.composite);
  }

  _computeSpan() {
    if (this.bodies.length < 2) {
      this.span = 100;
      return;
    }
    let maxDist = 0;
    for (let i = 0; i < this.bodies.length; i++) {
      for (let j = i + 1; j < this.bodies.length; j++) {
        const d = Vector.magnitude(
          Vector.sub(this.bodies[i].position, this.bodies[j].position)
        );
        if (d > maxDist) maxDist = d;
      }
    }
    this.span = Math.max(50, maxDist);
  }

  /**
   * Build sensory input vector from body states.
   * @param {number} groundY
   * @param {number} time - simulation time
   * @returns {Float32Array}
   */
  buildInputs(groundY, time) {
    const numBodies = this.bodies.length;
    const inputs = new Float32Array(numBodies * 5 + 4);
    const center = this.getCenter();

    let totalVx = 0;
    let totalHeight = 0;

    for (let i = 0; i < numBodies; i++) {
      const b = this.bodies[i];
      const offset = i * 5;

      // Relative position normalized by span
      inputs[offset] = (b.position.x - center.x) / this.span;
      inputs[offset + 1] = (b.position.y - center.y) / this.span;

      // Velocity clamped to [-1, 1]
      inputs[offset + 2] = Math.max(-1, Math.min(1, b.velocity.x * 0.1));
      inputs[offset + 3] = Math.max(-1, Math.min(1, b.velocity.y * 0.1));

      // Ground contact
      inputs[offset + 4] = (b.position.y + CONFIG.nodeRadius >= groundY - 2) ? 1 : 0;

      totalVx += b.velocity.x;
      totalHeight += groundY - b.position.y;
    }

    const base = numBodies * 5;
    // Time signals for rhythm discovery
    inputs[base] = Math.sin(time * 0.1);
    inputs[base + 1] = Math.cos(time * 0.1);
    // Average horizontal velocity
    inputs[base + 2] = Math.max(-1, Math.min(1, (totalVx / numBodies) * 0.05));
    // Average height (normalized)
    inputs[base + 3] = Math.max(-1, Math.min(1, (totalHeight / numBodies) / 200 - 0.5));

    return inputs;
  }

  /**
   * Neural network forward pass → apply outputs to muscles.
   * @param {number} time
   * @param {number} groundY
   */
  update(time, groundY) {
    // Update angle limiter stiffness
    const freedom = this.simConfig.jointFreedom !== undefined ? this.simConfig.jointFreedom : 1.0;
    const rigid = 1 - freedom;
    const bendStiffness = Math.max(0, Math.min(0.9, rigid * rigid * 0.9));
    this.angleLimiters.forEach(limiter => {
      if (!limiter.isFixedJoint) {
        limiter.stiffness = bendStiffness;
      } else {
        limiter.stiffness = 1.0; // Ensure fixed stays fixed
      }
    });

    if (this.muscles.length === 0) return;

    // Build inputs and run NN
    const inputs = this.buildInputs(groundY, time);
    const outputs = this.brain.forward(inputs);

    // Apply NN outputs to muscles (tanh output in [-1, 1])
    const strength = this.simConfig.muscleStrength || 1.2;
    const moveSpeed = Math.max(0.2, Math.min(2.2, this.simConfig.jointMoveSpeed || 1.0));
    const rangeScale = this.simConfig.muscleRange ?? 0.18;
    const amplitude = Math.max(0.05, rangeScale * strength);
    const smoothingBase = this.simConfig.muscleSmoothing ?? 0.22;
    const smoothing = Math.min(0.5, Math.max(0.02, smoothingBase));
    let totalJerk = 0;
    let totalActuation = 0;
    this.muscles.forEach((m, i) => {
      const rawSignal = outputs[i] || 0;
      const prevSignal = m.smoothSignal !== undefined ? m.smoothSignal : rawSignal;
      const smoothSignal = prevSignal + (rawSignal - prevSignal) * smoothing;
      m.smoothSignal = smoothSignal;
      totalJerk += Math.abs(smoothSignal - prevSignal);

      const targetLength = m.c.baseLength * (1 + smoothSignal * amplitude);
      const currentLength = m.c.currentLength || m.c.length;
      const maxDelta = m.c.baseLength * 0.02 * moveSpeed;
      const nextLength = currentLength + Math.max(-maxDelta, Math.min(maxDelta, targetLength - currentLength));
      m.c.currentLength = nextLength;
      m.c.length = nextLength;
      m.currentSignal = smoothSignal;
      totalActuation += Math.abs(smoothSignal);
    });
    const avgJerk = totalJerk / Math.max(1, this.muscles.length);
    this.stats.actuationJerk = this.stats.actuationJerk * 0.9 + avgJerk * 0.1;
    const avgAct = totalActuation / Math.max(1, this.muscles.length);
    this.stats.actuationLevel = this.stats.actuationLevel * 0.9 + avgAct * 0.1;
  }

  sampleFitness(dtSec, groundY) {
    if (dtSec <= 0) return;
    const center = this.getCenter();
    this.stats.frames++;
    this.stats.maxX = Math.max(this.stats.maxX, center.x);

    if (this.stats.prevCenter) {
      const dx = center.x - this.stats.prevCenter.x;
      const speed = Math.max(0, dx / Math.max(0.0001, dtSec));
      this.stats.speed = this.stats.speed * 0.9 + speed * 0.1;
    }
    this.stats.prevCenter = center;

    const onGround = this.bodies.some(b => (b.position.y + CONFIG.nodeRadius) >= (groundY - 2));
    if (!onGround) this.stats.airFrames++;
    this.stats.airtimePct = (this.stats.airFrames / Math.max(1, this.stats.frames)) * 100;

    let avgVy = 0;
    let avgOmega = 0;
    let groundedAbsVx = 0;
    let groundedCount = 0;
    const ys = [];
    this.bodies.forEach(b => {
      avgVy += Math.abs(b.velocity.y);
      avgOmega += Math.abs(b.angularVelocity);
      ys.push(b.position.y);
      if ((b.position.y + CONFIG.nodeRadius) >= (groundY - 2)) {
        groundedAbsVx += Math.abs(b.velocity.x);
        groundedCount++;
      }
    });
    avgVy /= Math.max(1, this.bodies.length);
    avgOmega /= Math.max(1, this.bodies.length);
    const avgGroundSlip = groundedAbsVx / Math.max(1, groundedCount);
    this.stats.groundSlip = this.stats.groundSlip * 0.9 + avgGroundSlip * 0.1;
    this.stats.spin = this.stats.spin * 0.9 + avgOmega * 0.1;

    const yAvg = ys.reduce((a, b) => a + b, 0) / Math.max(1, ys.length);
    const variance = ys.reduce((s, y) => s + (y - yAvg) * (y - yAvg), 0) / Math.max(1, ys.length);
    const ySpread = Math.sqrt(variance);
    const instability = Math.min(1, avgVy * 0.04 + ySpread * 0.015);
    const targetStability = (1 - instability) * 100;
    this.stats.stability = this.stats.stability * 0.9 + targetStability * 0.1;

    const lowToGround = center.y > (groundY - CONFIG.nodeRadius * 2.2);
    if (lowToGround && !this.stats.stumbleLatched) {
      this.stats.stumbles++;
      this.stats.stumbleLatched = true;
    } else if (!lowToGround) {
      this.stats.stumbleLatched = false;
    }
  }

  getFitnessSnapshot() {
    return {
      speed: this.stats.speed,
      stability: Math.max(0, Math.min(100, this.stats.stability)),
      airtimePct: Math.max(0, Math.min(100, this.stats.airtimePct)),
      stumbles: this.stats.stumbles,
      spin: this.stats.spin,
      actuationJerk: this.stats.actuationJerk,
      actuationLevel: this.stats.actuationLevel,
      groundSlip: this.stats.groundSlip,
      maxX: this.stats.maxX
    };
  }

  getX() {
    return this.getCenter().x;
  }

  getCenter() {
    if (!this.bodies.length) return { x: 0, y: 0 };
    let x = 0, y = 0;
    this.bodies.forEach(b => {
      x += b.position.x;
      y += b.position.y;
    });
    return { x: x / this.bodies.length, y: y / this.bodies.length };
  }

  destroy() {
    Composite.remove(this.engine.world, this.composite);
  }

  draw(ctx, isLeader) {
    const constraints = Composite.allConstraints(this.composite);

    // Leader glow effect
    if (isLeader) {
      const center = this.getCenter();
      ctx.save();
      ctx.shadowColor = '#00f2ff';
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.arc(center.x, center.y, 2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,242,255,0.01)';
      ctx.fill();
      ctx.restore();
    }

    constraints.forEach(c => {
      if (!c.bodyA || !c.bodyB) return;
      const p1 = c.bodyA.position;
      const p2 = c.bodyB.position;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);

      const muscle = this.muscles.find(m => m.c === c);
      if (c.isAngleLimiter) {
        ctx.strokeStyle = isLeader ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.04)';
        ctx.lineWidth = 1;
      } else if (muscle) {
        const v = muscle.currentSignal || 0;
        const r = v < 0 ? 255 : 80;
        const b = v > 0 ? 255 : 140;
        ctx.strokeStyle = `rgb(${r},20,${b})`;
        ctx.lineWidth = 5 + v * 2;
      } else {
        ctx.strokeStyle = isLeader ? '#9aa4af' : 'rgba(154,164,175,0.25)';
        ctx.lineWidth = 3;
      }
      ctx.globalAlpha = isLeader ? 1 : 0.12;
      ctx.stroke();
    });

    this.bodies.forEach(b => {
      ctx.beginPath();
      ctx.arc(b.position.x, b.position.y, isLeader ? 6 : 3, 0, Math.PI * 2);
      ctx.fillStyle = isLeader ? '#15171b' : 'rgba(0,0,0,0.15)';
      ctx.fill();
      ctx.strokeStyle = isLeader ? '#00f2ff' : 'rgba(0,242,255,0.2)';
      ctx.lineWidth = 2;
      ctx.globalAlpha = isLeader ? 1 : 0.15;
      ctx.stroke();
    });

    // Leader label
    if (isLeader) {
      const center = this.getCenter();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#00f2ff';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('BEST', center.x, center.y - 20);

      // Crown icon
      const cx = center.x, cy = center.y - 28;
      ctx.beginPath();
      ctx.moveTo(cx - 8, cy + 4);
      ctx.lineTo(cx - 6, cy - 2);
      ctx.lineTo(cx - 2, cy + 2);
      ctx.lineTo(cx, cy - 4);
      ctx.lineTo(cx + 2, cy + 2);
      ctx.lineTo(cx + 6, cy - 2);
      ctx.lineTo(cx + 8, cy + 4);
      ctx.closePath();
      ctx.fillStyle = '#ffd700';
      ctx.fill();
      ctx.textAlign = 'left';
    }

    ctx.globalAlpha = 1;
  }

  updateRuntimeSettings() {
    const mask = this.simConfig.selfCollision ? 0x0003 : 0x0001;
    this.bodies.forEach(b => {
      b.collisionFilter.mask = mask;
    });
  }
}
