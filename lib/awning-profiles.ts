/**
 * Awning frame profiles — single source of truth.
 * Each FrameSpec defines a 2D cross-section that gets extruded/revolved into a 3D mesh.
 * Both 2D and 3D renderers will derive from these profiles.
 */

export interface Point2D {
  x: number;
  y: number;
}

export type SweepOp = "extrude" | "revolve" | "loft";

export interface FrameSpec {
  id: string;
  label: string;
  // Profile: a parametric 2D cross-section (typically the "side view" of the awning)
  // w = width, h = height, d = depth/protrusion
  profile: (w: number, h: number, d: number) => Point2D[];
  sweep: SweepOp; // how to turn the profile into 3D
  valence?: number; // optional: hanging skirt multiplier (0..1)
}

/**
 * Standard awning: flat top, vertical front, angled side.
 * profile: flat rectangle extruded along width.
 */
export const STANDARD: FrameSpec = {
  id: "standard",
  label: "Standard",
  profile: (w, h, d) => [
    { x: -w / 2, y: 0 },        // wall-left
    { x: w / 2, y: 0 },         // wall-right
    { x: w / 2, y: -h },        // front-right (depth down)
    { x: -w / 2, y: -h },       // front-left
  ],
  sweep: "extrude",
};

/**
 * Standard w/ Valence: standard shape with a decorative skirt hanging from the front edge.
 */
export const STANDARD_VALENCE: FrameSpec = {
  id: "standard-valence",
  label: "Standard w/ Valence",
  profile: (w, h, d) => {
    const vSkirt = h * 0.15; // valence depth
    return [
      { x: -w / 2, y: 0 },
      { x: w / 2, y: 0 },
      { x: w / 2, y: -h },
      // Valence (small drop with curve)
      { x: w / 2, y: -h - vSkirt * 0.7 },
      { x: 0, y: -h - vSkirt },
      { x: -w / 2, y: -h - vSkirt * 0.7 },
      { x: -w / 2, y: -h },
    ];
  },
  sweep: "extrude",
  valence: 0.15,
};

/**
 * Arch: front edge curves upward (concave up).
 */
export const ARCH: FrameSpec = {
  id: "arch",
  label: "Arch",
  profile: (w, h, d) => {
    const rise = h * 0.4;
    const steps = 8;
    const points: Point2D[] = [];
    // Wall line
    points.push({ x: -w / 2, y: 0 }, { x: w / 2, y: 0 });
    // Arch from right to left
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const angle = t * Math.PI;
      const x = w / 2 - t * w;
      const y = -h + rise * Math.sin(angle);
      points.push({ x, y });
    }
    return points;
  },
  sweep: "extrude",
};

/**
 * Bullnose: rounded front edge, like a curved roller blind.
 */
export const BULLNOSE: FrameSpec = {
  id: "bullnose",
  label: "Bullnose",
  profile: (w, h, d) => {
    const radius = h * 0.2;
    const steps = 6;
    const points: Point2D[] = [
      { x: -w / 2, y: 0 },
      { x: w / 2, y: 0 },
    ];
    // Rounded edge
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const angle = t * (Math.PI / 2);
      points.push({
        x: w / 2 - radius * Math.sin(angle),
        y: -radius * (1 - Math.cos(angle)) - h + radius,
      });
    }
    // Left side down
    points.push(
      { x: -w / 2, y: -h + radius },
      { x: -w / 2, y: 0 }
    );
    return points;
  },
  sweep: "extrude",
};

/**
 * Dome: spherical/hemispherical top (double-curved).
 * Revolved to create a dome shape.
 */
export const DOME: FrameSpec = {
  id: "dome",
  label: "Dome",
  profile: (w, h, d) => {
    const radius = w / 2.2;
    const steps = 12;
    const points: Point2D[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const angle = t * Math.PI;
      const x = -radius + t * (radius * 2);
      const y = -(h + radius * Math.sin(angle));
      points.push({ x, y });
    }
    return points;
  },
  sweep: "revolve",
};

/**
 * Circular: quarter-circle sweep, like a barrel awning.
 */
export const CIRCULAR: FrameSpec = {
  id: "circular",
  label: "Circular",
  profile: (w, h, d) => {
    const radius = h * 1.2;
    const steps = 10;
    const points: Point2D[] = [
      { x: -w / 2, y: 0 },
      { x: w / 2, y: 0 },
    ];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const angle = t * (Math.PI / 2);
      points.push({
        x: w / 2 - radius * Math.sin(angle),
        y: -radius * (1 - Math.cos(angle)),
      });
    }
    for (let i = steps; i >= 0; i--) {
      const t = i / steps;
      const angle = t * (Math.PI / 2);
      points.push({
        x: -w / 2 + radius * Math.sin(angle),
        y: -radius * (1 - Math.cos(angle)),
      });
    }
    return points;
  },
  sweep: "extrude",
};

/**
 * Gable: two sloped faces meeting at a peak (like a roof).
 */
export const GABLE: FrameSpec = {
  id: "gable",
  label: "Gable",
  profile: (w, h, d) => {
    const peakH = h * 1.5;
    return [
      { x: -w / 2, y: 0 },
      { x: w / 2, y: 0 },
      { x: w / 2, y: -h },
      { x: 0, y: -peakH },
      { x: -w / 2, y: -h },
    ];
  },
  sweep: "extrude",
};

/**
 * Half Round: semicircular (180°) sweep.
 */
export const HALF_ROUND: FrameSpec = {
  id: "half-round",
  label: "Half Round",
  profile: (w, h, d) => {
    const radius = w / 2;
    const steps = 12;
    const points: Point2D[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const angle = t * Math.PI;
      const x = -radius + t * (radius * 2);
      const y = -h - radius * Math.sin(angle);
      points.push({ x, y });
    }
    return points;
  },
  sweep: "extrude",
};

/**
 * Quarter Round: quarter-circle (90°) sweep.
 */
export const QUARTER_ROUND: FrameSpec = {
  id: "quarter-round",
  label: "Quarter Round",
  profile: (w, h, d) => {
    const radius = h * 1.4;
    const steps = 8;
    const points: Point2D[] = [
      { x: -w / 2, y: 0 },
      { x: w / 2, y: 0 },
    ];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const angle = t * (Math.PI / 2);
      points.push({
        x: w / 2 - radius * Math.sin(angle),
        y: -h - radius * (1 - Math.cos(angle)),
      });
    }
    for (let i = steps; i >= 0; i--) {
      const t = i / steps;
      const angle = t * (Math.PI / 2);
      points.push({
        x: -w / 2 + radius * Math.sin(angle),
        y: -h - radius * (1 - Math.cos(angle)),
      });
    }
    return points;
  },
  sweep: "extrude",
};

/**
 * Concave: inward curve (opposite of arch).
 */
export const CONCAVE: FrameSpec = {
  id: "concave",
  label: "Concave",
  profile: (w, h, d) => {
    const dip = h * 0.25;
    const steps = 8;
    const points: Point2D[] = [
      { x: -w / 2, y: 0 },
      { x: w / 2, y: 0 },
    ];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const angle = t * Math.PI;
      const x = w / 2 - t * w;
      const y = -h + dip * (1 - Math.cos(angle));
      points.push({ x, y });
    }
    return points;
  },
  sweep: "extrude",
};

/**
 * Waterfall: front edge curves down with a decorative lower lip.
 */
export const WATERFALL: FrameSpec = {
  id: "waterfall",
  label: "Waterfall",
  profile: (w, h, d) => {
    const dropH = h * 0.2;
    const lipH = h * 0.08;
    return [
      { x: -w / 2, y: 0 },
      { x: w / 2, y: 0 },
      { x: w / 2, y: -h },
      // Drop with curve
      { x: w / 2, y: -h - dropH * 0.7 },
      { x: 0, y: -h - dropH },
      { x: -w / 2, y: -h - dropH * 0.7 },
      { x: -w / 2, y: -h },
      // Lip (small upward edge)
      { x: -w / 2, y: -h - lipH },
      { x: w / 2, y: -h - lipH },
      { x: w / 2, y: 0 },
    ];
  },
  sweep: "extrude",
};

/**
 * Box: simple rectangular extrusion (flat top).
 */
export const BOX: FrameSpec = {
  id: "box",
  label: "Box",
  profile: (w, h, d) => {
    return [
      { x: -w / 2, y: 0 },
      { x: w / 2, y: 0 },
      { x: w / 2, y: -h },
      { x: -w / 2, y: -h },
    ];
  },
  sweep: "extrude",
};

/**
 * Registry of all awning frame styles.
 */
export const AWNING_PROFILES: FrameSpec[] = [
  STANDARD,
  STANDARD_VALENCE,
  ARCH,
  BULLNOSE,
  DOME,
  CIRCULAR,
  GABLE,
  HALF_ROUND,
  QUARTER_ROUND,
  CONCAVE,
  WATERFALL,
  BOX,
];

/**
 * Camera presets per sign type.
 */
export interface CameraPreset {
  camera2d: "front" | "hero3q"; // locked 2D framing
  orbitStart: [az: number, el: number]; // where 3D orbit lands first (azimuth, elevation in degrees)
}

export const SIGN_VIEW: Record<"letters" | "awning" | "lightbox", CameraPreset> = {
  letters: {
    camera2d: "front",
    orbitStart: [0, 0], // flat, wall-mounted → dead-on
  },
  lightbox: {
    camera2d: "front",
    orbitStart: [0, 0], // flat cabinet → dead-on
  },
  awning: {
    camera2d: "hero3q",
    orbitStart: [45, 30], // depth/curve must read → 3/4 view
  },
};
