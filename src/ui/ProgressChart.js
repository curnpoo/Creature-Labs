    ctx.fillText(`mut ${(sim.effectiveMutationRate() * 100).toFixed(0)}% ×${sim.mutationSize.toFixed(2)}`, w - 6, 31);
      this.leftMeta.textContent = `G${latest.generation} · ${sim.championAwards} awards`;
