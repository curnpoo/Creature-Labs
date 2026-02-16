/**
 * Evolution progress graphs — polished live charting.
 * Right mini-chart (in top bar), Left full panel with two chart canvases.
 */
export class ProgressChart {
  constructor(rightCanvas, leftCanvas, leftMeta) {
    this.rightCanvas = rightCanvas;
    this.leftCanvas = leftCanvas;
    this.leftMeta = leftMeta;
    this.rightCtx = rightCanvas ? rightCanvas.getContext('2d') : null;
    this.leftCtx = leftCanvas ? leftCanvas.getContext('2d') : null;
    // Secondary metrics canvas (left panel bottom chart)
    this.leftMetricsCanvas = document.getElementById('left-metrics-canvas');
    this.leftMetricsCtx = this.leftMetricsCanvas ? this.leftMetricsCanvas.getContext('2d') : null;
    // Bottom score chart
    this.scoreCanvas = document.getElementById('score-progress-canvas');
    this.scoreCtx = this.scoreCanvas ? this.scoreCanvas.getContext('2d') : null;
  }

  /* ─── Shared Helpers ─── */

  _drawGrid(ctx, w, h, x0, y0, gw, gh, steps = 4) {
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= steps; i++) {
      const y = y0 - (i / steps) * gh;
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x0 + gw, y);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(x0, y0 - gh);
    ctx.lineTo(x0, y0);
    ctx.lineTo(x0 + gw, y0);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.stroke();
  }

  _drawLine(ctx, data, toX, toY, color, getVal, width = 1.6, dashed = false) {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    if (dashed) ctx.setLineDash([4, 3]);
    else ctx.setLineDash([]);
    data.forEach((p, i) => {
      const x = toX(i), y = toY(getVal(p));
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
  }

  _drawArea(ctx, data, toX, toY, baseline, color, getVal) {
    if (data.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(toX(0), baseline);
    data.forEach((p, i) => {
      ctx.lineTo(toX(i), toY(getVal(p)));
    });
    ctx.lineTo(toX(data.length - 1), baseline);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  _drawYLabels(ctx, minVal, maxVal, x0, y0, gh, steps = 4) {
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    for (let i = 0; i <= steps; i++) {
      const val = minVal + (i / steps) * (maxVal - minVal);
      const y = y0 - (i / steps) * gh;
      ctx.fillText(val.toFixed(val >= 100 ? 0 : 1), x0 - 4, y + 3);
    }
    ctx.textAlign = 'left';
  }

  /* ─── Right Mini-Chart (Top Bar) ─── */

  renderRight(sim) {
    if (!this.rightCtx || !this.rightCanvas) return;
    const ctx = this.rightCtx;
    const w = this.rightCanvas.width;
    const h = this.rightCanvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(0, 0, w, h);

    if (sim.progressHistory.length < 2) {
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = '11px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Waiting for data...', w / 2, h / 2 + 4);
      ctx.textAlign = 'left';
      return;
    }

    const data = sim.progressHistory;
    const maxDist = Math.max(1, ...data.map(p => Math.max(p.allBest, p.evoScore, p.bestFitness || 0)));
    const minDist = Math.min(...data.map(p => Math.min(p.genBest, p.avgDist, p.bestFitness || 0)));
    const span = Math.max(1, maxDist - minDist);

    const pad = 6;
    const toX = i => (i / (data.length - 1)) * (w - pad * 2) + pad;
    const toY = v => h - pad - ((v - minDist) / span) * (h - pad * 2 - 4);

    // Area fills
    this._drawArea(ctx, data, toX, toY, h, 'rgba(0,242,255,0.04)', p => p.allBest);
    this._drawArea(ctx, data, toX, toY, h, 'rgba(168,85,247,0.04)', p => p.bestFitness || 0);

    // Lines
    this._drawLine(ctx, data, toX, toY, 'rgba(0,242,255,0.9)', p => p.allBest, 1.8);
    this._drawLine(ctx, data, toX, toY, 'rgba(255,0,85,0.75)', p => p.genBest, 1.2);
    this._drawLine(ctx, data, toX, toY, 'rgba(120,250,155,0.8)', p => p.avgDist, 1.0);
    this._drawLine(ctx, data, toX, toY, 'rgba(255,210,70,0.8)', p => p.evoScore, 1.0);
    this._drawLine(ctx, data, toX, toY, 'rgba(186,130,255,0.9)', p => p.bestFitness || 0, 1.4);

    // Labels
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.font = '9px "JetBrains Mono", monospace';
    const latest = data[data.length - 1];
    ctx.fillText(`best ${sim.allTimeBest}m`, 6, 11);
    ctx.fillText(`avg ${latest.avgDist.toFixed(1)}m`, 6, 21);
    ctx.fillText(`fit ${(latest.bestFitness || 0).toFixed(1)}`, 6, 31);
    ctx.textAlign = 'right';
    ctx.fillText(`evo ${latest.evoScore.toFixed(1)}`, w - 6, 11);
    ctx.fillText(`awards ${sim.championAwards}`, w - 6, 21);
    ctx.fillText(`mut ${(sim.effectiveMutationRate() * 100).toFixed(0)}% ×${sim.mutationSize.toFixed(2)}`, w - 6, 31);
    ctx.textAlign = 'left';
  }

  /* ─── Left Main Chart (Evolution Progress) ─── */

  renderLeft(sim) {
    this._renderLeftMain(sim);
    this._renderLeftMetrics(sim);
    this._renderBottomScore(sim);
  }

  _renderLeftMain(sim) {
    if (!this.leftCtx || !this.leftCanvas) return;
    const ctx = this.leftCtx;
    const w = this.leftCanvas.width;
    const h = this.leftCanvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(5,8,16,0.85)';
    ctx.fillRect(0, 0, w, h);

    if (sim.progressHistory.length < 2) {
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = '11px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Waiting for generations...', w / 2, h / 2);
      ctx.textAlign = 'left';
      if (this.leftMeta) this.leftMeta.textContent = `G${sim.generation}`;
      return;
    }

    const data = sim.progressHistory;
    const maxY = Math.max(1, ...data.map(p => Math.max(p.bestFitness || 0, p.allBest, p.genBest)));
    const minY = Math.min(0, ...data.map(p => Math.min(p.bestFitness || 0, p.genBest)));
    const span = Math.max(1, maxY - minY);

    const x0 = 42, y0 = h - 28;
    const gw = w - x0 - 10, gh = h - 40;
    const toX = i => x0 + (i / Math.max(1, data.length - 1)) * gw;
    const toY = v => y0 - ((v - minY) / span) * gh;

    // Grid + axes
    this._drawGrid(ctx, w, h, x0, y0, gw, gh, 5);
    this._drawYLabels(ctx, minY, maxY, x0, y0, gh, 5);

    // X-axis generation labels
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    const step = Math.max(1, Math.floor(data.length / 6));
    for (let i = 0; i < data.length; i += step) {
      ctx.fillText(`G${data[i].generation}`, toX(i), y0 + 14);
    }
    ctx.textAlign = 'left';

    // Area fill for all-best
    this._drawArea(ctx, data, toX, toY, y0, 'rgba(0,242,255,0.06)', p => p.allBest);

    // Lines
    this._drawLine(ctx, data, toX, toY, 'rgba(168,85,247,0.95)', p => p.bestFitness || 0, 2.2);
    this._drawLine(ctx, data, toX, toY, 'rgba(0,242,255,0.9)', p => p.allBest, 1.8);
    this._drawLine(ctx, data, toX, toY, 'rgba(255,0,85,0.75)', p => p.genBest, 1.2);
    this._drawLine(ctx, data, toX, toY, 'rgba(120,250,155,0.7)', p => p.avgDist, 1.0);

    // Latest values as dots
    const latest = data[data.length - 1];
    const lastX = toX(data.length - 1);
    [[latest.bestFitness || 0, '#a855f7'], [latest.allBest, '#00f2ff'], [latest.genBest, '#ff0055']].forEach(([val, col]) => {
      ctx.beginPath();
      ctx.arc(lastX, toY(val), 3, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.fill();
    });

    if (this.leftMeta) {
      this.leftMeta.textContent = `G${latest.generation} · ${sim.championAwards} awards`;
    }
  }

  _renderLeftMetrics(sim) {
    if (!this.leftMetricsCtx || !this.leftMetricsCanvas) return;
    const ctx = this.leftMetricsCtx;
    const w = this.leftMetricsCanvas.width;
    const h = this.leftMetricsCanvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(5,8,16,0.85)';
    ctx.fillRect(0, 0, w, h);

    if (sim.progressHistory.length < 2) return;

    const data = sim.progressHistory;
    const vals = data.map(p => [p.evoScore, p.avgSpeed || 0, p.championFitness || 0]).flat();
    const maxV = Math.max(1, ...vals);
    const minV = Math.min(0, ...vals);
    const span = Math.max(1, maxV - minV);

    const x0 = 42, y0 = h - 24;
    const gw = w - x0 - 10, gh = h - 34;
    const toX = i => x0 + (i / Math.max(1, data.length - 1)) * gw;
    const toY = v => y0 - ((v - minV) / span) * gh;

    this._drawGrid(ctx, w, h, x0, y0, gw, gh, 3);
    this._drawYLabels(ctx, minV, maxV, x0, y0, gh, 3);

    this._drawLine(ctx, data, toX, toY, 'rgba(251,191,36,0.85)', p => p.evoScore, 1.6);
    this._drawLine(ctx, data, toX, toY, 'rgba(56,189,248,0.8)', p => (p.avgSpeed || 0) * 5, 1.2); // scaled for visibility
    this._drawLine(ctx, data, toX, toY, 'rgba(248,113,113,0.7)', p => p.championFitness || 0, 1.2, true);
  }

  /* ─── Bottom Score Chart ─── */

  _renderBottomScore(sim) {
    if (!this.scoreCtx || !this.scoreCanvas) return;
    const ctx = this.scoreCtx;
    const w = this.scoreCanvas.width;
    const h = this.scoreCanvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(5,8,16,0.7)';
    ctx.fillRect(0, 0, w, h);

    if (sim.progressHistory.length < 2) {
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Train to see history...', w / 2, h / 2 + 4);
      ctx.textAlign = 'left';
      return;
    }

    // Use history window from slider
    const windowEl = document.getElementById('inp-history-window');
    const windowSize = windowEl ? parseInt(windowEl.value, 10) : 120;
    const data = sim.progressHistory.slice(-windowSize);

    const maxV = Math.max(1, ...data.map(p => Math.max(p.allBest, p.bestFitness || 0, p.genBest)));
    const minV = Math.min(0, ...data.map(p => Math.min(p.genBest, p.avgDist)));
    const span = Math.max(1, maxV - minV);

    const pad = 6;
    const toX = i => pad + (i / Math.max(1, data.length - 1)) * (w - pad * 2);
    const toY = v => h - pad - ((v - minV) / span) * (h - pad * 2);

    this._drawArea(ctx, data, toX, toY, h, 'rgba(0,242,255,0.04)', p => p.allBest);

    this._drawLine(ctx, data, toX, toY, 'rgba(0,242,255,0.8)', p => p.allBest, 1.4);
    this._drawLine(ctx, data, toX, toY, 'rgba(255,0,85,0.65)', p => p.genBest, 1.0);
    this._drawLine(ctx, data, toX, toY, 'rgba(168,85,247,0.8)', p => p.bestFitness || 0, 1.2);
    this._drawLine(ctx, data, toX, toY, 'rgba(120,250,155,0.6)', p => p.avgDist, 0.8);

    // Training details cards
    const latest = data[data.length - 1];
    this._updateScoreCards(sim, latest);
  }

  _updateScoreCards(sim, latest) {
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    set('score-bestfit', (latest.bestFitness || 0).toFixed(1));
    set('score-avgdist', `${latest.avgDist.toFixed(2)}m`);
    set('score-avgstab', `${(latest.avgStability || 0).toFixed(0)}%`);
    set('score-avgspeed', (latest.avgSpeed || 0).toFixed(2));
    set('score-slip', '—');
    set('score-mut', `${(sim.effectiveMutationRate() * 100).toFixed(0)}%`);
    set('score-awards', String(sim.championAwards));

    const totalSec = Math.floor(sim.simTimeElapsed);
    if (totalSec < 60) {
      set('score-elapsed', `${totalSec}s`);
    } else {
      const m = Math.floor(totalSec / 60);
      const s = totalSec % 60;
      set('score-elapsed', `${m}:${String(s).padStart(2, '0')}`);
    }

    const modeEl = document.getElementById('score-mode');
    if (modeEl) {
      if (sim.sandboxMode) {
        modeEl.textContent = 'SANDBOX';
        modeEl.style.color = '#34d399';
      } else {
        modeEl.textContent = 'TRAINING';
        modeEl.style.color = '#22d3ee';
      }
    }

    const windowLabel = document.getElementById('val-history-window');
    const windowEl = document.getElementById('inp-history-window');
    if (windowLabel && windowEl) {
      windowLabel.textContent = `${windowEl.value}g`;
    }
  }
}
