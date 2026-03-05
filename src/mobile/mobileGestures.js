import { CONFIG } from '../utils/config.js';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getTouchDistance(a, b) {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

function getTouchCenter(a, b) {
  return {
    x: (a.clientX + b.clientX) * 0.5,
    y: (a.clientY + b.clientY) * 0.5
  };
}

export function attachMobileGestures({ sim, worldCanvas, designer, designContainer }) {
  const cleanups = [];
  const minZoom = Number.isFinite(CONFIG.minZoom) ? CONFIG.minZoom : 0.15;
  const maxZoom = Number.isFinite(CONFIG.maxZoom) ? CONFIG.maxZoom : 2.5;

  if (worldCanvas && sim) {
    let worldPinch = null;

    const onWorldStart = e => {
      if (!e.touches || e.touches.length < 2) return;
      const [a, b] = e.touches;
      worldPinch = {
        distance: Math.max(1, getTouchDistance(a, b)),
        center: getTouchCenter(a, b),
        zoom: sim.zoom
      };
      e.preventDefault();
    };

    const onWorldMove = e => {
      if (!worldPinch || !e.touches || e.touches.length < 2) return;
      const [a, b] = e.touches;
      const currentDistance = Math.max(1, getTouchDistance(a, b));
      const center = getTouchCenter(a, b);
      const scale = currentDistance / worldPinch.distance;
      const nextZoom = clamp(worldPinch.zoom * scale, minZoom, maxZoom);

      const worldX = center.x / sim.zoom + sim.cameraX;
      const worldY = center.y / sim.zoom + sim.cameraY;

      sim.zoom = nextZoom;
      sim.cameraX = worldX - center.x / nextZoom;
      sim.cameraY = worldY - center.y / nextZoom;

      e.preventDefault();
    };

    const onWorldEnd = () => {
      worldPinch = null;
    };

    worldCanvas.addEventListener('touchstart', onWorldStart, { passive: false });
    worldCanvas.addEventListener('touchmove', onWorldMove, { passive: false });
    worldCanvas.addEventListener('touchend', onWorldEnd, { passive: true });
    worldCanvas.addEventListener('touchcancel', onWorldEnd, { passive: true });

    cleanups.push(() => {
      worldCanvas.removeEventListener('touchstart', onWorldStart);
      worldCanvas.removeEventListener('touchmove', onWorldMove);
      worldCanvas.removeEventListener('touchend', onWorldEnd);
      worldCanvas.removeEventListener('touchcancel', onWorldEnd);
    });
  }

  if (designContainer && designer) {
    let designPinch = null;

    const onDesignStartCapture = e => {
      if (!e.touches || e.touches.length < 2) return;
      const [a, b] = e.touches;
      designPinch = {
        distance: Math.max(1, getTouchDistance(a, b)),
        center: getTouchCenter(a, b),
        zoom: designer.zoom
      };
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
    };

    const onDesignMoveCapture = e => {
      if (!designPinch || !e.touches || e.touches.length < 2) return;
      const [a, b] = e.touches;
      const center = getTouchCenter(a, b);
      const currentDistance = Math.max(1, getTouchDistance(a, b));
      const scale = currentDistance / designPinch.distance;
      const oldZoom = designer.zoom;
      const nextZoom = clamp(designPinch.zoom * scale, 0.25, 3.0);

      designer.zoom = nextZoom;
      designer.panX = center.x - (center.x - designer.panX) * (nextZoom / oldZoom);
      designer.panY = center.y - (center.y - designer.panY) * (nextZoom / oldZoom);
      designer.render();

      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
    };

    const onDesignEndCapture = () => {
      designPinch = null;
    };

    designContainer.addEventListener('touchstart', onDesignStartCapture, { capture: true, passive: false });
    designContainer.addEventListener('touchmove', onDesignMoveCapture, { capture: true, passive: false });
    designContainer.addEventListener('touchend', onDesignEndCapture, { capture: true, passive: true });
    designContainer.addEventListener('touchcancel', onDesignEndCapture, { capture: true, passive: true });

    cleanups.push(() => {
      designContainer.removeEventListener('touchstart', onDesignStartCapture, true);
      designContainer.removeEventListener('touchmove', onDesignMoveCapture, true);
      designContainer.removeEventListener('touchend', onDesignEndCapture, true);
      designContainer.removeEventListener('touchcancel', onDesignEndCapture, true);
    });
  }

  return () => {
    cleanups.forEach(fn => fn());
  };
}
