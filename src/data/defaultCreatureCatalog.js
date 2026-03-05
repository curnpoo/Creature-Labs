import polycreatureA from './default-creatures/polycreature-2026-02-19t04-36-53-169z-1.json';
import creature5 from './default-creatures/creature-5.json';
import creature8 from './default-creatures/creature-8.json';

const DEFAULT_CREATURE_SPECS = [
  { id: 'starter-polycreature-a', name: 'Starter Creature A', payload: polycreatureA },
  { id: 'starter-creature-5', name: 'Starter Creature 5', payload: creature5 },
  { id: 'starter-creature-8', name: 'Starter Creature 8', payload: creature8 }
];

function toDesign(payload) {
  if (!payload || !Array.isArray(payload.nodes) || !Array.isArray(payload.constraints)) {
    return null;
  }
  return {
    nodes: payload.nodes.map(node => ({ ...node })),
    constraints: payload.constraints.map(constraint => ({ ...constraint }))
  };
}

export function buildDefaultCreatureCatalogEntries() {
  return DEFAULT_CREATURE_SPECS
    .map((spec, index) => {
      const design = toDesign(spec.payload);
      if (!design) return null;
      return {
        id: `default-${spec.id}-${index + 1}`,
        name: spec.name,
        createdAt: spec.payload?.createdAt || new Date(0).toISOString(),
        thumbnail: '',
        design
      };
    })
    .filter(Boolean);
}
