/**
 * Neural network visualization — clean, math-video style.
 * Inspired by 3Blue1Brown / Pezzza's Work aesthetics:
 *   • Large smooth circles for neurons
 *   • Color fill = activation level (blue ↔ neutral ↔ orange)
 *   • Connection lines colored + sized by weight magnitude
 *   • Subtle glow on active neurons
 *   • Architecture info overlay (layers, neurons, params)
 *   • Clean layer labels
 */
export class Visualizer {
  constructor(canvasEl) {
    this.canvas = canvasEl;
    this.ctx = canvasEl ? canvasEl.getContext('2d') : null;
    this._dpr = window.devicePixelRatio || 1;
    this._resized = false;
    // Track prev architecture for change animation
    this._prevArchKey = null;
    this._archChangedAt = 0;
  }

  _ensureHiDPI() {
    if (this._resized) return;
    const canvas = this.canvas;
    if (!canvas) return;
    const dpr = this._dpr;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0) return; // Not visible yet
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    this.ctx.scale(dpr, dpr);
    this._resized = true;
    this._cssW = rect.width;
    this._cssH = rect.height;
  }

  render(leader) {
    if (!this.ctx || !this.canvas) return;

    // Re-check size each frame (panels can resize)
    const rect = this.canvas.getBoundingClientRect();
    const dpr = this._dpr;
    if (Math.abs(rect.width * dpr - this.canvas.width) > 2 ||
        Math.abs(rect.height * dpr - this.canvas.height) > 2) {
      this._resized = false;
    }
    this._ensureHiDPI();

    const w = this._cssW || rect.width;
    const h = this._cssH || rect.height;
    const ctx = this.ctx;

    ctx.clearRect(0, 0, w, h);

    // Solid dark background for better visibility
    ctx.fillStyle = 'rgba(8, 12, 20, 0.85)';
    ctx.fillRect(0, 0, w, h);

    // Subtle border/frame effect
    ctx.strokeStyle = 'rgba(0, 242, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.strokeRect(1, 1, w - 2, h - 2);

    if (!leader || !leader.brain) {
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = 'bold 12px "Inter", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Waiting for creature...', w / 2, h / 2);
      ctx.font = '10px "Inter", sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.fillText('Neural network will appear here', w / 2, h / 2 + 18);
      ctx.textAlign = 'left';
      return;
    }

    const nn = leader.brain;
    const layers = nn.layerSizes;
    const activations = nn.activations;
    const numLayers = layers.length;
    const arch = leader.architecture || {};
    const hiddenLayers = arch.hiddenLayers ?? (numLayers - 2);
    const neuronsPerLayer = arch.neuronsPerLayer ?? layers[1];
    const totalParams = nn.weightCount || nn.getWeightCount?.() || 0;

    // Detect architecture change → flash indicator
    const archKey = `${hiddenLayers}:${neuronsPerLayer}`;
    if (archKey !== this._prevArchKey) {
      if (this._prevArchKey !== null) {
        this._archChangedAt = performance.now();
      }
      this._prevArchKey = archKey;
    }
    const msSinceChange = performance.now() - this._archChangedAt;
    const showChangePulse = msSinceChange < 2000; // 2s flash

    // --- Architecture info bar (top of canvas) ---
    const INFO_H = 24; // pixels reserved at top for info bar
    const padX = 30;
    const padY = INFO_H + 10;
    const padBottom = 24;

    // Info bar background
    if (showChangePulse) {
      const pulse = Math.max(0, 1 - msSinceChange / 2000);
      ctx.fillStyle = `rgba(0, 242, 255, ${pulse * 0.12})`;
      ctx.fillRect(0, 0, w, INFO_H);
    }

    // Architecture text - larger and more visible
    ctx.font = 'bold 11px "Inter", monospace';
    ctx.textBaseline = 'middle';

    const paramStr = totalParams >= 1000
      ? `${(totalParams / 1000).toFixed(1)}k params`
      : `${totalParams} params`;

    let archLabel, archColor;
    if (hiddenLayers === 0) {
      // Linear network — should never happen after our fixes, but label it clearly
      archLabel = `LINEAR — no hidden layers | ${paramStr}`;
      archColor = 'rgba(255, 80, 80, 0.9)';
    } else {
      const layerStr = hiddenLayers === 1 ? '1 hidden layer' : `${hiddenLayers} hidden layers`;
      archLabel = `${layerStr} × ${neuronsPerLayer} neurons | ${paramStr}`;
      archColor = showChangePulse ? 'rgba(0,242,255,1)' : 'rgba(0,242,255,0.8)';
    }

    // Left-aligned arch info
    ctx.textAlign = 'left';
    ctx.fillStyle = archColor;
    ctx.fillText(archLabel, padX, INFO_H / 2);

    // Right-aligned: "EVOLVED" flash when arch just changed
    if (showChangePulse) {
      const pulse = Math.max(0, 1 - msSinceChange / 2000);
      ctx.textAlign = 'right';
      ctx.fillStyle = `rgba(0, 255, 160, ${pulse})`;
      ctx.font = 'bold 10px "Inter", monospace';
      ctx.fillText('⟳ EVOLVED', w - padX, INFO_H / 2);
    }

    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';

    // --- Layout ---
    const usableW = w - padX * 2;
    const usableH = h - padY - padBottom;
    const layerSpacing = usableW / Math.max(1, numLayers - 1);

    // Determine node radius based on available space (larger for better visibility)
    const maxNodesInLayer = Math.max(...layers.map(s => Math.min(s, 20)));
    const nodeRadius = Math.max(5, Math.min(14, (usableH / maxNodesInLayer) * 0.35));

    // Compute node positions
    const positions = [];
    for (let l = 0; l < numLayers; l++) {
      const layerPos = [];
      const size = layers[l];
      const maxShow = Math.min(size, 20);
      const gap = Math.min(nodeRadius * 2.8, usableH / Math.max(1, maxShow));
      const totalH = (maxShow - 1) * gap;
      const startY = padY + (usableH - totalH) / 2;

      for (let n = 0; n < maxShow; n++) {
        layerPos.push({
          x: padX + l * layerSpacing,
          y: startY + n * gap,
          idx: n,
          total: size
        });
      }
      positions.push(layerPos);
    }

    // --- Draw connections ---
    let offset = 0;
    for (let l = 1; l < numLayers; l++) {
      const prevSize = layers[l - 1];
      const currSize = layers[l];
      const prevPos = positions[l - 1];
      const currPos = positions[l];

      for (let j = 0; j < currPos.length; j++) {
        for (let k = 0; k < prevPos.length; k++) {
          const wIdx = offset + j * prevSize + k;
          const weight = wIdx < nn.weights.length ? nn.weights[wIdx] : 0;
          const absW = Math.abs(weight);

          if (absW < 0.03) continue;

          ctx.beginPath();
          ctx.moveTo(prevPos[k].x, prevPos[k].y);
          ctx.lineTo(currPos[j].x, currPos[j].y);

          const alpha = Math.min(0.55, absW * 0.25);
          const lw = Math.min(2.5, 0.3 + absW * 0.7);

          if (weight > 0) {
            ctx.strokeStyle = `rgba(80, 180, 255, ${alpha})`;
          } else {
            ctx.strokeStyle = `rgba(255, 100, 80, ${alpha})`;
          }
          ctx.lineWidth = lw;
          ctx.stroke();
        }
      }
      offset += prevSize * currSize + currSize;
    }

    // --- Draw nodes ---
    for (let l = 0; l < numLayers; l++) {
      const layerPos = positions[l];
      const act = activations[l];
      const isInput = l === 0;
      const isOutput = l === numLayers - 1;

      for (let n = 0; n < layerPos.length; n++) {
        const pos = layerPos[n];
        const val = Math.max(-1, Math.min(1, act[pos.idx] || 0));
        const r = isInput || isOutput ? nodeRadius * 0.85 : nodeRadius;

        // Activation color: smooth blue → dark gray → orange
        let fillR, fillG, fillB;
        if (val > 0) {
          fillR = Math.round(40 + 215 * val);
          fillG = Math.round(40 + 130 * val);
          fillB = Math.round(60 - 30 * val);
        } else {
          const a = -val;
          fillR = Math.round(40 - 10 * a);
          fillG = Math.round(40 + 80 * a);
          fillB = Math.round(60 + 195 * a);
        }

        // Outer glow for strongly activated neurons
        if (Math.abs(val) > 0.4) {
          const glowAlpha = Math.min(0.35, Math.abs(val) * 0.3);
          const glowColor = val > 0
            ? `rgba(255, 170, 30, ${glowAlpha})`
            : `rgba(80, 140, 255, ${glowAlpha})`;
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, r + 4, 0, Math.PI * 2);
          ctx.fillStyle = glowColor;
          ctx.fill();
        }

        // Node circle
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgb(${fillR}, ${fillG}, ${fillB})`;
        ctx.fill();

        // Crisp border
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.lineWidth = 0.8;
        ctx.stroke();

        // Inner highlight (gives 3D look)
        ctx.beginPath();
        ctx.arc(pos.x - r * 0.25, pos.y - r * 0.25, r * 0.45, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${0.06 + Math.abs(val) * 0.08})`;
        ctx.fill();
      }

      // Truncation indicator
      if (layers[l] > 20) {
        const lastPos = layerPos[layerPos.length - 1];
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.font = '9px "Inter", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`+${layers[l] - 20}`, lastPos.x, lastPos.y + nodeRadius + 12);
        ctx.textAlign = 'left';
      }
    }

    // --- Layer labels ---
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = 'bold 10px "Inter", sans-serif';
    ctx.textAlign = 'center';
    for (let l = 0; l < numLayers; l++) {
      let label;
      if (l === 0) {
        label = `IN(${layers[l]})`;
      } else if (l === numLayers - 1) {
        label = `OUT(${layers[l]})`;
      } else {
        label = `H${l}(${layers[l]})`;
      }
      ctx.fillText(label, padX + l * layerSpacing, h - 6);
    }
    ctx.textAlign = 'left';
  }
}
