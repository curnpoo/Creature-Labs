import { gaussianRandom } from './NeuralNetwork.js';

const MIN_LAYERS = 2;
const MAX_LAYERS = 8;
const MIN_NEURONS = 2;
const MAX_NEURONS = 64;

/**
 * Compatibility topology network used by legacy tests/utilities.
 * DNA format: [numLayers, ...layerSizes, ...weightsAndBiases]
 */
export class TopologyNeuralNetwork {
  /**
   * @param {number[]|Float32Array} architectureOrDna
   */
  constructor(architectureOrDna) {
    if (!architectureOrDna || architectureOrDna.length < MIN_LAYERS) {
      throw new Error('TopologyNeuralNetwork requires layer sizes or valid DNA');
    }

    if (TopologyNeuralNetwork._looksLikeDna(architectureOrDna)) {
      this._fromDNA(architectureOrDna);
    } else {
      this.layerSizes = Array.from(architectureOrDna).map(v => Math.max(MIN_NEURONS, Math.round(v)));
      this.numLayers = this.layerSizes.length;
      this.weightCount = this._calcWeightCount();
      this.weights = new Float32Array(this.weightCount);
      this.activations = this.layerSizes.map(size => new Float32Array(size));
      this._initXavier();
    }
  }

  static _looksLikeDna(arr) {
    const numLayers = Math.round(Number(arr[0]));
    if (!Number.isFinite(numLayers) || numLayers < MIN_LAYERS || numLayers > MAX_LAYERS) return false;
    if (arr.length <= numLayers) return false;
    const layerSizes = Array.from(arr.slice(1, 1 + numLayers)).map(v => Math.round(v));
    if (layerSizes.some(v => !Number.isFinite(v) || v < MIN_NEURONS || v > MAX_NEURONS)) return false;
    const expected = TopologyNeuralNetwork._weightCountFor(layerSizes);
    return arr.length === 1 + numLayers + expected;
  }

  static _weightCountFor(layerSizes) {
    let count = 0;
    for (let i = 1; i < layerSizes.length; i++) {
      count += layerSizes[i - 1] * layerSizes[i] + layerSizes[i];
    }
    return count;
  }

  _fromDNA(dna) {
    const numLayers = Math.round(dna[0]);
    this.layerSizes = Array.from(dna.slice(1, 1 + numLayers)).map(v => Math.round(v));
    this.numLayers = this.layerSizes.length;
    this.weightCount = this._calcWeightCount();
    this.weights = new Float32Array(this.weightCount);
    this.weights.set(dna.slice(1 + this.numLayers, 1 + this.numLayers + this.weightCount));
    this.activations = this.layerSizes.map(size => new Float32Array(size));
  }

  _calcWeightCount() {
    return TopologyNeuralNetwork._weightCountFor(this.layerSizes);
  }

  _initXavier() {
    let offset = 0;
    for (let i = 1; i < this.numLayers; i++) {
      const fanIn = this.layerSizes[i - 1];
      const fanOut = this.layerSizes[i];
      const numWeights = fanIn * fanOut;
      const std = Math.sqrt(2 / (fanIn + fanOut));

      for (let w = 0; w < numWeights; w++) {
        this.weights[offset + w] = gaussianRandom() * std;
      }
      offset += numWeights;

      for (let b = 0; b < fanOut; b++) {
        this.weights[offset + b] = 0;
      }
      offset += fanOut;
    }
  }

  getInputSize() {
    return this.layerSizes[0] || 0;
  }

  getOutputSize() {
    return this.layerSizes[this.layerSizes.length - 1] || 0;
  }

  /**
   * @param {number[]|Float32Array} inputs
   * @returns {Float32Array}
   */
  forward(inputs) {
    const act = this.activations;

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
        for (let k = 0; k < prevSize; k++) {
          sum += prevAct[k] * this.weights[offset + j * prevSize + k];
        }
        sum += this.weights[offset + prevSize * currSize + j];
        currAct[j] = Math.tanh(sum);
      }

      offset += prevSize * currSize + currSize;
    }

    return act[this.numLayers - 1];
  }

  toDNA() {
    const dna = new Float32Array(1 + this.numLayers + this.weightCount);
    dna[0] = this.numLayers;
    dna.set(this.layerSizes, 1);
    dna.set(this.weights, 1 + this.numLayers);
    return dna;
  }

  mutateAddLayer() {
    if (this.numLayers >= MAX_LAYERS) return null;
    const insertIndex = 1 + Math.floor(Math.random() * (this.numLayers - 1));
    const before = this.layerSizes[insertIndex - 1];
    const after = this.layerSizes[insertIndex];
    const inserted = Math.max(MIN_NEURONS, Math.round((before + after) / 2));
    const next = this.layerSizes.slice();
    next.splice(insertIndex, 0, inserted);
    return new TopologyNeuralNetwork(next);
  }

  mutateAddNeurons() {
    if (this.numLayers <= 2) {
      return this.mutateAddLayer();
    }
    const hiddenIndex = 1 + Math.floor(Math.random() * (this.numLayers - 2));
    if (this.layerSizes[hiddenIndex] >= MAX_NEURONS) return null;
    const next = this.layerSizes.slice();
    next[hiddenIndex] = Math.min(MAX_NEURONS, next[hiddenIndex] + 1 + Math.floor(Math.random() * 3));
    return new TopologyNeuralNetwork(next);
  }
}

/**
 * Legacy topology crossover helper for tests/tools.
 * @param {TopologyNeuralNetwork} parentA
 * @param {TopologyNeuralNetwork} parentB
 * @returns {TopologyNeuralNetwork}
 */
export function topologyCrossover(parentA, parentB) {
  const chosenLayers = Math.random() < 0.5 ? parentA.layerSizes.slice() : parentB.layerSizes.slice();
  const child = new TopologyNeuralNetwork(chosenLayers);
  const min = Math.min(child.weights.length, parentA.weights.length, parentB.weights.length);
  for (let i = 0; i < min; i++) {
    child.weights[i] = Math.random() < 0.5 ? parentA.weights[i] : parentB.weights[i];
  }
  return child;
}

export { gaussianRandom };
