import { SCALE } from '../sim/Physics.js';

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
    this.polygons = []; // Array of { id, vertices: [{x,y}], internalNodes: [nodeIds] }
    this.currentPolygon = []; // Vertices being drawn
    this.undoStack = [];
    this.nextId = 0;
    this.nextPolygonId = 0;
    this.tool = 'node';
    this.dragStart = null;
    this.dragNode = null;
    this.mousePos = { x: 0, y: 0 };

    // Zoom and pan
    this.zoom = 1.0;
    this.panX = 0;
    this.panY = 0;
    this.isPanning = false;
    this.lastPanPos = null;
    this.needsInitialCenter = true;

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
    this.canvas.style.cursor = tool === 'pan' ? 'grab' : 'crosshair';
  }

  resetView() {
    this.zoom = 1.0;
    this._centerOnCreature();
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
      constraints: this.constraints.slice(),
      polygons: this.polygons.map(p => ({ ...p, vertices: p.vertices.map(v => ({ ...v })) }))
    };
  }

  loadDesign(payload) {
    if (!payload || !Array.isArray(payload.nodes) || !Array.isArray(payload.constraints)) {
      throw new Error('Invalid design JSON.');
    }
    const nodes = payload.nodes
      .map(n => ({ id: Number(n.id), x: Number(n.x), y: Number(n.y), fixed: !!n.fixed, attachedToPolygon: n.attachedToPolygon || null }))
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

    // Load polygons if present
    const polygons = (payload.polygons || []).map(p => ({
      id: Number(p.id),
      vertices: (p.vertices || []).map(v => ({ x: Number(v.x), y: Number(v.y) })),
      internalNodes: p.internalNodes || []
    })).filter(p => p.vertices.length >= 3);

    const hasBone = constraints.some(c => c.type === 'bone');
    const hasMuscle = constraints.some(c => c.type === 'muscle');
    // Allow designs with polygons (they can have nodes inside the polygon)
    if (nodes.length < 2 || !hasBone || !hasMuscle) {
      throw new Error('Design needs at least 2 nodes, 1 bone, and 1 muscle.');
    }

    this._pushUndo();
    this.nodes = nodes;
    this.constraints = constraints;
    this.polygons = polygons;
    this.currentPolygon = [];
    this.nextId = Math.max(0, ...nodes.map(n => n.id)) + 1;
    this.nextPolygonId = polygons.length > 0 ? Math.max(0, ...polygons.map(p => p.id)) + 1 : 0;
    this.dragNode = null;
    this.dragStart = null;
    this._centerOnCreature();
    this.render();
    this._checkValid();
  }

  clear() {
    this._pushUndo();
    this.nodes = [];
    this.constraints = [];
    this.polygons = [];
    this.currentPolygon = [];
    this.nextId = 0;
    this.nextPolygonId = 0;
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
    this.polygons = state.polygons || [];
    this.currentPolygon = [];
    this.nextId = state.nextId;
    this.nextPolygonId = state.nextPolygonId || 0;
    this.dragStart = null;
    this.dragNode = null;
    this.render();
    this._checkValid();
  }

  saveToFile() {
    const payload = {
      version: 2,
      createdAt: new Date().toISOString(),
      nodes: this.nodes,
      constraints: this.constraints,
      polygons: this.polygons,
      nextId: this.nextId,
      nextPolygonId: this.nextPolygonId
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
      polygons: this.polygons.map(p => ({ ...p, vertices: p.vertices.map(v => ({ ...v })) })),
      nextId: this.nextId,
      nextPolygonId: this.nextPolygonId
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

    // Zoom toward canvas center
    const cx = this.canvas.width / 2;
    const cy = this.canvas.height / 2;
    this.panX = cx - (cx - this.panX) * (this.zoom / oldZoom);
    this.panY = cy - (cy - this.panY) * (this.zoom / oldZoom);

    this.render();
  }

  _findNodeAt(x, y, radius = 10) {
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

  _isPointInPolygon(x, y, vertices) {
    let inside = false;
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
      const xi = vertices[i].x, yi = vertices[i].y;
      const xj = vertices[j].x, yj = vertices[j].y;
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }
    return inside;
  }

  _findPolygonAt(x, y) {
    for (let i = this.polygons.length - 1; i >= 0; i--) {
      if (this._isPointInPolygon(x, y, this.polygons[i].vertices)) {
        return i;
      }
    }
    return -1;
  }

  _onDown(event) {
    // Middle mouse button or pan tool pans
    if (event.button === 1 || this.tool === 'pan') {
      this.isPanning = true;
      const rect = this.canvas.getBoundingClientRect();
      this.lastPanPos = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      this.canvas.style.cursor = 'grabbing';
      return;
    }

    const p = this._relPoint(event);
    this.mousePos = p;

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
        // Remove node from any polygon's internalNodes
        this.polygons.forEach(poly => {
          poly.internalNodes = poly.internalNodes.filter(id => id !== hitNode.id);
        });
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
        return;
      }
      // Check if clicking on a polygon to delete it
      const polyIdx = this._findPolygonAt(p.x, p.y);
      if (polyIdx >= 0) {
        this._pushUndo();
        this.polygons.splice(polyIdx, 1);
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

    // Polygon tool - click to add vertices, click near first to close
    if (this.tool === 'polygon') {
      // Check if clicking near first vertex to close polygon
      if (this.currentPolygon.length >= 3) {
        const first = this.currentPolygon[0];
        const dist = Math.hypot(p.x - first.x, p.y - first.y);
        if (dist < 20) {
          // Close the polygon
          this._pushUndo();
          const newPolygon = {
            id: this.nextPolygonId++,
            vertices: [...this.currentPolygon],
            internalNodes: []
          };
          this.polygons.push(newPolygon);
          this.currentPolygon = [];
          this.render();
          this._checkValid();
          return;
        }
      }
      
      // Add vertex to current polygon
      this.currentPolygon.push({ x: p.x, y: p.y });
      this.render();
      return;
    }

    if (hitNode) this.dragStart = hitNode;
  }

  _onMove(event) {
    if (this.isPanning && this.lastPanPos) {
      const rect = this.canvas.getBoundingClientRect();
      const screenX = event.clientX - rect.left;
      const screenY = event.clientY - rect.top;
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
    if (this.isPanning) {
      this.isPanning = false;
      this.lastPanPos = null;
      this.canvas.style.cursor = this.tool === 'pan' ? 'grab' : 'crosshair';
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

  _centerOnCreature() {
    if (this.nodes.length === 0) return;
    const xs = this.nodes.map(n => n.x);
    const ys = this.nodes.map(n => n.y);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    this.panX = this.canvas.width / 2 - cx * this.zoom;
    this.panY = this.canvas.height / 2 - cy * this.zoom;
  }

  render() {
    if (!this.ctx) return;
    // Center the view once on first render
    if (this.needsInitialCenter) {
      this.needsInitialCenter = false;
      // Default pan so world origin (300, 300) maps to screen center
      this.panX = this.canvas.width / 2 - 300 * this.zoom;
      this.panY = this.canvas.height / 2 - 300 * this.zoom;
    }
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Apply zoom and pan transform
    ctx.save();
    ctx.translate(this.panX, this.panY);
    ctx.scale(this.zoom, this.zoom);

    // Grid — drawn to cover the full visible viewport in world space
    const step = 40;
    const left = -this.panX / this.zoom;
    const top = -this.panY / this.zoom;
    const right = left + this.canvas.width / this.zoom;
    const bottom = top + this.canvas.height / this.zoom;
    const startX = Math.floor(left / step) * step;
    const startY = Math.floor(top / step) * step;
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let x = startX; x <= right; x += step) {
      ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke();
    }
    for (let y = startY; y <= bottom; y += step) {
      ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
    }

    // GROUND REFERENCE LINE - positioned just below the creature's lowest point
    if (this.nodes.length > 0) {
      const lowestY = Math.max(...this.nodes.map(n => n.y));
      const groundY = lowestY + 15; // small gap below feet
      ctx.strokeStyle = 'rgba(0, 242, 255, 0.4)';
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 5]);
      ctx.beginPath();
      ctx.moveTo(-5000, groundY);
      ctx.lineTo(5000, groundY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Ground label
      ctx.fillStyle = 'rgba(0, 242, 255, 0.7)';
      ctx.font = 'bold 14px "JetBrains Mono", monospace';
      ctx.fillText('GROUND', this.nodes.map(n => n.x).reduce((a, b) => Math.min(a, b)) - 5, groundY - 8);
    }

    // SCALE REFERENCE - Shows size in meters
    const scaleY = this.canvas.height - 30;
    const scaleX = this.canvas.width - 150;
    const meterPx = SCALE; // pixels per meter
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(scaleX, scaleY);
    ctx.lineTo(scaleX + meterPx, scaleY);
    ctx.moveTo(scaleX, scaleY - 5);
    ctx.lineTo(scaleX, scaleY + 5);
    ctx.moveTo(scaleX + meterPx, scaleY - 5);
    ctx.lineTo(scaleX + meterPx, scaleY + 5);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = '12px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('1m', scaleX + meterPx / 2, scaleY - 10);
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

      // Size label (in meters)
      ctx.fillStyle = 'rgba(168, 85, 247, 0.7)';
      ctx.font = '12px "JetBrains Mono", monospace';
      ctx.fillText(`${(width / SCALE).toFixed(1)}×${(height / SCALE).toFixed(1)}m`, minX, minY - 10);

      // Center of mass indicator
      ctx.beginPath();
      ctx.arc(centerX, centerY, 4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(251, 191, 36, 0.6)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.9)';
      ctx.lineWidth = 2;
      ctx.stroke();

    }

    // POLYGON BODIES - Render solid polygon shapes
    this.polygons.forEach(poly => {
      if (poly.vertices.length < 3) return;
      ctx.beginPath();
      ctx.moveTo(poly.vertices[0].x, poly.vertices[0].y);
      for (let i = 1; i < poly.vertices.length; i++) {
        ctx.lineTo(poly.vertices[i].x, poly.vertices[i].y);
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(139, 92, 246, 0.4)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(139, 92, 246, 0.9)';
      ctx.lineWidth = 3;
      ctx.stroke();
      
      // Draw vertex handles
      poly.vertices.forEach(v => {
        ctx.beginPath();
        ctx.arc(v.x, v.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#8b5cf6';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });
    });

    // CURRENT POLYGON BEING DRAWN - Preview with dashed line
    if (this.currentPolygon.length > 0) {
      ctx.beginPath();
      ctx.moveTo(this.currentPolygon[0].x, this.currentPolygon[0].y);
      for (let i = 1; i < this.currentPolygon.length; i++) {
        ctx.lineTo(this.currentPolygon[i].x, this.currentPolygon[i].y);
      }
      ctx.strokeStyle = 'rgba(139, 92, 246, 0.7)';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 6]);
      ctx.stroke();
      ctx.setLineDash([]);
      
      // Draw vertex handles
      this.currentPolygon.forEach((v, i) => {
        ctx.beginPath();
        ctx.arc(v.x, v.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = i === 0 ? '#22c55e' : '#8b5cf6'; // First vertex green (close target)
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
      });
      
      // Line to mouse cursor
      ctx.beginPath();
      const lastV = this.currentPolygon[this.currentPolygon.length - 1];
      ctx.moveTo(lastV.x, lastV.y);
      ctx.lineTo(this.mousePos.x, this.mousePos.y);
      ctx.strokeStyle = 'rgba(139, 92, 246, 0.4)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Constraints
    this.constraints.forEach(c => {
      const n1 = this.nodes.find(n => n.id === c.n1);
      const n2 = this.nodes.find(n => n.id === c.n2);
      if (!n1 || !n2) return;
      ctx.beginPath();
      ctx.moveTo(n1.x, n1.y);
      ctx.lineTo(n2.x, n2.y);
      ctx.lineWidth = c.type === 'muscle' ? 3 : 4;
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
        const sz = 10;
        ctx.rect(n.x - sz/2, n.y - sz/2, sz, sz);
      } else {
        ctx.arc(n.x, n.y, 5, 0, Math.PI * 2);
      }
      ctx.fillStyle = '#222';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = this.dragNode === n ? '#ffff00' : (n.fixed ? '#ffaa00' : '#00f2ff');
      ctx.stroke();

      ctx.beginPath();
      if (n.fixed) {
        const sz = 4;
        ctx.rect(n.x - sz/2, n.y - sz/2, sz, sz);
      } else {
        ctx.arc(n.x, n.y, 2, 0, Math.PI * 2);
      }
      ctx.fillStyle = '#fff';
      ctx.fill();
    });

    // Restore transform for UI elements drawn in screen space
    ctx.restore();

    // INFO PANEL - drawn in screen space so it stays fixed on screen
    ctx.fillStyle = 'rgba(10, 14, 24, 0.85)';
    ctx.fillRect(10, 10, 360, 110);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.strokeRect(10, 10, 360, 110);

    ctx.fillStyle = 'rgba(0, 242, 255, 0.9)';
    ctx.font = 'bold 14px "JetBrains Mono", monospace';
    ctx.fillText('CREATURE DESIGNER', 15, 28);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.font = '12px "JetBrains Mono", monospace';
    ctx.fillText(`Nodes: ${this.nodes.length} | Constraints: ${this.constraints.length} | Polygons: ${this.polygons.length}`, 15, 46);

    const fixedCount = this.nodes.filter(n => n.fixed).length;
    const muscleCount = this.constraints.filter(c => c.type === 'muscle').length;
    const boneCount = this.constraints.filter(c => c.type === 'bone').length;

    ctx.fillStyle = 'rgba(255, 170, 0, 0.8)';
    ctx.font = '12px "JetBrains Mono", monospace';
    ctx.fillText(`⬛ Fixed: ${fixedCount}`, 15, 64);
    ctx.fillStyle = 'rgba(192, 199, 205, 0.8)';
    ctx.fillText(`▬ Bones: ${boneCount}`, 120, 64);
    ctx.fillStyle = 'rgba(255, 0, 85, 0.8)';
    ctx.fillText(`▬ Muscles: ${muscleCount}`, 220, 64);

    const isValid = this.isValid();
    ctx.fillStyle = isValid ? 'rgba(34, 197, 94, 0.8)' : 'rgba(239, 68, 68, 0.8)';
    ctx.font = '12px "JetBrains Mono", monospace';
    ctx.fillText(isValid ? '✓ Ready to evolve!' : '✗ Need 2+ nodes, 1 bone, 1 muscle', 15, 82);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.font = '12px "JetBrains Mono", monospace';
    ctx.fillText('TIP: Keep feet near ground line for best results', 15, 100);
  }
}
