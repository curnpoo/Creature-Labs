export function registerPWA() {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', async () => {
    try {
      const baseUrl = import.meta.env.BASE_URL || '/';
      const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
      await navigator.serviceWorker.register(`${normalizedBase}sw.js`, { scope: normalizedBase });
    } catch (error) {
      console.warn('Service worker registration failed:', error);
    }
  });
}
