import { SCALE } from '../sim/Physics.js';

/**
 * Individual Metric Graph System
 * Creates separate sparkline-style graphs for training or testing mode.
 */
export class ProgressChart {
  constructor(rightCanvas, leftCanvas, leftMeta) {
    this.rightCanvas = rightCanvas;
    this.leftCanvas = leftCanvas;
    this.leftMeta = leftMeta;
    this.rightCtx = rightCanvas ? rightCanvas.getContext('2d') : null;
    this.leftCtx = leftCanvas ? leftCanvas.getContext('2d') : null;

    this.leftContainer = document.getElementById('left-metrics-container');
    this.topContainer = document.getElementById('top-metrics-container');
    this.bottomContainer = document.getElementById('bottom-metrics-container');

    this.mode = 'training';
    this.graphElements = new Map();

    this.catalog = {
      training: {
        metrics: [
          { id: 'fitness', label: 'Best Fitness', color: '#a855f7', getValue: p => p.bestFitness || 0, format: v => v.toFixed(2) },
          { id: 'allbest', label: 'All-Time Best', color: '#00f2ff', getValue: p => p.allBest, format: v => `${v.toFixed(2)}m` },
          { id: 'genbest', label: 'Best Distance (Gen)', color: '#ff0055', getValue: p => p.genBest, format: v => `${v.toFixed(2)}m` },
          { id: 'genelapsed', label: 'Gen Elapsed', color: '#f59e0b', getValue: p => p.genElapsedSec || 0, format: v => `${v.toFixed(2)}s` },
          { id: 'avgdist', label: 'Avg Distance', color: '#6ee7b7', getValue: p => p.avgDist, format: v => `${v.toFixed(2)}m` },
          {
            id: 'avgspeed',
            label: 'Avg Speed (Pop)',
            color: '#fbbf24',
            getValue: p => {
              if (Number.isFinite(p.avgSpeedMps)) return p.avgSpeedMps;
              return Number.isFinite(p.avgSpeed) ? (p.avgSpeed / SCALE) : 0;
            },
            format: v => `${v.toFixed(2)} m/s`
          },
          { id: 'avgslip', label: 'Avg Ground Slip', color: '#34d399', getValue: p => p.avgSlip || 0, format: v => v.toFixed(2) },
          { id: 'avgact', label: 'Avg Actuation', color: '#818cf8', getValue: p => (p.avgActuation || 0) * 100, format: v => `${v.toFixed(0)}%` },
          { id: 'evoscore', label: 'Evo Score', color: '#fb923c', getValue: p => p.evoScore, format: v => v.toFixed(2) },
          { id: 'champfit', label: 'Champion Fitness', color: '#f87171', getValue: p => p.championFitness || 0, format: v => v.toFixed(2) },
          { id: 'mutrate', label: 'Mutation Rate', color: '#ec4899', getValue: p => (p.mutationRate || 0) * 100, format: v => `${v.toFixed(0)}%` },
          { id: 'stagnant', label: 'Stagnant Gens', color: '#f59e0b', getValue: p => p.stagnantGens || 0, format: v => `${v}g` },
          { id: 'awards', label: 'Champion Awards', color: '#22d3ee', getValue: p => p.championAwards || 0, format: v => `${v}` },
          { id: 'popsize', label: 'Population Size', color: '#10b981', getValue: p => p.populationSize || 0, format: v => `${v}` }
        ],
        layout: {
          left: ['allbest', 'evoscore', 'mutrate', 'stagnant', 'awards', 'popsize'],
          top: ['fitness', 'allbest', 'avgspeed', 'avgslip', 'mutrate', 'awards'],
          bottom: ['fitness', 'genbest', 'genelapsed', 'avgspeed', 'avgslip', 'avgact']
        }
      },
      testing: {
        metrics: [
          { id: 'stepcov', label: 'Step Coverage', color: '#34d399', getValue: p => (p.stepCoverageRatio || 0) * 100, format: v => `${v.toFixed(2)}%` },
          { id: 'fdt', label: 'FixedDt Drift', color: '#fbbf24', getValue: p => Math.abs((p.fixedDtObserved || 0) - (p.fixedDtExpected || 0)) * 1000, format: v => `${v.toFixed(2)}ms` },
          { id: 'rankrho', label: 'Rank Spearman', color: '#22d3ee', getValue: p => p.rankSpearman || 0, format: v => v.toFixed(2) },
          { id: 'topkmis', label: 'Top-K Mismatch', color: '#f87171', getValue: p => p.rankTopKMismatch || 0, format: v => `${Math.round(v)}` },
          { id: 'wdelta', label: 'Winner Delta', color: '#fb923c', getValue: p => p.winnerDistanceDeltaPct || 0, format: v => `${v.toFixed(2)}%` },
          { id: 'sdelta', label: 'Median Delta', color: '#a78bfa', getValue: p => p.scoreMedianDeltaPct || 0, format: v => `${v.toFixed(2)}%` },
          { id: 'turbox', label: 'Turbo Throughput', color: '#fde047', getValue: p => p.throughputX || 0, format: v => `${v.toFixed(2)}x` },
          {
            id: 'trend',
            label: 'Trend Ratio',
            color: '#10b981',
            getValue: p => {
              const baseline = Math.abs(p.improvementSlopeBaseline || 0);
              if (baseline < 1e-6) return p.improvementSlopeTurbo >= 0 ? 100 : 0;
              return (p.improvementSlopeTurbo / p.improvementSlopeBaseline) * 100;
            },
            format: v => `${v.toFixed(0)}%`
          },
          {
            id: 'passrate',
            label: 'Pass Rate',
            color: '#eab308',
            getValue: (p, history, idx) => {
              const start = Math.max(0, idx - 19);
              const window = history.slice(start, idx + 1);
              if (!window.length) return 0;
              const pass = window.filter(item => item.status === 'pass').length;
              return (pass / window.length) * 100;
            },
            format: v => `${v.toFixed(0)}%`
          }
        ],
        layout: {
          left: ['stepcov', 'fdt', 'rankrho', 'passrate', 'turbox', 'trend'],
          top: ['stepcov', 'rankrho', 'passrate', 'wdelta', 'sdelta', 'turbox'],
          bottom: ['stepcov', 'rankrho', 'trend', 'passrate', 'wdelta', 'turbox']
        }
      }
    };

    this.createGraphElements();
  }

  setMode(mode) {
    const next = mode === 'testing' ? 'testing' : 'training';
    if (this.mode === next) return;
    this.mode = next;
    this.createGraphElements();
  }

  clear() {
    this.graphElements.forEach(graphEl => {
      const { ctx, canvas, valueEl } = graphEl;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      valueEl.textContent = '--';
    });
    if (this.rightCtx && this.rightCanvas) {
      this.rightCtx.clearRect(0, 0, this.rightCanvas.width, this.rightCanvas.height);
      this.rightCtx.fillStyle = 'rgba(0,0,0,0.12)';
      this.rightCtx.fillRect(0, 0, this.rightCanvas.width, this.rightCanvas.height);
    }
  }

  createGraphElements() {
    this.graphElements.clear();
    if (this.leftContainer) this.leftContainer.innerHTML = '';
    if (this.topContainer) this.topContainer.innerHTML = '';
    if (this.bottomContainer) this.bottomContainer.innerHTML = '';

    const modeConfig = this.catalog[this.mode];
    const findMetric = id => modeConfig.metrics.find(m => m.id === id);

    const mount = (location, ids) => {
      const container = location === 'left' ? this.leftContainer : (location === 'top' ? this.topContainer : this.bottomContainer);
      if (!container) return;
      ids.forEach(metricId => {
        const metric = findMetric(metricId);
        if (!metric) return;
        const graphEl = this.createMetricGraph(metric, location);
        container.appendChild(graphEl.container);
        this.graphElements.set(`${location}-${metric.id}`, graphEl);
      });
    };

    mount('left', modeConfig.layout.left);
    mount('top', modeConfig.layout.top);
    mount('bottom', modeConfig.layout.bottom);
  }

  createMetricGraph(metric, location) {
    const container = document.createElement('div');

    if (location === 'left') {
      container.style.cssText = 'display:flex;flex-direction:column;background:rgba(5,8,16,0.4);border:1px solid rgba(255,255,255,0.05);border-radius:6px;padding:6px 8px;min-height:70px;';
    } else if (location === 'top') {
      container.style.cssText = 'flex:1;display:flex;flex-direction:column;background:rgba(5,8,16,0.3);border-radius:4px;padding:4px 6px;min-width:0;';
    } else {
      container.style.cssText = 'display:flex;flex-direction:column;background:rgba(5,8,16,0.4);border:1px solid rgba(255,255,255,0.05);border-radius:6px;padding:6px 8px;min-height:90px;';
    }

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px;gap:4px;';

    const label = document.createElement('div');
    label.textContent = metric.label;
    label.style.cssText = `font-size:${location === 'top' ? '9px' : '10px'};color:rgba(255,255,255,0.44);font-family:"Inter",sans-serif;font-weight:600;text-transform:uppercase;letter-spacing:0.45px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;`;

    const value = document.createElement('div');
    value.style.cssText = `font-size:${location === 'top' ? '11px' : '13px'};color:${metric.color};font-weight:700;font-family:"Inter",sans-serif;letter-spacing:0.2px;white-space:nowrap;`;
    value.textContent = metric.format(0);

    header.appendChild(label);
    header.appendChild(value);

    const canvas = document.createElement('canvas');
    const canvasHeight = location === 'top' ? 32 : (location === 'left' ? 42 : 50);
    canvas.width = 300;
    canvas.height = canvasHeight;
    canvas.style.cssText = `width:100%;height:${canvasHeight}px;display:block;`;

    container.appendChild(header);
    container.appendChild(canvas);

    return { container, canvas, ctx: canvas.getContext('2d'), valueEl: value, metric };
  }

  _historyForMode(sim) {
    return this.mode === 'testing' ? (sim.testingHistory || []) : (sim.progressHistory || []);
  }

  renderRight(sim) {
    if (!this.rightCtx || !this.rightCanvas) return;
    const ctx = this.rightCtx;
    const w = this.rightCanvas.width;
    const h = this.rightCanvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(0, 0, w, h);

    const history = this._historyForMode(sim);
    if (history.length < 2) {
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = '11px "Inter", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Waiting for data...', w / 2, h / 2 + 4);
      ctx.textAlign = 'left';
      return;
    }

    const keyA = this.mode === 'testing'
      ? (p => (p.stepCoverageRatio || 0) * 100)
      : (p => p.allBest || 0);
    const keyB = this.mode === 'testing'
      ? (p => (p.rankSpearman || 0) * 100)
      : (p => p.genBest || 0);
    const keyC = this.mode === 'testing'
      ? (p => p.winnerDistanceDeltaPct || 0)
      : (p => p.avgDist || 0);

    const values = history.flatMap(p => [keyA(p), keyB(p), keyC(p)]);
    const { min: minVal, max: maxVal } = this._computeAdaptiveRange(values, { minSpan: 1, includeZero: false });
    const span = Math.max(1e-6, maxVal - minVal);
    const pad = 6;
    const toX = i => (i / (history.length - 1)) * (w - pad * 2) + pad;
    const toY = v => h - pad - ((v - minVal) / span) * (h - pad * 2 - 4);

    this._drawLine(ctx, history, toX, toY, 'rgba(0,242,255,0.9)', keyA, 1.8);
    this._drawLine(ctx, history, toX, toY, 'rgba(255,0,85,0.75)', keyB, 1.2);
    this._drawLine(ctx, history, toX, toY, 'rgba(120,250,155,0.8)', keyC, 1.0);

    const latest = history[history.length - 1] || {};
    const safe = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.font = '9px "Inter", sans-serif';
    if (this.mode === 'testing') {
      ctx.fillText(`step ${(safe(latest.stepCoverageRatio) * 100).toFixed(2)}%`, 6, 11);
      ctx.fillText(`rho ${safe(latest.rankSpearman).toFixed(2)}`, 6, 21);
      ctx.textAlign = 'right';
      ctx.fillText(`status ${(latest.status || 'idle').toUpperCase()}`, w - 6, 11);
      ctx.textAlign = 'left';
    } else {
      ctx.fillText(`best ${safe(sim.allTimeBest).toFixed(2)}m`, 6, 11);
      ctx.fillText(`avg ${safe(latest.avgDist).toFixed(2)}m`, 6, 21);
    }
  }

  renderLeft(sim) {
    const history = this._historyForMode(sim);

    if (this.leftMeta) {
      if (this.mode === 'testing') {
        const latest = history.length ? history[history.length - 1] : null;
        const passCount = history.slice(-20).filter(item => item.status === 'pass').length;
        const passRate = history.length ? Math.round((passCount / Math.min(20, history.length)) * 100) : 0;
        const cycle = history.length;
        this.leftMeta.textContent = latest
          ? `G${latest.generation} · cycle ${cycle} · ${passRate}%`
          : 'Waiting for test cycle...';
      } else if (sim.progressHistory.length > 0) {
        const latest = sim.progressHistory[sim.progressHistory.length - 1];
        this.leftMeta.textContent = `G${latest.generation} · ${sim.championAwards} awards`;
      }
    }

    this.graphElements.forEach((graphEl, key) => {
      if (key.startsWith('left-') || key.startsWith('top-') || key.startsWith('bottom-')) {
        this.renderMetricGraph(graphEl, history, sim);
      }
    });
  }

  renderMetricGraph(graphEl, history) {
    if (!history.length) return;

    const { ctx, canvas, valueEl, metric } = graphEl;
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    const values = history.map((p, idx) => {
      const value = metric.getValue(p, history, idx);
      return Number.isFinite(value) ? value : 0;
    });
    const { min: minVal, max: maxVal } = this._computeAdaptiveRange(values, {
      minSpan: 0.1,
      includeZero: metric.id === 'mutrate' || metric.id === 'passrate' || metric.id === 'stepcov'
    });
    const span = Math.max(1e-6, maxVal - minVal);

    valueEl.textContent = metric.format(values[values.length - 1]);

    const pad = 2;
    const toX = i => (values.length <= 1 ? pad : (i / (values.length - 1)) * (w - pad * 2) + pad);
    const toY = v => h - pad - ((v - minVal) / span) * (h - pad * 2);

    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const midY = h / 2;
    ctx.moveTo(pad, midY);
    ctx.lineTo(w - pad, midY);
    ctx.stroke();

    if (values.length > 1) {
      ctx.beginPath();
      ctx.moveTo(toX(0), h - pad);
      values.forEach((val, i) => ctx.lineTo(toX(i), toY(val)));
      ctx.lineTo(toX(values.length - 1), h - pad);
      ctx.closePath();

      const rgb = this.hexToRgb(metric.color);
      ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15)`;
      ctx.fill();

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
    }

    const lastX = toX(values.length - 1);
    const lastY = toY(values[values.length - 1]);
    ctx.beginPath();
    ctx.arc(lastX, lastY, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = metric.color;
    ctx.fill();
  }

  hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
      : { r: 255, g: 255, b: 255 };
  }

  _computeAdaptiveRange(values, options = {}) {
    const finite = values.filter(v => Number.isFinite(v));
    const includeZero = options.includeZero === true;
    const minSpan = Number.isFinite(options.minSpan) ? Math.max(1e-4, options.minSpan) : 1;
    if (!finite.length) {
      return { min: includeZero ? 0 : -minSpan * 0.5, max: minSpan };
    }

    let min = Math.min(...finite);
    let max = Math.max(...finite);
    if (includeZero) min = Math.min(0, min);

    const rawSpan = Math.max(1e-6, max - min);
    const span = Math.max(minSpan, rawSpan);
    const pad = span * 0.12;
    min -= pad;
    max += pad;

    if (includeZero && min > 0) min = 0;
    if (max <= min) max = min + minSpan;
    return { min, max };
  }

  _drawLine(ctx, data, toX, toY, color, getVal, width = 1.6) {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    data.forEach((p, i) => {
      const x = toX(i);
      const y = toY(getVal(p));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
}
