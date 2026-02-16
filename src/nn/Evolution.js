import { gaussianRandom } from './NeuralNetwork.js';

/**
 * Neuroevolution engine: tournament selection, crossover, mutation, elitism.
 */
export class Evolution {
  /**
   * Evolve next generation of DNA (weight arrays).
   * @param {object[]} creatures - Array of { dna: Float32Array, fitness: number }
   * @param {number} popSize - Target population size
   * @param {object} config - { mutationRate, mutationSize, eliteCount, tournamentSize, stagnantGens }
   * @returns {Float32Array[]} Array of new DNA arrays
   */
  static evolve(creatures, popSize, config) {
    const {
      mutationRate = 0.08,
      mutationSize = 1.0,
      eliteCount = 2,
      tournamentSize = 3,
      stagnantGens = 0
    } = config;

    // Sort by fitness descending
    const sorted = creatures.slice().sort((a, b) => b.fitness - a.fitness);
    const nextGen = [];

    // Elitism: copy top creatures unchanged
    const elites = Math.min(eliteCount, sorted.length);
    for (let i = 0; i < elites; i++) {
      nextGen.push(new Float32Array(sorted[i].dna));
    }

    // Adaptive mutation rate
    const effectiveRate = Math.min(
      0.95,
      mutationRate + stagnantGens * 0.015
    );

    // Fill rest via tournament selection + crossover + mutation
    while (nextGen.length < popSize) {
      const parentA = Evolution.tournamentSelect(sorted, tournamentSize);
      const parentB = Evolution.tournamentSelect(sorted, tournamentSize);
      let childDna = Evolution.crossover(parentA.dna, parentB.dna);
      childDna = Evolution.mutate(childDna, effectiveRate, mutationSize);
      nextGen.push(childDna);
    }

    return nextGen;
  }

  /**
   * Tournament selection: pick tournamentSize random creatures, return best.
   */
  static tournamentSelect(sorted, tournamentSize) {
    let best = null;
    for (let i = 0; i < tournamentSize; i++) {
      const idx = Math.floor(Math.random() * sorted.length);
      const candidate = sorted[idx];
      if (!best || candidate.fitness > best.fitness) {
        best = candidate;
      }
    }
    return best;
  }

  /**
   * Uniform crossover: for each weight, 50% chance from parent A or B.
   */
  static crossover(dnaA, dnaB) {
    const child = new Float32Array(dnaA.length);
    for (let i = 0; i < child.length; i++) {
      child[i] = Math.random() < 0.5 ? dnaA[i] : dnaB[i];
    }
    return child;
  }

  /**
   * Gaussian mutation: each weight has mutationRate chance of += N(0, mutationSize).
   */
  static mutate(dna, mutationRate, mutationSize) {
    const mutated = new Float32Array(dna);
    for (let i = 0; i < mutated.length; i++) {
      if (Math.random() < mutationRate) {
        mutated[i] += gaussianRandom() * mutationSize * 0.3;
      }
    }
    return mutated;
  }
}
