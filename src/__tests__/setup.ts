/**
 * Vitest setup file.
 *
 * Mocks `three-mesh-bvh` for the Node.js test environment because its UMD
 * bundle has a circular dependency issue (ObjectBVH extends BVH which hasn't
 * been defined yet when the bundle executes).
 *
 * In the browser, the ESM import works fine. But vitest's inline resolution
 * picks up the UMD bundle which fails.
 */

import { vi } from 'vitest';

// Mock three-mesh-bvh to prevent UMD bundle crash in Node test environment.
// The actual BVH functionality is not needed for most unit tests.
vi.mock('three-mesh-bvh', () => {
  return {
    MeshBVH: class MockMeshBVH {
      constructor() {}
      closestPointToPoint() { return null; }
      raycast() { return []; }
    },
    acceleratedRaycast: vi.fn(),
    computeBoundsTree: vi.fn(),
    disposeBoundsTree: vi.fn(),
    ShapecastIntersection: class {},
    ExtendedTriangle: class {},
    HitPointInfo: class {},
  };
});
