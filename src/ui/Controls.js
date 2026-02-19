import { STORAGE_KEYS, CONFIG } from '../utils/config.js';
import { planck } from '../sim/Physics.js';

/**
 * Right panel controls + bindings.
 */
export class Controls {
  constructor(sim) {
    this.sim = sim;
    this.els = {};
    this._cacheElements();
  }

  _cacheElements() {
    const ids = [
      'val-speed', 'val-duration', 'val-pop', 'val-strength',
      'val-jointspeed', 'val-joint', 'val-gravity', 'val-groundfric',
      'val-groundstatic', 'val-traction', 'val-bodyfric', 'val-bodystatic',
      'val-bodyair', 'val-musrange', 'val-musmooth', 'val-distreward',
      'val-speedreward', 'val-jitterpen', 'val-slippen', 'val-stabmode', 'val-mut',
      'val-mutsize', 'val-zoom', 'val-cam',
      'val-hidden', 'val-neurons', 'val-elites', 'val-tournament',
      'cam-lock', 'cam-free', 'icon-pause',
      'fitness-tag', 'fitness-speed', 'fitness-stability',
      'fitness-energy', 'fitness-energy-bar', 'fitness-stumbles', 'fitness-spin',
      'val-spinpen', 'val-maxenergy', 'val-regen', 'val-energycost'
    ];
    ids.forEach(id => {
      this.els[id] = document.getElementById(id);
    });
  }

  bind(callbacks) {
    const { onPause, onReset, onEdit, onStartDraw, onBack, onRun, onStartSim, onResetSettings } = callbacks;

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

    const selfcolOn = document.getElementById('selfcol-on');
    const selfcolOff = document.getElementById('selfcol-off');
    const updateSelfCollisionUI = () => {
      if (selfcolOn) selfcolOn.classList.toggle('active', this.sim.selfCollision);
      if (selfcolOff) selfcolOff.classList.toggle('active', !this.sim.selfCollision);
    };
    if (selfcolOn) {
      selfcolOn.onclick = () => {
        this.sim.selfCollision = true;
        this.sim.syncCreatureRuntimeSettings();
        updateSelfCollisionUI();
      };
    }
    if (selfcolOff) {
      selfcolOff.onclick = () => {
        this.sim.selfCollision = false;
        this.sim.syncCreatureRuntimeSettings();
        updateSelfCollisionUI();
      };
    }
    updateSelfCollisionUI();

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
    this._bindSlider('inp-zoom', v => { this.sim.zoom = v / 100; });
    this._bindSlider('inp-duration', v => {
      this.sim.simDuration = v;
      this.sim.timer = Math.min(this.sim.timer, v);
    });
    this._bindSlider('inp-pop', v => { this.sim.popSize = v; });
    this._bindSlider('inp-strength', v => {
      this.sim.muscleStrength = v / 100;
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
    this._bindSlider('inp-musmooth', v => {
      this.sim.muscleSmoothing = v / 100;
      this.sim.creatures.forEach(c => { c.simConfig.muscleSmoothing = this.sim.muscleSmoothing; });
    });
    this._bindSlider('inp-musbudget', v => {
      this.sim.muscleActionBudget = Math.max(1, Math.floor(v));
      this.sim.creatures.forEach(c => { c.simConfig.muscleActionBudget = this.sim.muscleActionBudget; });
    });

    // Energy system sliders
    this._bindSlider('inp-maxenergy', v => {
      this.sim.maxEnergy = v;
      this.sim.creatures.forEach(c => {
        if (c.energy) {
          c.energy.max = v;
          c.energy.current = Math.min(c.energy.current, v);
        }
      });
    });
    this._bindSlider('inp-regen', v => {
      this.sim.energyRegenRate = v;
      this.sim.creatures.forEach(c => {
        if (c.energy) c.energy.regenRate = v;
      });
    });
    this._bindSlider('inp-energycost', v => {
      this.sim.energyUsagePerActuation = v / 100;
      this.sim.creatures.forEach(c => {
        if (c.energy) c.energy.usagePerActuation = v / 100;
      });
    });

    this._bindSlider('inp-distreward', v => { this.sim.distanceRewardWeight = v; });
    this._bindSlider('inp-speedreward', v => { this.sim.speedRewardWeight = v / 100; });
    this._bindSlider('inp-jitterpen', v => { this.sim.jitterPenaltyWeight = v; });
    this._bindSlider('inp-slippen', v => { this.sim.groundSlipPenaltyWeight = v; });
    this._bindSlider('inp-spinpen', v => { this.sim.spinPenaltyWeight = v; });
    this._bindSlider('inp-mut', v => { this.sim.mutationRate = v / 100; });
    this._bindSlider('inp-mutsize', v => { this.sim.mutationSize = v / 100; });

    // NN architecture is auto-evolving - no manual controls
    // Evolution controls only
    this._bindSlider('inp-elites', v => { this.sim.eliteCount = v; });
    this._bindSlider('inp-tournament', v => { this.sim.tournamentSize = v; });

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
    if (camLock) camLock.onclick = () => this.setCameraMode('lock');
    if (camFree) camFree.onclick = () => this.setCameraMode('free');
    if (camReset) camReset.onclick = () => {
      this.sim.cameraX = 0;
      this.sim.cameraY = 0;
      this.setCameraMode('lock');
    };

    // Replay buttons
    const replayPrev = document.getElementById('replay-prev');
    const replayNext = document.getElementById('replay-next');
    const replayPlay = document.getElementById('replay-play');
    if (replayPrev) replayPrev.onclick = () => this.setReplayIndex(this.sim.replayIndex - 1);
    if (replayNext) replayNext.onclick = () => this.setReplayIndex(this.sim.replayIndex + 1);
    if (replayPlay) replayPlay.onclick = () => this.toggleReplayPlay();

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
          this.sim.cameraX = Math.max(0, this.sim.cameraX + e.deltaY * 0.4 / this.sim.zoom);
          e.preventDefault();
          return;
        }
        if (this.sim.cameraMode === 'free' && e.altKey) {
          this.sim.cameraY += e.deltaY * 0.4 / this.sim.zoom;
          e.preventDefault();
          return;
        }

        // Zoom around cursor so the point under mouse stays fixed.
        const worldX = sx / this.sim.zoom + this.sim.cameraX;
        const worldY = sy / this.sim.zoom + this.sim.cameraY;
        const dir = e.deltaY > 0 ? -0.08 : 0.08;
        const nextZoom = Math.max(0.35, Math.min(2.5, this.sim.zoom + dir));
        this.sim.cameraX = Math.max(0, worldX - sx / nextZoom);
        this.sim.cameraY = worldY - sy / nextZoom;
        this.sim.zoom = nextZoom;
        const zoomSlider = document.getElementById('inp-zoom');
        if (zoomSlider) zoomSlider.value = String(Math.round(this.sim.zoom * 100));
        this.updateLabels();
        e.preventDefault();
      }, { passive: false });
    }

    window.addEventListener('mousemove', e => {
      if (!this.sim.panning || this.sim.cameraMode !== 'free') return;
      const dx = e.clientX - this.sim.panX;
      const dy = e.clientY - this.sim.panY;
      this.sim.panX = e.clientX;
      this.sim.panY = e.clientY;
      this.sim.cameraX = Math.max(0, this.sim.cameraX - dx / this.sim.zoom);
      this.sim.cameraY -= dy / this.sim.zoom;
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
        this.sim.cameraX = Math.max(0, wx - cx / this.sim.zoom);
        this.sim.cameraY = wy - cy / this.sim.zoom;
        const zoomSlider = document.getElementById('inp-zoom');
        if (zoomSlider) zoomSlider.value = String(Math.round(this.sim.zoom * 100));
        this.updateLabels();
      }
      if (e.key === '-' || e.key === '_') {
        const cx = window.innerWidth * 0.5;
        const cy = window.innerHeight * 0.5;
        const wx = cx / this.sim.zoom + this.sim.cameraX;
        const wy = cy / this.sim.zoom + this.sim.cameraY;
        this.sim.zoom = Math.max(0.35, this.sim.zoom - 0.08);
        this.sim.cameraX = Math.max(0, wx - cx / this.sim.zoom);
        this.sim.cameraY = wy - cy / this.sim.zoom;
        const zoomSlider = document.getElementById('inp-zoom');
        if (zoomSlider) zoomSlider.value = String(Math.round(this.sim.zoom * 100));
        this.updateLabels();
      }
      if (this.sim.cameraMode === 'free' && e.key === 'ArrowUp') this.sim.cameraY -= 30 / this.sim.zoom;
      if (this.sim.cameraMode === 'free' && e.key === 'ArrowDown') this.sim.cameraY += 30 / this.sim.zoom;
      if (this.sim.cameraMode === 'free' && e.key === 'ArrowLeft') this.sim.cameraX = Math.max(0, this.sim.cameraX - 30 / this.sim.zoom);
      if (this.sim.cameraMode === 'free' && e.key === 'ArrowRight') this.sim.cameraX += 30 / this.sim.zoom;
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

    // Preset selector
    const presetSelect = document.getElementById('preset-select');
    if (presetSelect && callbacks.onPresetSelect) {
      presetSelect.addEventListener('change', e => {
        const idx = parseInt(e.target.value, 10);
        if (idx >= 0) callbacks.onPresetSelect(idx);
        e.target.value = '-1';
      });
    }

    this.setCameraMode('lock');
    this._updateStabilityMode();
    this.updateLabels();
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
    this.sim.cameraMode = mode;
    const camLock = document.getElementById('cam-lock');
    const camFree = document.getElementById('cam-free');
    if (camLock) camLock.classList.toggle('active', mode === 'lock');
    if (camFree) camFree.classList.toggle('active', mode === 'free');
    if (this.els['val-cam']) this.els['val-cam'].textContent = mode.toUpperCase();
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

  updateLabels() {
    const s = this.sim;
    const set = (id, val) => { if (this.els[id]) this.els[id].textContent = val; };
    set('val-speed', `${s.simSpeed}x`);
    set('val-duration', `${s.simDuration}s`);
    set('val-pop', `${s.popSize}`);
    set('val-strength', `${Math.round(s.muscleStrength * 100)}%`);
    set('val-gravity', s.gravity.toFixed(1));
    set('val-groundfric', `${s.groundFriction.toFixed(2)}`);
    set('val-musrange', `${Math.round(s.muscleRange * 100)}%`);
    set('val-musmooth', `${Math.round(s.muscleSmoothing * 100)}%`);
    set('val-musbudget', `${s.muscleActionBudget}`);
    set('val-maxenergy', `${Math.round(s.maxEnergy)}`);
    set('val-regen', `${Math.round(s.energyRegenRate)}/s`);
    set('val-energycost', `${(s.energyUsagePerActuation || 0.8).toFixed(2)}`);
    set('val-mut', `${Math.round(s.mutationRate * 100)}%`);
    set('val-mutsize', `${s.mutationSize.toFixed(2)}x`);
    set('val-zoom', `${s.zoom.toFixed(2)}x`);
    set('val-elites', `${s.eliteCount}`);
    set('val-tournament', `${s.tournamentSize}`);
    
    // Update NN architecture display
    const leader = s.getLeader ? s.getLeader() : null;
    if (leader && leader.brain) {
      const layers = leader.brain.layerSizes;
      const archText = `${layers.length - 2}h × ${layers[1]}n`;
      set('val-nn-arch', archText);
    }
  }

  updateFitnessPanel(fitness, creature) {
    const f = fitness || { speed: 0, stability: 0, stumbles: 0, spin: 0 };
    if (this.els['fitness-speed']) this.els['fitness-speed'].textContent = `${(f.speed / 100).toFixed(1)} m/s`;
    if (this.els['fitness-stability']) this.els['fitness-stability'].textContent = `${f.stability.toFixed(0)}%`;

    // Energy bar
    if (creature && creature.energy && creature.energy.enabled) {
      const energyPct = (creature.energy.current / creature.energy.max) * 100;
      if (this.els['fitness-energy']) this.els['fitness-energy'].textContent = `${energyPct.toFixed(0)}%`;
      if (this.els['fitness-energy-bar']) this.els['fitness-energy-bar'].style.width = `${energyPct}%`;
    } else {
      if (this.els['fitness-energy']) this.els['fitness-energy'].textContent = 'N/A';
      if (this.els['fitness-energy-bar']) this.els['fitness-energy-bar'].style.width = '0%';
    }

    if (this.els['fitness-stumbles']) this.els['fitness-stumbles'].textContent = String(f.stumbles);
    if (this.els['fitness-spin']) this.els['fitness-spin'].textContent = f.spin.toFixed(2);
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
    s.muscleSmoothing = CONFIG.defaultMuscleSmoothing;
    s.muscleActionBudget = CONFIG.defaultMuscleActionBudget;
    s.mutationRate = CONFIG.defaultMutationRate;
    s.mutationSize = CONFIG.defaultMutationSize;
    // NN architecture is auto-evolving - no reset needed
    s.eliteCount = CONFIG.defaultEliteCount;
    s.tournamentSize = CONFIG.defaultTournamentSize;
    s.zoom = CONFIG.defaultZoom;
    s.maxEnergy = CONFIG.defaultMaxEnergy;
    s.energyRegenRate = CONFIG.defaultEnergyRegenRate;
    s.energyUsagePerActuation = CONFIG.defaultEnergyUsagePerActuation;

    const sliderValues = {
      'inp-speed': String(Math.round(s.simSpeed)),
      'inp-duration': String(Math.round(s.simDuration)),
      'inp-pop': String(Math.round(s.popSize)),
      'inp-strength': String(Math.round(s.muscleStrength * 100)),
      'inp-gravity': s.gravity.toFixed(1),
      'inp-groundfric': String(Math.round(s.groundFriction * 100)),
      'inp-musrange': String(Math.round(s.muscleRange * 100)),
      'inp-musmooth': String(Math.round(s.muscleSmoothing * 100)),
      'inp-mut': String(Math.round(s.mutationRate * 100)),
      'inp-mutsize': String(Math.round(s.mutationSize * 100)),
      // NN architecture auto-evolves - no sliders
      'inp-elites': String(Math.round(s.eliteCount)),
      'inp-tournament': String(Math.round(s.tournamentSize)),
      'inp-zoom': String(Math.round(s.zoom * 100)),
      'inp-maxenergy': String(Math.round(s.maxEnergy)),
      'inp-regen': String(Math.round(s.energyRegenRate)),
      'inp-energycost': String(Math.round(s.energyUsagePerActuation * 100))
    };

    Object.entries(sliderValues).forEach(([id, value]) => {
      const el = document.getElementById(id);
      if (el) el.value = value;
    });
    this.updateLabels();
  }
}
