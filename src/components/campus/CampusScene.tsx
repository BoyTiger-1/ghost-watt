"use client";

// The school in 3D. The outline becomes a glass shell, one storey per floor;
// each room on each floor is a block coloured from cool slate (little waste)
// to red (the worst room), grey and see-through when it hasn't been scanned.
// Renders only when something changes ("demand"), so it costs nothing at rest.

import { useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Edges, Html, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { heatColor, orientedBox, projectOutline, roomCorners, roomKey, type Campus, type Pt, type RoomWaste } from "@/lib/campus";

export interface PlacedRoom {
  floorId: string;
  level: number;
  id: string;
  name: string;
  corners: Pt[];
  waste: RoomWaste | null;
  value: number;
}

/** Every room on every floor, in the outline's metre grid, with its waste for the chosen layer. */
export function placeRooms(campus: Campus, waste: Map<string, RoomWaste>, groups: string[] | null): { rooms: PlacedRoom[]; outline: Pt[]; max: number } {
  const plan = campus.floors.find((f) => f.plan)?.plan;
  let outline: Pt[];
  if (campus.footprint) outline = projectOutline(campus.footprint.outline).points;
  else {
    // No outline: the plan's own rectangle, 60 m wide.
    const a = plan?.aspect ?? 1.4;
    const w = 60;
    const h = w / a;
    outline = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
  }
  const box = orientedBox(outline);
  const rooms: PlacedRoom[] = [];
  for (const f of campus.floors) {
    const aspect = f.plan?.aspect ?? box.w / Math.max(1, box.h);
    for (const r of f.rooms) {
      const w = waste.get(roomKey(r.name)) ?? null;
      const value = !w ? 0 : groups ? groups.reduce((s, g) => s + (w.byGroup[g] ?? 0), 0) : w.waste;
      rooms.push({ floorId: f.id, level: f.level, id: r.id, name: r.name, corners: roomCorners(r, aspect, box, f.fit), waste: w, value });
    }
  }
  const max = Math.max(1, ...rooms.map((r) => r.value));
  return { rooms, outline, max };
}

function shapeOf(pts: Pt[]): THREE.Shape {
  const s = new THREE.Shape();
  pts.forEach(([x, y], i) => (i === 0 ? s.moveTo(x, y) : s.lineTo(x, y)));
  s.closePath();
  return s;
}

function Prism({ pts, height, y, children }: { pts: Pt[]; height: number; y: number; children: React.ReactNode }) {
  const geo = useMemo(() => new THREE.ExtrudeGeometry(shapeOf(pts), { depth: height, bevelEnabled: false }), [pts, height]);
  // Extrusion runs along +z; turned so it rises along +y, with north toward -z.
  return (
    <mesh geometry={geo} rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0]}>
      {children}
    </mesh>
  );
}

function Room({
  room,
  max,
  y,
  height,
  selected,
  onSelect,
}: {
  room: PlacedRoom;
  max: number;
  y: number;
  height: number;
  selected: boolean;
  onSelect: (id: string | null) => void;
}) {
  const [hover, setHover] = useState(false);
  const t = room.value / max;
  const scanned = !!room.waste;
  const color = scanned ? heatColor(t) : "#6c7392";
  const inset = useMemo(() => {
    // Pull each room in slightly so neighbours read as separate blocks.
    const cx = room.corners.reduce((s, p) => s + p[0], 0) / room.corners.length;
    const cy = room.corners.reduce((s, p) => s + p[1], 0) / room.corners.length;
    return room.corners.map(([x, yy]) => [cx + (x - cx) * 0.93, cy + (yy - cy) * 0.93] as Pt);
  }, [room.corners]);
  const top = inset.reduce((s, p) => [s[0] + p[0] / inset.length, s[1] + p[1] / inset.length], [0, 0]);
  const lift = selected || hover ? 0.6 : 0;
  return (
    <group
      onPointerOver={(e) => {
        e.stopPropagation();
        setHover(true);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        setHover(false);
        document.body.style.cursor = "";
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(selected ? null : room.id);
      }}
    >
      <Prism pts={inset} height={height * (scanned ? 0.25 + 0.6 * Math.max(0.15, t) : 0.2)} y={y + 0.3 + lift}>
        <meshStandardMaterial
          color={color}
          emissive={scanned ? color : "#000000"}
          emissiveIntensity={scanned ? 0.15 + t * 0.55 : 0}
          transparent
          opacity={scanned ? 0.94 : 0.12}
          depthWrite={scanned}
          roughness={0.55}
        />
        {/* Not scanned: a pale outline only, so it never reads as "nothing wasted". */}
        {selected || hover ? <Edges color="#ffffff" /> : !scanned ? <Edges color="#8a93b8" /> : null}
      </Prism>
      {(selected || hover) && (
        <Html position={[top[0], y + height + 1.2 + lift, -top[1]]} center style={{ pointerEvents: "none" }} zIndexRange={[30, 0]}>
          <div className="whitespace-nowrap rounded-full bg-[#1c1b18]/90 px-2.5 py-1 text-[12px] font-medium text-white shadow-lg">
            {room.name} · {scanned ? `$${Math.round(room.waste!.waste).toLocaleString("en-US")}/yr` : "not scanned"}
          </div>
        </Html>
      )}
    </group>
  );
}

export function CampusScene({
  campus,
  placed,
  explode,
  onlyLevel,
  selected,
  onSelect,
}: {
  campus: Campus;
  placed: ReturnType<typeof placeRooms>;
  explode: number;
  onlyLevel: number | null;
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  const { rooms, outline, max } = placed;
  const levels = Math.max(1, campus.floors.length, campus.footprint?.levels ?? 1);
  const h = campus.floorHeight;
  const gap = h * (1 + explode * 1.6);
  const size = useMemo(() => {
    const xs = outline.map((p) => p[0]);
    const ys = outline.map((p) => p[1]);
    return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 20);
  }, [outline]);
  const box = useMemo(() => orientedBox(outline), [outline]);

  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 1.5]}
      camera={{ position: [box.cx + size * 0.9, size * 0.85, -box.cy + size * 1.05], fov: 35, near: 0.5, far: size * 20 }}
      onPointerMissed={() => onSelect(null)}
      gl={{ antialias: true, alpha: true }}
      style={{ background: "transparent" }}
    >
      <ambientLight intensity={0.6} />
      <directionalLight position={[size, size * 1.5, size * 0.6]} intensity={1.3} />
      <directionalLight position={[-size, size, -size]} intensity={0.35} color="#b9c6ff" />

      {/* ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[box.cx, -0.05, -box.cy]}>
        <circleGeometry args={[size * 1.4, 64]} />
        <meshStandardMaterial color="#2a3150" transparent opacity={0.45} />
      </mesh>

      {Array.from({ length: levels }).map((_, level) => {
        if (onlyLevel !== null && level !== onlyLevel) return null;
        const y = level * gap;
        return (
          <group key={level}>
            {/* floor slab */}
            <Prism pts={outline} height={0.3} y={y}>
              <meshStandardMaterial color={level === 0 ? "#363e60" : "#4b5580"} transparent opacity={level === 0 ? 0.95 : 0.22} depthWrite={level === 0} />
              <Edges color="#7f8cc0" />
            </Prism>
            {/* the storey's glass walls */}
            <Prism pts={outline} height={h} y={y}>
              <meshStandardMaterial color="#9fb0e0" transparent opacity={0.05} depthWrite={false} side={THREE.DoubleSide} />
              <Edges color="#5d6994" />
            </Prism>
            {rooms
              .filter((r) => r.level === level)
              .map((r) => (
                <Room key={r.floorId + r.id} room={r} max={max} y={y} height={h} selected={selected === r.floorId + r.id} onSelect={(id) => onSelect(id ? r.floorId + r.id : null)} />
              ))}
          </group>
        );
      })}

      <OrbitControls makeDefault target={[box.cx, levels * gap * 0.35, -box.cy]} enableDamping maxPolarAngle={Math.PI * 0.48} minDistance={size * 0.4} maxDistance={size * 4} />
    </Canvas>
  );
}
