import { Evolution } from '../src/nn/Evolution.js';

const BASE_CONFIG = {
  trainingAlgorithm: 'neat',
  neatMode: true,
  neatInputCount: 6,
  neatOutputCount: 2,
  neatCompatThreshold: 2.2,
  neatSurvivalRate: 0.25,
  neatTournamentSize: 3,
  neatSpeciesStagnation: 15,
  neatCrossoverRate: 0.75,
  neatWeightMutRate: 0.8,
  neatWeightPerturbRate: 0.9,
  neatWeightPerturbStd: 0.18,
  neatWeightResetStd: 0.6,
  neatBiasMutRate: 0.12,
  neatBiasPerturbStd: 0.06,
  neatAddConnRate: 0.1,
  neatAddNodeRate: 0.035,
  neatToggleRate: 0.01
};

function buildSavedGeneration(popSize = 8) {
  Evolution.resetNeatState();
  const gen0 = Evolution.evolve([], popSize, BASE_CONFIG);
  const eval0 = gen0.map((entry, i) => ({
    genomeId: entry.genomeId,
    genome: entry.genome,
    fitness: 100 - i
  }));
  const gen1 = Evolution.evolve(eval0, popSize, BASE_CONFIG);
  return gen1;
}

function lineageOverlap(nextGen, savedIds) {
  const parentIds = new Set(
    nextGen.flatMap((entry) => (Array.isArray(entry.parents) ? entry.parents : []))
  );
  return [...parentIds].filter((id) => Number.isFinite(id) && savedIds.has(id)).length;
}

function testBreaksWithoutRehydrate() {
  const saved = buildSavedGeneration(8);
  const savedIds = new Set(saved.map((e) => e.genomeId));
  Evolution.resetNeatState();
  const evalRestored = saved.map((entry, i) => ({
    genomeId: entry.genomeId,
    genome: entry.genome,
    fitness: 100 - i
  }));
  const next = Evolution.evolve(evalRestored, 8, BASE_CONFIG);
  const overlap = lineageOverlap(next, savedIds);
  if (overlap !== 0) {
    throw new Error(`Expected broken lineage overlap to be 0 without rehydrate, got ${overlap}`);
  }
  return overlap;
}

function testRestoresWithRehydrate() {
  const saved = buildSavedGeneration(8);
  const savedIds = new Set(saved.map((e) => e.genomeId));
  Evolution.resetNeatState();
  const synced = Evolution.syncNeatPopulation(saved, 8, BASE_CONFIG);
  if (!synced) {
    throw new Error('Expected Evolution.syncNeatPopulation(...) to succeed');
  }
  const evalRestored = saved.map((entry, i) => ({
    genomeId: entry.genomeId,
    genome: entry.genome,
    fitness: 100 - i
  }));
  const next = Evolution.evolve(evalRestored, 8, BASE_CONFIG);
  const overlap = lineageOverlap(next, savedIds);
  if (overlap <= 0) {
    throw new Error(`Expected lineage overlap after rehydrate, got ${overlap}`);
  }
  return overlap;
}

try {
  const broken = testBreaksWithoutRehydrate();
  const restored = testRestoresWithRehydrate();
  console.log('PASS test-sandbox-restore-neat');
  console.log(`overlap_without_rehydrate=${broken}`);
  console.log(`overlap_with_rehydrate=${restored}`);
} catch (err) {
  console.error('FAIL test-sandbox-restore-neat');
  console.error(err?.stack || err?.message || err);
  process.exit(1);
}
