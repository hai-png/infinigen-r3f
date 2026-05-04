/**
 * testUtilities.ts — Foundational test helpers for Infinigen-R3F
 *
 * Provides reusable utilities for writing unit and integration tests:
 *   - Scene/camera/renderer setup
 *   - Terrain heightmap creation
 *   - Geometry, material, and skeleton validation
 *   - Quick test mesh generation
 *
 * Usage:
 *   import { createTestScene, assertValidMesh } from '@/__tests__/utils/testUtilities';
 */

import * as THREE from 'three';

// ============================================================================
// Scene Setup
// ============================================================================

/** Create a minimal test scene with a renderer, scene, and camera */
export function createTestScene() {
  const scene = new THREE.Scene();
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
export function createTestTerrain(width = 64, height = 64): Float32Array {
  const data = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      data[y * width + x] = Math.sin(x * 0.1) * Math.cos(y * 0.1) * 5;
    }
  }
  return data;
}

// ============================================================================
// Camera Helpers
// ============================================================================

/** Create a test camera at a standard position */
export function createTestCamera(): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.1, 1000);
  camera.position.set(0, 10, 20);
  camera.lookAt(0, 0, 0);
  return camera;
}

// ============================================================================
// Validation Helpers
// ============================================================================

/** Assert that a mesh has valid geometry (non-empty, no NaN) */
export function assertValidMesh(mesh: THREE.Mesh | THREE.Group): { valid: boolean; issues: string[] } {
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
      // Check for NaN
      for (let i = 0; i < Math.min(pos.count, 100); i++) {
        if (isNaN(pos.getX(i)) || isNaN(pos.getY(i)) || isNaN(pos.getZ(i))) {
          issues.push(`NaN in position at vertex ${i}`);
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
        const childResult = assertValidMesh(child);
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

/** Assert that a material has valid configuration */
export function assertValidMaterial(material: THREE.Material): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  if (material instanceof THREE.MeshStandardMaterial) {
    if (!material.color) issues.push('No color set');
    if (material.roughness < 0 || material.roughness > 1) issues.push('Roughness out of [0,1] range');
    if (material.metalness < 0 || material.metalness > 1) issues.push('Metalness out of [0,1] range');
  }
  if (material instanceof THREE.MeshPhysicalMaterial) {
    // Good - most capable material type
  }
  if (material.type === 'MeshBasicMaterial') {
    issues.push('Using MeshBasicMaterial — consider MeshStandardMaterial for PBR');
  }

  return { valid: issues.length === 0, issues };
}

/** Assert that a skeleton has valid bone hierarchy */
export function assertValidSkeleton(skeleton: THREE.Skeleton): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  if (skeleton.bones.length === 0) issues.push('No bones');
  if (!skeleton.boneMatrices) issues.push('No bone matrices');

  // Check for degenerate bone names (all empty)
  const emptyNames = skeleton.bones.filter((b) => !b.name || b.name.trim() === '');
  if (emptyNames.length > 0 && skeleton.bones.length > 1) {
    issues.push(`${emptyNames.length} bone(s) have empty names`);
  }

  return { valid: issues.length === 0, issues };
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
