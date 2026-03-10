import {
  TURBO_RESULT_FLOAT_STRIDE,
  TURBO_RESULT_INT_STRIDE,
  decodeTurboDeathReason,
  turboSupportsSharedMemory
} from './turboRuntime.js';

export class TurboCoordinator {
  constructor() {
    this.workers = [];
    this.online = false;
    this.workerCount = 0;
    this._staticPayloadSignature = null;
    this._staticPayloadVersion = 0;
    this._mobileHeadless = false;
    this._autotune = null;
  }

  _isMobileRuntime() {
    if (typeof document !== 'undefined' && document.body?.classList?.contains('app-mobile')) {
      return true;
    }
    return !!(typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)')?.matches);
  }

  _isLikelyIPhoneSafari() {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';
    const vendor = navigator.vendor || '';
    const appleMobile = /iPhone|iPad|iPod/.test(ua);
    const safari = /Safari/.test(ua) && !/CriOS|Chrome|EdgiOS|FxiOS/.test(ua) && /Apple/i.test(vendor);
    return appleMobile && safari;
  }

  async init(preferredCount = null, options = {}) {
    const hw = typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency || 4) : 4;
    const mobileHeadless = options?.mobileHeadless === true;
    this._mobileHeadless = mobileHeadless;
    const maxWorkers = this._isMobileRuntime() ? (mobileHeadless ? 6 : 4) : 8;
    const availableCores = Math.max(1, hw - (mobileHeadless ? 0 : 1));
    const tunedCount = preferredCount || this._resolveTunedWorkerCount(maxWorkers, availableCores, mobileHeadless);
    const target = Math.max(1, Math.min(maxWorkers, tunedCount));
    if (this.online && this.workers.length === target) return;
    this.destroy();
    for (let i = 0; i < target; i++) {
      const worker = new Worker(new URL('./TurboWorker.js', import.meta.url), { type: 'module' });
      this.workers.push(worker);
    }
    this.workerCount = this.workers.length;
    this.online = this.workers.length > 0;
  }

  destroy() {
    this.workers.forEach(w => w.terminate());
    this.workers = [];
    this.workerCount = 0;
    this.online = false;
    this._staticPayloadSignature = null;
    this._staticPayloadVersion = 0;
  }

  async evaluateGeneration(payload) {
    if (!this.online || !this.workers.length) {
      throw new Error('Turbo coordinator is not initialized.');
    }
    const batches = this._chunk(payload.dnaArray, this.workers.length);
    const staticPayload = payload.staticPayload || null;
    const staticPayloadChanged = this._didStaticPayloadChange(staticPayload);
    if (staticPayloadChanged) this._staticPayloadVersion += 1;
    const useSharedResults = payload.mobileHeadless === true
      && payload.testingModeEnabled !== true
      && turboSupportsSharedMemory();
    // Large shared-world batches diverge more from isolated-world ranking on low-core devices.
    // Keep effective world batch size bounded for better parity consistency.
    const targetBatchSize = this.workerCount <= 2 ? 8 : 16;
    const tasks = batches.map((dnaBatch, idx) => {
      const sharedResults = useSharedResults ? this._createSharedResultBuffers(dnaBatch.length) : null;
      return this._runWorker(this.workers[idx], {
      workerId: idx,
      generation: payload.generation,
      dnaBatch,
      subBatchCount: Math.max(1, Math.ceil(dnaBatch.length / targetBatchSize)),
      mobileHeadless: payload.mobileHeadless === true,
      testingModeEnabled: payload.testingModeEnabled === true,
      staticPayloadVersion: this._staticPayloadVersion,
      staticPayload: staticPayloadChanged ? staticPayload : null,
      sharedResults
      }).then(res => ({
        ...res,
        sharedResults
      }));
    });

    const workerResults = await Promise.all(tasks);
    const combined = [];
    const diagnostics = {
      workerCount: this.workerCount,
      batchCount: batches.length,
      maxBatchSize: 0,
      maxSubBatchCount: 1,
      expectedSteps: 0,
      executedSteps: 0,
      fixedDtExpectedSec: 0,
      fixedDtObservedSec: 0,
      workerElapsedMs: 0,
      deathWallKillCount: 0,
      intentUpdateHz: 0,
      commandOscillationHz: 0,
      avgCommandDeltaPerSec: 0,
      microActuationIndex: 0,
      slipWhileGrounded: 0,
      noSlipAppliedSteps: 0,
      groundTangentialResidual: 0,
      parityMetrics: {}
    };
    const workerMetricSeries = {
      commandOscillationHz: [],
      avgCommandDeltaPerSec: []
    };
    const summarizeMetric = (results, metric) => {
      if (!Array.isArray(results) || !results.length) return null;
      let sum = 0;
      let count = 0;
      for (let i = 0; i < results.length; i++) {
        const v = Number(results[i]?.diagnostics?.[metric]);
        if (Number.isFinite(v)) {
          sum += v;
          count++;
        }
      }
      if (!count) return null;
      return {
        mean: sum / count,
        count
      };
    };
    const withSpread = summary => {
      if (!summary || !summary.values?.length) return null;
      const vals = summary.values;
      const mean = summary.mean;
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      let variance = 0;
      for (let i = 0; i < vals.length; i++) {
        const d = vals[i] - mean;
        variance += d * d;
      }
      variance /= vals.length;
      const stdDev = Math.sqrt(variance);
      const spreadPct = (Math.abs(mean) > 1e-6) ? ((max - min) / Math.abs(mean)) * 100 : 0;
      return { mean, min, max, stdDev, spreadPct, count: vals.length };
    };
    workerResults.forEach(res => {
      if (!res.ok) throw new Error(res.error || 'Turbo worker failed.');
      diagnostics.workerElapsedMs = Math.max(diagnostics.workerElapsedMs, Number(res.elapsedMs) || 0);
      diagnostics.maxBatchSize = Math.max(diagnostics.maxBatchSize, Number(res.batchSize) || 0);
      diagnostics.maxSubBatchCount = Math.max(diagnostics.maxSubBatchCount, Number(res.subBatchCount) || 1);
      if (res.useSharedResults && res.sharedResults) {
        combined.push(...this._decodeSharedResults(res.sharedResults, Number(res.batchSize) || 0));
      } else {
        combined.push(...res.results);
      }
      const osc = summarizeMetric(res.results, 'commandOscillationHz');
      const delta = summarizeMetric(res.results, 'avgCommandDeltaPerSec');
      if (osc) workerMetricSeries.commandOscillationHz.push(osc.mean);
      if (delta) workerMetricSeries.avgCommandDeltaPerSec.push(delta.mean);
    });
    combined.forEach(result => {
      const d = result?.diagnostics || {};
      diagnostics.expectedSteps += Number(d.expectedSteps) || 0;
      diagnostics.executedSteps += Number(d.executedSteps) || 0;
      diagnostics.fixedDtExpectedSec += Number(d.fixedDtExpectedSec) || 0;
      diagnostics.fixedDtObservedSec += Number(d.fixedDtObservedSec) || 0;
      diagnostics.deathWallKillCount += Number(d.deathWallKillCount) || 0;
      diagnostics.intentUpdateHz += Number(d.intentUpdateHz) || 0;
      diagnostics.commandOscillationHz += Number(d.commandOscillationHz) || 0;
      diagnostics.avgCommandDeltaPerSec += Number(d.avgCommandDeltaPerSec) || 0;
      diagnostics.microActuationIndex += Number(d.microActuationIndex) || 0;
      diagnostics.slipWhileGrounded += Number(d.slipWhileGrounded) || 0;
      diagnostics.noSlipAppliedSteps += Number(d.noSlipAppliedSteps) || 0;
      diagnostics.groundTangentialResidual += Number(d.groundTangentialResidual) || 0;
    });
    const withDiagCount = Math.max(1, combined.filter(r => r?.diagnostics).length);
    diagnostics.fixedDtExpectedSec /= withDiagCount;
    diagnostics.fixedDtObservedSec /= withDiagCount;
    diagnostics.intentUpdateHz /= withDiagCount;
    diagnostics.commandOscillationHz /= withDiagCount;
    diagnostics.avgCommandDeltaPerSec /= withDiagCount;
    diagnostics.microActuationIndex /= withDiagCount;
    diagnostics.slipWhileGrounded /= withDiagCount;
    diagnostics.groundTangentialResidual /= withDiagCount;
    diagnostics.parityMetrics = {
      commandOscillationHz: withSpread({
        mean: workerMetricSeries.commandOscillationHz.reduce((a, b) => a + b, 0)
          / Math.max(1, workerMetricSeries.commandOscillationHz.length),
        values: workerMetricSeries.commandOscillationHz
      }),
      avgCommandDeltaPerSec: withSpread({
        mean: workerMetricSeries.avgCommandDeltaPerSec.reduce((a, b) => a + b, 0)
          / Math.max(1, workerMetricSeries.avgCommandDeltaPerSec.length),
        values: workerMetricSeries.avgCommandDeltaPerSec
      })
    };
    return {
      generation: payload.generation,
      results: combined,
      diagnostics
    };
  }

  recordGenerationTiming(elapsedMs) {
    if (!this._autotune || !Number.isFinite(elapsedMs) || elapsedMs <= 0) return false;
    const state = this._autotune;
    const candidate = state.candidates[state.index];
    if (!candidate) return false;

    candidate.samples.push(elapsedMs);
    if (candidate.samples.length < state.samplesPerCandidate) return false;

    state.index += 1;
    if (state.index >= state.candidates.length) {
      const best = state.candidates
        .map(item => ({
          count: item.count,
          avgMs: item.samples.reduce((sum, value) => sum + value, 0) / Math.max(1, item.samples.length)
        }))
        .sort((a, b) => a.avgMs - b.avgMs)[0];
      if (best?.count) {
        this._persistTunedWorkerCount(best.count);
        this.init(best.count, { mobileHeadless: this._mobileHeadless });
      }
      this._autotune = null;
      return true;
    }

    const next = state.candidates[state.index];
    if (next?.count) {
      this.init(next.count, { mobileHeadless: this._mobileHeadless });
      return true;
    }
    return false;
  }

  getCapabilities() {
    return {
      sharedArrayBuffer: turboSupportsSharedMemory()
    };
  }

  _resolveTunedWorkerCount(maxWorkers, availableCores, mobileHeadless) {
    const baseTarget = Math.max(1, Math.min(maxWorkers, availableCores));
    if (!mobileHeadless) {
      this._autotune = null;
      return baseTarget;
    }

    const iPhoneSafari = this._isLikelyIPhoneSafari();
    const minimumHeadlessWorkers = (iPhoneSafari && availableCores >= 4) ? 3 : 2;

    const cached = this._readPersistedWorkerCount();
    if (cached && cached >= minimumHeadlessWorkers) {
      this._autotune = null;
      return Math.max(1, Math.min(maxWorkers, cached));
    }

    const lowerBound = Math.min(baseTarget, minimumHeadlessWorkers);
    if (baseTarget <= 1) {
      this._autotune = null;
      return baseTarget;
    }
    const counts = [];
    for (let count = lowerBound; count <= baseTarget; count++) counts.push(count);
    this._autotune = counts.length > 1
      ? {
          candidates: counts.map(count => ({ count, samples: [] })),
          index: 0,
          samplesPerCandidate: (iPhoneSafari && !turboSupportsSharedMemory()) ? 1 : 2
        }
      : null;
    return this._autotune?.candidates?.[0]?.count || baseTarget;
  }

  _readPersistedWorkerCount() {
    if (typeof sessionStorage === 'undefined') return null;
    try {
      const raw = sessionStorage.getItem(this._workerCountStorageKey());
      const parsed = Number(raw);
      return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
    } catch {
      return null;
    }
  }

  _persistTunedWorkerCount(count) {
    if (typeof sessionStorage === 'undefined') return;
    try {
      sessionStorage.setItem(this._workerCountStorageKey(), String(count));
    } catch {
      // Ignore storage failures.
    }
  }

  _workerCountStorageKey() {
    const hw = typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency || 4) : 4;
    return `creaturelabs.turboWorkerCount.v3.${hw}.${this._mobileHeadless ? 'mobile-headless' : 'default'}.${turboSupportsSharedMemory() ? 'sab' : 'nosab'}`;
  }

  _didStaticPayloadChange(next) {
    const nextSignature = this._buildStaticPayloadSignature(next);
    const previous = this._staticPayloadSignature;
    const changed = !previous
      || !nextSignature
      || previous.nodesRef !== nextSignature.nodesRef
      || previous.constraintsRef !== nextSignature.constraintsRef
      || previous.groundProfileRef !== nextSignature.groundProfileRef
      || previous.obstaclesRef !== nextSignature.obstaclesRef
      || previous.boundsKey !== nextSignature.boundsKey
      || previous.runtimeKey !== nextSignature.runtimeKey;
    this._staticPayloadSignature = nextSignature;
    return changed;
  }

  _buildStaticPayloadSignature(payload) {
    if (!payload) return null;
    const design = payload.designSnapshot || {};
    const terrain = payload.terrainSnapshot || {};
    const bounds = design.bounds || {};
    return {
      nodesRef: design.nodes || null,
      constraintsRef: design.constraints || null,
      groundProfileRef: terrain.groundProfile || null,
      obstaclesRef: terrain.obstacles || null,
      boundsKey: [
        Number(bounds.minX) || 0,
        Number(bounds.minY) || 0,
        Number(bounds.maxX) || 0,
        Number(bounds.maxY) || 0
      ].join('|'),
      runtimeKey: JSON.stringify({
        simConfig: payload.simConfig || {},
        spawnX: payload.spawnX,
        spawnCenterX: payload.spawnCenterX,
        spawnClearance: payload.spawnClearance,
        nodeRadius: payload.nodeRadius,
        groundY: payload.groundY,
        fixedDtSec: payload.fixedDtSec,
        replaySampleIntervalSec: payload.replaySampleIntervalSec,
        captureReplay: payload.captureReplay === true,
        scoreWeights: payload.scoreWeights || null
      })
    };
  }

  _runWorker(worker, payload) {
    return new Promise((resolve, reject) => {
      const onMessage = evt => {
        cleanup();
        resolve(evt.data);
      };
      const onError = err => {
        cleanup();
        reject(err);
      };
      const cleanup = () => {
        worker.removeEventListener('message', onMessage);
        worker.removeEventListener('error', onError);
      };
      worker.addEventListener('message', onMessage);
      worker.addEventListener('error', onError);
      worker.postMessage(payload);
    });
  }

  _createSharedResultBuffers(resultCount) {
    const safeCount = Math.max(0, Math.floor(resultCount));
    return {
      floatBuffer: new SharedArrayBuffer(Float64Array.BYTES_PER_ELEMENT * TURBO_RESULT_FLOAT_STRIDE * safeCount),
      intBuffer: new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * TURBO_RESULT_INT_STRIDE * safeCount)
    };
  }

  _decodeSharedResults(sharedResults, batchSize) {
    const count = Math.max(0, Math.floor(batchSize));
    if (!sharedResults || count <= 0) return [];
    const floatView = new Float64Array(sharedResults.floatBuffer);
    const intView = new Int32Array(sharedResults.intBuffer);
    const results = [];
    for (let i = 0; i < count; i++) {
      const floatOffset = i * TURBO_RESULT_FLOAT_STRIDE;
      const intOffset = i * TURBO_RESULT_INT_STRIDE;
      results.push({
        sourceIndex: intView[intOffset],
        score: floatView[floatOffset],
        distance: floatView[floatOffset + 1],
        durationSec: floatView[floatOffset + 2],
        finalX: floatView[floatOffset + 3],
        fitness: {
          groundSlipRate: floatView[floatOffset + 4],
          actuationLevel: floatView[floatOffset + 5]
        },
        diagnostics: {
          fixedDtExpectedSec: floatView[floatOffset + 6],
          fixedDtObservedSec: floatView[floatOffset + 7],
          executedSteps: intView[intOffset + 1],
          expectedSteps: intView[intOffset + 2],
          deathWallKillCount: intView[intOffset + 3],
          deathReason: decodeTurboDeathReason(intView[intOffset + 4])
        }
      });
    }
    return results;
  }

  _chunk(input, count) {
    const buckets = Array.from({ length: count }, () => []);
    input.forEach((item, idx) => {
      buckets[idx % count].push({
        ...item,
        sourceIndex: Number.isFinite(item.sourceIndex) ? item.sourceIndex : idx,
        controllerType: item.controllerType || 'dense',
        genomeId: Number.isFinite(item.genomeId) ? item.genomeId : null,
        genome: item.genome || null,
        dna: item.dna
          ? (item.dna instanceof Float32Array ? item.dna : new Float32Array(item.dna))
          : null,
        architecture: item.architecture || null
      });
    });
    return buckets.filter(bucket => bucket.length > 0);
  }
}
