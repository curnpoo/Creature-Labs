/**
 * Top HUD bar updates — richer stat info.
 */
export class HUD {
  constructor() {
    this.lastGeneration = null;
    this.lastAllTimeBest = null;
    this.els = {
      gen: document.getElementById('hud-gen'),
      genBest: document.getElementById('hud-genbest'),
      genBestLabel: document.getElementById('hud-genbest-label'),
      allBest: document.getElementById('hud-allbest'),
      improve: document.getElementById('hud-improve'),
      stagnant: document.getElementById('hud-stagnant'),
      time: document.getElementById('hud-time'),
      elapsed: document.getElementById('hud-elapsed'),
      poplive: document.getElementById('hud-poplive'),
      fps: document.getElementById('hud-fps'),
      effmut: document.getElementById('hud-effmut'),
      mode: document.getElementById('hud-mode')
    };
  }

  _formatElapsed(totalSeconds) {
    const s = Math.max(0, Number(totalSeconds) || 0);
    if (s < 120) return `${s.toFixed(1)}s`;
    const minutes = s / 60;
    if (minutes < 60) return `${minutes.toFixed(1)}m`;
    const hours = minutes / 60;
    if (hours < 24) return `${hours.toFixed(1)}h`;
    const days = hours / 24;
    return `${days.toFixed(1)}d`;
  }

  update(sim) {
    const safe = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
    const latestProgress = Array.isArray(sim.progressHistory) && sim.progressHistory.length
      ? sim.progressHistory[sim.progressHistory.length - 1]
      : null;
    const latestGenBest = Number.isFinite(Number(latestProgress?.genBest))
      ? Number(latestProgress.genBest)
      : 0;
    const leader = sim.visualLeader || (typeof sim.getLeader === 'function' ? sim.getLeader() : null);
    const leaderX = leader && typeof leader.getX === 'function' ? leader.getX() : Number(leader?.x);
    const currentDist = Number.isFinite(leaderX)
      ? (typeof sim.distMetersContinuousFromX === 'function'
        ? sim.distMetersContinuousFromX(leaderX)
        : (typeof sim.distMetersFromX === 'function' ? sim.distMetersFromX(leaderX) : 0))
      : 0;
    const showingTurboGenBest = sim.trainingMode === 'turbo' && !sim.sandboxMode;
    const primaryDistance = showingTurboGenBest ? latestGenBest : currentDist;
    const generationChanged = this.lastGeneration !== null && sim.generation > this.lastGeneration;
    const allTimeBestImproved = this.lastAllTimeBest !== null && sim.allTimeBest > this.lastAllTimeBest + 1e-6;

    if (this.els.gen) this.els.gen.textContent = String(sim.generation);
    if (this.els.genBest) this.els.genBest.textContent = `${primaryDistance.toFixed(2)}m`;
    if (this.els.genBestLabel) this.els.genBestLabel.textContent = showingTurboGenBest ? 'GEN BEST' : 'CURRENT';
    if (this.els.allBest) this.els.allBest.textContent = `${safe(sim.allTimeBest).toFixed(2)}m`;

    if (generationChanged && sim.trainingMode === 'normal' && !sim.sandboxMode && this.els.gen) {
      this.els.gen.classList.remove('stat-gold-flash');
      void this.els.gen.offsetWidth;
      this.els.gen.classList.add('stat-gold-flash');
    }
    if (allTimeBestImproved && this.els.allBest) {
      this.els.allBest.classList.remove('stat-gold-flash');
      void this.els.allBest.offsetWidth;
      this.els.allBest.classList.add('stat-gold-flash');
    }

    // Delta is generation-relative:
    // - positive when this generation sets a new record,
    // - negative when this generation regresses below all-time best.
    const prevAll = safe(sim.prevAllTimeBest);
    const allBest = safe(sim.allTimeBest);
    const delta = latestGenBest > prevAll + 1e-6
      ? (latestGenBest - prevAll)
      : (latestGenBest - allBest);
    if (this.els.improve) {
      this.els.improve.textContent = `${delta >= 0 ? '+' : ''}${delta.toFixed(2)}m`;
      this.els.improve.style.color = delta > 0 ? '#6ee7b7' : '#fca5a5';
    }
    if (this.els.stagnant) this.els.stagnant.textContent = `${sim.stagnantGens}g`;
    if (this.els.time) this.els.time.textContent = `${Math.max(0, safe(sim.timer)).toFixed(2)}s`;
    if (this.els.elapsed) {
      this.els.elapsed.textContent = this._formatElapsed(
        safe(sim.runElapsedSec, safe(sim.simTimeElapsed))
      );
    }
    if (this.els.fps) this.els.fps.textContent = String(Math.round(safe(sim.fpsSmoothed, 0)));

    // Active creatures count
    if (this.els.poplive) {
      const alive = sim.trainingMode === 'turbo'
        ? (sim.turboPopulationLive || sim.popSize)
        : (typeof sim.getAliveCreatureCount === 'function'
          ? sim.getAliveCreatureCount()
          : sim.creatures.reduce((count, c) => count + (c?.dead ? 0 : 1), 0));
      const total = sim.sandboxMode ? 1 : sim.popSize;
      this.els.poplive.textContent = `${alive}/${total}`;
    }

    // Effective mutation rate
    if (this.els.effmut) {
      const eff = sim.effectiveMutationRate ? sim.effectiveMutationRate() : sim.mutationRate;
      this.els.effmut.textContent = `${(eff * 100).toFixed(0)}%`;
    }

    // Mode indicator
    if (this.els.mode) {
      if (sim.sandboxMode) {
        this.els.mode.textContent = 'SANDBOX';
        this.els.mode.style.color = '#34d399';
      } else if (sim.trainingMode === 'turbo') {
        this.els.mode.textContent = `TURBO MODE (${(sim.turboStatus || 'idle').toUpperCase()})`;
        this.els.mode.style.color = '#f59e0b';
      } else {
        const algorithmTag = String(sim.trainingAlgorithm || '').toLowerCase() === 'neat' ? ' • NEAT' : '';
        this.els.mode.textContent = `TRAIN${algorithmTag}`;
        this.els.mode.style.color = '#22d3ee';
      }
    }

    this.lastGeneration = sim.generation;
    this.lastAllTimeBest = sim.allTimeBest;
  }
}
