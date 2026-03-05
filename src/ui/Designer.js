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
    this.undoStack = [];
    this.nextId = 0;
    this.tool = 'node';
    this.dragStart = null;
    this.dragNode = null;
    this.mousePos = { x: 0, y: 0 };
    this.selectedNodeIds = new Set();
    this.selectionBox = null;
    this.selectionMode = null;
    this.selectionStartPoint = null;
    this.selectionStartBounds = null;
    this.selectionStartNodes = null;
    this.selectionBaseIds = null;

    // Zoom and pan
    this.zoom = 1.0;
    this.panX = 0;
    this.panY = 0;
    this.isPanning = false;
    this.lastPanPos = null;
    this.needsInitialCenter = true;
    this.isTouchPinching = false;
    this.pinchStartDistance = 0;
    this.pinchStartZoom = 1;
    this.pinchStartPanX = 0;
    this.pinchStartPanY = 0;
    this.pinchStartCenter = { x: 0, y: 0 };
    this.touchNodeGesture = null;
    this.touchDragThresholdPx = 10;
    this.touchNodeHitRadiusPx = 24;
    this.touchNodeSnapRadiusPx = 64;

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
      if (!e.touches || e.touches.length === 0) return;
      e.preventDefault();

      if (e.touches.length >= 2) {
        this._startPinchGesture(e.touches[0], e.touches[1]);
        return;
      }

      if (!this.isTouchPinching) {
        const touch = e.touches[0];
        if (this.tool === 'node') {
          const p = this._relPoint(touch);
          this.mousePos = p;
          const hitRadius = this._screenToWorldDistance(this.touchNodeHitRadiusPx);
          const hitNode = this._findNodeAt(p.x, p.y, hitRadius);
          this.touchNodeGesture = {
            startClientX: touch.clientX,
            startClientY: touch.clientY,
            startPoint: p,
            startNodeId: hitNode ? hitNode.id : null,
            moved: false
          };
          this.dragStart = null;
          return;
        }
        this._onDown(touch);
      }
    }, { passive: false });
    this.canvas.addEventListener('touchmove', e => {
      if (!e.touches || e.touches.length === 0) return;
      e.preventDefault();

      if (this.isTouchPinching || e.touches.length >= 2) {
        if (!this.isTouchPinching && e.touches.length >= 2) {
          this._startPinchGesture(e.touches[0], e.touches[1]);
        } else if (e.touches.length >= 2) {
          this._updatePinchGesture(e.touches[0], e.touches[1]);
        }
        return;
      }

      const touch = e.touches[0];
      if (this.tool === 'node' && this.touchNodeGesture) {
        const p = this._relPoint(touch);
        this.mousePos = p;
        const movedPx = Math.hypot(
          touch.clientX - this.touchNodeGesture.startClientX,
          touch.clientY - this.touchNodeGesture.startClientY
        );
        if (movedPx >= this.touchDragThresholdPx) {
          this.touchNodeGesture.moved = true;
          if (!this.dragStart && this.touchNodeGesture.startNodeId != null) {
            this.dragStart = this.nodes.find(n => n.id === this.touchNodeGesture.startNodeId) || null;
          }
        }
        if (this.dragStart) this.render();
        return;
      }

      this._onMove(touch);
    }, { passive: false });
    this.canvas.addEventListener('touchend', e => {
      e.preventDefault();

      if (this.isTouchPinching) {
        if (e.touches && e.touches.length >= 2) {
          this._startPinchGesture(e.touches[0], e.touches[1]);
        } else {
          this._endPinchGesture();
        }
        return;
      }

      if (this.tool === 'node' && this.touchNodeGesture) {
        const touch = e.changedTouches?.[0];
        const p = touch ? this._relPoint(touch) : this.touchNodeGesture.startPoint;
        this.mousePos = p;
        const startNode = this.touchNodeGesture.startNodeId != null
          ? this.nodes.find(n => n.id === this.touchNodeGesture.startNodeId) || null
          : null;
        const moved = this.touchNodeGesture.moved;

        this.touchNodeGesture = null;
        if (moved && startNode) {
          this._finishNodeDrag(startNode, p, { snapRadiusPx: this.touchNodeSnapRadiusPx });
        } else if (!moved) {
          this._handleNodeTap(p);
        } else {
          this.dragStart = null;
          this.render();
        }
        return;
      }

      this._onUp(e.changedTouches[0]);
    }, { passive: false });
    this.canvas.addEventListener('touchcancel', e => {
      e.preventDefault();
      this._endPinchGesture();
      this.dragStart = null;
      this.dragNode = null;
      this.selectionMode = null;
      this.selectionBox = null;
      this.touchNodeGesture = null;
      this.render();
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
    if (tool === 'pan') {
      this.canvas.style.cursor = 'grab';
      return;
    }
    if (tool === 'select') {
      this.canvas.style.cursor = 'crosshair';
      return;
    }
    this.canvas.style.cursor = 'crosshair';
  }

  resetView() {
    this._fitCreatureToVisibleViewport();
    this.render();
  }

  isValid() {
    const hasMuscle = this.constraints.some(c => c.type === 'muscle');
    return this.nodes.length >= 2 && hasMuscle;
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

    const hasMuscle = constraints.some(c => c.type === 'muscle');
    if (nodes.length < 2 || !hasMuscle) {
      throw new Error('Design needs at least 2 nodes and 1 muscle.');
    }

    this._pushUndo();
    this.nodes = nodes;
    this.constraints = constraints;
    this.nextId = Math.max(0, ...nodes.map(n => n.id)) + 1;
    this.dragNode = null;
    this.dragStart = null;
    this._clearSelection();
    this._centerOnCreature();
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
    this._clearSelection();
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
    this._clearSelection();
    this.render();
    this._checkValid();
  }

  serializeDesign() {
    return {
      version: 2,
      createdAt: new Date().toISOString(),
      nodes: this.nodes.map(n => ({ ...n })),
      constraints: this.constraints.map(c => ({ ...c })),
      nextId: this.nextId
    };
  }

  downloadDesign(payload = this.serializeDesign(), filename = null) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || `polycreature-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  captureThumbnail(width = 220, height = 140) {
    if (!this.canvas) return '';
    if (!this.nodes.length) return '';

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    this.nodes.forEach(n => {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x);
      maxY = Math.max(maxY, n.y);
    });
    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
      return '';
    }

    const worldPad = 28;
    minX -= worldPad;
    minY -= worldPad;
    maxX += worldPad;
    maxY += worldPad;

    const zoom = this.zoom || 1;
    const srcCenterX = ((minX + maxX) * 0.5) * zoom + this.panX;
    const srcCenterY = ((minY + maxY) * 0.5) * zoom + this.panY;
    let srcW = Math.max(24, (maxX - minX) * zoom);
    let srcH = Math.max(24, (maxY - minY) * zoom);
    const targetAspect = width / height;
    const srcAspect = srcW / srcH;

    if (srcAspect > targetAspect) {
      srcH = srcW / targetAspect;
    } else {
      srcW = srcH * targetAspect;
    }
    srcW *= 1.12;
    srcH *= 1.12;

    let srcX = srcCenterX - srcW * 0.5;
    let srcY = srcCenterY - srcH * 0.5;
    srcX = Math.max(0, Math.min(this.canvas.width - srcW, srcX));
    srcY = Math.max(0, Math.min(this.canvas.height - srcH, srcY));

    const out = document.createElement('canvas');
    out.width = width;
    out.height = height;
    const octx = out.getContext('2d');
    if (!octx) return '';
    octx.fillStyle = '#0c101a';
    octx.fillRect(0, 0, width, height);
    octx.drawImage(this.canvas, srcX, srcY, srcW, srcH, 0, 0, width, height);
    return out.toDataURL('image/jpeg', 0.75);
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

  _touchDistance(a, b) {
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  }

  _touchCenter(a, b) {
    return {
      x: (a.clientX + b.clientX) * 0.5,
      y: (a.clientY + b.clientY) * 0.5
    };
  }

  _startPinchGesture(a, b) {
    if (!a || !b) return;
    this.isTouchPinching = true;
    this.pinchStartDistance = Math.max(1, this._touchDistance(a, b));
    this.pinchStartCenter = this._touchCenter(a, b);
    this.pinchStartZoom = this.zoom;
    this.pinchStartPanX = this.panX;
    this.pinchStartPanY = this.panY;

    // Cancel any active edit drag so two-finger gestures never move/create nodes.
    this.dragStart = null;
    this.dragNode = null;
    this.selectionMode = null;
    this.selectionBox = null;
    this.touchNodeGesture = null;
  }

  _updatePinchGesture(a, b) {
    if (!this.isTouchPinching || !a || !b) return;
    const distance = Math.max(1, this._touchDistance(a, b));
    const center = this._touchCenter(a, b);
    const scale = distance / this.pinchStartDistance;
    const nextZoom = Math.max(0.25, Math.min(3.0, this.pinchStartZoom * scale));

    // Preserve the world point under the initial pinch center while allowing center translation.
    const anchorWorldX = (this.pinchStartCenter.x - this.pinchStartPanX) / this.pinchStartZoom;
    const anchorWorldY = (this.pinchStartCenter.y - this.pinchStartPanY) / this.pinchStartZoom;

    this.zoom = nextZoom;
    this.panX = center.x - anchorWorldX * nextZoom;
    this.panY = center.y - anchorWorldY * nextZoom;
    this.render();
  }

  _endPinchGesture() {
    this.isTouchPinching = false;
    this.pinchStartDistance = 0;
    this.touchNodeGesture = null;
  }

  _screenToWorldDistance(px) {
    return px / Math.max(0.25, this.zoom);
  }

  _findNearestNodeWithin(x, y, maxDist, excludeId = null) {
    let best = null;
    let bestDist = maxDist;
    this.nodes.forEach(n => {
      if (excludeId != null && n.id === excludeId) return;
      const d = Math.hypot(n.x - x, n.y - y);
      if (d <= bestDist) {
        best = n;
        bestDist = d;
      }
    });
    return best;
  }

  _addConstraintIfMissing(startNode, endNode, type) {
    if (!startNode || !endNode || startNode.id === endNode.id) return false;
    const exists = this.constraints.some(c =>
      (c.n1 === startNode.id && c.n2 === endNode.id) ||
      (c.n1 === endNode.id && c.n2 === startNode.id)
    );
    if (exists) return false;
    this._pushUndo();
    this.constraints.push({
      type: type === 'muscle' ? 'muscle' : 'bone',
      n1: startNode.id,
      n2: endNode.id
    });
    return true;
  }

  _handleNodeTap(p) {
    const hitRadius = this._screenToWorldDistance(10);
    if (this._findNodeAt(p.x, p.y, hitRadius)) return;

    const cIdx = this._findConstraintAt(p.x, p.y);
    if (cIdx >= 0) {
      const c = this.constraints[cIdx];
      const n1 = this.nodes.find(n => n.id === c.n1);
      const n2 = this.nodes.find(n => n.id === c.n2);
      if (n1 && n2) {
        const vx = n2.x - n1.x;
        const vy = n2.y - n1.y;
        const wx = p.x - n1.x;
        const wy = p.y - n1.y;
        const len2 = vx * vx + vy * vy;
        const t = len2 > 0 ? Math.max(0, Math.min(1, (wx * vx + wy * vy) / len2)) : 0;

        this._pushUndo();
        const newNode = { id: this.nextId++, x: n1.x + t * vx, y: n1.y + t * vy, fixed: true };
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
  }

  _finishNodeDrag(startNode, p, { snapRadiusPx = 64 } = {}) {
    if (!startNode) return;
    const directRadius = this._screenToWorldDistance(20);
    const snapRadius = this._screenToWorldDistance(snapRadiusPx);
    let endNode = this._findNodeAt(p.x, p.y, directRadius);
    if (!endNode || endNode.id === startNode.id) {
      endNode = this._findNearestNodeWithin(p.x, p.y, snapRadius, startNode.id);
    }

    this._addConstraintIfMissing(startNode, endNode, 'bone');
    this.dragStart = null;
    this.render();
    this._checkValid();
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

  _clearSelection() {
    this.selectedNodeIds.clear();
    this.selectionBox = null;
    this.selectionMode = null;
    this.selectionStartPoint = null;
    this.selectionStartBounds = null;
    this.selectionStartNodes = null;
    this.selectionBaseIds = null;
  }

  _selectionHandleSizeWorld() {
    return 12 / Math.max(0.25, this.zoom);
  }

  _selectionMoveHandleSizeWorld() {
    return 16 / Math.max(0.25, this.zoom);
  }

  _selectionMoveHandleOffsetWorld() {
    return 18 / Math.max(0.25, this.zoom);
  }

  _normalizeRect(rect) {
    const minX = Math.min(rect.x1, rect.x2);
    const maxX = Math.max(rect.x1, rect.x2);
    const minY = Math.min(rect.y1, rect.y2);
    const maxY = Math.max(rect.y1, rect.y2);
    return {
      minX,
      maxX,
      minY,
      maxY,
      width: maxX - minX,
      height: maxY - minY
    };
  }

  _getSelectionBounds() {
    if (!this.selectedNodeIds.size) return null;
    const selected = this.nodes.filter(n => this.selectedNodeIds.has(n.id));
    if (!selected.length) return null;
    const xs = selected.map(n => n.x);
    const ys = selected.map(n => n.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return {
      minX,
      maxX,
      minY,
      maxY,
      width: maxX - minX,
      height: maxY - minY,
      centerX: (minX + maxX) * 0.5,
      centerY: (minY + maxY) * 0.5
    };
  }

  _isPointInsideSelectionBounds(x, y, bounds) {
    if (!bounds) return false;
    const pad = 8 / Math.max(0.25, this.zoom);
    return (
      x >= bounds.minX - pad &&
      x <= bounds.maxX + pad &&
      y >= bounds.minY - pad &&
      y <= bounds.maxY + pad
    );
  }

  _getMoveHandleRect(bounds) {
    const size = this._selectionMoveHandleSizeWorld();
    const offset = this._selectionMoveHandleOffsetWorld();
    return {
      x: bounds.centerX - size * 0.5,
      y: bounds.minY - offset - size,
      w: size,
      h: size
    };
  }

  _getResizeHandleRect(bounds) {
    const size = this._selectionHandleSizeWorld();
    return {
      x: bounds.maxX - size * 0.5,
      y: bounds.maxY - size * 0.5,
      w: size,
      h: size
    };
  }

  _isPointInRect(x, y, rect) {
    if (!rect) return false;
    return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
  }

  _setSelectionFromRect(rect, addToExisting = false) {
    const normalized = this._normalizeRect(rect);
    const selectedIds = this.nodes
      .filter(n =>
        n.x >= normalized.minX &&
        n.x <= normalized.maxX &&
        n.y >= normalized.minY &&
        n.y <= normalized.maxY
      )
      .map(n => n.id);
    if (addToExisting && this.selectionBaseIds) {
      this.selectedNodeIds = new Set([...this.selectionBaseIds, ...selectedIds]);
      return;
    }
    this.selectedNodeIds = new Set(selectedIds);
  }

  _snapshotSelectedNodes() {
    const snapshot = new Map();
    this.nodes.forEach(n => {
      if (this.selectedNodeIds.has(n.id)) snapshot.set(n.id, { x: n.x, y: n.y });
    });
    return snapshot;
  }

  _pruneSelection() {
    if (!this.selectedNodeIds.size) return;
    const existingIds = new Set(this.nodes.map(n => n.id));
    this.selectedNodeIds = new Set([...this.selectedNodeIds].filter(id => existingIds.has(id)));
  }

  _applySelectedNodeTranslation(dx, dy) {
    this.nodes.forEach(n => {
      const start = this.selectionStartNodes.get(n.id);
      if (!start) return;
      n.x = start.x + dx;
      n.y = start.y + dy;
    });
  }

  _applySelectedNodeScale(scaleX, scaleY, anchorX, anchorY) {
    this.nodes.forEach(n => {
      const start = this.selectionStartNodes.get(n.id);
      if (!start) return;
      n.x = anchorX + (start.x - anchorX) * scaleX;
      n.y = anchorY + (start.y - anchorY) * scaleY;
    });
  }

  _updateSelectCursor(p) {
    if (this.selectionMode === 'moving') {
      this.canvas.style.cursor = 'move';
      return;
    }
    if (this.selectionMode === 'resizing') {
      this.canvas.style.cursor = 'nwse-resize';
      return;
    }
    if (this.selectionMode === 'selecting') {
      this.canvas.style.cursor = 'crosshair';
      return;
    }
    const bounds = this._getSelectionBounds();
    if (!bounds) {
      this.canvas.style.cursor = 'crosshair';
      return;
    }
    const moveHandle = this._getMoveHandleRect(bounds);
    const resizeHandle = this._getResizeHandleRect(bounds);
    if (this._isPointInRect(p.x, p.y, resizeHandle)) {
      this.canvas.style.cursor = 'nwse-resize';
      return;
    }
    if (this._isPointInRect(p.x, p.y, moveHandle) || this._isPointInsideSelectionBounds(p.x, p.y, bounds)) {
      this.canvas.style.cursor = 'move';
      return;
    }
    this.canvas.style.cursor = 'crosshair';
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

    if (this.tool === 'select') {
      const bounds = this._getSelectionBounds();
      const moveHandle = bounds ? this._getMoveHandleRect(bounds) : null;
      const resizeHandle = bounds ? this._getResizeHandleRect(bounds) : null;

      if (bounds && this._isPointInRect(p.x, p.y, resizeHandle) && this.selectedNodeIds.size) {
        this._pushUndo();
        this.selectionMode = 'resizing';
        this.selectionStartPoint = { ...p };
        this.selectionStartBounds = { ...bounds };
        this.selectionStartNodes = this._snapshotSelectedNodes();
        this.render();
        return;
      }

      if (bounds && (this._isPointInRect(p.x, p.y, moveHandle) || this._isPointInsideSelectionBounds(p.x, p.y, bounds)) && this.selectedNodeIds.size) {
        this._pushUndo();
        this.selectionMode = 'moving';
        this.selectionStartPoint = { ...p };
        this.selectionStartNodes = this._snapshotSelectedNodes();
        this.render();
        return;
      }

      this.selectionMode = 'selecting';
      this.selectionBox = { x1: p.x, y1: p.y, x2: p.x, y2: p.y };
      this.selectionBaseIds = event.shiftKey ? new Set(this.selectedNodeIds) : null;
      if (!event.shiftKey) this.selectedNodeIds.clear();
      this.render();
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
        return;
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
    if (this.tool === 'select') {
      if (this.selectionMode === 'selecting' && this.selectionBox) {
        this.selectionBox.x2 = p.x;
        this.selectionBox.y2 = p.y;
        this._setSelectionFromRect(this.selectionBox, !!this.selectionBaseIds);
        this.render();
        return;
      }
      if (this.selectionMode === 'moving' && this.selectionStartPoint && this.selectionStartNodes) {
        const dx = p.x - this.selectionStartPoint.x;
        const dy = p.y - this.selectionStartPoint.y;
        this._applySelectedNodeTranslation(dx, dy);
        this.render();
        return;
      }
      if (this.selectionMode === 'resizing' && this.selectionStartBounds && this.selectionStartNodes) {
        const anchorX = this.selectionStartBounds.minX;
        const anchorY = this.selectionStartBounds.minY;
        const minSize = 12 / Math.max(0.25, this.zoom);
        const nextWidth = Math.max(minSize, p.x - anchorX);
        const nextHeight = Math.max(minSize, p.y - anchorY);
        const baseWidth = Math.max(minSize, this.selectionStartBounds.width || minSize);
        const baseHeight = Math.max(minSize, this.selectionStartBounds.height || minSize);
        const scaleX = nextWidth / baseWidth;
        const scaleY = nextHeight / baseHeight;
        this._applySelectedNodeScale(scaleX, scaleY, anchorX, anchorY);
        this.render();
        return;
      }
      this._updateSelectCursor(p);
      return;
    }

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

    if (this.tool === 'select') {
      if (this.selectionMode === 'selecting' && this.selectionBox) {
        this.selectionBox.x2 = p.x;
        this.selectionBox.y2 = p.y;
        const normalized = this._normalizeRect(this.selectionBox);
        const isClick = normalized.width < 4 / Math.max(0.25, this.zoom) && normalized.height < 4 / Math.max(0.25, this.zoom);
        if (isClick) {
          const hitNode = this._findNodeAt(p.x, p.y, 12 / Math.max(0.25, this.zoom));
          if (hitNode) {
            if (this.selectionBaseIds) this.selectedNodeIds = new Set([...this.selectionBaseIds, hitNode.id]);
            else this.selectedNodeIds = new Set([hitNode.id]);
          } else if (this.selectionBaseIds) {
            this.selectedNodeIds = new Set(this.selectionBaseIds);
          } else {
            this.selectedNodeIds.clear();
          }
        } else {
          this._setSelectionFromRect(this.selectionBox, !!this.selectionBaseIds);
        }
      }
      this.selectionMode = null;
      this.selectionStartPoint = null;
      this.selectionStartBounds = null;
      this.selectionStartNodes = null;
      this.selectionBaseIds = null;
      this.selectionBox = null;
      this._updateSelectCursor(p);
      this.render();
      this._checkValid();
      return;
    }

    if (this.dragNode) {
      this.dragNode = null;
      this.render();
      this._checkValid();
      return;
    }
    if (!this.dragStart) return;

    const endNode = this._findNodeAt(p.x, p.y, 20);
    this._addConstraintIfMissing(this.dragStart, endNode, this.tool === 'muscle' ? 'muscle' : 'bone');
    this.dragStart = null;
    this.render();
    this._checkValid();
  }

  _getVisibleViewportInsets() {
    if (!this.canvas) return { left: 0, right: 0, top: 0, bottom: 0 };
    const canvasRect = this.canvas.getBoundingClientRect();
    const insets = { left: 0, right: 0, top: 0, bottom: 0 };
    const selectors = [
      '#btn-run',
      '#btn-back',
      '#btn-back-toolbar',
      '.design-toolbar-left',
      '.design-toolbar-right',
      '.design-quickstart'
    ];

    const applyInset = (el) => {
      if (!el) return;
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return;
      const r = el.getBoundingClientRect();
      const overlapW = Math.min(r.right, canvasRect.right) - Math.max(r.left, canvasRect.left);
      const overlapH = Math.min(r.bottom, canvasRect.bottom) - Math.max(r.top, canvasRect.top);
      if (overlapW <= 0 || overlapH <= 0) return;

      const w = Math.max(1, overlapW);
      const h = Math.max(1, overlapH);
      const isHorizontal = w >= h * 1.2;
      const isVertical = h >= w * 1.2;

      if (isVertical || !isHorizontal) {
        if (r.left <= canvasRect.left + canvasRect.width * 0.5) {
          const occupied = Math.max(0, Math.min(r.right, canvasRect.right) - canvasRect.left);
          insets.left = Math.max(insets.left, occupied);
        } else {
          const occupied = Math.max(0, canvasRect.right - Math.max(r.left, canvasRect.left));
          insets.right = Math.max(insets.right, occupied);
        }
      }

      if (isHorizontal || !isVertical) {
        if (r.top <= canvasRect.top + canvasRect.height * 0.5) {
          const occupied = Math.max(0, Math.min(r.bottom, canvasRect.bottom) - canvasRect.top);
          insets.top = Math.max(insets.top, occupied);
        } else {
          const occupied = Math.max(0, canvasRect.bottom - Math.max(r.top, canvasRect.top));
          insets.bottom = Math.max(insets.bottom, occupied);
        }
      }
    };

    selectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(applyInset);
    });

    const pad = 8;
    return {
      left: insets.left > 0 ? insets.left + pad : 0,
      right: insets.right > 0 ? insets.right + pad : 0,
      top: insets.top > 0 ? insets.top + pad : 0,
      bottom: insets.bottom > 0 ? insets.bottom + pad : 0
    };
  }

  _fitCreatureToVisibleViewport() {
    if (this.nodes.length === 0 || !this.canvas) return;
    const xs = this.nodes.map(n => n.x);
    const ys = this.nodes.map(n => n.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const insets = this._getVisibleViewportInsets();
    const usableW = Math.max(120, this.canvas.width - insets.left - insets.right);
    const usableH = Math.max(120, this.canvas.height - insets.top - insets.bottom);

    // Add world padding + slight extra zoom-out for safer framing under mobile overlays.
    const worldPad = 22;
    const creatureW = Math.max(20, (maxX - minX) + worldPad * 2);
    const creatureH = Math.max(20, (maxY - minY) + worldPad * 2);
    const fitZoom = Math.min(3.0, Math.max(0.25, Math.min(usableW / creatureW, usableH / creatureH) * 0.94));
    this.zoom = fitZoom;

    const cx = (minX + maxX) * 0.5;
    const cy = (minY + maxY) * 0.5;
    const viewportCenterX = insets.left + usableW * 0.5;
    const viewportCenterY = insets.top + usableH * 0.5;
    this.panX = viewportCenterX - cx * this.zoom;
    this.panY = viewportCenterY - cy * this.zoom;
  }

  _centerOnCreature() {
    if (this.nodes.length === 0 || !this.canvas) return;
    const xs = this.nodes.map(n => n.x);
    const ys = this.nodes.map(n => n.y);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const insets = this._getVisibleViewportInsets();
    const usableW = Math.max(120, this.canvas.width - insets.left - insets.right);
    const usableH = Math.max(120, this.canvas.height - insets.top - insets.bottom);
    this.panX = (insets.left + usableW * 0.5) - cx * this.zoom;
    this.panY = (insets.top + usableH * 0.5) - cy * this.zoom;
  }

  render() {
    if (!this.ctx) return;
    this._pruneSelection();
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

    // Selection box and handles (select tool)
    if (this.selectionMode === 'selecting' && this.selectionBox) {
      const box = this._normalizeRect(this.selectionBox);
      ctx.fillStyle = 'rgba(0, 242, 255, 0.14)';
      ctx.strokeStyle = 'rgba(0, 242, 255, 0.9)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6 / Math.max(0.25, this.zoom), 6 / Math.max(0.25, this.zoom)]);
      ctx.fillRect(box.minX, box.minY, box.width, box.height);
      ctx.strokeRect(box.minX, box.minY, box.width, box.height);
      ctx.setLineDash([]);
    }

    const selectionBounds = this._getSelectionBounds();
    if (selectionBounds && this.selectedNodeIds.size) {
      const pad = 10 / Math.max(0.25, this.zoom);
      const x = selectionBounds.minX - pad;
      const y = selectionBounds.minY - pad;
      const w = Math.max(1, selectionBounds.width + pad * 2);
      const h = Math.max(1, selectionBounds.height + pad * 2);
      ctx.strokeStyle = 'rgba(125, 255, 125, 0.95)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([8 / Math.max(0.25, this.zoom), 5 / Math.max(0.25, this.zoom)]);
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);

      const moveHandle = this._getMoveHandleRect(selectionBounds);
      const resizeHandle = this._getResizeHandleRect(selectionBounds);

      ctx.fillStyle = 'rgba(125, 255, 125, 0.95)';
      ctx.fillRect(moveHandle.x, moveHandle.y, moveHandle.w, moveHandle.h);
      ctx.fillStyle = 'rgba(11, 15, 26, 0.95)';
      const mx = moveHandle.x + moveHandle.w * 0.5;
      const my = moveHandle.y + moveHandle.h * 0.5;
      const mLen = moveHandle.w * 0.28;
      ctx.lineWidth = 1.5 / Math.max(0.25, this.zoom);
      ctx.strokeStyle = 'rgba(11, 15, 26, 0.95)';
      ctx.beginPath();
      ctx.moveTo(mx - mLen, my);
      ctx.lineTo(mx + mLen, my);
      ctx.moveTo(mx, my - mLen);
      ctx.lineTo(mx, my + mLen);
      ctx.stroke();

      ctx.fillStyle = 'rgba(125, 255, 125, 0.95)';
      ctx.fillRect(resizeHandle.x, resizeHandle.y, resizeHandle.w, resizeHandle.h);
      ctx.strokeStyle = 'rgba(11, 15, 26, 0.95)';
      ctx.lineWidth = 1 / Math.max(0.25, this.zoom);
      ctx.beginPath();
      ctx.moveTo(resizeHandle.x + resizeHandle.w * 0.2, resizeHandle.y + resizeHandle.h * 0.8);
      ctx.lineTo(resizeHandle.x + resizeHandle.w * 0.8, resizeHandle.y + resizeHandle.h * 0.2);
      ctx.stroke();
    }

    // Nodes
    this.nodes.forEach(n => {
      const isSelected = this.selectedNodeIds.has(n.id);
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
      ctx.strokeStyle = this.dragNode === n
        ? '#ffff00'
        : (isSelected ? '#7dff7d' : (n.fixed ? '#ffaa00' : '#00f2ff'));
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

  }
}
