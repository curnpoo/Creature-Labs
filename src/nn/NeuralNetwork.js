/**
 * Feedforward Neural Network with Float32Array weights.
 * Supports arbitrary layer sizes with tanh activation.
 */
export class NeuralNetwork {
  /**
   * @param {number[]} layerSizes - e.g. [14, 10, 4]
   */
  constructor(layerSizes) {
    this.layerSizes = layerSizes;
    this.numLayers = layerSizes.length;
    this.weightCount = this._calcWeightCount();
    this.weights = new Float32Array(this.weightCount);
    this.activations = layerSizes.map(size => new Float32Array(size));
    this._initXavier();
  }

  _calcWeightCount() {
    let count = 0;
    for (let i = 1; i < this.numLayers; i++) {
      // weights + biases for each layer
      count += this.layerSizes[i - 1] * this.layerSizes[i] + this.layerSizes[i];
    }
    return count;
  }

  /** Xavier/Glorot initialization for weights, zero biases */
  _initXavier() {
    let offset = 0;
    for (let i = 1; i < this.numLayers; i++) {
      const fanIn = this.layerSizes[i - 1];
      const fanOut = this.layerSizes[i];
      const numWeights = fanIn * fanOut;
      const std = Math.sqrt(2 / (fanIn + fanOut));

      // Initialize weights with Xavier
      for (let w = 0; w < numWeights; w++) {
        this.weights[offset + w] = gaussianRandom() * std;
      }
      offset += numWeights;

      // Zero biases
      for (let b = 0; b < fanOut; b++) {
        this.weights[offset + b] = 0;
      }
      offset += fanOut;
    }
  }

  /**
   * Forward propagation with tanh activation.
   * Caches activations for visualization.
   * @param {number[]|Float32Array} inputs
   * @returns {Float32Array} output activations
   */
  forward(inputs) {
    const act = this.activations;

    // Copy inputs to first activation layer
    for (let i = 0; i < this.layerSizes[0]; i++) {
      act[0][i] = i < inputs.length ? inputs[i] : 0;
    }

    let offset = 0;
    for (let layer = 1; layer < this.numLayers; layer++) {
      const prevSize = this.layerSizes[layer - 1];
      const currSize = this.layerSizes[layer];
      const prevAct = act[layer - 1];
      const currAct = act[layer];

      for (let j = 0; j < currSize; j++) {
        let sum = 0;
        // Weighted sum
        for (let k = 0; k < prevSize; k++) {
          sum += prevAct[k] * this.weights[offset + j * prevSize + k];
        }
        // Add bias
        sum += this.weights[offset + prevSize * currSize + j];
        // tanh activation
        currAct[j] = Math.tanh(sum);
      }

      offset += prevSize * currSize + currSize;
    }

    return act[this.numLayers - 1];
  }

  getWeightCount() {
    return this.weightCount;
  }

  /** Serialize weights to a plain Float32Array */
  toArray() {
    return new Float32Array(this.weights);
  }

  /** Load weights from a flat Float32Array */
  fromArray(flat) {
    if (flat.length !== this.weightCount) {
      throw new Error(`Weight count mismatch: expected ${this.weightCount}, got ${flat.length}`);
    }
    this.weights.set(flat);
  }

  /** Deep copy */
  clone() {
    const nn = new NeuralNetwork(this.layerSizes.slice());
    nn.weights.set(this.weights);
    return nn;
  }
}

/** Box-Muller transform for gaussian random numbers */
function gaussianRandom() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

export { gaussianRandom };
