/**
 * Evolution Health Monitor
 * Detects stagnation, provides feedback, and suggests/applies parameter adjustments
 */
export class EvolutionMonitor {
  constructor() {
    this.history = [];
    this.maxHistory = 50;
    this.lastAlert = null;
    this.alertCooldown = 5000; // 5 seconds between alerts
    this.lastAlertTime = 0;

    // Thresholds for detection
    this.thresholds = {
      stagnantCritical: 15,     // Generations without improvement = critical
      stagnantWarning: 8,       // Warning threshold
      diversityLow: 0.15,       // Low genetic diversity
      fitnessFlat: 0.001,       // Fitness barely changing
      plateauLength: 10         // How many gens to look back for plateau
    };

    // Auto-adapt mode
    this.autoAdaptEnabled = false;
    this.adaptHistory = [];
  }

  /**
   * Record generation results
   */
  recordGeneration(stats) {
    const record = {
      generation: stats.generation,
      genBest: stats.genBest,
      allBest: stats.allBest,
      avgDist: stats.avgDist,
      avgSpeed: stats.avgSpeed,
      avgStability: stats.avgStability,
      stagnantGens: stats.stagnantGens,
      mutationRate: stats.mutationRate,
      bestFitness: stats.bestFitness,
      populationSize: stats.populationSize,
      timestamp: Date.now()
    };

    this.history.push(record);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
  }

  /**
   * Analyze evolution health
   */
  analyzeHealth() {
    if (this.history.length < 5) {
      return {
        status: 'warming_up',
        message: 'Gathering data...',
        severity: 'info',
        suggestions: []
      };
    }

    const issues = [];
    const suggestions = [];
    let severity = 'good';

    const latest = this.history[this.history.length - 1];
    const stagnant = latest.stagnantGens;

    // Check 1: Stagnation
    if (stagnant >= this.thresholds.stagnantCritical) {
      issues.push(`Critical stagnation: ${stagnant} generations with no improvement`);
      severity = 'critical';
      suggestions.push({
        action: 'increase_mutation',
        description: 'Increase mutation rate to 15-20%',
        reason: 'Need more genetic diversity to escape local optimum',
        autoParams: { mutationRate: 0.18, mutationSize: 1.4 }
      });
      suggestions.push({
        action: 'reduce_population',
        description: 'Try reducing population to 8-12',
        reason: 'Smaller populations can evolve faster in tight fitness landscapes',
        autoParams: { popSize: 10 }
      });
      suggestions.push({
        action: 'adjust_fitness',
        description: 'Reduce stability penalty weights',
        reason: 'Creature may be over-optimizing for stability vs distance',
        autoParams: {
          stabilityRewardWeight: 0.5,
          spinPenaltyWeight: 2,
          jitterPenaltyWeight: 0.3
        }
      });
    } else if (stagnant >= this.thresholds.stagnantWarning) {
      issues.push(`Evolution slowing: ${stagnant} gens without improvement`);
      severity = severity === 'critical' ? 'critical' : 'warning';
      suggestions.push({
        action: 'increase_mutation',
        description: 'Increase mutation rate to 12-15%',
        reason: 'Moderate exploration boost may help',
        autoParams: { mutationRate: 0.13, mutationSize: 1.2 }
      });
    }

    // Check 2: Plateau detection (fitness not changing)
    if (this.history.length >= this.thresholds.plateauLength) {
      const recent = this.history.slice(-this.thresholds.plateauLength);
      const fitnessValues = recent.map(r => r.bestFitness);
      const fitnessRange = Math.max(...fitnessValues) - Math.min(...fitnessValues);
      const avgFitness = fitnessValues.reduce((a, b) => a + b, 0) / fitnessValues.length;
      const relativeVariation = fitnessRange / Math.max(0.01, Math.abs(avgFitness));

      if (relativeVariation < this.thresholds.fitnessFlat && stagnant >= 5) {
        issues.push('Fitness plateau detected - population converged prematurely');
        severity = severity === 'good' ? 'warning' : severity;
        suggestions.push({
          action: 'increase_diversity',
          description: 'Increase elite preservation & tournament size',
          reason: 'Preserve more variety in breeding pool',
          autoParams: { eliteCount: 3, tournamentSize: 5 }
        });
        suggestions.push({
          action: 'restart_population',
          description: 'Consider restarting with larger mutation shock',
          reason: 'Current gene pool may be exhausted',
          autoParams: { mutationRate: 0.25, mutationSize: 1.8 }
        });
      }
    }

    // Check 3: Low performance despite many generations
    if (latest.generation > 30 && latest.allBest < 5) {
      issues.push('Low absolute progress despite many generations');
      severity = severity === 'good' ? 'warning' : severity;
      suggestions.push({
        action: 'simplify_creature',
        description: 'Try a simpler creature design',
        reason: 'Complex designs may be harder to evolve',
        autoParams: null
      });
      suggestions.push({
        action: 'increase_sim_time',
        description: 'Increase generation duration to 20-30s',
        reason: 'Creatures may need more time to demonstrate ability',
        autoParams: { simDuration: 25 }
      });
      suggestions.push({
        action: 'check_fitness',
        description: 'Review fitness function weights',
        reason: 'Rewards might not align with desired behavior',
        autoParams: { distanceRewardWeight: 8, speedRewardWeight: 0.02 }
      });
    }

    // Check 4: Rapid initial progress, then stall
    if (this.history.length >= 20 && latest.generation > 15) {
      const early = this.history.slice(0, 10);
      const recent = this.history.slice(-10);
      const earlyImprovement = early[early.length - 1].allBest - early[0].allBest;
      const recentImprovement = recent[recent.length - 1].allBest - recent[0].allBest;

      if (earlyImprovement > 3 && recentImprovement < 1 && stagnant > 5) {
        issues.push('Initial success followed by stagnation - likely at local maximum');
        severity = severity === 'good' ? 'warning' : severity;
        suggestions.push({
          action: 'exploration_burst',
          description: 'Temporarily spike mutation to 20-30%',
          reason: 'Need exploration burst to escape local optimum',
          autoParams: { mutationRate: 0.25 }
        });
      }
    }

    // If no issues, we're good!
    if (issues.length === 0) {
      return {
        status: 'healthy',
        message: `Evolution progressing well (${stagnant}g since last improvement)`,
        severity: 'good',
        suggestions: [],
        stats: {
          currentGen: latest.generation,
          bestDistance: latest.allBest,
          stagnantGens: stagnant,
          mutationRate: (latest.mutationRate * 100).toFixed(1) + '%'
        }
      };
    }

    return {
      status: 'needs_attention',
      message: issues[0], // Primary issue
      allIssues: issues,
      severity,
      suggestions,
      stats: {
        currentGen: latest.generation,
        bestDistance: latest.allBest,
        stagnantGens: stagnant,
        mutationRate: (latest.mutationRate * 100).toFixed(1) + '%'
      }
    };
  }

  /**
   * Get user-friendly feedback message
   */
  getFeedback() {
    const health = this.analyzeHealth();

    // Don't spam alerts
    const now = Date.now();
    if (health.severity !== 'good' && now - this.lastAlertTime > this.alertCooldown) {
      this.lastAlert = health;
      this.lastAlertTime = now;
      return health;
    }

    return null;
  }

  /**
   * Apply automatic parameter adjustments
   * Now adjusts incrementally rather than setting absolute values
   */
  autoAdapt(sim) {
    if (!this.autoAdaptEnabled) return null;

    const health = this.analyzeHealth();
    if (health.severity === 'good' || health.suggestions.length === 0) {
      return null;
    }

    // Pick the most appropriate suggestion
    const suggestion = this.selectBestSuggestion(health.suggestions, sim);
    if (!suggestion || !suggestion.autoParams) return null;

    // Apply parameters with incremental adjustments
    const changes = [];
    for (const [key, adjustment] of Object.entries(suggestion.autoParams)) {
      if (key in sim) {
        const currentValue = sim[key];
        let newValue;

        // Check if adjustment is a relative multiplier (e.g., 1.2 for +20%)
        // or an absolute value (e.g., 0.18 for 18%)
        if (typeof adjustment === 'object' && adjustment !== null) {
          // New format: { relative: 1.2, min: 0.01, max: 1.0 }
          const multiplier = adjustment.relative || 1;
          newValue = currentValue * multiplier;
          if (adjustment.min !== undefined) newValue = Math.max(adjustment.min, newValue);
          if (adjustment.max !== undefined) newValue = Math.min(adjustment.max, newValue);
        } else if (typeof adjustment === 'number' && adjustment > 0 && adjustment < 2) {
          // Treat values between 0 and 2 as multipliers for small adjustments
          // This helps with backward compatibility while enabling relative adjustments
          newValue = currentValue * adjustment;
        } else {
          // Absolute value - only use if significantly different
          newValue = adjustment;
        }

        // Round to avoid floating point issues
        if (Math.abs(newValue) < 10) {
          newValue = Math.round(newValue * 1000) / 1000;
        } else {
          newValue = Math.round(newValue);
        }

        // Only apply if the change is meaningful (>5% difference)
        const relativeChange = Math.abs(newValue - currentValue) / (Math.abs(currentValue) + 0.001);
        if (relativeChange > 0.05) {
          sim[key] = newValue;
          changes.push({ param: key, from: currentValue, to: newValue });
        }
      }
    }

    // If no meaningful changes were made, don't record this adaptation
    if (changes.length === 0) {
      return null;
    }

    // Record adaptation
    this.adaptHistory.push({
      generation: this.history[this.history.length - 1]?.generation || 0,
      action: suggestion.action,
      changes,
      timestamp: Date.now()
    });

    return {
      action: suggestion.action,
      description: suggestion.description,
      changes
    };
  }

  /**
   * Select best suggestion based on severity and history
   */
  selectBestSuggestion(suggestions, sim) {
    // Avoid repeating same action too frequently
    const recentActions = this.adaptHistory
      .slice(-5)
      .map(a => a.action);

    // Filter out recently used actions
    const fresh = suggestions.filter(s =>
      !recentActions.includes(s.action)
    );

    // Return first fresh suggestion, or first overall if all are stale
    return fresh[0] || suggestions[0];
  }

  /**
   * Get visual indicator for UI
   */
  getStatusIndicator() {
    const health = this.analyzeHealth();

    const indicators = {
      'good': { icon: '✓', color: '#10b981', label: 'Healthy' },
      'info': { icon: '○', color: '#06b6d4', label: 'Starting' },
      'warning': { icon: '⚠', color: '#f59e0b', label: 'Warning' },
      'critical': { icon: '✕', color: '#ef4444', label: 'Stagnant' }
    };

    return {
      ...indicators[health.severity],
      health
    };
  }

  /**
   * Enable/disable auto-adaptation
   */
  setAutoAdapt(enabled) {
    this.autoAdaptEnabled = enabled;
  }

  /**
   * Get evolution insights for display
   */
  getInsights() {
    if (this.history.length < 10) return null;

    const recent = this.history.slice(-10);
    const improvements = recent.filter((r, i) =>
      i > 0 && r.allBest > recent[i - 1].allBest
    );

    const improvementRate = improvements.length / recent.length;
    const avgMutationRate = recent.reduce((sum, r) => sum + r.mutationRate, 0) / recent.length;
    const latest = recent[recent.length - 1];

    return {
      improvementRate: (improvementRate * 100).toFixed(0) + '%',
      avgMutationRate: (avgMutationRate * 100).toFixed(1) + '%',
      generation: latest.generation,
      progress: latest.allBest,
      trend: improvementRate > 0.3 ? 'improving' : improvementRate > 0.1 ? 'slow' : 'stagnant'
    };
  }
}
