"use client";

import React, { useState, useRef, useCallback, useEffect, Suspense } from "react";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";
import { AWNING_PROFILES } from "@/lib/awning-profiles";

// Lazy-load the 3D scene to keep initial bundle light
const AwningScene3D = dynamic(
  () => import("@/lib/awning-3d/AwningScene3D").then((m) => ({ default: m.AwningScene3D })),
  { ssr: false }
);

// ─── Palettes (internal — never shown by label to client) ───────────────────

interface PaletteColour {
  name: string;
  hex: string;
}

const ACRYLIC_PALETTE: PaletteColour[] = [
  { name: "White", hex: "#FFFFFF" },
  { name: "Black", hex: "#1A1A1A" },
  { name: "Red", hex: "#CC2200" },
  { name: "Blue", hex: "#1144AA" },
  { name: "Yellow", hex: "#FFD700" },
  { name: "Green", hex: "#228B22" },
  { name: "Orange", hex: "#FF6600" },
  { name: "Purple", hex: "#6B21A8" },
  { name: "Pink", hex: "#FF69B4" },
  { name: "Teal", hex: "#008B8B" },
  { name: "Gold", hex: "#DAA520" },
  { name: "Silver", hex: "#C0C0C0" },
];

const ALUMINUM_PALETTE: PaletteColour[] = [
  { name: "White", hex: "#F5F5F5" },
  { name: "Black", hex: "#1C1C1C" },
  { name: "Silver", hex: "#A8A8A8" },
  { name: "Bronze", hex: "#8B6914" },
  { name: "Gold", hex: "#B8860B" },
  { name: "Red", hex: "#AA2200" },
  { name: "Blue", hex: "#1A3A6B" },
  { name: "Green", hex: "#2D5A2D" },
  { name: "Brown", hex: "#5C3317" },
  { name: "Grey", hex: "#707070" },
];

const FABRIC_PALETTE: PaletteColour[] = [
  { name: "White", hex: "#FAFAFA" },
  { name: "Black", hex: "#111111" },
  { name: "Red", hex: "#BB2020" },
  { name: "Navy", hex: "#1A2B5A" },
  { name: "Forest Green", hex: "#2E5B2E" },
  { name: "Burgundy", hex: "#6B1A1A" },
  { name: "Royal Blue", hex: "#2244AA" },
  { name: "Orange", hex: "#CC5500" },
  { name: "Yellow", hex: "#FFD700" },
  { name: "Brown", hex: "#5C3317" },
  { name: "Tan", hex: "#D2B48C" },
  { name: "Grey", hex: "#888888" },
];

// ─── Types ───────────────────────────────────────────────────────────────────

type SignType = "letters" | "awning" | "lightbox";
type LitState = "lit" | "notlit";
type SideMode = "point" | "range";
type WallBg = "day" | "night";
type Step = "type" | "lit" | "style" | "text" | "colours" | "done";
type LightboxFace = "aluminum" | "acrylic";
type AwningFrame = string;
type AwningView = "2d" | "3d";

interface LightSources {
  back: boolean;
  front: boolean;
  side: boolean;
}

interface SignConfig {
  type: SignType | null;
  lit: LitState | null;
  text: string;
  // Letters
  bgColour: string;
  lightSources: LightSources;
  sideMode: SideMode;
  sideLightOffset: number; // 0=near wall, 100=front edge
  sideRangeStart: number;
  sideRangeEnd: number;
  // All
  logoUrl: string | null;
  logoDominantColours: string[];
  matchedColours: string[];
  selectedColours: string[];
  // Advanced
  lightWarmth: number;
  advancedMode: boolean;
  // Lightbox
  lightboxFace: LightboxFace;
  // Awning
  awningFrame: AwningFrame;
  awningView: AwningView;
  // Meta
  material: string;
  wallBg: WallBg;
}

const DEFAULT_CONFIG: SignConfig = {
  type: null,
  lit: null,
  text: "YOUR NAME",
  bgColour: "#FFFFFF",
  lightSources: { back: true, front: false, side: false },
  sideMode: "point",
  sideLightOffset: 15,
  sideRangeStart: 10,
  sideRangeEnd: 70,
  logoUrl: null,
  logoDominantColours: [],
  matchedColours: [],
  selectedColours: [],
  lightWarmth: 62,
  advancedMode: false,
  lightboxFace: "aluminum",
  awningFrame: "standard",
  awningView: "2d",
  material: "",
  wallBg: "day",
};

// ─── Colour helpers ───────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function colourDistance(a: string, b: string): number {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

/** Core reusable helper: match each input colour to nearest palette entry */
export function matchColoursToPalette(
  colours: string[],
  palette: PaletteColour[]
): string[] {
  return colours.map((c) => {
    let best = palette[0];
    let bestDist = Infinity;
    for (const p of palette) {
      const d = colourDistance(c, p.hex);
      if (d < bestDist) {
        bestDist = d;
        best = p;
      }
    }
    return best.hex;
  });
}

/** Darken a hex colour toward black — simulates a surface receiving little/no light */
function dimNight(hex: string, factor: number): string {
  const [r, g, b] = hexToRgb(hex);
  const d = (v: number) => Math.round(v * factor);
  return `#${d(r).toString(16).padStart(2, "0")}${d(g).toString(16).padStart(2, "0")}${d(b).toString(16).padStart(2, "0")}`;
}

function getMaterialPalette(config: SignConfig): PaletteColour[] {
  if (config.type === "awning") return FABRIC_PALETTE;
  if (config.type === "lightbox") return ALUMINUM_PALETTE; // box body is aluminum cabinet
  if (config.lit === "lit") return ACRYLIC_PALETTE;
  return ALUMINUM_PALETTE;
}

/** Returns a contrasting stripe colour (white or darkened) from a base colour */
function autoStripe(base: string): string {
  const [r, g, b] = hexToRgb(base);
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  return lum > 128 ? dimNight(base, 0.45) : "#FFFFFF";
}

async function extractDominantColours(
  dataUrl: string,
  count = 4
): Promise<string[]> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 60;
      canvas.height = 60;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve([]);
      ctx.drawImage(img, 0, 0, 60, 60);
      const { data } = ctx.getImageData(0, 0, 60, 60);
      const buckets: Record<string, number> = {};
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 100) continue; // skip transparent
        // skip near-white and near-black for logo colour detection
        const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
        const brightness = (r + g + b) / 3;
        if (brightness > 240 || brightness < 15) continue;
        const key = `${Math.round(r / 24) * 24},${Math.round(g / 24) * 24},${Math.round(b / 24) * 24}`;
        buckets[key] = (buckets[key] || 0) + 1;
      }
      const sorted = Object.entries(buckets)
        .sort((a, b) => b[1] - a[1])
        .slice(0, count);
      const result = sorted.map(([key]) => {
        const [r, g, b] = key.split(",").map(Number);
        return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
      });
      resolve(result.length ? result : ["#CC2200", "#1144AA"]); // fallback
    };
    img.src = dataUrl;
  });
}

// ─── Glow colour from warmth ──────────────────────────────────────────────────

function warmthToGlowColour(warmth: number): string {
  // 0=cool blue-white, 100=warm amber
  const cool = [200, 220, 255];
  const warm = [255, 210, 120];
  const t = warmth / 100;
  const r = Math.round(cool[0] + (warm[0] - cool[0]) * t);
  const g = Math.round(cool[1] + (warm[1] - cool[1]) * t);
  const b = Math.round(cool[2] + (warm[2] - cool[2]) * t);
  return `rgb(${r},${g},${b})`;
}

function warmthToGlowHex(warmth: number): string {
  const cool = [200, 220, 255];
  const warm = [255, 210, 120];
  const t = warmth / 100;
  const r = Math.round(cool[0] + (warm[0] - cool[0]) * t);
  const g = Math.round(cool[1] + (warm[1] - cool[1]) * t);
  const b = Math.round(cool[2] + (warm[2] - cool[2]) * t);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

// ─── Mood themes ──────────────────────────────────────────────────────────────

const MOODS: Record<WallBg, { label: string; dot: string }> = {
  day:   { label: "Day",   dot: "#E8E0D4" },
  night: { label: "Night", dot: "#1a1a2e" },
};

// ─── Storefront Preview — Day / Night ────────────────────────────────────────

function StorefrontPreview({ config }: { config: SignConfig }) {
  const night = config.wallBg === "night";
  const glow  = warmthToGlowHex(config.lightWarmth);
  const isLit = config.lit === "lit";
  const displayText = config.text || "YOUR NAME";
  const textColour  = config.selectedColours[0] || (config.type === "awning" ? "#FFFFFF" : "#DDDDDD");

  // Wall & environment colours
  const skyTop    = night ? "#0D0D18" : "#C8D8E8";
  const skyBot    = night ? "#1A1824" : "#E8E0D4";
  const wallFill  = night ? "#1E1C28" : "#D4CBC0";
  const wallTrim  = night ? "#141220" : "#B8AFA4";
  const doorFill  = night ? "#2E2218" : "#5A3D26";
  const doorTrim  = night ? "#1A1410" : "#3E2A18";
  const stepFill  = night ? "#111118" : "#8A8070";
  const paveFill  = night ? "#0E0E16" : "#706858";
  // transom glass — warm interior light at night
  const glassBase = night ? "#5A3A10" : "#A8C8D8";
  const glassHi   = night ? "#C07020" : "#D8EEF5";

  return (
    <svg viewBox="0 0 360 300" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <defs>
        {/* ── Glow filters (always defined so refs never break) ── */}
        <filter id="glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation={night ? "8" : "5"} result="blur" />
          <feMerge>
            <feMergeNode in="blur" /><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="textGlow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation={night ? "4" : "2"} result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="shadow">
          <feDropShadow dx="0" dy="6" stdDeviation="6" floodOpacity={night ? "0.7" : "0.25"} />
        </filter>
        <filter id="deepShadow">
          <feDropShadow dx="4" dy="6" stdDeviation="5" floodOpacity={night ? "0.85" : "0.4"} />
        </filter>

        {/* ── Halo for lit signs ── */}
        <radialGradient id="halo" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor={glow} stopOpacity={night ? "0.55" : "0.3"} />
          <stop offset="100%" stopColor={glow} stopOpacity="0" />
        </radialGradient>
        {/* ── Back-light: wide bloom (onto panel/wall surface) ── */}
        <filter id="backBloom" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation={night ? "7" : "5"} result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="blur" /></feMerge>
        </filter>
        {/* ── Back-light: tight rim (crisp edge halo right at letterform) ── */}
        <filter id="backRim" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation={night ? "2.5" : "1.5"} result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        {/* Night ground glow under lit sign */}
        <radialGradient id="groundGlow" cx="50%" cy="20%" r="60%">
          <stop offset="0%"   stopColor={glow} stopOpacity="0.25" />
          <stop offset="100%" stopColor={glow} stopOpacity="0" />
        </radialGradient>

        {/* ── Sky gradients ── */}
        <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={skyTop} />
          <stop offset="100%" stopColor={skyBot} />
        </linearGradient>
        {/* ── Wall face gradient (light from top-left) ── */}
        <linearGradient id="wallGrad" x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0%"   stopColor={night ? "#28243A" : "#DDD5C8"} />
          <stop offset="100%" stopColor={wallFill} />
        </linearGradient>
        {/* ── Brick pattern ── */}
        <pattern id="bricks" x="0" y="0" width="48" height="24" patternUnits="userSpaceOnUse">
          <rect width="48" height="24" fill="url(#wallGrad)" />
          {/* mortar lines */}
          <rect x="0"  y="11" width="48" height="2" fill={wallTrim} opacity="0.5" />
          <rect x="0"  y="0"  width="1"  height="11" fill={wallTrim} opacity="0.4" />
          <rect x="23" y="0"  width="1"  height="11" fill={wallTrim} opacity="0.4" />
          <rect x="11" y="13" width="1"  height="11" fill={wallTrim} opacity="0.4" />
          <rect x="35" y="13" width="1"  height="11" fill={wallTrim} opacity="0.4" />
          <rect x="47" y="0"  width="1"  height="11" fill={wallTrim} opacity="0.4" />
        </pattern>
        {/* ── Door wood grain ── */}
        <linearGradient id="doorGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor={night ? "#3A2A1A" : "#6B4C35"} />
          <stop offset="45%"  stopColor={night ? "#2E2010" : "#5A3D26"} />
          <stop offset="55%"  stopColor={night ? "#3A2A1A" : "#6B4C35"} />
          <stop offset="100%" stopColor={night ? "#2E2010" : "#4E3520"} />
        </linearGradient>
        {/* ── Panel bevel highlight ── */}
        <linearGradient id="panelHi" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="rgba(255,255,255,0.15)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.2)" />
        </linearGradient>
        {/* ── Transom glass ── */}
        <linearGradient id="glassGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor={glassHi} stopOpacity="0.9" />
          <stop offset="100%" stopColor={glassBase} stopOpacity="0.85" />
        </linearGradient>
        {/* ── Pavement ── */}
        <linearGradient id="paveGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={paveFill} />
          <stop offset="100%" stopColor={night ? "#08080E" : "#5A5040"} />
        </linearGradient>
      </defs>

      {/* ════ SKY / BACKGROUND ════ */}
      <rect width="360" height="300" fill="url(#skyGrad)" />

      {/* ════ WALL ════ */}
      <rect x="0" y="0" width="360" height="268" fill="url(#bricks)" />

      {/* Night ambient — darken edges */}
      {night && (
        <>
          <rect x="0" y="0" width="60"  height="268" fill="url(#skyGrad)" opacity="0.35" />
          <rect x="300" y="0" width="60" height="268" fill="url(#skyGrad)" opacity="0.35" />
        </>
      )}

      {/* ════ CORNICE ════ */}
      {/* Top moulding face */}
      <rect x="0" y="0" width="360" height="22" fill={wallTrim} />
      {/* Moulding underside shadow */}
      <rect x="0" y="20" width="360" height="5" fill={night ? "#090910" : "#9A9080"} />
      {/* Highlight top */}
      <rect x="0" y="0" width="360" height="3" fill={night ? "#3A3850" : "#EAE0D5"} opacity="0.7" />

      {/* ════ SIGN ZONE ════ */}
      {config.type === "letters"  && <LettersSign  config={config} glow={glow} isLit={isLit} textColour={textColour} displayText={displayText} offsetY={28} night={night} />}
      {config.type === "awning"   && <AwningSign   config={config} glow={glow} isLit={isLit} textColour={textColour} displayText={displayText} offsetY={28} night={night} />}
      {config.type === "lightbox" && <LightBoxSign config={config} glow={glow} isLit={isLit} textColour={textColour} displayText={displayText} offsetY={28} night={night} />}
      {!config.type && <PlaceholderSign night={night} />}


      {/* ════ DOOR SURROUND ════ */}
      {/* Outer frame shadow */}
      <rect x="114" y="146" width="132" height="110" fill={doorTrim} rx="2" filter="url(#deepShadow)" />

      {/* ── Transom ── */}
      <rect x="118" y="149" width="124" height="28" fill="url(#glassGrad)" rx="2" />
      {/* warm interior glow at night */}
      {night && <rect x="118" y="149" width="124" height="28" fill="#FFB030" rx="2" opacity="0.22" />}
      {/* transom dividers */}
      <line x1="180" y1="149" x2="180" y2="177" stroke={doorTrim} strokeWidth="2.5" />
      <line x1="149" y1="149" x2="149" y2="177" stroke={doorTrim} strokeWidth="1.5" />
      <line x1="211" y1="149" x2="211" y2="177" stroke={doorTrim} strokeWidth="1.5" />

      {/* ── Door leaf ── */}
      <rect x="122" y="179" width="116" height="76" fill="url(#doorGrad)" rx="2" />
      {/* 3-D door depth — right edge darker */}
      <rect x="234" y="179" width="4" height="76" fill="rgba(0,0,0,0.35)" rx="1" />
      {/* door panel insets — 2 col × 2 row */}
      {[[126,184,50,28],[182,184,50,28],[126,218,50,32],[182,218,50,32]].map(([x,y,w,h],i) => (
        <g key={i}>
          <rect x={x} y={y} width={w} height={h} fill="url(#panelHi)" rx="2" />
          <rect x={x} y={y} width={w} height={h} fill="none" stroke={doorTrim} strokeWidth="1.5" rx="2" />
        </g>
      ))}
      {/* Door handle */}
      <rect x="169" y="216" width="4" height="14" fill="#C8A050" rx="2" />
      <circle cx="171" cy="223" r="4" fill="#D4AF70" />
      <circle cx="171" cy="223" r="2" fill="#E8C880" opacity="0.6" />

      {/* ════ STEPS ════ */}
      {/* Step 1 face */}
      <rect x="106" y="254" width="148" height="10" fill={stepFill} rx="2" />
      {/* Step 1 top */}
      <rect x="106" y="252" width="148" height="4" fill={night ? "#222230" : "#B0A898"} rx="1" />
      {/* Step 2 face */}
      <rect x="96"  y="263" width="168" height="8" fill={night ? "#0E0E18" : "#888070"} rx="2" />
      <rect x="96"  y="261" width="168" height="4" fill={night ? "#1A1A28" : "#9A9282"} rx="1" />

      {/* ════ PAVEMENT ════ */}
      <rect x="0" y="269" width="360" height="31" fill="url(#paveGrad)" />
      {/* slab joints */}
      {[60,120,180,240,300].map((x) => (
        <line key={x} x1={x} y1="269" x2={x} y2="300" stroke={night ? "#060608" : "#5A5040"} strokeWidth="1" />
      ))}
      <line x1="0" y1="283" x2="360" y2="283" stroke={night ? "#060608" : "#5A5040"} strokeWidth="1" />
    </svg>
  );
}

// ─── Sign components (all share offsetY so they sit in the fascia) ────────────

type SignProps = {
  config: SignConfig; glow: string; isLit: boolean;
  textColour: string; displayText: string; offsetY?: number; night?: boolean;
};

function LettersSign({ config, glow, isLit, textColour, displayText, offsetY = 0, night = false }: SignProps) {
  const bgFill = config.bgColour || "transparent";
  const hasBg  = bgFill !== "transparent";
  const top = offsetY + 6;
  const w = 298; const h = 100; const x0 = 31;
  const mid = top + h / 2;
  const depth = 9;

  const hasBack  = isLit && config.lightSources.back;
  const hasFront = isLit && config.lightSources.front;
  const hasSide  = isLit && config.lightSources.side;
  // Side rendering math: offset 0=near wall → shadow rakes forward; 100=front edge → shadow rakes backward
  const sideT   = (config.sideLightOffset ?? 15) / 100;
  const sideDx  = +(5 - sideT * 10).toFixed(1);
  const sideBlur = config.sideMode === "range"
    ? Math.round(6 + ((config.sideRangeEnd - config.sideRangeStart) / 100) * 10)
    : 6;

  // Letter face colour — physically based:
  //   back-lit night        → silhouette (face in shadow, light comes from behind)
  //   front-lit             → bright glow colour (light shining onto the face)
  //   back/side-lit day     → chosen colour, looks normal in daylight
  //   not lit night         → dimmed (no light source reaches the face)
  let letterFill: string;
  if (hasBack && !hasFront && night) letterFill = dimNight(textColour, 0.22); // dark silhouette
  else if (hasFront)                  letterFill = glow;
  else if (isLit)                     letterFill = night ? dimNight(textColour, 0.7) : textColour;
  else                                letterFill = night ? dimNight(textColour, 0.32) : textColour;

  // Unique clip-path ID per render (sign zone bounds)
  const clipId = "panelClip";

  return (
    <g>
      {/* ── Clip path scoped to panel (for back-light containment) ── */}
      {hasBg && (
        <defs>
          <clipPath id={clipId}>
            <rect x={x0} y={top} width={w} height={h} rx="4" />
          </clipPath>
        </defs>
      )}

      {/* ── Background panel ── */}
      {hasBg && (
        <g>
          <rect x={x0} y={top} width={w} height={h} fill={bgFill} rx="4" filter="url(#shadow)" />
          {night && (
            <rect x={x0} y={top} width={w} height={h} fill="rgba(0,0,0,0.78)" rx="4" />
          )}
          <rect x={x0} y={top} width={w} height="3" fill="rgba(255,255,255,0.10)" rx="4" />
        </g>
      )}

      {/* ── BACK light: halo behind letters ── */}
      {hasBack && !hasBg && (
        /* No panel: wide spill onto wall — classic channel-letter halo */
        <>
          <text x="180" y={mid} textAnchor="middle" dominantBaseline="middle"
            fill={glow} fontSize="34" fontFamily="'Arial Black',Arial,sans-serif"
            fontWeight="900" letterSpacing="2"
            filter="url(#glow)" opacity={night ? 0.7 : 0.4}>
            {displayText.slice(0, 16)}
          </text>
          <text x="180" y={mid} textAnchor="middle" dominantBaseline="middle"
            fill={glow} fontSize="34" fontFamily="'Arial Black',Arial,sans-serif"
            fontWeight="900" letterSpacing="2"
            filter="url(#textGlow)" opacity={night ? 0.55 : 0.3}>
            {displayText.slice(0, 16)}
          </text>
        </>
      )}
      {hasBack && hasBg && (
        /* With panel: two controlled passes, clipped to the board surface */
        <g clipPath={`url(#${clipId})`}>
          {/* Wide bloom — light pooling on the panel around each letter */}
          <text x="180" y={mid} textAnchor="middle" dominantBaseline="middle"
            fill={glow} fontSize="34" fontFamily="'Arial Black',Arial,sans-serif"
            fontWeight="900" letterSpacing="2"
            filter="url(#backBloom)" opacity={night ? 0.72 : 0.38}>
            {displayText.slice(0, 16)}
          </text>
          {/* Tight rim — sharp edge-glow right at the letter boundary */}
          <text x="180" y={mid} textAnchor="middle" dominantBaseline="middle"
            fill={glow} fontSize="34" fontFamily="'Arial Black',Arial,sans-serif"
            fontWeight="900" letterSpacing="2"
            filter="url(#backRim)" opacity={night ? 0.9 : 0.55}>
            {displayText.slice(0, 16)}
          </text>
        </g>
      )}

      {/* ── SIDE light: direction & blur driven by sideLightOffset ── */}
      {hasSide && (
        <text x="180" y={mid} textAnchor="middle" dominantBaseline="middle"
          fill={glow} fontSize="34" fontFamily="'Arial Black',Arial,sans-serif"
          fontWeight="900" letterSpacing="2"
          style={{ filter: `drop-shadow(${sideDx}px 0 ${sideBlur}px ${glow}) drop-shadow(${-sideDx}px 0 ${Math.round(sideBlur * 0.6)}px ${glow})` }}
          opacity={night ? 0.75 : 0.45}>
          {displayText.slice(0, 16)}
        </text>
      )}

      {/* ── 3-D letter extrusion (depth layers, bottom-right offset) ── */}
      {[6,5,4,3,2,1].map((d) => (
        <text key={d} x={180 + d * 0.9} y={mid + d * 0.9}
          textAnchor="middle" dominantBaseline="middle"
          fill={isLit ? `rgba(0,0,0,${0.55 - d * 0.04})` : `rgba(0,0,0,${0.4 - d * 0.04})`}
          fontSize="34" fontFamily="'Arial Black',Arial,sans-serif"
          fontWeight="900" letterSpacing="2">
          {displayText.slice(0, 16)}
        </text>
      ))}

      {/* ── Letter face (front, on top of extrusion) ── */}
      <text x="180" y={mid} textAnchor="middle" dominantBaseline="middle"
        fill={letterFill}
        fontSize="34" fontFamily="'Arial Black',Arial,sans-serif"
        fontWeight="900" letterSpacing="2"
        filter={hasFront ? "url(#textGlow)" : undefined}
      >
        {displayText.slice(0, 16)}
      </text>

      {/* ── FRONT: bright specular highlight on face ── */}
      {hasFront && (
        <text x="180" y={mid} textAnchor="middle" dominantBaseline="middle"
          fill="rgba(255,255,255,0.45)" fontSize="34" fontFamily="'Arial Black',Arial,sans-serif"
          fontWeight="900" letterSpacing="2">
          {displayText.slice(0, 16)}
        </text>
      )}

      {config.logoUrl && (
        <image href={config.logoUrl} x={x0+w-26} y={top+8} width="20" height="20" />
      )}
    </g>
  );
}

// ─── Awning shapes ────────────────────────────────────────────────────────────
// Use the profile specs from the library
const AWNING_FRAMES = AWNING_PROFILES.map(p => ({ id: p.id, label: p.label }));

function shadeHex(hex: string, delta: number): string {
  const [r, g, b] = hexToRgb(hex);
  const c = (v: number) => Math.min(255, Math.max(0, v + delta));
  return `rgb(${c(r)},${c(g)},${c(b)})`;
}

// Renders an awning shape as SVG paths.
// Wall line: WL→WR at y=WT. Front face: FL→FR at y=FT, bottom at FB.
// Left side visible as a strip from wall to front.
function AwningShape({
  frame, col, WL, WR, WT, FL, FR, FT, FB, WB, children,
}: {
  frame: string; col: string;
  WL: number; WR: number; WT: number;
  FL: number; FR: number; FT: number; FB: number; WB: number;
  children?: React.ReactNode;
}) {
  const lite  = shadeHex(col, +55);
  const dark  = shadeHex(col, -65);
  const mid   = shadeHex(col, +20);
  const cx    = (FL + FR) / 2;

  const Top  = () => <polygon points={`${WL},${WT} ${WR},${WT} ${FR},${FT} ${FL},${FT}`} fill={lite} />;
  const Side = ({ by = WB }: { by?: number }) =>
    <polygon points={`${WL},${WT} ${FL},${FT} ${FL},${FB} ${WL},${by}`} fill={dark} />;
  const Face = ({ y1 = FT, y2 = FB }: { y1?: number; y2?: number }) =>
    <rect x={FL} y={y1} width={FR - FL} height={y2 - y1} fill={col} />;

  switch (frame) {

    case "standard":
      return <g><Top /><Face /><Side />{children}</g>;

    case "standard-valence": {
      const fh  = (FB - FT) * 0.70;
      const vy  = FT + fh;
      const vox = Math.round((WL - FL) * 0.8), voy = Math.round((FT - WT) * 0.7);
      return (
        <g>
          <Top />
          <Face y2={vy} />
          <polygon points={`${FL},${vy} ${FR},${vy} ${FR - vox},${vy + voy} ${FL - vox},${vy + voy}`} fill={lite} />
          <rect x={FL - vox} y={vy + voy} width={FR - FL} height={Math.round((FB - FT) * 0.14)} fill={col} />
          <Side by={vy + voy + Math.round((FB - FT) * 0.14)} />
          {children}
        </g>
      );
    }

    case "arch": {
      const rise = (FB - FT) * 0.62;
      return (
        <g>
          <Top />
          <path d={`M ${FL},${FT} L ${FR},${FT} L ${FR},${FB} Q ${cx},${FB - rise} ${FL},${FB} Z`} fill={col} />
          <Side />
          {children}
        </g>
      );
    }

    case "bullnose": {
      const r = Math.round((FB - FT) * 0.22);
      return (
        <g>
          <Top />
          <path d={`M ${FL},${FT} Q ${FL - r * 0.7},${FT + r} ${FL},${FT + r * 2} L ${FR},${FT + r * 2} Q ${FR + r * 0.7},${FT + r} ${FR},${FT} Z`} fill={lite} />
          <Face y1={FT + r * 2} />
          <Side />
          {children}
        </g>
      );
    }

    case "dome": {
      const rx = (FR - FL) / 2;
      const ry = FB - FT + Math.round((FT - WT) * 1.5);
      return (
        <g>
          <polygon points={`${WL},${WT} ${WR},${WT} ${FR},${FT + 6} ${FL},${FT + 6}`} fill={lite} opacity={0.55} />
          <path d={`M ${FL},${FB} A ${rx},${ry} 0 0 1 ${FR},${FB} Z`} fill={col} />
          <path d={`M ${WL},${WT + 5} Q ${WL - 6},${(WT + FB) / 2} ${FL},${FB}`}
            stroke={dark} strokeWidth={Math.round((WL - FL) * 1.6)} fill="none" strokeLinecap="round" />
          {children}
        </g>
      );
    }

    case "circular": {
      return (
        <g>
          <path d={`M ${WL},${WT} Q ${WL},${FB} ${FL},${FB} L ${FR},${FB} Q ${FR},${WT} ${WR},${WT} Z`} fill={col} />
          <path d={`M ${WL},${WT} Q ${WL},${FB} ${FL},${FB} L ${WL},${FB} Z`} fill={dark} />
          <line x1={WL} y1={WT} x2={WR} y2={WT} stroke={lite} strokeWidth="2" />
          {children}
        </g>
      );
    }

    case "gable": {
      const rwX = (WL + WR) / 2, rwY = WT - Math.round((FT - WT) * 2.2);
      const rfX = cx,            rfY = FT - Math.round((FT - WT) * 2.0);
      return (
        <g>
          <polygon points={`${WL},${WT} ${rwX},${rwY} ${rfX},${rfY} ${FL},${FT}`} fill={lite} />
          <polygon points={`${WR},${WT} ${rwX},${rwY} ${rfX},${rfY} ${FR},${FT}`} fill={mid} />
          <Face />
          <Side />
          <line x1={rwX} y1={rwY} x2={rfX} y2={rfY} stroke={lite} strokeWidth="1.5" />
          {children}
        </g>
      );
    }

    case "half-round": {
      const mY = FT + Math.round((FB - FT) * 0.5);
      const rx = (FR - FL) / 2, ry = Math.round((FB - FT) * 0.5);
      return (
        <g>
          <path d={`M ${WL},${WT} L ${WR},${WT} L ${FR},${mY} A ${rx},${ry} 0 0 0 ${FL},${mY} Z`} fill={lite} />
          <path d={`M ${FL},${mY} A ${rx},${ry} 0 0 1 ${FR},${mY} L ${FR},${FB} L ${FL},${FB} Z`} fill={col} />
          <polygon points={`${WL},${WT} ${FL},${mY} ${FL},${FB} ${WL},${WB}`} fill={dark} />
          {children}
        </g>
      );
    }

    case "quarter-round": {
      const ctrl = Math.round((FR - FL) * 0.055);
      return (
        <g>
          <path d={`M ${WL},${WT} L ${WR},${WT} Q ${FR + ctrl},${FT} ${FR},${FB} L ${FL},${FB} Q ${FL - ctrl},${FT} ${WL},${WT} Z`} fill={col} />
          <path d={`M ${WL},${WT} Q ${WL},${FT} ${FL},${FB} L ${WL},${WB} Z`} fill={dark} />
          <line x1={WL} y1={WT} x2={WR} y2={WT} stroke={lite} strokeWidth="2" />
          {children}
        </g>
      );
    }

    case "concave": {
      const mY = (WT + FB) / 2;
      const ctrl = Math.round((FR - FL) * 0.058);
      return (
        <g>
          <path d={`M ${WL},${WT} L ${WR},${WT} Q ${WR - ctrl},${mY} ${FR},${FB} L ${FL},${FB} Q ${WL + ctrl},${mY} ${WL},${WT} Z`} fill={col} />
          <path d={`M ${WL},${WT} Q ${WL + ctrl},${mY} ${FL},${FB} L ${WL},${WB} Z`} fill={dark} />
          <line x1={WL} y1={WT} x2={WR} y2={WT} stroke={lite} strokeWidth="2" />
          {children}
        </g>
      );
    }

    case "waterfall": {
      const r   = Math.round((FB - FT) * 0.22);
      const fh  = FB - FT - r * 2;
      const fy  = FT + fh;
      return (
        <g>
          <Top />
          <Face y2={fy} />
          <path d={`M ${FL},${fy} Q ${FL - r},${fy + r} ${FL},${fy + r * 2} L ${FR},${fy + r * 2} Q ${FR + r},${fy + r} ${FR},${fy} Z`} fill={lite} />
          <ellipse cx={cx} cy={fy + r * 2} rx={(FR - FL) / 2 - 4} ry={Math.round(r * 0.42)} fill={mid} opacity={0.7} />
          <Side by={fy + r * 2} />
          {children}
        </g>
      );
    }

    case "box": {
      return (
        <g>
          <Top />
          <polygon points={`${FL},${FB} ${FR},${FB} ${WR},${WB} ${WL},${WB}`} fill={dark} opacity={0.85} />
          <Face />
          <Side />
          {children}
        </g>
      );
    }

    default:
      return <g><Top /><Face /><Side />{children}</g>;
  }
}

// ─── Shape picker ─────────────────────────────────────────────────────────────

function AwningShapeViewer({ config, update }: { config: SignConfig; update: (p: Partial<SignConfig>) => void }) {
  const idx     = Math.max(0, AWNING_FRAMES.findIndex(f => f.id === config.awningFrame));
  const current = AWNING_FRAMES[idx];
  const col     = config.selectedColours[0] || "#1A2B5A";

  const go = (dir: -1 | 1) => {
    const next = idx + dir;
    if (next >= 0 && next < AWNING_FRAMES.length) update({ awningFrame: AWNING_FRAMES[next].id });
  };

  // Preview uses a larger perspective to make shape clearly readable
  const WL = 28, WR = 252, WT = 18;
  const FL = 2,  FR = 226, FT = 48, FB = 95, WB = 95;

  return (
    <div className="rounded-2xl border border-gray-200 bg-[#0f1729] overflow-hidden select-none">
      <div className="relative flex items-center justify-center h-36">
        {/* Prev arrow */}
        <button
          onClick={() => go(-1)}
          disabled={idx === 0}
          className="absolute left-3 z-10 w-9 h-9 rounded-full flex items-center justify-center
            bg-white/10 text-white hover:bg-white/20 disabled:opacity-20 disabled:cursor-not-allowed
            transition-all text-lg font-bold"
          aria-label="Previous shape"
        >‹</button>

        <svg viewBox="0 0 280 110" className="w-full h-full px-12 py-2">
          {/* Brick wall behind */}
          <rect x="0" y="0" width="280" height="110" fill="#1a2340" />
          <g stroke="#1f2a4a" strokeWidth="1" fill="none">
            {[15,33,51,69,87].map(y => (
              <React.Fragment key={y}>
                <line x1="0" y1={y} x2="280" y2={y} />
                {[0,60,120,180,240].map(x => <line key={x} x1={x + ((y / 18 | 0) % 2) * 30} y1={y} x2={x + ((y / 18 | 0) % 2) * 30} y2={y + 18} />)}
              </React.Fragment>
            ))}
          </g>
          {/* Wall-top trim line */}
          <line x1={WL} y1={WT} x2={WR} y2={WT} stroke="#ffffff18" strokeWidth="1" />
          {/* Awning shape */}
          <AwningShape frame={current.id} col={col}
            WL={WL} WR={WR} WT={WT} FL={FL} FR={FR} FT={FT} FB={FB} WB={WB} />
          {/* Wall-mounting shadow line */}
          <line x1={WL} y1={WT} x2={WR} y2={WT} stroke="rgba(0,0,0,0.4)" strokeWidth="2" />
        </svg>

        {/* Next arrow */}
        <button
          onClick={() => go(1)}
          disabled={idx === AWNING_FRAMES.length - 1}
          className="absolute right-3 z-10 w-9 h-9 rounded-full flex items-center justify-center
            bg-white/10 text-white hover:bg-white/20 disabled:opacity-20 disabled:cursor-not-allowed
            transition-all text-lg font-bold"
          aria-label="Next shape"
        >›</button>
      </div>

      {/* Shape name */}
      <div className="text-center pb-1 text-white font-bold text-sm tracking-wide">
        {current.label}
      </div>

      {/* Dot indicators */}
      <div className="flex justify-center gap-1 pb-3 flex-wrap px-4">
        {AWNING_FRAMES.map((f, i) => (
          <button
            key={f.id}
            onClick={() => update({ awningFrame: f.id })}
            className={cn(
              "w-1.5 h-1.5 rounded-full transition-all",
              i === idx ? "bg-white scale-125" : "bg-white/25 hover:bg-white/50"
            )}
            aria-label={f.label}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Awning sign preview ───────────────────────────────────────────────────────

function AwningSign({ config, glow, isLit, textColour, displayText, offsetY = 0, night = false }: SignProps) {
  const col   = config.selectedColours[0] || "#1A2B5A";
  const frame = config.awningFrame || "standard";

  // Wall attachment
  const WL = 6,   WR = 354, WT = offsetY + 8;
  // Front protrudes: 5px left, 13px down from wall line
  const FL = 1,   FR = 349, FT = WT + 13, FB = WT + 86, WB = WT + 86;
  const cx = (FL + FR) / 2;

  const textEl = (
    <text
      x={cx} y={(FT + FB) / 2}
      textAnchor="middle" dominantBaseline="middle"
      fill={isLit ? glow : textColour}
      fontSize="26" fontFamily="'Arial Black',Arial,sans-serif" fontWeight="900"
      filter={isLit ? "url(#textGlow)" : "url(#shadow)"}
    >
      {displayText.slice(0, 14)}
    </text>
  );

  return (
    <g>
      {isLit && <ellipse cx={cx} cy={(FT + FB) / 2} rx="190" ry="52" fill="url(#halo)" />}
      <AwningShape frame={frame} col={col}
        WL={WL} WR={WR} WT={WT} FL={FL} FR={FR} FT={FT} FB={FB} WB={WB}>
        {textEl}
      </AwningShape>
    </g>
  );
}

function LightBoxSign({ config, glow, isLit, textColour, displayText, offsetY = 0, night = false }: SignProps) {
  const x0 = 28; const w = 304; const h = 106;
  const top = offsetY + 6;
  const mid = top + h / 2;
  const depth = 10;

  // All cabinet surfaces use the exact same chosen colour — no artificial darkening on sides.
  // A faint edge line provides 3-D readability without changing colour.
  const col = config.selectedColours[0] || "#707070";
  const isAluminum = (config.lightboxFace ?? "aluminum") === "aluminum";
  const maskId = "lbMask";

  // Acrylic face: warm off-white glow panel; dark when unlit
  const acrylicFaceLit  = night ? "#FFF8E0" : "#FFFEF5";
  const acrylicFaceOff  = night ? "#1C1C20" : "#D8D8DA";

  // Aluminum: letters are cut-outs. Unlit → show a light fill through the holes so they're
  // clearly readable. Lit → glow colour shines through.
  const cutoutFill = isLit ? glow : (night ? "rgba(180,170,140,0.55)" : "rgba(255,250,230,0.9)");

  return (
    <g>
      {/* Halo behind cabinet when lit */}
      {isLit && <ellipse cx="180" cy={mid} rx="190" ry={h * 0.65} fill="url(#halo)" />}

      {/* ── Cabinet body — all surfaces same chosen colour ── */}
      {/* Right side */}
      <path d={`M ${x0+w} ${top} L ${x0+w+depth} ${top-depth*0.5} L ${x0+w+depth} ${top+h-depth*0.5} L ${x0+w} ${top+h} Z`}
        fill={col} stroke="rgba(0,0,0,0.18)" strokeWidth="0.5" />
      {/* Top */}
      <path d={`M ${x0} ${top} L ${x0+depth} ${top-depth*0.5} L ${x0+w+depth} ${top-depth*0.5} L ${x0+w} ${top} Z`}
        fill={col} stroke="rgba(0,0,0,0.12)" strokeWidth="0.5" />
      {/* Bottom */}
      <path d={`M ${x0} ${top+h} L ${x0+w} ${top+h} L ${x0+w+depth} ${top+h-depth*0.5} L ${x0+depth} ${top+h-depth*0.5} Z`}
        fill={col} stroke="rgba(0,0,0,0.12)" strokeWidth="0.5" />
      {/* Front face */}
      <rect x={x0} y={top} width={w} height={h} fill={col} rx="4" filter="url(#shadow)" />
      {/* Very faint edge to separate front from sides */}
      <rect x={x0} y={top} width={w} height={h} fill="none"
        stroke="rgba(0,0,0,0.15)" strokeWidth="1" rx="4" />

      {/* ── Mask: face panel minus letter cut-outs ── */}
      <defs>
        <mask id={maskId}>
          <rect x={x0+6} y={top+6} width={w-12} height={h-12} fill="white" rx="2" />
          <text x="180" y={mid} textAnchor="middle" dominantBaseline="middle"
            fill="black" fontSize="40" fontFamily="'Arial Black',Arial,sans-serif"
            fontWeight="900" letterSpacing="1">
            {displayText.slice(0, 14)}
          </text>
          {config.logoUrl && (
            <image href={config.logoUrl} x={x0+10} y={top+10} width="36" height="36" />
          )}
        </mask>
      </defs>

      {isAluminum ? (
        /* ── ALUMINUM: dark face, letters are visible holes ── */
        <>
          {/* Face panel with letter cut-outs (same col as cabinet) */}
          <rect x={x0+6} y={top+6} width={w-12} height={h-12} fill={col} rx="2"
            mask={`url(#${maskId})`} />
          {/* Letter holes: always visible — warm fill when unlit, glow when lit */}
          <text x="180" y={mid} textAnchor="middle" dominantBaseline="middle"
            fill={cutoutFill} fontSize="40" fontFamily="'Arial Black',Arial,sans-serif"
            fontWeight="900" letterSpacing="1"
            filter={isLit ? "url(#glow)" : undefined}
            opacity={isLit ? (night ? 0.95 : 0.85) : 1}>
            {displayText.slice(0, 14)}
          </text>
          {/* Logo through cut-out */}
          {config.logoUrl && (
            <image href={config.logoUrl} x={x0+10} y={top+10} width="36" height="36" />
          )}
        </>
      ) : (
        /* ── ACRYLIC: whole face glows / whole face shows when unlit ── */
        <>
          {/* Acrylic face panel — glowing when lit, off when not */}
          <rect x={x0+6} y={top+6} width={w-12} height={h-12}
            fill={isLit ? acrylicFaceLit : acrylicFaceOff} rx="2"
            filter={isLit ? "url(#shadow)" : undefined}
            opacity={isLit ? 1 : 0.85}
          />
          {/* Slight glow bloom on the face panel when lit */}
          {isLit && (
            <rect x={x0+6} y={top+6} width={w-12} height={h-12} fill={glow} rx="2"
              opacity={night ? 0.18 : 0.08} />
          )}
          {/* Letters: dark contrast on glowing panel (lit) or visible text (unlit) */}
          <text x="180" y={mid} textAnchor="middle" dominantBaseline="middle"
            fill={isLit ? (night ? "rgba(20,15,5,0.85)" : "rgba(30,20,5,0.75)") : (night ? "#888" : "#444")}
            fontSize="40" fontFamily="'Arial Black',Arial,sans-serif"
            fontWeight="900" letterSpacing="1">
            {displayText.slice(0, 14)}
          </text>
          {config.logoUrl && (
            <image href={config.logoUrl} x={x0+10} y={top+10} width="36" height="36" />
          )}
        </>
      )}

      {/* Top highlight edge */}
      <rect x={x0} y={top} width={w} height="3" fill="rgba(255,255,255,0.10)" rx="4" />
    </g>
  );
}

function PlaceholderSign({ night = false }: { night?: boolean }) {
  return (
    <g opacity="0.4">
      <rect x="31" y="34" width="298" height="100" fill="none"
        stroke={night ? "#555" : "#AAA"} strokeWidth="2" strokeDasharray="8 4" rx="4" />
      <text x="180" y="90" textAnchor="middle" dominantBaseline="middle"
        fill={night ? "#666" : "#999"} fontSize="15" fontFamily="Arial">
        Your sign appears here
      </text>
    </g>
  );
}

// ─── Side-light animated channel-letter view ─────────────────────────────────

function LetterSideView({
  config, glow, update, onClose,
}: {
  config: SignConfig; glow: string;
  update: (patch: Partial<SignConfig>) => void;
  onClose: () => void;
}) {
  const [arrived, setArrived] = useState(false);
  const [depthScale, setDepthScale] = useState(0);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef<"point" | "start" | "end" | null>(null);
  const rafRef = useRef<number>(0);

  // Animate depth emerging — "camera swings to the side"
  useEffect(() => {
    const start = performance.now();
    const dur = 950;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / dur);
      setDepthScale(1 - Math.pow(1 - p, 3)); // ease-out cubic
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };
    const id = setTimeout(() => { setArrived(true); rafRef.current = requestAnimationFrame(tick); }, 50);
    return () => { clearTimeout(id); cancelAnimationFrame(rafRef.current); };
  }, []);

  const night   = config.wallBg === "night";
  const isRange = config.sideMode === "range";
  // 2 chars max — large so the side return is clearly visible
  const displayText = (config.text || "YO").slice(0, 2);
  const faceColour  = config.selectedColours[0] || "#DADADA";
  const isLit       = config.lit === "lit";

  // ── Extrusion params: many tightly-stacked layers build a SOLID side return ──
  const N       = 46;    // depth layers (dense = continuous wall, no ghost steps)
  const STEP_X  = 1.42;  // per-layer x offset (rightward = toward wall)
  const STEP_Y  = -0.62; // per-layer y offset (upward = isometric tilt)
  const FACE_X  = 120;   // letter face center-x (left of centre → return visible to right)
  const FACE_Y  = 90;
  const FONT_SZ = 116;

  // Return-wall material, depth-shaded: brighter at the face edge, darker toward the wall.
  // p = 0 at face edge, 1 at the back (wall side).
  const lerpHex = (a: string, b: string, t: number): string => {
    const [ar, ag, ab] = hexToRgb(a), [br, bg, bb] = hexToRgb(b);
    const r = Math.round(ar + (br - ar) * t);
    const g = Math.round(ag + (bg - ag) * t);
    const bl = Math.round(ab + (bb - ab) * t);
    return `rgb(${r},${g},${bl})`;
  };
  const wallEdgeCol  = night ? "#101018" : "#5c5c66"; // back of the return (deep)
  const faceEdgeCol  = night ? "#2c2c3a" : "#aeaeb8"; // front of the return (catches light)
  const returnBase   = (p: number) => lerpHex(faceEdgeCol, wallEdgeCol, p);

  // Glow intensity at each layer: i=0=face-side, i=N-1=wall-side
  // sideLightOffset=0→glow near wall (high i), =100→near face (low i)
  const sigma = 0.16;
  const glowAt = (i: number): number => {
    const layerPos = i / (N - 1);           // 0=face, 1=wall
    const targetPos = 1 - (config.sideLightOffset ?? 15) / 100;
    if (isRange) {
      const lo = 1 - config.sideRangeEnd   / 100;
      const hi = 1 - config.sideRangeStart / 100;
      const edge = 0.1;
      if (layerPos < lo - edge || layerPos > hi + edge) return 0;
      return Math.min((layerPos - lo + edge) / edge, (hi + edge - layerPos) / edge, 1) * 0.95;
    }
    const d = layerPos - targetPos;
    return Math.exp(-(d * d) / (2 * sigma * sigma));
  };

  // sideLightOffset % → SVG x in return zone
  const pctToX = (pct: number) =>
    FACE_X + (1 - pct / 100) * (N - 1) * STEP_X * depthScale;

  // Pointer → side offset %
  const getSvgT = (clientX: number): number => {
    if (!svgRef.current) return 0;
    const r = svgRef.current.getBoundingClientRect();
    const svgX = ((clientX - r.left) / r.width) * 360;
    const wallX = FACE_X + (N - 1) * STEP_X;
    return Math.max(0, Math.min(100, Math.round((1 - (svgX - FACE_X) / (wallX - FACE_X)) * 100)));
  };

  const onPtrDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (isRange) {
      const val = getSvgT(e.clientX);
      dragging.current = Math.abs(val - config.sideRangeStart) <= Math.abs(val - config.sideRangeEnd) ? "start" : "end";
    } else { dragging.current = "point"; }
    (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
  };
  const onPtrMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragging.current) return;
    const val = getSvgT(e.clientX);
    if (dragging.current === "point") update({ sideLightOffset: val });
    else if (dragging.current === "start") update({ sideRangeStart: Math.min(val, config.sideRangeEnd - 5) });
    else update({ sideRangeEnd: Math.max(val, config.sideRangeStart + 5) });
  };

  return (
    <div className="absolute inset-0 flex flex-col" style={{ background: "#07070F" }}>
      {/* ── Top 50%: far storefront ── */}
      <div className="relative overflow-hidden" style={{ flex: "0 0 50%" }}>
        <StorefrontPreview config={config} />
        <div className="absolute bottom-1.5 left-0 right-0 flex justify-center pointer-events-none">
          <span className="text-white/30 text-[9px] bg-black/40 px-2 py-0.5 rounded-full">Far view</span>
        </div>
      </div>

      {/* ── Bottom 50%: real channel-letter side return view ── */}
      <div className="relative overflow-hidden" style={{ flex: "0 0 50%", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <button onClick={onClose}
          className="absolute top-1.5 right-2 z-10 text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-white/50 hover:bg-white/20">
          ← Back
        </button>
        <div className="absolute top-1.5 left-0 right-0 flex justify-center pointer-events-none z-10">
          <span className="text-white/35 text-[9px]">
            {isRange ? "Drag handles · lit zone on the return" : "Drag · position light on the side return"}
          </span>
        </div>

        <svg
          ref={svgRef}
          viewBox="0 0 360 160"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full touch-none select-none"
          style={{
            cursor: "ew-resize",
            // Entry: appears face-on → depth emerges as depthScale 0→1 → "camera swings to side"
            transform: arrived ? "none" : "translateX(46px) scale(0.83)",
            opacity: arrived ? 1 : 0,
            transition: "transform 0.92s cubic-bezier(0.16,1,0.3,1), opacity 0.65s ease-out",
          }}
          onPointerDown={onPtrDown}
          onPointerMove={onPtrMove}
          onPointerUp={() => { dragging.current = null; }}
          onPointerLeave={() => { dragging.current = null; }}
        >
          <defs>
            {/* Large soft wall/floor halo — the glow pooling on the surface behind the letters */}
            <filter id="wallSpill" x="-120%" y="-120%" width="340%" height="340%">
              <feGaussianBlur stdDeviation="20" result="b"/>
              <feMerge><feMergeNode in="b"/><feMergeNode in="b"/></feMerge>
            </filter>
            {/* Bloom on the brightest return layers (crisp glow edge) */}
            <filter id="retBloom" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="2.5" result="b"/>
              <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
            {/* Gloss gradient on the acrylic face: bright top-left → dark bottom-right */}
            <linearGradient id="faceGloss" x1="0.05" y1="0" x2="0.5" y2="1">
              <stop offset="0%"   stopColor="white" stopOpacity="0.32"/>
              <stop offset="30%"  stopColor="white" stopOpacity="0.06"/>
              <stop offset="100%" stopColor="black" stopOpacity="0.18"/>
            </linearGradient>
          </defs>

          {/* ── 1. Wall/floor spill halo (behind everything) ── */}
          <text
            x={FACE_X + (N - 1) * STEP_X * depthScale * 0.6}
            y={FACE_Y + (N - 1) * STEP_Y * depthScale * 0.6}
            textAnchor="middle" dominantBaseline="middle"
            fill={glow} fontSize={FONT_SZ}
            fontFamily="'Arial Black',Arial,sans-serif" fontWeight="900"
            filter="url(#wallSpill)"
            opacity={night ? 0.5 : 0.18}
          >
            {displayText}
          </text>

          {/* ── 2. SOLID return wall, back→front. Each layer paints its sliver, then    */}
          {/*       its glow band on top, before the next (more-front) layer covers it.  */}
          {/*       i=0 = backmost (wall side); i=N-1 = frontmost (face edge).            */}
          {Array.from({ length: N }).map((_, i) => {
            const p  = 1 - i / (N - 1);                 // 0 at face edge … 1 at wall
            const dx = (N - 1 - i) * STEP_X * depthScale;
            const dy = (N - 1 - i) * STEP_Y * depthScale;
            const g  = glowAt(i);
            return (
              <g key={i}>
                {/* solid material sliver — this is what makes a continuous 3-D wall */}
                <text x={FACE_X + dx} y={FACE_Y + dy}
                  textAnchor="middle" dominantBaseline="middle"
                  fill={returnBase(p)} fontSize={FONT_SZ}
                  fontFamily="'Arial Black',Arial,sans-serif" fontWeight="900">
                  {displayText}
                </text>
                {/* glow band riding on the wall surface */}
                {isLit && g > 0.02 && (
                  <text x={FACE_X + dx} y={FACE_Y + dy}
                    textAnchor="middle" dominantBaseline="middle"
                    fill={glow} fontSize={FONT_SZ}
                    fontFamily="'Arial Black',Arial,sans-serif" fontWeight="900"
                    opacity={g * (night ? 0.95 : 0.8)}
                    filter={g > 0.6 ? "url(#retBloom)" : undefined}>
                    {displayText}
                  </text>
                )}
              </g>
            );
          })}

          {/* ── 3a. Bright seam: thin highlight where face meets the return ── */}
          <text x={FACE_X + STEP_X * depthScale} y={FACE_Y + STEP_Y * depthScale}
            textAnchor="middle" dominantBaseline="middle"
            fill={isLit ? glow : "rgba(255,255,255,0.85)"} fontSize={FONT_SZ}
            fontFamily="'Arial Black',Arial,sans-serif" fontWeight="900"
            opacity={night ? 0.9 : 0.7}>
            {displayText}
          </text>

          {/* ── 3b. Front face — glowing acrylic when lit, opaque colour otherwise ── */}
          <text x={FACE_X} y={FACE_Y}
            textAnchor="middle" dominantBaseline="middle"
            fill={isLit ? glow : faceColour} fontSize={FONT_SZ}
            fontFamily="'Arial Black',Arial,sans-serif" fontWeight="900"
            opacity={isLit ? (night ? 0.96 : 0.92) : 1}>
            {displayText}
          </text>
          {/* Gloss highlight overlay */}
          <text x={FACE_X} y={FACE_Y}
            textAnchor="middle" dominantBaseline="middle"
            fill="url(#faceGloss)" fontSize={FONT_SZ}
            fontFamily="'Arial Black',Arial,sans-serif" fontWeight="900">
            {displayText}
          </text>

          {/* ── 4. Drag handles: dots above + dashed leaders down into the return ── */}
          {depthScale > 0.45 && !isRange && (
            <>
              <line x1={pctToX(config.sideLightOffset)} y1={22}
                x2={pctToX(config.sideLightOffset)} y2={32}
                stroke={glow} strokeWidth="1.5" strokeDasharray="2 3" opacity="0.5" />
              <circle cx={pctToX(config.sideLightOffset)} cy={16} r="7"
                fill={glow} stroke="white" strokeWidth="1.5" strokeOpacity="0.55" />
              <text x={pctToX(config.sideLightOffset)} y={153}
                fill={glow} fontSize="9" textAnchor="middle" opacity="0.6">
                {config.sideLightOffset}% from wall
              </text>
            </>
          )}
          {depthScale > 0.45 && isRange && (
            <>
              {[config.sideRangeStart, config.sideRangeEnd].map((pct, idx) => (
                <g key={idx}>
                  <line x1={pctToX(pct)} y1={22} x2={pctToX(pct)} y2={32}
                    stroke={glow} strokeWidth="1.5" strokeDasharray="2 3" opacity="0.5" />
                  <circle cx={pctToX(pct)} cy={16} r="7"
                    fill={glow} stroke="white" strokeWidth="1.5" strokeOpacity="0.55" />
                </g>
              ))}
              <text x={(pctToX(config.sideRangeStart) + pctToX(config.sideRangeEnd)) / 2}
                y={153} fill={glow} fontSize="9" textAnchor="middle" opacity="0.6">
                {config.sideRangeStart}–{config.sideRangeEnd}%
              </text>
            </>
          )}

          {/* Axis labels */}
          <text x={FACE_X - 4} y={153} fill="#252535" fontSize="8" textAnchor="end">Face</text>
          <text x={FACE_X + (N - 1) * STEP_X * depthScale + 4} y={153}
            fill="#252535" fontSize="8">Wall</text>
        </svg>
      </div>
    </div>
  );
}

// ─── Step components ──────────────────────────────────────────────────────────

function StepCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("animate-in fade-in slide-in-from-bottom-4 duration-300", className)}>
      {children}
    </div>
  );
}

function ChoiceButton({
  selected,
  onClick,
  children,
  className,
}: {
  selected?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative flex flex-col items-center gap-2 rounded-2xl border-2 p-4 text-sm font-semibold transition-all duration-200 cursor-pointer",
        "hover:scale-105 hover:shadow-lg active:scale-95",
        selected
          ? "border-orange-500 bg-orange-50 text-orange-700 shadow-orange-100 shadow-md"
          : "border-gray-200 bg-white text-gray-700 hover:border-gray-300",
        className
      )}
    >
      {selected && (
        <span className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-orange-500 text-white text-xs">
          ✓
        </span>
      )}
      {children}
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">
      {children}
    </p>
  );
}

// ─── Awning preview with 2D/3D toggle ─────────────────────────────────────────

function AwningPreviewWithToggle({ config, update }: { config: SignConfig; update: (p: Partial<SignConfig>) => void }) {
  const frameSpec = AWNING_PROFILES.find(p => p.id === config.awningFrame) || AWNING_PROFILES[0];
  const colour = config.selectedColours[0] || "#1A2B5A";
  const night = config.wallBg === "night";
  const isLit = config.lit === "lit";

  return (
    <div className="space-y-3">
      {/* Toggle button */}
      <div className="flex gap-2">
        <button
          onClick={() => update({ awningView: "2d" })}
          className={cn(
            "flex-1 rounded-xl px-4 py-2 text-sm font-semibold transition-all",
            config.awningView === "2d"
              ? "bg-blue-500 text-white shadow-md"
              : "bg-gray-200 text-gray-600 hover:bg-gray-300"
          )}
        >
          📐 2D View
        </button>
        <button
          onClick={() => update({ awningView: "3d" })}
          className={cn(
            "flex-1 rounded-xl px-4 py-2 text-sm font-semibold transition-all",
            config.awningView === "3d"
              ? "bg-blue-500 text-white shadow-md"
              : "bg-gray-200 text-gray-600 hover:bg-gray-300"
          )}
        >
          🎯 3D View
        </button>
      </div>

      {/* Mode info */}
      <p className="text-xs text-gray-500">
        {config.awningView === "3d" ? "Drag to orbit the awning" : "Straight-on view"}
      </p>
    </div>
  );
}

// ─── Main Configurator ────────────────────────────────────────────────────────

export default function SignConfigurator() {
  const [config, setConfig] = useState<SignConfig>(DEFAULT_CONFIG);
  const [step, setStep] = useState<Step>("type");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [logoLoading, setLogoLoading] = useState(false);
  const [sideAdjustMode, setSideAdjustMode] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const glow = warmthToGlowHex(config.lightWarmth);

  // Derive material whenever type/lit changes
  useEffect(() => {
    let material = "";
    if (config.type === "letters") material = config.lit === "lit" ? "Acrylic" : "Aluminum";
    else if (config.type === "awning") material = "Fabric";
    else if (config.type === "lightbox") material = "Acrylic";
    setConfig((c) => ({ ...c, material }));
  }, [config.type, config.lit]);

  // When logo or material changes, re-run colour matching
  useEffect(() => {
    if (!config.logoDominantColours.length) return;
    const palette = getMaterialPalette(config);
    const matched = matchColoursToPalette(config.logoDominantColours, palette);
    setConfig((c) => ({
      ...c,
      matchedColours: matched,
      selectedColours: matched.slice(0, 1), // pre-select the single dominant match
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.logoDominantColours, config.type, config.lit]);

  const update = (patch: Partial<SignConfig>) =>
    setConfig((c) => ({ ...c, ...patch }));

  const steps: Step[] = ["type", "lit", "style", "text", "colours", "done"];
  const stepIdx = steps.indexOf(step);
  const progress = ((stepIdx + 1) / steps.length) * 100;

  const handleLogoUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setLogoLoading(true);
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const dataUrl = ev.target?.result as string;
        const colours = await extractDominantColours(dataUrl, 4);
        update({ logoUrl: dataUrl, logoDominantColours: colours });
        setLogoLoading(false);
      };
      reader.readAsDataURL(file);
    },
    []
  );

  const canAdvance = () => {
    if (step === "type") return !!config.type;
    if (step === "lit") return !!config.lit;
    return true;
  };

  const next = () => {
    const idx = steps.indexOf(step);
    if (idx < steps.length - 1) setStep(steps[idx + 1]);
  };

  const back = () => {
    const idx = steps.indexOf(step);
    if (idx > 0) setStep(steps[idx - 1]);
  };

  // Final config object (cleaned for output/API)
  const finalConfig = {
    type: config.type,
    lit: config.lit,
    material: config.material,
    text: config.text,
    bgColour: config.type === "letters" ? config.bgColour : undefined,
    lightSources:
      config.type === "letters" && config.lit === "lit"
        ? config.lightSources
        : undefined,
    sideLightConfig:
      config.type === "letters" && config.lit === "lit" && config.lightSources.side
        ? { mode: config.sideMode, offset: config.sideLightOffset, rangeStart: config.sideRangeStart, rangeEnd: config.sideRangeEnd }
        : undefined,
    awningFrame: config.type === "awning" ? config.awningFrame : undefined,
    lightboxFace: config.type === "lightbox" ? config.lightboxFace : undefined,
    logoUrl: config.logoUrl ? "[uploaded]" : null,
    logoDominantColours: config.logoDominantColours,
    matchedColours: config.matchedColours,
    selectedColours: config.selectedColours,
    lightWarmth: config.lit === "lit" ? config.lightWarmth : undefined,
    advanced: {
      enabled: config.advancedMode,
      lightWarmth: config.lightWarmth,
    },
  };

  const palette = getMaterialPalette(config);
  const bgBasicColours = [
    { label: "White", hex: "#FFFFFF" },
    { label: "Black", hex: "#1A1A1A" },
    { label: "Silver", hex: "#C0C0C0" },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-gray-100 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg font-black text-orange-500 tracking-tight">sign</span>
          <span className="text-lg font-black text-gray-800 tracking-tight">builder</span>
        </div>
        <button
          onClick={() => setShowAdvanced((v) => !v)}
          className={cn(
            "text-xs font-semibold px-3 py-1.5 rounded-full border transition-all",
            showAdvanced
              ? "border-orange-400 bg-orange-50 text-orange-600"
              : "border-gray-200 text-gray-500 hover:border-gray-300"
          )}
        >
          {showAdvanced ? "⚙ Advanced on" : "⚙ Advanced"}
        </button>
      </header>

      {/* Progress bar */}
      <div className="h-1.5 bg-gray-100">
        <div
          className="h-full bg-orange-400 transition-all duration-500 rounded-r-full"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="flex flex-col lg:flex-row flex-1 gap-0 lg:gap-0">
        {/* ── Live Preview ── */}
        <div className="lg:sticky lg:top-[53px] lg:h-[calc(100vh-53px)] lg:w-1/2 flex flex-col">
          <div className="relative overflow-hidden bg-gray-300" style={{ aspectRatio: "6/5" }}>
            {sideAdjustMode && config.type === "letters" ? (
              <LetterSideView
                config={config} glow={glow} update={update}
                onClose={() => setSideAdjustMode(false)}
              />
            ) : config.type === "awning" && config.awningView === "3d" ? (
              // 3D awning preview
              <Suspense fallback={<div className="w-full h-full flex items-center justify-center text-gray-500">Loading 3D...</div>}>
                <AwningScene3D
                  spec={AWNING_PROFILES.find(p => p.id === config.awningFrame) || AWNING_PROFILES[0]}
                  colour={config.selectedColours[0] || "#1A2B5A"}
                  is3d={true}
                  isLit={config.lit === "lit"}
                  night={config.wallBg === "night"}
                />
              </Suspense>
            ) : (
              <StorefrontPreview config={config} />
            )}
            {/* Day / Night switcher */}
            <div className="absolute bottom-3 right-3 flex gap-2">
              {(["day","night"] as WallBg[]).map((mood) => (
                <button
                  key={mood}
                  onClick={() => update({ wallBg: mood })}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all",
                    config.wallBg === mood
                      ? "bg-white text-gray-900 shadow-md"
                      : "bg-black/40 text-white/70 hover:bg-black/60 backdrop-blur"
                  )}
                >
                  {mood === "day" ? "☀ Day" : "🌙 Night"}
                </button>
              ))}
            </div>
            {config.lit === "lit" && (
              <div className="absolute top-3 left-3 flex items-center gap-1 bg-black/50 text-yellow-300 text-xs px-2 py-1 rounded-full backdrop-blur">
                <span className="animate-pulse">●</span> Live preview
              </div>
            )}
          </div>

          <div className="hidden lg:flex items-center justify-center py-3 text-xs text-gray-400 gap-1">
            <span>Preview:</span>
            <span className="font-semibold text-gray-600 capitalize">{config.wallBg === "day" ? "☀ Daytime" : "🌙 Night"}</span>
            <span className="text-gray-300 mx-1">·</span>
            <span>Switch above</span>
          </div>
        </div>

        {/* ── Steps ── */}
        <div className="lg:w-1/2 flex flex-col px-5 py-6 gap-6 overflow-y-auto">

          {/* Step 1: Sign type */}
          {step === "type" && (
            <StepCard>
              <SectionLabel>Step 1 of 6</SectionLabel>
              <h2 className="text-2xl font-black text-gray-900 mb-1">What kind of sign?</h2>
              <p className="text-sm text-gray-500 mb-5">Pick the style that fits your space.</p>
              <div className="grid grid-cols-3 gap-3">
                <ChoiceButton
                  selected={config.type === "letters"}
                  onClick={() => update({ type: "letters" })}
                >
                  <span className="text-3xl">🔤</span>
                  <span>Letters</span>
                  <span className="text-xs font-normal text-gray-400 text-center">Classic channel or flat letters</span>
                </ChoiceButton>
                <ChoiceButton
                  selected={config.type === "awning"}
                  onClick={() => update({ type: "awning" })}
                >
                  <span className="text-3xl">⛺</span>
                  <span>Awning</span>
                  <span className="text-xs font-normal text-gray-400 text-center">Fabric sign with personality</span>
                </ChoiceButton>
                <ChoiceButton
                  selected={config.type === "lightbox"}
                  onClick={() => update({ type: "lightbox" })}
                >
                  <span className="text-3xl">💡</span>
                  <span>Light box</span>
                  <span className="text-xs font-normal text-gray-400 text-center">Glowing cabinet sign</span>
                </ChoiceButton>
              </div>
            </StepCard>
          )}

          {/* Step 2: Lit */}
          {step === "lit" && (
            <StepCard>
              <SectionLabel>Step 2 of 6</SectionLabel>
              <h2 className="text-2xl font-black text-gray-900 mb-1">Light it up? 🌟</h2>
              <p className="text-sm text-gray-500 mb-5">
                {config.type === "awning"
                  ? "Lit awnings glow beautifully at night — light shines through the logo."
                  : config.type === "lightbox"
                  ? "A lit light box shines from behind, making your sign pop day or night."
                  : "Lit signs glow at night and stand out in any weather."}
              </p>
              <div className="grid grid-cols-2 gap-4">
                <ChoiceButton selected={config.lit === "lit"} onClick={() => update({ lit: "lit" })}>
                  <span className="text-4xl">✨</span>
                  <span>Lit</span>
                  <span className="text-xs font-normal text-gray-400">Glows at night</span>
                </ChoiceButton>
                <ChoiceButton selected={config.lit === "notlit"} onClick={() => update({ lit: "notlit" })}>
                  <span className="text-4xl">🌤️</span>
                  <span>Not lit</span>
                  <span className="text-xs font-normal text-gray-400">Clean daytime look</span>
                </ChoiceButton>
              </div>
            </StepCard>
          )}

          {/* Step 3: Style / background / position */}
          {step === "style" && (
            <StepCard>
              <SectionLabel>Step 3 of 6</SectionLabel>
              {config.type === "letters" ? (
                <>
                  <h2 className="text-2xl font-black text-gray-900 mb-1">Style it up</h2>
                  <p className="text-sm text-gray-500 mb-5">Choose a background and, if lit, where the light comes from.</p>

                  {/* Background colour */}
                  <div className="mb-6">
                    <p className="text-sm font-semibold text-gray-700 mb-3">Background colour</p>
                    <div className="flex gap-3 flex-wrap">
                      {/* No background */}
                      <button
                        onClick={() => update({ bgColour: "transparent" })}
                        className={cn(
                          "w-12 h-12 rounded-xl border-2 flex items-center justify-center text-xs text-gray-400 transition-all",
                          config.bgColour === "transparent"
                            ? "border-orange-500 scale-110 shadow-md"
                            : "border-gray-200"
                        )}
                        title="No background"
                        style={{ background: "repeating-linear-gradient(45deg,#f3f3f3 0px,#f3f3f3 5px,#e0e0e0 5px,#e0e0e0 10px)" }}
                      >
                        <span className="text-[9px] font-bold leading-tight">none</span>
                      </button>
                      {bgBasicColours.map((c) => (
                        <button
                          key={c.hex}
                          onClick={() => update({ bgColour: c.hex })}
                          title={c.label}
                          className={cn(
                            "w-12 h-12 rounded-xl border-2 transition-all",
                            config.bgColour === c.hex
                              ? "border-orange-500 scale-110 shadow-md"
                              : "border-gray-200"
                          )}
                          style={{ background: c.hex, boxShadow: c.hex === "#FFFFFF" ? "inset 0 0 0 1px #e5e7eb" : undefined }}
                        />
                      ))}
                      {showAdvanced &&
                        palette
                          .filter((p) => !bgBasicColours.find((b) => b.hex === p.hex))
                          .map((c) => (
                            <button
                              key={c.hex}
                              onClick={() => update({ bgColour: c.hex })}
                              title={c.name}
                              className={cn(
                                "w-12 h-12 rounded-xl border-2 transition-all",
                                config.bgColour === c.hex
                                  ? "border-orange-500 scale-110 shadow-md"
                                  : "border-gray-200"
                              )}
                              style={{ background: c.hex }}
                            />
                          ))}
                    </div>
                  </div>

                  {/* Light position (only if lit) */}
                  {config.lit === "lit" && (
                    <div>
                      <p className="text-sm font-semibold text-gray-700 mb-3">Where does the light come from?</p>
                      {!showAdvanced ? (
                        /* Basic: 3 presets — no side */
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { back: true,  front: false, label: "Back",       icon: "↩️", desc: "Halo behind" },
                            { back: false, front: true,  label: "Front",      icon: "↪️", desc: "Front-lit" },
                            { back: true,  front: true,  label: "Back + Front", icon: "🔆", desc: "Both" },
                          ].map((p) => {
                            const sel = config.lightSources.back === p.back && config.lightSources.front === p.front && !config.lightSources.side;
                            return (
                              <ChoiceButton key={p.label} selected={sel}
                                onClick={() => update({ lightSources: { back: p.back, front: p.front, side: false } })}>
                                <span className="text-xl">{p.icon}</span>
                                <span className="text-xs text-center">{p.label}</span>
                                <span className="text-[10px] font-normal text-gray-400 text-center">{p.desc}</span>
                              </ChoiceButton>
                            );
                          })}
                        </div>
                      ) : (
                        /* Advanced: independent toggles for every combination */
                        <div className="space-y-3">
                          <div className="grid grid-cols-3 gap-2">
                            {([
                              { key: "back",  label: "Back",  icon: "↩️" },
                              { key: "front", label: "Front", icon: "↪️" },
                              { key: "side",  label: "Side",  icon: "◀▶" },
                            ] as { key: keyof LightSources; label: string; icon: string }[]).map(({ key, label, icon }) => {
                              const active = config.lightSources[key];
                              const wouldLeaveNone = active && Object.values(config.lightSources).filter(Boolean).length === 1;
                              return (
                                <ChoiceButton key={key} selected={active}
                                  onClick={() => {
                                    if (wouldLeaveNone) return; // keep at least one on
                                    update({ lightSources: { ...config.lightSources, [key]: !active } });
                                  }}>
                                  <span className="text-xl">{icon}</span>
                                  <span className="text-xs">{label}</span>
                                  {active && <span className="text-[9px] text-orange-400">on</span>}
                                </ChoiceButton>
                              );
                            })}
                          </div>
                          <p className="text-[10px] text-gray-400">Tap to toggle — any combination works. At least one must be on.</p>

                          {/* Side sub-controls */}
                          {config.lightSources.side && (
                            <div className="rounded-xl border border-orange-100 bg-orange-50 p-3 space-y-2">
                              <p className="text-xs font-semibold text-orange-700 mb-2">Side light mode</p>
                              <div className="grid grid-cols-2 gap-2">
                                <ChoiceButton selected={config.sideMode === "point"}
                                  onClick={() => update({ sideMode: "point" })}>
                                  <span className="text-lg">●</span>
                                  <span className="text-xs">Point</span>
                                  <span className="text-[9px] font-normal text-gray-400">Single position</span>
                                </ChoiceButton>
                                <ChoiceButton selected={config.sideMode === "range"}
                                  onClick={() => update({ sideMode: "range" })}>
                                  <span className="text-lg">⟺</span>
                                  <span className="text-xs">Range</span>
                                  <span className="text-[9px] font-normal text-gray-400">Lit zone</span>
                                </ChoiceButton>
                              </div>
                              <button
                                onClick={() => setSideAdjustMode(true)}
                                className="w-full rounded-xl bg-orange-500 text-white text-xs font-bold py-2 hover:bg-orange-600 transition-colors active:scale-95"
                              >
                                Adjust side position →
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : config.type === "lightbox" ? (
                <>
                  <h2 className="text-2xl font-black text-gray-900 mb-1">Choose your face type</h2>
                  <p className="text-sm text-gray-500 mb-5">This decides how the light box looks and how it lights up.</p>
                  <div className="grid grid-cols-2 gap-3 mb-5">
                    {([
                      {
                        key: "aluminum" as LightboxFace,
                        label: "Aluminum face",
                        desc: "Cut-out letters — only the letters glow",
                        icon: (
                          <svg viewBox="0 0 80 40" className="w-full h-10">
                            <rect x="2" y="2" width="76" height="36" fill="#707070" rx="3"/>
                            <text x="40" y="21" textAnchor="middle" dominantBaseline="middle"
                              fill="rgba(255,240,180,0.9)" fontSize="16" fontFamily="Arial Black" fontWeight="900">ABC</text>
                          </svg>
                        ),
                      },
                      {
                        key: "acrylic" as LightboxFace,
                        label: "Acrylic face",
                        desc: "Whole front glows — letters printed on it",
                        icon: (
                          <svg viewBox="0 0 80 40" className="w-full h-10">
                            <rect x="2" y="2" width="76" height="36" fill="#FFF8D0" rx="3" opacity="0.95"/>
                            <text x="40" y="21" textAnchor="middle" dominantBaseline="middle"
                              fill="rgba(40,25,5,0.8)" fontSize="16" fontFamily="Arial Black" fontWeight="900">ABC</text>
                          </svg>
                        ),
                      },
                    ]).map(({ key, label, desc, icon }) => (
                      <button key={key}
                        onClick={() => update({ lightboxFace: key })}
                        className={cn(
                          "flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all text-center",
                          (config.lightboxFace ?? "aluminum") === key
                            ? "border-orange-500 bg-orange-50 shadow-md scale-[1.03]"
                            : "border-gray-200 bg-white hover:border-gray-300"
                        )}>
                        <div className="w-full">{icon}</div>
                        <span className="text-xs font-bold text-gray-800">{label}</span>
                        <span className="text-[10px] text-gray-500 leading-tight">{desc}</span>
                      </button>
                    ))}
                  </div>
                  <div className="rounded-2xl bg-orange-50 border border-orange-100 p-3 text-sm text-orange-700">
                    {config.lit === "lit" ? "✨ Lit — your sign will glow." : "🌤️ Not lit — letters stay visible without glow."}
                  </div>
                </>
              ) : (
                /* AWNING */
                <>
                  <h2 className="text-2xl font-black text-gray-900 mb-1">Awning style</h2>
                  <p className="text-sm text-gray-500 mb-5">Use arrows to change shape.</p>
                  <AwningShapeViewer config={config} update={update} />
                  <AwningPreviewWithToggle config={config} update={update} />
                </>
              )}
            </StepCard>
          )}

          {/* Step 4: Text */}
          {step === "text" && (
            <StepCard>
              <SectionLabel>Step 4 of 6</SectionLabel>
              <h2 className="text-2xl font-black text-gray-900 mb-1">What's your name?</h2>
              <p className="text-sm text-gray-500 mb-5">This is what your sign will say. Keep it short and punchy.</p>

              <input
                type="text"
                value={config.text}
                onChange={(e) => update({ text: e.target.value.toUpperCase() })}
                placeholder="YOUR NAME"
                maxLength={20}
                className="w-full rounded-2xl border-2 border-gray-200 px-4 py-3 text-xl font-black uppercase tracking-wider focus:border-orange-400 focus:outline-none transition-colors bg-white"
              />
              <p className="text-xs text-gray-400 mt-1 text-right">{config.text.length}/20</p>

              {/* Logo upload */}
              <div className="mt-6">
                <p className="text-sm font-semibold text-gray-700 mb-3">Got a logo? (optional)</p>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                {config.logoUrl ? (
                  <div className="flex items-center gap-3">
                    <img src={config.logoUrl} alt="Logo" className="h-14 w-14 object-contain rounded-xl border border-gray-200 bg-white p-1" />
                    <div>
                      <p className="text-sm font-semibold text-green-600">Logo uploaded ✓</p>
                      <p className="text-xs text-gray-400">
                        {config.logoDominantColours.length} colours detected — we&apos;ll match them to your sign.
                      </p>
                    </div>
                    <button
                      onClick={() => update({ logoUrl: null, logoDominantColours: [], matchedColours: [], selectedColours: [] })}
                      className="ml-auto text-xs text-red-400 hover:text-red-600"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => fileRef.current?.click()}
                    disabled={logoLoading}
                    className="w-full rounded-2xl border-2 border-dashed border-gray-200 py-6 text-sm text-gray-400 hover:border-orange-300 hover:text-orange-400 transition-all flex flex-col items-center gap-2"
                  >
                    <span className="text-3xl">🖼️</span>
                    {logoLoading ? "Reading colours…" : "Tap to upload your logo"}
                    <span className="text-xs">PNG, JPG, SVG — any format works</span>
                  </button>
                )}
              </div>
            </StepCard>
          )}

          {/* Step 5: Colours */}
          {step === "colours" && (
            <StepCard>
              <SectionLabel>Step 5 of 6</SectionLabel>
              <h2 className="text-2xl font-black text-gray-900 mb-1">Pick your colours</h2>
              <p className="text-sm text-gray-500 mb-5">
                {config.logoDominantColours.length
                  ? "We matched your logo colours to the closest available options — adjust any you like."
                  : "Choose the colours for your sign."}
              </p>

              {/* Logo colour match display */}
              {config.logoDominantColours.length > 0 && config.matchedColours[0] && (
                <div className="mb-5 rounded-2xl bg-blue-50 border border-blue-100 p-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full border-2 border-white shadow-sm flex-shrink-0"
                    style={{ background: config.logoDominantColours[0] }} title="Logo dominant colour" />
                  <span className="text-blue-400 text-sm">→</span>
                  <div className="w-10 h-10 rounded-full border-2 border-blue-400 shadow-sm flex-shrink-0"
                    style={{ background: config.matchedColours[0] }} title="Matched sign colour" />
                  <p className="text-xs text-blue-600">Logo colour matched — pre-selected below</p>
                </div>
              )}

              {/* Colour palette — single select */}
              <p className="text-sm font-semibold text-gray-700 mb-3">Sign colour</p>
              <div className="flex flex-wrap gap-3">
                {palette.map((c) => {
                  const isSelected = config.selectedColours[0] === c.hex;
                  return (
                    <button
                      key={c.hex}
                      onClick={() => update({ selectedColours: [c.hex] })}
                      title={c.name}
                      className={cn(
                        "w-12 h-12 rounded-xl border-2 transition-all hover:scale-110",
                        isSelected ? "border-orange-500 scale-110 shadow-md ring-2 ring-orange-200" : "border-gray-200"
                      )}
                      style={{
                        background: c.hex,
                        boxShadow: c.hex === "#FFFFFF" || c.hex === "#FAFAFA"
                          ? "inset 0 0 0 1px #e5e7eb"
                          : undefined,
                      }}
                    >
                      {isSelected && (
                        <span
                          style={{ color: colourDistance(c.hex, "#FFFFFF") < 100 ? "#000" : "#fff" }}
                          className="text-xs font-bold"
                        >✓</span>
                      )}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-gray-400 mt-2">
                {config.selectedColours[0] ? "Tap to change your sign colour" : "Tap to choose your sign colour"}
              </p>

              {/* Advanced: light warmth */}
              {showAdvanced && config.lit === "lit" && (
                <div className="mt-6">
                  <p className="text-sm font-semibold text-gray-700 mb-3">
                    Light temperature — <span className="font-normal text-gray-500">{config.lightWarmth < 40 ? "Cool white" : config.lightWarmth > 70 ? "Warm amber" : "Neutral white"}</span>
                  </p>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-blue-400 font-semibold">Cool</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={config.lightWarmth}
                      onChange={(e) => update({ lightWarmth: Number(e.target.value) })}
                      className="flex-1 accent-orange-500"
                    />
                    <span className="text-xs text-orange-400 font-semibold">Warm</span>
                    <div
                      className="w-8 h-8 rounded-full border border-gray-200 shadow-sm flex-shrink-0"
                      style={{ background: warmthToGlowColour(config.lightWarmth) }}
                    />
                  </div>
                </div>
              )}
            </StepCard>
          )}

          {/* Step 6: Done */}
          {step === "done" && (
            <StepCard>
              <SectionLabel>All done!</SectionLabel>
              <h2 className="text-2xl font-black text-gray-900 mb-1">Your sign is ready 🎉</h2>
              <p className="text-sm text-gray-500 mb-5">Here's what you've built — we'll send this spec to our sign makers.</p>

              {/* Summary card */}
              <div className="rounded-2xl bg-white border border-gray-200 p-5 mb-5 space-y-3">
                <Row label="Sign type" value={config.type === "letters" ? "Letters" : config.type === "awning" ? "Awning" : "Light box"} />
                <Row label="Lighting" value={config.lit === "lit" ? "Lit ✨" : "Not lit"} />
                {config.type === "letters" && (
                  <>
                    <Row label="Background" value={config.bgColour === "transparent" ? "None" : config.bgColour} colour={config.bgColour !== "transparent" ? config.bgColour : undefined} />
                    {config.lit === "lit" && (
                      <Row
                        label="Light sources"
                        value={[
                          config.lightSources.back  && "Back",
                          config.lightSources.front && "Front",
                          config.lightSources.side  && (config.sideMode === "range" ? "Side (range)" : "Side"),
                        ].filter(Boolean).join(" + ")}
                      />
                    )}
                  </>
                )}
                <Row label="Text" value={config.text} />
                <Row label="Logo" value={config.logoUrl ? "Uploaded ✓" : "None"} />
                {config.selectedColours.length > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">Colours</span>
                    <div className="flex gap-1">
                      {config.selectedColours.map((c) => (
                        <div key={c} className="w-6 h-6 rounded-full border border-gray-200 shadow-sm" style={{ background: c }} />
                      ))}
                    </div>
                  </div>
                )}
                {config.lit === "lit" && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">Light temperature</span>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-full" style={{ background: warmthToGlowColour(config.lightWarmth) }} />
                      <span className="text-sm font-medium text-gray-700">
                        {config.lightWarmth < 40 ? "Cool" : config.lightWarmth > 70 ? "Warm" : "Neutral"}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* See it on your wall — hook for image-gen API */}
              <div className="rounded-2xl border-2 border-dashed border-orange-200 bg-orange-50 p-5 mb-5">
                <p className="text-sm font-bold text-orange-700 mb-1">📸 See it on your wall</p>
                <p className="text-xs text-orange-600 mb-3">
                  Upload a photo of your storefront and we&apos;ll paint this sign right onto it.
                </p>
                {/* IMAGE-GEN API HOOK — replace the placeholder below with real API call */}
                <div className="w-full h-32 rounded-xl bg-orange-100 border border-orange-200 flex items-center justify-center text-orange-300 text-xs">
                  [Image generation API goes here — paint sign onto uploaded wall photo]
                </div>
                <button className="mt-3 w-full rounded-xl bg-orange-500 py-3 text-sm font-bold text-white hover:bg-orange-600 transition-colors active:scale-95">
                  Upload my storefront photo
                </button>
              </div>

              {/* Config JSON for devs / AI step */}
              <details className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
                <summary className="px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide cursor-pointer select-none">
                  Config output (for developers)
                </summary>
                <pre className="px-4 pb-4 text-xs text-gray-600 overflow-x-auto whitespace-pre-wrap">
                  {JSON.stringify(finalConfig, null, 2)}
                </pre>
              </details>
            </StepCard>
          )}

          {/* Navigation */}
          <div className="flex gap-3 pt-2 pb-8">
            {step !== "type" && (
              <button
                onClick={back}
                className="flex-1 rounded-2xl border-2 border-gray-200 py-3.5 text-sm font-bold text-gray-600 hover:border-gray-300 transition-all active:scale-95"
              >
                ← Back
              </button>
            )}
            {step !== "done" && (
              <button
                onClick={next}
                disabled={!canAdvance()}
                className={cn(
                  "flex-1 rounded-2xl py-3.5 text-sm font-bold transition-all active:scale-95",
                  canAdvance()
                    ? "bg-orange-500 text-white hover:bg-orange-600 shadow-orange-200 shadow-md"
                    : "bg-gray-100 text-gray-400 cursor-not-allowed"
                )}
              >
                {step === "colours" ? "See the summary →" : "Next →"}
              </button>
            )}
            {step === "done" && (
              <button
                onClick={() => { setConfig(DEFAULT_CONFIG); setStep("type"); setShowAdvanced(false); }}
                className="flex-1 rounded-2xl border-2 border-gray-200 py-3.5 text-sm font-bold text-gray-600 hover:border-gray-300 transition-all active:scale-95"
              >
                Start over
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function Row({ label, value, colour }: { label: string; value?: string; colour?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-500">{label}</span>
      <div className="flex items-center gap-2">
        {colour && <div className="w-4 h-4 rounded-full border border-gray-200" style={{ background: colour }} />}
        <span className="text-sm font-semibold text-gray-800">{value}</span>
      </div>
    </div>
  );
}
