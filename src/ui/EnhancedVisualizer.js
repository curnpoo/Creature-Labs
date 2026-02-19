    ctx.fillText(`${layers.length} layers · ${totalWeights} weights`, 14, 37);
    ctx.fillText(`${creature.bodies.length} bodies · ${creature.muscles.length} muscles`, 14, 48);
      ['Torso Angle', `${stats.torsoAngle.toFixed(1)}°`, Math.abs(stats.torsoAngle) < 30 ? 'rgba(0, 255, 150, 0.9)' : 'rgba(255, 100, 100, 0.9)'],
