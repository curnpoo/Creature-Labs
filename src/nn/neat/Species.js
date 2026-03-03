export class Species {
  /**
   * @param {number} id
   * @param {import('./Genome.js').Genome} representative
   */
  constructor(id, representative) {
    this.id = id;
    this.representative = representative.clone(representative.id);
    this.members = [];
    this.bestFitness = Number.NEGATIVE_INFINITY;
    this.stagnantGenerations = 0;
    this.lastAverageAdjustedFitness = 0;
  }

  clearMembers() {
    this.members = [];
  }

  /**
   * @param {import('./Genome.js').Genome} genome
   * @param {number} fitness
   */
  addMember(genome, fitness) {
    this.members.push({ genome, fitness, adjustedFitness: 0 });
  }

  finalizeGeneration() {
    const count = Math.max(1, this.members.length);
    let adjustedSum = 0;
    let best = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < this.members.length; i++) {
      const member = this.members[i];
      member.adjustedFitness = member.fitness / count;
      member.genome.fitness = member.fitness;
      member.genome.adjustedFitness = member.adjustedFitness;
      adjustedSum += member.adjustedFitness;
      best = Math.max(best, member.fitness);
    }

    this.lastAverageAdjustedFitness = adjustedSum;
    if (best > this.bestFitness) {
      this.bestFitness = best;
      this.stagnantGenerations = 0;
    } else {
      this.stagnantGenerations += 1;
    }

    if (this.members.length > 0) {
      const idx = Math.floor(Math.random() * this.members.length);
      this.representative = this.members[idx].genome.clone(this.members[idx].genome.id);
    }
  }

  champion() {
    if (!this.members.length) return null;
    return this.members.slice().sort((a, b) => b.fitness - a.fitness)[0].genome;
  }

  selectParent(tournamentSize = 3) {
    if (!this.members.length) return null;
    const k = Math.min(tournamentSize, this.members.length);
    let best = null;
    for (let i = 0; i < k; i++) {
      const candidate = this.members[Math.floor(Math.random() * this.members.length)];
      if (!best || candidate.adjustedFitness > best.adjustedFitness) {
        best = candidate;
      }
    }
    return best?.genome || null;
  }
}
