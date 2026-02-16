/**
 * Pre-built creature designs.
 * Each preset has: name, nodes [{id, x, y}], constraints [{type, n1, n2}]
 * Coordinates are relative, centered around ~300,300 for design canvas.
 */
export const PRESETS = [
  {
    name: 'Simple Walker',
    description: '3 joints, 2 bones, 1 muscle - basic bipod',
    nodes: [
      { id: 0, x: 300, y: 280 },
      { id: 1, x: 260, y: 340 },
      { id: 2, x: 340, y: 340 }
    ],
    constraints: [
      { type: 'bone', n1: 0, n2: 1 },
      { type: 'bone', n1: 0, n2: 2 },
      { type: 'muscle', n1: 1, n2: 2 }
    ]
  },
  {
    name: 'Quadruped',
    description: '5 joints, 4 bones, 2 muscles',
    nodes: [
      { id: 0, x: 260, y: 280 },
      { id: 1, x: 340, y: 280 },
      { id: 2, x: 220, y: 350 },
      { id: 3, x: 300, y: 350 },
      { id: 4, x: 380, y: 350 }
    ],
    constraints: [
      { type: 'bone', n1: 0, n2: 1 },
      { type: 'bone', n1: 0, n2: 2 },
      { type: 'bone', n1: 0, n2: 3 },
      { type: 'bone', n1: 1, n2: 3 },
      { type: 'bone', n1: 1, n2: 4 },
      { type: 'muscle', n1: 2, n2: 3 },
      { type: 'muscle', n1: 3, n2: 4 }
    ]
  },
  {
    name: 'Spider',
    description: '7 joints, 6 bones, 2 muscles',
    nodes: [
      { id: 0, x: 300, y: 280 },
      { id: 1, x: 240, y: 260 },
      { id: 2, x: 360, y: 260 },
      { id: 3, x: 200, y: 340 },
      { id: 4, x: 270, y: 340 },
      { id: 5, x: 330, y: 340 },
      { id: 6, x: 400, y: 340 }
    ],
    constraints: [
      { type: 'bone', n1: 0, n2: 1 },
      { type: 'bone', n1: 0, n2: 2 },
      { type: 'bone', n1: 1, n2: 3 },
      { type: 'bone', n1: 1, n2: 4 },
      { type: 'bone', n1: 2, n2: 5 },
      { type: 'bone', n1: 2, n2: 6 },
      { type: 'muscle', n1: 3, n2: 4 },
      { type: 'muscle', n1: 5, n2: 6 }
    ]
  },
  {
    name: 'Snake',
    description: '5 joints in a line, 4 bones, 3 muscles',
    nodes: [
      { id: 0, x: 200, y: 320 },
      { id: 1, x: 260, y: 320 },
      { id: 2, x: 320, y: 320 },
      { id: 3, x: 380, y: 320 },
      { id: 4, x: 440, y: 320 }
    ],
    constraints: [
      { type: 'bone', n1: 0, n2: 1 },
      { type: 'bone', n1: 1, n2: 2 },
      { type: 'bone', n1: 2, n2: 3 },
      { type: 'bone', n1: 3, n2: 4 },
      { type: 'muscle', n1: 0, n2: 2 },
      { type: 'muscle', n1: 1, n2: 3 },
      { type: 'muscle', n1: 2, n2: 4 }
    ]
  },
  {
    name: 'Wheel',
    description: '4 joints in a square, 4 bones, 4 muscles',
    nodes: [
      { id: 0, x: 270, y: 280 },
      { id: 1, x: 330, y: 280 },
      { id: 2, x: 330, y: 340 },
      { id: 3, x: 270, y: 340 }
    ],
    constraints: [
      { type: 'bone', n1: 0, n2: 1 },
      { type: 'bone', n1: 1, n2: 2 },
      { type: 'bone', n1: 2, n2: 3 },
      { type: 'bone', n1: 3, n2: 0 },
      { type: 'muscle', n1: 0, n2: 2 },
      { type: 'muscle', n1: 1, n2: 3 },
      { type: 'muscle', n1: 0, n2: 1 },
      { type: 'muscle', n1: 2, n2: 3 }
    ]
  }
];
