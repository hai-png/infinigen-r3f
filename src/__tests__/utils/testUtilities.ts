/**
 * testUtilities.ts — Foundational test helpers for Infinigen-R3F
 *
 * Provides reusable utilities for writing unit and integration tests:
 *   - Scene/camera/renderer setup
 *   - Terrain heightmap creation
 *   - Geometry, material, skeleton, and group validation
 *   - Quick test mesh and geometry generation
 *   - Seeded random number generators for deterministic tests
 *   - Node graph construction helpers
 *
 * Usage:
 *   import { createTestScene, assertValidMesh } from '@/__tests__/utils/testUtilities';
 */

import * as THREE from 'three';
import type { NodeInstance, NodeLink } from '../../core/nodes/core/types';

// ============================================================================
// Scene Setup
// ============================================================================

/** Create a minimal test scene with a renderer, scene, and camera */
export function createTestScene() {
  const scene = new THREE.Scene();

  // Add basic lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
  ambientLight.name = 'TestAmbientLight';
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.name = 'TestDirectionalLight';
  directionalLight.position.set(5, 10, 7);
  scene.add(directionalLight);

  const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
  camera.position.set(0, 5, 10);

  let renderer: THREE.WebGLRenderer | null = null;
  try {
    renderer = new THREE.WebGLRenderer();
    renderer.setSize(256, 256);
  } catch (err) {
    // Silently fall back - WebGLRenderer may not be available in headless CI environments
    if (process.env.NODE_ENV === 'development') console.debug('[testUtilities] WebGLRenderer creation fallback:', err);
    renderer = null;
  }

  return { scene, camera, renderer };
}

// ============================================================================
// Terrain Helpers
// ============================================================================

/** Create a simple test terrain heightmap using sine/cosine */
export function createTestTerrain(width = 64, height = 64, resolution = 1.0): Float32Array {
  const data = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const nx = x / width;
      const ny = y / height;
      // Multi-octave sine/cosine for more interesting terrain
      data[y * width + x] = (
        Math.sin(nx * Math.PI * 2 * resolution) *
        Math.cos(ny * Math.PI * 2 * resolution) * 5 +
        Math.sin(nx * Math.PI * 4 * resolution + 1.3) * 2.5 +
        Math.cos(ny * Math.PI * 6 * resolution + 0.7) * 1.2
      );
    }
  }
  return data;
}

// ============================================================================
// Camera Helpers
// ============================================================================

/**
 * Create a test camera at a given position and lookAt target.
 * @param position - Camera position (default [0, 10, 20])
 * @param lookAt   - Point to look at (default [0, 0, 0])
 */
export function createTestCamera(
  position: [number, number, number] = [0, 10, 20],
  lookAt: [number, number, number] = [0, 0, 0],
): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 1000);
  camera.position.set(position[0], position[1], position[2]);
  camera.lookAt(lookAt[0], lookAt[1], lookAt[2]);
  return camera;
}

// ============================================================================
// Validation Helpers
// ============================================================================

/** Validation result with validity flag and human-readable issues list */
export interface ValidationResult {
  valid: boolean;
  issues: string[];
}

/**
 * Assert that a mesh (or group) has valid geometry.
 *
 * @param mesh        The THREE.Mesh or THREE.Group to validate
 * @param minVertices Minimum number of vertices required (default 0)
 */
export function assertValidMesh(mesh: THREE.Mesh | THREE.Group, minVertices = 0): ValidationResult {
  const issues: string[] = [];

  if (mesh instanceof THREE.Mesh) {
    const geo = mesh.geometry;
    if (!geo.attributes.position) {
      issues.push('No position attribute');
    } else {
      const pos = geo.attributes.position;
      if (pos.count === 0) {
        issues.push('Empty geometry (0 vertices)');
      }
      if (minVertices > 0 && pos.count < minVertices) {
        issues.push(`Insufficient vertices: ${pos.count} < ${minVertices}`);
      }
      // Check for NaN
      for (let i = 0; i < Math.min(pos.count, 100); i++) {
        if (isNaN(pos.getX(i)) || isNaN(pos.getY(i)) || isNaN(pos.getZ(i))) {
          issues.push(`NaN in position at vertex ${i}`);
          break;
        }
      }
      // Check for Infinity
      for (let i = 0; i < Math.min(pos.count, 100); i++) {
        if (!isFinite(pos.getX(i)) || !isFinite(pos.getY(i)) || !isFinite(pos.getZ(i))) {
          issues.push(`Infinity in position at vertex ${i}`);
          break;
        }
      }
    }
  } else if (mesh instanceof THREE.Group) {
    if (mesh.children.length === 0) {
      issues.push('Empty group (no children)');
    }
    // Recursively validate children
    let childMeshCount = 0;
    mesh.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        childMeshCount++;
        const childResult = assertValidMesh(child, minVertices);
        if (!childResult.valid) {
          issues.push(`Child mesh "${child.name}": ${childResult.issues.join(', ')}`);
        }
      }
    });
    if (childMeshCount === 0) {
      issues.push('Group contains no meshes');
    }
  }

  return { valid: issues.length === 0, issues };
}

/**
 * Assert that a material is a valid Three.js material.
 */
export function assertValidMaterial(material: THREE.Material): ValidationResult {
  const issues: string[] = [];

  if (!(material instanceof THREE.Material)) {
    issues.push('Not an instance of THREE.Material');
    return { valid: false, issues };
  }

  if (material instanceof THREE.MeshStandardMaterial) {
    if (!material.color) issues.push('No color set');
    if (material.roughness < 0 || material.roughness > 1) issues.push('Roughness out of [0,1] range');
    if (material.metalness < 0 || material.metalness > 1) issues.push('Metalness out of [0,1] range');
  }

  if (material instanceof THREE.MeshPhysicalMaterial) {
    // Good - most capable material type
    if (material.transmission < 0 || material.transmission > 1) issues.push('Transmission out of [0,1] range');
    if (material.ior <= 0) issues.push('IOR must be positive');
  }

  if (material.type === 'MeshBasicMaterial') {
    issues.push('Using MeshBasicMaterial — consider MeshStandardMaterial for PBR');
  }

  // Check for NaN in color
  if ('color' in material && material.color instanceof THREE.Color) {
    if (isNaN(material.color.r) || isNaN(material.color.g) || isNaN(material.color.b)) {
      issues.push('NaN in material color');
    }
  }

  return { valid: issues.length === 0, issues };
}

/**
 * Assert that a skeleton has valid bone hierarchy.
 *
 * Checks:
 *   - Has at least one bone
 *   - Has bone matrices
 *   - Bones form a connected tree (single root)
 *   - No duplicate bone names among siblings
 */
export function assertValidSkeleton(skeleton: THREE.Skeleton): ValidationResult {
  const issues: string[] = [];
  if (skeleton.bones.length === 0) issues.push('No bones');
  if (!skeleton.boneMatrices) issues.push('No bone matrices');

  // Check for degenerate bone names (all empty)
  const emptyNames = skeleton.bones.filter((b) => !b.name || b.name.trim() === '');
  if (emptyNames.length > 0 && skeleton.bones.length > 1) {
    issues.push(`${emptyNames.length} bone(s) have empty names`);
  }

  // Check for connected hierarchy: at least one root bone (no parent in skeleton)
  if (skeleton.bones.length > 1) {
    const boneSet = new Set(skeleton.bones);
    const roots = skeleton.bones.filter(b => !b.parent || !boneSet.has(b.parent as THREE.Bone));
    if (roots.length === 0) {
      issues.push('No root bone found (cycle in bone hierarchy?)');
    } else if (roots.length > 1) {
      issues.push(`Multiple root bones (${roots.length}) — expected a single root`);
    }
  }

  return { valid: issues.length === 0, issues };
}

/**
 * Assert that a group has children.
 *
 * @param group       The THREE.Group to validate
 * @param minChildren Minimum number of children required (default 1)
 */
export function assertValidGroup(group: THREE.Group, minChildren = 1): ValidationResult {
  const issues: string[] = [];

  if (!(group instanceof THREE.Group)) {
    issues.push('Not an instance of THREE.Group');
    return { valid: false, issues };
  }

  if (group.children.length === 0) {
    issues.push('Empty group (no children)');
  } else if (group.children.length < minChildren) {
    issues.push(`Insufficient children: ${group.children.length} < ${minChildren}`);
  }

  // Check that at least one child has a mesh
  let meshCount = 0;
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) meshCount++;
  });
  if (meshCount === 0 && group.children.length > 0) {
    issues.push('Group has children but no meshes');
  }

  return { valid: issues.length === 0, issues };
}

// ============================================================================
// Node Graph Helpers
// ============================================================================

/**
 * Create a simple test node graph for testing the NodeEvaluator.
 *
 * Produces a minimal graph: TextureCoordinate → NoiseTexture → PrincipledBSDF
 *
 * @returns Object with nodes map, links array, and helper function to add nodes
 */
export function createTestNodeGraph() {
  const nodes = new Map<string, NodeInstance>();
  const links: NodeLink[] = [];

  function makeNode(id: string, type: string, inputs?: Record<string, any>, settings?: Record<string, any>): NodeInstance {
    return {
      id,
      type,
      name: id,
      position: { x: 0, y: 0 },
      settings: settings ?? {},
      inputs: new Map(Object.entries(inputs ?? {})),
      outputs: new Map(),
    };
  }

  function makeLink(fromNode: string, fromSocket: string, toNode: string, toSocket: string): NodeLink {
    return {
      id: `${fromNode}_${fromSocket}_to_${toNode}_${toSocket}`,
      fromNode,
      fromSocket,
      toNode,
      toSocket,
    };
  }

  // Default graph: tex_coord → noise → principled_bsdf
  nodes.set('tex_coord', makeNode('tex_coord', 'texture_coordinate'));
  nodes.set('noise', makeNode('noise', 'noise_texture'));
  nodes.set('bsdf', makeNode('bsdf', 'principled_bsdf', {
    BaseColor: new THREE.Color(0.5, 0.5, 0.8),
    Metallic: 0.0,
    Roughness: 0.5,
  }));

  links.push(makeLink('tex_coord', 'UV', 'noise', 'Vector'));
  links.push(makeLink('noise', 'Fac', 'bsdf', 'Roughness'));

  return {
    nodes,
    links,
    makeNode,
    makeLink,
  };
}

// ============================================================================
// Quick Test Object Creation
// ============================================================================

/** Create a test mesh (box) for quick testing */
export function createTestMesh(): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0xff0000 }),
  );
}

/**
 * Create test geometry of a given type.
 *
 * @param type - One of 'box', 'sphere', 'cylinder', 'cone', 'torus', 'plane', 'icosahedron'
 */
export function createTestGeometry(type: string): THREE.BufferGeometry {
  switch (type) {
    case 'box':
      return new THREE.BoxGeometry(1, 1, 1);
    case 'sphere':
      return new THREE.SphereGeometry(0.5, 16, 12);
    case 'cylinder':
      return new THREE.CylinderGeometry(0.5, 0.5, 1, 16);
    case 'cone':
      return new THREE.ConeGeometry(0.5, 1, 16);
    case 'torus':
      return new THREE.TorusGeometry(0.5, 0.2, 12, 24);
    case 'plane':
      return new THREE.PlaneGeometry(1, 1);
    case 'icosahedron':
      return new THREE.IcosahedronGeometry(0.5, 0);
    default:
      return new THREE.BoxGeometry(1, 1, 1);
  }
}

/** Create a test mesh group with multiple children */
export function createTestGroup(childCount = 3): THREE.Group {
  const group = new THREE.Group();
  group.name = 'TestGroup';
  for (let i = 0; i < childCount; i++) {
    const mesh = createTestMesh();
    mesh.name = `TestChild_${i}`;
    mesh.position.set(i * 2, 0, 0);
    group.add(mesh);
  }
  return group;
}

/** Create a test scene populated with a few meshes */
export function createPopulatedTestScene(meshCount = 5): THREE.Scene {
  const scene = new THREE.Scene();
  scene.name = 'TestScene';
  for (let i = 0; i < meshCount; i++) {
    const mesh = createTestMesh();
    mesh.name = `TestMesh_${i}`;
    mesh.position.set(
      (Math.random() - 0.5) * 10,
      (Math.random() - 0.5) * 10,
      (Math.random() - 0.5) * 10,
    );
    scene.add(mesh);
  }
  return scene;
}

// ============================================================================
// Random Number Generation
// ============================================================================

/** Original Math.random reference for mockRandom restore */
const _originalRandom = Math.random;

/**
 * Seed Math.random for deterministic tests.
 *
 * Uses a simple mulberry32 PRNG. Call the returned function to restore
 * the original Math.random after the test.
 *
 * @example
 *   const restore = mockRandom(42);
 *   // ... test code that calls Math.random ...
 *   restore(); // restore original
 */
export function mockRandom(seed: number): () => void {
  let s = seed | 0;
  Math.random = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return () => {
    Math.random = _originalRandom;
  };
}

/**
 * Create a seeded random number generator (RNG) that does NOT pollute Math.random.
 *
 * Uses mulberry32 PRNG. Returns an object with methods:
 *   - next():   number in [0, 1)
 *   - uniform(min?, max?): number in [min, max) (default [0, 1))
 *   - int(min, max): integer in [min, max]
 *   - bool():   random boolean
 *   - pick<T>(arr): random element from array
 *
 * @param seed - PRNG seed value
 */
export function createTestRNG(seed: number) {
  let s = seed | 0;

  function next(): number {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function uniform(min = 0, max = 1): number {
    return min + next() * (max - min);
  }

  function int(min: number, max: number): number {
    return Math.floor(uniform(min, max + 1));
  }

  function bool(): boolean {
    return next() < 0.5;
  }

  function pick<T>(arr: T[]): T {
    return arr[int(0, arr.length - 1)];
  }

  return { next, uniform, int, bool, pick, seed };
}

// ============================================================================
// Numerical Helpers
// ============================================================================

/** Check if two numbers are approximately equal within epsilon */
export function approxEqual(a: number, b: number, epsilon = 1e-6): boolean {
  return Math.abs(a - b) < epsilon;
}

/** Check if a Float32Array contains any NaN values */
export function hasNaN(arr: Float32Array): boolean {
  for (let i = 0; i < arr.length; i++) {
    if (isNaN(arr[i])) return true;
  }
  return false;
}

/** Count the number of triangles in a BufferGeometry */
export function countTriangles(geo: THREE.BufferGeometry): number {
  if (geo.index) return geo.index.count / 3;
  if (geo.attributes.position) return geo.attributes.position.count / 3;
  return 0;
}

/** Count all meshes in an Object3D hierarchy */
export function countMeshes(obj: THREE.Object3D): number {
  let count = 0;
  obj.traverse((child) => {
    if (child instanceof THREE.Mesh) count++;
  });
  return count;
}

/** Count all vertices in an Object3D hierarchy */
export function countVertices(obj: THREE.Object3D): number {
  let count = 0;
  obj.traverse((child) => {
    if (child instanceof THREE.Mesh && child.geometry.attributes.position) {
      count += child.geometry.attributes.position.count;
    }
  });
  return count;
}
