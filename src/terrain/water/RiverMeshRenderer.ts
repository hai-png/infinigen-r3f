/**
 * RiverMeshRenderer - Generates visible river mesh from RiverNetwork flow data
 *
 * Converts river path data into a renderable 3D mesh with:
 * - Ribbon/tube geometry following the river path
 * - Width varies based on flow accumulation (wider downstream)
 * - Flow animation via UV scrolling
 * - Depth-based color (shallow lighter, deep darker)
 * - Foam at bends and rapids (based on slope)
 * - Conforms to terrain height
 *
 * Uses THREE.MeshPhysicalMaterial for realistic water rendering.
 */

import * as THREE from 'three';
import { RiverPoint } from './RiverNetwork';
import { NoiseUtils } from '@/core/util/math/noise';
import { createCanvas } from '@/assets/utils/CanvasUtils';

// ============================================================================
// Configuration
// ============================================================================

export interface RiverMeshConfig {
  /** Base width multiplier for rivers (default 1.0) */
  widthScale: number;
  /** Depth multiplier (default 1.0) */
  depthScale: number;
  /** Minimum river width in world units (default 0.5) */
  minWidth: number;
  /** Maximum river width in world units (default 12.0) */
  maxWidth: number;
  /** UV scroll speed for flow animation (default 0.3) */
  flowSpeed: number;
  /** Number of cross-section segments for the ribbon (default 4) */
  crossSegments: number;
  /** Subdivision steps between river points (default 3) */
  subdivisionSteps: number;
  /** Deep water color (default dark teal) */
  deepColor: THREE.Color;
  /** Shallow water color (default light turquoise) */
  shallowColor: THREE.Color;
  /** Foam color (default white) */
  foamColor: THREE.Color;
  /** Slope threshold for foam generation (default 0.4) */
  foamSlopeThreshold: number;
  /** Normal map resolution (default 256) */
  normalMapResolution: number;
}

// ============================================================================
// RiverMeshRenderer
// ============================================================================

export class RiverMeshRenderer {
  private config: RiverMeshConfig;
  private noise: NoiseUtils;
  private time: number = 0;
  private mesh: THREE.Mesh | null = null;
  private material: THREE.MeshPhysicalMaterial | null = null;
  private flowNormalMap: THREE.CanvasTexture | null = null;

  constructor(config: Partial<RiverMeshConfig> = {}) {
    this.config = {
      widthScale: 1.0,
      depthScale: 1.0,
      minWidth: 0.5,
      maxWidth: 12.0,
      flowSpeed: 0.3,
      crossSegments: 4,
      subdivisionSteps: 3,
      deepColor: new THREE.Color(0x0a3d5c),
      shallowColor: new THREE.Color(0x40c0b0),
      foamColor: new THREE.Color(0xffffff),
      foamSlopeThreshold: 0.4,
      normalMapResolution: 256,
      ...config,
    };
    this.noise = new NoiseUtils(42);
  }

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------

  /**
   * Build a Three.js mesh from an array of river paths.
   * Each path is an array of RiverPoints from RiverNetwork.extractRiverPaths().
   */
  buildMesh(rivers: RiverPoint[][]): THREE.Mesh {
    // Generate flow normal map
    this.flowNormalMap = this.createFlowNormalMap();

    // Build combined geometry from all river paths
    const geometry = this.buildRiverGeometry(rivers);

    // Create material
    this.material = this.createRiverMaterial();

    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.renderOrder = 998;
    this.mesh.frustumCulled = false;

    return this.mesh;
  }

  /**
   * Advance the flow animation. Call from useFrame.
   */
  update(dt: number): void {
    this.time += dt;
    if (this.material) {
      if ('uniforms' in this.material) {
        const uniforms = (this.material as unknown as THREE.ShaderMaterial).uniforms;
        if (uniforms?.uTime) {
          uniforms.uTime.value = this.time;
        }
      }
    }
  }

  /**
   * Get the current mesh
   */
  getMesh(): THREE.Mesh | null {
    return this.mesh;
  }

  /**
   * Dispose all GPU resources
   */
  dispose(): void {
    if (this.mesh) {
      this.mesh.geometry.dispose();
    }
    if (this.material) {
      this.material.dispose();
    }
    if (this.flowNormalMap) {
      this.flowNormalMap.dispose();
    }
  }

  // ------------------------------------------------------------------
  // Geometry Construction
  // ------------------------------------------------------------------

  /**
   * Build ribbon geometry for all river paths
   */
  private buildRiverGeometry(rivers: RiverPoint[][]): THREE.BufferGeometry {
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    let vertexOffset = 0;

    for (const river of rivers) {
      if (river.length < 2) continue;

      // Subdivide path for smoother curves
      const subdivided = this.subdividePath(river);

      // Compute cumulative distance for UV mapping
      const distances: number[] = [0];
      for (let i = 1; i < subdivided.length; i++) {
        const dx = subdivided[i].position.x - subdivided[i - 1].position.x;
        const dz = subdivided[i].position.z - subdivided[i - 1].position.z;
        distances.push(distances[i - 1] + Math.sqrt(dx * dx + dz * dz));
      }
      const totalLength = distances[distances.length - 1] || 1;

      for (let i = 0; i < subdivided.length; i++) {
        const point = subdivided[i];
        const width = Math.max(
          this.config.minWidth,
          Math.min(this.config.maxWidth, point.width * this.config.widthScale)
        );
        const halfWidth = width / 2;

        // Compute forward direction for this point
        let forward: THREE.Vector3;
        if (i === 0) {
          forward = new THREE.Vector3().subVectors(
            subdivided[1].position,
            subdivided[0].position
          );
        } else if (i === subdivided.length - 1) {
          forward = new THREE.Vector3().subVectors(
            subdivided[i].position,
            subdivided[i - 1].position
          );
        } else {
          forward = new THREE.Vector3().subVectors(
            subdivided[i + 1].position,
            subdivided[i - 1].position
          );
        }
        forward.y = 0;
        forward.normalize();

        // Right vector (perpendicular to forward on XZ plane)
        const right = new THREE.Vector3(-forward.z, 0, forward.x);

        // Compute slope for foam
        let slope = 0;
        if (i > 0) {
          const dy = point.position.y - subdivided[i - 1].position.y;
          const dx = point.position.x - subdivided[i - 1].position.x;
          const dz = point.position.z - subdivided[i - 1].position.z;
          const horizDist = Math.sqrt(dx * dx + dz * dz);
          if (horizDist > 0.001) {
            slope = Math.abs(dy) / horizDist;
          }
        }

        // Depth-based color
        const depth = point.depth * this.config.depthScale;
        const depthFactor = Math.min(depth / 5.0, 1.0);
        const shallowR = this.config.shallowColor.r;
        const shallowG = this.config.shallowColor.g;
        const shallowB = this.config.shallowColor.b;
        const deepR = this.config.deepColor.r;
        const deepG = this.config.deepColor.g;
        const deepB = this.config.deepColor.b;

        // Foam factor
        const foamFactor = slope > this.config.foamSlopeThreshold
          ? Math.min((slope - this.config.foamSlopeThreshold) * 3.0, 1.0)
          : 0;

        // Generate cross-section vertices
        const segs = this.config.crossSegments;
        for (let j = 0; j <= segs; j++) {
          const t = j / segs; // 0 to 1 across the width
          const lateralOffset = (t - 0.5) * width;

          // Parabolic depth profile across the cross-section
          const depthProfile = 1.0 - Math.pow(2.0 * t - 1.0, 2);
          const yOffset = -depth * depthProfile * 0.3; // Slight depression for river bed

          const vx = point.position.x + right.x * lateralOffset;
          const vy = point.position.y + yOffset;
          const vz = point.position.z + right.z * lateralOffset;

          positions.push(vx, vy, vz);
          normals.push(0, 1, 0);

          // UV: u = along river, v = across river
          const u = distances[i] / totalLength;
          const v = t;
          uvs.push(u, v);

          // Vertex color: blend between shallow/deep based on depth, add foam
          const r = shallowR + (deepR - shallowR) * depthFactor + foamFactor * this.config.foamColor.r * 0.3;
          const g = shallowG + (deepG - shallowG) * depthFactor + foamFactor * this.config.foamColor.g * 0.3;
          const b = shallowB + (deepB - shallowB) * depthFactor + foamFactor * this.config.foamColor.b * 0.3;
          colors.push(r, g, b);
        }

        // Create triangles between this ring and the previous ring
        if (i > 0) {
          for (let j = 0; j < segs; j++) {
            const curr = vertexOffset + j;
            const currNext = vertexOffset + j + 1;
            const prev = vertexOffset - (segs + 1) + j;
            const prevNext = vertexOffset - (segs + 1) + j + 1;

            indices.push(prev, curr, currNext);
            indices.push(prev, currNext, prevNext);
          }
        }

        vertexOffset += segs + 1;
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    return geometry;
  }

  /**
   * Subdivide river path for smoother curves
   */
  private subdividePath(points: RiverPoint[]): RiverPoint[] {
    if (points.length < 2) return points;

    const result: RiverPoint[] = [points[0]];
    const steps = this.config.subdivisionSteps;

    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(points.length - 1, i + 2)];

      for (let s = 1; s <= steps; s++) {
        const t = s / steps;

        // Catmull-Rom interpolation
        const pos = this.catmullRom(
          p0.position, p1.position, p2.position, p3.position, t
        );

        // Interpolate width and depth
        const width = p1.width + (p2.width - p1.width) * t;
        const depth = p1.depth + (p2.depth - p1.depth) * t;
        const flowRate = p1.flowRate + (p2.flowRate - p1.flowRate) * t;

        result.push({
          position: pos,
          width,
          depth,
          flowRate,
        });
      }
    }

    return result;
  }

  /**
   * Catmull-Rom spline interpolation
   */
  private catmullRom(
    p0: THREE.Vector3,
    p1: THREE.Vector3,
    p2: THREE.Vector3,
    p3: THREE.Vector3,
    t: number
  ): THREE.Vector3 {
    const t2 = t * t;
    const t3 = t2 * t;

    const x = 0.5 * (
      (2 * p1.x) +
      (-p0.x + p2.x) * t +
      (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
      (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3
    );
    const y = 0.5 * (
      (2 * p1.y) +
      (-p0.y + p2.y) * t +
      (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
      (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3
    );
    const z = 0.5 * (
      (2 * p1.z) +
      (-p0.z + p2.z) * t +
      (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 +
      (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3
    );

    return new THREE.Vector3(x, y, z);
  }

  // ------------------------------------------------------------------
  // Material
  // ------------------------------------------------------------------

  /**
   * Create river water material with flow animation
   */
  private createRiverMaterial(): THREE.MeshPhysicalMaterial {
    const material = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0x1a6b7a),
      transparent: true,
      opacity: 0.85,
      roughness: 0.15,
      metalness: 0.05,
      transmission: 0.6,
      thickness: 0.5,
      ior: 1.33,
      clearcoat: 0.8,
      clearcoatRoughness: 0.1,
      envMapIntensity: 1.5,
      vertexColors: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    if (this.flowNormalMap) {
      material.normalMap = this.flowNormalMap;
      material.normalScale = new THREE.Vector2(0.3, 0.3);
    }

    return material;
  }

  /**
   * Create a flow normal map texture for river surface animation
   */
  private createFlowNormalMap(): THREE.CanvasTexture | null {
    try {
      const canvas = createCanvas();
      const res = this.config.normalMapResolution;
      canvas.width = res;
      canvas.height = res;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      // Generate flowing water normal map pattern
      const imageData = ctx.createImageData(res, res);
      const data = imageData.data;

      for (let y = 0; y < res; y++) {
        for (let x = 0; x < res; x++) {
          const idx = (y * res + x) * 4;

          // Flowing ripple pattern oriented in one direction
          const nx = this.noise.perlin2D(x * 0.05, y * 0.02) * 0.5 + 0.5;
          const ny = this.noise.perlin2D(x * 0.02 + 50, y * 0.05) * 0.5 + 0.5;

          // Encode as normal map (0.5 = flat)
          data[idx] = Math.floor(nx * 255);
          data[idx + 1] = Math.floor(ny * 255);
          data[idx + 2] = 255; // Z always pointing up
          data[idx + 3] = 255;
        }
      }

      ctx.putImageData(imageData, 0, 0);

      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(4, 4);

      return texture;
    } catch (err) {
      // createCanvas may fail during SSR; return null gracefully
      if (process.env.NODE_ENV === 'development') console.debug('[RiverMeshRenderer] caustic texture creation fallback:', err);
      return null;
    }
  }

  // ------------------------------------------------------------------
  // Configuration
  // ------------------------------------------------------------------

  updateConfig(partial: Partial<RiverMeshConfig>): void {
    Object.assign(this.config, partial);
  }

  getConfig(): RiverMeshConfig {
    return { ...this.config };
  }
}
