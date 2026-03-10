export const TURBO_ISOLATION_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin'
};

export const TURBO_RESULT_FLOAT_STRIDE = 8;
export const TURBO_RESULT_INT_STRIDE = 5;

const DEATH_REASON_TO_CODE = {
  timer: 0,
  death_wall: 1,
  fell: 2,
  invalid: 3
};

const DEATH_CODE_TO_REASON = Object.entries(DEATH_REASON_TO_CODE)
  .reduce((acc, [reason, code]) => {
    acc[code] = reason;
    return acc;
  }, {});

export function turboSupportsSharedMemory() {
  return typeof SharedArrayBuffer !== 'undefined' && globalThis.crossOriginIsolated === true;
}

export function getTurboRuntimeCapabilities() {
  return {
    crossOriginIsolated: globalThis.crossOriginIsolated === true,
    sharedArrayBuffer: turboSupportsSharedMemory()
  };
}

export function encodeTurboDeathReason(reason) {
  return DEATH_REASON_TO_CODE[reason] ?? 0;
}

export function decodeTurboDeathReason(code) {
  return DEATH_CODE_TO_REASON[code] || 'timer';
}
