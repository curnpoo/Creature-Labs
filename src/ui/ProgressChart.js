/**
 * Evolution progress graphs (right panel mini + left panel full).
 */
export class ProgressChart {
  constructor(rightCanvas, leftCanvas, leftMeta) {
    this.rightCanvas = rightCanvas;
    this.leftCanvas = leftCanvas;
    this.leftMeta = leftMeta;
    this.rightCtx = rightCanvas ? rightCanvas.getContext('2d') : null;
    this.leftCtx = leftCanvas ? leftCanvas.getContext('2d') : null;
  }

  renderRight(sim) {
    if (!this.rightCtx || !this.rightCanvas) return;
    const ctx = this.rightCtx;
    const w = this.rightCanvas.width;
    const h = this.rightCanvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1);

    if (sim.progressHistory.length < 2) return;

    const data = sim.progressHistory;
    const maxDist = Math.max(1, ...data.map(p => Math.max(p.allBest, p.evoScore, p.bestFitness || 0)));
    const minDist = Math.min(...data.map(p => Math.min(p.genBest, p.avgDist, p.bestFitness || 0)));
    const span = Math.max(1, maxDist - minDist);
    const toX = i => (i / (data.length - 1)) * (w - 8) + 4;
    const toY = v => h - 4 - ((v - minDist) / span) * (h - 12);

    const drawLine = (color, getVal, width = 1.4) => {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      data.forEach((p, i) => {
        const x = toX(i);
        const y = toY(getVal(p));
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke();
    };

    drawLine('rgba(0,242,255,0.95)', p => p.allBest, 1.8);
    drawLine('rgba(255,0,85,0.85)', p => p.genBest, 1.4);
    drawLine('rgba(120,250,155,0.9)', p => p.avgDist, 1.2);
    drawLine('rgba(255,210,70,0.9)', p => p.evoScore, 1.2);
    drawLine('rgba(186,130,255,0.95)', p => p.bestFitness || 0, 1.4);

    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = '10px monospace';
    const latest = data[data.length - 1];
    ctx.fillText(`best ${sim.allTimeBest}m`, 6, 11);
    ctx.fillText(`avg ${latest.avgDist.toFixed(1)}m`, 6, 22);
    ctx.fillText(`fit ${(latest.bestFitness || 0).toFixed(1)}`, 6, 33);
    ctx.fillText(`evo ${latest.evoScore.toFixed(1)}`, w - 102, 11);
    ctx.fillText(`awards ${sim.championAwards}`, w - 102, 22);
    ctx.fillText(`mut ${(sim.effectiveMutationRate() * 100).toFixed(0)}% x${sim.mutationSize.toFixed(2)}`, w - 102, 33);
  }

  renderLeft(sim) {
    if (!this.leftCtx || !this.leftCanvas) return;
    const ctx = this.leftCtx;
    const w = this.leftCanvas.width;
    const h = this.leftCanvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(5,10,18,0.8)';
    ctx.fillRect(0, 0, w, h);

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    for (let gy = 20; gy < h; gy += 38) {
      ctx.beginPath(); ctx.moveTo(36, gy); ctx.lineTo(w - 6, gy); ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(36, 8); ctx.lineTo(36, h - 24); ctx.lineTo(w - 6, h - 24);
    ctx.stroke();

    if (sim.progressHistory.length < 2) {
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.font = '12px monospace';
      ctx.fillText('Waiting for generations...', 56, h / 2);
      if (this.leftMeta) this.leftMeta.textContent = `G${sim.generation}`;
      return;
    }

    const data = sim.progressHistory;
    const maxY = Math.max(1, ...data.map(p => Math.max(p.bestFitness || 0, p.allBest, p.genBest)));
    const minY = Math.min(...data.map(p => Math.min(p.bestFitness || 0, p.genBest)));
    const span = Math.max(1, maxY - minY);
    const x0 = 38, y0 = h - 26;
    const gw = w - x0 - 8, gh = h - 34;
    const toX = i => x0 + (i / Math.max(1, data.length - 1)) * gw;
    const toY = v => y0 - ((v - minY) / span) * gh;

    const drawLine = (color, getVal, width = 1.6) => {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      data.forEach((p, i) => {
        const x = toX(i), y = toY(getVal(p));
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke();
    };

    drawLine('rgba(186,130,255,0.95)', p => p.bestFitness || 0, 2);
    drawLine('rgba(0,242,255,0.95)', p => p.allBest, 1.8);
    drawLine('rgba(255,0,85,0.85)', p => p.genBest, 1.3);

    const latest = data[data.length - 1];
    ctx.fillStyle = 'rgba(255,255,255,0.78)';
    ctx.font = '10px monospace';
    ctx.fillText(`best fit: ${(latest.bestFitness || 0).toFixed(1)}`, 42, 14);
    ctx.fillText(`best dist: ${latest.allBest}m`, 42, 25);
    ctx.fillText(`gen dist: ${latest.genBest}m`, 42, 36);

    if (this.leftMeta) {
      this.leftMeta.textContent = `G${latest.generation} A${sim.championAwards}`;
    }
  }
}
