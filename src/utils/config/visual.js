/**
 * Visual & UI Parameters
 * Controls rendering and display settings
 */
export const VISUAL_CONFIG = {
  // Camera
  defaultZoom: 1.8,             // Default zoom level
  cameraMode: 'lock',           // Camera mode: 'lock' or 'free'

  // Ghost/History
  ghostMaxAge: 10,              // Max generations a ghost trail persists
  replayMax: 180,               // Maximum replay history entries

  // Spawn
  spawnX: 60,                   // X coordinate for creature spawn

  // Colors (can be expanded)
  backgroundColor: '#15171b',
  groundColor: '#2a2d35',
  leaderColor: '#00f2ff',
};
