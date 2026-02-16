/**
 * Top HUD bar updates.
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
      fps: document.getElementById('hud-fps')
    };
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
    if (this.els.fps) this.els.fps.textContent = String(Math.round(sim.fpsSmoothed));
  }
}
