/**
 * Evolution & Population Parameters
 * Controls genetic algorithm behavior
 */
export const EVOLUTION_CONFIG = {
  // Population
  populationSize: 24,           // Number of creatures per generation

  // Selection
  eliteCount: 1,                // Number of best creatures kept unchanged
  tournamentSize: 3,            // Tournament selection size

  // Mutation - CONSERVATIVE (less chaotic)
  mutationRate: 0.03,           // Base probability of gene mutation (3% - more conservative)
  mutationSize: 0.3,            // Magnitude of mutations (0.3 = smaller changes)
  maxMutationRate: 0.50,        // Maximum mutation rate during stagnation (capped lower)
  stagnantMutBonus: 0.005,      // Mutation rate increase per stagnant generation (slower increase)

  // Simulation Duration
  generationDuration: 8,        // Seconds per generation
  simulationSpeed: 1,           // Speed multiplier (1=normal, higher=faster evolution)

  // Neural Network Architecture
  hiddenLayers: 1,              // Number of hidden layers
  neuronsPerLayer: 12,          // Neurons per hidden layer
  activation: 'tanh',           // Activation function

  // Creature Behavior
selfCollision: true, // Enable collision between creature's own bodies (prevents folding)
};
