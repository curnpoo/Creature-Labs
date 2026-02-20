import { gaussianRandom } from './NeuralNetwork.js';

/**
 * Enhanced Evolution Strategy with:
 * 1. Top-N parent selection (weighted toward winner)
 * 2. Uniform crossover for genetic diversity
 * 3. Stagnation diversity injection
 * 4. Improved exploration through multiple parents
 */
export class Evolution {
  /**
   * Evolve next generation of DNA (weight arrays).
   * @param {object[]} creatures - Array of { dna: Float32Array, fitness: number, architecture: object }
   * @param {number} popSize - Target population size
   * @param {object} config - { mutationRate, mutationSize, eliteCount, stagnantGens }
   * @returns {object[]} Array of { dna: Float32Array, architecture: object }
   */
  static evolve(creatures, popSize, config) {
    const {
      mutationRate = 0.10,    // 10% chance to mutate each weight
      mutationSize = 0.7,      // Strong mutations for early training
      eliteCount = 1,          // Winner only
      stagnantGens = 0         // Number of stagnant generations
    } = config;

    // Sort by fitness descending
    const sorted = creatures.slice().sort((a, b) => b.fitness - a.fitness);
    if (!sorted.length) return [];

    const winner = sorted[0];
    const winnerDna = winner.dna;
    const winnerArch = winner.architecture || { hiddenLayers: 1, neuronsPerLayer: 8 };
    const dnaLength = winnerDna.length;

    const nextGen = [];

    // 1. ELITE: Winner unchanged (guaranteed to next gen)
    nextGen.push({
      dna: new Float32Array(winnerDna),
      architecture: winnerArch
    });

    // 2. CLONES: Top 50% of population (excluding winner) - exact copies
    const cloneCount = Math.floor(popSize * 0.5) - 1; // -1 because winner already added
    for (let i = 1; i <= cloneCount && i < sorted.length; i++) {
      nextGen.push({
        dna: new Float32Array(sorted[i].dna),
        architecture: sorted[i].architecture || winnerArch
      });
    }

    // 3. MUTATED VARIANTS: Use top-3 parents with rank-weighted selection
    // This preserves winner's traits while exploring from runner-ups
    const topParents = sorted.slice(0, Math.min(3, sorted.length));
    const mutateCount = popSize - nextGen.length;
    
    for (let i = 0; i < mutateCount; i++) {
      let parentDna, parentArch;
      
      // 30% chance: crossover between top-2, then mutate
      if (Math.random() < 0.3 && topParents.length >= 2) {
        const childDna = Evolution.crossover(topParents[0].dna, topParents[1].dna);
        const variantDna = Evolution.mutate(childDna, mutationRate, mutationSize);
        parentDna = variantDna;
        parentArch = topParents[0].architecture || winnerArch;
      } else {
        // 70% chance: mutate from top-N (weighted selection)
        const weights = [3, 2, 1].slice(0, topParents.length);
        const totalW = weights.reduce((a, b) => a + b, 0);
        let r = Math.random() * totalW;
        let parentIdx = 0;
        for (let w = 0; w < weights.length; w++) {
          r -= weights[w];
          if (r <= 0) { parentIdx = w; break; }
        }
        parentDna = Evolution.mutate(topParents[parentIdx].dna, mutationRate, mutationSize);
        parentArch = topParents[parentIdx].architecture || winnerArch;
      }
      
      nextGen.push({
        dna: parentDna,
        architecture: parentArch
      });
    }

    // 4. DIVERSITY INJECTION: When stagnant for 8+ generations
    // Replace bottom 20% with fresh random DNA
    if (stagnantGens >= 8) {
      const injectCount = Math.floor(popSize * 0.20);
      for (let i = 0; i < injectCount; i++) {
        const idx = nextGen.length - 1 - i;
        if (idx > 0) {
          nextGen[idx] = { 
            dna: Evolution.randomDNA(dnaLength), 
            architecture: Evolution.randomArchitecture() 
          };
        }
      }
    }

    // 5. RARE IMMIGRANT: 1 random creature every ~10 generations for diversity
    // Only if population is large enough
    if (popSize > 10 && Math.random() < 0.1) {
      // Replace the last creature with a random immigrant
      nextGen[nextGen.length - 1] = {
        dna: Evolution.randomDNA(dnaLength),
        architecture: Evolution.randomArchitecture()
      };
    }

    return nextGen;
  }

  /**
   * Uniform crossover: each gene has 50% chance from each parent
   * @param {Float32Array} dnaA - First parent DNA
   * @param {Float32Array} dnaB - Second parent DNA
   * @returns {Float32Array} Child DNA
   */
  static crossover(dnaA, dnaB) {
    const child = new Float32Array(dnaA.length);
    for (let i = 0; i < child.length; i++) {
      child[i] = Math.random() < 0.5 ? dnaA[i] : dnaB[i];
    }
    return child;
  }

  /**
   * Mutate DNA: each weight has mutationRate chance of += N(0, mutationSize)
   * @param {Float32Array} dna - Original DNA
   * @param {number} rate - Probability of mutation per weight
   * @param {number} size - Magnitude of mutation
   * @returns {Float32Array} Mutated DNA
   */
  static mutate(dna, rate, size) {
    const mutated = new Float32Array(dna.length);
    
    for (let i = 0; i < mutated.length; i++) {
      if (Math.random() < rate) {
        // Gaussian mutation: add random offset
        mutated[i] = dna[i] + gaussianRandom() * size;
        
        // Occasional complete reset (rare - 2% chance when mutating)
        if (Math.random() < 0.02) {
          mutated[i] = gaussianRandom() * 0.5;
        }
      } else {
        mutated[i] = dna[i]; // Copy unchanged
      }
    }
    
    return mutated;
  }

  /**
   * Generate random DNA with Xavier initialization
   */
  static randomDNA(length) {
    const dna = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      dna[i] = gaussianRandom() * 0.5;
    }
    return dna;
  }

  /**
   * Generate random architecture
   */
  static randomArchitecture() {
    return {
      hiddenLayers: Math.floor(Math.random() * 3), // 0-2 layers
      neuronsPerLayer: 4 + Math.floor(Math.random() * 12) // 4-16 neurons
    };
  }
}
