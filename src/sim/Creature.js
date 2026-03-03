import { createNode, createBone, createMuscle, createAngleLimiter, cleanup, SCALE, planck, World, Vec2, Body, Circle, Edge, PrismaticJoint, DistanceJoint, RevoluteJoint } from '../sim/Physics.js';
import { NeuralNetwork, gaussianRandom } from '../nn/NeuralNetwork.js';
import { Genome } from '../nn/neat/Genome.js';
import { DenseBrainController } from '../nn/runtime/DenseBrainController.js';
import { NeatBrainController } from '../nn/runtime/NeatBrainController.js';
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
   * @param {{dna: Float32Array, architecture?: {hiddenLayers: number, neuronsPerLayer: number}}|null} dna - NN weights + optional architecture, null for random init
   * @param {number} minX
   * @param {number} minY
   * @param {object} simConfig - { jointFreedom, muscleStrength, jointMoveSpeed, muscleRange, muscleSmoothing }
   */
  constructor(world, originX, originY, schemaNodes, schemaConstraints, dna, minX, minY, simConfig = {}, creatureId = 0) {
    this.world = world;
    this.id = creatureId;
    this.bodies = []; // Array of planck.Body (nodes)
    this.muscles = []; // Array of { joint: PrismaticJoint, bodyA: Body, bodyB: Body, baseLength: number, currentLength: number, index: number }
    this.bones = []; // Array of DistanceJoint
    this.angleLimiters = []; // Array of DistanceJoint
    this.fixedNodeCount = 0;
    this.simConfig = simConfig;
    this.dead = false;

    this.stats = {
      speed: 0,
      stability: 100,
      airtimePct: 0,
      upright: 0.5,
      actuationJerk: 0,
      actuationLevel: 0,
      groundSlip: 0,
      groundedRatio: 0,
      verticalSpeed: 0,
      energyViolations: 0,
      teleportViolations: 0,
      frames: 0,
      airFrames: 0,
      maxX: -Infinity,
      prevCenter: null,
      intentUpdateHz: 0,
      commandOscillationHz: 0,
      avgCommandDeltaPerSec: 0,
      microActuationIndex: 0,
      groundSlipAccum: 0,
      groundedTimeSec: 0,
      groundSlipRate: 0,
      invalidGenome: 0
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

    const fixedNodeIds = new Set(
      schemaNodes
        .filter(n => !!n.fixed)
        .map(n => n.id)
    );
    this.fixedNodeCount = fixedNodeIds.size;

    const boneAdjacencyByNodeId = new Map();
    const boneEdgeSet = new Set();
    const addBoneNeighbor = (from, to) => {
      if (!boneAdjacencyByNodeId.has(from)) boneAdjacencyByNodeId.set(from, new Set());
      boneAdjacencyByNodeId.get(from).add(to);
    };
    schemaConstraints.forEach(schema => {
      if (schema.type !== 'bone') return;
      const n1 = Number(schema.n1);
      const n2 = Number(schema.n2);
      if (!Number.isFinite(n1) || !Number.isFinite(n2) || n1 === n2) return;
      const key = n1 < n2 ? `${n1}:${n2}` : `${n2}:${n1}`;
      boneEdgeSet.add(key);
      addBoneNeighbor(n1, n2);
      addBoneNeighbor(n2, n1);
    });

    // Create physics bodies (nodes)
    const bodyMap = {};
    const category = 0x0002;
    // Nodes only collide with terrain and the death wall sensor, never with other creatures.
    const mask = 0x0009; // ground (0x0001) + death wall (0x0008)
    const group = this.id + 1;

    schemaNodes.forEach(n => {
      const b = createNode(
        this.world,
        originX + (n.x - minX),
        originY + (n.y - minY),
        CONFIG.nodeRadius,
        {
          density: 0.0035,
          friction: simConfig.bodyFriction ?? 2,
          linearDamping: simConfig.bodyAirFriction ?? 0,
          angularDamping: 0.05,
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

    // Count muscles for NN output size
    const muscleCount = schemaConstraints.filter(c => c.type === 'muscle').length;

    // Compute NN layer sizes - EVOLVING architecture
    // Inputs: center velocity (2) + rotation sin/cos (2) + upright (1) + per-muscle (length + prev activation)
    const numInputs = 5 + muscleCount * 2;
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

    const preferredController = (dna?.controllerType || simConfig.trainingAlgorithm || 'dense') === 'neat' ? 'neat' : 'dense';
    const incomingGenome = dna?.genome
      ? (typeof dna.genome.evaluate === 'function' ? dna.genome : Genome.fromSerializable(dna.genome))
      : null;
    if (preferredController === 'neat' && incomingGenome) {
      this.genome = incomingGenome;
      this.controllerType = 'neat';
      this.controller = new NeatBrainController(incomingGenome);
      this.brain = this.controller;
      this.dna = incomingGenome.toDNA();
      this.architecture = {
        hiddenLayers: 1,
        neuronsPerLayer: Math.max(4, Math.ceil((incomingGenome.nodes.size - numInputs - numOutputs) || 4)),
        neat: true,
        neatGenomeId: incomingGenome.id,
        neatNodeCount: incomingGenome.nodes.size,
        neatConnCount: incomingGenome.connections.size
      };
    } else {
      this.controllerType = 'dense';
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
      this.controller = new DenseBrainController(layers, this.dna, this.brain);
      // Store architecture for evolution
      this.architecture = {
        hiddenLayers: hiddenLayers,
        neuronsPerLayer: neuronsPerLayer
      };
    }

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
          maxLength: maxLen,
          intent: 0,
          command: 0,
          phaseGroup: (m % 2 === 0) ? 0 : Math.PI,
          lastIntentUpdateAt: 0,
          commandDeltaAbsWindow: 0,
          commandOscillationCount: 0,
          prevCommandDelta: 0,
          prevLengthForDiag: lengthPx
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

    this._createFixedNodeAngleLimiters(
      bodyMap,
      fixedNodeIds,
      boneAdjacencyByNodeId,
      boneEdgeSet
    );

    // Track connected bodies for collision filtering.
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

    // Precompute creature span for normalization
    this._computeSpan();

    this.gaitPhase = 0;
    this.gaitHz = Math.max(0.1, this.simConfig.gaitHz ?? CONFIG.defaultGaitHz ?? 1.6);
    this._phaseLockEnabled = (this.simConfig.phaseLockEnabled ?? CONFIG.defaultPhaseLockEnabled) !== false;
    this._intentUpdateAccumulatorSec = 0;
    this._controlTimeSec = 0;
    this._intentUpdateCount = 0;
    this._commandDeltaAbsAccum = 0;
    this._commandOscillationAccum = 0;
    this._lengthDeltaAbsAccum = 0;
    this._microActuationAccum = 0;
    this._lastInputCenter = this.getCenter();
  }

  _selectFixedNodeNeighborPairs(neighborIds, centerBody, bodyMap) {
    if (!Array.isArray(neighborIds) || neighborIds.length < 2) return [];
    if (neighborIds.length === 2) return [[neighborIds[0], neighborIds[1]]];
    if (neighborIds.length === 3) {
      return [
        [neighborIds[0], neighborIds[1]],
        [neighborIds[0], neighborIds[2]],
        [neighborIds[1], neighborIds[2]]
      ];
    }

    const center = centerBody.getPosition();
    const sorted = neighborIds
      .slice()
      .sort((a, b) => {
        const pa = bodyMap[a].getPosition();
        const pb = bodyMap[b].getPosition();
        const aa = Math.atan2(pa.y - center.y, pa.x - center.x);
        const ab = Math.atan2(pb.y - center.y, pb.x - center.x);
        return aa - ab;
      });

    const pairs = [];
    for (let i = 0; i < sorted.length; i++) {
      const a = sorted[i];
      const b = sorted[(i + 1) % sorted.length];
      if (a === b) continue;
      pairs.push([a, b]);
    }
    return pairs;
  }

  _createFixedNodeAngleLimiters(bodyMap, fixedNodeIds, boneAdjacencyByNodeId, boneEdgeSet) {
    if (!fixedNodeIds || fixedNodeIds.size === 0) return;
    const createdPairKeys = new Set();

    fixedNodeIds.forEach(nodeId => {
      const centerBody = bodyMap[nodeId];
      if (!centerBody) return;
      const neighbors = Array.from(boneAdjacencyByNodeId.get(nodeId) || [])
        .filter(otherId => otherId !== nodeId && !!bodyMap[otherId]);
      if (neighbors.length < 2) return;

      const candidatePairs = this._selectFixedNodeNeighborPairs(neighbors, centerBody, bodyMap);
      let createdForNode = 0;
      for (let i = 0; i < candidatePairs.length; i++) {
        if (createdForNode >= 6) break;
        const [rawA, rawB] = candidatePairs[i];
        const a = Number(rawA);
        const b = Number(rawB);
        if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) continue;
        const pairKey = a < b ? `${a}:${b}` : `${b}:${a}`;
        if (boneEdgeSet.has(pairKey)) continue;
        if (createdPairKeys.has(pairKey)) continue;
        const bodyA = bodyMap[a];
        const bodyB = bodyMap[b];
        if (!bodyA || !bodyB) continue;

        const posA = bodyA.getPosition();
        const posB = bodyB.getPosition();
        const dx = (posB.x - posA.x) * SCALE;
        const dy = (posB.y - posA.y) * SCALE;
        const lengthPx = Math.sqrt(dx * dx + dy * dy);
        if (!Number.isFinite(lengthPx) || lengthPx < 1) continue;

        const limiter = createAngleLimiter(this.world, bodyA, bodyB, lengthPx, {
          frequencyHz: 0,
          dampingRatio: 1.0
        });
        limiter.isAngleLimiter = true;
        limiter.fixedNodeId = nodeId;
        this.angleLimiters.push(limiter);
        createdPairKeys.add(pairKey);
        createdForNode++;
      }
    });
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

  _getPrimaryRotation() {
    if (this.bodies.length < 2) return 0;
    const a = this.bodies[0].getPosition();
    const b = this.bodies[this.bodies.length - 1].getPosition();
    return Math.atan2((b.y - a.y), (b.x - a.x));
  }

  /**
   * Unified grounded check so all systems use the same threshold.
   * @param {planck.Body} body
   * @param {number} groundY
   * @returns {boolean}
   */
  isBodyGroundedStrict(body) {
    let edge = body.getContactList();
    while (edge) {
      const contact = edge.contact;
      if (contact && contact.isTouching()) {
        const fixtureA = contact.getFixtureA();
        const fixtureB = contact.getFixtureB();
        const bodyA = fixtureA.getBody();
        const bodyB = fixtureB.getBody();
        const selfIsA = bodyA === body;
        const selfFixture = selfIsA ? fixtureA : fixtureB;
        const otherFixture = selfIsA ? fixtureB : fixtureA;
        const otherBody = selfIsA ? bodyB : bodyA;

        if (
          !selfFixture.isSensor() &&
          !otherFixture.isSensor() &&
          otherBody !== body &&
          otherBody.creatureId !== this.id &&
          !otherBody.isDeathWall
        ) {
          return true;
        }
      }
      edge = edge.next;
    }
    return false;
  }

  /**
   * Unified grounded check so all systems use the same threshold.
   * @param {planck.Body} body
   * @param {number} groundY
   * @returns {boolean}
   */
  isBodyGrounded(body, groundY) {
    // Primary grounded signal: strict physical contact with environment.
    if (this.isBodyGroundedStrict(body)) return true;

    // Fallback for startup frames before contact graph is fully warm.
    const pos = body.getPosition();
    const threshold = this.simConfig.groundedThreshold ?? CONFIG.defaultGroundedThreshold;
    return (pos.y * SCALE + CONFIG.nodeRadius) >= (groundY - threshold);
  }

  /**
   * Build sensory input vector from body states.
   * @param {number} groundY
   * @param {number} time - simulation time
   * @returns {Float32Array}
   */
  buildInputs(groundY, time, dt = 1/60) {
    const numMuscles = this.muscles.length;
    // Inputs: center velocity (2) + rotation sin/cos (2) + upright (1) + per-muscle (length, prev activation)
    const inputs = new Float32Array(5 + numMuscles * 2);
    const center = this.getCenter();
    const prevCenter = this._lastInputCenter || center;
    const velX = (center.x - prevCenter.x) / Math.max(0.0001, dt);
    const velY = (center.y - prevCenter.y) / Math.max(0.0001, dt);
    this._lastInputCenter = center;

    const rotation = this._getPrimaryRotation();
    const uprightInput = Math.max(0, Math.min(1, (groundY - center.y) / 80));

    inputs[0] = Math.max(-1, Math.min(1, velX * 0.02));
    inputs[1] = Math.max(-1, Math.min(1, velY * 0.02));
    inputs[2] = Math.sin(rotation);
    inputs[3] = Math.cos(rotation);
    inputs[4] = uprightInput;

    const muscleBase = 5;
    for (let i = 0; i < numMuscles; i++) {
      const m = this.muscles[i];
      const muscleOffset = muscleBase + i * 2;

      const lengthRatio = m.currentLength / m.baseLength;
      inputs[muscleOffset] = Math.max(-1, Math.min(1, (lengthRatio - 1.0) * 2)); // -1 to 1 range

      // Previous final command activation for temporal continuity.
      inputs[muscleOffset + 1] = Math.max(-1, Math.min(1, m.prevActivation || 0));
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
    // Note: Planck.js joints don't have stiffness property that can be changed at runtime
    // The frequencyHz and dampingRatio are set at creation time
    // For now, we skip runtime stiffness updates

    if (this.muscles.length === 0) return;

    this._controlTimeSec += dt;
    this.gaitPhase += (Math.PI * 2 * this.gaitHz * dt);
    if (this.gaitPhase > Math.PI * 2) this.gaitPhase %= (Math.PI * 2);

    const actionBudget = Math.max(1, Math.round(this.simConfig.muscleActionBudget ?? CONFIG.defaultMuscleActionBudget ?? 1));
    const actionBudgetSec = actionBudget / 60;
    this._intentUpdateAccumulatorSec += dt;
    if (this._intentUpdateAccumulatorSec >= actionBudgetSec) {
      const inputs = this.buildInputs(groundY, time, dt);
      let outputs = null;
      try {
        outputs = this.controller.forward(inputs);
      } catch (err) {
        this.stats.invalidGenome += 1;
        outputs = new Float32Array(this.muscles.length);
      }
      this.muscles.forEach((m, i) => {
        m.intent = Math.max(-1, Math.min(1, outputs[i] || 0));
        m.lastIntentUpdateAt = this._controlTimeSec;
      });
      const ticks = Math.max(1, Math.floor(this._intentUpdateAccumulatorSec / actionBudgetSec));
      this._intentUpdateAccumulatorSec -= ticks * actionBudgetSec;
      this._intentUpdateCount += ticks;
    }

    // Apply muscle commands (intent/command split)
    const strength = this.simConfig.muscleStrength || 1.2;
    const commandDeadband = Math.max(0, this.simConfig.commandDeadband ?? CONFIG.defaultCommandDeadband ?? 0.03);
    const maxCommandDeltaPerStep = Math.max(0.001, this.simConfig.maxCommandDeltaPerStep ?? CONFIG.defaultMaxCommandDeltaPerStep ?? 0.08);
    const phaseLockEnabled = (this.simConfig.phaseLockEnabled ?? this._phaseLockEnabled ?? CONFIG.defaultPhaseLockEnabled ?? true) !== false;

    // Pre-calculate which bodies are grounded
    const isGrounded = new Map();
    this.bodies.forEach(b => {
      isGrounded.set(b, this.isBodyGrounded(b, groundY));
    });

  let totalJerk = 0;
  let totalActuation = 0;
  let energyUsedThisFrame = 0;
  let groundedMuscles = 0; // Count muscles touching ground for regen bonus

  // Calculate average activation for coordination incentives
  const avgActivation = this.muscles.reduce((sum, m) => sum + Math.abs(m.command || 0), 0) / Math.max(1, this.muscles.length);

  // Phase-locked control pipeline:
  // intent (budget tick) -> carrier -> command (deadband + delta clamp)
  this.muscles.forEach((m) => {
      if (m.intent === undefined) m.intent = 0;
      if (m.command === undefined) m.command = 0;

      const prevCommand = m.command;
      const carrier = phaseLockEnabled ? Math.sin(this.gaitPhase + (m.phaseGroup || 0)) : 1;
      let commanded = m.intent * carrier;
      if (Math.abs(commanded) < commandDeadband) commanded = 0;

      const commandDelta = commanded - prevCommand;
      const clampedDelta = Math.max(-maxCommandDeltaPerStep, Math.min(maxCommandDeltaPerStep, commandDelta));
      m.command = Math.max(-1, Math.min(1, prevCommand + clampedDelta));

      const absDelta = Math.abs(m.command - prevCommand);
      const prevDelta = m.prevCommandDelta || 0;
      if (Math.abs(prevDelta) > 0.002 && Math.abs(clampedDelta) > 0.002 && prevDelta * clampedDelta < 0) {
        m.commandOscillationCount = (m.commandOscillationCount || 0) + 1;
        this._commandOscillationAccum += 1;
      }
      m.prevCommandDelta = clampedDelta;
      m.commandDeltaAbsWindow = (m.commandDeltaAbsWindow || 0) + absDelta;
      this._commandDeltaAbsAccum += absDelta;

      // Track actuation jerk: magnitude of change in final command activation per step.
      const prevAct = m.prevActivation || 0;
      totalJerk += Math.abs(m.command - prevAct);

      // Store for visualization and NN feedback
      m.smoothSignal = m.command;

    // Per-muscle ground contact
    const bodyAGrounded = isGrounded.get(m.bodyA) || false;
    const bodyBGrounded = isGrounded.get(m.bodyB) || false;
    if (bodyAGrounded || bodyBGrounded) groundedMuscles++;

    // Energy system - use final command (what's actually applied) for accurate cost
    let energyMultiplier = 1.0;
    if (this.energy.enabled) {
      const actuationMagnitude = Math.abs(m.command || 0);
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

      const smoothSignal = m.command;
      const targetLength = m.baseLength + (smoothSignal * (smoothSignal > 0 ? extensionRange : contractionRange));

      // Drive muscle through prismatic joint motor only (single actuator path).
      // This avoids double-actuation feedback (joint + external force) that causes vibration/flying artifacts.
      if (m.joint && m.joint.getJointTranslation && m.joint.setMotorSpeed && m.joint.setMaxMotorForce) {
        const targetTranslation = (targetLength - m.baseLength) / SCALE;
        const currentTranslation = m.joint.getJointTranslation();
        const translationError = targetTranslation - currentTranslation;
        const jointSpeed = m.joint.getJointSpeed ? m.joint.getJointSpeed() : 0;

        const motorKp = this.simConfig.muscleMotorKp ?? 8.0;
        const motorKd = this.simConfig.muscleMotorKd ?? 1.8;
        const translationDeadband = 0.003;
        const speedDeadband = 0.04;
        let motorSpeed = (translationError * motorKp) - (jointSpeed * motorKd);

        if (Math.abs(translationError) < translationDeadband && Math.abs(jointSpeed) < speedDeadband) {
          motorSpeed = 0;
        }

        const maxMotorSpeed = this.simConfig.muscleMaxMotorSpeed ?? 2.2;
        motorSpeed = Math.max(-maxMotorSpeed, Math.min(maxMotorSpeed, motorSpeed));

        const baseMotorForce = this.simConfig.muscleMaxMotorForce ?? 35;
        const motorForce = Math.max(0, baseMotorForce * Math.max(0.2, strength * energyMultiplier));

        m.joint.setMaxMotorForce(motorForce);
        m.joint.setMotorSpeed(motorSpeed);
      }
      
      // Store actual physical extension for visualization (not the target)
      // Positive = stretched (extended), Negative = compressed (contracted)
      m.currentExtension = (m.currentLength - m.baseLength) / m.baseLength;

      const prevLengthForDiag = m.prevLengthForDiag ?? m.currentLength;
      const lengthDeltaNorm = Math.abs(m.currentLength - prevLengthForDiag) / Math.max(1, m.baseLength);
      m.prevLengthForDiag = m.currentLength;
      this._lengthDeltaAbsAccum += lengthDeltaNorm;
      this._microActuationAccum += Math.max(0, absDelta - (lengthDeltaNorm * 0.5));

      m.currentSignal = m.command;
      m.prevActivation = m.command; // Store for next frame's NN input
      totalActuation += Math.abs(m.command);
    });

    const controlWindowSec = Math.max(0.0001, this._controlTimeSec);
    this.stats.intentUpdateHz = this._intentUpdateCount / controlWindowSec;
    this.stats.commandOscillationHz = (this._commandOscillationAccum / Math.max(1, this.muscles.length)) / controlWindowSec;
    this.stats.avgCommandDeltaPerSec = this._commandDeltaAbsAccum / controlWindowSec;
    this.stats.microActuationIndex = this._microActuationAccum / Math.max(0.0001, this._commandDeltaAbsAccum);

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
    let center = this.getCenter();
    this.stats.frames++;

    if (this.stats.prevCenter) {
      const dx = center.x - this.stats.prevCenter.x;
      const dy = center.y - this.stats.prevCenter.y;
      const maxHorizontalVelocity = this.simConfig.maxHorizontalVelocity ?? CONFIG.defaultMaxHorizontalVelocity ?? 8;
      const maxVerticalVelocity = this.simConfig.maxVerticalVelocity ?? CONFIG.defaultMaxVerticalVelocity ?? 12;
      const maxDxAllowed = (maxHorizontalVelocity * SCALE * dtSec * 2.5) + 12;
      const maxDyAllowed = (maxVerticalVelocity * SCALE * dtSec * 2.5) + 16;
      const nonFinite = !Number.isFinite(center.x) || !Number.isFinite(center.y);
      const teleportLike = nonFinite || Math.abs(dx) > maxDxAllowed || Math.abs(dy) > maxDyAllowed;

      if (teleportLike) {
        this.stats.teleportViolations += 1;
        center = {
          x: this.stats.prevCenter.x + Math.sign(dx || 1) * Math.min(Math.abs(dx || 0), maxDxAllowed),
          y: this.stats.prevCenter.y + Math.sign(dy || 1) * Math.min(Math.abs(dy || 0), maxDyAllowed)
        };
      }

      const safeDx = center.x - this.stats.prevCenter.x;
      const speed = Math.max(0, safeDx / Math.max(0.0001, dtSec));
      this.stats.speed = this.stats.speed * 0.9 + speed * 0.1;
    }

    this.stats.maxX = Math.max(this.stats.maxX, center.x);
    this.stats.prevCenter = center;

    const onGround = this.bodies.some(b => this.isBodyGrounded(b, groundY));
    if (!onGround) this.stats.airFrames++;
    this.stats.airtimePct = (this.stats.airFrames / Math.max(1, this.stats.frames)) * 100;

    let avgVy = 0;
    let groundedAbsVx = 0;
    let groundedCount = 0;
    const ys = [];

    this.bodies.forEach(b => {
      const vel = b.getLinearVelocity();
      const pos = b.getPosition();
      avgVy += Math.abs(vel.y * SCALE);
      ys.push(pos.y * SCALE);
      if (this.isBodyGrounded(b, groundY)) {
        groundedAbsVx += Math.abs(vel.x * SCALE);
        groundedCount++;
      }
    });

    avgVy /= Math.max(1, this.bodies.length);
    const avgGroundSlip = groundedAbsVx / Math.max(1, groundedCount);
    const groundedRatio = groundedCount / Math.max(1, this.bodies.length);
    this.stats.groundSlip = this.stats.groundSlip * 0.9 + avgGroundSlip * 0.1;
    this.stats.groundedRatio = this.stats.groundedRatio * 0.9 + groundedRatio * 0.1;
    this.stats.groundSlipAccum += avgGroundSlip * groundedRatio * dtSec;
    this.stats.groundedTimeSec += groundedRatio * dtSec;
    this.stats.groundSlipRate = this.stats.groundedTimeSec > 1e-4
      ? this.stats.groundSlipAccum / this.stats.groundedTimeSec
      : 0;
    this.stats.verticalSpeed = this.stats.verticalSpeed * 0.9 + avgVy * 0.1;

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

    // Upright: 0 = collapsed/inverted, 1 = center is 80px above ground
    this.stats.upright = this.stats.upright * 0.9 + heightRatio * 0.1;

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
      upright: Math.max(0, Math.min(1, this.stats.upright)),
      actuationJerk: this.stats.actuationJerk,
      actuationLevel: this.stats.actuationLevel,
      coordinationBonus: Math.max(0, this.stats.coordinationBonus),
      groundSlip: this.stats.groundSlip,
      groundSlipRate: this.stats.groundSlipRate,
      groundedRatio: this.stats.groundedRatio,
      verticalSpeed: this.stats.verticalSpeed,
      energyViolations: this.stats.energyViolations,
      teleportViolations: this.stats.teleportViolations,
      invalidGenome: this.stats.invalidGenome,
      intentUpdateHz: this.stats.intentUpdateHz,
      commandOscillationHz: this.stats.commandOscillationHz,
      avgCommandDeltaPerSec: this.stats.avgCommandDeltaPerSec,
      microActuationIndex: this.stats.microActuationIndex,
      energyEfficiency: this.energy.efficiency,
      maxX: this.stats.maxX
    };
  }

  getX() {
    return this.getCenter().x;
  }

  getCenter() {
    if (!this.bodies.length) {
      if (this.stats.prevCenter) return { ...this.stats.prevCenter };
      return { x: 0, y: 0 };
    }
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
        ctx.lineWidth = 1.5;
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
      const baseWidth = isLeader ? 3 : 1.5;
      const normalizedExt = Math.max(-1, Math.min(1, extension * 3)); // Scale for visual effect
      const thickness = baseWidth * (1.8 - normalizedExt * 0.8); // 2.6x when contracted, 1x when extended
      ctx.lineWidth = Math.max(1, Math.min(7, thickness));

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
      ctx.arc(pos.x * SCALE, pos.y * SCALE, isLeader ? 3.5 : 1.5, 0, Math.PI * 2);
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

}
