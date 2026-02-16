/**
 * Individual Metric Graph System
 * Creates separate sparkline-style graphs for each evolution metric
 */
export class ProgressChart {
  constructor(rightCanvas, leftCanvas, leftMeta) {
    this.rightCanvas = rightCanvas;
    this.leftCanvas = leftCanvas;
    this.leftMeta = leftMeta;
    this.rightCtx = rightCanvas ? rightCanvas.getContext('2d') : null;
    this.leftCtx = leftCanvas ? leftCanvas.getContext('2d') : null;

    // Containers for individual graphs
    this.leftContainer = document.getElementById('left-metrics-container');
    this.topContainer = document.getElementById('top-metrics-container');
    this.bottomContainer = document.getElementById('bottom-metrics-container');

    // Individual metric graph configs
    this.metrics = [
      { id: 'fitness', label: 'Best Fitness', color: '#a855f7', getValue: p => p.bestFitness || 0, format: v => v.toFixed(1) },
      { id: 'allbest', label: 'All-Time Best', color: '#00f2ff', getValue: p => p.allBest, format: v => `${v.toFixed(1)}m` },
      { id: 'genbest', label: 'Gen Best', color: '#ff0055', getValue: p => p.genBest, format: v => `${v.toFixed(1)}m` },
      { id: 'avgdist', label: 'Avg Distance', color: '#6ee7b7', getValue: p => p.avgDist, format: v => `${v.toFixed(1)}m` },
      { id: 'avgspeed', label: 'Avg Speed', color: '#fbbf24', getValue: p => p.avgSpeed || 0, format: v => v.toFixed(2) },
      { id: 'avgstab', label: 'Avg Stability', color: '#34d399', getValue: p => p.avgStability || 0, format: v => `${v.toFixed(0)}%` },
      { id: 'evoscore', label: 'Evo Score', color: '#fb923c', getValue: p => p.evoScore, format: v => v.toFixed(1) },
      { id: 'champfit', label: 'Champion Fitness', color: '#f87171', getValue: p => p.championFitness || 0, format: v => v.toFixed(1) },
    ];

    // Create graph elements
    this.graphElements = new Map();
    this.createGraphElements();
  }

  createGraphElements() {
    // Create left panel graphs (all metrics, vertical layout)
    if (this.leftContainer) {
      this.metrics.forEach(metric => {
        const graphEl = this.createMetricGraph(metric, 'left');
        this.leftContainer.appendChild(graphEl.container);
        this.graphElements.set(`left-${metric.id}`, graphEl);
      });
    }

    // Create top bar graphs (key metrics, horizontal)
    if (this.topContainer) {
      const topMetrics = ['fitness', 'allbest', 'avgspeed', 'avgstab'];
      topMetrics.forEach(metricId => {
        const metric = this.metrics.find(m => m.id === metricId);
        if (metric) {
          const graphEl = this.createMetricGraph(metric, 'top');
          this.topContainer.appendChild(graphEl.container);
          this.graphElements.set(`top-${metric.id}`, graphEl);
        }
      });
    }

    // Create bottom panel graphs (key metrics, horizontal cards)
    if (this.bottomContainer) {
      const bottomMetrics = ['fitness', 'allbest', 'genbest', 'avgdist', 'avgspeed', 'avgstab', 'evoscore'];
      bottomMetrics.forEach(metricId => {
        const metric = this.metrics.find(m => m.id === metricId);
        if (metric) {
          const graphEl = this.createMetricGraph(metric, 'bottom');
          this.bottomContainer.appendChild(graphEl.container);
          this.graphElements.set(`bottom-${metric.id}`, graphEl);
        }
      });
    }
  }

  createMetricGraph(metric, location) {
    const container = document.createElement('div');

    if (location === 'left') {
      // Vertical layout for left panel
      container.style.cssText = `
        display: flex;
        flex-direction: column;
        background: rgba(5, 8, 16, 0.4);
        border: 1px solid rgba(255, 255, 255, 0.05);
        border-radius: 6px;
        padding: 6px 8px;
        min-height: 70px;
      `;
    } else if (location === 'top') {
      // Horizontal mini cards for top
      container.style.cssText = `
        flex: 1;
        display: flex;
        flex-direction: column;
        background: rgba(5, 8, 16, 0.3);
        border-radius: 4px;
        padding: 4px 6px;
        min-width: 0;
      `;
    } else {
      // Bottom panel cards
      container.style.cssText = `
        display: flex;
        flex-direction: column;
        background: rgba(5, 8, 16, 0.4);
        border: 1px solid rgba(255, 255, 255, 0.05);
        border-radius: 6px;
        padding: 6px 8px;
        min-height: 90px;
      `;
    }

    // Header with label and value
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 4px;
      gap: 4px;
    `;

    const label = document.createElement('div');
    label.textContent = metric.label;
    label.style.cssText = `
      font-size: ${location === 'top' ? '9px' : '10px'};
      color: rgba(255, 255, 255, 0.4);
      font-family: 'JetBrains Mono', monospace;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    `;

    const value = document.createElement('div');
    value.style.cssText = `
      font-size: ${location === 'top' ? '11px' : '13px'};
      color: ${metric.color};
      font-weight: 600;
      font-family: 'JetBrains Mono', monospace;
      white-space: nowrap;
    `;
    value.textContent = metric.format(0);

    header.appendChild(label);
    header.appendChild(value);

    // Canvas for sparkline
    const canvas = document.createElement('canvas');
    const canvasHeight = location === 'top' ? 32 : (location === 'left' ? 42 : 50);
    canvas.width = 300;
    canvas.height = canvasHeight;
    canvas.style.cssText = `
      width: 100%;
      height: ${canvasHeight}px;
      display: block;
    `;

    container.appendChild(header);
    container.appendChild(canvas);

    return {
      container,
      canvas,
      ctx: canvas.getContext('2d'),
      valueEl: value,
      metric
    };
  }

  renderRight(sim) {
    // Keep the simple right mini chart for backwards compatibility
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

  renderLeft(sim) {
    // Update meta info
    if (this.leftMeta && sim.progressHistory.length > 0) {
      const latest = sim.progressHistory[sim.progressHistory.length - 1];
      this.leftMeta.textContent = `G${latest.generation} · ${sim.championAwards} awards`;
    }

    // Render all individual metric graphs
    this.graphElements.forEach((graphEl, key) => {
      if (key.startsWith('left-')) {
        this.renderMetricGraph(graphEl, sim.progressHistory, sim);
      }
    });

    // Render top bar metric graphs
    this.graphElements.forEach((graphEl, key) => {
      if (key.startsWith('top-')) {
        this.renderMetricGraph(graphEl, sim.progressHistory, sim);
      }
    });

    // Render bottom metric graphs
    this.graphElements.forEach((graphEl, key) => {
      if (key.startsWith('bottom-')) {
        this.renderMetricGraph(graphEl, sim.progressHistory, sim);
      }
    });
  }

  renderMetricGraph(graphEl, history, sim) {
    if (history.length < 2) return;

    const { ctx, canvas, valueEl, metric } = graphEl;
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    // Get data values
    const values = history.map(p => metric.getValue(p));
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const span = Math.max(0.1, maxVal - minVal);

    // Update current value display
    const latestValue = values[values.length - 1];
    valueEl.textContent = metric.format(latestValue);

    // Drawing functions
    const pad = 2;
    const toX = i => (i / (history.length - 1)) * (w - pad * 2) + pad;
    const toY = v => h - pad - ((v - minVal) / span) * (h - pad * 2);

    // Draw subtle grid line at middle
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const midY = h / 2;
    ctx.moveTo(pad, midY);
    ctx.lineTo(w - pad, midY);
    ctx.stroke();

    // Draw area fill
    ctx.beginPath();
    ctx.moveTo(toX(0), h - pad);
    values.forEach((val, i) => {
      ctx.lineTo(toX(i), toY(val));
    });
    ctx.lineTo(toX(values.length - 1), h - pad);
    ctx.closePath();

    // Semi-transparent fill based on metric color
    const rgb = this.hexToRgb(metric.color);
    ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15)`;
    ctx.fill();

    // Draw line
    ctx.beginPath();
    values.forEach((val, i) => {
      const x = toX(i);
      const y = toY(val);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = metric.color;
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // Draw dot at latest value
    const lastX = toX(values.length - 1);
    const lastY = toY(latestValue);
    ctx.beginPath();
    ctx.arc(lastX, lastY, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = metric.color;
    ctx.fill();
  }

  hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 255, g: 255, b: 255 };
  }

  // Helper drawing methods
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
}
