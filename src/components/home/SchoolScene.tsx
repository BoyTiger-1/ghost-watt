"use client";

// The hero object: a clay diorama of a school at dusk.
//
// Everyone has gone home, and one room at a time the building gives itself away:
// the lab of monitors glowing blue, a projector nobody switched off, the vending
// machine humming in the lobby. Each lit room carries a little price tag, which is
// the whole product in one picture.

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, Environment, Html, Lightformer, RoundedBox } from "@react-three/drei";
import * as THREE from "three";

/* ---- palette ------------------------------------------------------------ */

const C = {
  slab: "#ece5d8",
  lawn: "#cbd5b6",
  lawn2: "#bccaa4",
  path: "#f7f2e8",
  wall: "#f3ede2",
  band: "#e3d8c6",
  parapet: "#e8dfd0",
  roof: "#d9d0c0",
  wing: "#e9cdb7",
  wingBand: "#ddbca3",
  glass: "#3a4462",
  warm: "#ffb54a",
  cool: "#a9c8ff",
  panel: "#2f3b5d",
  metal: "#cfc9bf",
  trunk: "#8d7560",
  bus: "#efb93f",
};

/* ---- the building's layout ---------------------------------------------- */

const MAIN = { x0: -3.2, x1: 2.0, z: 0.95, depth: 1.9, floorH: 0.75, floors: 3 };
const WING = { x0: 2.0, x1: 4.0, z0: -0.95, z1: 1.6, h: 1.6 };
const COLS = 9;
const WIN = { w: 0.36, h: 0.42 };

function colX(col: number) {
  const pad = 0.42;
  return MAIN.x0 + pad + (col * (MAIN.x1 - MAIN.x0 - pad * 2)) / (COLS - 1);
}
function floorY(floor: number) {
  return floor * MAIN.floorH + MAIN.floorH * 0.56;
}

type Kind = "warm" | "cool";
interface Lit {
  key: string;
  pos: [number, number, number];
  size: [number, number];
  kind: Kind;
  delay: number;
  flicker?: boolean;
  /** Rotation about Y, for windows on the wing's side wall. */
  ry?: number;
}

const LIT: Lit[] = [
  // the computer lab: three windows of monitors left on
  ...[0, 1, 2].map((c, i) => ({
    key: `lab${c}`,
    pos: [colX(c), floorY(1), MAIN.z + 0.012] as [number, number, number],
    size: [WIN.w, WIN.h] as [number, number],
    kind: "cool" as Kind,
    delay: 0.5 + i * 0.12,
  })),
  // room 214: one projector
  { key: "214", pos: [colX(7), floorY(2), MAIN.z + 0.012], size: [WIN.w, WIN.h], kind: "warm", delay: 1.0 },
  // the lobby, where the vending machine lives
  { key: "lobby", pos: [colX(4), 0.34, MAIN.z + 0.012], size: [0.5, 0.62], kind: "warm", delay: 1.3 },
  // the east hall: a tube that can't decide
  { key: "hall", pos: [colX(8), floorY(0), MAIN.z + 0.012], size: [WIN.w, WIN.h], kind: "warm", delay: 1.55, flicker: true },
  // the gym, lit for nobody
  ...[0, 1, 2, 3].map((i) => ({
    key: `gym${i}`,
    pos: [WING.x0 + 0.38 + i * 0.42, 1.08, WING.z1 + 0.012] as [number, number, number],
    size: [0.28, 0.5] as [number, number],
    kind: "warm" as Kind,
    delay: 1.8 + i * 0.08,
  })),
];

const LABELS = [
  { at: [colX(1), floorY(1) + 0.24, MAIN.z] as const, room: "Computer lab", what: "30 monitors", cost: "$796", tone: C.cool, delay: 1.1, stem: 14 },
  { at: [colX(7), floorY(2) + 0.24, MAIN.z] as const, room: "Room 214", what: "projector", cost: "$221", tone: C.warm, delay: 1.6, stem: 54 },
  { at: [colX(4), 0.68, MAIN.z + 0.3] as const, room: "Lobby", what: "vending machine", cost: "$194", tone: C.warm, delay: 2.0, stem: 18 },
  { at: [WING.x0 + 1.0, 1.36, WING.z1] as const, room: "Gym", what: "8 light fixtures", cost: "$849", tone: C.warm, delay: 2.4, stem: 30 },
];

/* ---- helpers ------------------------------------------------------------ */

function useGlowTexture() {
  return useMemo(() => {
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.35, "rgba(255,255,255,0.35)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, []);
}

const ease = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);

function Box({
  size,
  position,
  color,
  rough = 0.9,
  cast = true,
}: {
  size: [number, number, number];
  position: [number, number, number];
  color: string;
  rough?: number;
  cast?: boolean;
}) {
  return (
    <mesh position={position} castShadow={cast} receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={rough} />
    </mesh>
  );
}

/* ---- pieces ------------------------------------------------------------- */

function Ground() {
  return (
    <group>
      <RoundedBox args={[10.4, 0.34, 6.6]} radius={0.16} smoothness={4} position={[0.4, -0.17, 0.55]} receiveShadow>
        <meshStandardMaterial color={C.slab} roughness={0.95} />
      </RoundedBox>
      {/* lawns either side of the front path */}
      <RoundedBox args={[3.2, 0.04, 1.7]} radius={0.02} position={[-2.25, 0.02, 2.3]} receiveShadow>
        <meshStandardMaterial color={C.lawn} roughness={1} />
      </RoundedBox>
      <RoundedBox args={[2.3, 0.04, 1.7]} radius={0.02} position={[1.25, 0.02, 2.3]} receiveShadow>
        <meshStandardMaterial color={C.lawn} roughness={1} />
      </RoundedBox>
      <RoundedBox args={[1.6, 0.04, 2.6]} radius={0.02} position={[-4.0, 0.02, -0.3]} receiveShadow>
        <meshStandardMaterial color={C.lawn2} roughness={1} />
      </RoundedBox>
      {/* the front path */}
      <mesh position={[colX(4), 0.012, 2.3]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[0.62, 2.6]} />
        <meshStandardMaterial color={C.path} roughness={1} />
      </mesh>
    </group>
  );
}

function MainBlock() {
  const w = MAIN.x1 - MAIN.x0;
  const cx = (MAIN.x0 + MAIN.x1) / 2;
  const h = MAIN.floorH * MAIN.floors;
  const unlit = useMemo(
    () => new THREE.MeshStandardMaterial({ color: C.glass, roughness: 0.18, metalness: 0.35 }),
    [],
  );
  const litKeys = new Set(["1-0", "1-1", "1-2", "2-7", "0-4", "0-8"]);

  return (
    <group>
      <Box size={[w, h, MAIN.depth]} position={[cx, h / 2, 0]} color={C.wall} />
      {/* floor bands */}
      {[1, 2].map((f) => (
        <Box key={f} size={[w + 0.04, 0.06, MAIN.depth + 0.04]} position={[cx, f * MAIN.floorH, 0]} color={C.band} />
      ))}
      {/* plinth */}
      <Box size={[w + 0.06, 0.12, MAIN.depth + 0.06]} position={[cx, 0.06, 0]} color={C.band} />
      {/* parapet + roof */}
      <Box size={[w + 0.1, 0.14, MAIN.depth + 0.1]} position={[cx, h + 0.07, 0]} color={C.parapet} />
      <Box size={[w - 0.06, 0.02, MAIN.depth - 0.06]} position={[cx, h + 0.141, 0]} color={C.roof} cast={false} />

      {/* the dark windows: everything that was, correctly, switched off */}
      {Array.from({ length: MAIN.floors }).flatMap((_, f) =>
        Array.from({ length: COLS }).map((__, c) => {
          if (litKeys.has(`${f}-${c}`)) return null;
          return (
            <mesh key={`${f}-${c}`} position={[colX(c), floorY(f), MAIN.z + 0.008]} material={unlit}>
              <boxGeometry args={[WIN.w, WIN.h, 0.02]} />
            </mesh>
          );
        }),
      )}
      {/* sills */}
      {Array.from({ length: MAIN.floors }).flatMap((_, f) =>
        Array.from({ length: COLS }).map((__, c) =>
          f === 0 && c === 4 ? null : (
            <Box
              key={`s${f}-${c}`}
              size={[WIN.w + 0.08, 0.035, 0.06]}
              position={[colX(c), floorY(f) - WIN.h / 2 - 0.02, MAIN.z + 0.03]}
              color={C.parapet}
            />
          ),
        ),
      )}
      {/* entrance canopy */}
      <Box size={[1.0, 0.06, 0.55]} position={[colX(4), 0.76, MAIN.z + 0.27]} color={C.parapet} />
      {[-0.42, 0.42].map((dx) => (
        <mesh key={dx} position={[colX(4) + dx, 0.38, MAIN.z + 0.5]} castShadow>
          <cylinderGeometry args={[0.025, 0.025, 0.76, 12]} />
          <meshStandardMaterial color={C.metal} roughness={0.5} metalness={0.4} />
        </mesh>
      ))}

      <Roof />
    </group>
  );
}

function Roof() {
  const top = MAIN.floorH * MAIN.floors + 0.15;
  return (
    <group>
      {/* HVAC units: the other thing that runs all night */}
      <Box size={[0.55, 0.3, 0.45]} position={[-2.55, top + 0.15, -0.3]} color={C.metal} rough={0.6} />
      <Box size={[0.4, 0.22, 0.4]} position={[1.4, top + 0.11, -0.45]} color={C.metal} rough={0.6} />
      <mesh position={[-2.55, top + 0.31, -0.3]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.15, 24]} />
        <meshStandardMaterial color="#9b958b" />
      </mesh>
      {/* a modest solar array */}
      {Array.from({ length: 2 }).flatMap((_, r) =>
        Array.from({ length: 5 }).map((__, i) => (
          <mesh
            key={`${r}-${i}`}
            position={[-1.75 + i * 0.5, top + 0.12, -0.35 + r * 0.48]}
            rotation={[-0.42, 0, 0]}
            castShadow
          >
            <boxGeometry args={[0.44, 0.025, 0.36]} />
            <meshStandardMaterial color={C.panel} roughness={0.22} metalness={0.55} />
          </mesh>
        )),
      )}
    </group>
  );
}

function Wing() {
  const w = WING.x1 - WING.x0;
  const d = WING.z1 - WING.z0;
  const cx = (WING.x0 + WING.x1) / 2;
  const cz = (WING.z0 + WING.z1) / 2;
  return (
    <group>
      <Box size={[w, WING.h, d]} position={[cx, WING.h / 2, cz]} color={C.wing} />
      <Box size={[w + 0.06, 0.12, d + 0.06]} position={[cx, 0.06, cz]} color={C.wingBand} />
      <Box size={[w + 0.1, 0.12, d + 0.1]} position={[cx, WING.h + 0.06, cz]} color={C.wingBand} />
      <Box size={[w - 0.06, 0.02, d - 0.06]} position={[cx, WING.h + 0.121, cz]} color={C.roof} cast={false} />
      {/* side windows on the gym, dark */}
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} position={[WING.x1 + 0.008, 1.08, WING.z0 + 0.45 + i * 0.55]} rotation={[0, Math.PI / 2, 0]}>
          <boxGeometry args={[0.3, 0.5, 0.02]} />
          <meshStandardMaterial color={C.glass} roughness={0.18} metalness={0.35} />
        </mesh>
      ))}
      {/* gym doors */}
      <Box size={[0.5, 0.55, 0.02]} position={[cx, 0.3, WING.z1 + 0.01]} color={C.glass} rough={0.3} />
    </group>
  );
}

function Tree({ position, scale = 1, tone = 0 }: { position: [number, number, number]; scale?: number; tone?: number }) {
  const leaf = ["#a9bb8f", "#9cb183", "#b8c69c"][tone % 3];
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.2, 0]} castShadow>
        <cylinderGeometry args={[0.045, 0.06, 0.4, 8]} />
        <meshStandardMaterial color={C.trunk} roughness={1} />
      </mesh>
      <mesh position={[0, 0.66, 0]} scale={[1, 1.18, 1]} castShadow receiveShadow>
        <icosahedronGeometry args={[0.38, 1]} />
        <meshStandardMaterial color={leaf} roughness={0.95} flatShading />
      </mesh>
    </group>
  );
}

function Bus() {
  return (
    <group position={[3.55, 0, 3.05]} rotation={[0, -0.08, 0]}>
      <RoundedBox args={[1.5, 0.46, 0.5]} radius={0.07} smoothness={4} position={[0, 0.33, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={C.bus} roughness={0.55} />
      </RoundedBox>
      {/* window band */}
      <mesh position={[0, 0.43, 0.252]}>
        <planeGeometry args={[1.22, 0.14]} />
        <meshStandardMaterial color={C.glass} roughness={0.2} metalness={0.3} />
      </mesh>
      <mesh position={[0, 0.27, 0.252]}>
        <planeGeometry args={[1.38, 0.02]} />
        <meshStandardMaterial color="#2b2b2b" />
      </mesh>
      {[-0.48, 0.48].map((x) =>
        [-0.26, 0.26].map((z) => (
          <mesh key={`${x}${z}`} position={[x, 0.1, z]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.1, 0.1, 0.06, 16]} />
            <meshStandardMaterial color="#2a2a2c" roughness={0.8} />
          </mesh>
        )),
      )}
    </group>
  );
}

function Flag() {
  const flag = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (flag.current) flag.current.rotation.y = Math.sin(clock.elapsedTime * 1.6) * 0.18;
  });
  return (
    <group position={[colX(4) + 1.05, 0, 2.05]}>
      <mesh position={[0, 0.7, 0]} castShadow>
        <cylinderGeometry args={[0.012, 0.016, 1.4, 8]} />
        <meshStandardMaterial color={C.metal} metalness={0.5} roughness={0.4} />
      </mesh>
      <mesh ref={flag} position={[0.14, 1.28, 0]}>
        <planeGeometry args={[0.28, 0.17]} />
        <meshStandardMaterial color="#d9512c" side={THREE.DoubleSide} roughness={0.8} />
      </mesh>
    </group>
  );
}

/* ---- the lights left on ------------------------------------------------- */

function LitWindows() {
  const glowTex = useGlowTexture();
  const mats = useRef<THREE.MeshStandardMaterial[]>([]);
  const glows = useRef<THREE.SpriteMaterial[]>([]);
  const labLight = useRef<THREE.PointLight>(null);
  const lobbyLight = useRef<THREE.PointLight>(null);
  const start = useRef<number | null>(null);

  useFrame(({ clock }) => {
    if (start.current === null) start.current = clock.elapsedTime;
    const t = clock.elapsedTime - start.current;
    LIT.forEach((w, i) => {
      let k = ease((t - w.delay) / 0.45);
      if (w.flicker && t > w.delay + 1) {
        const p = (t * 0.37) % 1;
        if ((p > 0.4 && p < 0.42) || (p > 0.44 && p < 0.45)) k *= 0.2;
      }
      const m = mats.current[i];
      if (m) m.emissiveIntensity = (w.kind === "cool" ? 0.95 : 1.5) * k;
      const g = glows.current[i];
      if (g) g.opacity = (w.kind === "cool" ? 0.28 : 0.42) * k;
    });
    if (labLight.current) labLight.current.intensity = 1.0 * ease((t - 0.6) / 0.6);
    if (lobbyLight.current) lobbyLight.current.intensity = 2.2 * ease((t - 1.3) / 0.6);
  });

  return (
    <group>
      {LIT.map((w, i) => {
        const color = w.kind === "cool" ? C.cool : C.warm;
        return (
          <group key={w.key} position={w.pos} rotation={[0, w.ry ?? 0, 0]}>
            <mesh>
              <boxGeometry args={[w.size[0], w.size[1], 0.02]} />
              <meshStandardMaterial
                ref={(m) => {
                  if (m) mats.current[i] = m;
                }}
                color={w.kind === "cool" ? "#dfe9ff" : "#ffe2b0"}
                emissive={color}
                emissiveIntensity={0}
                roughness={0.3}
                toneMapped={false}
              />
            </mesh>
            <sprite position={[0, 0, 0.06]} scale={[w.size[0] * 2.3, w.size[1] * 2.1, 1]}>
              <spriteMaterial
                ref={(m) => {
                  if (m) glows.current[i] = m;
                }}
                map={glowTex}
                color={color}
                transparent
                opacity={0}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
              />
            </sprite>
          </group>
        );
      })}
      <pointLight ref={labLight} position={[colX(1), floorY(1), MAIN.z + 0.6]} color={C.cool} distance={2.4} decay={1.6} intensity={0} />
      <pointLight ref={lobbyLight} position={[colX(4), 0.4, MAIN.z + 0.7]} color={C.warm} distance={2.6} decay={1.5} intensity={0} />
    </group>
  );
}

function Tags() {
  return (
    <>
      {LABELS.map((l) => (
        <Html key={l.room} position={l.at as unknown as [number, number, number]} zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
          {/* One tag is plenty on a phone-sized canvas. */}
          <div
            className={`label-in -translate-x-1/2 -translate-y-full ${l.delay > 1.2 ? "hidden md:block" : ""}`}
            style={{ animationDelay: `${l.delay}s` }}
          >
            <div className="flex flex-col items-center">
              {/* Theme tokens only: a fixed white chip turned into white text on white in dark mode. */}
              <div className="scene-tag flex items-center gap-2 whitespace-nowrap rounded-full border py-1.5 pl-2 pr-3 text-[12px] leading-none text-graphite backdrop-blur-md">
                <span className="relative h-2 w-2 rounded-full" style={{ background: l.tone, boxShadow: `0 0 0 3px ${l.tone}33` }}>
                  <span className="soft-pulse absolute inset-0 rounded-full" style={{ background: l.tone }} />
                </span>
                <span className="font-medium">{l.room}</span>
                <span className="hidden text-stone md:inline">{l.what}</span>
                <span className="font-numeric text-[11px] font-semibold text-amber">{l.cost}/yr</span>
              </div>
              <span className="w-px bg-graphite/30" style={{ height: l.stem }} />
              <span className="h-1.5 w-1.5 rounded-full bg-graphite/50" />
            </div>
          </div>
        </Html>
      ))}
    </>
  );
}

/* ---- camera + interaction ----------------------------------------------- */

const TARGET = new THREE.Vector3(0.2, 0.55, 0.6);
const OFFSET = new THREE.Vector3(7.6, 5.6, 11.2);

function Rig({ children }: { children: React.ReactNode }) {
  const group = useRef<THREE.Group>(null);
  const { camera, size } = useThree();
  const pointer = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const aspect = size.width / Math.max(1, size.height);
    const k = aspect < 0.8 ? 1.6 : aspect < 1.15 ? 1.38 : aspect < 1.5 ? 1.2 : 1.1;
    camera.position.copy(TARGET).addScaledVector(OFFSET, k);
    camera.lookAt(TARGET);
  }, [camera, size]);

  useEffect(() => {
    const move = (e: PointerEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => window.removeEventListener("pointermove", move);
  }, []);

  useFrame(({ clock }, delta) => {
    const g = group.current;
    if (!g) return;
    const scroll = Math.min(1, window.scrollY / Math.max(1, window.innerHeight));
    const idle = Math.sin(clock.elapsedTime * 0.25) * 0.04;
    const ry = -0.12 + pointer.current.x * 0.14 + scroll * 0.32 + idle;
    const rx = pointer.current.y * 0.035;
    const damp = 1 - Math.exp(-delta * 3);
    g.rotation.y += (ry - g.rotation.y) * damp;
    g.rotation.x += (rx - g.rotation.x) * damp;
    g.position.y += (-scroll * 0.6 - g.position.y) * damp;
  });

  return (
    <group ref={group}>
      <group position={[-0.4, 0, -0.5]}>{children}</group>
    </group>
  );
}

/* ---- the canvas --------------------------------------------------------- */

export function SchoolScene({ onReady }: { onReady?: () => void }) {
  // Render only while the scene is on screen and the tab is visible: a WebGL
  // canvas drawing 60 frames a second below the fold was most of the page's lag.
  const host = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState(true);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let onScreen = true;
    const sync = () => setLive(onScreen && document.visibilityState === "visible");
    const io = new IntersectionObserver(([e]) => {
      onScreen = e.isIntersecting;
      sync();
    });
    io.observe(el);
    document.addEventListener("visibilitychange", sync);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  return (
    <div ref={host} className="h-full w-full">
    <Canvas
      shadows
      frameloop={live ? "always" : "never"}
      // 1.5x is indistinguishable from 2x at this size and draws ~44% fewer pixels.
      dpr={[1, 1.5]}
      camera={{ fov: 28, near: 0.5, far: 80, position: [8, 6, 12] }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
        onReady?.();
      }}
      style={{ background: "transparent" }}
    >
      {/* dusk: a cool sky fill and a low, warm sun */}
      <hemisphereLight args={["#eef0ff", "#e8d9c2", 0.85]} />
      <directionalLight
        position={[-7, 9, 6]}
        intensity={2.1}
        color="#ffe1b8"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
        shadow-radius={6}
      />
      <directionalLight position={[8, 4, -6]} intensity={0.45} color="#b9c6ff" />

      <Environment resolution={256} frames={1} environmentIntensity={0.55}>
        <Lightformer form="rect" intensity={2.4} color="#fff3e2" position={[0, 6, 6]} scale={[12, 4, 1]} />
        <Lightformer form="rect" intensity={1.2} color="#c9d4ff" position={[-8, 3, -2]} rotation={[0, Math.PI / 2, 0]} scale={[8, 4, 1]} />
        <Lightformer form="ring" intensity={1.5} color="#ffc98a" position={[6, 2, 4]} scale={2} />
      </Environment>

      <Rig>
        <Ground />
        <MainBlock />
        <Wing />
        <LitWindows />
        <Flag />
        <Bus />
        <Tree position={[-4.1, 0, 1.9]} scale={1.1} tone={0} />
        <Tree position={[-3.7, 0, -1.9]} scale={0.95} tone={1} />
        <Tree position={[-2.0, 0, 2.95]} scale={0.8} tone={2} />
        <Tree position={[4.85, 0, -1.7]} scale={1.05} tone={1} />
        <Tree position={[5.0, 0, 1.15]} scale={0.85} tone={0} />
        <Tree position={[0.1, 0, 3.15]} scale={0.7} tone={2} />
        <Tags />
      </Rig>

      {/* Baked once: re-rendering soft ground shadows every frame bought nothing visible. */}
      <ContactShadows frames={1} position={[0, -0.36, 0]} scale={18} blur={2.6} opacity={0.32} far={3} resolution={512} color="#3a3328" />
    </Canvas>
    </div>
  );
}
