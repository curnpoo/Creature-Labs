import { gaussianRandom } from '../NeuralNetwork.js';
import { ACTIVATIONS, NODE_TYPES, applyActivation, createConnectionGene, createNodeGene } from './genes.js';

const LAYER_EPSILON = 1e-6;

/**
 * NEAT genome with node/connection genes and acyclic feed-forward evaluation.
 */
export class Genome {
  /**
   * @param {number} id
   * @param {number[]} inputIds
   * @param {number[]} outputIds
   */
  constructor(id, inputIds = [], outputIds = []) {
    this.id = id;
    this.inputIds = inputIds.slice();
    this.outputIds = outputIds.slice();
    this.nodes = new Map();
    this.connections = new Map();
    this.fitness = 0;
    this.adjustedFitness = 0;
    this.parentIds = [null, null];
    this.generationBorn = 0;
    this.speciesId = null;
    this._topoCacheKey = null;
    this._topoOrder = null;
    this._hasCycle = false;
    this._lastValues = null;
  }

  /**
   * @param {number} id
   * @param {number} inputCount
   * @param {number} outputCount
   * @param {import('./InnovationTracker.js').getInnovationTracker} tracker
   * @param {object} [config]
   * @returns {Genome}
   */
  static createMinimal(id, inputCount, outputCount, tracker, config = {}) {
    const inputIds = [];
    const outputIds = [];
    for (let i = 0; i < inputCount; i++) inputIds.push(i + 1);
    for (let i = 0; i < outputCount; i++) outputIds.push(inputCount + i + 1);
    tracker.reserveNodeIds(inputCount + outputCount);

    const genome = new Genome(id, inputIds, outputIds);
    for (let i = 0; i < inputIds.length; i++) {
      genome.nodes.set(inputIds[i], createNodeGene(inputIds[i], NODE_TYPES.INPUT, 0, ACTIVATIONS.LINEAR));
    }
    for (let i = 0; i < outputIds.length; i++) {
      genome.nodes.set(outputIds[i], createNodeGene(outputIds[i], NODE_TYPES.OUTPUT, 1, ACTIVATIONS.TANH));
    }

    const initDensity = Number.isFinite(config.initialConnectionDensity)
      ? Math.max(0, Math.min(1, config.initialConnectionDensity))
      : 1;
    for (let i = 0; i < inputIds.length; i++) {
      for (let j = 0; j < outputIds.length; j++) {
        if (Math.random() > initDensity) continue;
        const inNode = inputIds[i];
        const outNode = outputIds[j];
        const innovation = tracker.getConnectionInnovation(inNode, outNode);
        const weight = gaussianRandom() * (Number.isFinite(config.initialWeightStd) ? config.initialWeightStd : 0.6);
        genome.connections.set(innovation, createConnectionGene(inNode, outNode, weight, innovation, true));
      }
    }

    return genome;
  }

  clone(newId = this.id) {
    const cloned = new Genome(newId, this.inputIds, this.outputIds);
    this.nodes.forEach((node) => {
      cloned.nodes.set(node.id, { ...node });
    });
    this.connections.forEach((conn) => {
      cloned.connections.set(conn.innovation, { ...conn });
    });
    cloned.fitness = this.fitness;
    cloned.adjustedFitness = this.adjustedFitness;
    cloned.parentIds = Array.isArray(this.parentIds) ? [...this.parentIds] : [null, null];
    cloned.generationBorn = this.generationBorn;
    cloned.speciesId = this.speciesId;
    return cloned;
  }

  /**
   * Feed-forward evaluation over layer-ordered graph.
   * @param {number[]|Float32Array} inputs
   * @returns {Float32Array}
   */
  evaluate(inputs) {
    const values = new Map();
    for (let i = 0; i < this.inputIds.length; i++) {
      values.set(this.inputIds[i], i < inputs.length ? inputs[i] : 0);
    }

    const incoming = this._buildIncomingConnectionIndex();
    const topo = this._resolveTopologicalOrder();
    if (!topo || topo.hasCycle) {
      this._hasCycle = true;
      this._lastValues = new Map(values);
      return new Float32Array(this.outputIds.length);
    }
    this._hasCycle = false;
    const ordered = topo.order;

    for (let i = 0; i < ordered.length; i++) {
      const node = ordered[i];
      const list = incoming.get(node.id) || [];
      let sum = node.bias || 0;
      for (let j = 0; j < list.length; j++) {
        const conn = list[j];
        if (!conn.enabled) continue;
        sum += (values.get(conn.inNode) || 0) * conn.weight;
      }
      values.set(node.id, applyActivation(node.activation, sum));
    }

    const out = new Float32Array(this.outputIds.length);
    for (let i = 0; i < this.outputIds.length; i++) {
      out[i] = values.get(this.outputIds[i]) || 0;
    }
    this._lastValues = new Map(values);
    return out;
  }

  _structureCacheKey() {
    const nodeIds = Array.from(this.nodes.keys()).sort((a, b) => a - b).join(',');
    const enabled = Array.from(this.connections.values())
      .filter(conn => conn.enabled)
      .sort((a, b) => a.innovation - b.innovation)
      .map(conn => `${conn.innovation}:${conn.inNode}->${conn.outNode}`)
      .join('|');
    return `${nodeIds}::${enabled}`;
  }

  _resolveTopologicalOrder() {
    const key = this._structureCacheKey();
    if (this._topoCacheKey === key && Array.isArray(this._topoOrder)) {
      return { order: this._topoOrder, hasCycle: this._hasCycle };
    }

    const nonInputNodes = Array.from(this.nodes.values())
      .filter(node => node.type !== NODE_TYPES.INPUT)
      .sort((a, b) => a.id - b.id);
    const indegree = new Map();
    const outgoing = new Map();
    nonInputNodes.forEach(node => indegree.set(node.id, 0));
    this.connections.forEach(conn => {
      if (!conn.enabled) return;
      if (!this.nodes.has(conn.inNode) || !this.nodes.has(conn.outNode)) return;
      if (!outgoing.has(conn.inNode)) outgoing.set(conn.inNode, []);
      outgoing.get(conn.inNode).push(conn.outNode);
      // Input nodes are fixed sources (values are provided externally).
      // They are not part of the evaluation queue, so edges from inputs
      // must not contribute to in-degree or every output appears cyclic.
      if (indegree.has(conn.outNode) && indegree.has(conn.inNode)) {
        indegree.set(conn.outNode, indegree.get(conn.outNode) + 1);
      }
    });

    const queue = nonInputNodes
      .filter(node => (indegree.get(node.id) || 0) === 0)
      .map(node => node.id)
      .sort((a, b) => a - b);
    const orderIds = [];

    while (queue.length) {
      const nodeId = queue.shift();
      orderIds.push(nodeId);
      const next = outgoing.get(nodeId) || [];
      next.sort((a, b) => a - b);
      for (let i = 0; i < next.length; i++) {
        const childId = next[i];
        if (!indegree.has(childId)) continue;
        const d = (indegree.get(childId) || 0) - 1;
        indegree.set(childId, d);
        if (d === 0) {
          queue.push(childId);
          queue.sort((a, b) => a - b);
        }
      }
    }

    const hasCycle = orderIds.length !== nonInputNodes.length;
    const order = hasCycle
      ? nonInputNodes
      : orderIds.map(id => this.nodes.get(id)).filter(Boolean);
    this._topoCacheKey = key;
    this._topoOrder = order;
    this._hasCycle = hasCycle;
    return { order, hasCycle };
  }

  /**
   * @param {object} tracker
   * @param {object} config
   */
  mutate(tracker, config = {}) {
    const weightMutRate = config.neatWeightMutRate ?? 0.9;
    const addNodeRate = config.neatAddNodeRate ?? 0.03;
    const addConnRate = config.neatAddConnRate ?? 0.08;
    const toggleRate = config.neatToggleRate ?? 0.02;

    if (Math.random() < weightMutRate) {
      this.mutateWeights(config);
    }
    if (Math.random() < addConnRate) {
      this.mutateAddConnection(tracker, config);
    }
    if (Math.random() < addNodeRate) {
      this.mutateAddNode(tracker, config);
    }
    if (Math.random() < toggleRate) {
      this.mutateToggleConnection(config);
    }
  }

  mutateWeights(config = {}) {
    const perturbRate = config.neatWeightPerturbRate ?? 0.9;
    const perturbStd = config.neatWeightPerturbStd ?? 0.35;
    const resetStd = config.neatWeightResetStd ?? 1.0;

    this.connections.forEach((conn) => {
      if (Math.random() < perturbRate) {
        conn.weight += gaussianRandom() * perturbStd;
      } else {
        conn.weight = gaussianRandom() * resetStd;
      }
    });

    this.nodes.forEach((node) => {
      if (node.type === NODE_TYPES.INPUT) return;
      if (Math.random() < (config.neatBiasMutRate ?? 0.2)) {
        node.bias += gaussianRandom() * (config.neatBiasPerturbStd ?? 0.1);
      }
    });
  }

  mutateAddConnection(tracker, config = {}) {
    const nodes = Array.from(this.nodes.values());
    if (nodes.length < 2) return false;

    const enabledPairs = new Set();
    this.connections.forEach((conn) => {
      if (!conn.enabled) return;
      enabledPairs.add(`${conn.inNode}->${conn.outNode}`);
    });

    const candidates = [];
    for (let i = 0; i < nodes.length; i++) {
      const from = nodes[i];
      if (from.type === NODE_TYPES.OUTPUT) continue;
      for (let j = 0; j < nodes.length; j++) {
        const to = nodes[j];
        if (to.type === NODE_TYPES.INPUT) continue;
        if (from.id === to.id) continue;
        if (from.layer + LAYER_EPSILON >= to.layer) continue;
        const key = `${from.id}->${to.id}`;
        if (enabledPairs.has(key)) continue;
        candidates.push([from, to]);
      }
    }

    if (!candidates.length) return false;
    const [from, to] = candidates[Math.floor(Math.random() * candidates.length)];
    const innovation = tracker.getConnectionInnovation(from.id, to.id);
    this.connections.set(
      innovation,
      createConnectionGene(from.id, to.id, gaussianRandom() * (config.initialWeightStd || 1), innovation, true)
    );
    return true;
  }

  mutateAddNode(tracker, config = {}) {
    const enabledConnections = Array.from(this.connections.values()).filter((conn) => conn.enabled);
    if (!enabledConnections.length) return false;

    const target = enabledConnections[Math.floor(Math.random() * enabledConnections.length)];
    target.enabled = false;

    const splitNodeId = tracker.getSplitNodeId(target.innovation);
    let node = this.nodes.get(splitNodeId);

    const from = this.nodes.get(target.inNode);
    const to = this.nodes.get(target.outNode);
    const targetLayer = (from.layer + to.layer) / 2;

    if (!node) {
      node = createNodeGene(splitNodeId, NODE_TYPES.HIDDEN, targetLayer, ACTIVATIONS.TANH);
      node.bias = 0;
      this.nodes.set(splitNodeId, node);
    }

    if (Math.abs(to.layer - from.layer) <= LAYER_EPSILON * 4) {
      this._nudgeLayersAfterSplit(to.id, config.neatLayerNudge ?? 0.05);
      node.layer = (this.nodes.get(target.inNode).layer + this.nodes.get(target.outNode).layer) / 2;
    }

    const inInnovation = tracker.getConnectionInnovation(target.inNode, splitNodeId);
    const outInnovation = tracker.getConnectionInnovation(splitNodeId, target.outNode);

    this.connections.set(inInnovation, createConnectionGene(target.inNode, splitNodeId, 1, inInnovation, true));
    this.connections.set(outInnovation, createConnectionGene(splitNodeId, target.outNode, target.weight, outInnovation, true));

    return true;
  }

  mutateToggleConnection(config = {}) {
    const genes = Array.from(this.connections.values());
    if (!genes.length) return false;
    const enabled = genes.filter(g => g.enabled !== false);
    const disabled = genes.filter(g => g.enabled === false);
    const enabledRatio = enabled.length / genes.length;
    const sparseTarget = Number.isFinite(config.neatSparseEnabledTarget)
      ? Math.max(0.05, Math.min(0.95, config.neatSparseEnabledTarget))
      : 0.45;
    const reenableBias = Number.isFinite(config.neatReenableBias)
      ? Math.max(0, Math.min(1, config.neatReenableBias))
      : 0.8;

    let conn = null;
    if (disabled.length && (enabledRatio < sparseTarget || Math.random() < reenableBias)) {
      conn = disabled[Math.floor(Math.random() * disabled.length)];
      conn.enabled = true;
      return true;
    }

    if (enabled.length) {
      conn = enabled[Math.floor(Math.random() * enabled.length)];
      conn.enabled = false;
      return true;
    }

    conn = disabled[Math.floor(Math.random() * disabled.length)];
    conn.enabled = true;
    return true;
  }

  /**
   * NEAT compatibility distance.
   * @param {Genome} a
   * @param {Genome} b
   * @param {object} [config]
   * @returns {number}
   */
  static compatibilityDistance(a, b, config = {}) {
    const c1 = config.neatC1 ?? 1.0;
    const c2 = config.neatC2 ?? 1.0;
    const c3 = config.neatC3 ?? 0.4;

    const genesA = Array.from(a.connections.values()).sort((x, y) => x.innovation - y.innovation);
    const genesB = Array.from(b.connections.values()).sort((x, y) => x.innovation - y.innovation);

    let i = 0;
    let j = 0;
    let excess = 0;
    let disjoint = 0;
    let matching = 0;
    let weightDiff = 0;

    const maxA = genesA.length ? genesA[genesA.length - 1].innovation : 0;
    const maxB = genesB.length ? genesB[genesB.length - 1].innovation : 0;

    while (i < genesA.length && j < genesB.length) {
      const ga = genesA[i];
      const gb = genesB[j];
      if (ga.innovation === gb.innovation) {
        matching += 1;
        weightDiff += Math.abs(ga.weight - gb.weight);
        i += 1;
        j += 1;
      } else if (ga.innovation < gb.innovation) {
        if (ga.innovation > maxB) excess += 1;
        else disjoint += 1;
        i += 1;
      } else {
        if (gb.innovation > maxA) excess += 1;
        else disjoint += 1;
        j += 1;
      }
    }

    excess += genesA.length - i;
    excess += genesB.length - j;

    const n = Math.max(1, Math.max(genesA.length, genesB.length));
    const avgWeightDiff = matching > 0 ? weightDiff / matching : 0;

    return c1 * (excess / n) + c2 * (disjoint / n) + c3 * avgWeightDiff;
  }

  /**
   * Innovation-aligned crossover. Parent A should be fitter.
   * @param {Genome} parentA
   * @param {Genome} parentB
   * @param {number} childId
   * @param {object} [config]
   * @returns {Genome}
   */
  static crossover(parentA, parentB, childId, config = {}) {
    const child = new Genome(childId, parentA.inputIds, parentA.outputIds);

    const nodeSources = [parentA.nodes, parentB.nodes];
    for (let i = 0; i < nodeSources.length; i++) {
      nodeSources[i].forEach((node) => {
        if (!child.nodes.has(node.id)) child.nodes.set(node.id, { ...node });
      });
    }

    const aGenes = new Map(parentA.connections);
    const bGenes = new Map(parentB.connections);
    const allInnovations = Array.from(new Set([...aGenes.keys(), ...bGenes.keys()])).sort((x, y) => x - y);

    for (let i = 0; i < allInnovations.length; i++) {
      const innovation = allInnovations[i];
      const ga = aGenes.get(innovation);
      const gb = bGenes.get(innovation);
      let chosen = null;

      if (ga && gb) {
        chosen = Math.random() < 0.5 ? ga : gb;
      } else if (ga) {
        chosen = ga;
      } else {
        if (parentA.fitness > parentB.fitness) {
          continue;
        }
        // Equal-fitness tie can take less-fit-side-only genes.
        chosen = gb;
      }

      const gene = { ...chosen };
      if ((!ga?.enabled || !gb?.enabled) && Math.random() < (config.neatDisableInheritedRate ?? 0.75)) {
        gene.enabled = false;
      }
      child.connections.set(gene.innovation, gene);
    }

    child._removeDanglingConnections();
    child.parentIds = [parentA.id, parentB.id];
    return child;
  }

  _orderedNonInputNodes() {
    return Array.from(this.nodes.values())
      .filter((node) => node.type !== NODE_TYPES.INPUT)
      .sort((a, b) => {
        if (a.layer !== b.layer) return a.layer - b.layer;
        return a.id - b.id;
      });
  }

  _buildIncomingConnectionIndex() {
    const incoming = new Map();
    this.connections.forEach((conn) => {
      if (!incoming.has(conn.outNode)) incoming.set(conn.outNode, []);
      incoming.get(conn.outNode).push(conn);
    });
    return incoming;
  }

  _removeDanglingConnections() {
    this.connections.forEach((conn, innovation) => {
      if (!this.nodes.has(conn.inNode) || !this.nodes.has(conn.outNode)) {
        this.connections.delete(innovation);
      }
    });
  }

  _nudgeLayersAfterSplit(outputNodeId, amount) {
    this.nodes.forEach((node) => {
      if (node.id === outputNodeId || node.layer >= this.nodes.get(outputNodeId).layer) {
        node.layer += amount;
      }
    });
  }

  /**
   * Lightweight genome payload for persistence/interop.
   * @returns {Float32Array}
   */
  toDNA() {
    const nodeList = Array.from(this.nodes.values()).sort((a, b) => a.id - b.id);
    const connList = Array.from(this.connections.values()).sort((a, b) => a.innovation - b.innovation);

    const packed = [];
    packed.push(nodeList.length, connList.length, this.inputIds.length, this.outputIds.length);
    for (let i = 0; i < this.inputIds.length; i++) packed.push(this.inputIds[i]);
    for (let i = 0; i < this.outputIds.length; i++) packed.push(this.outputIds[i]);
    for (let i = 0; i < nodeList.length; i++) {
      const n = nodeList[i];
      packed.push(n.id, n.layer, n.bias, n.type === NODE_TYPES.INPUT ? 0 : n.type === NODE_TYPES.OUTPUT ? 2 : 1, n.activation === ACTIVATIONS.TANH ? 0 : n.activation === ACTIVATIONS.SIGMOID ? 1 : n.activation === ACTIVATIONS.RELU ? 2 : 3);
    }
    for (let i = 0; i < connList.length; i++) {
      const c = connList[i];
      packed.push(c.innovation, c.inNode, c.outNode, c.weight, c.enabled ? 1 : 0);
    }

    return new Float32Array(packed);
  }

  toSerializable() {
    return {
      id: this.id,
      inputIds: this.inputIds.slice(),
      outputIds: this.outputIds.slice(),
      nodes: Array.from(this.nodes.values())
        .map(node => ({ ...node }))
        .sort((a, b) => a.id - b.id),
      connections: Array.from(this.connections.values())
        .map(conn => ({ ...conn }))
        .sort((a, b) => a.innovation - b.innovation),
      fitness: Number(this.fitness) || 0,
      adjustedFitness: Number(this.adjustedFitness) || 0,
      parentIds: Array.isArray(this.parentIds) ? [...this.parentIds] : [null, null],
      generationBorn: Number.isFinite(this.generationBorn) ? this.generationBorn : 0,
      speciesId: Number.isFinite(this.speciesId) ? this.speciesId : null
    };
  }

  static fromSerializable(payload) {
    if (!payload || !Number.isFinite(payload.id)) return null;
    const genome = new Genome(
      payload.id,
      Array.isArray(payload.inputIds) ? payload.inputIds.map(v => Number(v)).filter(Number.isFinite) : [],
      Array.isArray(payload.outputIds) ? payload.outputIds.map(v => Number(v)).filter(Number.isFinite) : []
    );
    if (Array.isArray(payload.nodes)) {
      payload.nodes.forEach(node => {
        if (!node || !Number.isFinite(node.id)) return;
        genome.nodes.set(node.id, {
          id: Number(node.id),
          type: node.type,
          layer: Number(node.layer) || 0,
          activation: node.activation || ACTIVATIONS.TANH,
          bias: Number(node.bias) || 0
        });
      });
    }
    if (Array.isArray(payload.connections)) {
      payload.connections.forEach(conn => {
        if (!conn || !Number.isFinite(conn.innovation)) return;
        genome.connections.set(conn.innovation, {
          inNode: Number(conn.inNode),
          outNode: Number(conn.outNode),
          weight: Number(conn.weight) || 0,
          innovation: Number(conn.innovation),
          enabled: conn.enabled !== false
        });
      });
    }
    genome.fitness = Number(payload.fitness) || 0;
    genome.adjustedFitness = Number(payload.adjustedFitness) || 0;
    genome.parentIds = Array.isArray(payload.parentIds) ? [payload.parentIds[0] ?? null, payload.parentIds[1] ?? null] : [null, null];
    genome.generationBorn = Number.isFinite(payload.generationBorn) ? payload.generationBorn : 0;
    genome.speciesId = Number.isFinite(payload.speciesId) ? payload.speciesId : null;
    return genome;
  }
}
