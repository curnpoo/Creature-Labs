export const NODE_TYPES = {
  INPUT: 'input',
  HIDDEN: 'hidden',
  OUTPUT: 'output'
};

export const ACTIVATIONS = {
  TANH: 'tanh',
  SIGMOID: 'sigmoid',
  RELU: 'relu',
  LINEAR: 'linear'
};

/**
 * @param {string} activation
 * @param {number} x
 * @returns {number}
 */
export function applyActivation(activation, x) {
  switch (activation) {
    case ACTIVATIONS.SIGMOID:
      return 1 / (1 + Math.exp(-x));
    case ACTIVATIONS.RELU:
      return Math.max(0, x);
    case ACTIVATIONS.LINEAR:
      return x;
    case ACTIVATIONS.TANH:
    default:
      return Math.tanh(x);
  }
}

/**
 * @param {number} id
 * @param {string} type
 * @param {number} layer
 * @param {string} activation
 * @returns {{id:number,type:string,layer:number,activation:string,bias:number}}
 */
export function createNodeGene(id, type, layer, activation = ACTIVATIONS.TANH) {
  return {
    id,
    type,
    layer,
    activation,
    bias: 0
  };
}

/**
 * @param {number} inNode
 * @param {number} outNode
 * @param {number} weight
 * @param {number} innovation
 * @param {boolean} enabled
 * @returns {{inNode:number,outNode:number,weight:number,innovation:number,enabled:boolean}}
 */
export function createConnectionGene(inNode, outNode, weight, innovation, enabled = true) {
  return {
    inNode,
    outNode,
    weight,
    innovation,
    enabled
  };
}
