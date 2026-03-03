import { BrainController } from './BrainController.js';
import { NeuralNetwork } from '../NeuralNetwork.js';

export class DenseBrainController extends BrainController {
  constructor(layerSizes, weights = null, net = null) {
    super();
    this.net = net || new NeuralNetwork(layerSizes);
    if (!net && weights instanceof Float32Array && weights.length === this.net.getWeightCount()) {
      this.net.fromArray(weights);
    }
  }

  forward(inputs) {
    return this.net.forward(inputs);
  }

  getDebugState() {
    return {
      controllerType: 'dense',
      nodeCount: this.net.layerSizes.reduce((sum, n) => sum + n, 0),
      connectionCount: this.net.getWeightCount(),
      topoOrderSize: this.net.layerSizes.slice(1).reduce((sum, n) => sum + n, 0),
      activationPolicy: 'fixed:tanh'
    };
  }

  serialize() {
    return {
      controllerType: 'dense',
      layerSizes: this.net.layerSizes.slice(),
      denseWeights: Array.from(this.net.toArray())
    };
  }
}
