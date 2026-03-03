import { STORAGE_KEYS, CONFIG } from '../utils/config.js';
import { planck, SCALE } from '../sim/Physics.js';

/**
 * Right panel controls + bindings.
 */
export class Controls {
  constructor(sim) {
    this.sim = sim;
    this.els = {};
    this._diagSeries = [];
    this._diagSeriesLimit = 96;
    this._selectedMuscleIndex = 0;
    this._lastSparklineSampleAt = 0;
    this._liveUiIntervalId = null;
    this._cacheElements();
  }

  _cacheElements() {
    const ids = [
      'val-speed', 'val-duration', 'val-pop', 'val-strength',
      'val-jointspeed', 'val-joint', 'val-gravity', 'val-groundfric',
      'val-groundstatic', 'val-traction', 'val-bodyfric', 'val-bodystatic',
      'val-bodyair', 'val-musrange', 'val-musmooth', 'val-musminlen', 'val-musmaxlen',
      'val-musbudget', 'val-distreward',
      'val-speedreward', 'val-jitterpen', 'val-stabmode', 'val-mut',
      'val-mutsize', 'val-zoom', 'val-cam',
      'val-hidden', 'val-neurons', 'val-elites', 'val-tournament',
      'cam-lock', 'cam-free', 'icon-pause',
      'fitness-tag', 'fitness-speed', 'fitness-stability', 'fitness-upright',
      'val-spinpen', 'val-wall-speed', 'val-wall-start', 'val-viewmode', 'val-engine', 'turbo-status', 'val-turbo-wall-policy', 'val-turbo-poles',
      'testing-last-run', 'testing-health', 'testing-scope', 'testing-copy-compact', 'testing-copy-full',
      'neat-mode-badge', 'neat-species-count', 'neat-innovation-count', 'neat-champion-complexity', 'nn-control-hint',
      'dbg-intent-hz', 'dbg-osc-hz', 'dbg-delta-sec', 'dbg-micro-index', 'dbg-grounded-slip',
      'dbg-muscle-select', 'dbg-muscle-placeholder'
    ];
    ids.forEach(id => {
      this.els[id] = document.getElementById(id);
    });
  }

  bind(callbacks) {
    const { onPause, onReset, onEdit, onStartDraw, onBack, onRun, onStartSim, onResetSettings } = callbacks;
    const notifyCameraChanged = () => {
      if (callbacks.onCameraChanged) callbacks.onCameraChanged();
    };

    // Screen nav
    const btnStartDraw = document.getElementById('btn-start-draw');
    if (btnStartDraw) btnStartDraw.onclick = onStartDraw;
    const btnBack = document.getElementById('btn-back');
    if (btnBack) btnBack.onclick = onBack;
    const btnRun = document.getElementById('btn-run');
    if (btnRun) btnRun.onclick = onRun;

    // Sim controls
    const btnPause = document.getElementById('btn-pause');
    if (btnPause) btnPause.onclick = onPause;
    const btnStartSim = document.getElementById('btn-start-sim');
    if (btnStartSim) btnStartSim.onclick = onStartSim;
    const btnReset = document.getElementById('btn-reset');
    if (btnReset) btnReset.onclick = onReset;
    const btnEdit = document.getElementById('btn-edit');
    if (btnEdit) btnEdit.onclick = onEdit;
    const btnResetSettings = document.getElementById('btn-reset-settings');
    if (btnResetSettings) {
      btnResetSettings.onclick = () => {
        this.resetToDefaults();
        if (onResetSettings) onResetSettings();
      };
    }

    const ghostsOn = document.getElementById('ghosts-on');
    const ghostsOff = document.getElementById('ghosts-off');
    const updateGhostsUI = () => {
      if (ghostsOn) ghostsOn.classList.toggle('active', this.sim.showGhosts);
      if (ghostsOff) ghostsOff.classList.toggle('active', !this.sim.showGhosts);
    };
    if (ghostsOn) {
      ghostsOn.onclick = () => {
        this.sim.showGhosts = true;
        updateGhostsUI();
      };
    }
    if (ghostsOff) {
      ghostsOff.onclick = () => {
        this.sim.showGhosts = false;
        updateGhostsUI();
      };
    }
    updateGhostsUI();

    // Sliders
    this._bindSlider('inp-speed', v => { this.sim.simSpeed = v; });
    this._bindSlider('inp-wall-speed', v => { this.sim.deathWallSpeedMps = v / 100; });
    this._bindSlider('inp-wall-start', v => {
      this.sim.deathWallStartBehindMeters = Math.max(0, v);
      if (this.sim.resetDeathWall) this.sim.resetDeathWall();
    }, true);
    this._bindSlider('inp-turbo-poles', v => {
      if (this.sim.setTurboGenPoleCount) this.sim.setTurboGenPoleCount(v);
      else this.sim.turboGenPoleCount = Math.max(1, Math.min(20, Math.round(v)));
    });
    this._bindSlider('inp-zoom', v => { this.sim.zoom = v / 100; });
    this._bindSlider('inp-duration', v => {
      this.sim.simDuration = v;
      this.sim.timer = Math.min(this.sim.timer, v);
    });
    this._bindSlider('inp-pop', v => { this.sim.popSize = v; });
    this._bindSlider('inp-strength', v => {
      const base = CONFIG.defaultMuscleStrength || 1;
      this.sim.muscleStrength = (v / 100) * base;
      this.sim.creatures.forEach(c => { c.simConfig.muscleStrength = this.sim.muscleStrength; });
    });
    this._bindSlider('inp-gravity', v => {
      this.sim.gravity = v;
      if (this.sim.world) this.sim.world.setGravity(planck.Vec2(0, v));
    }, true);
    this._bindSlider('inp-groundfric', v => {
      this.sim.groundFriction = v / 100;
    });
    this._bindSlider('inp-musrange', v => {
      this.sim.muscleRange = v / 100;
      this.sim.creatures.forEach(c => { c.simConfig.muscleRange = this.sim.muscleRange; });
    });
    this._bindSlider('inp-musminlen', v => {
      this.sim.muscleMinLength = v / 100;
      this.sim.syncCreatureRuntimeSettings();
    });
    this._bindSlider('inp-musmaxlen', v => {
      this.sim.muscleMaxLength = v / 100;
      this.sim.syncCreatureRuntimeSettings();
    });
    this._bindSlider('inp-musmooth', v => {
      // Slider 10-100 maps to smoothing 0.010-0.100 (1.0%-10.0% display)
      const val = v / 1000;
      this.sim.muscleSmoothing = val;
      // Couple rate limit to muscle speed so the control has visible effect.
      // Keep a floor for stability and cap to avoid snap impulses.
      this.sim.muscleSignalRateLimit = Math.max(0.01, Math.min(0.35, val * 3));
      if (this.sim.creatures) {
        this.sim.creatures.forEach(c => {
          c.simConfig.muscleSmoothing = val;
          c.simConfig.muscleSignalRateLimit = this.sim.muscleSignalRateLimit;
        });
      }
    });
    this._bindSlider('inp-musbudget', v => {
      this.sim.muscleActionBudget = v;
      this.sim.syncCreatureRuntimeSettings();
    });
    this._bindSlider('inp-distreward', v => { this.sim.distanceRewardWeight = v; });
    this._bindSlider('inp-speedreward', v => { this.sim.speedRewardWeight = v / 100; });
    this._bindSlider('inp-jitterpen', v => { this.sim.jitterPenaltyWeight = v; });
    this._bindSlider('inp-spinpen', v => { this.sim.spinPenaltyWeight = v; });
    this._bindSlider('inp-mut', v => { this.sim.mutationRate = v / 100; });
    this._bindSlider('inp-mutsize', v => { this.sim.mutationSize = v / 100; });

    // Stability reward toggle
    const stabOn = document.getElementById('stab-on');
    const stabOff = document.getElementById('stab-off');
    if (stabOn) stabOn.onclick = () => {
      this.sim.rewardStability = true;
      this._updateStabilityMode();
      this.updateLabels();
    };
    if (stabOff) stabOff.onclick = () => {
      this.sim.rewardStability = false;
      this._updateStabilityMode();
      this.updateLabels();
    };

    // Camera buttons
    const camLock = document.getElementById('cam-lock');
    const camFree = document.getElementById('cam-free');
    const camReset = document.getElementById('cam-reset');
    if (camLock) camLock.onclick = () => {
      this.setCameraMode('lock');
      notifyCameraChanged();
    };
    if (camFree) camFree.onclick = () => {
      this.setCameraMode('free');
      notifyCameraChanged();
    };
    if (camReset) camReset.onclick = () => {
      this.sim.cameraX = 0;
      this.sim.cameraY = 0;
      this.setCameraMode('lock');
      notifyCameraChanged();
    };

    // Replay buttons
    const replayPrev = document.getElementById('replay-prev');
    const replayNext = document.getElementById('replay-next');
    const replayPlay = document.getElementById('replay-play');
    if (replayPrev) replayPrev.onclick = () => this.setReplayIndex(this.sim.replayIndex - 1);
    if (replayNext) replayNext.onclick = () => this.setReplayIndex(this.sim.replayIndex + 1);
    if (replayPlay) replayPlay.onclick = () => this.toggleReplayPlay();

    const viewTrainingBtn = document.getElementById('view-training');
    if (viewTrainingBtn) viewTrainingBtn.onclick = () => this.setViewMode('training');

    const engineNormalBtn = document.getElementById('engine-normal');
    const engineTurboBtn = document.getElementById('engine-turbo');
    if (engineNormalBtn) engineNormalBtn.onclick = () => this.setTrainingMode('normal');
    if (engineTurboBtn) engineTurboBtn.onclick = () => this.setTrainingMode('turbo');
    const turboWallOffBtn = document.getElementById('turbo-wall-off');
    const turboWallSoftBtn = document.getElementById('turbo-wall-soft');
    const turboWallFullBtn = document.getElementById('turbo-wall-full');
    if (turboWallOffBtn) turboWallOffBtn.onclick = () => this.setTurboWallPolicy('off');
    if (turboWallSoftBtn) turboWallSoftBtn.onclick = () => this.setTurboWallPolicy('soft');
    if (turboWallFullBtn) turboWallFullBtn.onclick = () => this.setTurboWallPolicy('full');
    const testingOffBtn = document.getElementById('testing-off');
    const testingOnBtn = document.getElementById('testing-on');
    if (testingOffBtn) testingOffBtn.onclick = () => this.setTestingMode(false);
    if (testingOnBtn) testingOnBtn.onclick = () => this.setTestingMode(true);
    const copyCompactBtn = document.getElementById('testing-copy-compact');
    const copyFullBtn = document.getElementById('testing-copy-full');
    const bindCopyButton = (btn, mode) => {
      if (!btn) return;
      btn.onclick = async () => {
        const payload = mode === 'compact'
          ? (this.sim.getDiagnosticsClipboardTextCompact ? this.sim.getDiagnosticsClipboardTextCompact() : '')
          : (this.sim.getDiagnosticsClipboardTextFull ? this.sim.getDiagnosticsClipboardTextFull() : '');
        if (!payload) return;
        const original = btn.innerHTML;
        try {
          await navigator.clipboard.writeText(payload);
          btn.innerHTML = '<i class="fas fa-check mr-1"></i>Copied';
        } catch {
          btn.innerHTML = '<i class="fas fa-triangle-exclamation mr-1"></i>Copy Failed';
        }
        setTimeout(() => { btn.innerHTML = original; }, 1800);
      };
    };
    bindCopyButton(copyCompactBtn, 'compact');
    bindCopyButton(copyFullBtn, 'full');

    const neatModeBadge = this.els['neat-mode-badge'];
    if (neatModeBadge) {
      neatModeBadge.style.cursor = 'pointer';
      neatModeBadge.title = 'Click to toggle NEAT / Dense fallback runtime';
      neatModeBadge.onclick = () => {
        const next = this._isNeatMode() ? 'legacy' : 'neat';
        if (this.sim.setTrainingAlgorithm) this.sim.setTrainingAlgorithm(next);
        this.updateLabels();
      };
    }

    const dbgMuscleSelect = this.els['dbg-muscle-select'];
    if (dbgMuscleSelect) {
      dbgMuscleSelect.onchange = (e) => {
        const nextIndex = parseInt(e?.target?.value ?? '0', 10);
        this._selectedMuscleIndex = Number.isFinite(nextIndex) ? Math.max(0, nextIndex) : 0;
        this._diagSeries = [];
      };
    }

    // Panning
    const world = document.getElementById('world');
    if (world) {
      world.addEventListener('mousedown', e => {
        if (this.sim.cameraMode !== 'free') return;
        this.sim.panning = true;
        this.sim.panX = e.clientX;
        this.sim.panY = e.clientY;
      });
      world.addEventListener('wheel', e => {
        const rect = world.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;

        // In free mode, hold Shift for horizontal pan and Alt for vertical pan.
        if (this.sim.cameraMode === 'free' && e.shiftKey) {
          this.sim.cameraX += e.deltaY * 0.28 / this.sim.zoom;
          notifyCameraChanged();
          e.preventDefault();
          return;
        }
        if (this.sim.cameraMode === 'free' && e.altKey) {
          this.sim.cameraY += e.deltaY * 0.28 / this.sim.zoom;
          notifyCameraChanged();
          e.preventDefault();
          return;
        }

        // Smooth zoom around cursor so touchpad scrolling is less jumpy.
        const worldX = sx / this.sim.zoom + this.sim.cameraX;
        const worldY = sy / this.sim.zoom + this.sim.cameraY;
        const delta = Math.max(-120, Math.min(120, e.deltaY));
        const nextZoom = Math.max(0.35, Math.min(2.5, this.sim.zoom * Math.exp(-delta * 0.0015)));
        this.sim.cameraX = worldX - sx / nextZoom;
        this.sim.cameraY = worldY - sy / nextZoom;
        this.sim.zoom = nextZoom;
        const zoomSlider = document.getElementById('inp-zoom');
        if (zoomSlider) zoomSlider.value = String(Math.round(this.sim.zoom * 100));
        this.updateLabels();
        notifyCameraChanged();
        e.preventDefault();
      }, { passive: false });
    }

    window.addEventListener('mousemove', e => {
      if (!this.sim.panning || this.sim.cameraMode !== 'free') return;
      const dx = e.clientX - this.sim.panX;
      const dy = e.clientY - this.sim.panY;
      this.sim.panX = e.clientX;
      this.sim.panY = e.clientY;
      this.sim.cameraX -= dx / this.sim.zoom;
      this.sim.cameraY -= dy / this.sim.zoom;
      notifyCameraChanged();
    });
    window.addEventListener('mouseup', () => { this.sim.panning = false; });

    // Keyboard shortcuts
    window.addEventListener('keydown', e => {
      if (e.key === '+' || e.key === '=') {
        const cx = window.innerWidth * 0.5;
        const cy = window.innerHeight * 0.5;
        const wx = cx / this.sim.zoom + this.sim.cameraX;
        const wy = cy / this.sim.zoom + this.sim.cameraY;
        this.sim.zoom = Math.min(2.5, this.sim.zoom + 0.08);
        this.sim.cameraX = wx - cx / this.sim.zoom;
        this.sim.cameraY = wy - cy / this.sim.zoom;
        const zoomSlider = document.getElementById('inp-zoom');
        if (zoomSlider) zoomSlider.value = String(Math.round(this.sim.zoom * 100));
        this.updateLabels();
        notifyCameraChanged();
      }
      if (e.key === '-' || e.key === '_') {
        const cx = window.innerWidth * 0.5;
        const cy = window.innerHeight * 0.5;
        const wx = cx / this.sim.zoom + this.sim.cameraX;
        const wy = cy / this.sim.zoom + this.sim.cameraY;
        this.sim.zoom = Math.max(0.35, this.sim.zoom - 0.08);
        this.sim.cameraX = wx - cx / this.sim.zoom;
        this.sim.cameraY = wy - cy / this.sim.zoom;
        const zoomSlider = document.getElementById('inp-zoom');
        if (zoomSlider) zoomSlider.value = String(Math.round(this.sim.zoom * 100));
        this.updateLabels();
        notifyCameraChanged();
      }
      if (this.sim.cameraMode === 'free' && e.key === 'ArrowUp') {
        this.sim.cameraY -= 30 / this.sim.zoom;
        notifyCameraChanged();
      }
      if (this.sim.cameraMode === 'free' && e.key === 'ArrowDown') {
        this.sim.cameraY += 30 / this.sim.zoom;
        notifyCameraChanged();
      }
      if (this.sim.cameraMode === 'free' && e.key === 'ArrowLeft') {
        this.sim.cameraX -= 30 / this.sim.zoom;
        notifyCameraChanged();
      }
      if (this.sim.cameraMode === 'free' && e.key === 'ArrowRight') {
        this.sim.cameraX += 30 / this.sim.zoom;
        notifyCameraChanged();
      }
      if (e.code === 'Space' && callbacks.isSimScreen && callbacks.isSimScreen()) {
        onPause();
      }
    });

    // Edge drawer tabs
    document.querySelectorAll('.edge-tab').forEach(btn => {
      const targetId = btn.getAttribute('data-target');
      if (targetId) {
        const saved = localStorage.getItem(`${STORAGE_KEYS.modulePrefix}${targetId}`);
        const shouldShow = saved === null ? true : saved === '1';
        const panel = document.getElementById(targetId);
        if (panel) panel.classList.toggle('module-hidden', !shouldShow);
        btn.classList.toggle('active', shouldShow);
      }

      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-target');
        if (!id) return;
        const panel = document.getElementById(id);
        if (!panel) return;
        panel.classList.toggle('module-hidden');
        const shown = !panel.classList.contains('module-hidden');
        btn.classList.toggle('active', shown);
        localStorage.setItem(`${STORAGE_KEYS.modulePrefix}${id}`, shown ? '1' : '0');
      });
    });

    // Ensure slider thumbs reflect current runtime values on first bind.
    const musmooth = document.getElementById('inp-musmooth');
    if (musmooth) musmooth.value = String(Math.round(this.sim.muscleSmoothing * 1000));
    const musbudget = document.getElementById('inp-musbudget');
    if (musbudget) musbudget.value = String(Math.round(this.sim.muscleActionBudget));
    const wallSpeed = document.getElementById('inp-wall-speed');
    if (wallSpeed) wallSpeed.value = String(Math.round(this.sim.deathWallSpeedMps * 100));
    const wallStart = document.getElementById('inp-wall-start');
    if (wallStart) wallStart.value = String(this.sim.deathWallStartBehindMeters.toFixed(1));
    const turboPoles = document.getElementById('inp-turbo-poles');
    if (turboPoles) turboPoles.value = String(Math.max(1, Math.min(20, Math.round(this.sim.turboGenPoleCount || 5))));

    this.setCameraMode('lock');
    this.setViewMode(this.sim.viewMode || 'training');
    this.setTrainingMode(this.sim.trainingMode || 'normal');
    this.setTurboWallPolicy(this.sim.turboWallPolicy || 'full');
    this.setTestingMode(this.sim.testingModeEnabled || false);
    this._updateStabilityMode();
    this._updateAlgorithmModeUI();
    this.updateLabels();
    if (!this._liveUiIntervalId) {
      this._liveUiIntervalId = window.setInterval(() => this.updateLabels(), 140);
    }
    this.setReplayIndex(-1);
    this.toggleReplayPlay(false);
  }

  _bindSlider(id, setter, isFloat = false) {
    const el = document.getElementById(id);
    if (!el) return;
    el.oninput = e => {
      const v = isFloat ? parseFloat(e.target.value) : parseInt(e.target.value, 10);
      setter(v);
      this.updateLabels();
    };
  }

  setCameraMode(mode) {
    this.sim.panning = false;
    this.sim.cameraMode = mode;
    const camLock = document.getElementById('cam-lock');
    const camFree = document.getElementById('cam-free');
    if (camLock) camLock.classList.toggle('active', mode === 'lock');
    if (camFree) camFree.classList.toggle('active', mode === 'free');
    if (this.els['val-cam']) this.els['val-cam'].textContent = mode.toUpperCase();
  }

  setViewMode(mode) {
    if (this.sim.setViewMode) this.sim.setViewMode('training');
    const viewTraining = document.getElementById('view-training');
    if (viewTraining) viewTraining.classList.toggle('active', this.sim.viewMode === 'training');
    if (this.els['val-viewmode']) {
      this.els['val-viewmode'].textContent = 'TRAINING';
    }
    this.updateLabels();
  }

  setTrainingMode(mode) {
    if (this.sim.setTrainingMode) this.sim.setTrainingMode(mode);
    const engineNormal = document.getElementById('engine-normal');
    const engineTurbo = document.getElementById('engine-turbo');
    if (engineNormal) engineNormal.classList.toggle('active', this.sim.trainingMode === 'normal');
    if (engineTurbo) engineTurbo.classList.toggle('active', this.sim.trainingMode === 'turbo');
    if (this.els['val-engine']) {
      this.els['val-engine'].textContent = this.sim.trainingMode === 'turbo' ? 'ON' : 'OFF';
    }
    this.updateLabels();
  }

  setTurboWallPolicy(policy) {
    if (this.sim.setTurboWallPolicy) this.sim.setTurboWallPolicy(policy);
    const off = document.getElementById('turbo-wall-off');
    const soft = document.getElementById('turbo-wall-soft');
    const full = document.getElementById('turbo-wall-full');
    if (off) off.classList.toggle('active', this.sim.turboWallPolicy === 'off');
    if (soft) soft.classList.toggle('active', this.sim.turboWallPolicy === 'soft');
    if (full) full.classList.toggle('active', this.sim.turboWallPolicy === 'full');
    this.updateLabels();
  }

  setTestingMode(on) {
    if (this.sim.setTestingMode) this.sim.setTestingMode(on);
    const offBtn = document.getElementById('testing-off');
    const onBtn = document.getElementById('testing-on');
    if (offBtn) offBtn.classList.toggle('active', !this.sim.testingModeEnabled);
    if (onBtn) onBtn.classList.toggle('active', !!this.sim.testingModeEnabled);
    this.updateLabels();
  }

  setReplayIndex(index) {
    if (!this.sim.replayHistory.length) {
      this.sim.replayIndex = -1;
      this.sim.replayCursor = 0;
      if (this.els['replay-label']) this.els['replay-label'].textContent = 'G-';
      return;
    }
    const clamped = Math.max(0, Math.min(this.sim.replayHistory.length - 1, index));
    this.sim.replayIndex = clamped;
    this.sim.replayCursor = 0;
    const item = this.sim.replayHistory[clamped];
    if (this.els['replay-label']) {
      this.els['replay-label'].textContent = `G${item.generation} ${item.distance}m`;
    }
  }

  _updateStabilityMode() {
    const stabOn = document.getElementById('stab-on');
    const stabOff = document.getElementById('stab-off');
    if (stabOn) stabOn.classList.toggle('active', this.sim.rewardStability);
    if (stabOff) stabOff.classList.toggle('active', !this.sim.rewardStability);
    if (this.els['val-stabmode']) this.els['val-stabmode'].textContent = this.sim.rewardStability ? 'ON' : 'OFF';
  }

  _isNeatMode() {
    return String(this.sim.trainingAlgorithm || '').toLowerCase() === 'neat';
  }

  _updateAlgorithmModeUI() {
    const neatMode = this._isNeatMode();
    const legacyControls = document.getElementById('legacy-nn-controls');
    if (legacyControls) legacyControls.classList.toggle('readonly', neatMode);
    if (this.els['neat-mode-badge']) this.els['neat-mode-badge'].textContent = neatMode ? 'ACTIVE' : 'LEGACY';
    if (this.els['nn-control-hint']) this.els['nn-control-hint'].textContent = neatMode ? 'NEAT controls topology' : 'Manual (legacy)';
    ['inp-hidden', 'inp-neurons', 'inp-elites', 'inp-tournament'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.disabled = neatMode;
      el.setAttribute('aria-disabled', neatMode ? 'true' : 'false');
    });
  }

  toggleReplayPlay(forceValue = null) {
    if (!this.sim.replayHistory.length) {
      this.sim.replayPlaying = false;
    } else if (typeof forceValue === 'boolean') {
      this.sim.replayPlaying = forceValue;
    } else {
      this.sim.replayPlaying = !this.sim.replayPlaying;
    }
    if (this.els['replay-play-icon']) {
      this.els['replay-play-icon'].className = this.sim.replayPlaying ? 'fas fa-pause' : 'fas fa-play';
    }
  }

  _readFiniteNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  _firstFinite(values, fallback = 0) {
    for (let i = 0; i < values.length; i++) {
      const n = Number(values[i]);
      if (Number.isFinite(n)) return n;
    }
    return fallback;
  }

  _getActuationMetrics() {
    const s = this.sim;
    const leader = s.visualLeader || (s.getLeader ? s.getLeader() : null);
    const leaderFitness = leader?.getFitnessSnapshot ? leader.getFitnessSnapshot() : null;
    const turbo = s.lastTurboDiagnostics || null;
    const progressTail = Array.isArray(s.progressHistory) && s.progressHistory.length
      ? s.progressHistory[s.progressHistory.length - 1]
      : null;
    const progressDiagnostics = progressTail?.diagnostics || null;
    return {
      intentUpdateHz: this._firstFinite([leaderFitness?.intentUpdateHz, turbo?.intentUpdateHz, progressDiagnostics?.intentUpdateHz], 0),
      commandOscillationHz: this._firstFinite([leaderFitness?.commandOscillationHz, turbo?.commandOscillationHz, progressDiagnostics?.commandOscillationHz], 0),
      avgCommandDeltaPerSec: this._firstFinite([leaderFitness?.avgCommandDeltaPerSec, turbo?.avgCommandDeltaPerSec, progressDiagnostics?.avgCommandDeltaPerSec], 0),
      microActuationIndex: this._firstFinite([leaderFitness?.microActuationIndex, turbo?.microActuationIndex, progressDiagnostics?.microActuationIndex], 0),
      slipWhileGrounded: this._firstFinite([leaderFitness?.slipWhileGrounded, leaderFitness?.groundSlipRate, leaderFitness?.groundSlip, turbo?.slipWhileGrounded, turbo?.groundSlip, progressDiagnostics?.slipWhileGrounded], 0)
    };
  }

  _syncMuscleSelect(leader) {
    const select = this.els['dbg-muscle-select'];
    if (!select) return;
    const count = Array.isArray(leader?.muscles) ? leader.muscles.length : 0;
    if (!count) {
      select.innerHTML = '<option value="0">No muscles</option>';
      select.value = '0';
      this._selectedMuscleIndex = 0;
      return;
    }
    const desired = Math.max(0, Math.min(count - 1, this._selectedMuscleIndex));
    if (select.options.length !== count) {
      select.innerHTML = '';
      for (let i = 0; i < count; i++) {
        const opt = document.createElement('option');
        opt.value = String(i);
        opt.textContent = `Muscle ${i + 1}`;
        select.appendChild(opt);
      }
    }
    if (select.value !== String(desired)) select.value = String(desired);
    this._selectedMuscleIndex = desired;
  }

  _sampleSelectedMuscle(leader) {
    const placeholder = this.els['dbg-muscle-placeholder'];
    const canvas = document.getElementById('dbg-muscle-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    this._syncMuscleSelect(leader);
    const muscles = Array.isArray(leader?.muscles) ? leader.muscles : null;
    const muscle = muscles?.[this._selectedMuscleIndex];

    if (!muscle) {
      this._diagSeries = [];
      this._drawActuationSparkline(ctx, canvas, []);
      if (placeholder) placeholder.textContent = 'Waiting for muscle diagnostics...';
      return;
    }

    const now = performance.now();
    if ((now - this._lastSparklineSampleAt) >= 50 || this._diagSeries.length === 0) {
      const phaseLockEnabled = leader?.simConfig?.phaseLockEnabled !== false;
      const phaseBase = this._readFiniteNumber(leader?.gaitPhase, 0);
      const phaseGroup = this._readFiniteNumber(muscle.phaseGroup, 0);
      const carrierRaw = Number.isFinite(Number(muscle.carrier))
        ? Number(muscle.carrier)
        : (phaseLockEnabled ? Math.sin(phaseBase + phaseGroup) : 1);
      this._diagSeries.push({
        intent: this._readFiniteNumber(muscle.intent, 0),
        carrier: this._readFiniteNumber(carrierRaw, 0),
        command: this._readFiniteNumber(muscle.command, 0)
      });
      if (this._diagSeries.length > this._diagSeriesLimit) {
        this._diagSeries.splice(0, this._diagSeries.length - this._diagSeriesLimit);
      }
      this._lastSparklineSampleAt = now;
    }

    this._drawActuationSparkline(ctx, canvas, this._diagSeries);
    if (placeholder) {
      placeholder.textContent = this._diagSeries.length > 1
        ? `Tracking Muscle ${this._selectedMuscleIndex + 1}`
        : 'Collecting samples...';
    }
  }

  _drawActuationSparkline(ctx, canvas, series) {
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(5, 8, 16, 0.9)';
    ctx.fillRect(0, 0, w, h);

    const padX = 4;
    const padY = 6;
    const midY = h * 0.5;
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padX, midY);
    ctx.lineTo(w - padX, midY);
    ctx.stroke();

    if (!Array.isArray(series) || series.length < 2) {
      ctx.fillStyle = 'rgba(148,163,184,0.65)';
      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('No sparkline data yet', w * 0.5, h * 0.5 + 4);
      ctx.textAlign = 'left';
      return;
    }

    const toX = (i) => padX + (i / Math.max(1, series.length - 1)) * (w - padX * 2);
    const toY = (v) => {
      const clamped = Math.max(-1, Math.min(1, this._readFiniteNumber(v, 0)));
      return padY + (1 - (clamped + 1) * 0.5) * (h - padY * 2);
    };

    const drawChannel = (key, color, alphaFill = null) => {
      if (alphaFill) {
        ctx.beginPath();
        ctx.moveTo(toX(0), h - padY);
        for (let i = 0; i < series.length; i++) ctx.lineTo(toX(i), toY(series[i][key]));
        ctx.lineTo(toX(series.length - 1), h - padY);
        ctx.closePath();
        ctx.fillStyle = alphaFill;
        ctx.fill();
      }

      ctx.beginPath();
      for (let i = 0; i < series.length; i++) {
        const x = toX(i);
        const y = toY(series[i][key]);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.25;
      ctx.stroke();
    };

    drawChannel('carrier', '#fbbf24');
    drawChannel('intent', '#7dd3fc');
    drawChannel('command', '#34d399', 'rgba(52, 211, 153, 0.10)');
  }

  updateLabels() {
    const s = this.sim;
    const set = (id, val) => { if (this.els[id]) this.els[id].textContent = val; };
    const neatMode = this._isNeatMode();
    this._updateAlgorithmModeUI();
    set('val-speed', `${s.simSpeed}x`);
    set('val-wall-speed', `${s.deathWallSpeedMps.toFixed(2)} m/s`);
    set('val-wall-start', `${s.deathWallStartBehindMeters.toFixed(1)} m behind`);
    set('val-duration', `${s.simDuration}s`);
    set('val-pop', `${s.popSize}`);
    const baseStrength = CONFIG.defaultMuscleStrength || 1;
    set('val-strength', `${Math.round((s.muscleStrength / baseStrength) * 100)}%`);
    set('val-gravity', s.gravity.toFixed(2));
    set('val-groundfric', `${s.groundFriction.toFixed(2)}`);
    set('val-musrange', `${Math.round(s.muscleRange * 100)}%`);
    set('val-musminlen', `${Math.round((s.muscleMinLength ?? 0.8) * 100)}%`);
    set('val-musmaxlen', `${Math.round((s.muscleMaxLength ?? 1.1) * 100)}%`);
    set('val-musmooth', `${(s.muscleSmoothing * 100).toFixed(2)}%`);
    set('val-musbudget', `${Math.round(s.muscleActionBudget)}f (${(s.muscleActionBudget / 60).toFixed(2)}s)`);
    set('val-mut', `${Math.round(s.mutationRate * 100)}%`);
    set('val-mutsize', `${s.mutationSize.toFixed(2)}x`);
    if (neatMode) {
      set('val-hidden', 'AUTO');
      set('val-neurons', 'AUTO');
      set('val-elites', 'N/A');
      set('val-tournament', 'N/A');
    } else {
      set('val-hidden', `${Math.round(s.hiddenLayers || 0)}`);
      set('val-neurons', `${Math.round(s.neuronsPerLayer || 0)}`);
      set('val-elites', `${Math.round(s.eliteCount || 0)}`);
      set('val-tournament', `${Math.round(s.tournamentSize || 0)}`);
    }
    set('val-zoom', `${s.zoom.toFixed(2)}x`);
    set('val-viewmode', 'TRAINING');
    set('val-engine', s.trainingMode === 'turbo' ? 'ON' : 'OFF');
    set('turbo-status', (s.turboStatus || 'idle').toUpperCase());
    set('val-turbo-wall-policy', (s.turboWallPolicy || 'full').toUpperCase());
    set('val-turbo-poles', `${Math.max(1, Math.min(20, Math.round(s.turboGenPoleCount || 5)))}`);
    const testSnapshot = s.getTurboTestSnapshot ? s.getTurboTestSnapshot() : null;
    set('testing-scope', 'Turbo Verification');
    if (testSnapshot?.last) {
      const reasons = Array.isArray(testSnapshot.last.reasons) && testSnapshot.last.reasons.length
        ? ` • ${testSnapshot.last.reasons[0]}`
        : '';
      const turboX = Number.isFinite(testSnapshot.last.throughputX)
        ? ` • ${testSnapshot.last.throughputX.toFixed(2)}x`
        : '';
      set('testing-last-run', `G${testSnapshot.last.generation} • ${testSnapshot.last.status.toUpperCase()}${turboX}${reasons}`);
    } else {
      set('testing-last-run', 'Waiting for cycle...');
    }
    set('testing-health', (s.testingStatus || 'idle').toUpperCase());
    const healthEl = this.els['testing-health'];
    if (healthEl) {
      const status = (s.testingStatus || 'idle').toLowerCase();
      healthEl.style.color = status === 'pass'
        ? '#22c55e'
        : (status === 'warn' ? '#fbbf24' : (status === 'fail' ? '#f87171' : '#67e8f9'));
    }
    
    // Update NN architecture display
    const leader = s.visualLeader || (s.getLeader ? s.getLeader() : null);
    if (leader && leader.brain) {
      if (leader.controllerType === 'neat') {
        const nodes = Number(leader?.genome?.nodes?.size) || Number(leader?.architecture?.neatNodeCount) || 0;
        const conns = Number(leader?.genome?.connections?.size) || Number(leader?.architecture?.neatConnCount) || 0;
        set('val-nn-arch', `NEAT N${nodes}/C${conns}`);
      } else {
        const layers = leader.brain.layerSizes;
        const archText = `${layers.length - 2}h × ${layers[1]}n`;
        set('val-nn-arch', archText);
      }
    }

    const neatStatus = s.neatStatus || (s.progressHistory?.length ? s.progressHistory[s.progressHistory.length - 1]?.neatStatus : null) || {};
    const speciesCount = Number.isFinite(neatStatus?.speciesCount)
      ? neatStatus.speciesCount
      : (Number.isFinite(s.neatSpeciesCount) ? s.neatSpeciesCount : '--');
    const innovationCount = Number.isFinite(neatStatus?.innovationCount)
      ? neatStatus.innovationCount
      : (Number.isFinite(s.neatInnovationCount) ? s.neatInnovationCount : '--');
    const champComplexity = neatStatus?.championComplexity
      ? `N${neatStatus.championComplexity.nodes} W${neatStatus.championComplexity.connections}`
      : (leader?.controllerType === 'neat'
        ? `N${Number(leader?.genome?.nodes?.size) || 0} W${Number(leader?.genome?.connections?.size) || 0}`
        : (leader?.brain?.layerSizes
          ? `N${leader.brain.layerSizes.reduce((sum, width) => sum + width, 0)} W${leader.brain.getWeightCount()}`
          : '--'));
    set('neat-species-count', String(speciesCount));
    set('neat-innovation-count', String(innovationCount));
    set('neat-champion-complexity', champComplexity);
    const actuation = this._getActuationMetrics();
    set('dbg-intent-hz', `${actuation.intentUpdateHz.toFixed(2)} Hz`);
    set('dbg-osc-hz', `${actuation.commandOscillationHz.toFixed(2)} Hz`);
    set('dbg-delta-sec', `${actuation.avgCommandDeltaPerSec.toFixed(2)}`);
    set('dbg-micro-index', `${actuation.microActuationIndex.toFixed(2)}`);
    set('dbg-grounded-slip', `${actuation.slipWhileGrounded.toFixed(2)}`);
    this._sampleSelectedMuscle(leader);
  }

  updateFitnessPanel(fitness, creature) {
    const f = fitness || { speed: 0, groundSlip: 0, actuationLevel: 0 };
    const speedMps = Number.isFinite(f.speed) ? (f.speed / SCALE) : 0;
    if (this.els['fitness-speed']) this.els['fitness-speed'].textContent = `${speedMps.toFixed(2)} m/s`;
    const slip = Number.isFinite(f.groundSlipRate) ? f.groundSlipRate : (f.groundSlip || 0);
    if (this.els['fitness-stability']) this.els['fitness-stability'].textContent = slip.toFixed(2);

    if (this.els['fitness-upright']) this.els['fitness-upright'].textContent = `${((f.actuationLevel || 0) * 100).toFixed(0)}%`;
  }

  resetToDefaults() {
    const s = this.sim;
    s.simSpeed = CONFIG.defaultSimSpeed;
    s.simDuration = CONFIG.defaultSimDuration;
    s.popSize = CONFIG.defaultPopSize;
    s.gravity = CONFIG.defaultGravity;
    s.muscleStrength = CONFIG.defaultMuscleStrength;
    s.groundFriction = CONFIG.defaultGroundFriction;
    s.muscleRange = CONFIG.defaultMuscleRange;
    s.muscleMinLength = CONFIG.defaultMuscleMinLength;
    s.muscleMaxLength = CONFIG.defaultMuscleMaxLength;
    s.muscleSmoothing = CONFIG.defaultMuscleSmoothing;
    s.muscleSignalRateLimit = CONFIG.defaultMuscleSignalRateLimit;
    s.muscleActionBudget = CONFIG.defaultMuscleActionBudget;
    s.mutationRate = CONFIG.defaultMutationRate;
    s.mutationSize = CONFIG.defaultMutationSize;
    s.zoom = CONFIG.defaultZoom;
    s.tiltLimitEnabled = false;
    s.maxTiltDeg = CONFIG.defaultMaxTiltDeg;
    s.maxTiltRad = (s.maxTiltDeg * Math.PI) / 180;
    s.energyEnabled = false;
    s.deathWallSpeedMps = CONFIG.defaultDeathWallSpeedMps ?? 1.0;
    s.deathWallStartBehindMeters = CONFIG.defaultDeathWallStartBehindMeters ?? 10;
    if (s.resetDeathWall) s.resetDeathWall();
    s.turboWallPolicy = 'full';
    if (s.setTurboGenPoleCount) s.setTurboGenPoleCount(5);
    else s.turboGenPoleCount = 5;
    if (s.setTrainingMode) s.setTrainingMode('normal');
    if (s.setViewMode) s.setViewMode('training');

    const sliderValues = {
      'inp-speed': String(Math.round(s.simSpeed)),
      'inp-wall-speed': String(Math.round(s.deathWallSpeedMps * 100)),
      'inp-wall-start': s.deathWallStartBehindMeters.toFixed(1),
      'inp-turbo-poles': String(Math.max(1, Math.min(20, Math.round(s.turboGenPoleCount || 5)))),
      'inp-duration': String(Math.round(s.simDuration)),
      'inp-pop': String(Math.round(s.popSize)),
      'inp-strength': String(Math.round((s.muscleStrength / (CONFIG.defaultMuscleStrength || 1)) * 100)),
      'inp-gravity': s.gravity.toFixed(2),
      'inp-groundfric': String(Math.round(s.groundFriction * 100)),
      'inp-musrange': String(Math.round(s.muscleRange * 100)),
      'inp-musminlen': String(Math.round(s.muscleMinLength * 100)),
      'inp-musmaxlen': String(Math.round(s.muscleMaxLength * 100)),
      'inp-musmooth': String(Math.round(s.muscleSmoothing * 1000)),
      'inp-musbudget': String(Math.round(s.muscleActionBudget)),
      'inp-mut': String(Math.round(s.mutationRate * 100)),
      'inp-mutsize': String(Math.round(s.mutationSize * 100)),
      'inp-zoom': String(Math.round(s.zoom * 100))
    };

    Object.entries(sliderValues).forEach(([id, value]) => {
      const el = document.getElementById(id);
      if (el) el.value = value;
    });
    this.setTrainingMode(s.trainingMode || 'normal');
    this.setTurboWallPolicy(s.turboWallPolicy || 'full');
    this.setViewMode('training');
    s.syncCreatureRuntimeSettings();
    this.updateLabels();
  }
}
