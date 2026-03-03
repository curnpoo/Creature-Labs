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
  trainingAlgorithm: 'neat',
  // Population
  populationSize: 48,           // Number of creatures per generation

  // Selection - Simplified for deterministic approach
  eliteCount: 1,                // Winner only (unmodified copy)
  tournamentSize: 4,            // Legacy GA tournament size (unused in NEAT mode)
  cloneTopPercent: 0.5,         // Top 50% are exact clones

  // Mutation - Stronger for early exploration
  mutationRate: 0.10,           // 10% chance per weight (moderate exploration)
  mutationSize: 0.7,            // 0.7 = strong mutations for early training (was 0.4)
  maxMutationRate: 0.20,        // Cap at 20% during stagnation
  stagnantMutBonus: 0.01,       // Slight increase per stagnant gen

  // Simulation Duration
  generationDuration: 30,        // Seconds per generation
  simulationSpeed: 1,           // Speed multiplier (default 1x)

  // Neural Network Architecture
  hiddenLayers: 2,              // Number of hidden layers (was 1)
  neuronsPerLayer: 16,          // Neurons per hidden layer (was 12)
  activation: 'tanh',           // Activation function

  // NEAT defaults (used when trainingAlgorithm='neat')
  // Tuned to avoid single-species collapse and encourage steady topology growth.
  neatSurvivalRate: 0.30,
  neatSpeciesStagnation: 20,
  neatCrossoverRate: 0.85,
  neatCompatThreshold: 0.9,
  neatCompatThresholdMin: 0.15,
  neatCompatThresholdMax: 2.5,
  neatTargetSpeciesMin: 4,
  neatTargetSpeciesMax: 8,
  neatCompatAdjustStep: 0.20,
  neatC1: 1.0,
  neatC2: 1.0,
  neatC3: 3.0,
  neatWeightMutRate: 0.80,
  neatWeightPerturbRate: 0.90,
  neatWeightPerturbStd: 0.12,
  neatWeightResetStd: 0.40,
  neatBiasMutRate: 0.10,
  neatBiasPerturbStd: 0.06,
  neatAddConnRate: 0.24,
  neatAddNodeRate: 0.025,
  neatToggleRate: 0.03,
  neatDisableInheritedRate: 0.35,
  neatReenableBias: 0.85,
  neatSparseEnabledTarget: 0.45,
  neatTournamentSize: 3,
  initialConnectionDensity: 1.0,
  initialWeightStd: 0.60

};
