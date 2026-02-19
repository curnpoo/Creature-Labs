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

    // Elitism: copy top creatures unchanged (with their architecture)
    const elites = Math.min(eliteCount, sorted.length);
    for (let i = 0; i < elites; i++) {
      nextGen.push({
        dna: new Float32Array(sorted[i].dna),
        architecture: sorted[i].architecture || { hiddenLayers: 1, neuronsPerLayer: 8 }
      });
    }

    // Adaptive mutation rate
    const effectiveRate = Math.min(
      0.95,
      mutationRate + stagnantGens * 0.015
    );
    const dnaLength = sorted[0].dna.length;
    const immigrantCount = Math.max(1, Math.floor(popSize * 0.05)); // Reduced from 12% to 5%

    // Fill rest via tournament selection + crossover + mutation
    while (nextGen.length < popSize) {
      const slotsLeft = popSize - nextGen.length;
      if (slotsLeft <= immigrantCount) {
        // Random immigrant with random architecture
        nextGen.push({
          dna: Evolution.randomDNA(dnaLength),
          architecture: {
            hiddenLayers: Math.floor(Math.random() * 3),
            neuronsPerLayer: 4 + Math.floor(Math.random() * 12)
          }
        });
        continue;
      }
      // Tournament from top 50% of population (preserve good genes)
      const topHalf = sorted.slice(0, Math.ceil(sorted.length * 0.5));
      const parentA = Evolution.tournamentSelect(topHalf, tournamentSize);
      const parentB = Evolution.tournamentSelect(topHalf, tournamentSize);
      // Crossover weighted by fitness (better parent contributes more)
      let childDna = Evolution.crossover(parentA.dna, parentB.dna, parentA.fitness, parentB.fitness);
      childDna = Evolution.mutate(childDna, effectiveRate, mutationSize, stagnantGens);
      
      // Inherit architecture from fitter parent, with small mutation chance
      let childArchitecture = parentA.fitness >= parentB.fitness ? 
        (parentA.architecture || { hiddenLayers: 1, neuronsPerLayer: 8 }) :
        (parentB.architecture || { hiddenLayers: 1, neuronsPerLayer: 8 });
      
      // 5% chance to mutate architecture (conservative)
      if (Math.random() < 0.05) {
        const newLayers = childArchitecture.hiddenLayers + (Math.random() < 0.5 ? -1 : 1);
        childArchitecture = {
          hiddenLayers: Math.max(0, Math.min(6, newLayers)),
          neuronsPerLayer: childArchitecture.neuronsPerLayer
        };
      }
      if (Math.random() < 0.05) {
        const newNeurons = childArchitecture.neuronsPerLayer + (Math.floor(Math.random() * 4) - 2) * 2;
        childArchitecture = {
          hiddenLayers: childArchitecture.hiddenLayers,
          neuronsPerLayer: Math.max(4, Math.min(32, newNeurons))
        };
      }
      
      nextGen.push({
        dna: childDna,
        architecture: childArchitecture
      });
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
   * Winner-dominant crossover: fitter parent contributes 90% of DNA
   * This preserves successful behavior while allowing small variations
   */
  static crossover(dnaA, dnaB, fitnessA = 1, fitnessB = 1) {
    const child = new Float32Array(dnaA.length);
    // Determine which parent is fitter
    const parentAIsFitter = fitnessA >= fitnessB;
    const dominantWeight = 0.90; // Winner contributes 90%
    
    for (let i = 0; i < child.length; i++) {
      // 90% chance to pick from fitter parent, 10% from other
      if (parentAIsFitter) {
        child[i] = Math.random() < dominantWeight ? dnaA[i] : dnaB[i];
      } else {
        child[i] = Math.random() < dominantWeight ? dnaB[i] : dnaA[i];
      }
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
