import { CONFIG } from './utils/config.js';
import { PRESETS } from './utils/presets.js';
import { Simulation } from './sim/Simulation.js';
import { Designer } from './ui/Designer.js';
import { Controls } from './ui/Controls.js';
import { HUD } from './ui/HUD.js';
import { Visualizer } from './ui/Visualizer.js';
import { ProgressChart } from './ui/ProgressChart.js';


// --- State ---
let currentScreen = 'splash';
const screens = {
  splash: document.getElementById('screen-splash'),
  draw: document.getElementById('screen-draw'),
  sim: document.getElementById('screen-sim')
};

const worldCanvas = document.getElementById('world');
let worldCtx = null;

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
    designer.render();
  } else if (name === 'sim') {
    // Transfer design to simulation
    const design = designer.getDesign();
    sim.nodes = design.nodes;
    sim.constraints = design.constraints;
    resizeCanvases();

    if (!sim.startSimulation()) {
      setScreen('draw');
      return;
    }
    worldCtx = worldCanvas.getContext('2d');
  }
}

function resizeCanvases() {
  designer.resize();
  worldCanvas.width = window.innerWidth;
  worldCanvas.height = window.innerHeight;
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
    node: 'Click to add joints.',
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
document.getElementById('tool-bone').onclick = e => setTool('bone', e.currentTarget);
document.getElementById('tool-muscle').onclick = e => setTool('muscle', e.currentTarget);
document.getElementById('tool-move').onclick = e => setTool('move', e.currentTarget);
document.getElementById('tool-erase').onclick = e => setTool('erase', e.currentTarget);
document.getElementById('tool-undo').onclick = () => designer.undo();
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
controls.bind({
  onStartDraw: () => setScreen('draw'),
  onBack: () => setScreen('splash'),
  onRun: () => setScreen('sim'),
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
    sim.startSimulation();
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
    if (fitnessTag) fitnessTag.textContent = `LIVE A${sim.championAwards}`;
    return;
  }
  const replay = sim.replayHistory[sim.replayIndex];
  if (!replay.path.length) return;
  if (fitnessTag) fitnessTag.textContent = sim.replayPlaying ? 'REPLAY PLAY' : 'REPLAY HOLD';

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

  // Camera follow
  if (leader && sim.cameraMode === 'lock') {
    const target = Math.max(0, leader.getX() - viewW * 0.3);
    sim.cameraX += (target - sim.cameraX) * 0.09;
  }

  ctx.clearRect(0, 0, worldCanvas.width, worldCanvas.height);
  ctx.save();
  ctx.scale(zoom, zoom);
  ctx.translate(-sim.cameraX, 0);

  // Background
  ctx.fillStyle = '#090a11';
  ctx.fillRect(sim.cameraX, 0, viewW, viewH);
  ctx.fillStyle = '#1a1a25';
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

  // Distance markers
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.font = '12px monospace';
  for (let x = Math.floor(sim.cameraX / 100) * 100; x < sim.cameraX + viewW; x += 100) {
    ctx.fillText(`${Math.floor(x / 100)}m`, x, gY + 24);
  }

  drawGhosts(ctx);
  drawReplayOverlay(ctx);

  // Draw creatures
  sim.creatures.forEach(c => c.draw(ctx, c === leader));

  ctx.restore();
}

// --- Frame callback ---
sim.onFrame = (leader, simulatedSec) => {
  hud.update(sim);
  controls.updateFitnessPanel(leader ? leader.getFitnessSnapshot() : null);
  renderWorld(leader);
  visualizer.render(leader);
  progressChart.renderRight(sim);
  progressChart.renderLeft(sim);
};

// --- Resize ---
window.addEventListener('resize', () => {
  resizeCanvases();
  designer.render();
});

// --- Init ---
setTool('node', document.getElementById('tool-node'));
resizeCanvases();
designer.render();
