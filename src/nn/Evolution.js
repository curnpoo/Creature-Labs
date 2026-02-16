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
    if (!sorted.length) return [];
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
    const dnaLength = sorted[0].dna.length;
    const immigrantCount = Math.max(1, Math.floor(popSize * 0.12));

    // Fill rest via tournament selection + crossover + mutation
    while (nextGen.length < popSize) {
      const slotsLeft = popSize - nextGen.length;
      if (slotsLeft <= immigrantCount) {
        nextGen.push(Evolution.randomDNA(dnaLength));
        continue;
      }
      const parentA = Evolution.tournamentSelect(sorted, tournamentSize);
      const parentB = Evolution.tournamentSelect(sorted, tournamentSize);
      let childDna = Evolution.crossover(parentA.dna, parentB.dna);
      childDna = Evolution.mutate(childDna, effectiveRate, mutationSize, stagnantGens);
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
  static mutate(dna, mutationRate, mutationSize, stagnantGens = 0) {
    const mutated = new Float32Array(dna);
    const resetChance = Math.min(0.2, 0.01 + stagnantGens * 0.01 + mutationRate * 0.05);
    for (let i = 0; i < mutated.length; i++) {
      if (Math.random() < resetChance) {
        mutated[i] = gaussianRandom() * 0.8;
      } else if (Math.random() < mutationRate) {
        mutated[i] += gaussianRandom() * mutationSize * 0.3;
      }
    }
    return mutated;
  }

  static randomDNA(length) {
    const dna = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      dna[i] = gaussianRandom() * 0.8;
    }
    return dna;
  }
}
