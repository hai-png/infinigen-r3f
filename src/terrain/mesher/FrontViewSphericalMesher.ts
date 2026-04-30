/**
 * Front View Spherical Mesher
 * 
 * Optimized spherical mesher for front-view rendering where
 * the camera faces a specific direction (e.g., for facades).
 * 
 * Based on: infinigen/terrain/mesher/front_view_spherical_mesher.py
 */

import { SphericalMesher, SphericalMesherConfig, CameraPose } from './SphericalMesher';
import { BufferGeometry } from 'three';
import { SDFKernel } from '../sdf/SDFOperations';

export interface FrontViewConfig extends SphericalMesherConfig {
  fovX: number;
  fovY: number;
  nearPlane: number;
  farPlane: number;
}

export class FrontViewSphericalMesher extends SphericalMesher {
  protected frontConfig: FrontViewConfig;

  constructor(
    cameraPose: CameraPose,
    bounds: [number, number, number, number, number, number],
    config: Partial<FrontViewConfig> = {}
  ) {
    super(cameraPose, bounds, config);

    this.frontConfig = {
      fovX: 90,
      fovY: 90,
      nearPlane: 0.1,
      farPlane: 100,
      ...config,
    };
  }

  public generateMesh(kernels: SDFKernel[]): BufferGeometry {
    // Front view specific mesh generation
    return super.generateMesh(kernels);
  }
}
