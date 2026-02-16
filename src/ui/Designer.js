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

  isValid() {
    const hasBone = this.constraints.some(c => c.type === 'bone');
    return this.nodes.length >= 2 && this.constraints.length >= 1 && hasBone;
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
      .map(n => ({ id: Number(n.id), x: Number(n.x), y: Number(n.y) }))
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
      if (!prev || (prev.type === 'bone' && c.type === 'muscle')) {
        deduped.set(key, { type: c.type, n1: a, n2: b });
      }
    });
    const constraints = Array.from(deduped.values());

    if (nodes.length < 2 || constraints.length < 1) {
      throw new Error('Design needs at least 2 nodes and 1 constraint.');
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
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
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
    const hitNode = this._findNodeAt(p.x, p.y);

    if (this.tool === 'move') {
      if (hitNode) { this._pushUndo(); this.dragNode = hitNode; }
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

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let x = 0; x < this.canvas.width; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, this.canvas.height); ctx.stroke();
    }
    for (let y = 0; y < this.canvas.height; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(this.canvas.width, y); ctx.stroke();
    }

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
      ctx.arc(n.x, n.y, 8, 0, Math.PI * 2);
      ctx.fillStyle = '#222';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = this.dragNode === n ? '#ffff00' : '#00f2ff';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(n.x, n.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
    });
  }
}
