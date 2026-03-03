import { BrainController } from './BrainController.js';
import { Genome } from '../neat/Genome.js';

export class NeatBrainController extends BrainController {
  constructor(genome) {
    super();
    this.genome = genome;
  }

  static fromAny(payload) {
    if (!payload) return null;
    if (payload instanceof Genome) return new NeatBrainController(payload);
    const genome = Genome.fromSerializable(payload);
    if (!genome) return null;
    return new NeatBrainController(genome);
  }

  forward(inputs) {
    return this.genome.evaluate(inputs);
  }

  getDebugState() {
    const topo = this.genome._resolveTopologicalOrder ? this.genome._resolveTopologicalOrder() : null;
    return {
      controllerType: 'neat',
      nodeCount: this.genome.nodes.size,
      connectionCount: this.genome.connections.size,
      topoOrderSize: topo?.order?.length || 0,
      activationPolicy: 'fixed:input=linear,hidden=tanh,output=tanh',
      hasCycle: topo?.hasCycle === true
    };
  }

  serialize() {
    return {
      controllerType: 'neat',
      genome: this.genome.toSerializable()
    };
  }
}
