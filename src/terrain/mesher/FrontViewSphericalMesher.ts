/**
 * Infinigen R3F Port - Enhanced Mesher Systems
 * Front View Spherical Mesher for Horizon-Focused Rendering
 *
 * Based on original: infinigen/terrain/mesher/front_view_spherical_mesher.py
 * Optimized for scenarios where camera views primarily horizontal terrain
 */

import { Vector3, Matrix4, BufferGeometry, Float32BufferAttribute, Box3 } from 'three';
import { SphericalMesher, SphericalMesherConfig, CameraPose } from './SphericalMesher';
import { SDFKernel } from '../sdf/SDFOperations';

export interface FrontViewConfig extends SphericalMesherConfig {
  horizonBias: number;
  verticalCompression: number;
  foregroundDetail: number;
  backgroundDetail: number;
}

export class FrontViewSphericalMesher extends SphericalMesher {
  protected frontViewConfig: FrontViewConfig;

  constructor(
    cameraPose: CameraPose,
    bounds: [number, number, number, number, number, number],
    config: Partial<FrontViewConfig> = {}
  ) {
    super(cameraPose, bounds, config);

    this.frontViewConfig = {
      horizonBias: 0.3,
      verticalCompression: 0.6,
      foregroundDetail: 2.0,
      backgroundDetail: 0.5,
      ...config,
    };
  }

  /**
   * Generate mesh with front-view optimized resolution distribution
   * Higher detail in foreground and horizon, lower detail at zenith/nadir
   */
  public generateMesh(kernels: SDFKernel[]): BufferGeometry {
    const vertices: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    const { rMin, rMax, base90dResolution } = this.config;
    const { horizonBias, verticalCompression, foregroundDetail, backgroundDetail } = this.frontViewConfig;

    // Calculate adaptive resolution based on camera view direction
    const viewDirection = new Vector3(0, 0, -1).applyMatrix4(this.cameraPose.rotation);
    const horizonAngle = Math.asin(viewDirection.y);

    // Generate spherical coordinates with non-uniform sampling
    const phiSteps = base90dResolution;
    const thetaSteps = Math.floor(base90dResolution * 2);

    const vertexMap = new Map<string, number>();
    let vertexIndex = 0;

    for (let phiIdx = 0; phiIdx <= phiSteps; phiIdx++) {
      // Non-uniform phi distribution: concentrate samples near horizon
      const phiNormalized = phiIdx / phiSteps;
      const phi = this.distributePhi(phiNormalized, horizonAngle, horizonBias, verticalCompression);

      const sinPhi = Math.sin(phi);
      const cosPhi = Math.cos(phi);

      for (let thetaIdx = 0; thetaIdx <= thetaSteps; thetaIdx++) {
        const theta = (thetaIdx / thetaSteps) * Math.PI * 2;

        const sinTheta = Math.sin(theta);
        const cosTheta = Math.cos(theta);

        // Calculate distance from camera to surface along this ray
        const direction = new Vector3(
          sinPhi * cosTheta,
          cosPhi,
          sinPhi * sinTheta
        ).applyMatrix4(this.cameraPose.rotation);

        // Apply detail modulation based on distance and position
        const detailFactor = this.calculateDetailFactor(direction, foregroundDetail, backgroundDetail);
        const raySteps = Math.floor(this.config.testDownscale * detailFactor);

        // Ray march to find surface
        let distance = this.rayMarchSurface(kernels, direction, rMin, rMax, raySteps);

        // Calculate vertex position
        const position = this.cameraPose.position.clone().add(
          direction.multiplyScalar(distance)
        );

        // Store vertex
        const key = `${phiIdx}_${thetaIdx}`;
        vertexMap.set(key, vertexIndex);

        vertices.push(position.x, position.y, position.z);

        // Calculate normal using finite differences
        const normal = this.calculateNormal(kernels, position, direction);
        normals.push(normal.x, normal.y, normal.z);

        // Generate UV coordinates
        const u = thetaIdx / thetaSteps;
        const v = phiIdx / phiSteps;
        uvs.push(u, v);

        vertexIndex++;
      }
    }

    // Generate indices for triangle mesh
    for (let phiIdx = 0; phiIdx < phiSteps; phiIdx++) {
      for (let thetaIdx = 0; thetaIdx < thetaSteps; thetaIdx++) {
        const current = phiIdx * (thetaSteps + 1) + thetaIdx;
        const next = current + 1;
        const below = (phiIdx + 1) * (thetaSteps + 1) + thetaIdx;
        const belowNext = below + 1;

        // First triangle
        indices.push(current, below, next);

        // Second triangle (handle seam)
        if (thetaIdx < thetaSteps - 1) {
          indices.push(next, below, belowNext);
        } else {
          // Wrap around at seam
          const seamNext = (phiIdx + 1) * (thetaSteps + 1);
          indices.push(next, below, seamNext);
        }
      }
    }

    // Create geometry
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);

    return geometry;
  }

  /**
   * Distribute phi angles to concentrate samples near horizon
   */
  protected distributePhi(
    t: number,
    horizonAngle: number,
    horizonBias: number,
    compression: number
  ): number {
    // Use biased distribution to concentrate samples near horizon
    const biasFunc = (x: number) => {
      const biased = x * (1 + horizonBias * Math.sin(Math.PI * x));
      return Math.max(0, Math.min(1, biased));
    };

    const biasedT = biasFunc(t);

    // Compress vertical range
    const compressedT = 0.5 + (biasedT - 0.5) * compression;

    // Map to phi range (slightly beyond hemisphere for safety)
    const phiMin = 0.1;
    const phiMax = Math.PI - 0.1;
    return phiMin + compressedT * (phiMax - phiMin);
  }

  /**
   * Calculate detail factor based on ray direction and distance
   */
  protected calculateDetailFactor(
    direction: Vector3,
    foregroundDetail: number,
    backgroundDetail: number
  ): number {
    // Calculate distance weighting
    const viewDir = new Vector3(0, 0, -1).applyMatrix4(this.cameraPose.rotation);
    const dotProduct = direction.dot(viewDir);

    // Interpolate between foreground and background detail
    const t = Math.max(0, Math.min(1, (dotProduct + 1) / 2));
    return foregroundDetail + t * (backgroundDetail - foregroundDetail);
  }

  /**
   * Override parent ray marching with front-view optimizations
   */
  protected rayMarchSurface(
    kernels: SDFKernel[],
    direction: Vector3,
    minDist: number,
    maxDist: number,
    steps: number
  ): number {
    const stepSize = (maxDist - minDist) / steps;
    let distance = minDist;

    const origin = this.cameraPose.position;
    const tempPos = new Vector3();

    for (let i = 0; i < steps; i++) {
      tempPos.copy(origin).add(direction.clone().multiplyScalar(distance));

      // Evaluate SDF
      let sdfValue = Infinity;
      for (const kernel of kernels) {
        const value = kernel.evaluate(tempPos);
        sdfValue = Math.min(sdfValue, value);
      }

      // Check for surface intersection
      if (sdfValue < stepSize * 0.5) {
        return distance;
      }

      // Advance along ray
      distance += Math.max(stepSize * 0.1, sdfValue);

      if (distance > maxDist) {
        break;
      }
    }

    return maxDist;
  }
}
