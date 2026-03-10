export function getOptimized2dContext(canvas, options = {}) {
  if (!canvas || typeof canvas.getContext !== 'function') return null;

  const {
    opaque = true,
    desynchronized = true
  } = options;

  const requested = {
    alpha: !opaque
  };

  if (desynchronized) {
    requested.desynchronized = true;
  }

  try {
    const ctx = canvas.getContext('2d', requested);
    if (ctx) return ctx;
  } catch {
    // Fall back to broader 2D context creation below.
  }

  if (opaque) {
    try {
      const ctx = canvas.getContext('2d', { alpha: false });
      if (ctx) return ctx;
    } catch {
      // Fall back to default context creation below.
    }
  }

  return canvas.getContext('2d');
}
