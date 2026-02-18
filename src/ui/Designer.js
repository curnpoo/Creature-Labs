    ctx.fillText('↓', this.canvas.width - 20, groundY + 20);
      ctx.fillText(`${width.toFixed(0)}×${height.toFixed(0)}px`, minX, minY - 10);
        ctx.fillText(`↓ ${distFromGround.toFixed(0)}px to ground`, centerX, (maxY + groundY) / 2);
    ctx.fillText(`⬛ Fixed: ${fixedCount}`, 15, 56);
    ctx.fillText(`▬ Bones: ${boneCount}`, 100, 56);
