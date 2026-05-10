'use client';

import React, { useRef, useMemo, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import * as THREE from 'three';

// ============================================================================
// Types
// ============================================================================

export interface TerrainMeshData {
  heightMap: Float32Array;
  width: number;
  height: number;
  scale: number;
  colors?: Float32Array; // vertex colors for biome visualization
}

export interface TreeMeshData {
  trunkGeometry: THREE.BufferGeometry | null;
  canopyGeometry: THREE.BufferGeometry | null;
  leafGeometry: THREE.BufferGeometry | null;
  position: [number, number, number];
  barkMaterial?: THREE.Material;
  leafMaterial?: THREE.Material;
}

export interface ConstraintSceneData {
  objects: Array<{
    id: string;
    position: [number, number, number];
    scale: [number, number, number];
    color: string;
    label: string;
    violation?: boolean;
  }>;
  violations?: number;
  energy?: number;
}

// ============================================================================
// Terrain Mesh — heightmap-based terrain with biome colors
// ============================================================================

function TerrainMesh({ data }: { data: TerrainMeshData | null }) {
  const geometry = useMemo(() => {
    if (!data) return null;
    const { heightMap, width, height, scale, colors } = data;
    const geo = new THREE.PlaneGeometry(scale, scale, width - 1, height - 1);
    const pos = geo.attributes.position;

    // Apply heightmap
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const u = (x / scale + 0.5) * (width - 1);
      const v = (y / scale + 0.5) * (height - 1);
      const ui = Math.max(0, Math.min(width - 1, Math.floor(u)));
      const vi = Math.max(0, Math.min(height - 1, Math.floor(v)));
      const h = heightMap[vi * width + ui] ?? 0;
      pos.setZ(i, h * scale * 0.3);
    }

    // Apply vertex colors (biome-based)
    if (colors && colors.length >= pos.count * 3) {
      const colorAttr = new THREE.BufferAttribute(colors, 3);
      geo.setAttribute('color', colorAttr);
    } else {
      // Generate simple slope/height-based colors
      const colorArray = new Float32Array(pos.count * 3);
      const seaLevel = data.heightMap.length > 0 ? 0.3 : 0;
      for (let i = 0; i < pos.count; i++) {
        const h = pos.getZ(i) / (scale * 0.3);
        const nx = i > 0 && i < pos.count - 1 ? (pos.getZ(i + 1) - pos.getZ(i - 1)) : 0;
        const slope = Math.abs(nx) * 5;

        if (h < seaLevel * 0.7) {
          // Deep water
          colorArray[i * 3] = 0.1; colorArray[i * 3 + 1] = 0.2; colorArray[i * 3 + 2] = 0.5;
        } else if (h < seaLevel) {
          // Shallow water / sand
          colorArray[i * 3] = 0.76; colorArray[i * 3 + 1] = 0.72; colorArray[i * 3 + 2] = 0.48;
        } else if (slope > 0.3) {
          // Cliff/rock
          colorArray[i * 3] = 0.45; colorArray[i * 3 + 1] = 0.4; colorArray[i * 3 + 2] = 0.35;
        } else if (h > 0.7) {
          // Snow
          colorArray[i * 3] = 0.9; colorArray[i * 3 + 1] = 0.92; colorArray[i * 3 + 2] = 0.95;
        } else if (h > 0.5) {
          // Mountain
          colorArray[i * 3] = 0.5; colorArray[i * 3 + 1] = 0.45; colorArray[i * 3 + 2] = 0.4;
        } else {
          // Grassland
          colorArray[i * 3] = 0.25 + Math.random() * 0.05;
          colorArray[i * 3 + 1] = 0.5 + Math.random() * 0.1;
          colorArray[i * 3 + 2] = 0.15;
        }
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colorArray, 3));
    }

    geo.computeVertexNormals();
    return geo;
  }, [data]);

  if (!geometry) return null;

  return (
    <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} receiveShadow castShadow>
      <meshStandardMaterial vertexColors roughness={0.85} metalness={0.05} side={THREE.DoubleSide} />
    </mesh>
  );
}

// ============================================================================
// Material Preview — sphere with material + rotating platform
// ============================================================================

function MaterialSphere({ material }: { material: THREE.Material | null }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const platformRef = useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    if (meshRef.current) meshRef.current.rotation.y += delta * 0.2;
    if (platformRef.current) platformRef.current.rotation.y += delta * 0.1;
  });

  return (
    <group>
      <mesh ref={platformRef} position={[0, -1.6, 0]} receiveShadow>
        <cylinderGeometry args={[2.5, 2.5, 0.1, 32]} />
        <meshStandardMaterial color="#222" roughness={0.8} metalness={0.3} />
      </mesh>
      <mesh ref={meshRef} position={[0, 0, 0]} castShadow material={material ?? undefined}>
        <sphereGeometry args={[1.5, 64, 64]} />
        {!material && <meshStandardMaterial color="#888888" roughness={0.5} />}
      </mesh>
      {/* Material info labels */}
      {material && (
        <mesh position={[0, -1.5, 0]}>
          <planeGeometry args={[3, 0.3]} />
          <meshBasicMaterial color="#000" transparent opacity={0.5} />
        </mesh>
      )}
    </group>
  );
}

// ============================================================================
// Constraint Visualization — indoor scene with furniture
// ============================================================================

function ConstraintVisualization({ data }: { data: ConstraintSceneData | null }) {
  if (!data) return null;

  return (
    <group>
      {data.objects.map((obj) => (
        <group key={obj.id} position={obj.position}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={obj.scale} />
            <meshStandardMaterial
              color={obj.violation ? '#ff4444' : obj.color}
              roughness={0.6}
              transparent={obj.violation}
              opacity={obj.violation ? 0.8 : 1}
            />
          </mesh>
          {/* Label */}
          <mesh position={[0, obj.scale[1] / 2 + 0.15, 0]}>
            <planeGeometry args={[0.6, 0.2]} />
            <meshBasicMaterial color="#000" transparent opacity={0.6} />
          </mesh>
        </group>
      ))}
      {/* Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[12, 12]} />
        <meshStandardMaterial color="#3a3a3a" roughness={0.9} />
      </mesh>
      {/* Room walls (wireframe) */}
      <mesh position={[0, 1.5, 0]}>
        <boxGeometry args={[8, 3, 8]} />
        <meshBasicMaterial color="#555" wireframe transparent opacity={0.15} />
      </mesh>
      {/* Violation indicator */}
      {data.violations !== undefined && data.violations > 0 && (
        <mesh position={[3.5, 2.8, -3.5]}>
          <sphereGeometry args={[0.15, 8, 8]} />
          <meshBasicMaterial color="#ff0000" />
        </mesh>
      )}
    </group>
  );
}

// ============================================================================
// Vegetation Mesh — tree with trunk, canopy, and leaves
// ============================================================================

function VegetationMesh({ data }: { data: TreeMeshData | null }) {
  if (!data) return null;

  return (
    <group position={data.position}>
      {data.trunkGeometry && (
        <mesh geometry={data.trunkGeometry} castShadow receiveShadow material={data.barkMaterial ?? undefined}>
          {!data.barkMaterial && <meshStandardMaterial color="#5c3a1e" roughness={0.9} />}
        </mesh>
      )}
      {data.canopyGeometry && (
        <mesh geometry={data.canopyGeometry} castShadow material={data.leafMaterial ?? undefined}>
          {!data.leafMaterial && <meshStandardMaterial color="#2d6b1e" roughness={0.8} />}
        </mesh>
      )}
      {data.leafGeometry && (
        <mesh geometry={data.leafGeometry} castShadow>
          <meshStandardMaterial color="#3a8a2a" roughness={0.7} side={THREE.DoubleSide} transparent opacity={0.9} />
        </mesh>
      )}
    </group>
  );
}

// ============================================================================
// Procedural Fallback Tree — generates a more realistic tree
// ============================================================================

function ProceduralTree({ seed, trunkLength, trunkRadius, branchAngle, branchCount, canopyRadius }: {
  seed: number; trunkLength: number; trunkRadius: number;
  branchAngle: number; branchCount: number; canopyRadius: number;
}) {
  const groupRef = useRef<THREE.Group>(null);

  const treeGroup = useMemo(() => {
    const g = new THREE.Group();

    // Simple seeded RNG
    const rng = (() => {
      let s = seed;
      return () => { s = (s * 16807 + 0) % 2147483647; return (s - 1) / 2147483646; };
    })();

    // Trunk — tapered cylinder
    const trunkGeo = new THREE.CylinderGeometry(
      trunkRadius * 0.6, trunkRadius, trunkLength, 12, 4
    );
    // Slight curve to trunk
    const trunkPos = trunkGeo.attributes.position;
    for (let i = 0; i < trunkPos.count; i++) {
      const y = trunkPos.getY(i);
      const normalizedY = y / trunkLength + 0.5;
      const sway = Math.sin(normalizedY * Math.PI) * 0.05 * (1 + rng());
      trunkPos.setX(i, trunkPos.getX(i) + sway);
    }
    trunkGeo.computeVertexNormals();

    const trunkMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0.36 + rng() * 0.05, 0.23 + rng() * 0.03, 0.1),
      roughness: 0.92,
      metalness: 0.02,
    });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = trunkLength / 2;
    trunk.castShadow = true;
    g.add(trunk);

    // Branches — recursively generated
    function addBranch(origin: THREE.Vector3, direction: THREE.Vector3, length: number, radius: number, depth: number) {
      if (depth <= 0 || length < 0.1 || radius < 0.01) return;

      const branchGeo = new THREE.CylinderGeometry(radius * 0.6, radius, length, 8, 2);
      const branchMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(0.35 + rng() * 0.05, 0.22 + rng() * 0.03, 0.09),
        roughness: 0.9,
      });
      const branch = new THREE.Mesh(branchGeo, branchMat);
      branch.position.copy(origin);
      branch.castShadow = true;

      // Orient branch
      const up = new THREE.Vector3(0, 1, 0);
      const quat = new THREE.Quaternion().setFromUnitVectors(up, direction.clone().normalize());
      branch.quaternion.copy(quat);
      branch.position.add(direction.clone().multiplyScalar(length / 2));
      g.add(branch);

      // Sub-branches
      const endPos = origin.clone().add(direction.clone().multiplyScalar(length));
      for (let i = 0; i < 2; i++) {
        const angle = (branchAngle * Math.PI / 180) * (0.8 + rng() * 0.4);
        const rotAxis = new THREE.Vector3(rng() - 0.5, 0, rng() - 0.5).normalize();
        const newDir = direction.clone().applyAxisAngle(rotAxis, angle).normalize();
        newDir.y = Math.max(newDir.y, 0.2); // Bias upward
        newDir.normalize();
        addBranch(endPos, newDir, length * (0.6 + rng() * 0.2), radius * 0.6, depth - 1);
      }
    }

    // Generate main branches from top of trunk
    const topOfTrunk = new THREE.Vector3(0, trunkLength, 0);
    for (let i = 0; i < branchCount; i++) {
      const theta = (i / branchCount) * Math.PI * 2 + rng() * 0.5;
      const phi = (branchAngle * Math.PI / 180) * (0.7 + rng() * 0.6);
      const dir = new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta),
        Math.cos(phi),
        Math.sin(phi) * Math.sin(theta)
      ).normalize();
      addBranch(topOfTrunk, dir, trunkLength * 0.4, trunkRadius * 0.7, 3);
    }

    // Canopy — cluster of spheres for foliage
    const leafMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0.15 + rng() * 0.1, 0.35 + rng() * 0.15, 0.08 + rng() * 0.05),
      roughness: 0.8,
    });
    const canopyCount = 3 + Math.floor(rng() * 4);
    for (let i = 0; i < canopyCount; i++) {
      const r = canopyRadius * (0.6 + rng() * 0.4);
      const canopyGeo = new THREE.SphereGeometry(r, 12, 10);
      const canopy = new THREE.Mesh(canopyGeo, leafMat);
      canopy.position.set(
        (rng() - 0.5) * canopyRadius * 0.8,
        trunkLength + canopyRadius * 0.3 + rng() * canopyRadius * 0.5,
        (rng() - 0.5) * canopyRadius * 0.8
      );
      canopy.castShadow = true;
      g.add(canopy);
    }

    return g;
  }, [seed, trunkLength, trunkRadius, branchAngle, branchCount, canopyRadius]);

  return <primitive object={treeGroup} />;
}

// ============================================================================
// Node Graph Visualization — shows evaluated node output as 3D
// ============================================================================

function NodeGraphViz({ hasResult }: { hasResult: boolean }) {
  const meshRef = useRef<THREE.Mesh>(null);
  useFrame((_, delta) => {
    if (meshRef.current) meshRef.current.rotation.y += delta * 0.3;
  });

  return (
    <group>
      <mesh ref={meshRef} position={[0, 1, 0]} castShadow>
        <torusKnotGeometry args={[1, 0.35, 128, 32]} />
        <meshPhysicalMaterial
          color={hasResult ? '#10b981' : '#e94560'}
          roughness={0.3}
          metalness={0.7}
          clearcoat={0.5}
        />
      </mesh>
      {hasResult && (
        <mesh position={[0, -0.5, 0]}>
          <ringGeometry args={[1.8, 2, 32]} />
          <meshBasicMaterial color="#10b981" transparent opacity={0.3} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
}

// ============================================================================
// Ground Plane
// ============================================================================

function GroundPlane({ color = '#3a5a2a' }: { color?: string }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
      <planeGeometry args={[100, 100]} />
      <meshStandardMaterial color={color} roughness={0.95} />
    </mesh>
  );
}

// ============================================================================
// Camera Controller
// ============================================================================

function CameraController({ mode }: { mode: CanvasMode }) {
  const { camera } = useThree();
  const initialized = useRef(false);

  if (!initialized.current) {
    initialized.current = true;
    if (mode === 'terrain') {
      camera.position.set(15, 12, 15);
    } else if (mode === 'vegetation') {
      camera.position.set(5, 4, 5);
    } else if (mode === 'constraint') {
      camera.position.set(6, 5, 6);
    } else if (mode === 'material') {
      camera.position.set(3, 2, 3);
    } else {
      camera.position.set(5, 3, 5);
    }
  }

  return null;
}

// ============================================================================
// Main Canvas Component
// ============================================================================

export type CanvasMode = 'terrain' | 'vegetation' | 'material' | 'constraint' | 'node';

interface SystemTestCanvasProps {
  mode: CanvasMode;
  terrainData?: TerrainMeshData | null;
  treeData?: TreeMeshData | null;
  materialData?: THREE.Material | null;
  constraintData?: ConstraintSceneData | null;
  treeSeed?: number;
  // Vegetation params for fallback tree
  treeParams?: {
    trunkLength: number;
    trunkRadius: number;
    branchAngle: number;
    branchCount: number;
    canopyRadius: number;
  };
  // Node evaluation state
  nodeEvalResult?: boolean;
}

export default function SystemTestCanvas({
  mode,
  terrainData,
  treeData,
  materialData,
  constraintData,
  treeSeed = 42,
  treeParams,
  nodeEvalResult = false,
}: SystemTestCanvasProps) {
  return (
    <Canvas
      shadows
      camera={{ position: [8, 6, 8], fov: 50, near: 0.1, far: 1000 }}
      style={{ width: '100%', height: '100%', background: '#1a1a2e' }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
    >
      <CameraController mode={mode} />

      {/* Lighting */}
      <ambientLight intensity={0.4} />
      <directionalLight
        position={[10, 15, 10]}
        intensity={1.2}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <directionalLight position={[-5, 8, -5]} intensity={0.3} />
      <hemisphereLight args={['#87ceeb', '#3a5f0b', 0.2]} />

      {/* System-specific content */}
      {mode === 'terrain' && (
        <>
          <TerrainMesh data={terrainData ?? null} />
          {!terrainData && <GroundPlane color="#3a5a2a" />}
        </>
      )}

      {mode === 'vegetation' && (
        <>
          {treeData ? (
            <VegetationMesh data={treeData} />
          ) : (
            <ProceduralTree
              seed={treeSeed}
              trunkLength={treeParams?.trunkLength ?? 3}
              trunkRadius={treeParams?.trunkRadius ?? 0.2}
              branchAngle={treeParams?.branchAngle ?? 30}
              branchCount={treeParams?.branchCount ?? 5}
              canopyRadius={treeParams?.canopyRadius ?? 2}
            />
          )}
          <GroundPlane color="#2d4a1e" />
        </>
      )}

      {mode === 'material' && (
        <MaterialSphere material={materialData ?? null} />
      )}

      {mode === 'constraint' && (
        <ConstraintVisualization data={constraintData ?? null} />
      )}

      {mode === 'node' && (
        <NodeGraphViz hasResult={nodeEvalResult} />
      )}

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.1}
        minDistance={2}
        maxDistance={100}
      />
      <Environment preset="sunset" background={false} />
      <fog attach="fog" args={['#1a1a2e', 30, 80]} />
    </Canvas>
  );
}
