// Entry point for the application.
import './styles.css';

document.addEventListener('DOMContentLoaded', () => {
  // Start button to move from splash to design screen
  const startBtn = document.getElementById('btn-start-draw');
  if (startBtn) {
    startBtn.addEventListener('click', () => {
      const splash = document.getElementById('screen-splash');
      const draw = document.getElementById('screen-draw');
      if (splash) splash.classList.remove('active');
      if (draw) draw.classList.add('active');
    });
  }

  // Placeholder: Initialize simulation and UI components if needed
  // const sim = new Simulation();
  // const monitor = new EvolutionMonitor();
});