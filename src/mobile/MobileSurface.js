import { attachMobileGestures } from './mobileGestures.js';

export class MobileSurface {
  constructor({
    getScreen,
    setScreen,
    subscribe,
    sim,
    designer,
    worldCanvas,
    designContainer
  }) {
    this.getScreen = getScreen;
    this.setScreen = setScreen;
    this.subscribe = subscribe;
    this.sim = sim;
    this.designer = designer;
    this.worldCanvas = worldCanvas;
    this.designContainer = designContainer;

    this.root = null;
    this.unsubscribe = null;
    this.detachGestures = null;
    this.activePanelClass = '';
  }

  mount() {
    if (this.root) return;

    const root = document.createElement('div');
    root.id = 'mobile-surface';
    root.className = 'mobile-surface';
    root.innerHTML = `
      <div class="mobile-topbar">
        <div class="mobile-topbar-title" id="mobile-title">Creature Labs</div>
        <div class="mobile-topbar-actions">
          <button type="button" class="mobile-icon-btn" id="mobile-btn-menu" aria-label="Open menu">
            <i class="fas fa-sliders"></i>
          </button>
          <button type="button" class="mobile-icon-btn hidden" id="mobile-btn-close-panel" aria-label="Close panel">
            <i class="fas fa-xmark"></i>
          </button>
        </div>
      </div>

      <div class="mobile-draw-tools hidden" id="mobile-draw-tools"></div>

      <div class="mobile-sim-actions hidden" id="mobile-sim-actions">
        <button type="button" class="mobile-pill-btn" data-click-id="btn-start-sim">Start</button>
        <button type="button" class="mobile-pill-btn" data-click-id="btn-pause">Pause</button>
        <button type="button" class="mobile-pill-btn" data-click-id="btn-reset">Reset</button>
        <button type="button" class="mobile-pill-btn" data-click-id="btn-edit">Edit</button>
      </div>

      <div class="mobile-overlay hidden" id="mobile-overlay">
        <div class="mobile-overlay-card">
          <h2 class="mobile-overlay-title">Menu</h2>
          <div class="mobile-overlay-grid">
            <button type="button" class="mobile-menu-btn" data-panel-class="mobile-panel-controls">
              <i class="fas fa-sliders"></i> Controls
            </button>
            <button type="button" class="mobile-menu-btn" data-panel-class="mobile-panel-progress">
              <i class="fas fa-chart-line"></i> Metrics
            </button>
            <button type="button" class="mobile-menu-btn" data-panel-class="mobile-panel-score">
              <i class="fas fa-chart-bar"></i> Scorecard
            </button>
            <button type="button" class="mobile-menu-btn" data-panel-class="mobile-panel-top">
              <i class="fas fa-gauge"></i> Top Stats
            </button>
          </div>
          <div class="mobile-overlay-grid mobile-overlay-grid-2">
            <button type="button" class="mobile-menu-btn" data-click-id="tool-save">
              <i class="fas fa-floppy-disk"></i> Save Creature
            </button>
            <button type="button" class="mobile-menu-btn" data-click-id="tool-load">
              <i class="fas fa-folder-open"></i> Open Library
            </button>
          </div>
          <button type="button" class="mobile-close-btn" id="mobile-close-overlay">Close</button>
        </div>
      </div>

      <nav class="mobile-bottom-nav">
        <button type="button" class="mobile-nav-btn" data-screen="splash"><i class="fas fa-house"></i><span>Home</span></button>
        <button type="button" class="mobile-nav-btn" data-screen="draw"><i class="fas fa-pencil"></i><span>Editor</span></button>
        <button type="button" class="mobile-nav-btn" data-screen="sim"><i class="fas fa-play"></i><span>Sim</span></button>
        <button type="button" class="mobile-nav-btn" id="mobile-nav-menu"><i class="fas fa-layer-group"></i><span>Menus</span></button>
      </nav>
    `;

    document.body.appendChild(root);
    this.root = root;

    this._buildDrawToolRow();
    this._bindEvents();

    this.detachGestures = attachMobileGestures({
      sim: this.sim,
      worldCanvas: this.worldCanvas,
      designer: this.designer,
      designContainer: this.designContainer
    });

    if (typeof this.subscribe === 'function') {
      this.unsubscribe = this.subscribe(nextState => this.sync(nextState));
    }

    this.sync({ screen: this.getScreen ? this.getScreen() : 'splash' });
  }

  destroy() {
    this.clearPanelClass();
    if (this.unsubscribe) this.unsubscribe();
    if (this.detachGestures) this.detachGestures();
    if (this.root && this.root.parentNode) this.root.parentNode.removeChild(this.root);
    this.root = null;
  }

  sync(state) {
    if (!this.root) return;
    const nextScreen = state?.screen || (this.getScreen ? this.getScreen() : 'splash');

    const titleEl = this.root.querySelector('#mobile-title');
    if (titleEl) {
      titleEl.textContent = nextScreen === 'draw'
        ? 'Editor'
        : (nextScreen === 'sim' ? 'Simulation' : 'Creature Labs');
    }

    this.root.querySelectorAll('.mobile-nav-btn[data-screen]').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-screen') === nextScreen);
    });

    const drawTools = this.root.querySelector('#mobile-draw-tools');
    const simActions = this.root.querySelector('#mobile-sim-actions');
    if (drawTools) drawTools.classList.toggle('hidden', nextScreen !== 'draw');
    if (simActions) simActions.classList.toggle('hidden', nextScreen !== 'sim');

    if (nextScreen !== 'sim') {
      this.clearPanelClass();
    }
  }

  _bindEvents() {
    const overlay = this.root.querySelector('#mobile-overlay');
    const closeOverlay = () => {
      if (overlay) overlay.classList.add('hidden');
    };

    this.root.querySelectorAll('[data-screen]').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.getAttribute('data-screen');
        if (!target || !this.setScreen) return;
        closeOverlay();
        this.clearPanelClass();
        this.setScreen(target);
      });
    });

    const openOverlay = () => {
      if (overlay) overlay.classList.remove('hidden');
    };

    const menuBtn = this.root.querySelector('#mobile-btn-menu');
    if (menuBtn) menuBtn.addEventListener('click', openOverlay);

    const menuNavBtn = this.root.querySelector('#mobile-nav-menu');
    if (menuNavBtn) menuNavBtn.addEventListener('click', openOverlay);

    const closeOverlayBtn = this.root.querySelector('#mobile-close-overlay');
    if (closeOverlayBtn) closeOverlayBtn.addEventListener('click', closeOverlay);

    const closePanelBtn = this.root.querySelector('#mobile-btn-close-panel');
    if (closePanelBtn) {
      closePanelBtn.addEventListener('click', () => this.clearPanelClass());
    }

    this.root.querySelectorAll('[data-click-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        const clickId = btn.getAttribute('data-click-id');
        this.clickById(clickId);
      });
    });

    this.root.querySelectorAll('[data-panel-class]').forEach(btn => {
      btn.addEventListener('click', () => {
        const panelClass = btn.getAttribute('data-panel-class') || '';
        closeOverlay();
        this.setPanelClass(panelClass);
      });
    });
  }

  _buildDrawToolRow() {
    const container = this.root.querySelector('#mobile-draw-tools');
    if (!container) return;

    const tools = [
      ['tool-node', 'Node'],
      ['tool-joint', 'Joint'],
      ['tool-bone', 'Bone'],
      ['tool-muscle', 'Muscle'],
      ['tool-select', 'Select'],
      ['tool-move', 'Move'],
      ['tool-erase', 'Erase'],
      ['tool-pan', 'Pan'],
      ['tool-undo', 'Undo'],
      ['tool-reset-view', 'Reset'],
      ['tool-save', 'Save'],
      ['tool-load', 'Load'],
      ['tool-clear', 'Clear'],
      ['btn-run', 'Evolve'],
      ['btn-back', 'Back']
    ];

    container.innerHTML = tools.map(([id, label]) => (
      `<button type="button" class="mobile-tool-btn" data-click-id="${id}">${label}</button>`
    )).join('');

    container.querySelectorAll('[data-click-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        const clickId = btn.getAttribute('data-click-id');
        this.clickById(clickId);
      });
    });
  }

  setPanelClass(panelClass) {
    this.clearPanelClass();
    if (!panelClass) return;
    document.body.classList.add(panelClass);
    this.activePanelClass = panelClass;
    const closePanelBtn = this.root.querySelector('#mobile-btn-close-panel');
    if (closePanelBtn) closePanelBtn.classList.remove('hidden');
  }

  clearPanelClass() {
    if (this.activePanelClass) {
      document.body.classList.remove(this.activePanelClass);
      this.activePanelClass = '';
    }
    const closePanelBtn = this.root?.querySelector('#mobile-btn-close-panel');
    if (closePanelBtn) closePanelBtn.classList.add('hidden');
  }

  clickById(id) {
    if (!id) return;
    const el = document.getElementById(id);
    if (!el) return;
    el.click();
  }
}
