/**
 * Nature Camera Subsystem — Handles camera setup and terrain validation.
 *
 * Extracted from NatureSceneComposer (Phase C decomposition).
 * Responsible for:
 *   - setupCamera() — validating camera position against terrain height
 *
 * @module composition/subsystems/NatureCameraSubsystem
 */

import type { CameraParams } from '../NatureSceneComposer';
import type { TerrainData } from '@/terrain/core/TerrainGenerator';

// ============================================================================
// NatureCameraSubsystem
// ============================================================================

/**
 * NatureCameraSubsystem — handles camera setup and pose validation.
 *
 * Extracted from NatureSceneComposer so the composer can remain a thin orchestrator.
 */
export class NatureCameraSubsystem {
  /**
   * Validate camera position against terrain.
   *
   * Ensures the camera isn't below terrain by checking the heightmap
   * at the camera's XZ position. If it is, the camera Y is pushed up.
   */
  setupCamera(cam: CameraParams, terrain: TerrainData | null): CameraParams {
    if (!terrain) return cam;

    const heightScale = 35;
    const worldSize = 200;
    const nx = Math.floor(((cam.position.x + worldSize / 2) / worldSize) * terrain.width);
    const ny = Math.floor(((cam.position.z + worldSize / 2) / worldSize) * terrain.height);
    const idx = ny * terrain.width + nx;
    const terrainH = (terrain.heightMap.data?.[idx] ?? 0) * heightScale;

    if (cam.position.y < terrainH + 5) {
      cam.position.y = terrainH + 15;
    }

    return cam;
  }
}
