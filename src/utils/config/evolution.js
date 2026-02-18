/**
 * Evolution & Population Parameters
 * Controls genetic algorithm behavior
 */
export const EVOLUTION_CONFIG = {
  // Population
  populationSize: 24,           // Number of creatures per generation

  // Selection
  eliteCount: 2,                // Number of best creatures kept unchanged
  tournamentSize: 3,            // Tournament selection size

  // Mutation
  mutationRate: 0.08,           // Base probability of gene mutation (0-1)
  mutationSize: 1.0,            // Magnitude of mutations
  maxMutationRate: 0.95,        // Maximum mutation rate during stagnation
  stagnantMutBonus: 0.015,      // Mutation rate increase per stagnant generation

  // Simulation Duration
  generationDuration: 60,       // Seconds per generation
  simulationSpeed: 1,           // Speed multiplier (1=normal, higher=faster evolution)

  // Neural Network Architecture
  hiddenLayers: 1,              // Number of hidden layers
  neuronsPerLayer: 12,          // Neurons per hidden layer
  activation: 'tanh',           // Activation function

  // Creature Behavior
  selfCollision: false,         // Enable collision between creature's own bodies
};
