export class TurboCoordinator {
  constructor() {
    this.workers = [];
    this.online = false;
    this.workerCount = 0;
  }

  async init(preferredCount = null) {
    if (this.online && this.workers.length) return;
    const hw = typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency || 4) : 4;
    const target = preferredCount || Math.max(1, Math.min(8, hw - 1));
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
  }

  async evaluateGeneration(payload) {
    if (!this.online || !this.workers.length) {
      throw new Error('Turbo coordinator is not initialized.');
    }
    const batches = this._chunk(payload.dnaArray, this.workers.length);
    // Large shared-world batches diverge more from isolated-world ranking on low-core devices.
    // Keep effective world batch size bounded for better parity consistency.
    const targetBatchSize = this.workerCount <= 2 ? 8 : 16;
    const tasks = batches.map((dnaBatch, idx) => this._runWorker(this.workers[idx], {
      ...payload,
      workerId: idx,
      dnaBatch,
      subBatchCount: Math.max(1, Math.ceil(dnaBatch.length / targetBatchSize))
    }));

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
      combined.push(...res.results);
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

  _chunk(input, count) {
    const buckets = Array.from({ length: count }, () => []);
    input.forEach((item, idx) => {
      buckets[idx % count].push({
        ...item,
        controllerType: item.controllerType || 'dense',
        genomeId: Number.isFinite(item.genomeId) ? item.genomeId : null,
        genome: item.genome || null,
        dna: item.dna ? Array.from(item.dna) : null,
        architecture: item.architecture || null
      });
    });
    return buckets.filter(bucket => bucket.length > 0);
  }
}
