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
  
  if (sim.sandboxMode) {
    if (training) training.classList.add('hidden');
    if (sandbox) sandbox.classList.remove('hidden');
    // Ensure panel is visible if not hidden by user preference? 
    // Let's assume user wants to see it, but we won't force-remove 'module-hidden' 
    // unless explicitly requested. For now, just swap contents.
  } else {
    if (training) training.classList.remove('hidden');
    if (sandbox) sandbox.classList.add('hidden');
  }
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
window.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && currentScreen === 'draw') {
    designer.undo();
    e.preventDefault();
  }
});

// --- Controls binding ---
const startTrainingNow = () => {
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
    startTrainingNow();
  },
  onResetSettings: () => {
    if (sim.engine) {
      sim.engine.world.gravity.y = sim.gravity;
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
      startTrainingNow();
      renderBrainLibrary();
    } catch (err) {
      alert(`Sandbox start failed: ${err.message}`);
    }
  };
}

const sandboxExitBtn = document.getElementById('btn-sandbox-exit');
if (sandboxExitBtn) {
  sandboxExitBtn.onclick = () => {
    sim.exitSandboxMode();
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

    // Try auto-adaptation if enabled
    const adaptation = evolutionMonitor.autoAdapt(sim);
    if (adaptation) {
      evolutionFeedback.showAdaptation(adaptation);
      // Update UI to reflect new settings
      controls.updateLabels();
    }
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

function drawReplayOverlay(ctx) {
  const fitnessTag = document.getElementById('fitness-tag');
  if (sim.replayIndex < 0 || sim.replayIndex >= sim.replayHistory.length) {
    if (fitnessTag) fitnessTag.textContent = `LIVE · A${sim.championAwards}`;
    return;
  }
  const replay = sim.replayHistory[sim.replayIndex];
  if (!replay.path.length) return;
  if (fitnessTag) fitnessTag.textContent = sim.replayPlaying ? 'REPLAY ▶' : 'REPLAY ⏸';

  ctx.beginPath();
  ctx.moveTo(replay.path[0].x, replay.path[0].y);
  for (let i = 1; i < replay.path.length; i++) {
    ctx.lineTo(replay.path[i].x, replay.path[i].y);
  }
  ctx.strokeStyle = 'rgba(255,180,50,0.65)';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  const idx = Math.max(0, Math.min(replay.path.length - 1, Math.floor(sim.replayCursor)));
  const p = replay.path[idx];
  ctx.beginPath();
  ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,210,90,0.95)';
  ctx.fill();

  if (sim.replayPlaying) {
    sim.replayCursor += Math.max(0.5, sim.simSpeed * 0.25);
    if (sim.replayCursor >= replay.path.length) sim.replayCursor = 0;
  }
}

function renderWorld(leader) {
  if (!worldCtx) return;
  const ctx = worldCtx;
  const gY = sim.getGroundY();

  const zoom = sim.zoom;
  const viewW = worldCanvas.width / zoom;
  const viewH = worldCanvas.height / zoom;

  // Camera follow — center creature in visible canvas area (between panels)
  if (leader && sim.cameraMode === 'lock') {
    // Approximate panel sizes that eat into canvas area
    const leftPanel = document.getElementById('panel-progress-left');
    const rightPanel = document.getElementById('panel-controls');
    const topPanel = document.getElementById('panel-top-bar');
    const bottomPanel = document.getElementById('panel-scorecard');
    const leftW = (leftPanel && !leftPanel.classList.contains('module-hidden')) ? leftPanel.offsetWidth : 0;
    const rightW = (rightPanel && !rightPanel.classList.contains('module-hidden')) ? rightPanel.offsetWidth : 0;
    const topH = (topPanel && !topPanel.classList.contains('module-hidden')) ? topPanel.offsetHeight : 0;
    const bottomH = (bottomPanel && !bottomPanel.classList.contains('module-hidden')) ? bottomPanel.offsetHeight : 0;

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
  drawReplayOverlay(ctx);

  // Draw creatures
  sim.creatures.forEach(c => c.draw(ctx, c === leader));

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
  if (sim.engine) {
    sim.engine.world.gravity.y = sim.gravity;
    sim.syncCreatureRuntimeSettings();
  }
});

// --- Resize ---
window.addEventListener('resize', () => {
  resizeCanvases();
  designer.render();
});

// --- Init ---
setTool('node', document.getElementById('tool-node'));
resizeCanvases();
designer.render();
