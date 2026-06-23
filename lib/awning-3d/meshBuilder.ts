import * as THREE from "three";
import { FrameSpec } from "../awning-profiles";

/**
 * Build a Three.js mesh group from a FrameSpec.
 *
 * Coordinate convention (matches the plan's "single source of truth" requirement):
 *   X  = width  (left/right, centred at 0, spans ±W/2)
 *   Y  = height (up, 0 = top/wall-line, negative = downward)
 *   Z  = depth  (protrusion from wall; 0 = wall face, positive = outward)
 *
 * The "profile" from FrameSpec is the SIDE cross-section (YZ-plane):
 *   point.x → depth (Z)
 *   point.y → height (Y)
 * We extrude that cross-section along the width axis (X) to get the awning body.
 */
export function buildAwningMesh(spec: FrameSpec, colour: string, isLit: boolean, night: boolean): THREE.Group {
  // Physical dimensions  (in Three.js units ≈ cm)
  const W = 120;   // total width
  const H = 50;    // awning face height
  const D = 55;    // depth (protrusion from wall)

  const group = new THREE.Group();

  // --- materials -----------------------------------------------------------
  const hexCol = new THREE.Color(colour);
  const faceMat = new THREE.MeshStandardMaterial({
    color: hexCol,
    roughness: 0.55,
    metalness: 0.05,
    side: THREE.DoubleSide,
    emissive: isLit ? hexCol : new THREE.Color(0, 0, 0),
    emissiveIntensity: isLit ? (night ? 0.45 : 0.12) : 0,
  });
  const topMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(colour).multiplyScalar(1.2),   // slightly lighter top
    roughness: 0.55,
    metalness: 0.05,
    side: THREE.DoubleSide,
  });
  const sideMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(colour).multiplyScalar(0.6),   // darker side
    roughness: 0.7,
    metalness: 0.05,
    side: THREE.DoubleSide,
  });

  // Build the shape depending on the frame id
  switch (spec.id) {

    // ── Standard ─────────────────────────────────────────────────────────────
    case "standard": {
      // Top sloped panel
      const top = new THREE.BufferGeometry();
      const topVerts = new Float32Array([
        -W / 2, 0,   0,     // wall-left
         W / 2, 0,   0,     // wall-right
         W / 2, -H * 0.4, D, // front-right (drops slightly)
        -W / 2, -H * 0.4, D, // front-left
      ]);
      top.setAttribute("position", new THREE.BufferAttribute(topVerts, 3));
      top.setIndex([0,1,2, 0,2,3]);
      top.computeVertexNormals();
      group.add(new THREE.Mesh(top, topMat));

      // Front face (vertical rectangle)
      const face = new THREE.PlaneGeometry(W, H);
      face.translate(0, -H * 0.4 - H / 2, D);
      group.add(new THREE.Mesh(face, faceMat));

      // Left side triangle
      addSideFace(group, -W / 2, 0, 0, -H * 0.4, D, H, sideMat);
      addSideFace(group,  W / 2, 0, 0, -H * 0.4, D, H, sideMat, true);
      break;
    }

    // ── Standard w/ Valence ───────────────────────────────────────────────────
    case "standard-valence": {
      const faceH = H * 0.65;
      const valH  = H * 0.25;
      const top = new THREE.BufferGeometry();
      const v = new Float32Array([
        -W / 2, 0,  0,
         W / 2, 0,  0,
         W / 2, -H * 0.4, D,
        -W / 2, -H * 0.4, D,
      ]);
      top.setAttribute("position", new THREE.BufferAttribute(v, 3));
      top.setIndex([0,1,2, 0,2,3]);
      top.computeVertexNormals();
      group.add(new THREE.Mesh(top, topMat));

      // Main face
      const face = new THREE.PlaneGeometry(W, faceH);
      face.translate(0, -H * 0.4 - faceH / 2, D);
      group.add(new THREE.Mesh(face, faceMat));

      // Valence (angled skirt)
      const valGeo = new THREE.BufferGeometry();
      const vy = -H * 0.4 - faceH;
      const vverts = new Float32Array([
        -W / 2, vy,   D,
         W / 2, vy,   D,
         W / 2, vy - valH, D - 12,
        -W / 2, vy - valH, D - 12,
      ]);
      valGeo.setAttribute("position", new THREE.BufferAttribute(vverts, 3));
      valGeo.setIndex([0,1,2, 0,2,3]);
      valGeo.computeVertexNormals();
      group.add(new THREE.Mesh(valGeo, topMat));

      addSideFace(group, -W / 2, 0, 0, -H * 0.4, D, faceH, sideMat);
      addSideFace(group,  W / 2, 0, 0, -H * 0.4, D, faceH, sideMat, true);
      break;
    }

    // ── Arch ──────────────────────────────────────────────────────────────────
    case "arch": {
      const rise = H * 0.55;
      const seg  = 16;
      addCurvedFace(group, W, D, H, H * 0.4, faceMat, topMat, (t) => ({
        y: -H * 0.4 + rise * Math.sin(t * Math.PI) - rise,   // arch rises in the middle
        z: D,
      }), seg);
      break;
    }

    // ── Bullnose ─────────────────────────────────────────────────────────────
    case "bullnose": {
      const r = H * 0.18;
      // Top
      const top = flatTop(W, D, H, topMat);
      group.add(top);
      // Main face
      const faceH = H - r * 2;
      const fGeo = new THREE.PlaneGeometry(W, faceH);
      fGeo.translate(0, -H * 0.4 - faceH / 2, D);
      group.add(new THREE.Mesh(fGeo, faceMat));
      // Curved roll at top of front face
      addCurvedRoll(group, W, D, H, r, faceMat, "top");
      // Curved roll at bottom of front face
      addCurvedRoll(group, W, D, H - r * 2, r, faceMat, "bottom");
      addSideFace(group, -W / 2, 0, 0, -H * 0.4, D, H - r * 2, sideMat);
      addSideFace(group,  W / 2, 0, 0, -H * 0.4, D, H - r * 2, sideMat, true);
      break;
    }

    // ── Dome ─────────────────────────────────────────────────────────────────
    case "dome": {
      const rx = W / 2;
      const ry = H * 0.85;
      const seg = 24;
      const geo = new THREE.SphereGeometry(Math.min(rx, ry) * 0.9, seg, seg, 0, Math.PI * 2, 0, Math.PI / 2);
      geo.rotateX(-Math.PI / 2);
      geo.translate(0, -H * 0.5, D / 2);
      // Flatten/scale to awning proportions
      geo.scale(rx / (Math.min(rx, ry) * 0.9), 1, (D / 2) / (Math.min(rx, ry) * 0.9));
      group.add(new THREE.Mesh(geo, faceMat));
      break;
    }

    // ── Circular ─────────────────────────────────────────────────────────────
    case "circular": {
      const r = H * 0.9;
      const seg = 20;
      const pts: THREE.Vector2[] = [];
      for (let i = 0; i <= seg; i++) {
        const t = i / seg;
        const angle = t * (Math.PI / 2);
        pts.push(new THREE.Vector2(r * Math.sin(angle), r * (1 - Math.cos(angle))));
      }
      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      for (const pt of pts) shape.lineTo(pt.x, pt.y);
      shape.lineTo(0, pts[pts.length - 1].y);
      shape.closePath();
      const ext = new THREE.ExtrudeGeometry(shape, { depth: W, bevelEnabled: false });
      ext.rotateY(Math.PI / 2);
      ext.translate(-W / 2, -H * 0.4, 0);
      group.add(new THREE.Mesh(ext, faceMat));
      break;
    }

    // ── Gable ────────────────────────────────────────────────────────────────
    case "gable": {
      const peak = H * 0.8;
      const top1 = new THREE.BufferGeometry();
      const tv = new Float32Array([
        -W / 2, 0,   0,
         0,      peak, 0,         // wall peak
         0,      peak - H * 0.1, D,  // front peak
        -W / 2, -H * 0.3, D,
      ]);
      top1.setAttribute("position", new THREE.BufferAttribute(tv, 3));
      top1.setIndex([0,1,2, 0,2,3]);
      top1.computeVertexNormals();
      group.add(new THREE.Mesh(top1, topMat));

      const top2 = new THREE.BufferGeometry();
      const tv2 = new Float32Array([
         W / 2, 0,   0,
         0,     peak, 0,
         0,     peak - H * 0.1, D,
         W / 2, -H * 0.3, D,
      ]);
      top2.setAttribute("position", new THREE.BufferAttribute(tv2, 3));
      top2.setIndex([0,2,1, 0,3,2]);
      top2.computeVertexNormals();
      group.add(new THREE.Mesh(top2, topMat));

      const face = new THREE.PlaneGeometry(W, H);
      face.translate(0, -H * 0.3 - H / 2, D);
      group.add(new THREE.Mesh(face, faceMat));
      break;
    }

    // ── Half Round ───────────────────────────────────────────────────────────
    case "half-round": {
      const r = W / 2;
      const seg = 20;
      const pts: THREE.Vector2[] = [];
      for (let i = 0; i <= seg; i++) {
        const t = i / seg;
        const angle = t * Math.PI;
        pts.push(new THREE.Vector2(r * Math.cos(angle + Math.PI), r * Math.sin(angle + Math.PI)));
      }
      const shape = new THREE.Shape();
      shape.moveTo(pts[0].x, pts[0].y);
      for (const pt of pts.slice(1)) shape.lineTo(pt.x, pt.y);
      shape.closePath();
      const ext = new THREE.ExtrudeGeometry(shape, { depth: D, bevelEnabled: false });
      ext.translate(0, -H * 0.3, 0);
      group.add(new THREE.Mesh(ext, faceMat));
      break;
    }

    // ── Quarter Round ────────────────────────────────────────────────────────
    case "quarter-round": {
      const r = H * 0.95;
      const seg = 16;
      const shape = new THREE.Shape();
      shape.moveTo(-W / 2, 0);
      shape.lineTo( W / 2, 0);
      for (let i = 0; i <= seg; i++) {
        const t = i / seg;
        const angle = (Math.PI / 2) * t;
        shape.lineTo(W / 2 - r * Math.sin(angle), -(r * (1 - Math.cos(angle))));
      }
      shape.lineTo(-W / 2, -(r));
      shape.closePath();
      const ext = new THREE.ExtrudeGeometry(shape, { depth: D, bevelEnabled: false });
      ext.translate(0, 0, 0);
      group.add(new THREE.Mesh(ext, faceMat));
      break;
    }

    // ── Concave ──────────────────────────────────────────────────────────────
    case "concave": {
      const dip = H * 0.3;
      const seg = 16;
      const top = new THREE.BufferGeometry();
      const verts: number[] = [];
      // Left edge at wall
      verts.push(-W / 2, 0, 0);
      // Left edge at front
      verts.push(-W / 2, -(H * 0.2), D);
      // Curve along top (from left to right, at front depth)
      for (let i = 0; i <= seg; i++) {
        const t = i / seg;
        const x = -W / 2 + t * W;
        const y = -(H * 0.2) - dip * Math.sin(t * Math.PI);
        verts.push(x, y, D);
      }
      verts.push(W / 2, 0, 0);
      top.setAttribute("position", new THREE.BufferAttribute(new Float32Array(verts), 3));
      const idx: number[] = [];
      for (let i = 0; i < verts.length / 3 - 2; i++) {
        idx.push(0, i + 1, i + 2);
      }
      top.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
      top.computeVertexNormals();
      group.add(new THREE.Mesh(top, faceMat));
      break;
    }

    // ── Waterfall ────────────────────────────────────────────────────────────
    case "waterfall": {
      const rollR = H * 0.20;
      // Top slope
      const top = flatTop(W, D, H * 0.6, topMat);
      group.add(top);
      // Main face
      const faceH = H * 0.6;
      const fGeo = new THREE.PlaneGeometry(W, faceH);
      fGeo.translate(0, -H * 0.35 - faceH / 2, D);
      group.add(new THREE.Mesh(fGeo, faceMat));
      // Curved waterfall roll at bottom
      addCurvedRoll(group, W, D, H * 0.6, rollR, faceMat, "bottom");
      addSideFace(group, -W / 2, 0, 0, -H * 0.35, D, faceH, sideMat);
      addSideFace(group,  W / 2, 0, 0, -H * 0.35, D, faceH, sideMat, true);
      break;
    }

    // ── Box ───────────────────────────────────────────────────────────────────
    case "box": {
      // All four sides of a box awning
      const top = new THREE.PlaneGeometry(W, D);
      top.rotateX(-Math.PI / 2);
      top.translate(0, 0, D / 2);
      group.add(new THREE.Mesh(top, topMat));

      const face = new THREE.PlaneGeometry(W, H);
      face.translate(0, -H / 2, D);
      group.add(new THREE.Mesh(face, faceMat));

      const bottom = new THREE.PlaneGeometry(W, D);
      bottom.rotateX(Math.PI / 2);
      bottom.translate(0, -H, D / 2);
      group.add(new THREE.Mesh(bottom, sideMat));

      // Left side
      const leftGeo = new THREE.PlaneGeometry(D, H);
      leftGeo.rotateY(Math.PI / 2);
      leftGeo.translate(-W / 2, -H / 2, D / 2);
      group.add(new THREE.Mesh(leftGeo, sideMat));

      // Right side
      const rightGeo = new THREE.PlaneGeometry(D, H);
      rightGeo.rotateY(-Math.PI / 2);
      rightGeo.translate(W / 2, -H / 2, D / 2);
      group.add(new THREE.Mesh(rightGeo, sideMat));
      break;
    }

    default: {
      // Fallback: simple box
      const geo = new THREE.BoxGeometry(W, H, D);
      geo.translate(0, -H / 2, D / 2);
      group.add(new THREE.Mesh(geo, faceMat));
    }
  }

  return group;
}

// ── helpers ───────────────────────────────────────────────────────────────────

/** Flat sloped top panel (shared by standard, waterfall). */
function flatTop(W: number, D: number, H: number, mat: THREE.Material): THREE.Mesh {
  const geo = new THREE.BufferGeometry();
  const verts = new Float32Array([
    -W / 2, 0,          0,
     W / 2, 0,          0,
     W / 2, -H * 0.38,  D,
    -W / 2, -H * 0.38,  D,
  ]);
  geo.setAttribute("position", new THREE.BufferAttribute(verts, 3));
  geo.setIndex([0, 1, 2,  0, 2, 3]);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat);
}

/** Adds a triangular side face (left or right end cap). */
function addSideFace(
  group: THREE.Group,
  x: number,
  wallY: number,
  wallZ: number,
  frontTopY: number,
  frontZ: number,
  faceH: number,
  mat: THREE.Material,
  flipWinding = false,
) {
  const geo = new THREE.BufferGeometry();
  const verts = new Float32Array([
    x, wallY,          wallZ,
    x, frontTopY,      frontZ,
    x, frontTopY - faceH, frontZ,
    x, wallY,          wallZ,      // duplicate for second triangle if needed
  ]);
  geo.setAttribute("position", new THREE.BufferAttribute(verts, 3));
  const idx = flipWinding
    ? new Uint32Array([0, 2, 1])
    : new Uint32Array([0, 1, 2]);
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  group.add(new THREE.Mesh(geo, mat));
}

/** Builds a curved roll (bullnose / waterfall bottom) from the front face bottom edge. */
function addCurvedRoll(
  group: THREE.Group,
  W: number,
  D: number,
  faceBottom: number,     // y position of face bottom (neg)
  r: number,
  mat: THREE.Material,
  _position: "top" | "bottom",
) {
  const seg = 10;
  const verts: number[] = [];
  const idx: number[] = [];

  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const angle = t * (Math.PI / 2);
    const dz = r * Math.sin(angle);
    const dy = -r * (1 - Math.cos(angle));
    verts.push(-W / 2, -faceBottom + dy, D + dz);
    verts.push( W / 2, -faceBottom + dy, D + dz);
  }
  for (let i = 0; i < seg; i++) {
    const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3;
    idx.push(a, b, c,  b, d, c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(verts), 3));
  geo.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
  geo.computeVertexNormals();
  group.add(new THREE.Mesh(geo, mat));
}

/** Curved front-face for arch shape. */
function addCurvedFace(
  group: THREE.Group,
  W: number,
  D: number,
  H: number,
  topOffset: number,
  _faceMat: THREE.Material,
  topMat: THREE.Material,
  _curveFn: (t: number) => { y: number; z: number },
  _seg: number,
) {
  // Simple arch: top flat, front face with arch cutout
  const top = flatTop(W, D, H, topMat);
  group.add(top);

  // Arch front face using ExtrudeGeometry
  const shape = new THREE.Shape();
  const r = H * 0.5;
  shape.moveTo(-W / 2, 0);
  shape.lineTo( W / 2, 0);
  shape.lineTo( W / 2, -H);
  shape.quadraticCurveTo(0, -H - r * 0.6, -W / 2, -H);
  shape.closePath();

  const ext = new THREE.ExtrudeGeometry(shape, { depth: 2, bevelEnabled: false });
  ext.translate(0, -topOffset, D - 1);
  group.add(new THREE.Mesh(ext, _faceMat));
}
