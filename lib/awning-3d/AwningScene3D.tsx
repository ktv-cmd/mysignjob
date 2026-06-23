"use client";

import React, { useMemo, useRef, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera as PCamera } from "@react-three/drei";
import * as THREE from "three";
import { FrameSpec, SIGN_VIEW, CameraPreset } from "../awning-profiles";
import { buildAwningGeometry } from "./meshBuilder";

interface AwningMeshProps {
  spec: FrameSpec;
  colour: string;
  isLit: boolean;
  night: boolean;
}

/**
 * The 3D awning mesh component.
 */
function AwningMesh({ spec, colour, isLit, night }: AwningMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  const geometry = useMemo(() => buildAwningGeometry(spec), [spec]);

  const material = useMemo(() => {
    const col = new THREE.Color(colour);
    return new THREE.MeshStandardMaterial({
      color: col,
      roughness: 0.6,
      metalness: 0.1,
      emissive: isLit && night ? col : new THREE.Color(0x000000),
      emissiveIntensity: isLit && night ? 0.4 : 0,
    });
  }, [colour, isLit, night]);

  return <mesh ref={meshRef} geometry={geometry} material={material} />;
}

/**
 * Orthographic camera for 2D mode (locked preset view).
 */
function OrthoCam2D() {
  const { camera } = useThree();
  const preset = SIGN_VIEW.awning;

  useEffect(() => {
    const ortho = new THREE.OrthographicCamera(-50, 50, 40, -40, 0.1, 1000);
    // Position for 3/4 hero angle
    ortho.position.set(30, 30, 50);
    ortho.lookAt(0, 0, 0);
    ortho.zoom = 1;
    ortho.updateProjectionMatrix();

    Object.assign(camera, ortho);
  }, [camera]);

  return null;
}

/**
 * Scene lighting.
 */
function SceneLighting({ night }: { night: boolean }) {
  return (
    <>
      {/* Ambient light */}
      <ambientLight intensity={night ? 0.3 : 0.6} />

      {/* Key light (front) */}
      <directionalLight
        position={[10, 20, 20]}
        intensity={night ? 0.5 : 1}
        color={night ? "#ffb86d" : "#ffffff"}
      />

      {/* Back light (subtle) */}
      <directionalLight
        position={[-10, 15, -30]}
        intensity={night ? 0.2 : 0.3}
        color={night ? "#ffb86d" : "#e0e0ff"}
      />
    </>
  );
}

interface AwningScene3DProps {
  spec: FrameSpec;
  colour: string;
  is3d: boolean; // true for perspective + orbit, false for ortho locked
  isLit: boolean;
  night: boolean;
  onOrbitChange?: (azimuth: number, elevation: number) => void;
}

/**
 * Main 3D scene component. Renders the awning mesh with either:
 * - 3D mode: perspective camera + orbit controls
 * - 2D mode: orthographic camera, locked view (3/4 hero angle)
 */
export function AwningScene3D({
  spec,
  colour,
  is3d,
  isLit,
  night,
  onOrbitChange,
}: AwningScene3DProps) {
  // Fallback: if WebGL is not available, return null and let parent show SVG
  if (!isBrowserSupportsWebGL()) {
    return null;
  }

  return (
    <Canvas
      camera={{ position: [30, 30, 50], fov: 50 }}
      style={{ width: "100%", height: "100%" }}
      gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
    >
      <SceneLighting night={night} />

      {/* The mesh */}
      <AwningMesh spec={spec} colour={colour} isLit={isLit} night={night} />

      {/* Camera and controls */}
      {is3d ? (
        <OrbitControls
          autoRotate={false}
          enableZoom={true}
          enablePan={false}
          rotateSpeed={0.5}
          zoomSpeed={1}
          minDistance={50}
          maxDistance={200}
        />
      ) : (
        <OrthoCam2D />
      )}
    </Canvas>
  );
}

/**
 * Check if the browser supports WebGL.
 */
function isBrowserSupportsWebGL(): boolean {
  if (typeof window === "undefined") return false;

  try {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl") || (canvas.getContext("experimental-webgl") as any);
    return !!gl;
  } catch (e) {
    return false;
  }
}
