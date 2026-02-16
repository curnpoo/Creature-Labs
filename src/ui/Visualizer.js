/**
 * Real NN topology visualization.
 * Draws nodes as circles in columns (input -> hidden -> output),
 * colored by activation, with connections sized by weight.
 */
export class Visualizer {
  constructor(canvasEl) {
    this.canvas = canvasEl;
    this.ctx = canvasEl ? canvasEl.getContext('2d') : null;
  }

  /**
   * Draw the neural network topology for the leader creature.
   * @param {Creature|null} leader
   */
  render(leader) {
    if (!this.ctx || !this.canvas) return;

    const w = this.canvas.width;
    const h = this.canvas.height;
    const ctx = this.ctx;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(0, 0, w, h);

    if (!leader || !leader.brain) return;

    const nn = leader.brain;
    const layers = nn.layerSizes;
    const activations = nn.activations;
    const numLayers = layers.length;

    // Layout
    const padX = 24;
    const padY = 12;
    const layerSpacing = (w - padX * 2) / Math.max(1, numLayers - 1);

    // Compute node positions
    const positions = [];
    for (let l = 0; l < numLayers; l++) {
      const layerPos = [];
      const size = layers[l];
      const maxShow = Math.min(size, 16); // Cap displayed nodes
      const nodeSpacing = (h - padY * 2) / Math.max(1, maxShow);
      const startY = padY + (h - padY * 2 - (maxShow - 1) * nodeSpacing) / 2;

      for (let n = 0; n < maxShow; n++) {
        layerPos.push({
          x: padX + l * layerSpacing,
          y: startY + n * nodeSpacing,
          idx: n,
          total: size
        });
      }
      positions.push(layerPos);
    }

    // Draw connections (weights)
    let offset = 0;
    for (let l = 1; l < numLayers; l++) {
      const prevSize = layers[l - 1];
      const currSize = layers[l];
      const prevPos = positions[l - 1];
      const currPos = positions[l];

      for (let j = 0; j < currPos.length; j++) {
        for (let k = 0; k < prevPos.length; k++) {
          // Get weight value
          const wIdx = offset + j * prevSize + k;
          const weight = wIdx < nn.weights.length ? nn.weights[wIdx] : 0;
          const absW = Math.abs(weight);

          if (absW < 0.05) continue; // Skip tiny weights

          ctx.beginPath();
          ctx.moveTo(prevPos[k].x, prevPos[k].y);
          ctx.lineTo(currPos[j].x, currPos[j].y);

          const alpha = Math.min(0.6, absW * 0.3);
          if (weight > 0) {
            ctx.strokeStyle = `rgba(100,200,255,${alpha})`;
          } else {
            ctx.strokeStyle = `rgba(255,80,80,${alpha})`;
          }
          ctx.lineWidth = Math.min(2.5, absW * 0.8);
          ctx.stroke();
        }
      }
      offset += prevSize * currSize + currSize;
    }

    // Draw nodes
    for (let l = 0; l < numLayers; l++) {
      const layerPos = positions[l];
      const act = activations[l];

      for (let n = 0; n < layerPos.length; n++) {
        const pos = layerPos[n];
        const val = act[pos.idx] || 0;

        // Color by activation: blue=negative, white=zero, red=positive
        let r, g, b;
        if (val > 0) {
          r = 255;
          g = Math.round(255 * (1 - val));
          b = Math.round(255 * (1 - val));
        } else {
          r = Math.round(255 * (1 + val));
          g = Math.round(255 * (1 + val));
          b = 255;
        }

        const radius = l === 0 || l === numLayers - 1 ? 3 : 4;

        ctx.beginPath();
        ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }

      // Show "..." if truncated
      if (layers[l] > 16) {
        const lastPos = layerPos[layerPos.length - 1];
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = '8px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`+${layers[l] - 16}`, lastPos.x, lastPos.y + 14);
      }
    }

    // Layer labels
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '7px monospace';
    ctx.textAlign = 'center';
    const labels = [];
    for (let l = 0; l < numLayers; l++) {
      if (l === 0) labels.push('IN');
      else if (l === numLayers - 1) labels.push('OUT');
      else labels.push(`H${l}`);
    }
    for (let l = 0; l < numLayers; l++) {
      ctx.fillText(`${labels[l]}(${layers[l]})`, padX + l * layerSpacing, h - 3);
    }
  }
}
