import { resolveUIPlatform } from './ui/platformPolicy.js';
import { setupSplashSettingsModal } from './ui/splashSettings.js';
import { registerPWA } from './pwa/registerPWA.js';
import { THEME_TOKENS_SCHEMA_VERSION } from './theme/tokens.js';

registerPWA();

function requestIframeStorageAccessOnFirstGesture() {
  if (window.top === window.self) return;
  const hasStorageAccess = document.hasStorageAccess?.bind(document);
  const requestStorageAccess = document.requestStorageAccess?.bind(document);
  if (typeof hasStorageAccess !== 'function' || typeof requestStorageAccess !== 'function') return;

  const onFirstGesture = async () => {
    try {
      const hasAccess = await hasStorageAccess();
      if (!hasAccess) await requestStorageAccess();
    } catch {
      // Best effort only. The app still has non-cookie storage fallbacks.
    }
  };

  window.addEventListener('pointerdown', () => { void onFirstGesture(); }, { capture: true, once: true });
  window.addEventListener('touchstart', () => { void onFirstGesture(); }, { capture: true, once: true });
}

function updateOrientationClasses() {
  const isPortrait = window.innerHeight > window.innerWidth;
  document.body.classList.toggle('portrait', isPortrait);
  document.body.classList.toggle('landscape', !isPortrait);
}

function updateMobileViewportInsets() {
  if (!document.body.classList.contains('app-mobile')) return;
  const viewport = window.visualViewport;
  let browserBottomInset = 0;
  if (viewport) {
    const layoutHeight = Math.max(window.innerHeight || 0, document.documentElement.clientHeight || 0);
    browserBottomInset = Math.max(0, Math.round(layoutHeight - viewport.height - viewport.offsetTop));
  }
  const isStandalone = (
    window.matchMedia?.('(display-mode: standalone)')?.matches
    || window.navigator?.standalone === true
  );
  const isPortrait = (window.innerHeight || 0) >= (window.innerWidth || 0);
  const browserModeInsetFloor = !isStandalone ? (isPortrait ? 72 : 20) : 0;
  browserBottomInset = Math.max(browserBottomInset, browserModeInsetFloor);
  document.documentElement.style.setProperty('--mobile-browser-ui-bottom', `${browserBottomInset}px`);
}

requestIframeStorageAccessOnFirstGesture();

const uiPlatform = resolveUIPlatform();
document.body.classList.add(uiPlatform === 'mobile' ? 'app-mobile' : 'app-desktop');
document.body.dataset.uiPlatform = uiPlatform;
document.body.dataset.themeTokenSchema = THEME_TOKENS_SCHEMA_VERSION;

window.addEventListener('resize', updateOrientationClasses);
window.addEventListener('resize', updateMobileViewportInsets);
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', updateMobileViewportInsets);
  window.visualViewport.addEventListener('scroll', updateMobileViewportInsets);
}
updateOrientationClasses();
updateMobileViewportInsets();
setupSplashSettingsModal();

let appBootstrapPromise = null;

function loadAppBootstrap() {
  if (!appBootstrapPromise) {
    appBootstrapPromise = import('./appBootstrap.js');
  }
  return appBootstrapPromise;
}

async function handleSplashLaunch(button) {
  if (!button || button.dataset.loading === '1') return;
  button.dataset.loading = '1';
  button.classList.add('is-launching');
  try {
    const bootstrap = await loadAppBootstrap();
    window.setTimeout(() => {
      button.classList.remove('is-launching');
      button.dataset.loading = '0';
      bootstrap.launchFromSplash?.();
    }, 180);
  } catch (error) {
    button.classList.remove('is-launching');
    button.dataset.loading = '0';
    console.error('Failed to load app bootstrap.', error);
  }
}

const playButton = document.getElementById('btn-start-draw');
if (playButton) {
  playButton.onclick = () => {
    void handleSplashLaunch(playButton);
  };
  ['pointerenter', 'focus', 'touchstart'].forEach(eventName => {
    playButton.addEventListener(
      eventName,
      () => {
        void loadAppBootstrap();
      },
      { once: true, passive: eventName === 'touchstart' }
    );
  });
}
