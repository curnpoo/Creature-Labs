import { createNode, createBone, createMuscle, cleanup, SCALE, planck, World, Vec2, Body, Circle, Edge, PrismaticJoint, DistanceJoint, RevoluteJoint } from '../sim/Physics.js';
import { NeuralNetwork } from '../nn/NeuralNetwork.js';
import { CONFIG } from '../utils/config.js';

/**
 * Creature with a real neural network brain.
 * DNA is a Float32Array of NN weights instead of {freq, phase, amp} objects.
 * Migrated to Planck.js physics engine.
 */
export class Creature {
  /**
   * @param {planck.World} world - Planck.js world
   * @param {number} originX
   * @param {number} originY
   * @param {object[]} schemaNodes
   * @param {object[]} schemaConstraints
   * @param {Float32Array|null} dna - NN weights, null for random init
   * @param {number} minX
   * @param {number} minY
   * @param {object} simConfig - { jointFreedom, muscleStrength, jointMoveSpeed, muscleRange, muscleSmoothing }
   */
  constructor(world, originX, originY, schemaNodes, schemaConstraints, dna, minX, minY, simConfig = {}, creatureId = 0) {
    this.world = world;
    this.id = creatureId;
    this.bodies = []; // Array of planck.Body
    this.muscles = []; // Array of { joint: PrismaticJoint, bodyA: Body, bodyB: Body, baseLength: number, currentLength: number, index: number }
    this.bones = []; // Array of DistanceJoint
    this.angleLimiters = []; // Array of DistanceJoint
    this.simConfig = simConfig;

    this.stats = {
      speed: 0,
      stability: 100,
      airtimePct: 0,
      stumbles: 0,
      spin: 0,
      spinAccumulated: 0,
      actuationJerk: 0,
      actuationLevel: 0,
      groundSlip: 0,
      energyViolations: 0,
      frames: 0,
      airFrames: 0,
      maxX: -Infinity,
      prevCenter: null,
      stumbleLatched: false
    };

    // Energy system
    const maxEnergy = simConfig.maxEnergy ?? CONFIG.defaultMaxEnergy;
    this.energy = {
      current: maxEnergy,
      max: maxEnergy,
      regenRate: simConfig.energyRegenRate ?? CONFIG.defaultEnergyRegenRate,
      usagePerActuation: simConfig.energyUsagePerActuation ?? CONFIG.defaultEnergyUsagePerActuation,
      minForActuation: simConfig.minEnergyForActuation ?? CONFIG.defaultMinEnergyForActuation,
      enabled: simConfig.energyEnabled ?? CONFIG.defaultEnergyEnabled,
      totalUsed: 0,
      efficiency: 1.0
    };

    // Create physics bodies
    const bodyMap = {};
    const category = 0x0002;
    const mask = 0x0001;
    const selfOn = !!simConfig.selfCollision;
    const group = selfOn ? (this.id + 1) : -(this.id + 1);

    schemaNodes.forEach(n => {
      const b = createNode(
        this.world,
        originX + (n.x - minX),
        originY + (n.y - minY),
        CONFIG.nodeRadius,
        {
          density: 0.0035,
          friction: simConfig.bodyFriction ?? 2,
          restitution: 0,
          categoryBits: category,
          maskBits: mask,
          group: group
        }
      );
      b.creatureId = this.id;
      bodyMap[n.id] = b;
      this.bodies.push(b);
    });

    // Count muscles for NN output size
    const muscleCount = schemaConstraints.filter(c => c.type === 'muscle').length;

    // Compute NN layer sizes
    const numInputs = this.bodies.length * 5 + 4;
    const numOutputs = muscleCount;
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

    // Create joints
    let m = 0;
    schemaConstraints.forEach(schema => {
      const bodyA = bodyMap[schema.n1];
      const bodyB = bodyMap[schema.n2];
      if (!bodyA || !bodyB) return;

      const posA = bodyA.getPosition();
      const posB = bodyB.getPosition();
      const dx = posB.x - posA.x;
      const dy = posB.y - posA.y;
      const lengthPx = Math.sqrt(dx * dx + dy * dy) * SCALE;

      if (schema.type === 'muscle') {
        // Create prismatic joint for muscle (piston)
        const axis = Vec2(dx / Math.sqrt(dx * dx + dy * dy), dy / Math.sqrt(dx * dx + dy * dy));
        const joint = createMuscle(this.world, bodyA, null, bodyB, null, axis, {
          restLength: lengthPx,
          minLength: lengthPx * 0.6,
          maxLength: lengthPx * 1.4,
          maxForce: (simConfig.muscleStrength || 1.2) * 100
        });
        
        this.muscles.push({
          joint,
          bodyA,
          bodyB,
          baseLength: lengthPx,
          currentLength: lengthPx,
          index: m,
          smoothSignal: 0
        });
        m++;
      } else {
        // Create distance joint for bone
        const joint = createBone(this.world, bodyA, null, bodyB, null, lengthPx, {
          frequencyHz: 15,
          dampingRatio: 0.5
        });
        this.bones.push(joint);
      }
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
    this.bodies.forEach(b => bodyConnects.set(b, new Set()));

    schemaConstraints.forEach(schema => {
      const bA = bodyMap[schema.n1];
      const bB = bodyMap[schema.n2];
      if (bA && bB) {
        bodyConnects.get(bA).add(bB);
        bodyConnects.get(bB).add(bA);
      }
    });

    // Store for collision filter
    this.bodies.forEach(b => {
      b.connectedBodies = bodyConnects.get(b);
    });

    const freedom = simConfig.jointFreedom !== undefined ? simConfig.jointFreedom : 1.0;
    const rigid = 1 - freedom;
    const bendStiffness = Math.max(0, Math.min(0.9, rigid * rigid * 0.9));

    neighbors.forEach((set, centerId) => {
      const ids = Array.from(set);
      if (ids.length < 2) return;

      const centerNode = nodeMap.get(centerId);
      const isFixed = centerNode && centerNode.fixed;
      const currentStiffness = isFixed ? 1.0 : bendStiffness;

      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const bodyA = bodyMap[ids[i]];
          const bodyB = bodyMap[ids[j]];
          if (!bodyA || !bodyB) continue;
          
          const posA = bodyA.getPosition();
          const posB = bodyB.getPosition();
          const dx = posB.x - posA.x;
          const dy = posB.y - posA.y;
          const lengthPx = Math.sqrt(dx * dx + dy * dy) * SCALE;
          
          const limiter = createBone(this.world, bodyA, null, bodyB, null, lengthPx, {
            frequencyHz: isFixed ? 30 : 8,
            dampingRatio: isFixed ? 0.2 : 0.06
          });
          limiter.isAngleLimiter = true;
          limiter.isFixedJoint = isFixed;
          this.angleLimiters.push(limiter);
        }
      }
    });

    // Precompute creature span for normalization
    this._computeSpan();
  }

  _computeSpan() {
    if (this.bodies.length < 2) {
      this.span = 100;
      return;
    }
    let maxDist = 0;
    for (let i = 0; i < this.bodies.length; i++) {
      for (let j = i + 1; j < this.bodies.length; j++) {
        const posA = this.bodies[i].getPosition();
        const posB = this.bodies[j].getPosition();
        const dx = (posB.x - posA.x) * SCALE;
        const dy = (posB.y - posA.y) * SCALE;
        const d = Math.sqrt(dx * dx + dy * dy);
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
      const pos = b.getPosition();
      const vel = b.getLinearVelocity();
      const offset = i * 5;

      // Relative position normalized by span
      inputs[offset] = ((pos.x * SCALE) - center.x) / this.span;
      inputs[offset + 1] = ((pos.y * SCALE) - center.y) / this.span;

      // Velocity clamped to [-1, 1]
      inputs[offset + 2] = Math.max(-1, Math.min(1, vel.x * SCALE * 0.1));
      inputs[offset + 3] = Math.max(-1, Math.min(1, vel.y * SCALE * 0.1));

      // Ground contact
      inputs[offset + 4] = ((pos.y * SCALE) + CONFIG.nodeRadius >= groundY - 2) ? 1 : 0;

      totalVx += vel.x * SCALE;
      totalHeight += groundY - (pos.y * SCALE);
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
    
    // Note: Planck.js joints don't have stiffness property that can be changed at runtime
    // The frequencyHz and dampingRatio are set at creation time
    // For now, we skip runtime stiffness updates

    if (this.muscles.length === 0) return;

    // Build inputs and run NN
    const inputs = this.buildInputs(groundY, time);
    const outputs = this.brain.forward(inputs);

    // Apply NN outputs to muscles (tanh output in [-1, 1])
    const strength = this.simConfig.muscleStrength || 1.2;
    const moveSpeed = Math.max(0.2, Math.min(2.2, this.simConfig.jointMoveSpeed || 1.0));
    const rangeScale = this.simConfig.muscleRange ?? 0.18;
    const smoothingBase = this.simConfig.muscleSmoothing ?? 0.22;
    const smoothing = Math.min(0.5, Math.max(0.02, smoothingBase));

    // Pre-calculate which bodies are grounded
    const isGrounded = new Map();
    this.bodies.forEach(b => {
      const pos = b.getPosition();
      isGrounded.set(b, (pos.y * SCALE + CONFIG.nodeRadius) >= (groundY - 2));
    });

    let totalJerk = 0;
    let totalActuation = 0;
    let energyUsedThisFrame = 0;

    this.muscles.forEach((m, i) => {
      const rawSignal = outputs[i] || 0;
      const prevSignal = m.smoothSignal !== undefined ? m.smoothSignal : rawSignal;
      const smoothSignal = prevSignal + (rawSignal - prevSignal) * smoothing;
      m.smoothSignal = smoothSignal;
      totalJerk += Math.abs(smoothSignal - prevSignal);

      // Per-muscle ground contact
      const bodyAGrounded = isGrounded.get(m.bodyA) || false;
      const bodyBGrounded = isGrounded.get(m.bodyB) || false;

      let muscleStrengthMultiplier;
      if (bodyAGrounded && bodyBGrounded) {
        muscleStrengthMultiplier = 1.0;
      } else if (bodyAGrounded || bodyBGrounded) {
        muscleStrengthMultiplier = 0.7;
      } else {
        muscleStrengthMultiplier = 0.15;
      }

      // Energy system
      let energyMultiplier = 1.0;
      if (this.energy.enabled) {
        const actuationMagnitude = Math.abs(smoothSignal);
        const energyCost = actuationMagnitude * this.energy.usagePerActuation;
        energyUsedThisFrame += energyCost;

        const energyRatio = Math.max(0, Math.min(1, this.energy.current / this.energy.max));

        if (energyRatio <= 0) {
          energyMultiplier = 0.0;
        } else if (energyRatio < 0.2) {
          energyMultiplier = energyRatio * 2.0;
        } else if (energyRatio < 0.5) {
          energyMultiplier = 0.4 + (energyRatio - 0.2) * 1.5;
        } else {
          energyMultiplier = 0.85 + (energyRatio - 0.5) * 0.3;
        }
      }

      const effectiveStrength = strength * muscleStrengthMultiplier * energyMultiplier;
      const amplitude = rangeScale * effectiveStrength;
      
      // Calculate target length based on signal
      const targetLength = m.baseLength * (1 + smoothSignal * amplitude);
      const currentLength = m.currentLength || m.baseLength;
      const maxDelta = m.baseLength * 0.02 * moveSpeed;
      const nextLength = currentLength + Math.max(-maxDelta, Math.min(maxDelta, targetLength - currentLength));
      
      m.currentLength = nextLength;
      
      // Calculate motor speed to reach target length
      // Positive motor speed extends, negative contracts
      const lengthDiff = nextLength - currentLength;
      const motorSpeed = lengthDiff * 10; // Scale factor for responsiveness
      
      // Apply to prismatic joint
      m.joint.setMotorSpeed(motorSpeed);
      m.joint.setMaxMotorForce((this.simConfig.muscleStrength || 1.2) * 100 * muscleStrengthMultiplier * energyMultiplier);

      m.currentSignal = smoothSignal;
      totalActuation += Math.abs(smoothSignal);
    });

    const avgJerk = totalJerk / Math.max(1, this.muscles.length);
    this.stats.actuationJerk = this.stats.actuationJerk * 0.9 + avgJerk * 0.1;
    const avgAct = totalActuation / Math.max(1, this.muscles.length);
    this.stats.actuationLevel = this.stats.actuationLevel * 0.9 + avgAct * 0.1;

    // Update energy system
    if (this.energy.enabled) {
      this.energy.current = Math.max(0, this.energy.current - energyUsedThisFrame);
      this.energy.totalUsed += energyUsedThisFrame;

      const regenMultiplier = 0.2 + (1.0 - avgAct) * 0.8;
      const dtSec = 1 / CONFIG.fixedStepHz;
      const regenAmount = this.energy.regenRate * regenMultiplier * dtSec;
      this.energy.current = Math.min(this.energy.max, this.energy.current + regenAmount);

      if (this.energy.totalUsed > 0) {
        this.energy.efficiency = this.stats.maxX / Math.max(1, this.energy.totalUsed);
      }
    }
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

    const onGround = this.bodies.some(b => {
      const pos = b.getPosition();
      return (pos.y * SCALE + CONFIG.nodeRadius) >= (groundY - 2);
    });
    if (!onGround) this.stats.airFrames++;
    this.stats.airtimePct = (this.stats.airFrames / Math.max(1, this.stats.frames)) * 100;

    let avgVy = 0;
    let avgOmega = 0;
    let groundedAbsVx = 0;
    let groundedCount = 0;
    const ys = [];
    
    this.bodies.forEach(b => {
      const vel = b.getLinearVelocity();
      const pos = b.getPosition();
      avgVy += Math.abs(vel.y * SCALE);
      avgOmega += Math.abs(b.getAngularVelocity());
      ys.push(pos.y * SCALE);
      if ((pos.y * SCALE + CONFIG.nodeRadius) >= (groundY - 2)) {
        groundedAbsVx += Math.abs(vel.x * SCALE);
        groundedCount++;
      }
    });

    avgVy /= Math.max(1, this.bodies.length);
    avgOmega /= Math.max(1, this.bodies.length);
    const avgGroundSlip = groundedAbsVx / Math.max(1, groundedCount);
    this.stats.groundSlip = this.stats.groundSlip * 0.9 + avgGroundSlip * 0.1;
    this.stats.spin = this.stats.spin * 0.9 + avgOmega * 0.1;
    this.stats.spinAccumulated += Math.abs(avgOmega) * dtSec;

    const centerHeight = groundY - center.y;
    const heightRatio = Math.max(0, Math.min(1, centerHeight / 80));
    const yAvg = ys.reduce((a, b) => a + b, 0) / Math.max(1, ys.length);
    const variance = ys.reduce((s, y) => s + (y - yAvg) * (y - yAvg), 0) / Math.max(1, ys.length);
    const ySpread = Math.sqrt(variance);

    const uprightScore = heightRatio * 60;
    const compactScore = Math.max(0, 20 - ySpread * 0.3);
    const bounceScore = Math.max(0, 20 - avgVy * 0.8);
    const targetStability = uprightScore + compactScore + bounceScore;
    this.stats.stability = this.stats.stability * 0.9 + targetStability * 0.1;

    const lowToGround = center.y > (groundY - CONFIG.nodeRadius * 2.2);
    if (lowToGround && !this.stats.stumbleLatched) {
      this.stats.stumbles++;
      this.stats.stumbleLatched = true;
    } else if (!lowToGround) {
      this.stats.stumbleLatched = false;
    }

    // Energy conservation check
    let kineticEnergy = 0;
    let potentialEnergy = 0;
    this.bodies.forEach(b => {
      const vel = b.getLinearVelocity();
      const pos = b.getPosition();
      const vMag = Math.sqrt(vel.x * vel.x + vel.y * vel.y);
      kineticEnergy += 0.5 * b.getMass() * (vMag * vMag);
      potentialEnergy += b.getMass() * 10 * Math.max(0, groundY - (pos.y * SCALE));
    });
    const totalEnergy = kineticEnergy + potentialEnergy;
    const suspiciousRatio = totalEnergy / Math.max(1, this.stats.actuationLevel * 100);
    if (suspiciousRatio > 50 && this.stats.frames > 60) {
      this.stats.energyViolations += suspiciousRatio * 0.1;
    }
  }

  getFitnessSnapshot() {
    return {
      speed: this.stats.speed,
      stability: Math.max(0, Math.min(100, this.stats.stability)),
      airtimePct: Math.max(0, Math.min(100, this.stats.airtimePct)),
      stumbles: this.stats.stumbles,
      spin: this.stats.spin,
      spinAccumulated: this.stats.spinAccumulated,
      actuationJerk: this.stats.actuationJerk,
      actuationLevel: this.stats.actuationLevel,
      groundSlip: this.stats.groundSlip,
      energyViolations: this.stats.energyViolations,
      energyEfficiency: this.energy.efficiency,
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
      const pos = b.getPosition();
      x += pos.x * SCALE;
      y += pos.y * SCALE;
    });
    return { x: x / this.bodies.length, y: y / this.bodies.length };
  }

  destroy() {
    // Destroy all joints first
    this.muscles.forEach(m => {
      if (m.joint) this.world.destroyJoint(m.joint);
    });
    this.bones.forEach(joint => {
      if (joint) this.world.destroyJoint(joint);
    });
    this.angleLimiters.forEach(joint => {
      if (joint) this.world.destroyJoint(joint);
    });
    
    // Destroy all bodies
    this.bodies.forEach(b => {
      if (b) this.world.destroyBody(b);
    });
    
    this.muscles = [];
    this.bones = [];
    this.angleLimiters = [];
    this.bodies = [];
  }

  draw(ctx, isLeader) {
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

    // Draw bones and muscles
    [...this.bones, ...this.angleLimiters].forEach(joint => {
      if (!joint) return;
      const bodyA = joint.getBodyA();
      const bodyB = joint.getBodyB();
      if (!bodyA || !bodyB) return;
      
      const posA = bodyA.getPosition();
      const posB = bodyB.getPosition();
      const p1 = { x: posA.x * SCALE, y: posA.y * SCALE };
      const p2 = { x: posB.x * SCALE, y: posB.y * SCALE };
      
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);

      if (joint.isAngleLimiter) {
        ctx.strokeStyle = isLeader ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.04)';
        ctx.lineWidth = 1;
      } else {
        ctx.strokeStyle = isLeader ? '#9aa4af' : 'rgba(154,164,175,0.25)';
        ctx.lineWidth = 3;
      }
      ctx.globalAlpha = isLeader ? 1 : 0.12;
      ctx.stroke();
    });

    // Draw muscles
    this.muscles.forEach(m => {
      const posA = m.bodyA.getPosition();
      const posB = m.bodyB.getPosition();
      const p1 = { x: posA.x * SCALE, y: posA.y * SCALE };
      const p2 = { x: posB.x * SCALE, y: posB.y * SCALE };
      
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);

      const v = m.currentSignal || 0;
      const r = v < 0 ? 255 : 80;
      const b = v > 0 ? 255 : 140;
      ctx.strokeStyle = `rgb(${r},20,${b})`;
      ctx.lineWidth = 5 + v * 2;
      ctx.globalAlpha = isLeader ? 1 : 0.12;
      ctx.stroke();
    });

    // Draw bodies
    this.bodies.forEach(b => {
      const pos = b.getPosition();
      ctx.beginPath();
      ctx.arc(pos.x * SCALE, pos.y * SCALE, isLeader ? 6 : 3, 0, Math.PI * 2);
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
    const selfOn = !!this.simConfig.selfCollision;
    const group = selfOn ? (this.id + 1) : -(this.id + 1);
    
    // Update collision filter for all bodies
    this.bodies.forEach(b => {
      const fixture = b.getFixtureList();
      if (fixture) {
        const filter = fixture.getFilterData();
        filter.groupIndex = group;
        filter.maskBits = 0x0001;
        fixture.setFilterData(filter);
      }
    });
  }
}
