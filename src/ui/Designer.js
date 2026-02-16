/**
 * Creature design canvas + tools.
 */
export class Designer {
  constructor(containerEl, onValidChange) {
    this.container = containerEl;
    this.onValidChange = onValidChange;
    this.canvas = null;
    this.ctx = null;
    this.nodes = [];
    this.constraints = [];
    this.undoStack = [];
    this.nextId = 0;
    this.tool = 'node';
    this.dragStart = null;
    this.dragNode = null;
    this.mousePos = { x: 0, y: 0 };

    // Zoom and Pan
    this.zoom = 1.0;
    this.panX = 0;
    this.panY = 0;
    this.isPanning = false;
    this.panMode = false;
    this.lastPanPos = null;

    // Tooltip timing
    this.tooltipNode = null;
    this.tooltipStartTime = 0;

    this._setup();
  }

  _setup() {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.container.appendChild(this.canvas);
    this.resize();

    this.canvas.addEventListener('mousedown', e => this._onDown(e));
    this.canvas.addEventListener('mousemove', e => this._onMove(e));
    this.canvas.addEventListener('mouseup', e => this._onUp(e));
    this.canvas.addEventListener('mouseleave', e => this._onUp(e));
    this.canvas.addEventListener('wheel', e => this._onWheel(e), { passive: false });

    this.canvas.addEventListener('touchstart', e => {
      e.preventDefault();
      this._onDown(e.touches[0]);
    }, { passive: false });
    this.canvas.addEventListener('touchmove', e => {
      e.preventDefault();
      this._onMove(e.touches[0]);
    }, { passive: false });
    this.canvas.addEventListener('touchend', e => {
      e.preventDefault();
      this._onUp(e.changedTouches[0]);
    }, { passive: false });
  }

  resize() {
    if (this.canvas) {
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
    }
  }

  setTool(tool) {
    this.tool = tool;
  }

  togglePanMode() {
    this.panMode = !this.panMode;
    this.canvas.style.cursor = this.panMode ? 'grab' : 'crosshair';
    return this.panMode;
  }

  resetView() {
    this.zoom = 1.0;
    this.panX = 0;
    this.panY = 0;
    this.render();
  }

  isValid() {
    const hasBone = this.constraints.some(c => c.type === 'bone');
    const hasMuscle = this.constraints.some(c => c.type === 'muscle');
    return this.nodes.length >= 2 && hasBone && hasMuscle;
  }

  getDesign() {
    return {
      nodes: this.nodes.slice(),
      constraints: this.constraints.slice()
    };
  }

  loadDesign(payload) {
    if (!payload || !Array.isArray(payload.nodes) || !Array.isArray(payload.constraints)) {
      throw new Error('Invalid design JSON.');
    }
    const nodes = payload.nodes
      .map(n => ({ id: Number(n.id), x: Number(n.x), y: Number(n.y), fixed: !!n.fixed }))
      .filter(n => Number.isFinite(n.id) && Number.isFinite(n.x) && Number.isFinite(n.y));

    const nodeIds = new Set(nodes.map(n => n.id));
    const rawConstraints = payload.constraints
      .map(c => ({
        type: c.type === 'muscle' ? 'muscle' : 'bone',
        n1: Number(c.n1),
        n2: Number(c.n2)
      }))
      .filter(c => nodeIds.has(c.n1) && nodeIds.has(c.n2) && c.n1 !== c.n2);
    const deduped = new Map();
    rawConstraints.forEach(c => {
      const a = Math.min(c.n1, c.n2);
      const b = Math.max(c.n1, c.n2);
      const key = `${a}:${b}`;
      const prev = deduped.get(key);
      if (!prev || (prev.type === 'muscle' && c.type === 'bone')) {
        deduped.set(key, { type: c.type, n1: a, n2: b });
      }
    });
    const constraints = Array.from(deduped.values());

    const hasBone = constraints.some(c => c.type === 'bone');
    const hasMuscle = constraints.some(c => c.type === 'muscle');
    if (nodes.length < 2 || !hasBone || !hasMuscle) {
      throw new Error('Design needs at least 2 nodes, 1 bone, and 1 muscle.');
    }

    this._pushUndo();
    this.nodes = nodes;
    this.constraints = constraints;
    this.nextId = Math.max(...nodes.map(n => n.id)) + 1;
    this.dragNode = null;
    this.dragStart = null;
    this.render();
    this._checkValid();
  }

  clear() {
    this._pushUndo();
    this.nodes = [];
    this.constraints = [];
    this.nextId = 0;
    this.dragStart = null;
    this.dragNode = null;
    this.render();
    this._checkValid();
  }

  undo() {
    if (!this.undoStack.length) return;
    const state = this.undoStack.pop();
    this.nodes = state.nodes;
    this.constraints = state.constraints;
    this.nextId = state.nextId;
    this.dragStart = null;
    this.dragNode = null;
    this.render();
    this._checkValid();
  }

  saveToFile() {
    const payload = {
      version: 1,
      createdAt: new Date().toISOString(),
      nodes: this.nodes,
      constraints: this.constraints,
      nextId: this.nextId
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `polycreature-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // Private methods

  _pushUndo() {
    this.undoStack.push({
      nodes: this.nodes.map(n => ({ ...n })),
      constraints: this.constraints.map(c => ({ ...c })),
      nextId: this.nextId
    });
    if (this.undoStack.length > 80) this.undoStack.shift();
  }

  _checkValid() {
    if (this.onValidChange) this.onValidChange(this.isValid());
  }

  _relPoint(event) {
    const rect = this.canvas.getBoundingClientRect();
    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;
    // Transform from screen space to world space
    return {
      x: (screenX - this.panX) / this.zoom,
      y: (screenY - this.panY) / this.zoom
    };
  }

  _onWheel(event) {
    event.preventDefault();
    const delta = -event.deltaY * 0.001;
    const oldZoom = this.zoom;
    this.zoom = Math.max(0.25, Math.min(3.0, this.zoom * (1 + delta)));

    // Zoom toward mouse position
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    this.panX = mouseX - (mouseX - this.panX) * (this.zoom / oldZoom);
    this.panY = mouseY - (mouseY - this.panY) * (this.zoom / oldZoom);

    this.render();
  }

  _findNodeAt(x, y, radius = 14) {
    return this.nodes.find(n => Math.hypot(n.x - x, n.y - y) <= radius);
  }

  _distToSegment(px, py, ax, ay, bx, by) {
    const vx = bx - ax, vy = by - ay;
    const wx = px - ax, wy = py - ay;
    const c1 = vx * wx + vy * wy;
    if (c1 <= 0) return Math.hypot(px - ax, py - ay);
    const c2 = vx * vx + vy * vy;
    if (c2 <= c1) return Math.hypot(px - bx, py - by);
    const b = c1 / c2;
    return Math.hypot(px - (ax + b * vx), py - (ay + b * vy));
  }

  _findConstraintAt(x, y) {
    for (let i = this.constraints.length - 1; i >= 0; i--) {
      const c = this.constraints[i];
      const n1 = this.nodes.find(n => n.id === c.n1);
      const n2 = this.nodes.find(n => n.id === c.n2);
      if (!n1 || !n2) continue;
      if (this._distToSegment(x, y, n1.x, n1.y, n2.x, n2.y) <= 8) return i;
    }
    return -1;
  }

  _onDown(event) {
    const p = this._relPoint(event);
    this.mousePos = p;

    // Handle pan mode
    if (this.panMode || event.button === 1) { // Middle mouse button also pans
      this.isPanning = true;
      const rect = this.canvas.getBoundingClientRect();
      this.lastPanPos = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      this.canvas.style.cursor = 'grabbing';
      return;
    }

    const hitNode = this._findNodeAt(p.x, p.y);

    if (this.tool === 'move') {
      if (hitNode) { this._pushUndo(); this.dragNode = hitNode; }
      return;
    }

    if (this.tool === 'joint') {
      if (hitNode) {
        this._pushUndo();
        hitNode.fixed = !hitNode.fixed;
        this.render();
      }
      return;
    }

    if (this.tool === 'erase') {
      if (hitNode) {
        this._pushUndo();
        this.nodes = this.nodes.filter(n => n.id !== hitNode.id);
        this.constraints = this.constraints.filter(c => c.n1 !== hitNode.id && c.n2 !== hitNode.id);
        this.render();
        this._checkValid();
        return;
      }
      const cIdx = this._findConstraintAt(p.x, p.y);
      if (cIdx >= 0) {
        this._pushUndo();
        this.constraints.splice(cIdx, 1);
        this.render();
        this._checkValid();
      }
      return;
    }

    if (this.tool === 'node') {
      if (!hitNode) {
        // Check for split
        const cIdx = this._findConstraintAt(p.x, p.y);
        if (cIdx >= 0) {
           const c = this.constraints[cIdx];
           const n1 = this.nodes.find(n => n.id === c.n1);
           const n2 = this.nodes.find(n => n.id === c.n2);
           if (n1 && n2) {
               const vx = n2.x - n1.x, vy = n2.y - n1.y;
               const wx = p.x - n1.x, wy = p.y - n1.y;
               const len2 = vx*vx + vy*vy;
               const t = Math.max(0, Math.min(1, (wx*vx + wy*vy) / len2));
               
               this._pushUndo();
               const newNode = { id: this.nextId++, x: n1.x + t*vx, y: n1.y + t*vy, fixed: true };
               this.nodes.push(newNode);
               
               this.constraints.splice(cIdx, 1);
               this.constraints.push({ type: c.type, n1: c.n1, n2: newNode.id });
               this.constraints.push({ type: c.type, n1: newNode.id, n2: c.n2 });
               
               this.render();
               this._checkValid();
               return;
           }
        }

        this._pushUndo();
        this.nodes.push({ id: this.nextId++, x: p.x, y: p.y });
        this.render();
        this._checkValid();
      } else {
        this.dragStart = hitNode;
      }
      return;
    }

    if (hitNode) this.dragStart = hitNode;
  }

  _onMove(event) {
    const rect = this.canvas.getBoundingClientRect();
    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;

    // Handle panning
    if (this.isPanning && this.lastPanPos) {
      this.panX += screenX - this.lastPanPos.x;
      this.panY += screenY - this.lastPanPos.y;
      this.lastPanPos = { x: screenX, y: screenY };
      this.render();
      return;
    }

    const p = this._relPoint(event);
    this.mousePos = p;
    if (this.dragNode) {
      this.dragNode.x = p.x;
      this.dragNode.y = p.y;
      this.render();
      return;
    }
    if (this.dragStart) this.render();
  }

  _onUp(event) {
    // Reset panning
    if (this.isPanning) {
      this.isPanning = false;
      this.lastPanPos = null;
      this.canvas.style.cursor = this.panMode ? 'grab' : 'crosshair';
      return;
    }

    const p = event.clientX ? this._relPoint(event) : this.mousePos;
    this.mousePos = p;

    if (this.dragNode) {
      this.dragNode = null;
      this.render();
      this._checkValid();
      return;
    }
    if (!this.dragStart) return;

    const endNode = this._findNodeAt(p.x, p.y, 20);
    if (endNode && endNode.id !== this.dragStart.id) {
      const exists = this.constraints.some(c =>
        (c.n1 === this.dragStart.id && c.n2 === endNode.id) ||
        (c.n1 === endNode.id && c.n2 === this.dragStart.id)
      );
      if (!exists) {
        this._pushUndo();
        this.constraints.push({
          type: this.tool === 'muscle' ? 'muscle' : 'bone',
          n1: this.dragStart.id,
          n2: endNode.id
        });
      }
    }
    this.dragStart = null;
    this.render();
    this._checkValid();
  }

  render() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Apply zoom and pan transform
    ctx.save();
    ctx.translate(this.panX, this.panY);
    ctx.scale(this.zoom, this.zoom);

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let x = 0; x < this.canvas.width; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, this.canvas.height); ctx.stroke();
    }
    for (let y = 0; y < this.canvas.height; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(this.canvas.width, y); ctx.stroke();
    }

    // GROUND REFERENCE LINE - Shows where creature will spawn
    const groundY = 410;
    ctx.strokeStyle = 'rgba(0, 242, 255, 0.4)';
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 5]);
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.lineTo(this.canvas.width, groundY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Ground label
    ctx.fillStyle = 'rgba(0, 242, 255, 0.7)';
    ctx.font = 'bold 11px "JetBrains Mono", monospace';
    ctx.fillText('GROUND', 10, groundY - 8);
    ctx.fillText('↓', this.canvas.width - 20, groundY + 20);

    // SCALE REFERENCE - Shows size
    const scaleY = this.canvas.height - 30;
    const scaleX = this.canvas.width - 150;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(scaleX, scaleY);
    ctx.lineTo(scaleX + 100, scaleY);
    ctx.moveTo(scaleX, scaleY - 5);
    ctx.lineTo(scaleX, scaleY + 5);
    ctx.moveTo(scaleX + 100, scaleY - 5);
    ctx.lineTo(scaleX + 100, scaleY + 5);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('100px', scaleX + 50, scaleY - 10);
    ctx.textAlign = 'left';

    // BOUNDING BOX & CENTER OF MASS - Shows creature size and balance
    if (this.nodes.length > 0) {
      const xs = this.nodes.map(n => n.x);
      const ys = this.nodes.map(n => n.y);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const width = maxX - minX;
      const height = maxY - minY;
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;

      // Bounding box
      ctx.strokeStyle = 'rgba(168, 85, 247, 0.3)';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(minX - 5, minY - 5, width + 10, height + 10);
      ctx.setLineDash([]);

      // Size label
      ctx.fillStyle = 'rgba(168, 85, 247, 0.7)';
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillText(`${width.toFixed(0)}×${height.toFixed(0)}px`, minX, minY - 10);

      // Center of mass indicator
      ctx.beginPath();
      ctx.arc(centerX, centerY, 4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(251, 191, 36, 0.6)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.9)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Distance from ground indicator
      const distFromGround = groundY - maxY;
      if (distFromGround > 5) {
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(centerX, maxY);
        ctx.lineTo(centerX, groundY);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = 'rgba(239, 68, 68, 0.8)';
        ctx.font = 'bold 11px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`↓ ${distFromGround.toFixed(0)}px to ground`, centerX, (maxY + groundY) / 2);
        ctx.textAlign = 'left';
      }
    }

    // INFO PANEL - Top left helper text
    ctx.fillStyle = 'rgba(10, 14, 24, 0.85)';
    ctx.fillRect(10, 10, 280, 85);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.strokeRect(10, 10, 280, 85);

    ctx.fillStyle = 'rgba(0, 242, 255, 0.9)';
    ctx.font = 'bold 11px "JetBrains Mono", monospace';
    ctx.fillText('CREATURE DESIGNER', 15, 25);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillText(`Nodes: ${this.nodes.length} | Constraints: ${this.constraints.length}`, 15, 42);

    const fixedCount = this.nodes.filter(n => n.fixed).length;
    const muscleCount = this.constraints.filter(c => c.type === 'muscle').length;
    const boneCount = this.constraints.filter(c => c.type === 'bone').length;

    ctx.fillStyle = 'rgba(255, 170, 0, 0.8)';
    ctx.fillText(`⬛ Fixed: ${fixedCount}`, 15, 56);
    ctx.fillStyle = 'rgba(192, 199, 205, 0.8)';
    ctx.fillText(`▬ Bones: ${boneCount}`, 100, 56);
    ctx.fillStyle = 'rgba(255, 0, 85, 0.8)';
    ctx.fillText(`▬ Muscles: ${muscleCount}`, 185, 56);

    const isValid = this.isValid();
    ctx.fillStyle = isValid ? 'rgba(34, 197, 94, 0.8)' : 'rgba(239, 68, 68, 0.8)';
    ctx.fillText(isValid ? '✓ Ready to evolve!' : '✗ Need 2+ nodes, 1 bone, 1 muscle', 15, 75);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.fillText('TIP: Keep feet near ground line for best results', 15, 88);

    // Constraints
    this.constraints.forEach(c => {
      const n1 = this.nodes.find(n => n.id === c.n1);
      const n2 = this.nodes.find(n => n.id === c.n2);
      if (!n1 || !n2) return;
      ctx.beginPath();
      ctx.moveTo(n1.x, n1.y);
      ctx.lineTo(n2.x, n2.y);
      ctx.lineWidth = c.type === 'muscle' ? 6 : 8;
      ctx.strokeStyle = c.type === 'muscle' ? '#ff0055' : '#70757d';
      ctx.lineCap = 'round';
      ctx.stroke();
      if (c.type === 'bone') {
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#c9d1d9';
        ctx.stroke();
      }
    });

    // Drag preview
    if (this.dragStart && (this.tool === 'bone' || this.tool === 'muscle' || this.tool === 'node')) {
      ctx.beginPath();
      ctx.moveTo(this.dragStart.x, this.dragStart.y);
      ctx.lineTo(this.mousePos.x, this.mousePos.y);
      ctx.lineWidth = 2;
      ctx.strokeStyle = this.tool === 'muscle' ? '#ff0055' : '#fff';
      ctx.setLineDash([6, 6]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Nodes
    this.nodes.forEach(n => {
      ctx.beginPath();
      if (n.fixed) {
        const sz = 16;
        ctx.rect(n.x - sz/2, n.y - sz/2, sz, sz);
      } else {
        ctx.arc(n.x, n.y, 8, 0, Math.PI * 2);
      }
      ctx.fillStyle = '#222';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = this.dragNode === n ? '#ffff00' : (n.fixed ? '#ffaa00' : '#00f2ff');
      ctx.stroke();

      ctx.beginPath();
      if (n.fixed) {
        const sz = 6;
        ctx.rect(n.x - sz/2, n.y - sz/2, sz, sz);
      } else {
        ctx.arc(n.x, n.y, 3, 0, Math.PI * 2);
      }
      ctx.fillStyle = '#fff';
      ctx.fill();
    });

    // HOVER TOOLTIP - Brief, semi-transparent node info
    if (this.mousePos) {
      const hoverNode = this._findNodeAt(this.mousePos.x, this.mousePos.y, 16);
      if (hoverNode) {
        // Track tooltip timing
        if (this.tooltipNode !== hoverNode) {
          this.tooltipNode = hoverNode;
          this.tooltipStartTime = Date.now();
        }

        // Only show for 1.2 seconds
        const elapsed = Date.now() - this.tooltipStartTime;
        if (elapsed < 1200) {
          const fadeOut = elapsed > 800 ? (1200 - elapsed) / 400 : 1.0;
          const connectedConstraints = this.constraints.filter(c =>
            c.n1 === hoverNode.id || c.n2 === hoverNode.id
          );
          const muscles = connectedConstraints.filter(c => c.type === 'muscle').length;
          const bones = connectedConstraints.filter(c => c.type === 'bone').length;

          // Position tooltip to not block node
          const tooltipX = hoverNode.x + 25;
          const tooltipY = hoverNode.y - 45;
          const tooltipW = 140;
          const tooltipH = 50;

          // Semi-transparent background
          ctx.fillStyle = `rgba(10, 14, 24, ${0.75 * fadeOut})`;
          ctx.fillRect(tooltipX, tooltipY, tooltipW, tooltipH);
          ctx.strokeStyle = hoverNode.fixed ?
            `rgba(255, 170, 0, ${0.6 * fadeOut})` :
            `rgba(0, 242, 255, ${0.6 * fadeOut})`;
          ctx.lineWidth = 1.5;
          ctx.strokeRect(tooltipX, tooltipY, tooltipW, tooltipH);

          // Tooltip text
          ctx.fillStyle = `rgba(255, 255, 255, ${0.9 * fadeOut})`;
          ctx.font = 'bold 9px "JetBrains Mono", monospace';
          ctx.fillText(`Node #${hoverNode.id}`, tooltipX + 6, tooltipY + 14);

          ctx.fillStyle = `rgba(255, 255, 255, ${0.7 * fadeOut})`;
          ctx.font = '8px "JetBrains Mono", monospace';
          ctx.fillText(`${hoverNode.fixed ? 'Fixed' : 'Free'}`, tooltipX + 6, tooltipY + 28);
          ctx.fillText(`${bones}B + ${muscles}M`, tooltipX + 6, tooltipY + 40);
        }
      } else {
        this.tooltipNode = null;
      }
    }

    // Restore transform for UI elements
    ctx.restore();

    // ZOOM & PAN INFO (drawn in screen space, not world space)
    ctx.fillStyle = 'rgba(10, 14, 24, 0.85)';
    ctx.fillRect(this.canvas.width - 150, this.canvas.height - 70, 140, 60);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.strokeRect(this.canvas.width - 150, this.canvas.height - 70, 140, 60);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.font = 'bold 10px "JetBrains Mono", monospace';
    ctx.fillText('VIEW CONTROLS', this.canvas.width - 145, this.canvas.height - 54);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.fillText(`Zoom: ${(this.zoom * 100).toFixed(0)}%`, this.canvas.width - 145, this.canvas.height - 38);
    ctx.fillText(`Pan: ${this.panMode ? 'ON' : 'OFF'}`, this.canvas.width - 145, this.canvas.height - 24);

    ctx.fillStyle = 'rgba(168, 85, 247, 0.7)';
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.fillText('Scroll: Zoom', this.canvas.width - 145, this.canvas.height - 12);
  }
}
