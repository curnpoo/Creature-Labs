class InnovationTracker {
  constructor() {
    this.reset();
  }

  reset() {
    this._nextInnovation = 1;
    this._nextNodeId = 1;
    this._connectionInnovations = new Map();
    this._splitNodeIds = new Map();
  }

  /**
   * Ensure node IDs start after fixed IO nodes.
   * @param {number} maxReservedNodeId
   */
  reserveNodeIds(maxReservedNodeId) {
    if (maxReservedNodeId + 1 > this._nextNodeId) {
      this._nextNodeId = maxReservedNodeId + 1;
    }
  }

  /**
   * @returns {number}
   */
  nextNodeId() {
    const id = this._nextNodeId;
    this._nextNodeId += 1;
    return id;
  }

  /**
   * @param {number} inNode
   * @param {number} outNode
   * @returns {number}
   */
  getConnectionInnovation(inNode, outNode) {
    const key = `${inNode}->${outNode}`;
    if (this._connectionInnovations.has(key)) {
      return this._connectionInnovations.get(key);
    }
    const innovation = this._nextInnovation;
    this._nextInnovation += 1;
    this._connectionInnovations.set(key, innovation);
    return innovation;
  }

  /**
   * NEAT split mutation reuses the same inserted hidden node for the same historical split.
   * @param {number} connectionInnovation
   * @returns {number}
   */
  getSplitNodeId(connectionInnovation) {
    if (this._splitNodeIds.has(connectionInnovation)) {
      return this._splitNodeIds.get(connectionInnovation);
    }
    const nodeId = this.nextNodeId();
    this._splitNodeIds.set(connectionInnovation, nodeId);
    return nodeId;
  }

  snapshot() {
    return {
      nextInnovation: this._nextInnovation,
      nextNodeId: this._nextNodeId,
      knownConnections: this._connectionInnovations.size,
      knownSplits: this._splitNodeIds.size
    };
  }
}

// Module-level singleton state keeps innovations deterministic across generations.
const GLOBAL_INNOVATION_TRACKER = new InnovationTracker();

export function getInnovationTracker() {
  return GLOBAL_INNOVATION_TRACKER;
}
