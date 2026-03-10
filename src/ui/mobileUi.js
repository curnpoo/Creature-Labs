import { getOptimized2dContext } from '../utils/canvas.js';

const MOBILE_SHEET_STATE_CLASSES = ['mobile-sheet-open', 'mobile-sheet-controls', 'mobile-sheet-stats'];

function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatElapsed(totalSeconds) {
  const seconds = Math.max(0, safeNumber(totalSeconds, 0));
  if (seconds < 120) return `${seconds.toFixed(1)}s`;
  const minutes = seconds / 60;
  if (minutes < 60) return `${minutes.toFixed(1)}m`;
  const hours = minutes / 60;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  const days = hours / 24;
  return `${days.toFixed(1)}d`;
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el && el.textContent !== text) el.textContent = text;
}

export function createMobileUiController({
  sim,
  storagePrefix,
  isMobileRuntime,
  getCurrentScreen,
  getSimSessionStarted,
  onSyncQuickControlState,
  onTurboOverlayRefresh,
  onTurboChartRefresh
}) {
  let mobileSheetReady = false;
  let lastTurboChartRenderAt = 0;
  let lastTurboChartGeneration = -1;
  let lastTurboChartHistoryLength = -1;

  function renderMobileTurboGenBestChart() {
    const canvas = document.getElementById('mobile-turbo-genbest-chart');
    if (!canvas) return;

    const ctx = getOptimized2dContext(canvas, { opaque: true });
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const width = Math.max(240, Math.round((rect.width || 320) * dpr));
    const height = Math.max(88, Math.round((rect.height || 88) * dpr));

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    ctx.clearRect(0, 0, width, height);

    const history = Array.isArray(sim.progressHistory) ? sim.progressHistory : [];
    const points = history.map(item => ({
      generation: safeNumber(item?.generation, 0),
      value: Math.max(0, safeNumber(item?.genBest, 0))
    }));

    const liveGen = safeNumber(sim.generation, 0);
    const liveGenBest = Math.max(0, safeNumber(sim.genBestDist, 0));
    if (liveGenBest > 0) {
      const lastPoint = points[points.length - 1];
      if (!lastPoint || lastPoint.generation !== liveGen) {
        points.push({ generation: liveGen, value: liveGenBest, live: true });
      } else if (liveGenBest > lastPoint.value) {
        lastPoint.value = liveGenBest;
        lastPoint.live = true;
      }
    }

    if (!points.length || points[0].generation > 0) {
      points.unshift({ generation: 0, value: 0 });
    }

    const padX = 10 * dpr;
    const padTop = 12 * dpr;
    const padBottom = 14 * dpr;
    const graphTop = 24 * dpr;
    const graphHeight = height - graphTop - padBottom;

    ctx.fillStyle = 'rgba(255, 241, 214, 0.7)';
    ctx.font = `${9 * dpr}px "JetBrains Mono", monospace`;
    ctx.textBaseline = 'top';
    ctx.fillText('BEST DISTANCE (GEN)', padX, padTop);

    if (points.length < 2) {
      ctx.fillStyle = 'rgba(255, 248, 220, 0.6)';
      ctx.font = `${11 * dpr}px "JetBrains Mono", monospace`;
      ctx.fillText('Awaiting turbo data', padX, graphTop + 18 * dpr);
      return;
    }

    const values = points.map(point => point.value).filter(Number.isFinite);
    const rawMax = values.length ? Math.max(...values) : 1;
    const maxVal = Math.max(1, rawMax * 1.12);
    const span = Math.max(1e-6, maxVal);
    const graphWidth = width - padX * 2;
    const maxGeneration = Math.max(1, ...points.map(point => point.generation));
    const toX = generation => padX + (Math.max(0, generation) / maxGeneration) * graphWidth;
    const toY = value => graphTop + graphHeight - (value / span) * graphHeight;

    const baselineY = toY(0);
    ctx.strokeStyle = 'rgba(255, 241, 214, 0.12)';
    ctx.lineWidth = 1 * dpr;
    ctx.beginPath();
    ctx.moveTo(padX, baselineY);
    ctx.lineTo(width - padX, baselineY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(toX(points[0].generation), baselineY);
    points.forEach(point => {
      ctx.lineTo(toX(point.generation), toY(point.value));
    });
    ctx.lineTo(toX(points[points.length - 1].generation), baselineY);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255, 0, 85, 0.16)';
    ctx.fill();

    ctx.beginPath();
    points.forEach((point, index) => {
      const x = toX(point.generation);
      const y = toY(point.value);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = '#ff4d7d';
    ctx.lineWidth = 2 * dpr;
    ctx.stroke();

    const lastPoint = points[points.length - 1];
    const lastX = toX(lastPoint.generation);
    const lastY = toY(lastPoint.value);
    ctx.beginPath();
    ctx.arc(lastX, lastY, 3 * dpr, 0, Math.PI * 2);
    ctx.fillStyle = lastPoint.live ? '#fde68a' : '#fff7dc';
    ctx.fill();

    ctx.fillStyle = '#fff7dc';
    ctx.font = `${15 * dpr}px "Rajdhani", "Inter", sans-serif`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(`${lastPoint.value.toFixed(2)}m`, width - padX, padTop - 2 * dpr);

    ctx.fillStyle = 'rgba(255, 241, 214, 0.62)';
    ctx.font = `${9 * dpr}px "JetBrains Mono", monospace`;
    ctx.textAlign = 'left';
    ctx.fillText('G0', padX, height - 11 * dpr);
    ctx.textAlign = 'right';
    ctx.fillText(`G${Math.max(0, lastPoint.generation || liveGen || 0)}`, width - padX, height - 11 * dpr);
  }

  function updateMobileTurboOverlay() {
    const wrap = document.getElementById('mobile-turbo-overlay');
    if (!wrap) return;

    const turboMode = sim.trainingMode === 'turbo' && !sim.sandboxMode;
    const show = isMobileRuntime() && getCurrentScreen() === 'sim' && getSimSessionStarted() && turboMode;
    wrap.classList.toggle('hidden', !show);
    if (!show) {
      lastTurboChartRenderAt = 0;
      lastTurboChartGeneration = -1;
      lastTurboChartHistoryLength = -1;
      return;
    }

    const statusRaw = String(sim.turboStatus || 'running').toLowerCase();
    const status = ['warming', 'running', 'fallback'].includes(statusRaw) ? statusRaw : 'running';
    const summary = sim.lastTurboGenerationSummary || null;
    const diagnostics = sim.lastTurboDiagnostics || null;

    const workerMs = Math.max(0, safeNumber(summary?.elapsedMs, safeNumber(diagnostics?.workerElapsedMs, 0)));
    let throughputX = safeNumber(diagnostics?.throughputX, 0);
    if (throughputX <= 0 && workerMs > 0) {
      throughputX = (safeNumber(sim.simDuration, 0) * 1000) / workerMs;
    }
    throughputX = Math.max(0, throughputX);

    const history = Array.isArray(sim.progressHistory) ? sim.progressHistory : [];
    const latestProgress = history.length ? history[history.length - 1] : null;
    const previousBest = history.length >= 2
      ? Math.max(0, safeNumber(history[history.length - 2]?.allBest, 0))
      : Math.max(0, safeNumber(sim.prevAllTimeBest, safeNumber(latestProgress?.allBest, safeNumber(sim.allTimeBest, 0))));
    const liveGenBest = Math.max(0, safeNumber(sim.genBestDist, 0));
    const completedGenBest = Math.max(0, safeNumber(latestProgress?.genBest, 0));
    const hasLiveGeneration = liveGenBest > 1e-6;
    const baselineBest = hasLiveGeneration
      ? Math.max(0, safeNumber(latestProgress?.allBest, safeNumber(sim.allTimeBest, 0)))
      : previousBest;
    const generationDistance = hasLiveGeneration ? liveGenBest : completedGenBest;
    const delta = generationDistance - baselineBest;

    wrap.classList.toggle('is-warming', status === 'warming');
    wrap.classList.toggle('is-running', status === 'running');
    wrap.classList.toggle('is-fallback', status === 'fallback');

    setText('mobile-turbo-status', status.toUpperCase());
    setText('mobile-turbo-throughput', `${throughputX.toFixed(1)}x`);
    setText('mobile-turbo-delta', `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}m`);

    const deltaEl = document.getElementById('mobile-turbo-delta');
    if (deltaEl) {
      deltaEl.classList.remove('delta-positive', 'delta-negative');
      if (delta > 0.05) deltaEl.classList.add('delta-positive');
      else if (delta < -0.05) deltaEl.classList.add('delta-negative');
    }
    onTurboOverlayRefresh?.();

    const now = performance.now();
    const historyLength = history.length;
    const generation = safeNumber(sim.generation, 0);
    const shouldRefreshChart =
      generation !== lastTurboChartGeneration
      || historyLength !== lastTurboChartHistoryLength
      || (now - lastTurboChartRenderAt) >= 240;

    if (shouldRefreshChart) {
      renderMobileTurboGenBestChart();
      onTurboChartRefresh?.();
      lastTurboChartRenderAt = now;
      lastTurboChartGeneration = generation;
      lastTurboChartHistoryLength = historyLength;
    }
  }

  function updateMobileSimTopHud() {
    const wrap = document.getElementById('mobile-sim-top-hud');
    if (!wrap) return;

    const show = isMobileRuntime() && getCurrentScreen() === 'sim';
    wrap.classList.toggle('hidden', !show);
    updateMobileTurboOverlay();
    if (!show) return;

    const leader = sim.visualLeader || (typeof sim.getLeader === 'function' ? sim.getLeader() : null);
    const leaderX = leader && typeof leader.getX === 'function' ? leader.getX() : safeNumber(leader?.x, NaN);
    const currentDist = Number.isFinite(leaderX)
      ? (typeof sim.distMetersContinuousFromX === 'function'
        ? sim.distMetersContinuousFromX(leaderX)
        : (typeof sim.distMetersFromX === 'function' ? sim.distMetersFromX(leaderX) : 0))
      : 0;
    const latestProgress = Array.isArray(sim.progressHistory) && sim.progressHistory.length
      ? sim.progressHistory[sim.progressHistory.length - 1]
      : null;
    const latestGenBest = safeNumber(latestProgress?.genBest, 0);
    const showingTurboGenBest = sim.trainingMode === 'turbo' && !sim.sandboxMode;
    const primaryDistance = showingTurboGenBest ? latestGenBest : currentDist;
    const allBest = Math.max(0, safeNumber(sim.allTimeBest, 0));
    const timeLeft = Math.max(0, safeNumber(sim.timer, 0));
    const elapsed = Math.max(0, safeNumber(sim.runElapsedSec, safeNumber(sim.simTimeElapsed, 0)));

    setText('mobile-hud-gen', String(Math.max(1, safeNumber(sim.generation, 1))));
    setText('mobile-hud-genbest', `${primaryDistance.toFixed(1)}m`);
    setText('mobile-hud-genbest-label', showingTurboGenBest ? 'Gen Best' : 'Current');
    setText('mobile-hud-allbest', `${allBest.toFixed(1)}m`);
    setText('mobile-hud-time', `${timeLeft.toFixed(1)}s`);
    setText('mobile-hud-elapsed', formatElapsed(elapsed));
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
    onSyncQuickControlState?.();
  }

  function closeMobileSheet() {
    const shell = document.getElementById('mobile-panel-shell');
    document.body.classList.remove(...MOBILE_SHEET_STATE_CLASSES);
    document.body.classList.remove('mobile-panel-controls', 'mobile-panel-top');
    if (shell) {
      shell.classList.add('hidden');
      shell.setAttribute('aria-hidden', 'true');
    }
    onSyncQuickControlState?.();
  }

  function createMobileControlModule(config) {
    const { id, title, advanced = false, defaultCollapsed = false } = config;
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

    const storageKey = `${storagePrefix}${id}.collapsed`;
    let collapsed = defaultCollapsed || !!advanced;
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
      setCollapsed(!root.classList.contains('collapsed'));
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
      { id: 'brains', title: 'Brains', defaultCollapsed: true },
      { id: 'simulation', title: 'Simulation' },
      { id: 'camera', title: 'Camera & Environment' },
      { id: 'physics', title: 'Physics', advanced: true },
      { id: 'evolution', title: 'Evolution' },
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
    const brainSection = document.getElementById('brain-library-section') || null;
    const zoomGroup = groupFor('inp-zoom');
    const turboGroup = groupFor('engine-normal');
    const turboPolicyGroup = groupFor('turbo-wall-off');
    const turboPolesGroup = groupFor('inp-turbo-poles');

    appendToModule('brains', brainSection);
    appendToModule('simulation', groupFor('ghosts-on'));
    if (actionRow) {
      actionRow.dataset.mobileModuleMoved = '1';
      actionRow.remove();
    }
    appendToModule('simulation', resetSettings);
    appendToModule('simulation', groupFor('inp-speed'));
    appendToModule('simulation', groupFor('inp-duration'));
    appendToModule('simulation', groupFor('inp-wall-speed'));
    appendToModule('simulation', groupFor('inp-wall-start'));

    appendToModule('camera', groupFor('cam-lock'));
    appendToModule('camera', groupFor('btn-ground-draw'));
    if (zoomGroup) {
      zoomGroup.dataset.mobileModuleMoved = '1';
      zoomGroup.remove();
    }

    appendToModule('evolution', groupFor('fitness-tag'));
    appendToModule('evolution', groupFor('inp-pop'));
    appendToModule('evolution', groupFor('inp-mut'));
    appendToModule('evolution', groupFor('inp-mutsize'));
    appendToModule('evolution', mutationInfo);
    appendToModule('evolution', groupFor('testing-off'));

    if (turboGroup) {
      turboGroup.dataset.mobileModuleMoved = '1';
      turboGroup.remove();
    }
    if (turboPolicyGroup) {
      turboPolicyGroup.dataset.mobileModuleMoved = '1';
      turboPolicyGroup.remove();
    }
    if (turboPolesGroup) {
      turboPolesGroup.dataset.mobileModuleMoved = '1';
      turboPolesGroup.remove();
    }

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

    Array.from(trainingSections.children)
      .filter(child => child !== moduleGrid)
      .forEach(node => appendToModule('debug', node));

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

  return {
    closeMobileSheet,
    ensureMobileSheetMounted,
    openMobileSheet,
    renderMobileTurboGenBestChart,
    setMobileSheetTab,
    updateMobileSimTopHud,
    updateMobileTurboOverlay
  };
}
