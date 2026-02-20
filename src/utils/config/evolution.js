/**
 * Evolution & Population Parameters
 * Controls genetic algorithm behavior
 * 
 * Using enhanced evolution strategy with:
 * - Top-N parent selection for diversity
 * - Uniform crossover for genetic mixing
 * - Stagnation diversity injection
 */
export const EVOLUTION_CONFIG = {
  // Population
  populationSize: 36,           // Number of creatures per generation (was 24)

  // Selection - Simplified for deterministic approach
  eliteCount: 1,                // Winner only (unmodified copy)
  cloneTopPercent: 0.5,         // Top 50% are exact clones

  // Mutation - Stronger for early exploration
  mutationRate: 0.10,           // 10% chance per weight (moderate exploration)
  mutationSize: 0.7,            // 0.7 = strong mutations for early training (was 0.4)
  maxMutationRate: 0.20,        // Cap at 20% during stagnation
  stagnantMutBonus: 0.01,       // Slight increase per stagnant gen

  // Simulation Duration
  generationDuration: 15,        // Seconds per generation (longer to learn walking, was 12)
  simulationSpeed: 1,           // Speed multiplier (default 1x)

  // Neural Network Architecture
  hiddenLayers: 2,              // Number of hidden layers (was 1)
  neuronsPerLayer: 16,          // Neurons per hidden layer (was 12)
  activation: 'tanh',           // Activation function

  // Creature Behavior
  selfCollision: true, // Enable collision between creature's own bodies (prevents folding)
};
