import { CONFIG } from './utils/config.js';
import { PRESETS } from './utils/presets.js';
import { Simulation } from './sim/Simulation.js';
import { Designer } from './ui/Designer.js';
import { Controls } from './ui/Controls.js';
import { HUD } from './ui/HUD.js';
import { Visualizer } from './ui/Visualizer.js';
import { ProgressChart } from './ui/ProgressChart.js';
import { EvolutionMonitor } from './utils/EvolutionMonitor.js';
import { EvolutionFeedback } from './ui/EvolutionFeedback.js';
import { Vec2 } from './sim/Physics.js';


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
const BRAIN_LIBRARY_KEY = 'polyevolve.brainLibrary.v1';
let brainLibrary = [];

// Performance: Cache panel dimensions (updated once per frame)
let cachedPanelDims = null;
let lastPanelUpdateFrame = 0;
let frameCount = 0;

// --- Modules ---
const sim = new Simulation();

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

// --- Populate preset dropdown ---
const presetSelect = document.getElementById('preset-select');
if (presetSelect) {
  PRESETS.forEach((p, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = p.name;
    presetSelect.appendChild(opt);
  });
}

// --- Screen management ---
function setScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');
  currentScreen = name;

  if (name === 'draw') {
    sim.stopLoop();
    simSessionStarted = false;
    designer.render();
  } else if (name === 'sim') {
    // Transfer design to simulation; wait for explicit Start Sim.
    const design = designer.getDesign();
    sim.nodes = design.nodes;
    sim.constraints = design.constraints;
    sim.polygons = design.polygons || [];
    resizeCanvases();
    worldCtx = worldCanvas.getContext('2d');
    simSessionStarted = false;
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
          <div class="sandbox-stat-label">Stability</div>
          <div class="sandbox-stat-value" id="sandbox-stat-stability">0%</div>
        </div>
        <div class="sandbox-stat">
          <div class="sandbox-stat-label">Falls</div>
          <div class="sandbox-stat-value" id="sandbox-stat-falls">0</div>
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
      const btn = document.getElementById('btn-sandbox-pause');
      if (sim.sandboxPaused) {
        btn.innerHTML = '<i class="fas fa-play"></i> Resume';
        btn.classList.remove('sandbox-btn-pause');
        btn.classList.add('sandbox-btn-resume');
      } else {
        btn.innerHTML = '<i class="fas fa-pause"></i> Pause';
        btn.classList.remove('sandbox-btn-resume');
        btn.classList.add('sandbox-btn-pause');
      }
    };
    
    document.getElementById('btn-sandbox-exit-new').onclick = () => {
      sim.exitSandboxMode();
      hideSandboxControls();
      updateSandboxUI();
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
      if (sim.sandboxPaused) {
        pauseBtn.innerHTML = '<i class="fas fa-play mr-1"></i> Resume';
        pauseBtn.classList.remove('bg-amber-500/20', 'text-amber-300', 'border-amber-400/40');
        pauseBtn.classList.add('bg-emerald-500/20', 'text-emerald-300', 'border-emerald-400/40');
      } else {
        pauseBtn.innerHTML = '<i class="fas fa-pause mr-1"></i> Pause';
        pauseBtn.classList.remove('bg-emerald-500/20', 'text-emerald-300', 'border-emerald-400/40');
        pauseBtn.classList.add('bg-amber-500/20', 'text-amber-300', 'border-amber-400/40');
      }
    };
  }
  
  // Sandbox exit button in right panel
  const exitBtn = document.getElementById('btn-sandbox-exit-panel');
  if (exitBtn) {
    exitBtn.onclick = () => {
      // Stop current simulation first
      sim.stopLoop();
      sim.clearSimulation();
      // Exit sandbox mode
      sim.exitSandboxMode();
      // Restart with new training population
      startTrainingNow();
      updateSandboxUI();
      renderBrainLibrary();
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
  
  if (floatDistEl) floatDistEl.textContent = dist.toFixed(1) + 'm';
  if (floatSpeedEl) floatSpeedEl.textContent = (f.speed / 100).toFixed(1) + ' m/s';
  if (floatStabEl) floatStabEl.textContent = f.stability.toFixed(0) + '%';
  if (floatFallsEl) floatFallsEl.textContent = String(f.stumbles);
  if (runEl) runEl.textContent = 'RUN ' + sim.sandboxRuns;
  
  // Update right panel stats
  const panelDistEl = document.getElementById('sandbox-stat-dist');
  const panelSpeedEl = document.getElementById('sandbox-stat-speed');
  const panelStabEl = document.getElementById('sandbox-stat-stability');
  const panelFallsEl = document.getElementById('sandbox-stat-falls');
  const panelRunEl = document.getElementById('sandbox-mode-badge');
  
  if (panelDistEl) panelDistEl.textContent = dist.toFixed(1) + 'm';
  if (panelSpeedEl) panelSpeedEl.textContent = (f.speed / 100).toFixed(1) + ' m/s';
  if (panelStabEl) panelStabEl.textContent = f.stability.toFixed(0) + '%';
  if (panelFallsEl) panelFallsEl.textContent = String(f.stumbles);
  if (panelRunEl) panelRunEl.textContent = 'RUN ' + sim.sandboxRuns;
  
  // Track history for graphs (sample every 6 frames = ~10 samples/sec for 60 seconds)
  if (!sim._sandboxGraphData) {
    sim._sandboxGraphData = {
      distance: [],
      speed: [],
      stability: [],
      actuation: [],
      maxPoints: 600, // 60 seconds at 10 samples/sec
      frameCount: 0
    };
  }
  
  const gd = sim._sandboxGraphData;
  gd.frameCount = (gd.frameCount || 0) + 1;
  
  // Sample every 6 frames (~10 times per second)
  if (gd.frameCount % 6 !== 0) return;
  
  gd.distance.push(dist);
  gd.speed.push(f.speed / 100);
  gd.stability.push(f.stability);
  gd.actuation.push(f.actuationLevel || 0);
  
  // Trim to max points
  if (gd.distance.length > gd.maxPoints) {
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
    { id: 'sandbox-graph-distance', data: gd.distance, color: '#22d3ee', maxVal: 50, suffix: 'm' },
    { id: 'sandbox-graph-speed', data: gd.speed, color: '#a78bfa', maxVal: 5, suffix: ' m/s' },
    { id: 'sandbox-graph-stability', data: gd.stability, color: '#34d399', maxVal: 100, suffix: '%' },
    { id: 'sandbox-graph-actuation', data: gd.actuation, color: '#fbbf24', maxVal: 1, suffix: '' }
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
    
    // Smooth the data
    const smoothed = smoothData(data, 8);
    
    // Draw glow layer (wider line, more transparent)
    ctx.beginPath();
    ctx.strokeStyle = cfg.color + '30';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    const step = w / (gd.maxPoints - 1);
    const xOffset = w - (smoothed.length * step);
    
    for (let i = 0; i < smoothed.length; i++) {
      const x = xOffset + i * step;
      const y = h - (smoothed[i] / cfg.maxVal) * (h - 16) - 8;
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
      const x = xOffset + i * step;
      const y = h - (smoothed[i] / cfg.maxVal) * (h - 16) - 8;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
    
    // Draw current value
    const currentVal = data[data.length - 1];
    ctx.font = 'bold 16px "JetBrains Mono", monospace';
    ctx.fillStyle = cfg.color;
    ctx.textAlign = 'right';
    ctx.fillText(currentVal.toFixed(1) + cfg.suffix, w - 8, 20);
    
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

function updateSandboxScorecard(leader) {
  if (!sim.sandboxMode || !leader) return;

  const f = leader.getFitnessSnapshot();
  const dist = sim.distMetersContinuousFromX(leader.getX());

  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  set('sandbox-distance', `${dist.toFixed(1)}m`);
  set('sandbox-speed', `${(f.speed / 100).toFixed(1)} m/s`);
  set('sandbox-stability', `${f.stability.toFixed(0)}%`);
  set('sandbox-falls', String(f.stumbles));
  set('sandbox-slip', (f.groundSlip || 0).toFixed(2));
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

function renderBrainLibrary() {
  const select = document.getElementById('brain-library-select');
  const meta = document.getElementById('brain-library-meta');
  if (!select || !meta) return;

  select.innerHTML = '';
  if (!brainLibrary.length) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'No saved brains';
    select.appendChild(opt);
    meta.textContent = 'Run at least one generation, then save.';
    return;
  }

  brainLibrary.forEach(item => {
    const opt = document.createElement('option');
    opt.value = item.id;
    const dist = Number.isFinite(item.distance) ? `${item.distance}m` : '?m';
    const gen = Number.isFinite(item.generation) ? `G${item.generation}` : 'G?';
    opt.textContent = `${item.name || 'Brain'} · ${gen} · ${dist}`;
    select.appendChild(opt);
  });

  if (!select.value) select.value = brainLibrary[0].id;
  const selected = brainLibrary.find(b => b.id === select.value) || brainLibrary[0];
  const mode = sim.sandboxMode ? 'Sandbox ON' : 'Sandbox OFF';
  meta.textContent = `${mode} · ${selected.name || 'Brain'} · ${selected.distance || 0}m · ${new Date(selected.createdAt).toLocaleString()}`;
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
    joint: 'Click joint to toggle Fixed/Hinge.',
    bone: 'Drag joint to joint to add rigid bones.',
    muscle: 'Drag joint to joint to add muscles.',
    move: 'Drag joints to reposition.',
    erase: 'Click node or link to delete.'
  };
  const hintEl = document.getElementById('hint-text');
  if (hintEl) hintEl.textContent = hints[tool] || '';
}

// Tool buttons
document.getElementById('tool-node').onclick = e => setTool('node', e.currentTarget);
document.getElementById('tool-joint').onclick = e => setTool('joint', e.currentTarget);
document.getElementById('tool-bone').onclick = e => setTool('bone', e.currentTarget);
document.getElementById('tool-muscle').onclick = e => setTool('muscle', e.currentTarget);
document.getElementById('tool-polygon').onclick = e => setTool('polygon', e.currentTarget);
document.getElementById('tool-move').onclick = e => setTool('move', e.currentTarget);
document.getElementById('tool-erase').onclick = e => setTool('erase', e.currentTarget);
document.getElementById('tool-undo').onclick = () => designer.undo();
document.getElementById('tool-pan').onclick = (e) => {
  const isPanMode = designer.togglePanMode();
  e.currentTarget.classList.toggle('active', isPanMode);
};
document.getElementById('tool-reset-view').onclick = () => designer.resetView();
document.getElementById('tool-save').onclick = () => designer.saveToFile();
document.getElementById('tool-load').onclick = () => document.getElementById('design-file-input').click();

const fileInput = document.getElementById('design-file-input');
fileInput.onchange = async e => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    designer.loadDesign(JSON.parse(text));
  } catch (err) {
    alert(`Load failed: ${err.message}`);
  } finally {
    e.target.value = '';
  }
};

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
    const pauseBtn = document.getElementById('btn-sandbox-pause');
    if (pauseBtn) pauseBtn.click();
    e.preventDefault();
  }
});

// --- Controls binding ---
const startTrainingNow = () => {
  progressChart.clear();
  if (!sim.startSimulation()) {
    alert('Design needs at least 2 nodes, 1 bone, and 1 muscle.');
    return false;
  }
  simSessionStarted = true;
  const icon = document.getElementById('icon-pause');
  if (icon) icon.className = 'fas fa-pause';
  updateStartSimUI();
  updateSandboxUI();
  triggerTrainingStatAnimation();
  return true;
};

controls.bind({
  onStartDraw: () => setScreen('draw'),
  onBack: () => setScreen('splash'),
  onRun: () => setScreen('sim'),
  onStartSim: () => {
    const design = designer.getDesign();
    sim.nodes = design.nodes;
    sim.constraints = design.constraints;
    sim.polygons = design.polygons || [];
    sim.exitSandboxMode();
    startTrainingNow();
  },
  onEdit: () => setScreen('draw'),
  onPause: () => {
    sim.paused = !sim.paused;
    const icon = document.getElementById('icon-pause');
    if (icon) icon.className = sim.paused ? 'fas fa-play' : 'fas fa-pause';
  },
  onReset: () => {
    const design = designer.getDesign();
    sim.nodes = design.nodes;
    sim.constraints = design.constraints;
    sim.polygons = design.polygons || [];
    startTrainingNow();
  },
  onResetSettings: () => {
    if (sim.world) {
      sim.world.setGravity(Vec2(0, sim.gravity));
      sim.syncCreatureRuntimeSettings();
    }
  },
  onPresetSelect: idx => {
    if (idx >= 0 && idx < PRESETS.length) {
      const preset = PRESETS[idx];
      designer.loadDesign({
        nodes: preset.nodes,
        constraints: preset.constraints,
        nextId: Math.max(...preset.nodes.map(n => n.id)) + 1
      });
    }
  },
  isSimScreen: () => currentScreen === 'sim'
});
updateStartSimUI();
brainLibrary = loadBrainLibrary();
renderBrainLibrary();

const setChallengeTool = tool => {
  challengeTool = challengeTool === tool ? 'none' : tool;
  const groundBtn = document.getElementById('btn-ground-draw');
  const obstacleBtn = document.getElementById('btn-obstacle-add');
  if (groundBtn) groundBtn.classList.toggle('active', challengeTool === 'ground');
  if (obstacleBtn) obstacleBtn.classList.toggle('active', challengeTool === 'obstacle');
};

const groundDrawBtn = document.getElementById('btn-ground-draw');
if (groundDrawBtn) groundDrawBtn.onclick = () => setChallengeTool('ground');
const obstacleAddBtn = document.getElementById('btn-obstacle-add');
if (obstacleAddBtn) obstacleAddBtn.onclick = () => setChallengeTool('obstacle');
const groundClearBtn = document.getElementById('btn-ground-clear');
if (groundClearBtn) groundClearBtn.onclick = () => sim.clearGroundProfile();
const challengeClearBtn = document.getElementById('btn-challenge-clear');
if (challengeClearBtn) challengeClearBtn.onclick = () => sim.clearChallenge();

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
      name: `G${payload.generation} ${payload.distance}m`,
      createdAt: payload.createdAt,
      generation: payload.generation,
      distance: payload.distance,
      fitness: payload.fitness,
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
  brainSelect.onchange = () => renderBrainLibrary();
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
      // Stop current simulation first if running
      sim.stopLoop();
      sim.clearSimulation();
      
      if (picked.design && Array.isArray(picked.design.nodes) && Array.isArray(picked.design.constraints)) {
        designer.loadDesign({
          nodes: picked.design.nodes,
          constraints: picked.design.constraints,
          nextId: Math.max(...picked.design.nodes.map(n => n.id)) + 1
        });
      }
      sim.setSandboxBrain(picked);
      controls.updateLabels();
      setScreen('sim');
      const design = designer.getDesign();
      sim.nodes = design.nodes;
      sim.constraints = design.constraints;
      sim.polygons = design.polygons || [];
      startTrainingNow();
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
    // Stop current simulation first
    sim.stopLoop();
    sim.clearSimulation();
    // Exit sandbox mode
    sim.exitSandboxMode();
    // Restart with new training population
    startTrainingNow();
    updateSandboxUI();
    renderBrainLibrary();
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
    sim.addObstacle({ x: p.x, y: p.y - 20, w: 60, h: 40 });
  } else if (challengeTool === 'triangle') {
    sim.addTriangleObstacle({ x: p.x, y: p.y - 25, w: 50, h: 50 });
  }
});

// --- Generation end summary overlay ---
let genSummaryTimeout = null;
sim.onGenerationEnd = info => {
  const el = document.getElementById('gen-summary');
  const text = document.getElementById('gen-summary-text');
  if (el && text) {
    const sign = info.improvement > 0 ? '+' : '';
    text.textContent = `Gen ${info.generation}: Best ${info.genBest}m (${sign}${info.improvement}m)`;
    el.style.opacity = '1';
    clearTimeout(genSummaryTimeout);
    genSummaryTimeout = setTimeout(() => { el.style.opacity = '0'; }, 1500);
  }
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

function renderWorld(leader) {
if (!worldCtx) return;
const ctx = worldCtx;
const gY = sim.getGroundY();

const zoom = sim.zoom;
const viewW = worldCanvas.width / zoom;
const viewH = worldCanvas.height / zoom;

frameCount++;

// Camera follow — center creature in visible canvas area (between panels)
// Cache panel dimensions and update only every 5 frames for performance
if (leader && sim.cameraMode === 'lock') {
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

    const targetX = leader.getCenter().x - visibleCenterX;
    const targetY = leader.getCenter().y - visibleCenterY;
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
  ctx.fillStyle = '#121520';
  ctx.fillRect(sim.cameraX, gY, viewW, 420);

  // Ground line
  ctx.strokeStyle = '#00f2ff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(sim.cameraX, gY);
  ctx.lineTo(sim.cameraX + viewW, gY);
  ctx.stroke();

  // Grass
  const startX = Math.floor(sim.cameraX / 20) * 20;
  const endX = startX + viewW + 40;
  ctx.beginPath();
  for (let x = startX; x < endX; x += 12) {
    const h = Math.sin(x * 0.4) * 4 + 10 + Math.cos(x * 0.03) * 3;
    const tilt = Math.sin(x * 0.09) * 4;
    ctx.moveTo(x, gY);
    ctx.lineTo(x + tilt, gY - h);
  }
  ctx.strokeStyle = '#2d8a3e';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Challenge terrain line
  if (sim.groundProfile.length > 1) {
    ctx.beginPath();
    ctx.moveTo(sim.groundProfile[0].x, sim.groundProfile[0].y);
    for (let i = 1; i < sim.groundProfile.length; i++) {
      ctx.lineTo(sim.groundProfile[i].x, sim.groundProfile[i].y);
    }
    ctx.strokeStyle = '#ffb347';
    ctx.lineWidth = 5;
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
  for (let x = Math.floor(sim.cameraX / 100) * 100; x < sim.cameraX + viewW; x += 100) {
    ctx.fillText(`${Math.floor(x / 100)}m`, x, gY + 24);
  }

  drawGhosts(ctx);

  // Draw creatures - DEBUG: log if creatures should be visible
  if (sim.showGhosts) {
    if (sim.creatures.length === 0) {
      console.warn(`Gen ${sim.generation}: No creatures to render!`);
    } else {
      // DEBUG: Check first creature
      const firstC = sim.creatures[0];
      if (!firstC.bodies || firstC.bodies.length === 0) {
        console.warn(`Gen ${sim.generation}: Creatures have no bodies!`);
      }
      sim.creatures.forEach(c => c.draw(ctx, c === leader));
    }
  } else if (leader) {
    leader.draw(ctx, true);
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
    const cx = sim.cameraX + viewW * 0.5;
    const cy = sim.cameraY + viewH * 0.5;
    ctx.fillStyle = 'rgba(6, 8, 14, 0.85)';
    ctx.fillRect(cx - 210, cy - 54, 420, 108);
    ctx.strokeStyle = 'rgba(52, 211, 153, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(cx - 210, cy - 54, 420, 108);
    ctx.fillStyle = 'rgba(167, 243, 208, 1)';
    ctx.textAlign = 'center';
    ctx.font = 'bold 18px Inter, sans-serif';
    ctx.fillText('Press START SIM to begin training', cx, cy - 6);
    ctx.fillStyle = 'rgba(209, 250, 229, 0.75)';
    ctx.font = '12px "JetBrains Mono", monospace';
    ctx.fillText('Watch evolution improve generation by generation.', cx, cy + 20);
    ctx.textAlign = 'left';
  }

  ctx.restore();
}

// --- Frame callback ---
sim.onFrame = (leader, simulatedSec) => {
  hud.update(sim);
  controls.updateFitnessPanel(leader ? leader.getFitnessSnapshot() : null, leader);
  updateSandboxScorecard(leader);
  updateSandboxStats(leader);
  renderWorld(leader);
  visualizer.render(leader);
  progressChart.renderRight(sim);
  progressChart.renderLeft(sim);
  evolutionFeedback.update();
};

// --- Panel Toggle Buttons ---
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
  });
});

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
