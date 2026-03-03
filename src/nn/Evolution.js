import { gaussianRandom } from './NeuralNetwork.js';
import { Population as NeatPopulation, getInnovationTracker, resetPopulationRuntimeCounters } from './neat/index.js';

let neatPopulation = null;
let neatSignature = '';
let neatStatus = null;

/**
 * Evolution Strategy:
 * - Legacy GA mode: existing weight-array evolution pipeline (default).
 * - NEAT mode: graph genome evolution with speciation and innovation tracking.
 */
export class Evolution {
  static _refreshNeatStatus() {
    if (!neatPopulation || !Array.isArray(neatPopulation.genomes) || !neatPopulation.genomes.length) {
      neatStatus = null;
      return;
    }
    const champ = neatPopulation.genomes.reduce(
      (best, g) => (!best || (g.fitness || -Infinity) > (best.fitness || -Infinity) ? g : best),
      null
    );
    const innovationCount = Math.max(0, ((neatPopulation.tracker?.snapshot?.().nextInnovation || 1) - 1));
    neatStatus = {
      generation: Number(neatPopulation.generation) || 0,
      speciesCount: Array.isArray(neatPopulation.species) ? neatPopulation.species.length : 0,
      innovationCount,
      championComplexity: champ
        ? { nodes: champ.nodes?.size || 0, connections: champ.connections?.size || 0 }
        : null
    };
  }

  /**
   * Evolve next generation.
   * @param {object[]} creatures - Array of { dna: Float32Array, fitness: number, architecture?: object, genome?: object }
   * @param {number} popSize - Target population size
   * @param {object} config - Evolution settings
   * @returns {object[]} Array entries for next generation.
   */
  static evolve(creatures, popSize, config = {}) {
    if (Evolution._shouldUseNeat(config)) {
      return Evolution._evolveNeat(creatures, popSize, config);
    }
    return Evolution._evolveLegacy(creatures, popSize, config);
  }

  static _shouldUseNeat(config) {
    const mode = String(config.trainingAlgorithm || config.algorithm || '').toLowerCase();
    return mode === 'neat' || config.neatMode === true;
  }

  static _neatStateSignature(popSize, config) {
    const inputCount = Number(config.neatInputCount) || 0;
    const outputCount = Number(config.neatOutputCount) || 0;
    return `${popSize}|${inputCount}|${outputCount}`;
  }

  static _evolveNeat(creatures, popSize, config) {
    const signature = Evolution._neatStateSignature(popSize, config);
    if (!neatPopulation || signature !== neatSignature) {
      neatPopulation = new NeatPopulation(config);
      neatSignature = signature;
      neatStatus = null;
    }

    const next = neatPopulation.evolve(creatures, popSize, config);
    if (next.length > 0) {
      Evolution._refreshNeatStatus();
      return next;
    }

    // If NEAT has no valid IO shape yet, fall back to legacy behavior until simulation provides it.
    return Evolution._evolveLegacy(creatures, popSize, config);
  }

  static _evolveLegacy(creatures, popSize, config) {
    const {
      mutationRate = 0.10,
      mutationSize = 0.7,
      stagnantGens = 0
    } = config;

    const sorted = creatures.slice().sort((a, b) => b.fitness - a.fitness);
    if (!sorted.length) return [];

    if (stagnantGens > 0 && stagnantGens % 25 === 0) {
      const nuclearGen = [];
      for (let i = 0; i < popSize; i++) {
        nuclearGen.push({
          dna: new Float32Array(1),
          architecture: {
            hiddenLayers: 1 + Math.floor(Math.random() * 2),
            neuronsPerLayer: 8 + Math.floor(Math.random() * 8)
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

    const eliteCount = Math.min(2, sorted.length);
    for (let i = 0; i < eliteCount; i++) {
      nextGen.push({
        dna: new Float32Array(sorted[i].dna),
        architecture: sorted[i].architecture || winnerArch
      });
    }

    const immigrantCount = Math.min(3, popSize - eliteCount);
    for (let i = 0; i < immigrantCount; i++) {
      nextGen.push({
        dna: Evolution.randomDNA(dnaLength),
        architecture: Evolution.randomArchitecture()
      });
    }

    const poolSize = Math.max(2, Math.ceil(sorted.length * 0.4));
    const pool = sorted.slice(0, poolSize);
    const bredCount = popSize - nextGen.length;
    for (let i = 0; i < bredCount; i++) {
      const parent = Evolution.tournamentSelect(pool);
      const parentArch = parent.architecture || winnerArch;
      const { architecture: newArch, changed: archChanged } = Evolution.mutateArchitecture(parentArch);

      const entry = {
        dna: Evolution.mutate(parent.dna, mutationRate, mutationSize),
        architecture: newArch
      };

      if (archChanged) {
        entry.prevArchitecture = parentArch;
      }

      nextGen.push(entry);
    }

    if (stagnantGens >= 5) {
      const injectCount = Math.floor(popSize * 0.30);
      for (let i = 0; i < injectCount; i++) {
        const idx = nextGen.length - 1 - i;
        if (idx <= 1) break;
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

  static mutate(dna, rate, size) {
    const mutated = new Float32Array(dna.length);

    for (let i = 0; i < mutated.length; i++) {
      if (Math.random() < rate) {
        mutated[i] = dna[i] + gaussianRandom() * size;
        if (Math.random() < 0.02) {
          mutated[i] = gaussianRandom() * 0.5;
        }
      } else {
        mutated[i] = dna[i];
      }
    }

    return mutated;
  }

  static mutateArchitecture(arch, rate = 0.08) {
    if (Math.random() >= rate) return { architecture: arch, changed: false };

    let { hiddenLayers, neuronsPerLayer } = arch;
    const roll = Math.random();

    if (roll < 0.20) {
      hiddenLayers = Math.min(4, hiddenLayers + 1);
    } else if (roll < 0.35) {
      hiddenLayers = Math.max(1, hiddenLayers - 1);
    } else if (roll < 0.60) {
      neuronsPerLayer = Math.min(32, neuronsPerLayer + 2 + Math.floor(Math.random() * 4));
    } else if (roll < 0.78) {
      neuronsPerLayer = Math.max(4, neuronsPerLayer - 2 - Math.floor(Math.random() * 3));
    } else {
      hiddenLayers = Math.min(4, hiddenLayers + 1);
      neuronsPerLayer = Math.min(32, neuronsPerLayer + 2 + Math.floor(Math.random() * 4));
    }

    const newArch = { hiddenLayers, neuronsPerLayer };
    const changed = newArch.hiddenLayers !== arch.hiddenLayers ||
      newArch.neuronsPerLayer !== arch.neuronsPerLayer;

    if (newArch.hiddenLayers < 1) {
      throw new Error(`Invalid mutated architecture: hiddenLayers=${newArch.hiddenLayers}`);
    }

    return { architecture: newArch, changed };
  }

  static randomDNA(length) {
    const dna = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      dna[i] = gaussianRandom() * 0.5;
    }
    return dna;
  }

  static randomArchitecture() {
    const hiddenLayers = 1 + Math.floor(Math.random() * 2);
    const neuronsPerLayer = 8 + Math.floor(Math.random() * 8);

    if (hiddenLayers < 1) {
      throw new Error(`Invalid random architecture: hiddenLayers=${hiddenLayers}`);
    }

    return { hiddenLayers, neuronsPerLayer };
  }

  static getNeatStatus() {
    return neatStatus ? { ...neatStatus } : null;
  }

  /**
   * Restore the NEAT runtime population from serialized generation entries.
   * @param {object[]} entries
   * @param {number} popSize
   * @param {object} [config]
   * @returns {boolean}
   */
  static syncNeatPopulation(entries, popSize, config = {}) {
    const mergedConfig = {
      ...config,
      trainingAlgorithm: 'neat',
      neatMode: true
    };
    const signature = Evolution._neatStateSignature(popSize, mergedConfig);
    if (!neatPopulation || signature !== neatSignature) {
      neatPopulation = new NeatPopulation(mergedConfig);
      neatSignature = signature;
    }
    if (typeof neatPopulation.hydrateFromEntries !== 'function') return false;
    const ok = neatPopulation.hydrateFromEntries(entries, popSize, mergedConfig);
    if (ok) {
      Evolution._refreshNeatStatus();
      return true;
    }
    return false;
  }

  static resetNeatState() {
    neatPopulation = null;
    neatSignature = '';
    neatStatus = null;
    const tracker = getInnovationTracker?.();
    if (tracker && typeof tracker.reset === 'function') {
      tracker.reset();
    }
    if (typeof resetPopulationRuntimeCounters === 'function') {
      resetPopulationRuntimeCounters();
    }
  }

  /**
   * Legacy compatibility stats used by standalone topology tests.
   * Supports arrays of DNA or arrays of entries with a dna field.
   * @param {Array<Float32Array|{dna: Float32Array}>} population
   * @returns {{architectures: Map<string, number>, avgLayers: number, avgHiddenNeurons: number}}
   */
  static getPopulationStats(population = []) {
    const architectures = new Map();
    let layerTotal = 0;
    let hiddenNeuronTotal = 0;
    let counted = 0;

    for (const item of population) {
      const dna = item?.dna || item;
      if (!(dna instanceof Float32Array) || dna.length < 2) continue;

      const numLayers = Math.round(Number(dna[0]));
      let archName = `flat-${dna.length}`;
      let hidden = 0;

      if (Number.isFinite(numLayers) && numLayers >= 2 && numLayers <= 12 && dna.length > numLayers) {
        const layers = Array.from(dna.slice(1, 1 + numLayers)).map(v => Math.round(v));
        const valid = layers.every(v => Number.isFinite(v) && v >= 1 && v <= 256);
        if (valid) {
          archName = layers.join('-');
          hidden = layers.slice(1, -1).reduce((sum, n) => sum + n, 0);
          layerTotal += layers.length;
          hiddenNeuronTotal += hidden;
          counted++;
        }
      }

      architectures.set(archName, (architectures.get(archName) || 0) + 1);
    }

    return {
      architectures,
      avgLayers: counted > 0 ? layerTotal / counted : 0,
      avgHiddenNeurons: counted > 0 ? hiddenNeuronTotal / counted : 0
    };
  }
}
