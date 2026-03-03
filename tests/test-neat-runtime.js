import assert from 'node:assert/strict';
import { Genome } from '../src/nn/neat/Genome.js';
import { Population } from '../src/nn/neat/Population.js';
import { Evolution } from '../src/nn/Evolution.js';
import { getInnovationTracker } from '../src/nn/neat/index.js';
import { NODE_TYPES, ACTIVATIONS } from '../src/nn/neat/genes.js';

function buildGenomeA() {
  const g = new Genome(1, [1, 2], [5]);
  g.nodes.set(1, { id: 1, type: NODE_TYPES.INPUT, layer: 0, activation: ACTIVATIONS.LINEAR, bias: 0 });
  g.nodes.set(2, { id: 2, type: NODE_TYPES.INPUT, layer: 0, activation: ACTIVATIONS.LINEAR, bias: 0 });
  g.nodes.set(3, { id: 3, type: NODE_TYPES.HIDDEN, layer: 0.3, activation: ACTIVATIONS.TANH, bias: 0.1 });
  g.nodes.set(4, { id: 4, type: NODE_TYPES.HIDDEN, layer: 0.6, activation: ACTIVATIONS.TANH, bias: -0.2 });
  g.nodes.set(5, { id: 5, type: NODE_TYPES.OUTPUT, layer: 1, activation: ACTIVATIONS.TANH, bias: 0.05 });
  g.connections.set(1, { innovation: 1, inNode: 1, outNode: 3, weight: 0.8, enabled: true });
  g.connections.set(2, { innovation: 2, inNode: 2, outNode: 3, weight: -0.4, enabled: true });
  g.connections.set(3, { innovation: 3, inNode: 3, outNode: 4, weight: 1.1, enabled: true });
  g.connections.set(4, { innovation: 4, inNode: 4, outNode: 5, weight: 0.7, enabled: true });
  return g;
}

function testTopoDeterminism() {
  const g1 = buildGenomeA();
  const g2 = Genome.fromSerializable(g1.toSerializable());
  const inputs = new Float32Array([0.25, -0.5]);
  const y1 = g1.evaluate(inputs);
  const y2 = g2.evaluate(inputs);
  assert.equal(y1.length, 1);
  assert.equal(y2.length, 1);
  assert.ok(Math.abs(y1[0] - y2[0]) < 1e-9, 'Topological evaluation should be deterministic after roundtrip');
}

function testInputToOutputIsAcyclic() {
  const g = new Genome(2, [1, 2], [3]);
  g.nodes.set(1, { id: 1, type: NODE_TYPES.INPUT, layer: 0, activation: ACTIVATIONS.LINEAR, bias: 0 });
  g.nodes.set(2, { id: 2, type: NODE_TYPES.INPUT, layer: 0, activation: ACTIVATIONS.LINEAR, bias: 0 });
  g.nodes.set(3, { id: 3, type: NODE_TYPES.OUTPUT, layer: 1, activation: ACTIVATIONS.TANH, bias: 0 });
  g.connections.set(1, { innovation: 1, inNode: 1, outNode: 3, weight: 1, enabled: true });
  g.connections.set(2, { innovation: 2, inNode: 2, outNode: 3, weight: 1, enabled: true });

  const topo = g._resolveTopologicalOrder();
  assert.equal(topo.hasCycle, false, 'Pure input->output feed-forward graph must be acyclic');
  const out = g.evaluate(new Float32Array([0.5, 0.5]));
  assert.ok(out[0] > 0.5, 'Feed-forward output should use input signals');
}

function testCycleGuard() {
  const g = buildGenomeA();
  g.connections.set(5, { innovation: 5, inNode: 4, outNode: 3, weight: 0.2, enabled: true });
  const out = g.evaluate(new Float32Array([1, 1]));
  const topo = g._resolveTopologicalOrder();
  assert.equal(topo.hasCycle, true, 'Cycle should be detected');
  assert.equal(out[0], 0, 'Cycle genome should evaluate to safe zero output');
}

function testStrictCrossover() {
  const a = new Genome(10, [1], [4]);
  const b = new Genome(11, [1], [4]);
  [a, b].forEach(g => {
    g.nodes.set(1, { id: 1, type: NODE_TYPES.INPUT, layer: 0, activation: ACTIVATIONS.LINEAR, bias: 0 });
    g.nodes.set(2, { id: 2, type: NODE_TYPES.HIDDEN, layer: 0.5, activation: ACTIVATIONS.TANH, bias: 0 });
    g.nodes.set(3, { id: 3, type: NODE_TYPES.HIDDEN, layer: 0.6, activation: ACTIVATIONS.TANH, bias: 0 });
    g.nodes.set(4, { id: 4, type: NODE_TYPES.OUTPUT, layer: 1, activation: ACTIVATIONS.TANH, bias: 0 });
  });
  a.connections.set(1, { innovation: 1, inNode: 1, outNode: 2, weight: 0.1, enabled: true });
  a.connections.set(2, { innovation: 2, inNode: 2, outNode: 4, weight: 0.2, enabled: true });
  a.connections.set(4, { innovation: 4, inNode: 1, outNode: 4, weight: 0.4, enabled: true });

  b.connections.set(1, { innovation: 1, inNode: 1, outNode: 2, weight: 0.3, enabled: true });
  b.connections.set(3, { innovation: 3, inNode: 3, outNode: 4, weight: 0.6, enabled: true });

  a.fitness = 10;
  b.fitness = 5;
  const child = Genome.crossover(a, b, 99, {});
  assert.ok(child.connections.has(1), 'Matching gene should exist');
  assert.ok(child.connections.has(2), 'Disjoint/excess from fitter parent should remain');
  assert.ok(child.connections.has(4), 'Excess from fitter parent should remain');
  assert.equal(child.connections.has(3), false, 'Disjoint/excess from less-fit parent should be ignored');
}

function testSerializableRoundtrip() {
  const g = buildGenomeA();
  g.parentIds = [5, 4];
  g.speciesId = 2;
  g.generationBorn = 7;
  const restored = Genome.fromSerializable(g.toSerializable());
  assert.equal(restored.id, g.id);
  assert.equal(restored.speciesId, 2);
  assert.deepEqual(restored.parentIds, [5, 4]);
  assert.equal(restored.connections.size, g.connections.size);
}

function testPopulationExportSerializableGenome() {
  const pop = new Population({
    neatInputCount: 3,
    neatOutputCount: 2
  });
  const exported = pop.evolve([], 4, {
    neatInputCount: 3,
    neatOutputCount: 2,
    trainingAlgorithm: 'neat',
    neatMode: true
  });
  assert.ok(Array.isArray(exported) && exported.length === 4, 'Population export should return entries');
  const first = exported[0];
  assert.equal(first.controllerType, 'neat');
  assert.ok(Array.isArray(first.genome?.nodes), 'Exported genome nodes must be a serializable array');
  assert.ok(Array.isArray(first.genome?.connections), 'Exported genome connections must be a serializable array');
}

function testEvolutionResetClearsRuntimeState() {
  const config = {
    trainingAlgorithm: 'neat',
    neatMode: true,
    neatInputCount: 3,
    neatOutputCount: 2,
    neatAddNodeRate: 0,
    neatAddConnRate: 0
  };

  Evolution.resetNeatState();
  const tracker = getInnovationTracker();

  const firstGen = Evolution.evolve([], 4, config);
  assert.ok(Array.isArray(firstGen) && firstGen.length === 4, 'NEAT evolve should return first generation entries');
  const baselineFirstGenomeId = Number(firstGen[0].genomeId) || 0;
  assert.ok(baselineFirstGenomeId > 0, 'First evolved genome ID should be positive after reset');
  assert.ok((Evolution.getNeatStatus()?.innovationCount || 0) > 0, 'Innovation count should initialize above zero');

  const secondGen = Evolution.evolve(
    firstGen.map((entry, idx) => ({ ...entry, fitness: idx + 1 })),
    4,
    config
  );
  assert.ok(Array.isArray(secondGen) && secondGen.length === 4, 'Second generation should evolve successfully');
  const maxIdBeforeReset = Math.max(...secondGen.map(entry => Number(entry.genomeId) || 0));
  assert.ok(maxIdBeforeReset > 1, 'Genome IDs should advance before reset');

  Evolution.resetNeatState();
  assert.equal(Evolution.getNeatStatus(), null, 'NEAT status should clear to null on reset');
  assert.equal(tracker.snapshot().nextInnovation, 1, 'Innovation tracker should reset to 1');

  const freshGen = Evolution.evolve([], 4, config);
  assert.equal(
    Number(freshGen[0].genomeId) || 0,
    baselineFirstGenomeId,
    'Genome ID sequence should restart to the same baseline after reset'
  );
}

function run() {
  Evolution.resetNeatState();
  testTopoDeterminism();
  testInputToOutputIsAcyclic();
  testCycleGuard();
  testStrictCrossover();
  testSerializableRoundtrip();
  testPopulationExportSerializableGenome();
  testEvolutionResetClearsRuntimeState();
  Evolution.resetNeatState();
  console.log('test-neat-runtime: OK');
}

run();
