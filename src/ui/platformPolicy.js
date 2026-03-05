const PLATFORM_STORAGE_KEY = 'polyevolve.uiPlatformOverride';

function parseUrlOverride() {
  try {
    const params = new URLSearchParams(window.location.search);
    const ui = params.get('ui');
    if (ui === 'mobile' || ui === 'desktop') return ui;
  } catch {
    // Ignore malformed URL state.
  }
  return null;
}

function readStoredOverride() {
  try {
    const value = localStorage.getItem(PLATFORM_STORAGE_KEY);
    return value === 'mobile' || value === 'desktop' ? value : null;
  } catch {
    return null;
  }
}

function writeStoredOverride(value) {
  try {
    localStorage.setItem(PLATFORM_STORAGE_KEY, value);
  } catch {
    // Ignore storage failures.
  }
}

function isElectronRuntime(userAgent = '') {
  return /Electron/i.test(userAgent);
}

function isLikelyMobileUA(userAgent = '') {
  return /iPhone|iPad|iPod|Android|Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
}

function hasCoarsePointer() {
  return !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
}

export function resolveUIPlatform() {
  const userAgent = navigator.userAgent || '';
  if (isElectronRuntime(userAgent)) return 'desktop';

  const urlOverride = parseUrlOverride();
  if (urlOverride) {
    writeStoredOverride(urlOverride);
    return urlOverride;
  }

  const storedOverride = readStoredOverride();
  if (storedOverride) return storedOverride;

  const smallViewport = Math.min(window.innerWidth, window.innerHeight) <= 900;
  if (isLikelyMobileUA(userAgent) || (hasCoarsePointer() && smallViewport)) {
    return 'mobile';
  }

  return 'desktop';
}

export function setUIPlatformOverride(nextPlatform) {
  if (nextPlatform !== 'mobile' && nextPlatform !== 'desktop') return;
  writeStoredOverride(nextPlatform);
}
