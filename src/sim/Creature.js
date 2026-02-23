import { createNode, createBone, createMuscle, createPolygonBody, cleanup, SCALE, planck, World, Vec2, Body, Circle, Edge, PrismaticJoint, DistanceJoint, RevoluteJoint } from '../sim/Physics.js';
import { NeuralNetwork, gaussianRandom } from '../nn/NeuralNetwork.js';
import { CONFIG } from '../utils/config.js';

/**
 * Transfer weights from a parent network to a new network with a different architecture.
 *
 * When architecture evolves (layers/neurons added or removed), we preserve as much
 * learned knowledge as possible rather than starting from scratch:
 *   - First hidden layer always maps to first hidden layer (input→H1)
 *   - Last hidden layer always maps to last hidden layer (HN→output)
 *   - Middle layers map by position index; new middle layers Xavier-init fresh
 *   - Within a layer: copy the min(old, new) neuron overlap; Xavier-init extras
 *
 * This lets a creature that learned to walk retain that behavior even after its
 * network grows a new layer — the new layer initializes near-identity and learns
 * refinements without disrupting the base gait.
 *
 * @param {Float32Array} oldDNA  - Weights from the parent's architecture
 * @param {{ hiddenLayers, neuronsPerLayer }} prevArch - Parent's architecture
 * @param {{ hiddenLayers, neuronsPerLayer }} newArch  - Child's architecture
 * @param {number} numInputs  - NN input size (determined by creature morphology)
 * @param {number} numOutputs - NN output size (= muscle count)
 * @returns {Float32Array} New weight array sized for newArch
 */
function transferWeights(oldDNA, prevArch, newArch, numInputs, numOutputs) {
  // Build the full layer-size array for an architecture
  function buildLayers(arch) {
    const l = [numInputs];
    for (let i = 0; i < arch.hiddenLayers; i++) l.push(arch.neuronsPerLayer);
    l.push(numOutputs);
    return l;
  }

  // Total weight count for a layer-size array
  function calcSize(l) {
    let n = 0;
    for (let i = 1; i < l.length; i++) n += l[i - 1] * l[i] + l[i];
    return n;
  }

  function xavierStd(fanIn, fanOut) {
    return Math.sqrt(2 / (fanIn + fanOut));
  }

  // Byte-offset of layer l's weight block (1-based: l=1 = first connection)
  function oldOffset(l) {
    let off = 0;
    for (let i = 1; i < l; i++) off += oldL[i - 1] * oldL[i] + oldL[i];
    return off;
  }
  function newOffset(l) {
    let off = 0;
    for (let i = 1; i < l; i++) off += newL[i - 1] * newL[i] + newL[i];
    return off;
  }

  const oldL = buildLayers(prevArch);
  const newL = buildLayers(newArch);
  const result = new Float32Array(calcSize(newL));

  for (let l = 1; l < newL.length; l++) {
    const nIn = newL[l - 1];
    const nOut = newL[l];
    const std = xavierStd(nIn, nOut);
    const no = newOffset(l);

    // Xavier-init all weights in this layer first (safe default for new connections)
    for (let j = 0; j < nOut; j++) {
      for (let k = 0; k < nIn; k++) result[no + j * nIn + k] = gaussianRandom() * std;
      result[no + nOut * nIn + j] = 0; // zero biases
    }

    // Find the corresponding old layer:
    //   l=1             → always maps to old layer 1  (first connection preserved)
    //   l=newL.length-1 → always maps to old last layer (output weights preserved)
    //   middle          → same index if it exists in old, else stays Xavier-init
    let ol;
    if (l === 1) {
      ol = 1;
    } else if (l === newL.length - 1) {
      ol = oldL.length - 1;
    } else if (l < oldL.length - 1) {
      ol = l; // same position in both architectures
    } else {
      ol = -1; // no matching old layer — keep Xavier init
    }

    if (ol >= 1 && ol < oldL.length) {
      const oIn = oldL[ol - 1];
      const oOut = oldL[ol];
      const oo = oldOffset(ol);

      // Copy the overlapping block (min neurons on each axis)
      const copyOut = Math.min(oOut, nOut);
      const copyIn  = Math.min(oIn, nIn);
      for (let j = 0; j < copyOut; j++) {
        for (let k = 0; k < copyIn; k++) {
          result[no + j * nIn + k] = oldDNA[oo + j * oIn + k];
        }
        // Copy bias for this output neuron
        result[no + nOut * nIn + j] = oldDNA[oo + oOut * oIn + j];
      }
    }
  }

  return result;
}

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
   * @param {object[]} schemaPolygons - Array of { id, vertices: [{x,y}], internalNodes: [nodeIds] }
   * @param {{dna: Float32Array, architecture?: {hiddenLayers: number, neuronsPerLayer: number}}|null} dna - NN weights + optional architecture, null for random init
   * @param {number} minX
   * @param {number} minY
   * @param {object} simConfig - { jointFreedom, muscleStrength, jointMoveSpeed, muscleRange, muscleSmoothing }
   */
  constructor(world, originX, originY, schemaNodes, schemaConstraints, schemaPolygons, dna, minX, minY, simConfig = {}, creatureId = 0) {
    this.world = world;
    this.id = creatureId;
    this.bodies = []; // Array of planck.Body (nodes)
    this.polygonBodies = []; // Array of planck.Body (solid polygon bodies)
    this.muscles = []; // Array of { joint: PrismaticJoint, bodyA: Body, bodyB: Body, baseLength: number, currentLength: number, index: number }
    this.bones = []; // Array of DistanceJoint
    this.angleLimiters = []; // Array of DistanceJoint
    this.simConfig = simConfig;
    this.polygonData = []; // Will be populated with world-space vertices during creation

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
    baseDrain: simConfig.baseDrain ?? CONFIG.ENERGY_CONFIG?.baseDrain ?? 0.15,
    totalUsed: 0,
    efficiency: 1.0
  };

    // Create physics bodies (nodes)
    const bodyMap = {};
    const category = 0x0002;
    const mask = 0x0007; // Collide with ground (0x0001) + nodes (0x0002) + polygons (0x0004)
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
      b.nodeId = n.id; // Store original node ID for reference
      bodyMap[n.id] = b;
      this.bodies.push(b);
    });

    // Create polygon bodies (solid body parts)
    const polygonBodyMap = {}; // Map polygon ID to physics body
    const nodeInsidePolygon = new Map(); // Map node ID to polygon IDs it's inside
    
    (schemaPolygons || []).forEach((poly, polyIdx) => {
      // Transform vertices to world space
      const worldVertices = poly.vertices.map(v => ({
        x: originX + (v.x - minX),
        y: originY + (v.y - minY)
      }));
      
      const polyBody = createPolygonBody(
        this.world,
        worldVertices,
        {
          friction: simConfig.bodyFriction ?? 0.6,
          restitution: 0,
          categoryBits: 0x0004, // Polygon category
          maskBits: 0x0001,      // Only collide with ground (0x0001), NOT other creatures' nodes/polygons
          group: group
        }
      );
      
      if (polyBody) {
        polyBody.creatureId = this.id;
        polyBody.polygonId = poly.id;
        polygonBodyMap[poly.id] = polyBody;
        this.polygonBodies.push(polyBody);
        
        // Calculate polygon centroid for finding closest nodes
        let cx = 0, cy = 0;
        worldVertices.forEach(v => { cx += v.x; cy += v.y; });
        cx /= worldVertices.length;
        cy /= worldVertices.length;
        
        // Find nodes closest to polygon centroid (attach up to 4 closest nodes)
        const nodeDistances = [];
        this.bodies.forEach(nodeBody => {
          const nodePos = nodeBody.getPosition();
          const nodeX = nodePos.x * SCALE;
          const nodeY = nodePos.y * SCALE;
          const dist = Math.sqrt((nodeX - cx) ** 2 + (nodeY - cy) ** 2);
          nodeDistances.push({ nodeId: nodeBody.nodeId, dist, nodeBody });
        });
        
        // Sort by distance and attach closest nodes (up to 4)
        nodeDistances.sort((a, b) => a.dist - b.dist);
        const maxAttach = Math.min(4, nodeDistances.length);
        const detectedInternalNodes = [];
        for (let i = 0; i < maxAttach; i++) {
          // Only attach nodes that are reasonably close (within 3x polygon size)
          const polySize = Math.sqrt((worldVertices[0].x - cx) ** 2 + (worldVertices[0].y - cy) ** 2);
          if (nodeDistances[i].dist < polySize * 3) {
            detectedInternalNodes.push(nodeDistances[i].nodeId);
            nodeDistances[i].nodeBody.attachToPolygon = poly.id;
          }
        }
        
        // Track which nodes are attached to this polygon
        this.polygonData.push({
          id: poly.id,
          vertices: worldVertices,
          internalNodes: detectedInternalNodes,
          centroid: { x: cx, y: cy }
        });
        
        // Track internal nodes for collision filtering
        detectedInternalNodes.forEach(nodeId => {
          if (!nodeInsidePolygon.has(nodeId)) {
            nodeInsidePolygon.set(nodeId, []);
          }
          nodeInsidePolygon.get(nodeId).push(poly.id);
        });
      }
    });

    // Store internal node info for collision filtering
    this.nodeInsidePolygon = nodeInsidePolygon;

    // ATTACH NODES TO POLYGON BODIES
    // Create joints connecting internal nodes to their polygon body
    nodeInsidePolygon.forEach((polygonIds, nodeId) => {
      const nodeBody = bodyMap[nodeId];
      if (!nodeBody) return;
      
      // Attach to first polygon (if multiple overlap)
      const polygonId = polygonIds[0];
      const polyBody = polygonBodyMap[polygonId];
      if (!polyBody) return;
      
      // Create a revolute joint (hinge) to attach node to polygon
      const nodePos = nodeBody.getPosition();
      
      const joint = world.createJoint(RevoluteJoint({
        bodyA: polyBody,
        bodyB: nodeBody,
        anchor: nodePos,
        collideConnected: false
      }));
      
      // Store reference to this joint
      if (!this.polygonJoints) this.polygonJoints = [];
      this.polygonJoints.push(joint);
      
      // Mark this node as attached to polygon
      nodeBody.attachedToPolygon = polygonId;
    });

    // Count muscles for NN output size
    const muscleCount = schemaConstraints.filter(c => c.type === 'muscle').length;

    // Compute NN layer sizes - EVOLVING architecture
    // Inputs: body states (5 per body) + time/gait (3) + muscle states (4 per muscle: length, velocity, prev activation, trend)
    const numInputs = this.bodies.length * 5 + 3 + muscleCount * 4;
    const numOutputs = muscleCount;
    
    // Architecture is inherited from DNA/parent, or randomly initialized
    // Each creature has its own architecture that evolves
    const generation = simConfig.currentGeneration || 1;
    
    // Extract DNA weights and architecture from the passed dna object
    let dnaWeights = null;
    let dnaArchitecture = null;
    
    if (dna) {
      if (dna.dna) {
        // DNA is an object with { dna, architecture }
        dnaWeights = dna.dna;
        dnaArchitecture = dna.architecture;
      } else {
        // DNA is just the Float32Array (legacy format)
        dnaWeights = dna;
      }
    }
    
    // Determine architecture: prioritize DNA's architecture, then simConfig, then random
    let hiddenLayers, neuronsPerLayer;
    
    if (dnaArchitecture) {
      // Use architecture from DNA (passed through from Evolution)
      hiddenLayers = dnaArchitecture.hiddenLayers;
      neuronsPerLayer = dnaArchitecture.neuronsPerLayer;
    } else if (simConfig.parentHiddenLayers !== undefined && simConfig.parentNeuronsPerLayer !== undefined) {
      // Fall back to simConfig parent architecture
      hiddenLayers = simConfig.parentHiddenLayers;
      neuronsPerLayer = simConfig.parentNeuronsPerLayer;
    } else {
      // Generation 1: Start very simple
      // Random initialization with bias toward simple networks
      if (generation === 1) {
        // Gen 1: always ≥1 hidden layer — linear networks cannot learn locomotion
        const rand = Math.random();
        if (rand < 0.50) {  // 50%: simple 1-layer network
          hiddenLayers = 1;
          neuronsPerLayer = 4 + Math.floor(Math.random() * 8); // 4–12 neurons
        } else {            // 50%: moderate 2-layer network
          hiddenLayers = 2;
          neuronsPerLayer = 8 + Math.floor(Math.random() * 8); // 8–16 neurons
        }
      } else {
        // Random initialization — never allow 0 hidden layers
        hiddenLayers = 1 + Math.floor(Math.random() * 3); // 1–3 layers
        neuronsPerLayer = 4 + Math.floor(Math.random() * 12); // 4–16 neurons
      }
    }
    
    // Clamp to reasonable bounds — never allow 0 hidden layers
    hiddenLayers = Math.max(1, Math.min(6, hiddenLayers));
    neuronsPerLayer = Math.max(4, Math.min(32, neuronsPerLayer));

    // ASSERTION: Neural network MUST have at least 1 hidden layer
    if (hiddenLayers < 1) {
      throw new Error(`Invalid architecture: hiddenLayers=${hiddenLayers} (must be >= 1)`);
    }

    const layers = [numInputs];
    for (let i = 0; i < hiddenLayers; i++) {
      layers.push(neuronsPerLayer);
    }
    layers.push(numOutputs);

    // Create the neural network brain
    this.brain = new NeuralNetwork(layers);

    // Apply DNA weights to the brain:
    //   1. Exact match  → load directly (normal inheritance)
    //   2. Architecture mutated (prevArchitecture present) → smart transfer:
    //        copy compatible weights, Xavier-init new connections.
    //        Preserves learned behaviors across architectural changes.
    //   3. No match / no prev arch → fresh Xavier init
    if (dnaWeights && dnaWeights.length === this.brain.getWeightCount()) {
      this.brain.fromArray(dnaWeights);
      this.dna = dnaWeights;
    } else if (dnaWeights && dna && dna.prevArchitecture) {
      // Architecture was mutated — transfer compatible weights from parent
      const transferred = transferWeights(
        dnaWeights,
        dna.prevArchitecture,
        { hiddenLayers, neuronsPerLayer },
        numInputs,
        numOutputs
      );
      this.brain.fromArray(transferred);
      this.dna = transferred;
    } else {
      // DNA length mismatch with no prev arch — fresh Xavier init (correct architecture kept)
      this.dna = this.brain.toArray();
    }
    
    // Store architecture for evolution
    this.architecture = {
      hiddenLayers: hiddenLayers,
      neuronsPerLayer: neuronsPerLayer
    };

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
        // Create prismatic joint with hard limits to prevent over-extension
        const minLen = schema.minLength ?? (this.simConfig.muscleMinLength ?? 0.8);
        const maxLen = schema.maxLength ?? (this.simConfig.muscleMaxLength ?? 1.1);
        const muscleJoint = createMuscle(this.world, bodyA, null, bodyB, null, null, {
          restLength: lengthPx,
          minLength: lengthPx * minLen,
          maxLength: lengthPx * maxLen,
          maxForce: 100
        });
        
        // Store muscle info for force-based actuation
        this.muscles.push({
          bodyA,
          bodyB,
          joint: muscleJoint, // Prismatic joint with limits
          baseLength: lengthPx,
          currentLength: lengthPx,
          index: m,
          smoothSignal: 0,
          restLength: lengthPx,
          minLength: minLen, // store limits so spring target matches joint hard stops
          maxLength: maxLen
        });
        m++;
      } else {
    // Create distance joint for bone - RIGID but allows rotation at nodes
      // High frequency = rigid bone that maintains length
      const joint = createBone(this.world, bodyA, null, bodyB, null, lengthPx, {
        frequencyHz: 15, // Lower stiffness (spring ∝ freq²) reduces ground-chattering impulses
        dampingRatio: 1.0 // Critically damped — no overshoot, no resonance
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

    // Angle limiters: ONLY create for FIXED nodes (when lock button clicked)
    // This allows free rotation like hinges for normal nodes
    neighbors.forEach((set, centerId) => {
      const ids = Array.from(set);
      if (ids.length < 2) return;

      const centerNode = nodeMap.get(centerId);
      const isFixed = centerNode && centerNode.fixed;
      
      // Only create angle limiters for fixed nodes - allows hinges to rotate freely
      if (!isFixed) return;

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
            frequencyHz: 60, // Rigid for fixed joints
            dampingRatio: 1.0 // Critically damped — no oscillation in fixed joints
          });
          limiter.isAngleLimiter = true;
          limiter.isFixedJoint = true;
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
  buildInputs(groundY, time, dt = 1/60) {
    const numBodies = this.bodies.length;
    const numMuscles = this.muscles.length;
    const normFactor = dt * 60;
    // Inputs: per body (5) + gait phase (3) + per muscle (4)
    const inputs = new Float32Array(numBodies * 5 + 3 + numMuscles * 4);
    const center = this.getCenter();

    // Initialize velocity smoothing if needed
    if (!this.smoothedVelocities) {
      this.smoothedVelocities = new Float32Array(numBodies * 2);
    }

    for (let i = 0; i < numBodies; i++) {
      const b = this.bodies[i];
      const pos = b.getPosition();
      const vel = b.getLinearVelocity();
      const offset = i * 5;
      const velOffset = i * 2;

      // Relative position normalized by span
      inputs[offset] = ((pos.x * SCALE) - center.x) / this.span;
      inputs[offset + 1] = ((pos.y * SCALE) - center.y) / this.span;

      // Smooth velocity inputs to prevent NN spam - normalized by dt
      const rawVelX = Math.max(-1, Math.min(1, vel.x * SCALE * 0.05)); // Reduced sensitivity
      const rawVelY = Math.max(-1, Math.min(1, vel.y * SCALE * 0.05));
      const velAlpha = 0.1 * normFactor; // Smooth velocity changes - normalized
      this.smoothedVelocities[velOffset] = this.smoothedVelocities[velOffset] * (1 - velAlpha) + rawVelX * velAlpha;
      this.smoothedVelocities[velOffset + 1] = this.smoothedVelocities[velOffset + 1] * (1 - velAlpha) + rawVelY * velAlpha;
      
      inputs[offset + 2] = this.smoothedVelocities[velOffset];
      inputs[offset + 3] = this.smoothedVelocities[velOffset + 1];

      // Ground contact
      inputs[offset + 4] = ((pos.y * SCALE) + CONFIG.nodeRadius >= groundY - 2) ? 1 : 0;
    }

    const base = numBodies * 5;
    // Gait phase signals - slow sine waves to encourage rhythmic walking
    // Multiple frequencies allow different gait patterns
    inputs[base] = Math.sin(time * 0.05); // Slow gait cycle (~2 seconds)
    inputs[base + 1] = Math.cos(time * 0.05); // 90 degrees out of phase
    inputs[base + 2] = Math.sin(time * 0.15); // Faster component for trot/canter

    // Muscle state inputs - so NN knows its own muscle positions and limits
    const muscleBase = base + 3;
    for (let i = 0; i < numMuscles; i++) {
      const m = this.muscles[i];
      const muscleOffset = muscleBase + i * 4;

      // Current muscle length as % of base (0.5 = contracted, 1.0 = rest, 1.5 = extended)
      // Normalized to -1 to 1 range for NN
      const lengthRatio = m.currentLength / m.baseLength;
      inputs[muscleOffset] = Math.max(-1, Math.min(1, (lengthRatio - 1.0) * 2)); // -1 to 1 range

      // Muscle length change velocity - SMOOTHED to prevent noise
      const prevLength = m.prevLength || m.baseLength;
      const rawLengthVelocity = (m.currentLength - prevLength) / Math.max(0.001, m.baseLength);
      // Smooth the velocity input - normalized by dt
      if (!m.smoothedLengthVelocity) m.smoothedLengthVelocity = 0;
      const muscleVelAlpha = Math.min(0.4, Math.max(0.02, 0.2 * normFactor));
      m.smoothedLengthVelocity = m.smoothedLengthVelocity * (1 - muscleVelAlpha) + rawLengthVelocity * muscleVelAlpha;
      inputs[muscleOffset + 1] = Math.max(-1, Math.min(1, m.smoothedLengthVelocity * 5)); // Reduced multiplier

      // Previous muscle activation (what we did last frame) - for coordination
      inputs[muscleOffset + 2] = m.prevActivation || 0;

// Muscle length trend (moving average direction) - for predicting future
// Use circular buffer for better performance
if (!m.lengthHistory) {
m.lengthHistory = new Float32Array(20);
m.historyIndex = 0;
m.historyCount = 0;
}
m.lengthHistory[m.historyIndex] = lengthRatio;
m.historyIndex = (m.historyIndex + 1) % 20;
m.historyCount = Math.min(m.historyCount + 1, 20);

const trend = m.historyCount > 1 ?
(m.lengthHistory[(m.historyIndex - 1 + 20) % 20] - m.lengthHistory[(m.historyIndex - m.historyCount + 20) % 20]) / m.historyCount : 0;
inputs[muscleOffset + 3] = Math.max(-1, Math.min(1, trend * 3)); // Reduced multiplier

      // Store previous values for next frame
      m.prevLength = m.currentLength;
    }

    return inputs;
  }

  /**
   * Neural network forward pass → apply outputs to muscles.
   * @param {number} time
   * @param {number} groundY
   * @param {number} dt - delta time in seconds for frame-rate normalization
   */
  update(time, groundY, dt = 1/60) {
    const normFactor = dt * 60;
    // Update angle limiter stiffness
    const freedom = this.simConfig.jointFreedom !== undefined ? this.simConfig.jointFreedom : 1.0;
    const rigid = 1 - freedom;
    const bendStiffness = Math.max(0, Math.min(0.9, rigid * rigid * 0.9));
    
    // Note: Planck.js joints don't have stiffness property that can be changed at runtime
    // The frequencyHz and dampingRatio are set at creation time
    // For now, we skip runtime stiffness updates

    if (this.muscles.length === 0) return;

    // Build inputs and run NN
    const inputs = this.buildInputs(groundY, time, dt);
    const outputs = this.brain.forward(inputs);

    // Apply NN outputs to muscles (tanh output in [-1, 1])
    const strength = this.simConfig.muscleStrength || 1.2;
    const moveSpeed = Math.max(0.2, Math.min(2.2, this.simConfig.jointMoveSpeed || 1.0));
    const rangeScale = this.simConfig.muscleRange ?? 0.8; // Default 80% range
    const smoothingBase = this.simConfig.muscleSmoothing ?? 0.10;
    const smoothing = Math.min(0.5, Math.max(0.01, smoothingBase));

    // Pre-calculate which bodies are grounded
    const isGrounded = new Map();
    this.bodies.forEach(b => {
      const pos = b.getPosition();
      isGrounded.set(b, (pos.y * SCALE + CONFIG.nodeRadius) >= (groundY - 2));
    });

  let totalJerk = 0;
  let totalActuation = 0;
  let energyUsedThisFrame = 0;
  let groundedMuscles = 0; // Count muscles touching ground for regen bonus

  // Calculate average activation for coordination incentives
  const avgActivation = outputs.reduce((sum, out) => sum + Math.abs(out || 0), 0) / Math.max(1, outputs.length);

  // SMOOTH MUSCLE CONTROL with speed limit
  // NN outputs desired target, muscle moves with realistic physics
  this.muscles.forEach((m, i) => {
      // NN output is the desired target (-1 = contract, 0 = base, +1 = extend)
      const desiredTarget = outputs[i] || 0;
      
      // Initialize muscle state
      if (m.currentTarget === undefined) m.currentTarget = 0;

      // Rate-limit how fast the signal can change per physics step.
      // This is the real jitter fix: muscles can't reverse direction faster than
      // this rate allows, so high-frequency vibration exploitation is physically impossible.
      // smoothing=0.10 → 0.30/step max → ~4Hz max oscillation (fast walking)
      // smoothing=0.03 → 0.09/step max → ~1.3Hz max (slow, deliberate)
      // smoothing=0.01 → 0.03/step max → ~0.4Hz max (very slow)
      const maxDeltaPerStep = Math.max(0.005, smoothing * 3.0);
      const rawDelta = desiredTarget - m.currentTarget;
      m.currentTarget += Math.sign(rawDelta) * Math.min(Math.abs(rawDelta), maxDeltaPerStep);
      m.currentTarget = Math.max(-1, Math.min(1, m.currentTarget));

      // Track actuation jerk: magnitude of change in activation per step
      const prevAct = m.prevActivation || 0;
      totalJerk += Math.abs(m.currentTarget - prevAct);

      // Store for visualization and NN feedback
      m.smoothSignal = m.currentTarget;

    // Per-muscle ground contact
    const bodyAGrounded = isGrounded.get(m.bodyA) || false;
    const bodyBGrounded = isGrounded.get(m.bodyB) || false;
    if (bodyAGrounded || bodyBGrounded) groundedMuscles++;

    let muscleStrengthMultiplier;
      if (bodyAGrounded && bodyBGrounded) {
        muscleStrengthMultiplier = 1.0;
      } else if (bodyAGrounded || bodyBGrounded) {
        muscleStrengthMultiplier = 0.7;
      } else {
        muscleStrengthMultiplier = 0.15;
      }

    // Energy system - use currentTarget (what's actually applied) for accurate cost
    let energyMultiplier = 1.0;
    if (this.energy.enabled) {
      const actuationMagnitude = Math.abs(m.currentTarget || 0);
      const baseDrain = this.energy.baseDrain || 0;
      const energyCost = (actuationMagnitude * this.energy.usagePerActuation) + baseDrain;
      energyUsedThisFrame += energyCost;

      const energyRatio = Math.max(0, Math.min(1, this.energy.current / this.energy.max));

      // Less punishing energy multiplier curve
      if (energyRatio <= 0) {
        energyMultiplier = 0.35; // Minimum 35% strength at zero energy
      } else if (energyRatio < 0.25) {
        energyMultiplier = 0.35 + (energyRatio / 0.25) * 0.2; // 35% to 55%
      } else if (energyRatio < 0.5) {
        energyMultiplier = 0.55 + ((energyRatio - 0.25) / 0.25) * 0.2; // 55% to 75%
      } else if (energyRatio < 0.75) {
        energyMultiplier = 0.75 + ((energyRatio - 0.5) / 0.25) * 0.15; // 75% to 90%
      } else {
        energyMultiplier = 0.9 + ((energyRatio - 0.75) / 0.25) * 0.1; // 90% to 100%
      }
    }

      // MUSCLES CAN PUSH AND PULL (like artificial actuators)
      // Signal > 0 = PUSH (extend, increase distance)
      // Signal < 0 = PULL (contract, decrease distance)  
      // Signal = 0 = relaxed (maintain current length)

      // Get current distance between bodies
      const posA = m.bodyA.getPosition();
      const posB = m.bodyB.getPosition();
      const dx = (posB.x - posA.x) * SCALE;
      const dy = (posB.y - posA.y) * SCALE;
      const currentDist = Math.sqrt(dx * dx + dy * dy);
      m.currentLength = currentDist;

      // Signal maps to target length — use stored joint limits so spring never fights the hard stop
      // This eliminates jitter caused by spring pulling beyond the prismatic joint's physical limits
      const maxLen = m.maxLength ?? 1.1;
      const minLen = m.minLength ?? 0.8;
      const extensionRange = m.baseLength * (maxLen - 1.0);   // e.g. 0.1 for 110% max
      const contractionRange = m.baseLength * (1.0 - minLen); // e.g. 0.2 for 80% min

      const smoothSignal = m.currentTarget;
      const targetLength = m.baseLength + (smoothSignal * (smoothSignal > 0 ? extensionRange : contractionRange));

      // Calculate force direction (from A to B)
      // Always apply spring force - at signal=0, targetLength=baseLength, so muscle holds its drawn length
      if (currentDist > 0.1) {
        const dirX = dx / currentDist;
        const dirY = dy / currentDist;

// Spring drives muscle to rate-limited target. Fixed constants — strength slider controls cap.
      const error = currentDist - targetLength;
      const springConstant = 7.0;
      let forceMagnitude = -springConstant * error;

      // Velocity damping along muscle axis kills spring oscillation
      const velA = m.bodyA.getLinearVelocity();
      const velB = m.bodyB.getLinearVelocity();
      const relVelX = (velB.x - velA.x) * SCALE;
      const relVelY = (velB.y - velA.y) * SCALE;
      const relVelAlong = relVelX * dirX + relVelY * dirY;

      const damping = 7.5;
      forceMagnitude -= damping * relVelAlong;

      // Apply force if significant
      if (Math.abs(forceMagnitude) > 1.5) {
        forceMagnitude = Math.max(-90, Math.min(90, forceMagnitude)); // Slightly higher force cap (was 80)
        
        // Apply all multipliers: slider strength, energy level, ground contact
        forceMagnitude *= (strength * energyMultiplier * muscleStrengthMultiplier);

          // Apply force
          const forceX = (forceMagnitude * dirX) / SCALE;
          const forceY = (forceMagnitude * dirY) / SCALE;
          m.bodyA.applyForceToCenter(Vec2(-forceX, -forceY));
          m.bodyB.applyForceToCenter(Vec2(forceX, forceY));
        }
      }
      
      // Store actual physical extension for visualization (not the target)
      // Positive = stretched (extended), Negative = compressed (contracted)
      m.currentExtension = (m.currentLength - m.baseLength) / m.baseLength;

      m.currentSignal = m.currentTarget;
      m.prevActivation = m.currentTarget; // Store for next frame's NN input
      totalActuation += Math.abs(m.currentTarget);
    });

    // Coordination tracking: reward alternating muscle patterns (walking gait)
    this.stats.coordinationBonus = 0;
    if (this.muscles.length >= 2) {
      let coordinationScore = 0;
      // Check for anti-phase activation between adjacent muscles
      for (let i = 0; i < this.muscles.length - 1; i++) {
        const m1 = this.muscles[i];
        const m2 = this.muscles[i + 1];
        // Anti-phase means when one contracts (negative), other extends (positive)
        const antiPhase = (m1.smoothSignal < 0 && m2.smoothSignal > 0) || 
                         (m1.smoothSignal > 0 && m2.smoothSignal < 0);
        if (antiPhase) coordinationScore += 0.5;
      }
      this.stats.coordinationBonus = coordinationScore;
    }

    const avgJerk = totalJerk / Math.max(1, this.muscles.length);
    this.stats.actuationJerk = this.stats.actuationJerk * 0.9 + avgJerk * 0.1;
    const avgAct = totalActuation / Math.max(1, this.muscles.length);
    this.stats.actuationLevel = this.stats.actuationLevel * 0.9 + avgAct * 0.1;

  // Update energy system
  if (this.energy.enabled) {
    this.energy.current = Math.max(0, this.energy.current - energyUsedThisFrame);
    this.energy.totalUsed += energyUsedThisFrame;

    // Energy regen: lower base, scales with inactivity, bonus when grounded
    const regenMultiplier = 0.2 + (1.0 - avgAct) * 0.3; // 0.2 to 0.5 range
    const groundedRatio = this.muscles.length > 0 ? groundedMuscles / this.muscles.length : 0;
    const groundedBonus = groundedRatio > 0.5 ? 1.25 : 1.0; // 25% bonus when 50%+ muscles grounded
    const dtSec = 1 / CONFIG.fixedStepHz;
    const regenAmount = this.energy.regenRate * regenMultiplier * groundedBonus * dtSec;
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
      coordinationBonus: Math.max(0, this.stats.coordinationBonus),
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
    
    // Destroy polygon joints
    if (this.polygonJoints) {
      this.polygonJoints.forEach(joint => {
        if (joint) this.world.destroyJoint(joint);
      });
      this.polygonJoints = [];
    }
    
    // Destroy all bodies
    this.bodies.forEach(b => {
      if (b) this.world.destroyBody(b);
    });
    
    // Destroy polygon bodies
    this.polygonBodies.forEach(b => {
      if (b) this.world.destroyBody(b);
    });
    
    this.muscles = [];
    this.bones = [];
    this.angleLimiters = [];
    this.bodies = [];
    this.polygonBodies = [];
    this.polygonData = [];
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

    // Draw polygon bodies (solid body parts)
    this.polygonBodies.forEach((polyBody, idx) => {
      const bodyPos = polyBody.getPosition();
      const bodyAngle = polyBody.getAngle();
      
      // Get vertices directly from physics fixtures
      const worldVertices = [];
      for (let f = polyBody.getFixtureList(); f; f = f.getNext()) {
        const shape = f.getShape();
        if (shape.getType() === 'polygon') {
          const vertices = shape.m_vertices;
          vertices.forEach(v => {
            // Transform local vertex to world space
            const cos = Math.cos(bodyAngle);
            const sin = Math.sin(bodyAngle);
            const worldX = (v.x * cos - v.y * sin + bodyPos.x) * SCALE;
            const worldY = (v.x * sin + v.y * cos + bodyPos.y) * SCALE;
            worldVertices.push({ x: worldX, y: worldY });
          });
        }
      }
      
      if (worldVertices.length < 3) return;
      
      // Draw filled polygon using transformed vertices
      ctx.beginPath();
      ctx.moveTo(worldVertices[0].x, worldVertices[0].y);
      for (let i = 1; i < worldVertices.length; i++) {
        ctx.lineTo(worldVertices[i].x, worldVertices[i].y);
      }
      ctx.closePath();
      
      // Fill with semi-transparent purple
      ctx.fillStyle = isLeader ? 'rgba(139, 92, 246, 0.5)' : 'rgba(139, 92, 246, 0.15)';
      ctx.fill();
      ctx.strokeStyle = isLeader ? 'rgba(139, 92, 246, 0.9)' : 'rgba(139, 92, 246, 0.3)';
      ctx.lineWidth = isLeader ? 3 : 1;
      ctx.globalAlpha = isLeader ? 1 : 0.25;
      ctx.stroke();
    });

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

    // Draw muscles with visual feedback on activation level
    this.muscles.forEach(m => {
      const posA = m.bodyA.getPosition();
      const posB = m.bodyB.getPosition();
      const p1 = { x: posA.x * SCALE, y: posA.y * SCALE };
      const p2 = { x: posB.x * SCALE, y: posB.y * SCALE };
      
    ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);

      // Actual physical extension: positive = stretched, negative = contracted
      const extension = m.currentExtension || 0;
      const activation = Math.abs(extension);

      // Visual thickness: THICKER when contracted, THINNER when extended
      // Negative extension = contracted = very thick
      // Positive extension = stretched = thin
      const baseWidth = isLeader ? 6 : 3;
      const normalizedExt = Math.max(-1, Math.min(1, extension * 3)); // Scale for visual effect
      const thickness = baseWidth * (1.8 - normalizedExt * 0.8); // 2.6x when contracted, 1x when extended
      ctx.lineWidth = Math.max(2, Math.min(14, thickness));

      // Color: BLUE for extended (stretched), RED for contracted, gray when relaxed
      // Colors get MORE vibrant with activation
      const satBoost = 0.4 + activation * 0.6; // More saturated when working
      let r, g, b_color;
      if (extension > 0.03) {
        // EXTENDED - Blue (stretched)
        r = Math.floor(40 + 20 * (1 - satBoost));
        g = Math.floor(80 + 70 * satBoost);
        b_color = 255;
      } else if (extension < -0.03) {
        // CONTRACTED - Red
        r = 255;
        g = Math.floor(30 + 50 * (1 - satBoost));
        b_color = Math.floor(30 + 30 * (1 - satBoost));
      } else {
        // Relaxed - Gray
        r = 150;
        g = 150;
        b_color = 150;
      }
      ctx.strokeStyle = `rgb(${r},${g},${b_color})`;

      // Opacity shows activation level
      ctx.globalAlpha = isLeader ? (0.3 + activation * 0.7) : (0.1 + activation * 0.2);
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

  _isPointInPolygon(x, y, vertices) {
    let inside = false;
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
      const xi = vertices[i].x, yi = vertices[i].y;
      const xj = vertices[j].x, yj = vertices[j].y;
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }
    return inside;
  }

  updateRuntimeSettings() {
    const selfOn = !!this.simConfig.selfCollision;
    const group = selfOn ? (this.id + 1) : -(this.id + 1);
    
    // Update collision filter for all bodies
    this.bodies.forEach(b => {
      let fixture = b.getFixtureList();
      while (fixture) {
        fixture.setFilterGroupIndex(group);
        fixture.setFilterMaskBits(0x0001);
        fixture = fixture.getNext();
      }
    });
  }
}
