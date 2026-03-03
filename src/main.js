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
const BRAIN_LIBRARY_KEY = 'polyevolve.brainLibrary.v1';
const CREATURE_CATALOG_KEY = 'polyevolve.creatureCatalog.v1';
const BRAIN_SCHEMA_VERSION = 'neat-v2-runtime';
const BRAIN_SCHEMA_VERSION_KEY = 'polyevolve.brainSchemaVersion';
const BRAIN_MIGRATION_NOTICE_KEY = 'polyevolve.brainMigrationNoticeVersion';
let brainLibrary = [];
let creatureCatalog = [];

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

function migrateBrainStorageIfNeeded() {
  try {
    const previousSchema = localStorage.getItem(BRAIN_SCHEMA_VERSION_KEY);
    if (previousSchema === BRAIN_SCHEMA_VERSION) {
      return { migrated: false, clearedKeys: [] };
    }

    const clearedKeys = [];
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (!key) continue;
      const isPolyEvolveKey = key.startsWith('polyevolve.');
      const isBrainKey = /brain/i.test(key);
      const isCatalogKey = key === CREATURE_CATALOG_KEY;
      const isMigrationKey = key === BRAIN_SCHEMA_VERSION_KEY || key === BRAIN_MIGRATION_NOTICE_KEY;
      if (isPolyEvolveKey && isBrainKey && !isCatalogKey && !isMigrationKey) {
        localStorage.removeItem(key);
        clearedKeys.push(key);
      }
    }

    localStorage.setItem(BRAIN_SCHEMA_VERSION_KEY, BRAIN_SCHEMA_VERSION);
    return { migrated: true, clearedKeys };
  } catch {
    return { migrated: false, clearedKeys: [] };
  }
}

function showBrainMigrationNoticeOnce(migration) {
  if (!migration?.migrated) return;
  try {
    const shownVersion = localStorage.getItem(BRAIN_MIGRATION_NOTICE_KEY);
    if (shownVersion === BRAIN_SCHEMA_VERSION) return;
    const clearedCount = migration.clearedKeys.length;
    const noun = clearedCount === 1 ? 'entry' : 'entries';
    alert(
      `Training brains were reset for compatibility with the latest NEAT/controller update. ` +
      `Cleared ${clearedCount} incompatible brain ${noun}. Creature catalog designs were kept.`
    );
    localStorage.setItem(BRAIN_MIGRATION_NOTICE_KEY, BRAIN_SCHEMA_VERSION);
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

// --- Screen management ---
function setScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');
  currentScreen = name;

  if (name === 'draw') {
    sim.stopLoop();
    simSessionStarted = false;
    toggleCreatureCatalog(false);
    designer.render();
  } else if (name === 'sim') {
    // Transfer design to simulation; wait for explicit Start Sim.
    const design = designer.getDesign();
    sim.nodes = design.nodes;
    sim.constraints = design.constraints;
    resizeCanvases();
    worldCtx = worldCanvas.getContext('2d');
    simSessionStarted = false;
    sim.zoom = 1;
    sim.cameraX = 0;
    sim.cameraY = Math.max(0, sim.getGroundY() - (worldCanvas.height / sim.zoom) * 0.78);
    controls.setCameraMode('free');
    const zoomSlider = document.getElementById('inp-zoom');
    if (zoomSlider) zoomSlider.value = '100';
    controls.updateLabels();
    const icon = document.getElementById('icon-pause');
    if (icon) icon.className = 'fas fa-pause';
    updateStartSimUI();
    updateSandboxUI();
    renderWorld(null);
  }
}

function resizeCanvases() {
  designer.resize();
  worldCanvas.width = window.innerWidth;
  worldCanvas.height = window.innerHeight;
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
  if (!btn || !label) return;

  if (currentScreen !== 'sim') {
    btn.classList.remove('start-ready', 'training');
    label.textContent = 'Start Sim';
    return;
  }

  if (!simSessionStarted) {
    btn.classList.add('start-ready');
    btn.classList.remove('training');
    label.textContent = 'Start Sim';
    btn.title = 'Start Simulation';
  } else {
    btn.classList.remove('start-ready');
    btn.classList.add('training');
    label.textContent = 'Training...';
    btn.title = 'Simulation Running';
  }
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
      sim.cameraX = 0;
      sim.cameraY = Math.max(0, sim.getGroundY() - (worldCanvas.height / sim.zoom) * 0.78);
      controls.setCameraMode('lock');
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
    const raw = localStorage.getItem(BRAIN_LIBRARY_KEY);
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

function loadCreatureCatalog() {
  try {
    const raw = localStorage.getItem(CREATURE_CATALOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(item =>
      item && item.id && item.design &&
      Array.isArray(item.design.nodes) &&
      Array.isArray(item.design.constraints)
    );
  } catch {
    return [];
  }
}

function persistCreatureCatalog() {
  localStorage.setItem(CREATURE_CATALOG_KEY, JSON.stringify(creatureCatalog));
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

  const pad = 14;
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

function saveCurrentCreatureToCatalog(name = null) {
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
  persistCreatureCatalog();
  renderCreatureCatalog();
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
          <button class="catalog-btn flex-1" data-action="load" data-id="${item.id}"><i class="fas fa-folder-open mr-1"></i>Load</button>
          <button class="catalog-btn flex-1" data-action="download" data-id="${item.id}"><i class="fas fa-download mr-1"></i>Export</button>
          <button class="catalog-btn flex-1" data-action="delete" data-id="${item.id}"><i class="fas fa-trash mr-1"></i>Delete</button>
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
  if (open) renderCreatureCatalog();
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
    node: 'Click to add joints. Click on bone to split.',
    joint: 'Click joint to toggle Fixed/Hinge. Fixed = lock bone angle at this node (bone links only).',
    bone: 'Drag joint to joint to add rigid bones.',
    muscle: 'Drag joint to joint to add muscles.',
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
document.getElementById('tool-move').onclick = e => setTool('move', e.currentTarget);
document.getElementById('tool-erase').onclick = e => setTool('erase', e.currentTarget);
document.getElementById('tool-pan').onclick = e => setTool('pan', e.currentTarget);
document.getElementById('tool-undo').onclick = () => designer.undo();
document.getElementById('tool-reset-view').onclick = () => designer.resetView();
document.getElementById('tool-save').onclick = () => {
  saveCurrentCreatureToCatalog();
  toggleCreatureCatalog(true);
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
        saveCurrentCreatureToCatalog(file.name.replace(/\.json$/i, ''));
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
      persistCreatureCatalog();
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
    alert('Design needs at least 2 nodes, 1 bone, and 1 muscle.');
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
  return true;
};

function resetControlSettingsForNewCreature() {
  controls.resetToDefaults();
  controls.updateLabels();
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
    sim.exitSandboxMode();
    controls.setCameraMode('lock');
    startTrainingNow();
  },
  onEdit: () => setScreen('draw'),
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
  },
  onReset: () => {
    preSandboxSession = null;
    const design = designer.getDesign();
    sim.nodes = design.nodes;
    sim.constraints = design.constraints;
    controls.setCameraMode('lock');
    startTrainingNow();
  },
  onResetSettings: () => {
    if (sim.world) {
      sim.world.setGravity(Vec2(0, sim.gravity));
      sim.syncCreatureRuntimeSettings();
    }
  },
  onCameraChanged: () => {
    if (currentScreen === 'sim' && !simSessionStarted) renderWorld(null);
  },
  isSimScreen: () => currentScreen === 'sim'
});
updateStartSimUI();
const brainMigration = migrateBrainStorageIfNeeded();
showBrainMigrationNoticeOnce(brainMigration);
brainLibrary = loadBrainLibrary();
renderBrainLibrary();
creatureCatalog = loadCreatureCatalog();
creatureCatalog = creatureCatalog.map(item => ({
  ...item,
  thumbnail: generateDesignThumbnail(item.design, 220, 140)
}));
persistCreatureCatalog();
renderCreatureCatalog();

const setChallengeTool = tool => {
  challengeTool = challengeTool === tool ? 'none' : tool;
  const groundBtn = document.getElementById('btn-ground-draw');
  const obstacleBtn = document.getElementById('btn-obstacle-add');
  if (groundBtn) groundBtn.classList.toggle('active', challengeTool === 'ground');
  if (obstacleBtn) obstacleBtn.classList.toggle('active', challengeTool === 'obstacle');
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
  if (!runSample) {
    if (sim.viewMode === 'bestRun') {
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
  ctx.fillStyle = 'rgba(245, 245, 255, 0.92)';
  ctx.font = 'bold 12px "JetBrains Mono", monospace';
  ctx.fillText(`Spotlight G${runSample.generation} • ${runSample.distance.toFixed(2)}m`, sim.cameraX + 24, sim.cameraY + 24);

  const showBackgroundTrainingHint = (
    sim.viewMode === 'bestRun'
    && runSample.playbackFinished
    && !sim.sandboxMode
    && !sim.paused
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
  
  // DEBUG: Visual indicator of camera bounds
  ctx.strokeStyle = 'rgba(255,0,0,0.3)';
  ctx.lineWidth = 2;
  ctx.strokeRect(sim.cameraX, sim.cameraY, viewW, viewH);

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
