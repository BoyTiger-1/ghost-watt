"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Icosahedron, MeshDistortMaterial, Points, PointMaterial } from "@react-three/drei";
import * as THREE from "three";

/** Deterministic PRNG so particle generation is pure (idempotent across renders). */
function makeRng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Slowly drifting field of "wasted watt" particles around the core. */
function PhantomField() {
  const ref = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const rng = makeRng(0x9e3779b9);
    const count = 700;
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // shell distribution
      const r = 2.2 + rng() * 2.4;
      const theta = rng() * Math.PI * 2;
      const phi = Math.acos(2 * rng() - 1);
      arr[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      arr[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      arr[i * 3 + 2] = r * Math.cos(phi);
    }
    return arr;
  }, []);

  useFrame((_, delta) => {
    if (ref.current) {
      ref.current.rotation.y += delta * 0.04;
      ref.current.rotation.x += delta * 0.015;
    }
  });

  return (
    <Points ref={ref} positions={positions} stride={3} frustumCulled={false}>
      <PointMaterial
        transparent
        color="#2fe6cf"
        size={0.028}
        sizeAttenuation
        depthWrite={false}
        opacity={0.7}
      />
    </Points>
  );
}

/** The Ghost Watt core: a distorted, glowing energy orb in a wireframe cage. */
function Core() {
  const cage = useRef<THREE.Mesh>(null);
  const inner = useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    if (cage.current) {
      cage.current.rotation.y += delta * 0.12;
      cage.current.rotation.x -= delta * 0.05;
    }
    if (inner.current) {
      inner.current.rotation.y -= delta * 0.2;
    }
  });

  return (
    <Float speed={1.4} rotationIntensity={0.4} floatIntensity={0.8}>
      {/* distorted glowing orb */}
      <mesh ref={inner}>
        <sphereGeometry args={[1.15, 64, 64]} />
        <MeshDistortMaterial
          color="#0c5d57"
          emissive="#2fe6cf"
          emissiveIntensity={0.65}
          roughness={0.15}
          metalness={0.6}
          distort={0.38}
          speed={1.6}
        />
      </mesh>

      {/* wireframe cage */}
      <Icosahedron ref={cage} args={[1.85, 1]}>
        <meshBasicMaterial color="#2fe6cf" wireframe transparent opacity={0.18} />
      </Icosahedron>

      {/* bright nucleus */}
      <mesh>
        <sphereGeometry args={[0.42, 32, 32]} />
        <meshBasicMaterial color="#c8ff4d" toneMapped={false} />
      </mesh>
    </Float>
  );
}

export function Scene3D() {
  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ position: [0, 0, 6], fov: 45 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      style={{ background: "transparent" }}
    >
      <ambientLight intensity={0.4} />
      <pointLight position={[4, 5, 5]} intensity={2.2} color="#2fe6cf" />
      <pointLight position={[-5, -3, -4]} intensity={1.4} color="#c8ff4d" />
      <Core />
      <PhantomField />
    </Canvas>
  );
}
