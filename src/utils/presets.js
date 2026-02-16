/**
 * Working Creature Presets
 * Designed for realistic locomotion with proper body structure,
 * articulated limbs, and coordinated muscle groups.
 *
 * Ordered from simplest (learns fast) to complex (powerful but slow to evolve)
 */
export const PRESETS = [
  {
    name: 'Simple Hopper',
    description: 'Easiest to evolve - 3 nodes, 1 muscle, learns in 10-20 gens',
    nodes: [
      { id: 0, x: 280, y: 280 }, // Body left
      { id: 1, x: 320, y: 280 }, // Body right
      { id: 2, x: 300, y: 350 }  // Foot
    ],
    constraints: [
      { type: 'bone', n1: 0, n2: 1 },  // Body
      { type: 'bone', n1: 0, n2: 2 },  // Left leg
      { type: 'bone', n1: 1, n2: 2 },  // Right leg
      { type: 'muscle', n1: 0, n2: 2 } // Spring muscle
    ]
  },

  {
    name: 'Basic Walker',
    description: 'Simple 4-node walker - 2 legs, 2 muscles, learns in 20-40 gens',
    nodes: [
      { id: 0, x: 280, y: 270 }, // Body left
      { id: 1, x: 320, y: 270 }, // Body right
      { id: 2, x: 270, y: 340 }, // Left foot
      { id: 3, x: 330, y: 340 }  // Right foot
    ],
    constraints: [
      { type: 'bone', n1: 0, n2: 1 },  // Body
      { type: 'bone', n1: 0, n2: 2 },  // Left leg
      { type: 'bone', n1: 1, n2: 3 },  // Right leg
      { type: 'muscle', n1: 0, n2: 2 }, // Left muscle
      { type: 'muscle', n1: 1, n2: 3 }  // Right muscle
    ]
  },

  {
    name: 'Tripod Walker',
    description: 'Stable 3-leg design - learns in 30-50 gens',
    nodes: [
      { id: 0, x: 300, y: 260 }, // Body center
      { id: 1, x: 260, y: 340 }, // Left foot
      { id: 2, x: 300, y: 340 }, // Center foot
      { id: 3, x: 340, y: 340 }  // Right foot
    ],
    constraints: [
      { type: 'bone', n1: 0, n2: 1 },
      { type: 'bone', n1: 0, n2: 2 },
      { type: 'bone', n1: 0, n2: 3 },
      { type: 'muscle', n1: 0, n2: 1 },
      { type: 'muscle', n1: 0, n2: 2 },
      { type: 'muscle', n1: 0, n2: 3 }
    ]
  },

  {
    name: 'Bipedal Walker',
    description: 'Articulated legs with knees - learns in 50-100 gens',
    nodes: [
      // Body core (triangle for stability)
      { id: 0, x: 280, y: 260 }, // Left shoulder
      { id: 1, x: 320, y: 260 }, // Right shoulder
      { id: 2, x: 300, y: 240 }, // Head/top

      // Left leg
      { id: 3, x: 270, y: 310 }, // Left hip
      { id: 4, x: 260, y: 360 }, // Left knee
      { id: 5, x: 250, y: 400 }, // Left foot

      // Right leg
      { id: 6, x: 330, y: 310 }, // Right hip
      { id: 7, x: 340, y: 360 }, // Right knee
      { id: 8, x: 350, y: 400 }  // Right foot
    ],
    constraints: [
      // Body structure (rigid)
      { type: 'bone', n1: 0, n2: 1 },
      { type: 'bone', n1: 0, n2: 2 },
      { type: 'bone', n1: 1, n2: 2 },
      { type: 'bone', n1: 0, n2: 3 },
      { type: 'bone', n1: 1, n2: 6 },

      // Left leg bones
      { type: 'bone', n1: 3, n2: 4 },
      { type: 'bone', n1: 4, n2: 5 },

      // Right leg bones
      { type: 'bone', n1: 6, n2: 7 },
      { type: 'bone', n1: 7, n2: 8 },

      // Left leg muscles (hip and knee control)
      { type: 'muscle', n1: 0, n2: 4 }, // Hip flexor
      { type: 'muscle', n1: 3, n2: 5 }, // Knee extension

      // Right leg muscles (hip and knee control)
      { type: 'muscle', n1: 1, n2: 7 }, // Hip flexor
      { type: 'muscle', n1: 6, n2: 8 }, // Knee extension

      // Cross-body stabilization
      { type: 'muscle', n1: 3, n2: 6 }  // Hip stabilizer
    ]
  },

  {
    name: 'Stable Quadruped',
    description: 'Four-legged walker with spine and articulated legs',
    nodes: [
      // Spine/body (horizontal)
      { id: 0, x: 240, y: 280 }, // Front body
      { id: 1, x: 340, y: 280 }, // Rear body
      { id: 2, x: 290, y: 260 }, // Mid spine (raised)

      // Front left leg
      { id: 3, x: 220, y: 340 }, // Front left knee
      { id: 4, x: 210, y: 390 }, // Front left foot

      // Front right leg
      { id: 5, x: 260, y: 340 }, // Front right knee
      { id: 6, x: 270, y: 390 }, // Front right foot

      // Rear left leg
      { id: 7, x: 320, y: 340 }, // Rear left knee
      { id: 8, x: 310, y: 390 }, // Rear left foot

      // Rear right leg
      { id: 9, x: 360, y: 340 },  // Rear right knee
      { id: 10, x: 370, y: 390 }  // Rear right foot
    ],
    constraints: [
      // Spine structure
      { type: 'bone', n1: 0, n2: 1 },
      { type: 'bone', n1: 0, n2: 2 },
      { type: 'bone', n1: 1, n2: 2 },

      // Front left leg
      { type: 'bone', n1: 0, n2: 3 },
      { type: 'bone', n1: 3, n2: 4 },
      { type: 'muscle', n1: 0, n2: 4 }, // Leg control

      // Front right leg
      { type: 'bone', n1: 0, n2: 5 },
      { type: 'bone', n1: 5, n2: 6 },
      { type: 'muscle', n1: 0, n2: 6 }, // Leg control

      // Rear left leg
      { type: 'bone', n1: 1, n2: 7 },
      { type: 'bone', n1: 7, n2: 8 },
      { type: 'muscle', n1: 1, n2: 8 }, // Leg control

      // Rear right leg
      { type: 'bone', n1: 1, n2: 9 },
      { type: 'bone', n1: 9, n2: 10 },
      { type: 'muscle', n1: 1, n2: 10 }, // Leg control

      // Leg coordination muscles
      { type: 'muscle', n1: 3, n2: 5 },  // Front leg sync
      { type: 'muscle', n1: 7, n2: 9 },  // Rear leg sync

      // Spine flexibility
      { type: 'muscle', n1: 0, n2: 1 }   // Spine contraction
    ]
  },

  {
    name: 'Inchworm Crawler',
    description: 'Wave-based locomotion with segmented body',
    nodes: [
      // Body segments (6 points in arc)
      { id: 0, x: 200, y: 300 }, // Front
      { id: 1, x: 250, y: 290 },
      { id: 2, x: 300, y: 285 },
      { id: 3, x: 350, y: 290 },
      { id: 4, x: 400, y: 300 },
      { id: 5, x: 450, y: 310 }, // Rear

      // Ground contact points
      { id: 6, x: 190, y: 360 }, // Front foot
      { id: 7, x: 460, y: 370 }  // Rear foot
    ],
    constraints: [
      // Spine bones
      { type: 'bone', n1: 0, n2: 1 },
      { type: 'bone', n1: 1, n2: 2 },
      { type: 'bone', n1: 2, n2: 3 },
      { type: 'bone', n1: 3, n2: 4 },
      { type: 'bone', n1: 4, n2: 5 },

      // Feet connections
      { type: 'bone', n1: 0, n2: 6 },
      { type: 'bone', n1: 5, n2: 7 },

      // Wave muscles (alternate contractions create wave)
      { type: 'muscle', n1: 0, n2: 2 }, // Front wave
      { type: 'muscle', n1: 1, n2: 3 }, // Mid-front wave
      { type: 'muscle', n1: 2, n2: 4 }, // Mid-rear wave
      { type: 'muscle', n1: 3, n2: 5 }, // Rear wave

      // Anchoring muscles
      { type: 'muscle', n1: 0, n2: 6 }, // Front anchor
      { type: 'muscle', n1: 5, n2: 7 }, // Rear anchor

      // Long-range contraction
      { type: 'muscle', n1: 0, n2: 4 }  // Body compression
    ]
  },

  {
    name: 'Spring Hopper',
    description: 'Explosive jumping locomotion with spring mechanism',
    nodes: [
      // Body core (compact triangle)
      { id: 0, x: 280, y: 250 },
      { id: 1, x: 320, y: 250 },
      { id: 2, x: 300, y: 230 }, // Top

      // Spring legs (front and rear)
      { id: 3, x: 270, y: 300 }, // Front leg mid
      { id: 4, x: 260, y: 360 }, // Front foot

      { id: 5, x: 330, y: 300 }, // Rear leg mid
      { id: 6, x: 340, y: 360 }, // Rear foot

      // Tail for balance
      { id: 7, x: 350, y: 270 }
    ],
    constraints: [
      // Body structure
      { type: 'bone', n1: 0, n2: 1 },
      { type: 'bone', n1: 0, n2: 2 },
      { type: 'bone', n1: 1, n2: 2 },

      // Front leg
      { type: 'bone', n1: 0, n2: 3 },
      { type: 'bone', n1: 3, n2: 4 },

      // Rear leg
      { type: 'bone', n1: 1, n2: 5 },
      { type: 'bone', n1: 5, n2: 6 },

      // Tail
      { type: 'bone', n1: 1, n2: 7 },

      // Spring muscles (powerful compression)
      { type: 'muscle', n1: 0, n2: 4 }, // Front spring
      { type: 'muscle', n1: 1, n2: 6 }, // Rear spring
      { type: 'muscle', n1: 2, n2: 3 }, // Front assist
      { type: 'muscle', n1: 2, n2: 5 }, // Rear assist

      // Coordination
      { type: 'muscle', n1: 3, n2: 5 }, // Leg sync

      // Tail balance
      { type: 'muscle', n1: 2, n2: 7 }  // Tail control
    ]
  },

  {
    name: 'Centipede',
    description: 'Many-legged stable walker with wave-like gait',
    nodes: [
      // Spine (7 segments)
      { id: 0, x: 180, y: 280 },
      { id: 1, x: 220, y: 275 },
      { id: 2, x: 260, y: 272 },
      { id: 3, x: 300, y: 270 },
      { id: 4, x: 340, y: 272 },
      { id: 5, x: 380, y: 275 },
      { id: 6, x: 420, y: 280 },

      // Left legs (7 legs)
      { id: 7, x: 170, y: 330 },
      { id: 8, x: 210, y: 330 },
      { id: 9, x: 250, y: 330 },
      { id: 10, x: 290, y: 330 },
      { id: 11, x: 330, y: 330 },
      { id: 12, x: 370, y: 330 },
      { id: 13, x: 410, y: 330 },

      // Right legs (7 legs)
      { id: 14, x: 190, y: 330 },
      { id: 15, x: 230, y: 330 },
      { id: 16, x: 270, y: 330 },
      { id: 17, x: 310, y: 330 },
      { id: 18, x: 350, y: 330 },
      { id: 19, x: 390, y: 330 },
      { id: 20, x: 430, y: 330 }
    ],
    constraints: [
      // Spine bones
      { type: 'bone', n1: 0, n2: 1 },
      { type: 'bone', n1: 1, n2: 2 },
      { type: 'bone', n1: 2, n2: 3 },
      { type: 'bone', n1: 3, n2: 4 },
      { type: 'bone', n1: 4, n2: 5 },
      { type: 'bone', n1: 5, n2: 6 },

      // Left leg bones
      { type: 'bone', n1: 0, n2: 7 },
      { type: 'bone', n1: 1, n2: 8 },
      { type: 'bone', n1: 2, n2: 9 },
      { type: 'bone', n1: 3, n2: 10 },
      { type: 'bone', n1: 4, n2: 11 },
      { type: 'bone', n1: 5, n2: 12 },
      { type: 'bone', n1: 6, n2: 13 },

      // Right leg bones
      { type: 'bone', n1: 0, n2: 14 },
      { type: 'bone', n1: 1, n2: 15 },
      { type: 'bone', n1: 2, n2: 16 },
      { type: 'bone', n1: 3, n2: 17 },
      { type: 'bone', n1: 4, n2: 18 },
      { type: 'bone', n1: 5, n2: 19 },
      { type: 'bone', n1: 6, n2: 20 },

      // Leg muscles (alternating pattern for wave gait)
      { type: 'muscle', n1: 0, n2: 7 },  // Left 1
      { type: 'muscle', n1: 1, n2: 15 }, // Right 2
      { type: 'muscle', n1: 2, n2: 9 },  // Left 3
      { type: 'muscle', n1: 3, n2: 17 }, // Right 4
      { type: 'muscle', n1: 4, n2: 11 }, // Left 5
      { type: 'muscle', n1: 5, n2: 19 }, // Right 6
      { type: 'muscle', n1: 6, n2: 13 }, // Left 7

      // Spine flexibility muscles
      { type: 'muscle', n1: 0, n2: 2 }, // Front spine
      { type: 'muscle', n1: 2, n2: 4 }, // Mid spine
      { type: 'muscle', n1: 4, n2: 6 }  // Rear spine
    ]
  },

  {
    name: 'Rolling Wheel',
    description: 'Spins efficiently - exploits physics but fun!',
    nodes: [
      { id: 0, x: 270, y: 280 },
      { id: 1, x: 330, y: 280 },
      { id: 2, x: 330, y: 340 },
      { id: 3, x: 270, y: 340 }
    ],
    constraints: [
      // Square frame
      { type: 'bone', n1: 0, n2: 1 },
      { type: 'bone', n1: 1, n2: 2 },
      { type: 'bone', n1: 2, n2: 3 },
      { type: 'bone', n1: 3, n2: 0 },

      // Diagonal muscles (alternating contraction creates rotation)
      { type: 'muscle', n1: 0, n2: 2 },
      { type: 'muscle', n1: 1, n2: 3 },

      // Side muscles (for balance and control)
      { type: 'muscle', n1: 0, n2: 1 },
      { type: 'muscle', n1: 2, n2: 3 }
    ]
  }
];
