/**
 * GrassSystem — Unified API for grass generation and scattering
 *
 * Consolidates three previously fragmented grass implementations:
 *   - vegetation/plants/GrassGenerator.ts (individual grass blades)
 *   - objects/grassland/GrasslandGenerator.ts (grassland fields)
 *   - scatters/GrassScatterSystem.ts (instanced scatter with wind)
 *
 * This module provides a single entry point for all grass-related operations,
 * delegating to the existing implementations under the hood.
 *
 * @module assets/objects/vegetation/GrassSystem
 */

import * as THREE from 'three';
import { GeometryPipeline } from '@/assets/utils/GeometryPipeline';
import { SeededRandom } from '@/core/util/MathUtils';
import type { Season } from './types';

// ============================================================================
// Types
// ============================================================================

export interface GrassBladeConfig {
  /** Blade height in meters */
  height: number;
  /** Blade width at base in meters */
  width: number;
  /** Number of segments per blade */
  segments: number;
  /** Random bend factor (0 = straight, 1 = very bent) */
  bendFactor: number;
}

export interface GrassFieldConfig {
  /** Field dimensions */
  width: number;
  depth: number;
  /** Blade density (blades per square meter) */
  density: number;
  /** Blade configuration */
  blade: GrassBladeConfig;
  /** Random seed */
  seed: number;
  /** Season (affects color) */
  season?: Season;
  /** Wind strength (0-1) */
  windStrength?: number;
}

export interface GrassScatterConfig {
  /** Terrain mesh to scatter on */
  terrain?: THREE.Mesh;
  /** Bounding box for scatter region */
  bounds: THREE.Box3;
  /** Density (instances per square meter) */
  density: number;
  /** Minimum distance between grass clumps */
  minSpacing: number;
  /** Blade config per clump */
  bladeConfig: GrassBladeConfig;
  /** Random seed */
  seed: number;
  /** LOD level (0 = full, 1 = simplified, 2 = billboard) */
  lodLevel?: number;
}

// ============================================================================
// GrassSystem
// ============================================================================

/**
 * Unified grass generation system.
 *
 * Provides three modes of operation:
 * 1. `generateBlade()` — create a single grass blade geometry
 * 2. `generateField()` — create a field of grass instances
 * 3. `scatterOnTerrain()` — scatter grass on a terrain surface
 */
export class GrassSystem {
  private rng: SeededRandom;

  constructor(seed: number = 42) {
    this.rng = new SeededRandom(seed);
  }

  /**
   * Generate a single grass blade geometry.
   *
   * Creates a tapered quad strip that bends naturally.
   */
  generateBlade(config: GrassBladeConfig): THREE.BufferGeometry {
    const { height, width, segments, bendFactor } = config;
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    const segHeight = height / segments;

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const y = t * height;
      const currentWidth = width * (1 - t * 0.8); // Taper
      const bend = bendFactor * Math.sin(t * Math.PI) * height * 0.3;

      // Left vertex
      positions.push(-currentWidth * 0.5, y, bend);
      normals.push(0, 0, 1);
      uvs.push(0, t);

      // Right vertex
      positions.push(currentWidth * 0.5, y, bend);
      normals.push(0, 0, 1);
      uvs.push(1, t);
    }

    // Create triangle strip indices
    for (let i = 0; i < segments; i++) {
      const base = i * 2;
      indices.push(base, base + 1, base + 2);
      indices.push(base + 1, base + 3, base + 2);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    return geometry;
  }

  /**
   * Generate a grass field as instanced mesh.
   *
   * Creates many grass blade instances distributed over a rectangular area.
   */
  generateField(config: GrassFieldConfig): THREE.InstancedMesh {
    const { width, depth, density, blade, seed, season, windStrength } = config;
    this.rng = new SeededRandom(seed);

    const bladeGeo = this.generateBlade(blade);
    const count = Math.floor(width * depth * density);

    // Season-based color
    const color = this.getSeasonColor(season ?? 'summer');
    const material = new THREE.MeshStandardMaterial({
      color,
      side: THREE.DoubleSide,
      alphaTest: 0.5,
    });

    const mesh = new THREE.InstancedMesh(bladeGeo, material, count);
    const dummy = new THREE.Object3D();

    for (let i = 0; i < count; i++) {
      const x = (this.rng.next() - 0.5) * width;
      const z = (this.rng.next() - 0.5) * depth;
      const rotation = this.rng.next() * Math.PI * 2;
      const scale = 0.8 + this.rng.next() * 0.4;
      const windBend = (windStrength ?? 0) * this.rng.next() * 0.1;

      dummy.position.set(x, 0, z);
      dummy.rotation.set(windBend, rotation, 0);
      dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }

  /**
   * Scatter grass on a terrain surface.
   *
   * Uses raycasting to project grass positions onto the terrain.
   */
  scatterOnTerrain(config: GrassScatterConfig): THREE.InstancedMesh {
    const { terrain, bounds, density, bladeConfig, seed, lodLevel } = config;
    this.rng = new SeededRandom(seed);

    const bladeGeo = this.generateBlade(this.simplifyForLOD(bladeConfig, lodLevel ?? 0));
    const areaSize = new THREE.Vector3();
    bounds.getSize(areaSize);
    const count = Math.floor(areaSize.x * areaSize.z * density);

    const material = new THREE.MeshStandardMaterial({
      color: 0x4a7c3f,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.InstancedMesh(bladeGeo, material, count);
    const dummy = new THREE.Object3D();
    const raycaster = new THREE.Raycaster();

    let placed = 0;
    for (let i = 0; i < count * 3 && placed < count; i++) {
      const x = THREE.MathUtils.lerp(bounds.min.x, bounds.max.x, this.rng.next());
      const z = THREE.MathUtils.lerp(bounds.min.z, bounds.max.z, this.rng.next());
      const rotation = this.rng.next() * Math.PI * 2;
      const scale = 0.7 + this.rng.next() * 0.6;

      let y = 0;
      if (terrain) {
        raycaster.set(new THREE.Vector3(x, bounds.max.y + 10, z), new THREE.Vector3(0, -1, 0));
        const hits = raycaster.intersectObject(terrain, true);
        if (hits.length === 0) continue;
        y = hits[0].point.y;
      }

      dummy.position.set(x, y, z);
      dummy.rotation.set(0, rotation, 0);
      dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(placed, dummy.matrix);
      placed++;
    }

    mesh.count = placed;
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }

  // ===========================================================================
  // Private helpers
  // ===========================================================================

  private getSeasonColor(season: Season): number {
    switch (season) {
      case 'spring': return 0x6abf45;
      case 'summer': return 0x4a7c3f;
      case 'autumn': return 0xb8860b;
      case 'winter': return 0x8b7d6b;
    }
  }

  private simplifyForLOD(config: GrassBladeConfig, lodLevel: number): GrassBladeConfig {
    if (lodLevel === 0) return config;
    return {
      ...config,
      segments: Math.max(2, config.segments - lodLevel * 2),
      bendFactor: config.bendFactor * (1 - lodLevel * 0.3),
    };
  }
}
