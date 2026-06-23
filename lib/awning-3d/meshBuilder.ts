import * as THREE from "three";
import { FrameSpec, Point2D } from "../awning-profiles";

/**
 * Build a Three.js geometry from a FrameSpec.
 * For extrude: sweep the profile along the width (depth).
 * For revolve: revolve the profile around a vertical axis.
 */
export function buildAwningGeometry(spec: FrameSpec): THREE.BufferGeometry {
  const w = 80; // width (along the storefront)
  const h = 60; // height of the awning
  const d = 40; // depth/protrusion

  const profile = spec.profile(w, h, d);

  if (spec.sweep === "extrude") {
    return extrudeProfile(profile, w);
  } else if (spec.sweep === "revolve") {
    return revolveProfile(profile);
  } else if (spec.sweep === "loft") {
    // Loft: blend two profiles (future use)
    return extrudeProfile(profile, w);
  }

  return extrudeProfile(profile, w);
}

/**
 * Extrude a 2D profile along its width to create a 3D shape.
 * The profile's x-axis becomes the width extrusion, y becomes height.
 */
function extrudeProfile(profile: Point2D[], width: number): THREE.BufferGeometry {
  const depth = 40; // how far along z-axis we extrude
  const steps = 2; // number of "slices" along depth

  const vertices: number[] = [];
  const indices: number[] = [];

  // Create vertices for front and back faces
  for (let d = 0; d < steps; d++) {
    const z = (d / (steps - 1)) * depth - depth / 2;
    for (const p of profile) {
      vertices.push(p.x, p.y, z);
    }
  }

  // Create faces between slices
  const profileLen = profile.length;
  for (let d = 0; d < steps - 1; d++) {
    for (let i = 0; i < profileLen - 1; i++) {
      const a = d * profileLen + i;
      const b = d * profileLen + i + 1;
      const c = (d + 1) * profileLen + i + 1;
      const d_v = (d + 1) * profileLen + i;

      // Two triangles per quad
      indices.push(a, b, c);
      indices.push(a, c, d_v);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(vertices), 3));
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
  geometry.computeVertexNormals();

  return geometry;
}

/**
 * Revolve a 2D profile around the vertical (y) axis.
 * Used for dome and circular shapes.
 */
function revolveProfile(profile: Point2D[]): THREE.BufferGeometry {
  const segments = 24; // number of revolve steps around the axis
  const vertices: number[] = [];
  const indices: number[] = [];

  // Generate vertices by rotating the profile
  for (let s = 0; s <= segments; s++) {
    const angle = (s / segments) * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    for (const p of profile) {
      const x = p.x * cos;
      const z = p.x * sin;
      const y = p.y;
      vertices.push(x, y, z);
    }
  }

  // Create faces
  const profileLen = profile.length;
  for (let s = 0; s < segments; s++) {
    for (let i = 0; i < profileLen - 1; i++) {
      const a = s * profileLen + i;
      const b = s * profileLen + i + 1;
      const c = (s + 1) * profileLen + i + 1;
      const d = (s + 1) * profileLen + i;

      indices.push(a, b, c);
      indices.push(a, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(vertices), 3));
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
  geometry.computeVertexNormals();

  return geometry;
}
