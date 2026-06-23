"use client";

import React, { useRef, useEffect, useMemo } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { FrameSpec } from "../awning-profiles";
import { buildAwningMesh } from "./meshBuilder";

// ─── Detect WebGL once, at module load time (client-only) ─────────────────────
function supportsWebGL(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl") || c.getContext("experimental-webgl"));
  } catch {
    return false;
  }
}

// ─── Wall backdrop (faint brick-like plane behind the awning) ─────────────────
function WallBackdrop({ night }: { night: boolean }) {
  return (
    <mesh position={[0, 20, -5]} receiveShadow>
      <planeGeometry args={[260, 140]} />
      <meshStandardMaterial
        color={night ? "#1e1c28" : "#d4cbc0"}
        roughness={1}
        metalness={0}
      />
    </mesh>
  );
}

// ─── Lighting ─────────────────────────────────────────────────────────────────
function SceneLighting({ night }: { night: boolean }) {
  return (
    <>
      <ambientLight intensity={night ? 0.25 : 0.55} />
      {/* Key light: upper-front */}
      <directionalLight
        position={[60, 80, 90]}
        intensity={night ? 0.6 : 1.1}
        color={night ? "#e8c070" : "#ffffff"}
        castShadow
      />
      {/* Fill light: upper-left */}
      <directionalLight
        position={[-80, 40, 40]}
        intensity={night ? 0.15 : 0.3}
        color={night ? "#4466aa" : "#c8d8f0"}
      />
      {/* Ground bounce */}
      <directionalLight
        position={[0, -60, 40]}
        intensity={night ? 0.05 : 0.12}
        color={night ? "#112244" : "#f0e8d8"}
      />
    </>
  );
}

// ─── Awning mesh (uses primitive to attach a Group) ───────────────────────────
interface AwningModelProps {
  spec: FrameSpec;
  colour: string;
  isLit: boolean;
  night: boolean;
}

function AwningModel({ spec, colour, isLit, night }: AwningModelProps) {
  const group = useMemo(
    () => buildAwningMesh(spec, colour, isLit, night),
    [spec, colour, isLit, night]
  );

  // Centre the group at origin for orbit
  useEffect(() => {
    const box = new THREE.Box3().setFromObject(group);
    const centre = new THREE.Vector3();
    box.getCenter(centre);
    group.position.sub(centre);
  }, [group]);

  return <primitive object={group} />;
}

// ─── Camera that frames the awning correctly ──────────────────────────────────
function AutoCamera() {
  const { camera, gl } = useThree();

  useEffect(() => {
    // Position the perspective camera at a 3/4 hero angle (right, up, front)
    camera.position.set(80, 55, 160);
    camera.lookAt(0, -10, 0);
    camera.near = 1;
    camera.far = 2000;
    if ((camera as THREE.PerspectiveCamera).fov !== undefined) {
      (camera as THREE.PerspectiveCamera).fov = 42;
    }
    camera.updateProjectionMatrix();
  }, [camera]);

  return null;
}

// ─── Main export ─────────────────────────────────────────────────────────────

export interface AwningScene3DProps {
  spec: FrameSpec;
  colour: string;
  is3d: boolean;
  isLit: boolean;
  night: boolean;
}

export function AwningScene3D({ spec, colour, is3d, isLit, night }: AwningScene3DProps) {
  if (!supportsWebGL()) return null;

  const bgColour = night ? "#0d0d18" : "#c8d8e8";

  return (
    <div style={{ width: "100%", height: "100%", background: bgColour }}>
      <Canvas
        shadows
        camera={{ position: [80, 55, 160], fov: 42, near: 1, far: 2000 }}
        style={{ width: "100%", height: "100%" }}
        gl={{ antialias: true, alpha: false }}
        onCreated={({ gl }) => {
          gl.setClearColor(bgColour, 1);
        }}
      >
        <color attach="background" args={[bgColour]} />
        <fog attach="fog" args={[bgColour, 300, 900]} />

        <SceneLighting night={night} />
        <WallBackdrop night={night} />

        <AwningModel spec={spec} colour={colour} isLit={isLit} night={night} />

        <AutoCamera />
        {is3d && (
          <OrbitControls
            enableZoom
            enablePan={false}
            rotateSpeed={0.6}
            zoomSpeed={0.8}
            minDistance={80}
            maxDistance={500}
            target={[0, -10, 0]}
          />
        )}
      </Canvas>

      {/* HUD hint */}
      {is3d && (
        <div
          style={{
            position: "absolute",
            bottom: "48px",
            left: "50%",
            transform: "translateX(-50%)",
            pointerEvents: "none",
          }}
          className="text-white/50 text-[10px] bg-black/30 px-2 py-0.5 rounded-full backdrop-blur"
        >
          Drag to orbit · scroll to zoom
        </div>
      )}
    </div>
  );
}
