import { CONFIG } from './utils/config.js';
import { Simulation } from './sim/Simulation.js';
import { Designer } from './ui/Designer.js';
import { Controls } from './ui/Controls.js';
import { HUD } from './ui/HUD.js';
import { Visualizer } from './ui/Visualizer.js';
import { ProgressChart } from './ui/ProgressChart.js';
import { EvolutionMonitor } from './utils/EvolutionMonitor.js';
import { EvolutionFeedback } from './ui/EvolutionFeedback.js';
import { Vec2, SCALE } from './sim/Physics.js';
import { buildDefaultCreatureCatalogEntries } from './data/defaultCreatureCatalog.js';
import { resolveUIPlatform } from './ui/platformPolicy.js';
import { mountDesktopUI } from './ui/UISurface.js';
import { registerPWA } from './pwa/registerPWA.js';
import { THEME_TOKENS_SCHEMA_VERSION } from './theme/tokens.js';

registerPWA();
const LEGACY_STORAGE_PREFIX = 'polyevolve.';
const STORAGE_BRIDGE_CHANNEL = 'creaturelabs.storageBridge.v1';
const STORAGE_BRIDGE_TIMEOUT_MS = 250;

function resolveStorageScopeId() {
  const path = (window.location.pathname || '/').toLowerCase();
  if (path.startsWith('/creaturelabs')) return 'creaturelabs';
  if (window.top !== window.self) return 'embed';
  return 'app';
}

function requestIframeStorageAccessOnFirstGesture() {
  if (window.top === window.self) return;
  const hasStorageAccess = document.hasStorageAccess?.bind(document);
  const requestStorageAccess = document.requestStorageAccess?.bind(document);
  if (typeof hasStorageAccess !== 'function' || typeof requestStorageAccess !== 'function') return;

  const onFirstGesture = async () => {
    try {
      const hasAccess = await hasStorageAccess();
      if (!hasAccess) await requestStorageAccess();
    } catch {
      // Ignore denial; we still keep best-effort durable storage fallbacks.
    }
  };

  window.addEventListener('pointerdown', () => { void onFirstGesture(); }, { capture: true, once: true });
  window.addEventListener('touchstart', () => { void onFirstGesture(); }, { capture: true, once: true });
}

requestIframeStorageAccessOnFirstGesture();
const STORAGE_SCOPE_ID = resolveStorageScopeId();
const STORAGE_SCOPE_PREFIX = `creaturelabs.${STORAGE_SCOPE_ID}.`;
const uiPlatform = resolveUIPlatform();
document.body.classList.add(uiPlatform === 'mobile' ? 'app-mobile' : 'app-desktop');
document.body.dataset.uiPlatform = uiPlatform;
document.body.dataset.themeTokenSchema = THEME_TOKENS_SCHEMA_VERSION;

const appStateListeners = new Set();
let uiSurface = null;
const MOBILE_SHEET_STATE_CLASSES = ['mobile-sheet-open', 'mobile-sheet-controls', 'mobile-sheet-stats'];
const MOBILE_MODULE_STORAGE_PREFIX = `${STORAGE_SCOPE_PREFIX}mobileModule.`;
let mobileSheetReady = false;

// Orientation binding
function updateOrientationClasses() {
  const isPortrait = window.innerHeight > window.innerWidth;
  if (isPortrait) {
    document.body.classList.add('portrait');
    document.body.classList.remove('landscape');
  } else {
    document.body.classList.add('landscape');
    document.body.classList.remove('portrait');
  }
}
window.addEventListener('resize', updateOrientationClasses);
updateOrientationClasses();

function updateMobileViewportInsets() {
  if (!document.body.classList.contains('app-mobile')) return;
  const viewport = window.visualViewport;
  let browserBottomInset = 0;
  if (viewport) {
    const layoutHeight = Math.max(window.innerHeight || 0, document.documentElement.clientHeight || 0);
    browserBottomInset = Math.max(0, Math.round(layoutHeight - viewport.height - viewport.offsetTop));
  }
  const isStandalone = (
    window.matchMedia?.('(display-mode: standalone)')?.matches
    || window.navigator?.standalone === true
  );
  const isPortrait = (window.innerHeight || 0) >= (window.innerWidth || 0);
  const browserModeInsetFloor = !isStandalone ? (isPortrait ? 72 : 20) : 0;
  browserBottomInset = Math.max(browserBottomInset, browserModeInsetFloor);
  document.documentElement.style.setProperty('--mobile-browser-ui-bottom', `${browserBottomInset}px`);
}

window.addEventListener('resize', updateMobileViewportInsets);
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', updateMobileViewportInsets);
  window.visualViewport.addEventListener('scroll', updateMobileViewportInsets);
}
updateMobileViewportInsets();

// --- State ---
let currentScreen = 'splash';
const screens = {
  splash: document.getElementById('screen-splash'),
  draw: document.getElementById('screen-draw'),
  sim: document.getElementById('screen-sim')
};

const worldCanvas = document.getElementById('world');
let worldCtx = null;
let challengeTool = 'none';
let simSessionStarted = false;
let preSandboxSession = null;
let turboParityWarningTimeout = null;
const BRAIN_LIBRARY_KEY = `${STORAGE_SCOPE_PREFIX}brainLibrary.v1`;
const LEGACY_BRAIN_LIBRARY_KEY = `${LEGACY_STORAGE_PREFIX}brainLibrary.v1`;
const CREATURE_CATALOG_KEY = `${STORAGE_SCOPE_PREFIX}creatureCatalog.v1`;
const LEGACY_CREATURE_CATALOG_KEY = `${LEGACY_STORAGE_PREFIX}creatureCatalog.v1`;
const CREATURE_CATALOG_DB_NAME = 'creaturelabs-storage-v1';
const CREATURE_CATALOG_DB_VERSION = 1;
const CREATURE_CATALOG_DB_STORE = 'kv';
const CREATURE_CATALOG_IDB_KEY = `${STORAGE_SCOPE_PREFIX}creatureCatalog.v1`;
const CREATURE_CATALOG_CACHE_NAME = 'creaturelabs-userdata-v1';
const CREATURE_CATALOG_CACHE_URL = `/__creaturelabs__/${STORAGE_SCOPE_ID}-creature-catalog-v1.json`;
const BRAIN_SCHEMA_VERSION = 'neat-v2-runtime';
const BRAIN_SCHEMA_VERSION_KEY = `${STORAGE_SCOPE_PREFIX}brainSchemaVersion`;
const LEGACY_BRAIN_SCHEMA_VERSION_KEY = `${LEGACY_STORAGE_PREFIX}brainSchemaVersion`;
const BRAIN_MIGRATION_NOTICE_KEY = `${STORAGE_SCOPE_PREFIX}brainMigrationNoticeVersion`;
const LEGACY_BRAIN_MIGRATION_NOTICE_KEY = `${LEGACY_STORAGE_PREFIX}brainMigrationNoticeVersion`;
let brainLibrary = [];
let creatureCatalog = [];
let creatureCatalogUpdatedAt = 0;
let creatureCatalogDbPromise = null;
let hasShownCreatureCatalogStorageWarning = false;
let hasHydratedCreatureCatalog = false;
const storageBridgePendingRequests = new Map();
let storageBridgeRequestId = 0;
let storageBridgeListenerReady = false;
let storageBridgeReachable = null;
const storageBridgeTargetOrigin = (() => {
  try {
    if (!document.referrer) return '*';
    return new URL(document.referrer).origin || '*';
  } catch {
    return '*';
  }
})();

function getCurrentAppState() {
  return {
    screen: currentScreen,
    platform: uiPlatform,
    simSessionStarted,
    sandboxMode: !!sim?.sandboxMode
  };
}

function subscribeAppState(listener) {
  if (typeof listener !== 'function') return () => {};
  appStateListeners.add(listener);
  return () => appStateListeners.delete(listener);
}

function emitAppState() {
  const state = getCurrentAppState();
  appStateListeners.forEach(listener => {
    try {
      listener(state);
    } catch (error) {
      console.warn('App state listener error:', error);
    }
  });
}

function inEmbeddedContext() {
  return window.top !== window.self;
}

function ensureStorageBridgeListener() {
  if (storageBridgeListenerReady) return;
  storageBridgeListenerReady = true;
  window.addEventListener('message', event => {
    const data = event?.data;
    if (!data || data.channel !== STORAGE_BRIDGE_CHANNEL || data.type !== 'storage:response') return;
    const handler = storageBridgePendingRequests.get(data.requestId);
    if (!handler) return;
    storageBridgePendingRequests.delete(data.requestId);
    handler(data);
  });
}

async function callParentStorageBridge(action, key, value = null) {
  if (!inEmbeddedContext()) return { ok: false, reason: 'not-embedded' };
  if (storageBridgeReachable === false) return { ok: false, reason: 'bridge-unavailable' };

  ensureStorageBridgeListener();
  return new Promise(resolve => {
    const requestId = `bridge-${Date.now()}-${++storageBridgeRequestId}`;
    const timeoutId = setTimeout(() => {
      storageBridgePendingRequests.delete(requestId);
      if (storageBridgeReachable === null) storageBridgeReachable = false;
      resolve({ ok: false, reason: 'timeout' });
    }, STORAGE_BRIDGE_TIMEOUT_MS);

    storageBridgePendingRequests.set(requestId, response => {
      clearTimeout(timeoutId);
      storageBridgeReachable = true;
      resolve(response && response.ok ? response : { ok: false, reason: response?.error || 'bridge-error' });
    });

    try {
      window.parent.postMessage(
        {
          channel: STORAGE_BRIDGE_CHANNEL,
          type: 'storage:request',
          requestId,
          action,
          key,
          value
        },
        storageBridgeTargetOrigin
      );
    } catch {
      clearTimeout(timeoutId);
      storageBridgePendingRequests.delete(requestId);
      if (storageBridgeReachable === null) storageBridgeReachable = false;
      resolve({ ok: false, reason: 'postmessage-failed' });
    }
  });
}

function formatTwoDecimals(value) {
  return Number.isFinite(value) ? value.toFixed(2) : '0.00';
}

// Performance: Cache panel dimensions (updated once per frame)
let cachedPanelDims = null;
let lastPanelUpdateFrame = 0;
let frameCount = 0;

// --- Modules ---
const sim = new Simulation();
sim.trainingAlgorithm = 'neat';
const SIM_MIN_ZOOM = Number.isFinite(CONFIG.minZoom) ? CONFIG.minZoom : 0.15;
const SIM_MAX_ZOOM = Number.isFinite(CONFIG.maxZoom) ? CONFIG.maxZoom : 2.5;
const SIM_START_PREVIEW_ZOOM = 0.8;
const SIM_START_PREVIEW_X_METERS = 10;
const SIM_START_GROUND_VIEW_RATIO = 0.58;
const SIM_START_GROUND_LOWER_METERS = 6;

function migrateBrainStorageIfNeeded() {
  try {
    const previousSchema = (
      localStorage.getItem(BRAIN_SCHEMA_VERSION_KEY)
      || localStorage.getItem(LEGACY_BRAIN_SCHEMA_VERSION_KEY)
    );
    if (previousSchema === BRAIN_SCHEMA_VERSION) {
      return { migrated: false, clearedKeys: [] };
    }

    const clearedKeys = [];
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (!key) continue;
      const isScopedKey = key.startsWith(STORAGE_SCOPE_PREFIX);
      const isLegacyBrainKey = (
        key === LEGACY_BRAIN_LIBRARY_KEY
        || key === LEGACY_BRAIN_SCHEMA_VERSION_KEY
        || key === LEGACY_BRAIN_MIGRATION_NOTICE_KEY
      );
      const isBrainKey = /brain/i.test(key);
      const isCatalogKey = key === CREATURE_CATALOG_KEY || key === LEGACY_CREATURE_CATALOG_KEY;
      const isMigrationKey = (
        key === BRAIN_SCHEMA_VERSION_KEY
        || key === BRAIN_MIGRATION_NOTICE_KEY
        || key === LEGACY_BRAIN_SCHEMA_VERSION_KEY
        || key === LEGACY_BRAIN_MIGRATION_NOTICE_KEY
      );
      if ((isScopedKey || isLegacyBrainKey) && isBrainKey && !isCatalogKey && !isMigrationKey) {
        localStorage.removeItem(key);
        clearedKeys.push(key);
      }
    }

    localStorage.setItem(BRAIN_SCHEMA_VERSION_KEY, BRAIN_SCHEMA_VERSION);
    localStorage.removeItem(LEGACY_BRAIN_SCHEMA_VERSION_KEY);
    return { migrated: true, clearedKeys };
  } catch {
    return { migrated: false, clearedKeys: [] };
  }
}

function showBrainMigrationNoticeOnce(migration) {
  if (!migration?.migrated) return;
  try {
    const shownVersion = (
      localStorage.getItem(BRAIN_MIGRATION_NOTICE_KEY)
      || localStorage.getItem(LEGACY_BRAIN_MIGRATION_NOTICE_KEY)
    );
    if (shownVersion === BRAIN_SCHEMA_VERSION) return;
    localStorage.setItem(BRAIN_MIGRATION_NOTICE_KEY, BRAIN_SCHEMA_VERSION);
    localStorage.removeItem(LEGACY_BRAIN_MIGRATION_NOTICE_KEY);
  } catch {
    // Ignore notice failures; migration already completed.
  }
}

const designer = new Designer(
  document.getElementById('design-area'),
  valid => {
    const btn = document.getElementById('btn-run');
    if (btn) btn.disabled = !valid;
  }
);

const controls = new Controls(sim);
const hud = new HUD();
const visualizer = new Visualizer(document.getElementById('nn-canvas'));
const progressChart = new ProgressChart(
  document.getElementById('progress-canvas'),
  document.getElementById('left-progress-canvas'),
  document.getElementById('left-graph-meta')
);
const evolutionMonitor = new EvolutionMonitor();
const evolutionFeedback = new EvolutionFeedback(evolutionMonitor);

// Make evolutionFeedback globally accessible for dismissSuggestions callback
window.evolutionFeedback = evolutionFeedback;

function getSimViewportOffsets() {
  if (document.body.classList.contains('mobile-sheet-open')) {
    return { left: 0, right: 0, top: 0, bottom: 0 };
  }

  const panelVisible = panel => (
    !!panel &&
    panel.style.display !== 'none' &&
    !panel.classList.contains('module-hidden')
  );

  let left = 0;
  let right = 0;
  let top = 0;
  let bottom = 0;

  const leftPanel = document.getElementById('panel-progress-left');
  const rightPanel = document.getElementById('panel-controls');
  const topPanel = document.getElementById('panel-top-bar');
  const bottomPanel = document.getElementById('panel-scorecard');

  if (panelVisible(leftPanel)) left = leftPanel.offsetWidth || 0;
  if (panelVisible(rightPanel)) right = rightPanel.offsetWidth || 0;
  if (panelVisible(topPanel)) top = topPanel.offsetHeight || 0;
  if (panelVisible(bottomPanel)) bottom = bottomPanel.offsetHeight || 0;

  if (document.body.classList.contains('app-mobile')) {
    const mobileDock = document.getElementById('mobile-quick-controls');
    if (mobileDock && !mobileDock.classList.contains('minimized') && !document.body.classList.contains('mobile-sheet-open')) {
      const isPortrait = window.innerHeight > window.innerWidth;
      if (isPortrait) bottom = Math.max(bottom, mobileDock.offsetHeight || 0);
      else right = Math.max(right, mobileDock.offsetWidth || 0);
    }

    const turboOverlay = document.getElementById('mobile-turbo-overlay');
    const turboVisible = (
      turboOverlay &&
      !turboOverlay.classList.contains('hidden') &&
      getComputedStyle(turboOverlay).display !== 'none'
    );
    if (turboVisible) {
      top += (turboOverlay.offsetHeight || 0) + 6;
    }
  }

  return { left, right, top, bottom };
}

function fitSimCameraToDesign(design) {
  const nodes = Array.isArray(design?.nodes) ? design.nodes : [];
  if (!nodes.length || !worldCanvas.width || !worldCanvas.height) return false;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  nodes.forEach(n => {
    if (!Number.isFinite(n?.x) || !Number.isFinite(n?.y)) return;
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x);
    maxY = Math.max(maxY, n.y);
  });
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return false;
  }

  const boundsW = Math.max(60, maxX - minX);
  const boundsH = Math.max(60, maxY - minY);
  const padPx = 90;
  const framedW = boundsW + padPx * 2;
  const framedH = boundsH + padPx * 2;

  const { left, right, top, bottom } = getSimViewportOffsets();
  const usableW = Math.max(220, worldCanvas.width - left - right);
  const usableH = Math.max(200, worldCanvas.height - top - bottom);
  const fitZoom = Math.min(SIM_MAX_ZOOM, Math.max(SIM_MIN_ZOOM, Math.min(usableW / framedW, usableH / framedH)));

  const centerX = (minX + maxX) * 0.5;
  const centerY = (minY + maxY) * 0.5;
  const visibleCenterX = (left + usableW * 0.5) / fitZoom;
  const visibleCenterY = (top + usableH * 0.5) / fitZoom;

  sim.zoom = fitZoom;
  sim.cameraX = centerX - visibleCenterX;
  sim.cameraY = Math.max(0, centerY - visibleCenterY);

  const zoomSlider = document.getElementById('inp-zoom');
  if (zoomSlider) zoomSlider.value = String(Math.round(sim.zoom * 100));
  controls.updateLabels();
  return true;
}

function resetSimCameraFallback() {
  sim.zoom = Math.min(SIM_MAX_ZOOM, Math.max(SIM_MIN_ZOOM, 1));
  sim.cameraX = 0;
  sim.cameraY = Math.max(0, sim.getGroundY() - (worldCanvas.height / sim.zoom) * 0.78);
  const zoomSlider = document.getElementById('inp-zoom');
  if (zoomSlider) zoomSlider.value = String(Math.round(sim.zoom * 100));
  controls.updateLabels();
}

function centerSimCameraAtOriginGround() {
  sim.zoom = Math.min(SIM_MAX_ZOOM, Math.max(SIM_MIN_ZOOM, SIM_START_PREVIEW_ZOOM));
  const { left, right, top, bottom } = getSimViewportOffsets();
  const usableW = Math.max(220, worldCanvas.width - left - right);
  const usableH = Math.max(200, worldCanvas.height - top - bottom);
  const visibleCenterX = (left + usableW * 0.5) / sim.zoom;
  const startX = SIM_START_PREVIEW_X_METERS * SCALE;
  const groundTargetY =
    ((top + usableH * SIM_START_GROUND_VIEW_RATIO) / sim.zoom) +
    (SIM_START_GROUND_LOWER_METERS * SCALE);

  // Pre-start framing: slight forward X offset and ground a bit lower in view for clarity.
  sim.cameraX = startX - visibleCenterX;
  sim.cameraY = Math.max(0, sim.getGroundY() - groundTargetY);

  const zoomSlider = document.getElementById('inp-zoom');
  if (zoomSlider) zoomSlider.value = String(Math.round(sim.zoom * 100));
  controls.updateLabels();
}

function fitCurrentSimCameraToCreature(forceLock = false) {
  const fitted = fitSimCameraToDesign({ nodes: sim.nodes });
  if (!fitted) resetSimCameraFallback();
  if (forceLock) controls.setCameraMode('lock');
  return fitted;
}

// --- Screen management ---
function setScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');
  currentScreen = name;

  if (name !== 'sim') {
    closeMobileSheet();
  }

  if (name === 'draw') {
    sim.stopLoop();
    simSessionStarted = false;
    toggleCreatureCatalog(false);
    designer.render();
  } else if (name === 'sim') {
    if (document.body.classList.contains('app-mobile')) {
      const mobileDock = document.getElementById('mobile-quick-controls');
      if (mobileDock) mobileDock.classList.remove('minimized');
    }
    // Transfer design to simulation; wait for explicit Start Sim.
    const design = designer.getDesign();
    sim.nodes = design.nodes;
    sim.constraints = design.constraints;
    resizeCanvases();
    worldCtx = worldCanvas.getContext('2d');
    simSessionStarted = false;
    controls.setCameraMode('free');
    centerSimCameraAtOriginGround();
    const icon = document.getElementById('icon-pause');
    if (icon) icon.className = 'fas fa-pause';
    updateStartSimUI();
    updateSandboxUI();
    renderWorld(null);
  }

  if (uiSurface && typeof uiSurface.sync === 'function') {
    uiSurface.sync(getCurrentAppState());
  }
  updateMobileSimTopHud();
  emitAppState();
}

function resizeCanvases() {
  const viewportWidth = Math.max(window.innerWidth || 0, document.documentElement?.clientWidth || 0);
  const viewportHeight = Math.max(window.innerHeight || 0, document.documentElement?.clientHeight || 0);
  designer.resize();
  worldCanvas.width = viewportWidth;
  worldCanvas.height = viewportHeight;
}

function worldPointFromEvent(e) {
  const rect = worldCanvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;
  return {
    x: sx / sim.zoom + sim.cameraX,
    y: sy / sim.zoom + sim.cameraY
  };
}

function triggerTrainingStatAnimation() {
  ['panel-hud', 'fitness-cards'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('stats-training-pop');
    void el.offsetWidth;
    el.classList.add('stats-training-pop');
    setTimeout(() => el.classList.remove('stats-training-pop'), 700);
  });
}

function updateStartSimUI() {
  const btn = document.getElementById('btn-start-sim');
  const label = document.getElementById('start-sim-label');
  
  const mqStart = document.getElementById('btn-mq-start');
  const mqStartIcon = document.getElementById('icon-mq-start');
  const mqStartLabel = document.getElementById('label-mq-start');
  const mqReset = document.getElementById('btn-mq-reset');

  if (currentScreen !== 'sim') {
    if (btn) btn.classList.remove('start-ready', 'training');
    if (label) label.textContent = 'Start Sim';
    syncMobileQuickControlState();
    return;
  }

  if (!simSessionStarted) {
    if (btn) {
      btn.classList.add('start-ready');
      btn.classList.remove('training');
      btn.title = 'Start Simulation';
    }
    if (label) label.textContent = 'Start Sim';
    if (mqStartIcon) mqStartIcon.className = 'fas fa-play';
    if (mqStartLabel) mqStartLabel.textContent = 'Start';
    if (mqStart) {
      mqStart.classList.add('is-idle');
      mqStart.classList.remove('is-running', 'is-paused');
    }
    if (mqReset) mqReset.disabled = true;
  } else {
    if (btn) {
      btn.classList.remove('start-ready');
      btn.classList.add('training');
      btn.title = 'Simulation Running';
    }
    if (label) label.textContent = 'Training...';
    const isPaused = sim.sandboxMode ? sim.sandboxPaused : sim.paused;
    if (mqStartIcon) mqStartIcon.className = isPaused ? 'fas fa-play' : 'fas fa-pause';
    if (mqStartLabel) mqStartLabel.textContent = isPaused ? 'Play' : 'Pause';
    if (mqStart) {
      mqStart.classList.remove('is-idle');
      mqStart.classList.toggle('is-paused', isPaused);
      mqStart.classList.toggle('is-running', !isPaused);
    }
    if (mqReset) mqReset.disabled = false;
  }

  syncMobileQuickControlState();
}

function syncMobileQuickControlState() {
  const MOBILE_SIM_SPEED_MAX = 20;
  const mqTurbo = document.getElementById('btn-mq-turbo');
  const mqCam = document.getElementById('btn-mq-cam');
  const mqGroundDraw = document.getElementById('btn-mq-ground-draw');
  const desktopGroundDraw = document.getElementById('btn-ground-draw');
  const desktopSpeed = document.getElementById('inp-speed');
  const isMobile = document.body.classList.contains('app-mobile');

  if (isMobile && Number(sim.simSpeed) > MOBILE_SIM_SPEED_MAX && desktopSpeed) {
    sim.simSpeed = MOBILE_SIM_SPEED_MAX;
    desktopSpeed.value = String(MOBILE_SIM_SPEED_MAX);
  }

  if (mqTurbo) mqTurbo.classList.toggle('active', sim.trainingMode === 'turbo');
  if (mqCam) mqCam.classList.toggle('active', sim.cameraMode === 'lock');
  setMobileSpeedVisual(sim.simSpeed);

  if (mqGroundDraw && desktopGroundDraw) {
    mqGroundDraw.classList.toggle('active', desktopGroundDraw.classList.contains('active'));
  }

  updateMobileTurboOverlay();
}

function setMobileSpeedVisual(speedValue) {
  const MOBILE_SIM_SPEED_MAX = 20;
  const mqSpeedSlider = document.getElementById('mq-speed-slider');
  const mqSpeedInput = document.getElementById('inp-mq-speed');
  const mqSpeedVal = document.getElementById('mq-speed-val');
  const clampedSpeed = Math.max(1, Math.min(MOBILE_SIM_SPEED_MAX, Math.round(Number(speedValue) || 1)));
  const pct = ((clampedSpeed - 1) / (MOBILE_SIM_SPEED_MAX - 1)) * 100;
  const scale = (clampedSpeed - 1) / (MOBILE_SIM_SPEED_MAX - 1);

  if (mqSpeedVal) mqSpeedVal.textContent = `${clampedSpeed}x`;
  if (mqSpeedInput && Number(mqSpeedInput.value) !== clampedSpeed) {
    mqSpeedInput.value = String(clampedSpeed);
  }
  if (mqSpeedSlider) {
    mqSpeedSlider.style.setProperty('--mq-speed-pct', `${pct.toFixed(2)}%`);
    mqSpeedSlider.style.setProperty('--mq-speed-scale', scale.toFixed(4));
  }
}

function updateMobileTurboOverlay() {
  const wrap = document.getElementById('mobile-turbo-overlay');
  if (!wrap) return;

  const isMobile = document.body.classList.contains('app-mobile');
  const turboMode = sim.trainingMode === 'turbo' && !sim.sandboxMode;
  const show = isMobile && currentScreen === 'sim' && simSessionStarted && turboMode;
  wrap.classList.toggle('hidden', !show);
  if (!show) return;

  const safe = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
  const statusRaw = String(sim.turboStatus || 'running').toLowerCase();
  const status = ['warming', 'running', 'fallback'].includes(statusRaw) ? statusRaw : 'running';
  const summary = sim.lastTurboGenerationSummary || null;
  const diagnostics = sim.lastTurboDiagnostics || null;

  const workerMs = Math.max(0, safe(summary?.elapsedMs, safe(diagnostics?.workerElapsedMs, 0)));
  let throughputX = safe(diagnostics?.throughputX, 0);
  if (throughputX <= 0 && workerMs > 0) {
    throughputX = ((safe(sim.simDuration, 0) * 1000) / workerMs);
  }
  throughputX = Math.max(0, throughputX);

  const history = Array.isArray(sim.progressHistory) ? sim.progressHistory : [];
  const latestProgress = history.length ? history[history.length - 1] : null;
  const previousBest = history.length >= 2
    ? Math.max(0, safe(history[history.length - 2]?.allBest, 0))
    : Math.max(0, safe(sim.prevAllTimeBest, safe(latestProgress?.allBest, safe(sim.allTimeBest, 0))));
  const liveGenBest = Math.max(0, safe(sim.genBestDist, 0));
  const completedGenBest = Math.max(0, safe(latestProgress?.genBest, 0));
  const hasLiveGeneration = liveGenBest > 1e-6;
  const baselineBest = hasLiveGeneration
    ? Math.max(0, safe(latestProgress?.allBest, safe(sim.allTimeBest, 0)))
    : previousBest;
  const generationDistance = hasLiveGeneration ? liveGenBest : completedGenBest;
  const delta = generationDistance - baselineBest;

  const setText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };

  const title = status === 'warming'
    ? 'Accelerating Simulation'
    : status === 'fallback'
      ? 'Turbo Fallback Active'
      : 'Running Simulation';

  wrap.classList.toggle('is-warming', status === 'warming');
  wrap.classList.toggle('is-running', status === 'running');
  wrap.classList.toggle('is-fallback', status === 'fallback');

  setText('mobile-turbo-title', title);
  setText('mobile-turbo-status', status.toUpperCase());
  setText('mobile-turbo-throughput', `${throughputX.toFixed(1)}x`);
  setText('mobile-turbo-delta', `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}m`);

  const deltaEl = document.getElementById('mobile-turbo-delta');
  if (deltaEl) {
    deltaEl.classList.remove('delta-positive', 'delta-negative');
    if (delta > 0.05) deltaEl.classList.add('delta-positive');
    else if (delta < -0.05) deltaEl.classList.add('delta-negative');
  }
}

function updateMobileSimTopHud() {
  const wrap = document.getElementById('mobile-sim-top-hud');
  if (!wrap) return;

  const isMobile = document.body.classList.contains('app-mobile');
  const show = isMobile && currentScreen === 'sim';
  wrap.classList.toggle('hidden', !show);
  updateMobileTurboOverlay();
  if (!show) return;

  const safe = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
  const latestProgress = Array.isArray(sim.progressHistory) && sim.progressHistory.length
    ? sim.progressHistory[sim.progressHistory.length - 1]
    : null;
  const latestGenBest = Number.isFinite(Number(latestProgress?.genBest))
    ? Number(latestProgress.genBest)
    : 0;
  const liveGenBest = safe(sim.genBestDist, 0);
  const genBestDisplay = Math.max(liveGenBest, latestGenBest);
  const allBest = safe(sim.allTimeBest, 0);
  const timeLeft = Math.max(0, safe(sim.timer, 0));
  const elapsed = Math.max(0, safe(sim.runElapsedSec, safe(sim.simTimeElapsed, 0)));

  const setText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };

  setText('mobile-hud-gen', String(safe(sim.generation, 1)));
  setText('mobile-hud-genbest', `${genBestDisplay.toFixed(1)}m`);
  setText('mobile-hud-allbest', `${allBest.toFixed(1)}m`);
  setText('mobile-hud-time', `${timeLeft.toFixed(1)}s`);
  setText('mobile-hud-elapsed', `${elapsed.toFixed(1)}s`);
}

function isMobileRuntime() {
  return document.body.classList.contains('app-mobile');
}

function setMobileSheetTab(tab = 'controls') {
  if (!isMobileRuntime()) return;

  const safeTab = tab === 'stats' ? 'stats' : 'controls';
  const shell = document.getElementById('mobile-panel-shell');
  const controlsPane = document.getElementById('mobile-pane-controls');
  const statsPane = document.getElementById('mobile-pane-stats');
  const controlsTab = document.getElementById('btn-mobile-tab-controls');
  const statsTab = document.getElementById('btn-mobile-tab-stats');
  if (!shell || !controlsPane || !statsPane || !controlsTab || !statsTab) return;

  document.body.classList.remove('mobile-sheet-controls', 'mobile-sheet-stats');
  document.body.classList.add(`mobile-sheet-${safeTab}`);

  const controlsActive = safeTab === 'controls';
  controlsPane.classList.toggle('hidden', !controlsActive);
  statsPane.classList.toggle('hidden', controlsActive);

  controlsTab.classList.toggle('active', controlsActive);
  controlsTab.setAttribute('aria-selected', controlsActive ? 'true' : 'false');
  statsTab.classList.toggle('active', !controlsActive);
  statsTab.setAttribute('aria-selected', controlsActive ? 'false' : 'true');
}

function openMobileSheet(tab = 'controls') {
  if (!isMobileRuntime()) return;
  ensureMobileSheetMounted();

  const shell = document.getElementById('mobile-panel-shell');
  if (!shell) return;

  document.body.classList.remove('mobile-panel-controls', 'mobile-panel-top');
  document.body.classList.add('mobile-sheet-open');
  shell.classList.remove('hidden');
  shell.setAttribute('aria-hidden', 'false');
  setMobileSheetTab(tab);
}

function closeMobileSheet() {
  const shell = document.getElementById('mobile-panel-shell');
  document.body.classList.remove(...MOBILE_SHEET_STATE_CLASSES);
  document.body.classList.remove('mobile-panel-controls', 'mobile-panel-top');
  if (shell) {
    shell.classList.add('hidden');
    shell.setAttribute('aria-hidden', 'true');
  }
}

function createMobileControlModule(config) {
  const { id, title, advanced = false } = config;
  const root = document.createElement('section');
  root.className = 'mobile-control-module';
  root.dataset.moduleId = id;
  if (advanced) root.classList.add('is-advanced');

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'mobile-control-module-toggle';
  toggle.innerHTML = `
    <span class="mobile-control-module-title">${title}</span>
    <span class="mobile-control-module-chevron" aria-hidden="true"><i class="fas fa-chevron-down"></i></span>
  `;

  const body = document.createElement('div');
  body.className = 'mobile-control-module-body';

  const storageKey = `${MOBILE_MODULE_STORAGE_PREFIX}${id}.collapsed`;
  let collapsed = !!advanced;
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved === '1') collapsed = true;
    else if (saved === '0') collapsed = false;
  } catch {
    // Ignore localStorage access issues.
  }

  const setCollapsed = next => {
    root.classList.toggle('collapsed', next);
    toggle.setAttribute('aria-expanded', next ? 'false' : 'true');
    try {
      localStorage.setItem(storageKey, next ? '1' : '0');
    } catch {
      // Ignore localStorage access issues.
    }
  };

  toggle.addEventListener('click', () => {
    const next = !root.classList.contains('collapsed');
    setCollapsed(next);
  });

  setCollapsed(collapsed);
  root.appendChild(toggle);
  root.appendChild(body);
  return { root, body };
}

function setupMobileTrainingModules() {
  const trainingSections = document.getElementById('training-sections');
  if (!trainingSections || trainingSections.dataset.mobileModulesReady === '1') return;

  const moduleGrid = document.createElement('div');
  moduleGrid.id = 'mobile-training-module-grid';
  moduleGrid.className = 'mobile-training-module-grid';
  trainingSections.insertBefore(moduleGrid, trainingSections.firstChild);

  const configs = [
    { id: 'simulation', title: 'Simulation' },
    { id: 'camera', title: 'Camera & Environment' },
    { id: 'evolution', title: 'Evolution' },
    { id: 'turbo', title: 'Turbo' },
    { id: 'physics', title: 'Physics (Advanced)', advanced: true },
    { id: 'debug', title: 'Neural & Debug (Advanced)', advanced: true }
  ];

  const moduleBodies = new Map();
  configs.forEach(config => {
    const module = createMobileControlModule(config);
    moduleGrid.appendChild(module.root);
    moduleBodies.set(config.id, module.body);
  });

  const appendToModule = (moduleId, node) => {
    const body = moduleBodies.get(moduleId);
    if (!body || !node || node.dataset.mobileModuleMoved === '1') return;
    node.dataset.mobileModuleMoved = '1';
    body.appendChild(node);
  };

  const groupFor = id => document.getElementById(id)?.closest('.control-group') || null;
  const actionRow = document.getElementById('btn-start-sim')?.closest('.flex.justify-between.gap-2') || null;
  const resetSettings = document.getElementById('btn-reset-settings') || null;
  const mutationInfo = groupFor('inp-mutsize')?.nextElementSibling || null;

  appendToModule('simulation', groupFor('ghosts-on'));
  appendToModule('simulation', actionRow);
  appendToModule('simulation', resetSettings);
  appendToModule('simulation', groupFor('view-training'));
  appendToModule('simulation', groupFor('inp-speed'));

  appendToModule('camera', groupFor('cam-lock'));
  appendToModule('camera', groupFor('btn-ground-draw'));
  appendToModule('camera', groupFor('btn-brain-save'));
  appendToModule('camera', groupFor('inp-zoom'));

  appendToModule('evolution', groupFor('fitness-tag'));
  appendToModule('evolution', groupFor('inp-duration'));
  appendToModule('evolution', groupFor('inp-pop'));
  appendToModule('evolution', groupFor('inp-mut'));
  appendToModule('evolution', groupFor('inp-mutsize'));
  appendToModule('evolution', mutationInfo);
  appendToModule('evolution', groupFor('testing-off'));

  appendToModule('turbo', groupFor('engine-normal'));
  appendToModule('turbo', groupFor('turbo-wall-off'));
  appendToModule('turbo', groupFor('inp-turbo-poles'));
  appendToModule('turbo', groupFor('inp-wall-speed'));
  appendToModule('turbo', groupFor('inp-wall-start'));

  appendToModule('physics', groupFor('inp-musbudget'));
  appendToModule('physics', groupFor('inp-strength'));
  appendToModule('physics', groupFor('inp-gravity'));
  appendToModule('physics', groupFor('inp-groundfric'));
  appendToModule('physics', groupFor('inp-musminlen'));
  appendToModule('physics', groupFor('inp-musmaxlen'));
  appendToModule('physics', groupFor('inp-musmooth'));

  appendToModule('debug', groupFor('val-nn-arch'));
  appendToModule('debug', groupFor('neat-mode-badge'));
  appendToModule('debug', document.getElementById('legacy-nn-controls'));
  appendToModule('debug', groupFor('dbg-intent-hz'));

  const leftovers = Array.from(trainingSections.children).filter(child => child !== moduleGrid);
  leftovers.forEach(node => appendToModule('debug', node));

  trainingSections.dataset.mobileModulesReady = '1';
}

function bindMobileRangeCard(rangeInput) {
  if (!rangeInput || rangeInput.dataset.mobileRangeBound === '1') return;
  const card = rangeInput.closest('.control-group');
  if (!card) return;

  const min = Number.parseFloat(rangeInput.min);
  const max = Number.parseFloat(rangeInput.max);
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return;

  const step = Math.max(0, Number.parseFloat(rangeInput.step || '1'));

  rangeInput.dataset.mobileRangeBound = '1';
  card.classList.add('mobile-range-card');
  rangeInput.classList.add('mobile-range-input');

  const clampToStep = value => {
    const clamped = Math.max(min, Math.min(max, value));
    if (!Number.isFinite(step) || step <= 0) return clamped;
    const snapped = min + Math.round((clamped - min) / step) * step;
    const decimals = step.toString().includes('.') ? step.toString().split('.')[1].length : 0;
    return Number(snapped.toFixed(Math.min(6, Math.max(0, decimals))));
  };

  const renderFill = () => {
    const current = Number.parseFloat(rangeInput.value);
    const normalized = Number.isFinite(current) ? (current - min) / (max - min) : 0;
    const scale = Math.max(0, Math.min(1, normalized));
    card.style.setProperty('--mobile-range-scale', scale.toFixed(4));
  };
  renderFill();
  rangeInput.addEventListener('input', renderFill);

  let pointerActive = false;
  let pointerId = null;
  let sliderRect = null;

  const emitValueFromClientX = clientX => {
    if (!sliderRect?.width) return;
    const normalized = Math.max(0, Math.min(1, (clientX - sliderRect.left) / sliderRect.width));
    const next = clampToStep(min + normalized * (max - min));
    if (String(next) === String(rangeInput.value)) return;
    rangeInput.value = String(next);
    rangeInput.dispatchEvent(new Event('input', { bubbles: true }));
  };

  const onPointerDown = e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target && (e.target.tagName === 'BUTTON' || e.target.tagName === 'SELECT')) return;
    pointerActive = true;
    pointerId = e.pointerId;
    sliderRect = rangeInput.getBoundingClientRect();
    card.setPointerCapture?.(e.pointerId);
    e.preventDefault();
    emitValueFromClientX(e.clientX);
  };

  const onPointerMove = e => {
    if (!pointerActive) return;
    if (pointerId !== null && e.pointerId !== pointerId) return;
    e.preventDefault();
    emitValueFromClientX(e.clientX);
  };

  const onPointerStop = e => {
    if (pointerId !== null && e.pointerId !== pointerId) return;
    if (Number.isFinite(e.clientX)) emitValueFromClientX(e.clientX);
    pointerActive = false;
    pointerId = null;
    if (card.hasPointerCapture?.(e.pointerId)) {
      card.releasePointerCapture(e.pointerId);
    }
    sliderRect = null;
  };

  card.addEventListener('pointerdown', onPointerDown);
  card.addEventListener('pointermove', onPointerMove);
  card.addEventListener('pointerrawupdate', onPointerMove);
  card.addEventListener('pointerup', onPointerStop);
  card.addEventListener('pointercancel', onPointerStop);
  card.addEventListener('lostpointercapture', onPointerStop);
}

function setupMobileSliderCards() {
  const panelControls = document.getElementById('panel-controls');
  if (!panelControls) return;
  panelControls.querySelectorAll('input[type="range"]').forEach(input => bindMobileRangeCard(input));
}

function ensureMobileSheetMounted() {
  if (!isMobileRuntime() || mobileSheetReady) return;

  const shell = document.getElementById('mobile-panel-shell');
  const controlsPane = document.getElementById('mobile-pane-controls');
  const statsPane = document.getElementById('mobile-pane-stats');
  const statsLiveBody = document.getElementById('mobile-stats-live-body');
  const statsNeuralBody = document.getElementById('mobile-stats-neural-body');
  const statsEvolutionBody = document.getElementById('mobile-stats-evolution-body');
  const statsSecondaryBody = document.getElementById('mobile-stats-secondary-body');
  if (!shell || !controlsPane || !statsPane || !statsLiveBody || !statsNeuralBody || !statsEvolutionBody || !statsSecondaryBody) return;

  const controlsPanel = document.getElementById('panel-controls');
  const panelHud = document.getElementById('panel-hud');
  const leftNnContainer = document.getElementById('left-nn-container');
  const leftNeatProgress = document.getElementById('left-neat-progress');
  const evolutionFeedback = document.getElementById('evolution-feedback');
  const trainingDetails = document.getElementById('training-details');
  const sandboxScorecardWrap = document.getElementById('sandbox-scorecard-wrap');
  const topPanel = document.getElementById('panel-top-bar');
  const leftPanel = document.getElementById('panel-progress-left');
  const bottomPanel = document.getElementById('panel-scorecard');
  if (controlsPanel && controlsPanel.parentElement !== controlsPane) controlsPane.appendChild(controlsPanel);

  const moveNode = (node, parent) => {
    if (!node || !parent || node.parentElement === parent) return;
    parent.appendChild(node);
  };

  moveNode(panelHud, statsLiveBody);
  moveNode(leftNnContainer, statsNeuralBody);
  moveNode(leftNeatProgress, statsEvolutionBody);
  moveNode(evolutionFeedback, statsEvolutionBody);
  moveNode(trainingDetails, statsSecondaryBody);
  moveNode(sandboxScorecardWrap, statsSecondaryBody);

  // Keep desktop panel wrappers hidden/empty while mobile command center uses extracted content.
  if (topPanel) topPanel.style.display = 'none';
  if (leftPanel) leftPanel.style.display = 'none';
  if (bottomPanel) bottomPanel.style.display = 'none';

  setupMobileTrainingModules();
  setupMobileSliderCards();

  const backBtn = document.getElementById('btn-mobile-panel-back');
  const tabControls = document.getElementById('btn-mobile-tab-controls');
  const tabStats = document.getElementById('btn-mobile-tab-stats');

  if (backBtn && backBtn.dataset.bound !== '1') {
    backBtn.dataset.bound = '1';
    backBtn.addEventListener('click', () => closeMobileSheet());
  }
  if (tabControls && tabControls.dataset.bound !== '1') {
    tabControls.dataset.bound = '1';
    tabControls.addEventListener('click', () => setMobileSheetTab('controls'));
  }
  if (tabStats && tabStats.dataset.bound !== '1') {
    tabStats.dataset.bound = '1';
    tabStats.addEventListener('click', () => setMobileSheetTab('stats'));
  }

  mobileSheetReady = true;
}

function updateSandboxUI() {
  const training = document.getElementById('training-details');
  const sandbox = document.getElementById('sandbox-scorecard-wrap');
  const panelTopBar = document.getElementById('panel-top-bar');
  const panelProgressLeft = document.getElementById('panel-progress-left');
  const panelScorecard = document.getElementById('panel-scorecard');
  
  // Sandbox-specific sections to show/hide in right panel
  const sandboxSection = document.getElementById('sandbox-panel-section');
  const trainingSections = document.getElementById('training-sections');
  
  // Sandbox toggle buttons
  const sandboxRunBtn = document.getElementById('btn-sandbox-run');
  const sandboxExitBtn = document.getElementById('btn-sandbox-exit');
  const brainLibrarySection = document.getElementById('brain-library-section');
  
  if (sim.sandboxMode) {
    if (training) training.classList.add('hidden');
    if (sandbox) sandbox.classList.remove('hidden');
    // Hide left panel and bottom panel in sandbox mode, but keep top bar for camera controls
    if (panelProgressLeft) panelProgressLeft.style.display = 'none';
    if (panelScorecard) panelScorecard.style.display = 'none';
    // Show sandbox section in right panel, hide training sections
    if (sandboxSection) sandboxSection.style.display = 'block';
    if (trainingSections) trainingSections.style.display = 'none';
    // Toggle sandbox/train buttons
    if (sandboxRunBtn) sandboxRunBtn.style.display = 'none';
    if (sandboxExitBtn) sandboxExitBtn.style.display = 'none';
    if (brainLibrarySection) brainLibrarySection.style.display = 'none';
    // Don't show floating controls - use right panel instead
    hideSandboxControls();
    syncSandboxPauseButtons();
  } else {
    if (training) training.classList.remove('hidden');
    if (sandbox) sandbox.classList.add('hidden');
    // Restore panels
    if (panelProgressLeft) panelProgressLeft.style.display = 'block';
    if (panelScorecard) panelScorecard.style.display = 'block';
    // Show training sections, hide sandbox section
    if (sandboxSection) sandboxSection.style.display = 'none';
    if (trainingSections) trainingSections.style.display = 'block';
    // Toggle sandbox/train buttons - show Run Sandbox, hide Exit Sandbox
    if (sandboxRunBtn) sandboxRunBtn.style.display = 'block';
    if (sandboxExitBtn) sandboxExitBtn.style.display = 'none';
    if (brainLibrarySection) brainLibrarySection.style.display = 'block';
    hideSandboxControls();
    // Clear sandbox graphs
    const graphIds = ['sandbox-graph-distance', 'sandbox-graph-speed', 'sandbox-graph-stability', 'sandbox-graph-actuation'];
    graphIds.forEach(id => {
      const canvas = document.getElementById(id);
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    });
  }

  if (uiSurface && typeof uiSurface.sync === 'function') {
    uiSurface.sync(getCurrentAppState());
  }
  updateMobileSimTopHud();
  emitAppState();
}

function syncSandboxPauseButtons() {
  const paused = !!sim.sandboxPaused;

  const panelBtn = document.getElementById('btn-sandbox-pause-panel');
  if (panelBtn) {
    if (paused) {
      panelBtn.innerHTML = '<i class="fas fa-play mr-1"></i> Resume';
      panelBtn.classList.remove('bg-amber-500/20', 'text-amber-300', 'border-amber-400/40');
      panelBtn.classList.add('bg-emerald-500/20', 'text-emerald-300', 'border-emerald-400/40');
    } else {
      panelBtn.innerHTML = '<i class="fas fa-pause mr-1"></i> Pause';
      panelBtn.classList.remove('bg-emerald-500/20', 'text-emerald-300', 'border-emerald-400/40');
      panelBtn.classList.add('bg-amber-500/20', 'text-amber-300', 'border-amber-400/40');
    }
  }

  const floatingBtn = document.getElementById('btn-sandbox-pause');
  if (floatingBtn) {
    if (paused) {
      floatingBtn.innerHTML = '<i class="fas fa-play"></i> Resume';
      floatingBtn.classList.remove('sandbox-btn-pause');
      floatingBtn.classList.add('sandbox-btn-resume');
    } else {
      floatingBtn.innerHTML = '<i class="fas fa-pause"></i> Pause';
      floatingBtn.classList.remove('sandbox-btn-resume');
      floatingBtn.classList.add('sandbox-btn-pause');
    }
  }
}

function restorePreviousSessionAfterSandbox() {
  const session = preSandboxSession;
  preSandboxSession = null;

  if (session?.simSnapshot && sim.restoreSessionSnapshot(session.simSnapshot)) {
    if (session.designSnapshot?.nodes && session.designSnapshot?.constraints) {
      try {
        designer.loadDesign(session.designSnapshot);
      } catch {
        // Non-fatal: restored sim runtime still proceeds.
      }
    }
    simSessionStarted = true;
    updateStartSimUI();
    updateSandboxUI();
    renderBrainLibrary();
    return true;
  }

  sim.exitSandboxMode();
  resetControlSettingsForNewCreature();
  startTrainingNow();
  updateSandboxUI();
  renderBrainLibrary();
  return false;
}

function updateTestingDashboardUI() {
  const testingOn = !!sim.testingModeEnabled;
  const title = document.getElementById('scorecard-title');
  const modeBadge = document.getElementById('score-mode');
  if (title) {
    title.innerHTML = testingOn
      ? '<i class=\"fas fa-flask-vial mr-1\"></i> Turbo Test Dashboard'
      : '<i class=\"fas fa-chart-bar mr-1\"></i> Current Run';
  }
  if (modeBadge) {
    modeBadge.textContent = testingOn ? 'TESTING' : 'TRAINING';
    modeBadge.className = testingOn ? 'text-amber-300 text-[9px]' : 'text-cyan-300 text-[9px]';
  }
}

function ensureSandboxControls() {
  let container = document.getElementById('sandbox-controls');
  if (!container) {
    container = document.createElement('div');
    container.id = 'sandbox-controls';
    
    container.innerHTML = `
      <div class="sandbox-header">
        <span class="sandbox-badge">SANDBOX</span>
        <span class="sandbox-run" id="sandbox-run-num">RUN 1</span>
      </div>
      <div class="sandbox-stats">
        <div class="sandbox-stat">
          <div class="sandbox-stat-label">Distance</div>
          <div class="sandbox-stat-value" id="sandbox-stat-dist">0.0m</div>
        </div>
        <div class="sandbox-stat">
          <div class="sandbox-stat-label">Speed</div>
          <div class="sandbox-stat-value" id="sandbox-stat-speed">0.0 m/s</div>
        </div>
        <div class="sandbox-stat">
          <div class="sandbox-stat-label">Ground Slip</div>
          <div class="sandbox-stat-value" id="sandbox-stat-stability">0.00</div>
        </div>
        <div class="sandbox-stat">
          <div class="sandbox-stat-label">Actuation</div>
          <div class="sandbox-stat-value" id="sandbox-stat-falls">0%</div>
        </div>
      </div>
      <div class="sandbox-buttons">
        <button class="sandbox-btn sandbox-btn-pause" id="btn-sandbox-pause">
          <i class="fas fa-pause"></i> Pause
        </button>
        <button class="sandbox-btn sandbox-btn-exit" id="btn-sandbox-exit-new">
          <i class="fas fa-sign-out-alt"></i> Exit
        </button>
      </div>
    `;
    
    document.body.appendChild(container);
    
    // Bind events
    document.getElementById('btn-sandbox-pause').onclick = () => {
      sim.sandboxPaused = !sim.sandboxPaused;
      syncSandboxPauseButtons();
    };
    
    document.getElementById('btn-sandbox-exit-new').onclick = () => {
      restorePreviousSessionAfterSandbox();
    };
  }
}

function hideSandboxControls() {
  const el = document.getElementById('sandbox-controls');
  if (el) el.remove();
}

// Initialize sandbox panel controls (called after DOM is ready)
function initSandboxPanelControls() {
  // Sandbox speed slider
  const speedSlider = document.getElementById('inp-sandbox-speed');
  const speedVal = document.getElementById('val-sandbox-speed');
  if (speedSlider) {
    speedSlider.oninput = () => {
      const val = parseInt(speedSlider.value);
      sim.simSpeed = val;
      if (speedVal) speedVal.textContent = val + 'x';
    };
  }
  
  // Sandbox pause button in right panel
  const pauseBtn = document.getElementById('btn-sandbox-pause-panel');
  if (pauseBtn) {
    pauseBtn.onclick = () => {
      sim.sandboxPaused = !sim.sandboxPaused;
      syncSandboxPauseButtons();
    };
  }
  
  // Sandbox exit button in right panel
  const exitBtn = document.getElementById('btn-sandbox-exit-panel');
  if (exitBtn) {
    exitBtn.onclick = () => {
      restorePreviousSessionAfterSandbox();
    };
  }
  
  // Sandbox reset button in right panel
  const resetBtn = document.getElementById('btn-sandbox-reset-panel');
  if (resetBtn) {
    resetBtn.onclick = () => {
      // Reset the creature position by restarting the sandbox run
      sim.restartSandboxRun();
      updateSandboxUI();
    };
  }

  // Sandbox camera controls (training camera section is hidden in sandbox mode)
  const sandboxCamLock = document.getElementById('btn-sandbox-cam-lock');
  const sandboxCamFree = document.getElementById('btn-sandbox-cam-free');
  const sandboxCamReset = document.getElementById('btn-sandbox-cam-reset');
  const refreshSandboxCamButtons = () => {
    if (sandboxCamLock) sandboxCamLock.classList.toggle('active', sim.cameraMode === 'lock');
    if (sandboxCamFree) sandboxCamFree.classList.toggle('active', sim.cameraMode === 'free');
  };
  if (sandboxCamLock) {
    sandboxCamLock.onclick = () => {
      controls.setCameraMode('lock');
      refreshSandboxCamButtons();
    };
  }
  if (sandboxCamFree) {
    sandboxCamFree.onclick = () => {
      controls.setCameraMode('free');
      refreshSandboxCamButtons();
    };
  }
  if (sandboxCamReset) {
    sandboxCamReset.onclick = () => {
      fitCurrentSimCameraToCreature(true);
      refreshSandboxCamButtons();
    };
  }
  refreshSandboxCamButtons();
  
  // Sandbox environment tools
  const sandboxGroundBtn = document.getElementById('btn-sandbox-ground');
  const sandboxBoxBtn = document.getElementById('btn-sandbox-box');
  const sandboxTriangleBtn = document.getElementById('btn-sandbox-triangle');
  const sandboxClearBtn = document.getElementById('btn-sandbox-clear');
  const sandboxToolStatus = document.getElementById('sandbox-tool-status');
  
  if (sandboxGroundBtn) {
    sandboxGroundBtn.onclick = () => {
      challengeTool = challengeTool === 'ground' ? 'none' : 'ground';
      sandboxGroundBtn.classList.toggle('active', challengeTool === 'ground');
      if (sandboxBoxBtn) sandboxBoxBtn.classList.remove('active');
      if (sandboxTriangleBtn) sandboxTriangleBtn.classList.remove('active');
      updateToolStatus();
    };
  }
  if (sandboxBoxBtn) {
    sandboxBoxBtn.onclick = () => {
      challengeTool = challengeTool === 'obstacle' ? 'none' : 'obstacle';
      sandboxBoxBtn.classList.toggle('active', challengeTool === 'obstacle');
      if (sandboxGroundBtn) sandboxGroundBtn.classList.remove('active');
      if (sandboxTriangleBtn) sandboxTriangleBtn.classList.remove('active');
      updateToolStatus();
    };
  }
  if (sandboxTriangleBtn) {
    sandboxTriangleBtn.onclick = () => {
      challengeTool = challengeTool === 'triangle' ? 'none' : 'triangle';
      sandboxTriangleBtn.classList.toggle('active', challengeTool === 'triangle');
      if (sandboxGroundBtn) sandboxGroundBtn.classList.remove('active');
      if (sandboxBoxBtn) sandboxBoxBtn.classList.remove('active');
      updateToolStatus();
    };
  }
  if (sandboxClearBtn) {
    sandboxClearBtn.onclick = () => {
      sim.clearChallenge();
      challengeTool = 'none';
      if (sandboxGroundBtn) sandboxGroundBtn.classList.remove('active');
      if (sandboxBoxBtn) sandboxBoxBtn.classList.remove('active');
      if (sandboxTriangleBtn) sandboxTriangleBtn.classList.remove('active');
      updateToolStatus();
    };
  }
  
  function updateToolStatus() {
    if (!sandboxToolStatus) return;
    if (challengeTool === 'ground') {
      sandboxToolStatus.textContent = 'Ground draw: ON - click to add points';
    } else if (challengeTool === 'obstacle') {
      sandboxToolStatus.textContent = 'Box mode: ON - click to place';
    } else if (challengeTool === 'triangle') {
      sandboxToolStatus.textContent = 'Triangle mode: ON - click to place';
    } else {
      sandboxToolStatus.textContent = 'Click world to place';
    }
  }
  syncSandboxPauseButtons();
}

function updateSandboxStats(leader) {
  // Update both floating panel and right panel stats
  const f = leader ? leader.getFitnessSnapshot() : null;
  if (!f) return;
  
  const dist = sim.distMetersContinuousFromX(leader.getX());
  
  // Update floating panel stats (if exists)
  const floatDistEl = document.getElementById('sandbox-stat-dist');
  const floatSpeedEl = document.getElementById('sandbox-stat-speed');
  const floatStabEl = document.getElementById('sandbox-stat-stability');
  const floatFallsEl = document.getElementById('sandbox-stat-falls');
  const runEl = document.getElementById('sandbox-run-num');
  const slip = Number.isFinite(f?.groundSlipRate) ? f.groundSlipRate : (f.groundSlip || 0);
  const actuation = f.actuationLevel || 0;
  
  if (floatDistEl) floatDistEl.textContent = dist.toFixed(2) + 'm';
  const speedMps = Number.isFinite(f?.speed) ? (f.speed / SCALE) : 0;
  if (floatSpeedEl) floatSpeedEl.textContent = speedMps.toFixed(2) + ' m/s';
  if (floatStabEl) floatStabEl.textContent = slip.toFixed(2);
  if (floatFallsEl) floatFallsEl.textContent = `${(actuation * 100).toFixed(0)}%`;
  if (runEl) runEl.textContent = 'RUN ' + sim.sandboxRuns;
  
  // Update right panel stats
  const panelDistEl = document.getElementById('sandbox-stat-dist');
  const panelSpeedEl = document.getElementById('sandbox-stat-speed');
  const panelStabEl = document.getElementById('sandbox-stat-stability');
  const panelFallsEl = document.getElementById('sandbox-stat-falls');
  const panelRunEl = document.getElementById('sandbox-mode-badge');
  
  if (panelDistEl) panelDistEl.textContent = dist.toFixed(2) + 'm';
  if (panelSpeedEl) panelSpeedEl.textContent = speedMps.toFixed(2) + ' m/s';
  if (panelStabEl) panelStabEl.textContent = slip.toFixed(2);
  if (panelFallsEl) panelFallsEl.textContent = `${(actuation * 100).toFixed(0)}%`;
  if (panelRunEl) panelRunEl.textContent = 'RUN ' + sim.sandboxRuns;
  
  // Track history for graphs in simulated time so speed multipliers keep x-axis honest.
  if (!sim._sandboxGraphData) {
    sim._sandboxGraphData = {
      distance: [],
      speed: [],
      stability: [],
      actuation: [],
      sampleTimes: [],
      windowSimSec: 60,
      sampleIntervalSimSec: 0.1,
      lastSampleSimTime: null
    };
  }
  
  const gd = sim._sandboxGraphData;
  const currentSimTime = Number.isFinite(sim.simTimeElapsed) ? sim.simTimeElapsed : 0;

  // If simulation time rewound (new sandbox run), reset graph time state automatically.
  if (!Number.isFinite(gd.lastSampleSimTime) || currentSimTime + 1e-6 < gd.lastSampleSimTime) {
    gd.lastSampleSimTime = currentSimTime;
    gd.distance = [];
    gd.speed = [];
    gd.stability = [];
    gd.actuation = [];
    gd.sampleTimes = [];
  }

  // Seed first point immediately so graph activates on first run/resume.
  if (!gd.sampleTimes.length) {
    gd.distance.push(dist);
    gd.speed.push(speedMps);
    gd.stability.push(slip);
    gd.actuation.push(actuation);
    gd.sampleTimes.push(currentSimTime);
    gd.lastSampleSimTime = currentSimTime;
    drawSandboxGraphs();
    return;
  }

  const simDelta = currentSimTime - gd.lastSampleSimTime;
  if (simDelta < gd.sampleIntervalSimSec) return;
  gd.lastSampleSimTime = currentSimTime;
  
  gd.distance.push(dist);
  gd.speed.push(speedMps);
  gd.stability.push(slip);
  gd.actuation.push(actuation);
  gd.sampleTimes.push(currentSimTime);
  
  // Trim to rolling simulated-time window.
  const windowStart = currentSimTime - gd.windowSimSec;
  while (gd.sampleTimes.length > 2 && gd.sampleTimes[0] < windowStart) {
    gd.sampleTimes.shift();
    gd.distance.shift();
    gd.speed.shift();
    gd.stability.shift();
    gd.actuation.shift();
  }
  
  // Draw graphs
  drawSandboxGraphs();
}

function drawSandboxGraphs() {
  const gd = sim._sandboxGraphData;
  if (!gd || gd.distance.length < 2) return;
  
  const configs = [
    { id: 'sandbox-graph-distance', data: gd.distance, color: '#22d3ee', suffix: 'm', minSpan: 8, precision: 2 },
    { id: 'sandbox-graph-speed', data: gd.speed, color: '#a78bfa', suffix: ' m/s', minSpan: 2, precision: 2 },
    { id: 'sandbox-graph-stability', data: gd.stability, color: '#34d399', suffix: '', minSpan: 0.6, precision: 2 },
    { id: 'sandbox-graph-actuation', data: gd.actuation, color: '#fbbf24', suffix: '', minSpan: 0.2, precision: 2 }
  ];
  
  configs.forEach(cfg => {
    const canvas = document.getElementById(cfg.id);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    
    // Clear with gradient background
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, 'rgba(15, 23, 42, 0.9)');
    gradient.addColorStop(1, 'rgba(8, 15, 28, 0.95)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
    
    const data = cfg.data;
    if (data.length < 2) return;
    const times = gd.sampleTimes;
    if (!Array.isArray(times) || times.length !== data.length) return;
    
    // Smooth the data
    const smoothed = smoothData(data, 8);
    const bounds = computeAdaptiveGraphBounds(smoothed, cfg.minSpan || 1, true);
    const ySpan = Math.max(1e-6, bounds.max - bounds.min);
    
    // Draw glow layer (wider line, more transparent)
    ctx.beginPath();
    ctx.strokeStyle = cfg.color + '30';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    const minTime = times[0];
    const maxTime = times[times.length - 1];
    const timeSpan = Math.max(1e-6, maxTime - minTime);
    
    for (let i = 0; i < smoothed.length; i++) {
      const x = ((times[i] - minTime) / timeSpan) * (w - 8) + 4;
      const normalized = (smoothed[i] - bounds.min) / ySpan;
      const y = h - normalized * (h - 16) - 8;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    
    // Draw main line
    ctx.beginPath();
    ctx.strokeStyle = cfg.color;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    // Add glow effect
    ctx.shadowColor = cfg.color;
    ctx.shadowBlur = 8;
    
    for (let i = 0; i < smoothed.length; i++) {
      const x = ((times[i] - minTime) / timeSpan) * (w - 8) + 4;
      const normalized = (smoothed[i] - bounds.min) / ySpan;
      const y = h - normalized * (h - 16) - 8;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
    
    // Draw current value
    const currentVal = data[data.length - 1];
    ctx.font = '700 15px "Inter", sans-serif';
    ctx.fillStyle = cfg.color;
    ctx.textAlign = 'right';
    ctx.fillText(formatGraphValue(currentVal, cfg.precision) + cfg.suffix, w - 8, 19);

    // Draw dynamic scale labels on the side so high values stay readable.
    ctx.font = '600 10px "Inter", sans-serif';
    ctx.fillStyle = 'rgba(203, 213, 225, 0.7)';
    ctx.fillText(formatGraphValue(bounds.max, cfg.precision), w - 8, h - 54);
    ctx.fillText(formatGraphValue(bounds.min, cfg.precision), w - 8, h - 6);
    
    // Draw grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const y = (h / 4) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
  });
}

// Smooth data using moving average
function smoothData(data, windowSize) {
  if (data.length < windowSize) return data;
  const result = [];
  for (let i = 0; i < data.length; i++) {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - windowSize + 1); j <= i; j++) {
      sum += data[j];
      count++;
    }
    result.push(sum / count);
  }
  return result;
}

function computeAdaptiveGraphBounds(values, minSpan = 1, clampMinToZero = true) {
  const finite = values.filter(v => Number.isFinite(v));
  if (!finite.length) return { min: 0, max: Math.max(1, minSpan) };

  let min = Math.min(...finite);
  let max = Math.max(...finite);
  const rawSpan = Math.max(1e-6, max - min);
  const span = Math.max(minSpan, rawSpan);
  const pad = span * 0.14;

  min -= pad;
  max += pad;
  if (clampMinToZero && min > 0) min = 0;
  if (max <= min) max = min + Math.max(1, minSpan);

  return { min, max };
}

function formatGraphValue(value, precision = 2) {
  if (!Number.isFinite(value)) return '--';
  const abs = Math.abs(value);
  if (abs >= 1000) return value.toFixed(0);
  if (abs >= 100) return value.toFixed(1);
  return value.toFixed(precision);
}

function updateSandboxScorecard(leader) {
  if (!sim.sandboxMode || !leader) return;

  const f = leader.getFitnessSnapshot();
  const dist = sim.distMetersContinuousFromX(leader.getX());

  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  set('sandbox-distance', `${dist.toFixed(2)}m`);
  const speedMps = Number.isFinite(f?.speed) ? (f.speed / SCALE) : 0;
  const slip = Number.isFinite(f?.groundSlipRate) ? f.groundSlipRate : (f.groundSlip || 0);
  const actuation = f.actuationLevel || 0;
  set('sandbox-speed', `${speedMps.toFixed(2)} m/s`);
  set('sandbox-stability', slip.toFixed(2));
  set('sandbox-falls', `${(actuation * 100).toFixed(0)}%`);
  set('sandbox-slip', slip.toFixed(2));
  set('sandbox-run-label', `Run ${sim.sandboxRuns}`);
}

function loadBrainLibrary() {
  try {
    const raw = (
      localStorage.getItem(BRAIN_LIBRARY_KEY)
      || localStorage.getItem(LEGACY_BRAIN_LIBRARY_KEY)
    );
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistBrainLibrary() {
  localStorage.setItem(BRAIN_LIBRARY_KEY, JSON.stringify(brainLibrary));
}

function updateBrainLibraryMeta(selectedId = '') {
  const meta = document.getElementById('brain-library-meta');
  if (!meta) return;
  if (!brainLibrary.length) {
    meta.textContent = 'Run at least one generation, then save.';
    return;
  }
  const selected = brainLibrary.find(b => b.id === selectedId) || brainLibrary[0];
  const mode = sim.sandboxMode ? 'Sandbox ON' : 'Sandbox OFF';
  const selectedDist = Number.isFinite(selected.distance) ? formatTwoDecimals(selected.distance) : '0.00';
  meta.textContent = `${mode} · ${selected.name || 'Brain'} · ${selectedDist}m · ${new Date(selected.createdAt).toLocaleString()}`;
}

function renderBrainLibrary(preferredId = null) {
  const select = document.getElementById('brain-library-select');
  if (!select) return;

  const previousValue = preferredId ?? select.value;
  select.innerHTML = '';
  if (!brainLibrary.length) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'No saved brains';
    select.appendChild(opt);
    updateBrainLibraryMeta('');
    return;
  }

  brainLibrary.forEach(item => {
    const opt = document.createElement('option');
    opt.value = item.id;
    const dist = Number.isFinite(item.distance) ? `${formatTwoDecimals(item.distance)}m` : '?m';
    const gen = Number.isFinite(item.generation) ? `G${item.generation}` : 'G?';
    opt.textContent = `${item.name || 'Brain'} · ${gen} · ${dist}`;
    select.appendChild(opt);
  });

  const hasPrevious = previousValue && brainLibrary.some(b => b.id === previousValue);
  select.value = hasPrevious ? previousValue : brainLibrary[0].id;
  updateBrainLibraryMeta(select.value);
}

function isValidCatalogDesign(design) {
  return (
    design &&
    Array.isArray(design.nodes) &&
    Array.isArray(design.constraints)
  );
}

function normalizeCatalogEntries(items) {
  if (!Array.isArray(items)) return [];
  return items
    .filter(item => item && item.id && isValidCatalogDesign(item.design))
    .map(item => ({
      id: item.id,
      name: item.name || 'Creature',
      createdAt: item.createdAt || new Date(0).toISOString(),
      design: {
        nodes: item.design.nodes.map(node => ({ ...node })),
        constraints: item.design.constraints.map(constraint => ({ ...constraint }))
      }
    }));
}

function normalizeCatalogRecord(raw) {
  if (Array.isArray(raw)) {
    return { version: 1, updatedAt: 0, items: normalizeCatalogEntries(raw) };
  }
  if (!raw || typeof raw !== 'object') return null;
  return {
    version: Number(raw.version) || 2,
    updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : 0,
    items: normalizeCatalogEntries(raw.items)
  };
}

function buildCatalogStorageRecord(updatedAt = Date.now()) {
  return {
    version: 2,
    updatedAt,
    // Thumbnails are derived at runtime to keep persisted storage small on iOS.
    items: normalizeCatalogEntries(creatureCatalog)
  };
}

function buildCatalogRuntimeEntries(items) {
  return normalizeCatalogEntries(items).map(item => ({
    ...item,
    thumbnail: generateDesignThumbnail(item.design, 220, 140)
  }));
}

function openCreatureCatalogDb() {
  if (!('indexedDB' in window)) return Promise.resolve(null);
  if (creatureCatalogDbPromise) return creatureCatalogDbPromise;
  creatureCatalogDbPromise = new Promise(resolve => {
    try {
      const request = indexedDB.open(CREATURE_CATALOG_DB_NAME, CREATURE_CATALOG_DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(CREATURE_CATALOG_DB_STORE)) {
          db.createObjectStore(CREATURE_CATALOG_DB_STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return creatureCatalogDbPromise;
}

async function readCreatureCatalogFromIndexedDb() {
  const db = await openCreatureCatalogDb();
  if (!db) return null;
  return new Promise(resolve => {
    try {
      const tx = db.transaction(CREATURE_CATALOG_DB_STORE, 'readonly');
      const store = tx.objectStore(CREATURE_CATALOG_DB_STORE);
      const request = store.get(CREATURE_CATALOG_IDB_KEY);
      request.onsuccess = () => resolve(normalizeCatalogRecord(request.result));
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function writeCreatureCatalogToIndexedDb(record) {
  const db = await openCreatureCatalogDb();
  if (!db) return false;
  return new Promise(resolve => {
    try {
      const tx = db.transaction(CREATURE_CATALOG_DB_STORE, 'readwrite');
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
      tx.objectStore(CREATURE_CATALOG_DB_STORE).put(record, CREATURE_CATALOG_IDB_KEY);
    } catch {
      resolve(false);
    }
  });
}

async function readCreatureCatalogFromCacheStorage() {
  if (!('caches' in window)) return null;
  try {
    const cache = await caches.open(CREATURE_CATALOG_CACHE_NAME);
    const response = await cache.match(CREATURE_CATALOG_CACHE_URL, { ignoreSearch: true });
    if (!response) return null;
    const parsed = await response.json();
    return normalizeCatalogRecord(parsed);
  } catch {
    return null;
  }
}

async function writeCreatureCatalogToCacheStorage(record) {
  if (!('caches' in window)) return false;
  try {
    const cache = await caches.open(CREATURE_CATALOG_CACHE_NAME);
    const payload = JSON.stringify(record);
    await cache.put(
      CREATURE_CATALOG_CACHE_URL,
      new Response(payload, {
        headers: {
          'content-type': 'application/json',
          'cache-control': 'no-store'
        }
      })
    );
    return true;
  } catch {
    return false;
  }
}

async function readCreatureCatalogFromParentBridge() {
  if (!inEmbeddedContext()) return null;
  const primary = await callParentStorageBridge('get', CREATURE_CATALOG_KEY);
  const fallback = (!primary.ok || primary.value == null)
    ? await callParentStorageBridge('get', LEGACY_CREATURE_CATALOG_KEY)
    : null;
  const raw = primary.ok && primary.value != null ? primary.value : fallback?.value;
  if (raw == null) return null;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return normalizeCatalogRecord(parsed);
  } catch {
    return null;
  }
}

async function writeCreatureCatalogToParentBridge(record) {
  if (!inEmbeddedContext()) return false;
  const payload = JSON.stringify(record);
  const result = await callParentStorageBridge('set', CREATURE_CATALOG_KEY, payload);
  return !!result.ok;
}

function loadCreatureCatalog() {
  try {
    const raw = (
      localStorage.getItem(CREATURE_CATALOG_KEY)
      || localStorage.getItem(LEGACY_CREATURE_CATALOG_KEY)
    );
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return normalizeCatalogRecord(parsed);
  } catch {
    return null;
  }
}

async function hydrateCreatureCatalogFromIndexedDb() {
  if (hasHydratedCreatureCatalog) return;
  hasHydratedCreatureCatalog = true;
  const [indexedDbRecord, cacheRecord, bridgeRecord] = await Promise.all([
    readCreatureCatalogFromIndexedDb(),
    readCreatureCatalogFromCacheStorage(),
    readCreatureCatalogFromParentBridge()
  ]);
  const durableRecord = [indexedDbRecord, cacheRecord, bridgeRecord]
    .filter(record => !!record && Array.isArray(record.items) && record.items.length > 0)
    .sort((a, b) => (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0))[0] || null;
  if (!durableRecord || !durableRecord.items.length) return;
  const shouldReplace =
    !creatureCatalog.length ||
    durableRecord.updatedAt > creatureCatalogUpdatedAt ||
    (creatureCatalogUpdatedAt === 0 && durableRecord.items.length > creatureCatalog.length);
  if (!shouldReplace) return;
  creatureCatalog = buildCatalogRuntimeEntries(durableRecord.items);
  creatureCatalogUpdatedAt = durableRecord.updatedAt;
  try {
    localStorage.setItem(CREATURE_CATALOG_KEY, JSON.stringify(durableRecord));
  } catch {
    // Keep in-memory + IndexedDB copy when localStorage is constrained.
  }
  renderCreatureCatalog();
}

async function persistCreatureCatalog() {
  const record = buildCatalogStorageRecord(Date.now());
  creatureCatalogUpdatedAt = record.updatedAt;

  let localStorageSaved = false;
  try {
    localStorage.setItem(CREATURE_CATALOG_KEY, JSON.stringify(record));
    localStorageSaved = true;
  } catch {
    localStorageSaved = false;
  }

  const [indexedDbSaved, cacheStorageSaved, parentBridgeSaved] = await Promise.all([
    writeCreatureCatalogToIndexedDb(record),
    writeCreatureCatalogToCacheStorage(record),
    writeCreatureCatalogToParentBridge(record)
  ]);
  const persisted = localStorageSaved || indexedDbSaved || cacheStorageSaved || parentBridgeSaved;
  const result = {
    persisted,
    localStorageSaved,
    indexedDbSaved,
    cacheStorageSaved,
    parentBridgeSaved
  };
  if (!persisted && !hasShownCreatureCatalogStorageWarning) {
    hasShownCreatureCatalogStorageWarning = true;
    alert('Save failed on this device. Export JSON to keep a backup.');
  }
  return result;
}

async function wasCatalogEntryPersisted(entryId) {
  if (!entryId) return false;
  const localRecord = loadCreatureCatalog();
  if (localRecord?.items?.some(item => item.id === entryId)) return true;
  const [indexedDbRecord, cacheRecord, bridgeRecord] = await Promise.all([
    readCreatureCatalogFromIndexedDb(),
    readCreatureCatalogFromCacheStorage(),
    readCreatureCatalogFromParentBridge()
  ]);
  if (indexedDbRecord?.items?.some(item => item.id === entryId)) return true;
  if (cacheRecord?.items?.some(item => item.id === entryId)) return true;
  if (bridgeRecord?.items?.some(item => item.id === entryId)) return true;
  return false;
}

function makeCatalogName() {
  return `Creature ${creatureCatalog.length + 1}`;
}

function computeDesignBounds(design) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  (design.nodes || []).forEach(n => {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x);
    maxY = Math.max(maxY, n.y);
  });
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

function generateDesignThumbnail(design, width = 220, height = 140) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.fillStyle = '#0c101a';
  ctx.fillRect(0, 0, width, height);

  // Subtle grid for readability.
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= width; x += 24) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y += 24) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  const bounds = computeDesignBounds(design);
  if (!bounds) return canvas.toDataURL('image/jpeg', 0.82);

  const pad = 20;
  const contentW = Math.max(10, bounds.maxX - bounds.minX);
  const contentH = Math.max(10, bounds.maxY - bounds.minY);
  const scale = Math.max(0.2, Math.min((width - pad * 2) / contentW, (height - pad * 2) / contentH));
  const offsetX = (width - contentW * scale) * 0.5 - bounds.minX * scale;
  const offsetY = (height - contentH * scale) * 0.5 - bounds.minY * scale;

  const nodeMap = new Map((design.nodes || []).map(n => [n.id, n]));
  const tx = x => x * scale + offsetX;
  const ty = y => y * scale + offsetY;

  (design.constraints || []).forEach(c => {
    const a = nodeMap.get(c.n1);
    const b = nodeMap.get(c.n2);
    if (!a || !b) return;
    ctx.beginPath();
    ctx.moveTo(tx(a.x), ty(a.y));
    ctx.lineTo(tx(b.x), ty(b.y));
    ctx.strokeStyle = c.type === 'muscle' ? 'rgba(255,0,85,0.88)' : 'rgba(230,238,247,0.88)';
    ctx.lineWidth = c.type === 'muscle' ? 2.2 : 1.9;
    ctx.stroke();
  });

  (design.nodes || []).forEach(n => {
    ctx.beginPath();
    ctx.arc(tx(n.x), ty(n.y), Math.max(2.2, 4.5 * scale * 0.06), 0, Math.PI * 2);
    ctx.fillStyle = n.fixed ? 'rgba(250,204,21,0.95)' : 'rgba(0,242,255,0.95)';
    ctx.fill();
  });

  return canvas.toDataURL('image/jpeg', 0.82);
}

async function saveCurrentCreatureToCatalog(name = null) {
  const payload = designer.serializeDesign();
  if (!payload.nodes.length) {
    alert('Draw a creature first.');
    return;
  }
  const entry = {
    id: `creature-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    name: name || makeCatalogName(),
    createdAt: new Date().toISOString(),
    thumbnail: generateDesignThumbnail(payload, 220, 140),
    design: payload
  };
  creatureCatalog.unshift(entry);
  if (creatureCatalog.length > 120) creatureCatalog = creatureCatalog.slice(0, 120);
  const persistStatus = await persistCreatureCatalog();
  const verified = persistStatus?.persisted ? await wasCatalogEntryPersisted(entry.id) : false;
  if (!verified) {
    creatureCatalog = creatureCatalog.filter(item => item.id !== entry.id);
  }
  renderCreatureCatalog();
  if (!verified) {
    const failures = [
      !persistStatus?.localStorageSaved ? 'localStorage' : null,
      !persistStatus?.indexedDbSaved ? 'IndexedDB' : null,
      !persistStatus?.cacheStorageSaved ? 'CacheStorage' : null,
      !persistStatus?.parentBridgeSaved && inEmbeddedContext() ? 'ParentBridge' : null
    ].filter(Boolean).join(', ');
    alert(`Save did not persist on this device (${failures || 'unknown'} unavailable). Use Export JSON as backup.`);
  }

  // Show a temporary toast notification instead of opening the catalog
  const toast = document.createElement('div');
  toast.textContent = verified ? 'Save successful' : 'Save failed';
  toast.style.cssText = `
    position: absolute;
    top: 24px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(16, 185, 129, 0.9);
    color: white;
    padding: 12px 24px;
    border-radius: 8px;
    font-weight: 600;
    z-index: 200;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    pointer-events: none;
    transition: opacity 0.3s ease;
  `;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

function renderCreatureCatalog() {
  const panel = document.getElementById('creature-catalog');
  const grid = document.getElementById('catalog-grid');
  if (!panel || !grid) return;

  if (!creatureCatalog.length) {
    grid.innerHTML = '<div class="text-xs text-gray-400 p-2">No creatures in catalog yet. Click Save or Import.</div>';
    return;
  }

  grid.innerHTML = creatureCatalog.map(item => `
    <div class="catalog-item">
      <img class="catalog-thumb" src="${item.thumbnail || ''}" alt="Creature thumbnail">
      <div class="catalog-meta">
        <div class="catalog-row">
          <button class="catalog-btn flex-1" data-action="load" data-id="${item.id}" title="Load Design: replace the current canvas with this saved creature."><i class="fas fa-folder-open mr-1"></i>Load</button>
          <button class="catalog-btn flex-1" data-action="download" data-id="${item.id}" title="Export JSON: download this saved creature as a JSON file."><i class="fas fa-download mr-1"></i>Export</button>
          <button class="catalog-btn flex-1" data-action="delete" data-id="${item.id}" title="Delete Design: remove this creature from your local catalog."><i class="fas fa-trash mr-1"></i>Delete</button>
        </div>
      </div>
    </div>
  `).join('');
}

function toggleCreatureCatalog(forceOpen = null) {
  const panel = document.getElementById('creature-catalog');
  if (!panel) return;
  const open = forceOpen === null ? panel.classList.contains('hidden') : !!forceOpen;
  panel.classList.toggle('hidden', !open);
  
  let backdrop = document.getElementById('catalog-backdrop');
  if (open) {
    void hydrateCreatureCatalogFromIndexedDb();
    renderCreatureCatalog();
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.id = 'catalog-backdrop';
      // Ensure backdrop is inside the same container as the panel to fix stacking context issues
      panel.parentNode.insertBefore(backdrop, panel);
      backdrop.style.cssText = 'position:fixed;inset:0;z-index:150;background:rgba(0,0,0,0.5);pointer-events:auto;';
      panel.style.zIndex = '151';
      
      const closeHandler = (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleCreatureCatalog(false);
      };
      backdrop.addEventListener('mousedown', closeHandler);
      backdrop.addEventListener('touchstart', closeHandler);
      backdrop.addEventListener('click', closeHandler);
      // Stop wheel propagation on backdrop to prevent canvas zoom, but allow it to hit the backdrop if needed
      backdrop.addEventListener('wheel', e => e.stopPropagation(), { passive: true });
    }
    
    // Stop wheel from bleeding into the designer background, but ALLOW scrolling inside the panel
    const stopWheelBleed = (e) => e.stopPropagation();
    panel.removeEventListener('wheel', stopWheelBleed);
    panel.addEventListener('wheel', stopWheelBleed, { passive: true });
    
  } else {
    if (backdrop) backdrop.remove();
  }
}

// --- Tool binding ---
function setTool(tool, btn) {
  designer.setTool(tool);
  document.querySelectorAll('.btn-tool').forEach(b =>
    b.classList.remove('active', 'active-muscle', 'active-warn')
  );
  if (tool === 'muscle') btn.classList.add('active-muscle');
  else if (tool === 'erase') btn.classList.add('active-warn');
  else btn.classList.add('active');

  const hints = {
    node: 'Click to add nodes. Click on a bone to split it. Drag node to node to connect a bone.',
    joint: 'Click joint to toggle Fixed/Hinge. Fixed = lock bone angle at this node (bone links only).',
    bone: 'Drag joint to joint to add rigid bones.',
    muscle: 'Drag joint to joint to add muscles.',
    select: 'Drag to box-select nodes. Drag top handle to move selection; drag bottom-right handle to resize.',
    move: 'Drag joints to reposition.',
    erase: 'Click node or link to delete.',
    pan: 'Click and drag to pan the canvas.'
  };
  const hintEl = document.getElementById('hint-text');
  if (hintEl) hintEl.textContent = hints[tool] || '';
}

// Tool buttons
document.getElementById('tool-node').onclick = e => setTool('node', e.currentTarget);
document.getElementById('tool-joint').onclick = e => setTool('joint', e.currentTarget);
document.getElementById('tool-bone').onclick = e => setTool('bone', e.currentTarget);
document.getElementById('tool-muscle').onclick = e => setTool('muscle', e.currentTarget);
document.getElementById('tool-select').onclick = e => setTool('select', e.currentTarget);
document.getElementById('tool-move').onclick = e => setTool('move', e.currentTarget);
document.getElementById('tool-erase').onclick = e => setTool('erase', e.currentTarget);
document.getElementById('tool-pan').onclick = e => setTool('pan', e.currentTarget);
document.getElementById('tool-undo').onclick = () => designer.undo();
document.getElementById('tool-reset-view').onclick = () => designer.resetView();
document.getElementById('tool-save').onclick = () => {
  void saveCurrentCreatureToCatalog();
};
document.getElementById('tool-load').onclick = () => toggleCreatureCatalog();

const catalogCloseBtn = document.getElementById('btn-catalog-close');
if (catalogCloseBtn) catalogCloseBtn.onclick = () => toggleCreatureCatalog(false);

const catalogImportBtn = document.getElementById('btn-catalog-import');
if (catalogImportBtn) {
  catalogImportBtn.onclick = () => {
    const input = document.getElementById('catalog-file-input');
    if (input) input.click();
  };
}

const catalogFileInput = document.getElementById('catalog-file-input');
if (catalogFileInput) {
  catalogFileInput.onchange = async e => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    let imported = 0;
    for (const file of files) {
      try {
        const text = await file.text();
        const design = JSON.parse(text);
        designer.loadDesign(design);
        await saveCurrentCreatureToCatalog(file.name.replace(/\.json$/i, ''));
        imported += 1;
      } catch {
        // Skip invalid files but continue importing the rest.
      }
    }
    if (!imported) {
      alert('No valid creature files found.');
    } else {
      resetControlSettingsForNewCreature();
      toggleCreatureCatalog(true);
    }
    e.target.value = '';
  };
}

const catalogGrid = document.getElementById('catalog-grid');
if (catalogGrid) {
  catalogGrid.onclick = e => {
    const target = e.target.closest('button[data-action]');
    if (!target) return;
    const id = target.getAttribute('data-id');
    const action = target.getAttribute('data-action');
    const item = creatureCatalog.find(c => c.id === id);
    if (!item) return;

    if (action === 'load') {
      try {
        designer.loadDesign(item.design);
        resetControlSettingsForNewCreature();
        toggleCreatureCatalog(false);
      } catch (err) {
        alert(`Load failed: ${err.message}`);
      }
      return;
    }

    if (action === 'download') {
      const safeName = (item.name || 'creature').replace(/[^a-z0-9-_]/gi, '-').toLowerCase();
      designer.downloadDesign(item.design, `${safeName || 'creature'}.json`);
      return;
    }

    if (action === 'delete') {
      creatureCatalog = creatureCatalog.filter(c => c.id !== id);
      void persistCreatureCatalog();
      renderCreatureCatalog();
    }
  };
}

document.getElementById('tool-clear').onclick = () => designer.clear();

// Ctrl+Z for undo in draw mode
// Space to pause in sandbox mode
window.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && currentScreen === 'draw') {
    designer.undo();
    e.preventDefault();
  }
  // Space to pause/resume in sandbox mode
  if (e.code === 'Space' && sim.sandboxMode) {
    const pauseBtn = document.getElementById('btn-sandbox-pause-panel')
      || document.getElementById('btn-sandbox-pause');
    if (pauseBtn) pauseBtn.click();
    e.preventDefault();
  }
});

// --- Controls binding ---
const startTrainingNow = ({ startPaused = false } = {}) => {
  progressChart.clear();
  if (!sim.startSimulation()) {
    alert('Design needs at least 2 nodes and 1 muscle.');
    return false;
  }
  if (sim.sandboxMode) {
    sim.paused = false;
    sim.sandboxPaused = !!startPaused;
  } else {
    sim.paused = !!startPaused;
    sim.sandboxPaused = false;
  }
  simSessionStarted = true;
  const isPaused = sim.sandboxMode ? sim.sandboxPaused : sim.paused;
  const icon = document.getElementById('icon-pause');
  if (icon) icon.className = isPaused ? 'fas fa-play' : 'fas fa-pause';
  updateStartSimUI();
  updateSandboxUI();
  syncSandboxPauseButtons();
  triggerTrainingStatAnimation();
  if (uiSurface && typeof uiSurface.sync === 'function') {
    uiSurface.sync(getCurrentAppState());
  }
  emitAppState();
  return true;
};

function resetControlSettingsForNewCreature() {
  controls.resetToDefaults();
  controls.updateLabels();
}

const showEndSimConfirmation = () => {
  const modal = document.getElementById('modal-end-sim');
  if (modal) modal.classList.remove('hidden');
};

const showResetSimConfirmation = () => {
  const modal = document.getElementById('modal-reset-sim');
  if (modal) modal.classList.remove('hidden');
};

const showTurboParityFallbackWarning = (message = 'Turbo parity drift detected. Continuing in normal mode.') => {
  const modal = document.getElementById('modal-turbo-parity-warning');
  if (!modal) return;
  const msg = document.getElementById('modal-turbo-parity-warning-msg');
  if (msg) msg.textContent = message;
  modal.classList.remove('hidden');
  if (turboParityWarningTimeout) clearTimeout(turboParityWarningTimeout);
  turboParityWarningTimeout = window.setTimeout(() => {
    modal.classList.add('hidden');
    turboParityWarningTimeout = null;
  }, 1000);
};

function performSimulationReset() {
  preSandboxSession = null;
  const design = designer.getDesign();
  sim.nodes = design.nodes;
  sim.constraints = design.constraints;
  fitCurrentSimCameraToCreature(true);
  startTrainingNow();
}

controls.bind({
  onStartDraw: () => setScreen('draw'),
  onBack: () => setScreen('splash'),
  onRun: () => setScreen('sim'),
  onStartSim: () => {
    preSandboxSession = null;
    resetControlSettingsForNewCreature();
    const design = designer.getDesign();
    sim.nodes = design.nodes;
    sim.constraints = design.constraints;
    fitCurrentSimCameraToCreature(true);
    sim.exitSandboxMode();
    startTrainingNow();
  },
  onEdit: showEndSimConfirmation,
  onPause: () => {
    if (sim.sandboxMode) {
      sim.sandboxPaused = !sim.sandboxPaused;
      syncSandboxPauseButtons();
    } else {
      sim.paused = !sim.paused;
    }
    const isPaused = sim.sandboxMode ? sim.sandboxPaused : sim.paused;
    const icon = document.getElementById('icon-pause');
    if (icon) icon.className = isPaused ? 'fas fa-play' : 'fas fa-pause';
    updateStartSimUI();
  },
  onReset: showResetSimConfirmation,
  onResetSettings: () => {
    if (sim.world) {
      sim.world.setGravity(Vec2(0, sim.gravity));
      sim.syncCreatureRuntimeSettings();
    }
  },
  onCameraChanged: () => {
    if (currentScreen === 'sim' && !simSessionStarted) renderWorld(null);
  },
  onFitCameraToCreature: () => {
    fitCurrentSimCameraToCreature(true);
    if (currentScreen === 'sim' && !simSessionStarted) renderWorld(null);
  },
  isSimScreen: () => currentScreen === 'sim'
});

// Bind End Sim modal
const endSimCancel = document.getElementById('btn-end-sim-cancel');
if (endSimCancel) endSimCancel.onclick = () => document.getElementById('modal-end-sim').classList.add('hidden');
const endSimConfirm = document.getElementById('btn-end-sim-confirm');
if (endSimConfirm) {
  endSimConfirm.onclick = () => {
    document.getElementById('modal-end-sim').classList.add('hidden');
    setScreen('draw');
  };
}

// Bind Reset modal
const resetSimCancel = document.getElementById('btn-reset-sim-cancel');
if (resetSimCancel) resetSimCancel.onclick = () => document.getElementById('modal-reset-sim').classList.add('hidden');
const resetSimConfirm = document.getElementById('btn-reset-sim-confirm');
if (resetSimConfirm) {
  resetSimConfirm.onclick = () => {
    document.getElementById('modal-reset-sim').classList.add('hidden');
    performSimulationReset();
  };
}

// Bind Splash Settings modal
const splashSettingsModal = document.getElementById('modal-splash-settings');
const openSplashSettings = () => {
  if (splashSettingsModal) splashSettingsModal.classList.remove('hidden');
};
const closeSplashSettings = () => {
  if (splashSettingsModal) splashSettingsModal.classList.add('hidden');
};
const initSplashSettingsTestUi = () => {
  if (!splashSettingsModal) return;

  splashSettingsModal.querySelectorAll('[data-setting-toggle-group]').forEach(group => {
    const options = group.querySelectorAll('[data-setting-option]');
    options.forEach(optionBtn => {
      optionBtn.addEventListener('click', () => {
        options.forEach(el => el.classList.remove('active'));
        optionBtn.classList.add('active');
      });
    });
  });

  splashSettingsModal.querySelectorAll('[data-setting-slider]').forEach(slider => {
    const outputId = slider.dataset.outputId;
    const outputEl = outputId ? document.getElementById(outputId) : null;
    const mirrorId = slider.dataset.mirrorId;
    const mirrorEl = mirrorId ? document.getElementById(mirrorId) : null;
    const update = () => {
      if (outputEl) outputEl.textContent = 'test';
      if (mirrorEl) mirrorEl.textContent = 'test';
    };
    slider.addEventListener('input', update);
    update();
  });

  splashSettingsModal.querySelectorAll('[data-speed-slider]').forEach(speedShell => {
    const slider = speedShell.querySelector('input[type="range"]');
    if (!slider) return;
    const updateSpeedFill = () => {
      const min = Number(slider.min || 0);
      const max = Number(slider.max || 100);
      const val = Number(slider.value || min);
      const denom = max - min || 1;
      const pct = Math.max(0, Math.min(100, ((val - min) / denom) * 100));
      speedShell.style.setProperty('--splash-speed-pct', `${pct}%`);
    };
    slider.addEventListener('input', updateSpeedFill);
    updateSpeedFill();

    let pointerActive = false;
    let pointerId = null;
    let sliderRect = null;
    let pendingClientX = null;
    let sliderRaf = 0;

    const clampToStep = raw => {
      const min = Number(slider.min || 0);
      const max = Number(slider.max || 100);
      const step = Number(slider.step || 1);
      const clamped = Math.max(min, Math.min(max, raw));
      if (!Number.isFinite(step) || step <= 0) return clamped;
      const snapped = Math.round((clamped - min) / step) * step + min;
      return Math.max(min, Math.min(max, snapped));
    };

    const valueFromClientX = clientX => {
      if (!sliderRect?.width || !Number.isFinite(clientX)) return Number(slider.value || slider.min || 0);
      const min = Number(slider.min || 0);
      const max = Number(slider.max || 100);
      const normalized = Math.max(0, Math.min(1, (clientX - sliderRect.left) / sliderRect.width));
      return clampToStep(min + normalized * (max - min));
    };

    const applyPendingPosition = () => {
      sliderRaf = 0;
      if (pendingClientX == null) return;
      const next = valueFromClientX(pendingClientX);
      const nextStr = String(next);
      if (slider.value !== nextStr) {
        slider.value = nextStr;
      }
      slider.dispatchEvent(new Event('input', { bubbles: true }));
      if (pointerActive) sliderRaf = requestAnimationFrame(applyPendingPosition);
    };

    const queueClientX = clientX => {
      pendingClientX = clientX;
      if (!sliderRaf) sliderRaf = requestAnimationFrame(applyPendingPosition);
    };

    const onPointerDown = e => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      pointerActive = true;
      pointerId = e.pointerId;
      sliderRect = speedShell.getBoundingClientRect();
      speedShell.setPointerCapture?.(e.pointerId);
      e.preventDefault();
      queueClientX(e.clientX);
    };

    const onPointerMove = e => {
      if (!pointerActive || (pointerId !== null && e.pointerId !== pointerId)) return;
      e.preventDefault();
      queueClientX(e.clientX);
    };

    const stopPointer = e => {
      if (pointerId !== null && e.pointerId !== pointerId) return;
      if (Number.isFinite(e.clientX)) queueClientX(e.clientX);
      pointerActive = false;
      if (speedShell.hasPointerCapture?.(e.pointerId)) {
        speedShell.releasePointerCapture(e.pointerId);
      }
      pointerId = null;
      sliderRect = null;
      if (sliderRaf) {
        cancelAnimationFrame(sliderRaf);
        sliderRaf = 0;
      }
      if (pendingClientX != null) {
        const next = valueFromClientX(pendingClientX);
        const nextStr = String(next);
        if (slider.value !== nextStr) slider.value = nextStr;
        slider.dispatchEvent(new Event('input', { bubbles: true }));
      }
      pendingClientX = null;
    };

    speedShell.addEventListener('pointerdown', onPointerDown);
    speedShell.addEventListener('pointermove', onPointerMove);
    speedShell.addEventListener('pointerrawupdate', onPointerMove);
    speedShell.addEventListener('pointerup', stopPointer);
    speedShell.addEventListener('pointercancel', stopPointer);
    speedShell.addEventListener('lostpointercapture', stopPointer);
  });
};
const splashSettingsBtn = document.getElementById('btn-settings-splash');
if (splashSettingsBtn) splashSettingsBtn.onclick = openSplashSettings;
const splashSettingsCloseBtn = document.getElementById('btn-splash-settings-close');
if (splashSettingsCloseBtn) splashSettingsCloseBtn.onclick = closeSplashSettings;
if (splashSettingsModal) {
  splashSettingsModal.onclick = e => {
    if (e.target === splashSettingsModal) closeSplashSettings();
  };
}
window.addEventListener('keydown', e => {
  if (e.key === 'Escape' && splashSettingsModal && !splashSettingsModal.classList.contains('hidden')) {
    closeSplashSettings();
  }
});
initSplashSettingsTestUi();

// Bind Mobile Quick Controls
const mqEndSim = document.getElementById('btn-mq-end-sim');
if (mqEndSim) mqEndSim.onclick = showEndSimConfirmation;

const btnBackToolbar = document.getElementById('btn-back-toolbar');
if (btnBackToolbar) btnBackToolbar.onclick = () => setScreen('splash');

const mqToggle = document.getElementById('btn-mq-toggle');
if (mqToggle) mqToggle.onclick = () => {
    const dock = document.getElementById('mobile-quick-controls');
    if (dock) dock.classList.toggle('minimized');
};

const mqStats = document.getElementById('btn-mq-stats');
if (mqStats) mqStats.onclick = () => {
  openMobileSheet('stats');
};

const mqStart = document.getElementById('btn-mq-start');
if (mqStart) {
  mqStart.onclick = () => {
    if (!simSessionStarted) {
      document.getElementById('btn-start-sim')?.click();
      return;
    }
    document.getElementById('btn-pause')?.click();
  };
}

const mqReset = document.getElementById('btn-mq-reset');
if (mqReset) mqReset.onclick = () => document.getElementById('btn-reset').click();

const ensureSimulationLoopRunning = () => {
  if (sim.frameId || sim.sandboxMode) return;
  sim.lastFrame = performance.now();
  sim.frameId = requestAnimationFrame(ts => sim.gameLoop(ts));
};

const mqTurbo = document.getElementById('btn-mq-turbo');
if (mqTurbo) {
  mqTurbo.onclick = () => {
    const isTurbo = sim.trainingMode === 'turbo';
    controls.setTrainingMode(isTurbo ? 'normal' : 'turbo');
    if (simSessionStarted && !sim.sandboxMode) {
      sim.paused = false;
      sim.sandboxPaused = false;
      ensureSimulationLoopRunning();
      if (sim.trainingMode === 'turbo' && typeof sim._startTurboLoop === 'function' && !sim._turboRunning) {
        sim._startTurboLoop();
      }
      updateStartSimUI();
    }
    mqTurbo.classList.remove('mq-supercharged');
    void mqTurbo.offsetWidth;
    mqTurbo.classList.add('mq-supercharged');
    syncMobileQuickControlState();
  };
  mqTurbo.addEventListener('animationend', () => mqTurbo.classList.remove('mq-supercharged'));
}

const mqCam = document.getElementById('btn-mq-cam');
if (mqCam) {
  mqCam.onclick = () => {
    const isFree = sim.cameraMode === 'free';
    controls.setCameraMode(isFree ? 'lock' : 'free');
    syncMobileQuickControlState();
  };
}

const mqSpeedInput = document.getElementById('inp-mq-speed');
const mqSpeedSlider = document.getElementById('mq-speed-slider');

const applyMobileSpeedValue = (next, options = {}) => {
  const { commit = false } = options;
  const numericNext = Number(next);
  const fallback = Number.isFinite(Number(sim.simSpeed)) ? Number(sim.simSpeed) : 1;
  const clamped = Math.max(1, Math.min(20, Number.isFinite(numericNext) ? Math.round(numericNext) : Math.round(fallback)));
  if (sim.simSpeed !== clamped) sim.simSpeed = clamped;

  const range = document.getElementById('inp-speed');
  if (range && range.value !== String(clamped)) {
    range.value = String(clamped);
  }
  setMobileSpeedVisual(clamped);

  if (commit && range) {
    range.dispatchEvent(new Event('input'));
  }
};

if (mqSpeedInput) {
  mqSpeedInput.addEventListener('input', () => {
    const next = parseInt(mqSpeedInput.value, 10) || 1;
    applyMobileSpeedValue(next, { commit: true });
  });
}

if (mqSpeedSlider) {
  let speedPointerActive = false;
  let speedPointerId = null;
  let speedRect = null;
  let pendingClientX = null;
  let speedRaf = 0;

  const speedFromClientX = clientX => {
    if (!Number.isFinite(clientX)) return Number(sim.simSpeed) || 1;
    if (!speedRect?.width) return sim.simSpeed || 1;
    const normalized = Math.max(0, Math.min(1, (clientX - speedRect.left) / speedRect.width));
    return 1 + normalized * 19;
  };

  const flushSpeed = () => {
    speedRaf = 0;
    if (pendingClientX == null) return;
    const next = speedFromClientX(pendingClientX);
    applyMobileSpeedValue(next, { commit: false });
    if (speedPointerActive) {
      speedRaf = requestAnimationFrame(flushSpeed);
    }
  };

  const queueSpeedClientX = clientX => {
    pendingClientX = clientX;
    if (!speedRaf) speedRaf = requestAnimationFrame(flushSpeed);
  };

  const onSpeedPointerDown = e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    speedPointerActive = true;
    speedPointerId = e.pointerId;
    speedRect = mqSpeedSlider.getBoundingClientRect();
    mqSpeedSlider.setPointerCapture?.(e.pointerId);
    e.preventDefault();
    queueSpeedClientX(e.clientX);
  };

  const onSpeedPointerMove = e => {
    if (speedPointerId !== null && e.pointerId !== speedPointerId) return;
    if (!speedPointerActive) return;
    e.preventDefault();
    queueSpeedClientX(e.clientX);
  };

  const stopSpeedPointer = e => {
    if (speedPointerId !== null && e.pointerId !== speedPointerId) return;
    if (Number.isFinite(e.clientX)) queueSpeedClientX(e.clientX);
    speedPointerActive = false;
    speedPointerId = null;
    if (mqSpeedSlider.hasPointerCapture?.(e.pointerId)) {
      mqSpeedSlider.releasePointerCapture(e.pointerId);
    }
    if (speedRaf) {
      cancelAnimationFrame(speedRaf);
      speedRaf = 0;
    }
    if (pendingClientX != null) {
      const next = speedFromClientX(pendingClientX);
      applyMobileSpeedValue(next, { commit: true });
    } else {
      applyMobileSpeedValue(sim.simSpeed, { commit: true });
    }
    pendingClientX = null;
    speedRect = null;
  };

  mqSpeedSlider.addEventListener('pointerdown', onSpeedPointerDown);
  mqSpeedSlider.addEventListener('pointermove', onSpeedPointerMove);
  mqSpeedSlider.addEventListener('pointerrawupdate', onSpeedPointerMove);
  mqSpeedSlider.addEventListener('pointerup', stopSpeedPointer);
  mqSpeedSlider.addEventListener('pointercancel', stopSpeedPointer);
  mqSpeedSlider.addEventListener('lostpointercapture', stopSpeedPointer);
}

const speedRange = document.getElementById('inp-speed');
if (speedRange) {
  speedRange.addEventListener('input', () => {
    if (document.body.classList.contains('app-mobile')) {
      const next = Math.max(1, Math.min(20, parseInt(speedRange.value, 10) || 1));
      if (next !== parseInt(speedRange.value, 10)) {
        speedRange.value = String(next);
        sim.simSpeed = next;
      }
    }
    syncMobileQuickControlState();
  });
}

const mqMore = document.getElementById('btn-mq-more');
if (mqMore) mqMore.onclick = () => {
  openMobileSheet('controls');
};

const mqCamReset = document.getElementById('btn-mq-cam-reset');
if (mqCamReset) mqCamReset.onclick = () => document.getElementById('cam-reset')?.click();

const mqGroundDraw = document.getElementById('btn-mq-ground-draw');
if (mqGroundDraw) mqGroundDraw.onclick = () => document.getElementById('btn-ground-draw')?.click();

const mqGroundClear = document.getElementById('btn-mq-ground-clear');
if (mqGroundClear) mqGroundClear.onclick = () => document.getElementById('btn-ground-clear')?.click();

ensureMobileSheetMounted();
updateStartSimUI();
const brainMigration = migrateBrainStorageIfNeeded();
showBrainMigrationNoticeOnce(brainMigration);
brainLibrary = loadBrainLibrary();
renderBrainLibrary();
const localCatalogRecord = loadCreatureCatalog();
if (localCatalogRecord && localCatalogRecord.items.length) {
  creatureCatalog = buildCatalogRuntimeEntries(localCatalogRecord.items);
  creatureCatalogUpdatedAt = localCatalogRecord.updatedAt;
} else {
  creatureCatalog = buildCatalogRuntimeEntries(buildDefaultCreatureCatalogEntries());
  creatureCatalogUpdatedAt = 0;
}
renderCreatureCatalog();

const setChallengeTool = tool => {
  challengeTool = challengeTool === tool ? 'none' : tool;
  const groundBtn = document.getElementById('btn-ground-draw');
  const obstacleBtn = document.getElementById('btn-obstacle-add');
  if (groundBtn) groundBtn.classList.toggle('active', challengeTool === 'ground');
  if (obstacleBtn) obstacleBtn.classList.toggle('active', challengeTool === 'obstacle');
  syncMobileQuickControlState();
  if (currentScreen === 'sim' && !simSessionStarted) renderWorld(null);
};

const groundDrawBtn = document.getElementById('btn-ground-draw');
if (groundDrawBtn) groundDrawBtn.onclick = () => setChallengeTool('ground');
const obstacleAddBtn = document.getElementById('btn-obstacle-add');
if (obstacleAddBtn) obstacleAddBtn.onclick = () => setChallengeTool('obstacle');
const groundClearBtn = document.getElementById('btn-ground-clear');
if (groundClearBtn) {
  groundClearBtn.onclick = () => {
    sim.clearGroundProfile();
    challengeTool = 'none';
    syncMobileQuickControlState();
    if (currentScreen === 'sim' && !simSessionStarted) renderWorld(null);
  };
}
const challengeClearBtn = document.getElementById('btn-challenge-clear');
if (challengeClearBtn) {
  challengeClearBtn.onclick = () => {
    sim.clearChallenge();
    if (currentScreen === 'sim' && !simSessionStarted) renderWorld(null);
  };
}

const brainSaveBtn = document.getElementById('btn-brain-save');
if (brainSaveBtn) {
  brainSaveBtn.onclick = () => {
    const payload = sim.getLastGenerationBrain();
    if (!payload) {
      alert('No completed generation yet. Let at least one generation finish.');
      return;
    }
    const design = designer.getDesign();
    const entry = {
      id: `brain-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      name: `G${payload.generation} ${formatTwoDecimals(payload.distance)}m`,
      createdAt: payload.createdAt,
      generation: payload.generation,
      distance: payload.distance,
      fitness: payload.fitness,
      version: payload.version || 2,
      controllerType: payload.controllerType || 'dense',
      trainingAlgorithm: payload.trainingAlgorithm || sim.trainingAlgorithm || 'neat',
      genome: payload.genome || null,
      meta: payload.meta || null,
      hiddenLayers: payload.hiddenLayers,
      neuronsPerLayer: payload.neuronsPerLayer,
      dna: payload.dna,
      design
    };
    brainLibrary.unshift(entry);
    if (brainLibrary.length > 60) brainLibrary = brainLibrary.slice(0, 60);
    persistBrainLibrary();
    renderBrainLibrary();
  };
}

const brainSelect = document.getElementById('brain-library-select');
if (brainSelect) {
  brainSelect.onchange = () => updateBrainLibraryMeta(brainSelect.value);
}

const sandboxRunBtn = document.getElementById('btn-sandbox-run');
if (sandboxRunBtn) {
  sandboxRunBtn.onclick = () => {
    if (!brainLibrary.length) {
      alert('No saved brains. Save one first.');
      return;
    }
    const selectedId = brainSelect ? brainSelect.value : '';
    const picked = brainLibrary.find(b => b.id === selectedId) || brainLibrary[0];
    if (!picked) return;
    try {
      // Snapshot the active training session so exiting sandbox can resume it.
      const snapshot = sim.captureSessionSnapshot();
      preSandboxSession = snapshot
        ? {
            simSnapshot: snapshot,
            designSnapshot: designer.getDesign()
          }
        : null;

      // Stop current simulation first if running
      sim.stopLoop();
      sim.clearSimulation();
      
      if (picked.design && Array.isArray(picked.design.nodes) && Array.isArray(picked.design.constraints)) {
        designer.loadDesign({
          nodes: picked.design.nodes,
          constraints: picked.design.constraints
        });
      }
      resetControlSettingsForNewCreature();
      sim.setSandboxBrain(picked);
      controls.updateLabels();
      setScreen('sim');
      const design = designer.getDesign();
      sim.nodes = design.nodes;
      sim.constraints = design.constraints;
      startTrainingNow({ startPaused: true });
      controls.setCameraMode('lock');
      renderBrainLibrary();
      updateSandboxUI();
    } catch (err) {
      alert(`Sandbox start failed: ${err.message}`);
    }
  };
}

const sandboxExitBtn = document.getElementById('btn-sandbox-exit');
if (sandboxExitBtn) {
  sandboxExitBtn.onclick = () => {
    restorePreviousSessionAfterSandbox();
  };
}

const brainDeleteBtn = document.getElementById('btn-brain-delete');
if (brainDeleteBtn) {
  brainDeleteBtn.onclick = () => {
    if (!brainLibrary.length) return;
    const selectedId = brainSelect ? brainSelect.value : '';
    const idx = brainLibrary.findIndex(b => b.id === selectedId);
    if (idx < 0) return;
    brainLibrary.splice(idx, 1);
    persistBrainLibrary();
    renderBrainLibrary();
  };
}

worldCanvas.addEventListener('click', e => {
  if (currentScreen !== 'sim' || challengeTool === 'none') return;
  const p = worldPointFromEvent(e);
  if (challengeTool === 'ground') {
    sim.addGroundPoint({ x: p.x, y: p.y });
  } else if (challengeTool === 'obstacle') {
    sim.addObstacle({ x: p.x, y: p.y, w: 60, h: 40 });
  } else if (challengeTool === 'triangle') {
    sim.addTriangleObstacle({ x: p.x, y: p.y - 25, w: 50, h: 50 });
  }
  if (!simSessionStarted) renderWorld(null);
});

sim.onGenerationEnd = () => {
  controls.setReplayIndex(sim.replayHistory.length - 1);

  // Record generation data for evolution monitoring
  if (!sim.sandboxMode && sim.progressHistory.length > 0) {
  const latest = sim.progressHistory[sim.progressHistory.length - 1];
  evolutionMonitor.recordGeneration(latest);

  // Auto-adaptation feature removed - user controls settings manually
  }
};

sim.onTurboParityFallback = payload => {
  showTurboParityFallbackWarning(payload?.message);
  updateStartSimUI();
  syncMobileQuickControlState();
  if (uiSurface && typeof uiSurface.sync === 'function') {
    uiSurface.sync(getCurrentAppState());
  }
  emitAppState();
};

// --- Rendering ---
function drawGhosts(ctx) {
  sim.ghosts.forEach(ghost => {
    if (ghost.path.length < 2) return;
    const fade = Math.max(0.04, 0.55 * (1 - ghost.age / (CONFIG.ghostMaxAge + 1)));
    ctx.beginPath();
    ctx.moveTo(ghost.path[0].x, ghost.path[0].y);
    for (let i = 1; i < ghost.path.length; i++) {
      ctx.lineTo(ghost.path[i].x, ghost.path[i].y);
    }
    ctx.strokeStyle = `rgba(0,242,255,${fade})`;
    ctx.lineWidth = 2;
    ctx.stroke();
  });

  if (sim.currentGhostPath.length > 1) {
    ctx.beginPath();
    ctx.moveTo(sim.currentGhostPath[0].x, sim.currentGhostPath[0].y);
    for (let i = 1; i < sim.currentGhostPath.length; i++) {
      ctx.lineTo(sim.currentGhostPath[i].x, sim.currentGhostPath[i].y);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.20)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }
}

function drawTurboAllTimeBestGlow(ctx, groundY) {
  const best = sim.getTurboAllTimeBestRun ? sim.getTurboAllTimeBestRun() : null;
  if (!best || !Array.isArray(best.path) || best.path.length < 2) return;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(best.path[0].x, best.path[0].y);
  for (let i = 1; i < best.path.length; i++) {
    ctx.lineTo(best.path[i].x, best.path[i].y);
  }
  ctx.strokeStyle = 'rgba(250, 204, 21, 0.95)';
  ctx.lineWidth = 4;
  ctx.shadowColor = 'rgba(250, 204, 21, 0.9)';
  ctx.shadowBlur = 14;
  ctx.stroke();
  ctx.shadowBlur = 0;

  const end = best.path[best.path.length - 1];
  if (end) {
    const poleX = end.x;
    const poleTop = groundY - 180;
    const poleBottom = groundY + 8;

    ctx.beginPath();
    ctx.moveTo(poleX, poleTop);
    ctx.lineTo(poleX, poleBottom);
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.98)';
    ctx.lineWidth = 3;
    ctx.shadowColor = 'rgba(250, 204, 21, 0.95)';
    ctx.shadowBlur = 16;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
  ctx.restore();
}

function drawTurboGenerationPoles(ctx, groundY) {
  if (sim.trainingMode !== 'turbo' || sim.sandboxMode) return;
  const history = sim.getTurboGenPoleHistory ? sim.getTurboGenPoleHistory() : [];
  if (!Array.isArray(history) || !history.length) return;

  const total = history.length;
  ctx.save();
  for (let i = 0; i < total; i++) {
    const entry = history[i];
    const t = total <= 1 ? 1 : ((i + 1) / total); // oldest -> newest
    const alpha = 0.12 + (t * t * 0.78);
    const x = Number.isFinite(entry?.x)
      ? entry.x
      : (sim.spawnCenterX + (Math.max(0, Number(entry?.distance) || 0) * SCALE));
    const poleTop = groundY - (68 + 92 * t);
    const poleBottom = groundY + 8;

    const gradient = ctx.createLinearGradient(x, poleTop, x, poleBottom);
    gradient.addColorStop(0, `rgba(103, 232, 249, ${Math.max(0.08, alpha * 0.45)})`);
    gradient.addColorStop(1, `rgba(34, 211, 238, ${alpha})`);

    ctx.beginPath();
    ctx.moveTo(x, poleTop);
    ctx.lineTo(x, poleBottom);
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 1.2 + (t * 2.2);
    ctx.shadowColor = `rgba(34, 211, 238, ${Math.min(0.9, alpha + 0.1)})`;
    ctx.shadowBlur = 2 + (10 * t);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
  ctx.restore();
}

function drawBestRunSpotlight(ctx, sample = null) {
  const runSample = sample || (sim.getBestRunSample ? sim.getBestRunSample() : null);
  const highlightGold = !!runSample?.isAllTimeBest;
  const isMobile = document.body.classList.contains('app-mobile');
  if (!runSample) {
    if (sim.viewMode === 'bestRun' && !isMobile) {
      ctx.fillStyle = 'rgba(220, 252, 231, 0.85)';
      ctx.font = 'bold 14px "JetBrains Mono", monospace';
      ctx.fillText('Waiting for qualifying best run...', sim.cameraX + 24, sim.cameraY + 42);
    }
    return;
  }
  if (runSample.points.length > 1) {
    ctx.beginPath();
    ctx.moveTo(runSample.points[0].x, runSample.points[0].y);
    for (let i = 1; i < runSample.points.length; i++) {
      ctx.lineTo(runSample.points[i].x, runSample.points[i].y);
    }
    ctx.strokeStyle = highlightGold ? 'rgba(250, 204, 21, 0.95)' : 'rgba(52, 211, 153, 0.95)';
    ctx.lineWidth = 4;
    ctx.stroke();
  }
  if (runSample.headPoint && sim.trainingMode !== 'turbo') {
    ctx.beginPath();
    ctx.arc(runSample.headPoint.x, runSample.headPoint.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = highlightGold ? 'rgba(250, 204, 21, 1)' : 'rgba(52, 211, 153, 1)';
    ctx.fill();
  }
  if (!isMobile) {
    ctx.fillStyle = 'rgba(245, 245, 255, 0.92)';
    ctx.font = 'bold 12px "JetBrains Mono", monospace';
    ctx.fillText(`Spotlight G${runSample.generation} • ${runSample.distance.toFixed(2)}m`, sim.cameraX + 24, sim.cameraY + 24);
  }

  const showBackgroundTrainingHint = (
    sim.viewMode === 'bestRun'
    && runSample.playbackFinished
    && !sim.sandboxMode
    && !sim.paused
    && !isMobile
  );
  if (showBackgroundTrainingHint) {
    const hintX = sim.cameraX + 24;
    const hintY = sim.cameraY + 34;
    const hintW = 396;
    const hintH = 18;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
    ctx.fillRect(hintX, hintY, hintW, hintH);
    ctx.fillStyle = 'rgba(226, 232, 240, 0.95)';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillText('Training is still running in the background. You\'ll see the run soon.', hintX + 8, hintY + 12);
  }

  if (sim.viewMode === 'bestRun' && runSample.replayFrame && Array.isArray(runSample.replayFrame.nodes)) {
    const nodes = runSample.replayFrame.nodes;
    const idToIndex = new Map();
    sim.nodes.forEach((n, idx) => idToIndex.set(n.id, idx));
    sim.constraints.forEach(c => {
      const i1 = idToIndex.get(c.n1);
      const i2 = idToIndex.get(c.n2);
      if (!Number.isInteger(i1) || !Number.isInteger(i2)) return;
      const p1 = nodes[i1];
      const p2 = nodes[i2];
      if (!p1 || !p2) return;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      if (c.type === 'muscle') {
        ctx.strokeStyle = 'rgba(0, 242, 255, 0.85)';
        ctx.lineWidth = 3.2;
      } else {
        ctx.strokeStyle = 'rgba(245, 245, 245, 0.65)';
        ctx.lineWidth = 2.2;
      }
      ctx.stroke();
    });

    nodes.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.8, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(20, 23, 30, 0.95)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.95)';
      ctx.lineWidth = 2;
      ctx.stroke();
    });
  }
}

function drawMiniSparkline(canvas, values, color) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(4, 8, 15, 0.85)';
  ctx.fillRect(0, 0, w, h);

  if (!values || values.length < 2) {
    ctx.fillStyle = 'rgba(148, 163, 184, 0.6)';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillText('waiting...', 6, h - 7);
    return;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1e-6, max - min);
  const pad = 2;
  const toX = i => pad + (i / (values.length - 1)) * (w - pad * 2);
  const toY = v => h - pad - ((v - min) / span) * (h - pad * 2);

  ctx.beginPath();
  values.forEach((v, i) => {
    const x = toX(i);
    const y = toY(v);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  ctx.stroke();

  const lastY = toY(values[values.length - 1]);
  ctx.beginPath();
  ctx.arc(w - pad - 1, lastY, 2.2, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function updateLeftNeatProgressPanel() {
  const modeEl = document.getElementById('left-neat-mode');
  const speciesEl = document.getElementById('left-neat-species');
  const innovEl = document.getElementById('left-neat-innovations');
  const champEl = document.getElementById('left-neat-champion');
  const speciesSpark = document.getElementById('left-neat-species-spark');
  const innovSpark = document.getElementById('left-neat-innov-spark');
  const complexitySpark = document.getElementById('left-neat-complexity-spark');
  if (!modeEl || !speciesEl || !innovEl || !champEl) return;

  const neatActive = String(sim.trainingAlgorithm || '').toLowerCase() === 'neat';
  modeEl.textContent = neatActive ? 'ACTIVE' : 'LEGACY';
  modeEl.style.color = neatActive ? '#67e8f9' : '#94a3b8';

  const points = (sim.progressHistory || [])
    .map(p => p?.neatStatus)
    .filter(Boolean)
    .slice(-48);
  const latest = points.length ? points[points.length - 1] : (sim.neatStatus || null);

  const species = Number.isFinite(latest?.speciesCount) ? latest.speciesCount : null;
  const innovations = Number.isFinite(latest?.innovationCount) ? latest.innovationCount : null;
  const champNodes = Number.isFinite(latest?.championComplexity?.nodes) ? latest.championComplexity.nodes : null;
  const champConnections = Number.isFinite(latest?.championComplexity?.connections) ? latest.championComplexity.connections : null;

  speciesEl.textContent = species == null ? '--' : String(species);
  innovEl.textContent = innovations == null ? '--' : String(innovations);
  champEl.textContent = (champNodes == null || champConnections == null) ? '--' : `${champNodes}/${champConnections}`;

  drawMiniSparkline(speciesSpark, points.map(p => Number(p.speciesCount) || 0), '#7dd3fc');
  drawMiniSparkline(innovSpark, points.map(p => Number(p.innovationCount) || 0), '#a78bfa');
  drawMiniSparkline(complexitySpark, points.map(p => Number(p.championComplexity?.connections) || 0), '#fbbf24');
}

function renderWorld(leader, viewMode = 'training') {
if (!worldCtx) return;
const ctx = worldCtx;
const gY = sim.getGroundY();
const bestRunSample = (viewMode === 'bestRun' || sim.trainingMode === 'turbo')
  ? (sim.getBestRunSample ? sim.getBestRunSample() : null)
  : null;

const zoom = sim.zoom;
const viewW = worldCanvas.width / zoom;
const viewH = worldCanvas.height / zoom;

frameCount++;

// Camera follow — center creature in visible canvas area (between panels)
// Cache panel dimensions and update only every 5 frames for performance
const turboLineFollow = sim.trainingMode === 'turbo' && !sim.sandboxMode;
const lockFocusPoint = sim.cameraMode === 'lock'
  ? (
      (
        turboLineFollow && sim.getTurboGenPoleHistory
          ? (() => {
              const poles = sim.getTurboGenPoleHistory();
              const latest = Array.isArray(poles) && poles.length ? poles[poles.length - 1] : null;
              return latest && Number.isFinite(latest.x) ? { x: latest.x, y: gY - 80 } : null;
            })()
          : null
      )
      || (!turboLineFollow ? bestRunSample?.headPoint : null)
      || (leader ? leader.getCenter() : null)
    )
  : null;

if (lockFocusPoint) {
let leftW, rightW, topH, bottomH;

if (!cachedPanelDims || frameCount - lastPanelUpdateFrame >= 5) {
// Update cache every 5 frames
const leftPanel = document.getElementById('panel-progress-left');
const rightPanel = document.getElementById('panel-controls');
const topPanel = document.getElementById('panel-top-bar');
const bottomPanel = document.getElementById('panel-scorecard');
    leftW = (leftPanel && !leftPanel.classList.contains('module-hidden')) ? leftPanel.offsetWidth : 0;
    rightW = (rightPanel && !rightPanel.classList.contains('module-hidden')) ? rightPanel.offsetWidth : 0;
    topH = (topPanel && !topPanel.classList.contains('module-hidden')) ? topPanel.offsetHeight : 0;
    bottomH = (bottomPanel && !bottomPanel.classList.contains('module-hidden')) ? bottomPanel.offsetHeight : 0;

    // Mobile Dock adjustment
    if (document.body.classList.contains('app-mobile')) {
      const mobileDock = document.getElementById('mobile-quick-controls');
      if (mobileDock && !mobileDock.classList.contains('minimized')) {
        const isPortrait = window.innerHeight > window.innerWidth;
        if (isPortrait) {
          bottomH = Math.max(bottomH, mobileDock.offsetHeight);
        } else {
          rightW = Math.max(rightW, mobileDock.offsetWidth);
        }
      }

      const turboOverlay = document.getElementById('mobile-turbo-overlay');
      const turboVisible = (
        turboOverlay &&
        !turboOverlay.classList.contains('hidden') &&
        getComputedStyle(turboOverlay).display !== 'none'
      );
      if (turboVisible) {
        topH += (turboOverlay.offsetHeight || 0) + 6;
      }
    }

    cachedPanelDims = { leftW, rightW, topH, bottomH };
    lastPanelUpdateFrame = frameCount;
} else {
// Use cached values
({ leftW, rightW, topH, bottomH } = cachedPanelDims);
}

    // Visible center in world coordinates
    const visibleCenterX = (leftW + (worldCanvas.width - leftW - rightW) / 2) / zoom;
    // Bias Y slightly up (0.85) to keep ground higher in viewport
    const visibleCenterY = ((topH + (worldCanvas.height - topH - bottomH) / 2) / zoom) * 0.85;

    const targetX = lockFocusPoint.x - visibleCenterX;
    const targetY = lockFocusPoint.y - visibleCenterY;
    sim.cameraX += (targetX - sim.cameraX) * 0.09;
    sim.cameraY += (targetY - sim.cameraY) * 0.06;
  }

  ctx.clearRect(0, 0, worldCanvas.width, worldCanvas.height);
  ctx.save();
  ctx.scale(zoom, zoom);
  ctx.translate(-sim.cameraX, -sim.cameraY);

  // Background
  ctx.fillStyle = '#060810';
  ctx.fillRect(sim.cameraX, sim.cameraY, viewW, viewH);
  ctx.fillStyle = '#0b0f18';
  ctx.fillRect(sim.cameraX, gY, viewW, 420);

  // Ground line (simple, high-contrast)
  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(sim.cameraX, gY);
  ctx.lineTo(sim.cameraX + viewW, gY);
  ctx.stroke();

  // Death wall (left-to-right elimination objective)
  if (sim.deathWallEnabled && !sim.sandboxMode) {
    const wallW = sim.deathWallThicknessPx;
    const wallX = sim.deathWallX - wallW / 2;
    const wallTop = sim.cameraY - 200;
    const wallH = viewH + 400;
    const wallGradient = ctx.createLinearGradient(wallX, 0, wallX + wallW, 0);
    wallGradient.addColorStop(0, 'rgba(255, 30, 30, 0.18)');
    wallGradient.addColorStop(1, 'rgba(255, 90, 30, 0.50)');
    ctx.fillStyle = wallGradient;
    ctx.fillRect(wallX, wallTop, wallW, wallH);
    ctx.strokeStyle = 'rgba(255, 110, 70, 0.95)';
    ctx.lineWidth = 2;
    ctx.strokeRect(wallX, wallTop, wallW, wallH);

    ctx.fillStyle = 'rgba(255, 225, 225, 0.95)';
    ctx.font = 'bold 11px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('WALL OF DEATH', sim.deathWallX + 10, sim.cameraY + 24);
  }

  // Challenge terrain line (zero thickness physics, thin visual)
  if (sim.groundProfile.length > 1) {
    ctx.beginPath();
    ctx.moveTo(sim.groundProfile[0].x, sim.groundProfile[0].y);
    for (let i = 1; i < sim.groundProfile.length; i++) {
      ctx.lineTo(sim.groundProfile[i].x, sim.groundProfile[i].y);
    }
    ctx.strokeStyle = '#ffb347';
    ctx.lineWidth = 4;
    ctx.stroke();
  }

  // Challenge obstacles
  sim.obstacles.forEach(o => {
    ctx.fillStyle = 'rgba(255,170,60,0.45)';
    ctx.fillRect(o.x - o.w / 2, o.y - o.h / 2, o.w, o.h);
    ctx.strokeStyle = 'rgba(255,220,130,0.85)';
    ctx.lineWidth = 2;
    ctx.strokeRect(o.x - o.w / 2, o.y - o.h / 2, o.w, o.h);
  });

  // Distance markers
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.font = '12px "JetBrains Mono", monospace';
  const markerSpacingM = 10;
  const markerSpacingPx = markerSpacingM * SCALE;
  const originPx = sim.spawnCenterX;
  const firstM = Math.ceil((sim.cameraX - originPx) / markerSpacingPx) * markerSpacingM;
  for (let m = firstM; m * SCALE + originPx < sim.cameraX + viewW; m += markerSpacingM) {
    if (m < 0) continue;
    const px = originPx + m * SCALE;
    ctx.fillText(`${m}m`, px, gY + 24);
  }

  if (viewMode === 'training') {
    drawGhosts(ctx);
  }

  const shouldDrawCreatures = viewMode === 'training' && sim.trainingMode !== 'turbo';

  // Draw creatures in live training mode only
  if (shouldDrawCreatures && sim.showGhosts) {
    sim.creatures.forEach(c => c.draw(ctx, c === leader));
  } else if (shouldDrawCreatures && leader) {
    leader.draw(ctx, true);
  }

  if (viewMode === 'bestRun' || viewMode === 'training') {
    drawTurboGenerationPoles(ctx, gY);
    if (sim.trainingMode !== 'turbo') {
      drawTurboAllTimeBestGlow(ctx, gY);
    }
    if (sim.trainingMode !== 'turbo') {
      drawBestRunSpotlight(ctx, bestRunSample);
    }
  }
  
  /* Red debug border removed */

  if (challengeTool !== 'none') {
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '12px "JetBrains Mono", monospace';
    ctx.fillText(
      challengeTool === 'ground' ? 'Ground draw ON: click to add points' : 'Obstacle mode ON: click to place box',
      sim.cameraX + 18,
      sim.cameraY + 24
    );
  }

  if (currentScreen === 'sim' && !simSessionStarted) {
    const bannerW = Math.min(540, viewW - 24);
    const bannerH = 42;
    const bx = sim.cameraX + (viewW - bannerW) * 0.5;
    const by = sim.cameraY + 16;
    ctx.fillStyle = 'rgba(6, 8, 14, 0.78)';
    ctx.fillRect(bx, by, bannerW, bannerH);
    ctx.strokeStyle = 'rgba(52, 211, 153, 0.65)';
    ctx.lineWidth = 1.4;
    ctx.strokeRect(bx, by, bannerW, bannerH);
    ctx.fillStyle = 'rgba(167, 243, 208, 1)';
    ctx.textAlign = 'center';
    ctx.font = 'bold 14px Inter, sans-serif';
    ctx.fillText('Draw terrain/obstacles, then press START SIM', bx + bannerW * 0.5, by + 26);
    ctx.textAlign = 'left';
  }

  ctx.restore();
}

function renderTrainingWorld(leader) {
  renderWorld(leader, 'training');
}

function renderBestRunWorld(leader) {
  renderWorld(leader, 'bestRun');
}

// --- Frame callback ---
sim.onFrame = (leader, simulatedSec) => {
  progressChart.setMode(sim.testingModeEnabled ? 'testing' : 'training');
  updateTestingDashboardUI();
  updateLeftNeatProgressPanel();
  hud.update(sim);
  updateMobileSimTopHud();
  controls.updateFitnessPanel(leader ? leader.getFitnessSnapshot() : null, leader);
  updateSandboxScorecard(leader);
  updateSandboxStats(leader);
  if (sim.viewMode === 'bestRun' && !sim.sandboxMode) {
    renderBestRunWorld(leader);
  } else {
    renderTrainingWorld(leader);
  }
  visualizer.render(leader);
  progressChart.renderRight(sim);
  progressChart.renderLeft(sim);
  evolutionFeedback.update();
};

// --- Panel Toggle Buttons ---
function panelIsShown(panel) {
  return !!panel && panel.style.display !== 'none';
}

function updatePanelToggleButtonPositions() {
  const leftBtn = document.getElementById('toggle-left');
  const rightBtn = document.getElementById('toggle-right');
  const leftPanel = document.getElementById('panel-progress-left');
  const rightPanel = document.getElementById('panel-controls');

  if (leftBtn) {
    const leftOffset = panelIsShown(leftPanel) ? Math.max(8, leftPanel.offsetWidth - 14) : 8;
    leftBtn.style.left = `${leftOffset}px`;
  }
  if (rightBtn) {
    const rightOffset = panelIsShown(rightPanel) ? Math.max(8, rightPanel.offsetWidth - 14) : 8;
    rightBtn.style.right = `${rightOffset}px`;
  }
}

document.querySelectorAll('.panel-toggle-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const panelId = btn.getAttribute('data-panel');
    const panel = document.getElementById(panelId);
    const icon = btn.querySelector('i');

    if (panel.style.display === 'none') {
      // Show panel
      panel.style.display = '';
      // Update icon to point inward (hide direction)
      if (panelId === 'panel-top-bar') icon.className = 'fas fa-chevron-up';
      else if (panelId === 'panel-progress-left') icon.className = 'fas fa-chevron-left';
      else if (panelId === 'panel-controls') icon.className = 'fas fa-chevron-right';
      else if (panelId === 'panel-scorecard') icon.className = 'fas fa-chevron-down';
    } else {
      // Hide panel
      panel.style.display = 'none';
      // Update icon to point outward (show direction)
      if (panelId === 'panel-top-bar') icon.className = 'fas fa-chevron-down';
      else if (panelId === 'panel-progress-left') icon.className = 'fas fa-chevron-right';
      else if (panelId === 'panel-controls') icon.className = 'fas fa-chevron-left';
      else if (panelId === 'panel-scorecard') icon.className = 'fas fa-chevron-up';
    }
    updatePanelToggleButtonPositions();
  });
});

window.addEventListener('resize', updatePanelToggleButtonPositions);
updatePanelToggleButtonPositions();

// --- Evolution Suggestion Application ---
window.addEventListener('applySuggestion', (e) => {
  const { suggestion } = e.detail;
  if (!suggestion || !suggestion.autoParams) return;

  // Apply parameters to simulation
  for (const [key, value] of Object.entries(suggestion.autoParams)) {
    if (key in sim) {
      sim[key] = value;
    }
  }

  // Update UI controls to reflect new values
  controls.updateLabels();

    // Sync runtime settings for immediate effect
    if (sim.world) {
      sim.world.setGravity(Vec2(0, sim.gravity));
      sim.syncCreatureRuntimeSettings();
    }
});

// --- Resize with throttling ---
let resizeTimeout;
window.addEventListener('resize', () => {
clearTimeout(resizeTimeout);
resizeTimeout = setTimeout(() => {
resizeCanvases();
designer.render();
}, 100); // Debounce 100ms
});

// --- Init ---
setTool('node', document.getElementById('tool-node'));
resizeCanvases();
designer.render();
initSandboxPanelControls();

uiSurface = mountDesktopUI();

if (uiSurface && typeof uiSurface.sync === 'function') {
  uiSurface.sync(getCurrentAppState());
}
emitAppState();
