/**
 * Creature Presets
 *
 * Design principles (from user-designed creatures):
 *  - Rigid triangulated body cores (bones), few actuators (muscles)
 *  - Muscles connect body to feet for locomotion
 *  - High bone:muscle ratio = stable structure, controllable motion
 *  - All creatures 2-3m max dimension at SCALE=30
 *
 * Ordered simplest to most complex.
 */
export const PRESETS = [
  // ── 1. Triangle Walker ──────────────────────────────────────────────
  // Based on user Example 3. Rigid triangle body + 2 muscled legs.
  // Simplest design that can learn a walking gait.
  {
    name: 'Triangle Walker',
    description: '5 nodes — rigid triangle body, 2 muscled legs',
    nodes: [
      { id: 0, x: 275, y: 280 }, // Body top-left
      { id: 1, x: 325, y: 280 }, // Body top-right
      { id: 2, x: 300, y: 310 }, // Body bottom / hip
      { id: 3, x: 262, y: 348 }, // Left foot
      { id: 4, x: 338, y: 348 }  // Right foot
    ],
    constraints: [
      // Rigid triangulated body
      { type: 'bone', n1: 0, n2: 1 },
      { type: 'bone', n1: 0, n2: 2 },
      { type: 'bone', n1: 1, n2: 2 },
      // Left leg (2 muscles)
      { type: 'muscle', n1: 0, n2: 3 },
      { type: 'muscle', n1: 2, n2: 3 },
      // Right leg (2 muscles)
      { type: 'muscle', n1: 1, n2: 4 },
      { type: 'muscle', n1: 2, n2: 4 }
    ]
  },

  // ── 2. Box Biped ────────────────────────────────────────────────────
  // Fully braced rectangular body + 2 simple legs.
  // More stable than triangle, fewer muscles = easier to evolve.
  {
    name: 'Box Biped',
    description: '6 nodes — braced rectangle body, 2 legs',
    nodes: [
      { id: 0, x: 278, y: 278 }, // Top-left
      { id: 1, x: 322, y: 278 }, // Top-right
      { id: 2, x: 278, y: 312 }, // Bottom-left
      { id: 3, x: 322, y: 312 }, // Bottom-right
      { id: 4, x: 268, y: 348 }, // Left foot
      { id: 5, x: 332, y: 348 }  // Right foot
    ],
    constraints: [
      // Fully braced rectangle (6 bones)
      { type: 'bone', n1: 0, n2: 1 },
      { type: 'bone', n1: 1, n2: 3 },
      { type: 'bone', n1: 3, n2: 2 },
      { type: 'bone', n1: 2, n2: 0 },
      { type: 'bone', n1: 0, n2: 3 }, // Diagonal brace
      { type: 'bone', n1: 1, n2: 2 }, // Diagonal brace
      // Legs (1 muscle each)
      { type: 'muscle', n1: 2, n2: 4 },
      { type: 'muscle', n1: 3, n2: 5 }
    ]
  },

  // ── 3. Diamond Hopper ──────────────────────────────────────────────
  // Diamond-shaped body, feet below. Good for bouncing gaits.
  {
    name: 'Diamond Hopper',
    description: '6 nodes — diamond body, spring-loaded legs',
    nodes: [
      { id: 0, x: 300, y: 275 }, // Top
      { id: 1, x: 275, y: 300 }, // Left
      { id: 2, x: 325, y: 300 }, // Right
      { id: 3, x: 300, y: 320 }, // Bottom / hip
      { id: 4, x: 268, y: 350 }, // Left foot
      { id: 5, x: 332, y: 350 }  // Right foot
    ],
    constraints: [
      // Fully braced diamond (6 bones)
      { type: 'bone', n1: 0, n2: 1 },
      { type: 'bone', n1: 0, n2: 2 },
      { type: 'bone', n1: 1, n2: 3 },
      { type: 'bone', n1: 2, n2: 3 },
      { type: 'bone', n1: 0, n2: 3 }, // Vertical brace
      { type: 'bone', n1: 1, n2: 2 }, // Horizontal brace
      // Legs
      { type: 'muscle', n1: 1, n2: 4 },
      { type: 'muscle', n1: 2, n2: 5 }
    ]
  },

  // ── 4. Lopsided Runner ─────────────────────────────────────────────
  // Asymmetric body — left leg gets 2 muscles, right gets 1.
  // Creates unique evolved gaits due to imbalance.
  {
    name: 'Lopsided Runner',
    description: '6 nodes — asymmetric body, unique gaits',
    nodes: [
      { id: 0, x: 275, y: 280 }, // Top-left
      { id: 1, x: 310, y: 275 }, // Top-right (higher)
      { id: 2, x: 335, y: 295 }, // Right body
      { id: 3, x: 295, y: 310 }, // Bottom center
      { id: 4, x: 262, y: 350 }, // Left foot (wide)
      { id: 5, x: 345, y: 340 }  // Right foot (narrow)
    ],
    constraints: [
      // Fully braced quad body
      { type: 'bone', n1: 0, n2: 1 },
      { type: 'bone', n1: 1, n2: 2 },
      { type: 'bone', n1: 2, n2: 3 },
      { type: 'bone', n1: 3, n2: 0 },
      { type: 'bone', n1: 0, n2: 2 }, // Diagonal brace
      { type: 'bone', n1: 1, n2: 3 }, // Diagonal brace
      // Left leg (2 muscles — stronger)
      { type: 'muscle', n1: 3, n2: 4 },
      { type: 'muscle', n1: 0, n2: 4 },
      // Right leg (1 muscle — weaker)
      { type: 'muscle', n1: 2, n2: 5 }
    ]
  },

  // ── 5. Tall Biped ──────────────────────────────────────────────────
  // Tall narrow body with stilt-like legs.
  {
    name: 'Tall Biped',
    description: '6 nodes — tall body, stilt legs',
    nodes: [
      { id: 0, x: 300, y: 272 }, // Head
      { id: 1, x: 300, y: 298 }, // Body center
      { id: 2, x: 280, y: 312 }, // Left hip
      { id: 3, x: 320, y: 312 }, // Right hip
      { id: 4, x: 270, y: 352 }, // Left foot
      { id: 5, x: 330, y: 352 }  // Right foot
    ],
    constraints: [
      // Fully triangulated upper body
      { type: 'bone', n1: 0, n2: 1 },
      { type: 'bone', n1: 0, n2: 2 },
      { type: 'bone', n1: 0, n2: 3 },
      { type: 'bone', n1: 1, n2: 2 },
      { type: 'bone', n1: 1, n2: 3 },
      { type: 'bone', n1: 2, n2: 3 },
      // Legs
      { type: 'muscle', n1: 2, n2: 4 },
      { type: 'muscle', n1: 3, n2: 5 }
    ]
  },

  // ── 6. Tripod ──────────────────────────────────────────────────────
  // Fully triangulated body with 3 feet. Very stable.
  {
    name: 'Tripod',
    description: '7 nodes — 3-legged, very stable',
    nodes: [
      { id: 0, x: 300, y: 278 }, // Top
      { id: 1, x: 272, y: 305 }, // Body left
      { id: 2, x: 328, y: 305 }, // Body right
      { id: 3, x: 300, y: 310 }, // Body bottom
      { id: 4, x: 260, y: 348 }, // Left foot
      { id: 5, x: 340, y: 348 }, // Right foot
      { id: 6, x: 300, y: 350 }  // Center foot
    ],
    constraints: [
      // Fully triangulated body (6 bones)
      { type: 'bone', n1: 0, n2: 1 },
      { type: 'bone', n1: 0, n2: 2 },
      { type: 'bone', n1: 0, n2: 3 },
      { type: 'bone', n1: 1, n2: 2 },
      { type: 'bone', n1: 1, n2: 3 },
      { type: 'bone', n1: 2, n2: 3 },
      // 3 legs
      { type: 'muscle', n1: 1, n2: 4 },
      { type: 'muscle', n1: 2, n2: 5 },
      { type: 'muscle', n1: 3, n2: 6 }
    ]
  },

  // ── 7. Zigzag ──────────────────────────────────────────────────────
  // Wider triangulated body, 3 legs spread underneath.
  {
    name: 'Zigzag',
    description: '7 nodes — wide body, 3 offset legs',
    nodes: [
      { id: 0, x: 268, y: 282 }, // Top-left
      { id: 1, x: 300, y: 275 }, // Top-center
      { id: 2, x: 332, y: 282 }, // Top-right
      { id: 3, x: 300, y: 305 }, // Body center
      { id: 4, x: 258, y: 340 }, // Left foot
      { id: 5, x: 300, y: 348 }, // Center foot
      { id: 6, x: 342, y: 340 }  // Right foot
    ],
    constraints: [
      // Triangulated wide body
      { type: 'bone', n1: 0, n2: 1 },
      { type: 'bone', n1: 1, n2: 2 },
      { type: 'bone', n1: 0, n2: 3 },
      { type: 'bone', n1: 2, n2: 3 },
      { type: 'bone', n1: 1, n2: 3 },
      { type: 'bone', n1: 0, n2: 2 }, // Top brace
      // 3 legs
      { type: 'muscle', n1: 0, n2: 4 },
      { type: 'muscle', n1: 3, n2: 5 },
      { type: 'muscle', n1: 2, n2: 6 }
    ]
  },

  // ── 8. Wide Strider ────────────────────────────────────────────────
  // Based on user Example 1. Long flat heavily-triangulated body,
  // 2 feet spread wide, 2 spine-flexing muscles. Very high bone:muscle ratio.
  {
    name: 'Wide Strider',
    description: '8 nodes — long rigid body, 2 spine muscles flex feet',
    nodes: [
      { id: 0, x: 289, y: 293 }, // Upper spine left-center
      { id: 1, x: 324, y: 293 }, // Upper spine right
      { id: 2, x: 345, y: 327 }, // Right foot
      { id: 3, x: 319, y: 307 }, // Mid-body right
      { id: 4, x: 316, y: 293 }, // Upper spine right-center
      { id: 5, x: 280, y: 293 }, // Upper spine left
      { id: 6, x: 282, y: 307 }, // Mid-body left
      { id: 7, x: 255, y: 327 }  // Left foot
    ],
    constraints: [
      // Left triangle (foot, mid, spine)
      { type: 'bone', n1: 7, n2: 6 },
      { type: 'bone', n1: 6, n2: 5 },
      { type: 'bone', n1: 5, n2: 7 },
      // Mid-body cross-bracing
      { type: 'bone', n1: 6, n2: 0 },
      { type: 'bone', n1: 0, n2: 4 },
      { type: 'bone', n1: 4, n2: 3 },
      // Right triangle (spine, mid, foot)
      { type: 'bone', n1: 3, n2: 1 },
      { type: 'bone', n1: 1, n2: 2 },
      { type: 'bone', n1: 2, n2: 3 },
      // Additional bracing
      { type: 'bone', n1: 6, n2: 3 }, // Mid cross-brace
      { type: 'bone', n1: 3, n2: 0 }, // Right-to-left
      { type: 'bone', n1: 6, n2: 4 }, // Left-to-right
      // Spine-flexing muscles (only 2!)
      { type: 'muscle', n1: 5, n2: 0 },
      { type: 'muscle', n1: 4, n2: 1 }
    ]
  },

  // ── 9. Hexapod ─────────────────────────────────────────────────────
  // Wide triangulated body with 3 feet. More ground contact than Tripod.
  {
    name: 'Hexapod',
    description: '9 nodes — wide 6-point body, 3 feet',
    nodes: [
      { id: 0, x: 270, y: 285 }, // Body top-left
      { id: 1, x: 300, y: 280 }, // Body top-center
      { id: 2, x: 330, y: 285 }, // Body top-right
      { id: 3, x: 275, y: 308 }, // Body bottom-left
      { id: 4, x: 300, y: 312 }, // Body bottom-center
      { id: 5, x: 325, y: 308 }, // Body bottom-right
      { id: 6, x: 258, y: 345 }, // Left foot
      { id: 7, x: 300, y: 348 }, // Center foot
      { id: 8, x: 342, y: 345 }  // Right foot
    ],
    constraints: [
      // Triangulated body (9 bones)
      { type: 'bone', n1: 0, n2: 1 },
      { type: 'bone', n1: 1, n2: 2 },
      { type: 'bone', n1: 0, n2: 3 },
      { type: 'bone', n1: 1, n2: 4 },
      { type: 'bone', n1: 2, n2: 5 },
      { type: 'bone', n1: 3, n2: 4 },
      { type: 'bone', n1: 4, n2: 5 },
      { type: 'bone', n1: 0, n2: 4 }, // Cross brace
      { type: 'bone', n1: 2, n2: 4 }, // Cross brace
      // 3 legs
      { type: 'muscle', n1: 3, n2: 6 },
      { type: 'muscle', n1: 4, n2: 7 },
      { type: 'muscle', n1: 5, n2: 8 }
    ]
  },

  // ── 10. Heavy Runner ───────────────────────────────────────────────
  // Based on user Example 2. Rigid body box + 2 triangular feet
  // + mid connector node. 4 muscles give most degrees of freedom.
  // Most complex — needs many generations but can develop sophisticated gaits.
  {
    name: 'Heavy Runner',
    description: '11 nodes — rigid body, tri-feet, 4 muscles',
    nodes: [
      // Left foot triangle
      { id: 0, x: 255, y: 313 },
      { id: 1, x: 268, y: 313 },
      { id: 2, x: 261, y: 334 },
      // Right foot triangle
      { id: 3, x: 333, y: 312 },
      { id: 4, x: 345, y: 312 },
      { id: 5, x: 339, y: 335 },
      // Rigid body box (fully braced)
      { id: 6, x: 280, y: 299 }, // Bottom-left
      { id: 7, x: 323, y: 300 }, // Bottom-right
      { id: 8, x: 324, y: 286 }, // Top-right
      { id: 9, x: 282, y: 285 }, // Top-left
      // Mid connector
      { id: 10, x: 301, y: 313 }
    ],
    constraints: [
      // Body box — fully braced rectangle (6 bones)
      { type: 'bone', n1: 6, n2: 9 }, // Left edge
      { type: 'bone', n1: 9, n2: 8 }, // Top edge
      { type: 'bone', n1: 8, n2: 7 }, // Right edge
      { type: 'bone', n1: 7, n2: 6 }, // Bottom edge
      { type: 'bone', n1: 9, n2: 7 }, // Diagonal brace
      { type: 'bone', n1: 8, n2: 6 }, // Diagonal brace
      // Left foot triangle (3 bones)
      { type: 'bone', n1: 0, n2: 1 },
      { type: 'bone', n1: 1, n2: 2 },
      { type: 'bone', n1: 2, n2: 0 },
      // Right foot triangle (3 bones)
      { type: 'bone', n1: 3, n2: 4 },
      { type: 'bone', n1: 4, n2: 5 },
      { type: 'bone', n1: 5, n2: 3 },
      // Foot-to-body connections (4 bones)
      { type: 'bone', n1: 1, n2: 6 }, // Left foot → body left
      { type: 'bone', n1: 7, n2: 3 }, // Body right → right foot
      { type: 'bone', n1: 3, n2: 6 }, // Cross brace
      { type: 'bone', n1: 1, n2: 7 }, // Cross brace
      // Mid connector bones (4 bones)
      { type: 'bone', n1: 10, n2: 1 },
      { type: 'bone', n1: 10, n2: 3 },
      { type: 'bone', n1: 10, n2: 6 },
      { type: 'bone', n1: 10, n2: 7 },
      // 4 muscles — diagonal body-to-foot + connector-to-foot-tip
      { type: 'muscle', n1: 9, n2: 0 },  // Body top-left → left foot
      { type: 'muscle', n1: 8, n2: 4 },  // Body top-right → right foot
      { type: 'muscle', n1: 10, n2: 2 }, // Connector → left foot bottom
      { type: 'muscle', n1: 10, n2: 5 }  // Connector → right foot bottom
    ]
  }
];
