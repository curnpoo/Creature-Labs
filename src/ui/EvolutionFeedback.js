      ? '🤖 Auto-adaptation enabled - parameters will adjust automatically'
      .map(c => `${c.param}: ${this.formatValue(c.from)} → ${this.formatValue(c.to)}`)
      `🤖 Auto-adapted: ${changes}`,
