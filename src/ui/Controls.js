import { STORAGE_KEYS } from '../utils/config.js';

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
      'val-jointspeed', 'val-joint', 'val-gravity', 'val-mut',
      'val-mutsize', 'val-overlap', 'val-zoom', 'val-cam',
      'val-hidden', 'val-neurons', 'val-elites', 'val-tournament',
      'cam-lock', 'cam-free', 'icon-pause',
      'replay-label', 'replay-play-icon',
      'fitness-tag', 'fitness-speed', 'fitness-stability',
      'fitness-airtime', 'fitness-stumbles'
    ];
    ids.forEach(id => {
      this.els[id] = document.getElementById(id);
    });
  }

  bind(callbacks) {
    const { onPause, onReset, onEdit, onStartDraw, onBack, onRun } = callbacks;

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
    const btnReset = document.getElementById('btn-reset');
    if (btnReset) btnReset.onclick = onReset;
    const btnEdit = document.getElementById('btn-edit');
    if (btnEdit) btnEdit.onclick = onEdit;

    // Sliders
    this._bindSlider('inp-speed', v => { this.sim.simSpeed = v; });
    this._bindSlider('inp-zoom', v => { this.sim.zoom = v / 100; });
    this._bindSlider('inp-duration', v => {
      this.sim.simDuration = v;
      this.sim.timer = Math.min(this.sim.timer, v);
    });
    this._bindSlider('inp-pop', v => { this.sim.popSize = v; });
    this._bindSlider('inp-strength', v => { this.sim.muscleStrength = v / 100; });
    this._bindSlider('inp-jointspeed', v => { this.sim.jointMoveSpeed = v / 100; });
    this._bindSlider('inp-joint', v => { this.sim.jointFreedom = v / 100; });
    this._bindSlider('inp-gravity', v => {
      this.sim.gravity = v;
      if (this.sim.engine) this.sim.engine.world.gravity.y = v;
    }, true);
    this._bindSlider('inp-mut', v => { this.sim.mutationRate = v / 100; });
    this._bindSlider('inp-mutsize', v => { this.sim.mutationSize = v / 100; });

    // NN config sliders
    this._bindSlider('inp-hidden', v => { this.sim.hiddenLayers = v; });
    this._bindSlider('inp-neurons', v => { this.sim.neuronsPerLayer = v; });
    this._bindSlider('inp-elites', v => { this.sim.eliteCount = v; });
    this._bindSlider('inp-tournament', v => { this.sim.tournamentSize = v; });

    // Overlap buttons
    const overlapAllow = document.getElementById('overlap-allow');
    const overlapPrevent = document.getElementById('overlap-prevent');
    if (overlapAllow) overlapAllow.onclick = () => {
      this.sim.allowOverlap = true;
      this._updateOverlap();
      if (callbacks.onOverlapChange) callbacks.onOverlapChange();
    };
    if (overlapPrevent) overlapPrevent.onclick = () => {
      this.sim.allowOverlap = false;
      this._updateOverlap();
      if (callbacks.onOverlapChange) callbacks.onOverlapChange();
    };

    // Camera buttons
    const camLock = document.getElementById('cam-lock');
    const camFree = document.getElementById('cam-free');
    const camReset = document.getElementById('cam-reset');
    if (camLock) camLock.onclick = () => this.setCameraMode('lock');
    if (camFree) camFree.onclick = () => this.setCameraMode('free');
    if (camReset) camReset.onclick = () => {
      this.sim.cameraX = 0;
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
      });
      world.addEventListener('wheel', e => {
        if (e.shiftKey && this.sim.cameraMode === 'free') {
          this.sim.cameraX = Math.max(0, this.sim.cameraX + e.deltaY * 0.3 / this.sim.zoom);
          e.preventDefault();
          return;
        }
        const dir = e.deltaY > 0 ? -0.08 : 0.08;
        this.sim.zoom = Math.max(0.35, Math.min(2.5, this.sim.zoom + dir));
        const zoomSlider = document.getElementById('inp-zoom');
        if (zoomSlider) zoomSlider.value = String(Math.round(this.sim.zoom * 100));
        this.updateLabels();
        e.preventDefault();
      }, { passive: false });
    }

    window.addEventListener('mousemove', e => {
      if (!this.sim.panning || this.sim.cameraMode !== 'free') return;
      const dx = e.clientX - this.sim.panX;
      this.sim.panX = e.clientX;
      this.sim.cameraX = Math.max(0, this.sim.cameraX - dx / this.sim.zoom);
    });
    window.addEventListener('mouseup', () => { this.sim.panning = false; });

    // Keyboard shortcuts
    window.addEventListener('keydown', e => {
      if (e.key === '+' || e.key === '=') {
        this.sim.zoom = Math.min(2.5, this.sim.zoom + 0.08);
        const zoomSlider = document.getElementById('inp-zoom');
        if (zoomSlider) zoomSlider.value = String(Math.round(this.sim.zoom * 100));
        this.updateLabels();
      }
      if (e.key === '-' || e.key === '_') {
        this.sim.zoom = Math.max(0.35, this.sim.zoom - 0.08);
        const zoomSlider = document.getElementById('inp-zoom');
        if (zoomSlider) zoomSlider.value = String(Math.round(this.sim.zoom * 100));
        this.updateLabels();
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

    // Preset selector
    const presetSelect = document.getElementById('preset-select');
    if (presetSelect && callbacks.onPresetSelect) {
      presetSelect.addEventListener('change', e => {
        const idx = parseInt(e.target.value, 10);
        if (idx >= 0) callbacks.onPresetSelect(idx);
        e.target.value = '-1';
      });
    }

    this._updateOverlap();
    this.setCameraMode('lock');
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

  _updateOverlap() {
    const allowBtn = document.getElementById('overlap-allow');
    const preventBtn = document.getElementById('overlap-prevent');
    if (allowBtn) allowBtn.classList.toggle('active', this.sim.allowOverlap);
    if (preventBtn) preventBtn.classList.toggle('active', !this.sim.allowOverlap);
    if (this.els['val-overlap']) this.els['val-overlap'].textContent = this.sim.allowOverlap ? 'ALLOW' : 'PREVENT';
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
    set('val-jointspeed', `${s.jointMoveSpeed.toFixed(2)}x`);
    set('val-joint', `${Math.round(s.jointFreedom * 100)}%`);
    set('val-gravity', s.gravity.toFixed(1));
    set('val-mut', `${Math.round(s.mutationRate * 100)}%`);
    set('val-mutsize', `${s.mutationSize.toFixed(2)}x`);
    set('val-zoom', `${s.zoom.toFixed(2)}x`);
    set('val-hidden', `${s.hiddenLayers}`);
    set('val-neurons', `${s.neuronsPerLayer}`);
    set('val-elites', `${s.eliteCount}`);
    set('val-tournament', `${s.tournamentSize}`);
  }

  updateFitnessPanel(fitness) {
    const f = fitness || { speed: 0, stability: 0, airtimePct: 0, stumbles: 0 };
    if (this.els['fitness-speed']) this.els['fitness-speed'].textContent = `${(f.speed / 100).toFixed(1)} m/s`;
    if (this.els['fitness-stability']) this.els['fitness-stability'].textContent = `${f.stability.toFixed(0)}%`;
    if (this.els['fitness-airtime']) this.els['fitness-airtime'].textContent = `${f.airtimePct.toFixed(0)}%`;
    if (this.els['fitness-stumbles']) this.els['fitness-stumbles'].textContent = String(f.stumbles);
  }
}
