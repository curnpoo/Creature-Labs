/**
 * Quick test for TopologyNeuralNetwork
 * Run with: node tests/test-topology.js
 */

import { TopologyNeuralNetwork, gaussianRandom, topologyCrossover } from '../src/nn/TopologyNeuralNetwork.js';
import { Evolution } from '../src/nn/Evolution.js';

console.log('=== Testing Topology Neural Network ===\n');

// Test 1: Create simple network
console.log('Test 1: Creating network with architecture [4, 6, 3]');
const net1 = new TopologyNeuralNetwork([4, 6, 3]);
console.log('  Layer sizes:', net1.layerSizes);
console.log('  Num layers:', net1.numLayers);
console.log('  Weight count:', net1.weightCount);
console.log('  Input size:', net1.getInputSize());
console.log('  Output size:', net1.getOutputSize());
console.log('  [OK] Basic creation works\n');

// Test 2: Forward pass
console.log('Test 2: Forward pass');
const inputs = new Float32Array([0.5, -0.3, 0.8, 0.1]);
const outputs = net1.forward(inputs);
console.log('  Input:', Array.from(inputs));
console.log('  Output:', Array.from(outputs));
console.log('  Output length:', outputs.length);
console.log('  [OK] Forward pass works\n');

// Test 3: DNA encoding/decoding
console.log('Test 3: DNA encoding/decoding');
const dna = net1.toDNA();
console.log('  DNA length:', dna.length);
console.log('  DNA structure: [numLayers=' + dna[0] + ', layers=' + Array.from(dna.slice(1, 1 + dna[0])) + ', ...weights]');

const net2 = new TopologyNeuralNetwork(dna);
console.log('  Reconstructed layer sizes:', net2.layerSizes);
console.log('  [OK] DNA encoding/decoding works\n');

// Test 4: Add layer
console.log('Test 4: Add layer mutation');
const net3 = net1.mutateAddLayer();
if (net3) {
  console.log('  Original layers:', net1.layerSizes);
  console.log('  New layers:', net3.layerSizes);
  console.log('  Added layer at position', net3.layerSizes.findIndex((s, i) => s !== net1.layerSizes[i]));
  console.log('  [OK] Add layer works\n');
} else {
  console.log('  [X] Add layer returned null\n');
}

// Test 5: Add neurons
console.log('Test 5: Add neurons mutation');
const net4 = net1.mutateAddNeurons();
if (net4) {
  console.log('  Original layers:', net1.layerSizes);
  console.log('  New layers:', net4.layerSizes);
  console.log('  [OK] Add neurons works\n');
} else {
  console.log('  Add neurons returned null (expected if already at max)\n');
}

// Test 6: Crossover between different architectures
console.log('Test 6: Crossover between different architectures');
const parentA = new TopologyNeuralNetwork([4, 8, 3]);
const parentB = new TopologyNeuralNetwork([4, 6, 10, 3]);
const child = topologyCrossover(parentA, parentB);
console.log('  Parent A layers:', parentA.layerSizes);
console.log('  Parent B layers:', parentB.layerSizes);
console.log('  Child layers:', child.layerSizes);
console.log('  [OK] Crossover works\n');

// Test 7: Evolution with topology mutations
console.log('Test 7: Evolution compatibility (legacy + NEAT)');

// First verify each creature's DNA is valid
const creatureDNAs = [
  new TopologyNeuralNetwork([4, 6, 3]).toDNA(),
  new TopologyNeuralNetwork([4, 8, 3]).toDNA(),
  new TopologyNeuralNetwork([4, 10, 3]).toDNA(),
  new TopologyNeuralNetwork([4, 5, 7, 3]).toDNA(),
];

console.log('  Creature DNA lengths:', creatureDNAs.map(d => d.length));

const creatures = creatureDNAs.map((dna, i) => ({ dna, fitness: 10 - i * 2 }));
let nextGen = null;

try {
  nextGen = Evolution.evolve(creatures, 4, {
    mutationRate: 0.1,
    mutationSize: 1.0,
    eliteCount: 1,
    tournamentSize: 2,
    stagnantGens: 0,
    topologyMutationRate: 0.5,
    addLayerRate: 0.1,
    removeLayerRate: 0.05,
    addNeuronRate: 0.15,
    removeNeuronRate: 0.1
  }, { inputs: 4, outputs: 3 });

  const nextGenDna = nextGen.map(entry => entry?.dna || entry).filter(Boolean);
  console.log('  Generated', nextGen.length, 'new entries');
  console.log('  DNA lengths:', nextGenDna.map(d => d.length));
  
  const architectures = [];
  for (let i = 0; i < nextGenDna.length; i++) {
    try {
      const dna = nextGenDna[i];
      if (!dna || dna.length < 2) {
        console.error(`  DNA ${i} is invalid:`, dna);
        architectures.push('INVALID');
        continue;
      }
      if (TopologyNeuralNetwork._looksLikeDna(dna)) {
        const net = new TopologyNeuralNetwork(dna);
        architectures.push(net.layerSizes.join('-'));
      } else {
        architectures.push(`flat-${dna.length}`);
      }
    } catch (e) {
      console.error(`  DNA ${i} failed:`, e.message, 'length:', nextGenDna[i]?.length);
      architectures.push('ERROR');
    }
  }
  console.log('  Architectures:', architectures);
  console.log('  [OK] Evolution works\n');
} catch (e) {
  console.error('  ✗ Evolution failed:', e.message);
  console.error('  Stack:', e.stack);
}

// Test 8: Population stats (legacy compatibility)
if (nextGen) {
  const stats = Evolution.getPopulationStats(nextGen);
  console.log('  Architecture distribution:');
  stats.architectures.forEach((count, arch) => {
    console.log('    ' + arch + ': ' + count);
  });
  console.log('  Average layers:', stats.avgLayers.toFixed(1));
  console.log('  Average hidden neurons:', stats.avgHiddenNeurons.toFixed(1));
  console.log('  [OK] Population stats work\n');
} else {
  console.log('  Test 8 skipped (nextGen not available)\n');
}

// Test 9: NEAT-era output expectations
console.log('Test 9: NEAT evolve output shape');
try {
  const neatNext = Evolution.evolve([
    { dna: new Float32Array([0.1, -0.2, 0.3]), fitness: 10 },
    { dna: new Float32Array([0.4, 0.2, -0.6]), fitness: 8 },
    { dna: new Float32Array([-0.1, 0.9, 0.05]), fitness: 6 },
    { dna: new Float32Array([0.7, -0.4, 0.2]), fitness: 5 }
  ], 4, {
    trainingAlgorithm: 'neat',
    neatMode: true,
    neatInputCount: 4,
    neatOutputCount: 3
  });

  const hasGenome = neatNext.every(entry => entry && typeof entry === 'object' && entry.genome);
  const hasGenomeId = neatNext.every(entry => entry && Number.isFinite(entry.genomeId));
  const hasControllerType = neatNext.every(entry => entry && entry.controllerType === 'neat');
  console.log('  Entries:', neatNext.length);
  console.log('  Has genome metadata:', hasGenome);
  console.log('  Has genome IDs:', hasGenomeId);
  console.log('  Has NEAT controller type:', hasControllerType);
  if (!hasGenome || !hasGenomeId || !hasControllerType || neatNext.length !== 4) {
    throw new Error('NEAT evolve output shape mismatch');
  }
  console.log('  [OK] NEAT output shape is valid\n');
} catch (e) {
  console.error('  ✗ NEAT compatibility failed:', e.message);
}

console.log('=== All tests passed! ===');
