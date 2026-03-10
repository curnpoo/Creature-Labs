function formatSliderValue(slider) {
  const suffix = slider.dataset.suffix || '';
  return `${slider.value}${suffix}`;
}

export function bindSplashSettingsModal() {
  const modal = document.getElementById('modal-splash-settings');
  if (!modal || modal.dataset.bound === '1') return;
  modal.dataset.bound = '1';

  const open = () => modal.classList.remove('hidden');
  const close = () => modal.classList.add('hidden');

  modal.querySelectorAll('[data-setting-toggle-group]').forEach(group => {
    const options = group.querySelectorAll('[data-setting-option]');
    options.forEach(optionBtn => {
      optionBtn.addEventListener('click', () => {
        options.forEach(el => el.classList.remove('active'));
        optionBtn.classList.add('active');
      });
    });
  });

  modal.querySelectorAll('[data-setting-slider]').forEach(slider => {
    const outputId = slider.dataset.outputId;
    const outputEl = outputId ? document.getElementById(outputId) : null;
    const mirrorId = slider.dataset.mirrorId;
    const mirrorEl = mirrorId ? document.getElementById(mirrorId) : null;
    const update = () => {
      const text = formatSliderValue(slider);
      if (outputEl) outputEl.textContent = text;
      if (mirrorEl) mirrorEl.textContent = text;
    };
    slider.addEventListener('input', update);
    update();
  });

  modal.querySelectorAll('[data-speed-slider]').forEach(speedShell => {
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

  const splashSettingsBtn = document.getElementById('btn-settings-splash');
  if (splashSettingsBtn) splashSettingsBtn.onclick = open;
  const splashSettingsCloseBtn = document.getElementById('btn-splash-settings-close');
  if (splashSettingsCloseBtn) splashSettingsCloseBtn.onclick = close;

  modal.onclick = (e) => {
    if (e.target === modal) close();
  };

  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
      close();
    }
  });
}

export const setupSplashSettingsModal = bindSplashSettingsModal;
