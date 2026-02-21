import { gaussianRandom } from './NeuralNetwork.js';

/**
 * Evolution Strategy:
 * 1. Elitism: top-2 pass unchanged
 * 2. Tournament selection from top 40% gene pool (no crossover — avoids competing conventions)
 * 3. Guaranteed immigrants every generation for diversity
 * 4. Architecture mutation: bred creatures occasionally gain/lose layers or neurons
 * 5. Stagnation boost: replaces bottom 30% when fitness plateaus ≥5 gens
 * 6. Nuclear reset: full population replacement every 25 stagnant gens
 */
export class Evolution {
  /**
   * Evolve next generation of DNA (weight arrays).
   * @param {object[]} creatures - Array of { dna: Float32Array, fitness: number, architecture: object }
   * @param {number} popSize - Target population size
   * @param {object} config - { mutationRate, mutationSize, eliteCount, stagnantGens }
   * @returns {object[]} Array of { dna: Float32Array, architecture: object, prevArchitecture?: object }
   */
  static evolve(creatures, popSize, config) {
    const {
      mutationRate = 0.10,
      mutationSize = 0.7,
      stagnantGens = 0
    } = config;

    // Sort by fitness descending
    const sorted = creatures.slice().sort((a, b) => b.fitness - a.fitness);
    if (!sorted.length) return [];

    // NUCLEAR RESET: when deeply stagnant, replace entire population with capable architectures
    // Fires at stagnantGens = 25, 50, 75, 100, 125, 150 ...
    if (stagnantGens > 0 && stagnantGens % 25 === 0) {
      console.warn(`[Evolution] NUCLEAR RESET at stagnantGens=${stagnantGens}. Forcing architecture diversity.`);
      const nuclearGen = [];
      for (let i = 0; i < popSize; i++) {
        nuclearGen.push({
          dna: new Float32Array(1), // Deliberate length mismatch → Creature.js falls through to fresh Xavier init
          architecture: {
            hiddenLayers: 1 + Math.floor(Math.random() * 2),  // 1 or 2, never 0
            neuronsPerLayer: 8 + Math.floor(Math.random() * 8) // 8–16
          }
        });
      }
      return nuclearGen;
    }

    const winner = sorted[0];
    const winnerDna = winner.dna;
    const winnerArch = winner.architecture || { hiddenLayers: 1, neuronsPerLayer: 8 };
    const dnaLength = winnerDna.length;

    const nextGen = [];

    // 1. ELITES: Top 2 unchanged (~6%)
    const eliteCount = Math.min(2, sorted.length);
    for (let i = 0; i < eliteCount; i++) {
      nextGen.push({
        dna: new Float32Array(sorted[i].dna),
        architecture: sorted[i].architecture || winnerArch
      });
    }

    // 2. GUARANTEED IMMIGRANTS: 3 random per generation (~8%)
    const immigrantCount = Math.min(3, popSize - eliteCount);
    for (let i = 0; i < immigrantCount; i++) {
      nextGen.push({
        dna: Evolution.randomDNA(dnaLength),
        architecture: Evolution.randomArchitecture()
      });
    }

    // 3. BRED: Tournament selection from top 40%, with architecture mutation (~86%)
    // Architecture is part of the genome — it evolves by selection + mutation just like weights.
    // When architecture changes, prevArchitecture is stored so Creature.js can do
    // smart weight transfer (copy compatible layers, Xavier-init new ones).
    const poolSize = Math.max(2, Math.ceil(sorted.length * 0.4));
    const pool = sorted.slice(0, poolSize);
    const bredCount = popSize - nextGen.length;
    for (let i = 0; i < bredCount; i++) {
      const parent = Evolution.tournamentSelect(pool);
      const parentArch = parent.architecture || winnerArch;

      // Occasionally mutate architecture — adds/removes layers or neurons.
      // Selection pressure then determines whether the mutation is beneficial.
      const { architecture: newArch, changed: archChanged } = Evolution.mutateArchitecture(parentArch);

      const entry = {
        dna: Evolution.mutate(parent.dna, mutationRate, mutationSize),
        architecture: newArch
      };

      // When architecture changes, record the old one so Creature.js can transfer
      // compatible weights instead of starting from random Xavier init.
      if (archChanged) {
        entry.prevArchitecture = parentArch;
      }

      nextGen.push(entry);
    }

    // 4. STAGNATION BOOST: Replace bottom 30% when stagnant ≥5 gens
    if (stagnantGens >= 5) {
      const injectCount = Math.floor(popSize * 0.30);
      for (let i = 0; i < injectCount; i++) {
        const idx = nextGen.length - 1 - i;
        if (idx <= 1) break; // Never replace elites
        if (Math.random() < 0.5) {
          nextGen[idx] = {
            dna: Evolution.randomDNA(dnaLength),
            architecture: Evolution.randomArchitecture()
          };
        } else {
          nextGen[idx] = {
            dna: Evolution.mutate(winnerDna, Math.min(0.5, mutationRate * 3), mutationSize * 2),
            architecture: winnerArch
          };
        }
      }
    }

    return nextGen;
  }

  /**
   * Tournament selection: sample k from pool, return highest fitness.
   * @param {object[]} pool - Array of { dna, fitness, architecture }
   * @param {number} k - Tournament size
   * @returns {object} Winner of tournament
   */
  static tournamentSelect(pool, k = 4) {
    const actualK = Math.min(k, pool.length);
    let best = null;
    for (let i = 0; i < actualK; i++) {
      const candidate = pool[Math.floor(Math.random() * pool.length)];
      if (!best || candidate.fitness > best.fitness) {
        best = candidate;
      }
    }
    return best;
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
   * Mutate architecture: occasionally add/remove layers or neurons.
   *
   * Architecture is a proper part of the genome. This mutation, combined with
   * tournament selection on fitness, drives genuine architectural neuroevolution:
   * - Networks that are too small grow toward more expressive topologies
   * - Networks that are too large face harder optimization and may shrink
   * - The population converges on architectures that solve the task efficiently
   *
   * @param {{ hiddenLayers: number, neuronsPerLayer: number }} arch
   * @param {number} rate - Probability of any mutation occurring (default 8%)
   * @returns {{ architecture: object, changed: boolean }}
   */
  static mutateArchitecture(arch, rate = 0.08) {
    if (Math.random() >= rate) return { architecture: arch, changed: false };

    let { hiddenLayers, neuronsPerLayer } = arch;
    const roll = Math.random();

    if (roll < 0.20) {
      // Grow deeper: add a hidden layer
      hiddenLayers = Math.min(4, hiddenLayers + 1);
    } else if (roll < 0.35) {
      // Shrink: remove a hidden layer — never below 1
      hiddenLayers = Math.max(1, hiddenLayers - 1);
    } else if (roll < 0.60) {
      // Widen: more neurons per layer
      neuronsPerLayer = Math.min(32, neuronsPerLayer + 2 + Math.floor(Math.random() * 4));
    } else if (roll < 0.78) {
      // Narrow: fewer neurons per layer
      neuronsPerLayer = Math.max(4, neuronsPerLayer - 2 - Math.floor(Math.random() * 3));
    } else {
      // Grow both dimensions
      hiddenLayers = Math.min(4, hiddenLayers + 1);
      neuronsPerLayer = Math.min(32, neuronsPerLayer + 2 + Math.floor(Math.random() * 4));
    }

    const newArch = { hiddenLayers, neuronsPerLayer };
    // Only mark as changed if values actually differ (avoids spurious transfer overhead)
    const changed = newArch.hiddenLayers !== arch.hiddenLayers ||
                    newArch.neuronsPerLayer !== arch.neuronsPerLayer;
    return { architecture: newArch, changed };
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
   * Generate random architecture — always ≥1 hidden layer.
   */
  static randomArchitecture() {
    return {
      hiddenLayers: 1 + Math.floor(Math.random() * 2), // 1 or 2 layers, NEVER 0
      neuronsPerLayer: 8 + Math.floor(Math.random() * 8) // 8–16 neurons
    };
  }
}
