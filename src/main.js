    opt.textContent = `${item.name || 'Brain'} · ${gen} · ${dist}`;
  meta.textContent = `${mode} · ${selected.name || 'Brain'} · ${selected.distance || 0}m · ${new Date(selected.createdAt).toLocaleString()}`;
    if (fitnessTag) fitnessTag.textContent = `LIVE · A${sim.championAwards}`;
  if (fitnessTag) fitnessTag.textContent = sim.replayPlaying ? 'REPLAY ▶' : 'REPLAY ⏸';
  // Camera follow — center creature in visible canvas area (between panels)
