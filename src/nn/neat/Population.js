import { Genome } from './Genome.js';
import { Species } from './Species.js';
import { getInnovationTracker } from './InnovationTracker.js';

let NEXT_GENOME_ID = 1;
let NEXT_SPECIES_ID = 1;

function nextGenomeId() {
  const id = NEXT_GENOME_ID;
  NEXT_GENOME_ID += 1;
  return id;
}

function nextSpeciesId() {
  const id = NEXT_SPECIES_ID;
  NEXT_SPECIES_ID += 1;
  return id;
}

/**
 * Stateful NEAT population manager.
 */
export class Population {
  constructor(config = {}) {
    this.config = config;
    this.tracker = getInnovationTracker();
    this.generation = 0;
    this.inputCount = config.neatInputCount ?? 0;
    this.outputCount = config.neatOutputCount ?? 0;
    this.genomes = [];
    this.species = [];
    this._initialized = false;
    this.compatThreshold = Number.isFinite(config.neatCompatThreshold) ? config.neatCompatThreshold : 2.2;
    this.rng = Math.random;
  }

  /**
   * @param {object[]} creatures
   * @param {number} popSize
   * @param {object} config
   * @returns {object[]}
   */
  evolve(creatures, popSize, config = {}) {
    this.config = { ...this.config, ...config };
    if (!this._initialized) {
      this._bootstrap(creatures, popSize, this.config);
    }

    const evaluated = this._attachFitness(creatures, popSize);
    this._speciate(evaluated, this.config);

    const offspring = [];
    const survivalRate = Math.max(0.05, Math.min(1, this.config.neatSurvivalRate ?? 0.2));
    const maxStagnation = this.config.neatSpeciesStagnation ?? 18;
    const globalChampion = evaluated.slice().sort((a, b) => (b.fitness || 0) - (a.fitness || 0))[0] || null;
    const globalChampionSpeciesId = Number(globalChampion?.speciesId) || null;

    const activeSpecies = this.species.filter((s) => (
      s.members.length > 0 &&
      (s.stagnantGenerations <= maxStagnation || (globalChampionSpeciesId != null && s.id === globalChampionSpeciesId))
    ));
    if (!activeSpecies.length) {
      this._bootstrap([], popSize, this.config);
      return this.exportNextGeneration();
    }

    // Species champions survive unchanged.
    for (let i = 0; i < activeSpecies.length; i++) {
      const champ = activeSpecies[i].champion();
      if (champ) {
        const clone = champ.clone(nextGenomeId());
        clone.parentIds = [champ.id, null];
        clone.generationBorn = this.generation + 1;
        offspring.push(clone);
      }
    }

    if (globalChampion) {
      const alreadyPresent = offspring.some(g => g.parentIds?.[0] === globalChampion.id && g.parentIds?.[1] === null);
      if (!alreadyPresent) {
        const preserved = globalChampion.clone(nextGenomeId());
        preserved.parentIds = [globalChampion.id, null];
        preserved.generationBorn = this.generation + 1;
        offspring.push(preserved);
      }
    }

    const totalAdjusted = activeSpecies.reduce((sum, s) => sum + Math.max(0, s.lastAverageAdjustedFitness), 0) || 1;
    const globalStagnation = Number(this.config.stagnantGens) || 0;
    const immigrantQuota = (activeSpecies.length <= 1 && globalStagnation >= 8)
      ? Math.max(1, Math.floor(popSize * 0.1))
      : 0;
    let immigrantsAdded = 0;

    while (offspring.length < popSize) {
      if (immigrantsAdded < immigrantQuota) {
        const immigrant = Genome.createMinimal(nextGenomeId(), this.inputCount, this.outputCount, this.tracker, this.config);
        immigrant.mutate(this.tracker, this.config);
        if (this.rng() < 0.7) immigrant.mutate(this.tracker, this.config);
        immigrant.parentIds = [null, null];
        immigrant.generationBorn = this.generation + 1;
        offspring.push(immigrant);
        immigrantsAdded += 1;
        continue;
      }

      const species = this._sampleSpeciesByAdjustedFitness(activeSpecies, totalAdjusted);
      const sorted = species.members.slice().sort((a, b) => b.fitness - a.fitness);
      const cutoff = Math.max(1, Math.ceil(sorted.length * survivalRate));
      const pool = sorted.slice(0, cutoff);

      const parentA = species.selectParent(this.config.neatTournamentSize ?? 3) || pool[Math.floor(this.rng() * pool.length)]?.genome;
      const parentB = species.selectParent(this.config.neatTournamentSize ?? 3) || pool[Math.floor(this.rng() * pool.length)]?.genome;

      let child = null;
      const crossoverRate = this.config.neatCrossoverRate ?? 0.75;
      if (parentB && parentA && parentA.id !== parentB.id && this.rng() < crossoverRate) {
        const fitterA = parentA.fitness >= parentB.fitness ? parentA : parentB;
        const fitterB = fitterA === parentA ? parentB : parentA;
        child = Genome.crossover(fitterA, fitterB, nextGenomeId(), this.config);
      } else {
        child = parentA.clone(nextGenomeId());
        child.parentIds = [parentA.id, null];
      }

      child.mutate(this.tracker, this.config);
      if (!Array.isArray(child.parentIds)) child.parentIds = [parentA?.id ?? null, parentB?.id ?? null];
      child.generationBorn = this.generation + 1;
      offspring.push(child);
    }

    this.genomes = offspring.slice(0, popSize);
    this.generation += 1;

    return this.exportNextGeneration();
  }

  exportNextGeneration() {
    const io = {
      inputCount: this.inputCount,
      outputCount: this.outputCount
    };

    return this.genomes.map((genome) => ({
      genomeId: genome.id,
      controllerType: 'neat',
      // Always export a plain serializable payload so worker transport
      // cannot strip class prototypes and silently corrupt topology.
      genome: genome.toSerializable(),
      architecture: {
        hiddenLayers: 1,
        neuronsPerLayer: Math.max(4, Math.ceil((genome.nodes.size - this.inputCount - this.outputCount) || 4)),
        neat: true,
        neatGenomeId: genome.id,
        neatNodeCount: genome.nodes.size,
        neatConnCount: genome.connections.size
      },
      neatMeta: {
        generation: this.generation,
        speciesCount: this.species.length,
        innovationCount: Math.max(0, (this.tracker.snapshot().nextInnovation || 1) - 1),
        io
      },
      parents: Array.isArray(genome.parentIds) ? [...genome.parentIds] : [null, null],
      speciesId: Number.isFinite(genome.speciesId) ? genome.speciesId : null,
      generationBorn: Number.isFinite(genome.generationBorn) ? genome.generationBorn : this.generation
    }));
  }

  _bootstrap(creatures, popSize, config) {
    const inferred = this._inferIoShape(creatures, config);
    this.inputCount = inferred.inputCount;
    this.outputCount = inferred.outputCount;

    if (this.inputCount <= 0 || this.outputCount <= 0) {
      // Keep NEAT dormant when IO shape is unknown.
      this.genomes = [];
      this.species = [];
      this._initialized = true;
      return;
    }

    this.genomes = [];
    for (let i = 0; i < popSize; i++) {
      const genome = Genome.createMinimal(nextGenomeId(), this.inputCount, this.outputCount, this.tracker, config);
      genome.parentIds = [null, null];
      genome.generationBorn = this.generation;
      this.genomes.push(genome);
    }
    this.species = [];
    this._initialized = true;
  }

  _inferIoShape(creatures, config) {
    const explicitInput = Number(config.neatInputCount);
    const explicitOutput = Number(config.neatOutputCount);
    if (Number.isFinite(explicitInput) && Number.isFinite(explicitOutput) && explicitInput > 0 && explicitOutput > 0) {
      return { inputCount: Math.floor(explicitInput), outputCount: Math.floor(explicitOutput) };
    }

    for (let i = 0; i < creatures.length; i++) {
      const candidate = creatures[i]?.genome;
      if (!candidate) continue;
      if (candidate.inputIds?.length > 0 && candidate.outputIds?.length > 0) {
        return {
          inputCount: candidate.inputIds.length,
          outputCount: candidate.outputIds.length
        };
      }
    }

    return { inputCount: 0, outputCount: 0 };
  }

  _attachFitness(creatures, popSize) {
    const genomesById = new Map(this.genomes.map((genome) => [genome.id, genome]));
    const evaluated = [];
    const usedIds = new Set();

    for (let i = 0; i < Math.min(creatures.length, popSize); i++) {
      const creature = creatures[i];
      const incoming = creature?.genome;
      const incomingId = Number(
        incoming?.id
        ?? creature?.genomeId
        ?? creature?.architecture?.neatGenomeId
      );
      let genome = null;

      if (Number.isFinite(incomingId) && genomesById.has(incomingId)) {
        genome = genomesById.get(incomingId);
      } else if (i < this.genomes.length) {
        genome = this.genomes[i];
      }

      if (!genome || usedIds.has(genome.id)) continue;
      usedIds.add(genome.id);
      genome.fitness = Number.isFinite(creature?.fitness) ? creature.fitness : 0;
      evaluated.push(genome);
    }

    while (evaluated.length < popSize && evaluated.length < this.genomes.length) {
      evaluated.push(this.genomes[evaluated.length]);
    }

    return evaluated;
  }

  _speciate(genomes, config) {
    const minThreshold = Number.isFinite(config.neatCompatThresholdMin) ? config.neatCompatThresholdMin : 1.2;
    const maxThreshold = Number.isFinite(config.neatCompatThresholdMax) ? config.neatCompatThresholdMax : 4.0;
    const adjustStep = Number.isFinite(config.neatCompatAdjustStep) ? Math.max(0.01, config.neatCompatAdjustStep) : 0.15;
    const targetSpeciesMin = Number.isFinite(config.neatTargetSpeciesMin) ? Math.max(1, config.neatTargetSpeciesMin) : 3;
    const targetSpeciesMax = Number.isFinite(config.neatTargetSpeciesMax) ? Math.max(targetSpeciesMin, config.neatTargetSpeciesMax) : 8;
    const threshold = Number.isFinite(this.compatThreshold)
      ? this.compatThreshold
      : (Number.isFinite(config.neatCompatThreshold) ? config.neatCompatThreshold : 2.2);
    for (let i = 0; i < this.species.length; i++) {
      this.species[i].clearMembers();
    }

    for (let i = 0; i < genomes.length; i++) {
      const genome = genomes[i];
      let assigned = null;

      for (let s = 0; s < this.species.length; s++) {
        const species = this.species[s];
        const distance = Genome.compatibilityDistance(genome, species.representative, config);
        if (distance <= threshold) {
          assigned = species;
          break;
        }
      }

      if (!assigned) {
        assigned = new Species(nextSpeciesId(), genome);
        this.species.push(assigned);
      }

      assigned.addMember(genome, genome.fitness);
      genome.speciesId = assigned.id;
    }

    this.species = this.species.filter((species) => species.members.length > 0);
    for (let i = 0; i < this.species.length; i++) {
      this.species[i].finalizeGeneration();
    }

    if (this.species.length < targetSpeciesMin) {
      this.compatThreshold = Math.max(minThreshold, threshold - adjustStep);
    } else if (this.species.length > targetSpeciesMax) {
      this.compatThreshold = Math.min(maxThreshold, threshold + adjustStep);
    } else {
      this.compatThreshold = Math.max(minThreshold, Math.min(maxThreshold, threshold));
    }
  }

  _sampleSpeciesByAdjustedFitness(speciesList, totalAdjusted) {
    let roll = Math.random() * totalAdjusted;
    for (let i = 0; i < speciesList.length; i++) {
      roll -= Math.max(0, speciesList[i].lastAverageAdjustedFitness);
      if (roll <= 0) return speciesList[i];
    }
    return speciesList[speciesList.length - 1];
  }
}
