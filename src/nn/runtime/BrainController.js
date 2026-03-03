/**
 * Runtime controller interface for creature brains.
 * Implementations must provide deterministic forward evaluation.
 */
export class BrainController {
  /**
   * @param {Float32Array|number[]} _inputs
   * @returns {Float32Array}
   */
  forward(_inputs) {
    throw new Error('BrainController.forward() must be implemented.');
  }

  /**
   * @returns {{controllerType:string,nodeCount:number,connectionCount:number,topoOrderSize:number,activationPolicy:string}}
   */
  getDebugState() {
    return {
      controllerType: 'unknown',
      nodeCount: 0,
      connectionCount: 0,
      topoOrderSize: 0,
      activationPolicy: 'unknown'
    };
  }

  /**
   * @returns {object}
   */
  serialize() {
    return { controllerType: 'unknown' };
  }
}
