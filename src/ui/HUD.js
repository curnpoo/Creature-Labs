/**
 * Top HUD bar updates — richer stat info.
 */
export class HUD {
  constructor() {
    this.els = {
      gen: document.getElementById('hud-gen'),
      genBest: document.getElementById('hud-genbest'),
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
    const s = Math.floor(totalSeconds);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const sec = s % 60;
    if (m < 60) return `${m}:${String(sec).padStart(2, '0')}`;
    const h = Math.floor(m / 60);
    const min = m % 60;
    return `${h}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }

  update(sim) {
    if (this.els.gen) this.els.gen.textContent = String(sim.generation);
    if (this.els.genBest) this.els.genBest.textContent = `${sim.genBestDist}m`;
    if (this.els.allBest) this.els.allBest.textContent = `${sim.allTimeBest}m`;

    const delta = sim.allTimeBest - sim.prevAllTimeBest;
    if (this.els.improve) {
      this.els.improve.textContent = `${delta >= 0 ? '+' : ''}${delta}m`;
      this.els.improve.style.color = delta > 0 ? '#6ee7b7' : '#fca5a5';
    }
    if (this.els.stagnant) this.els.stagnant.textContent = `${sim.stagnantGens}g`;
    if (this.els.time) this.els.time.textContent = `${Math.max(0, sim.timer).toFixed(1)}s`;
    if (this.els.elapsed) this.els.elapsed.textContent = this._formatElapsed(sim.simTimeElapsed);
    if (this.els.fps) this.els.fps.textContent = String(Math.round(sim.fpsSmoothed));

    // Active creatures count
    if (this.els.poplive) {
      const alive = sim.creatures.length;
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
      } else {
        this.els.mode.textContent = 'TRAIN';
        this.els.mode.style.color = '#22d3ee';
      }
    }
  }
}
