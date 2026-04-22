/**
 * Infinigen R3F Port - Enhanced Mesher Systems
 * Spherical Mesher with Camera-Based Adaptive Resolution
 * 
 * Based on original: infinigen/terrain/mesher/spherical_mesher.py
 */

import { Vector3, Matrix4, BufferGeometry, Float32BufferAttribute, Box3, Sphere } from 'three';
import { TerrainData } from '../core/TerrainGenerator';
import { SDFKernel } from '../sdf/SDFOperations';

export interface SphericalMesherConfig {
  rMin: number;
  rMax: number;
  base90dResolution: number;
  pixelsPerCube: number;
  testDownscale: number;
  upscale1: number;
  upscale2: number;
  rLengthen: number;
  completeDepthTest: boolean;
  fovHorizontal: number;
  fovVertical: number;
  renderHeight: number;
  renderWidth: number;
}

export interface CameraPose {
  position: Vector3;
  rotation: Matrix4;
  fov: number;
  aspect: number;
}

export class SphericalMesher {
  protected config: SphericalMesherConfig;
  protected cameraPose: CameraPose;
  protected bounds: [number, number, number, number, number, number];
  
  constructor(
    cameraPose: CameraPose,
    bounds: [number, number, number, number, number, number],
    config: Partial<SphericalMesherConfig> = {}
  ) {
    this.cameraPose = cameraPose;
    this.bounds = bounds;
    
    // Calculate rMax from bounds and camera position
    const corners = [
      new Vector3(bounds[0], bounds[2], bounds[4]),
      new Vector3(bounds[0], bounds[2], bounds[5]),
      new Vector3(bounds[0], bounds[3], bounds[4]),
      new Vector3(bounds[0], bounds[3], bounds[5]),
      new Vector3(bounds[1], bounds[2], bounds[4]),
      new Vector3(bounds[1], bounds[2], bounds[5]),
      new Vector3(bounds[1], bounds[3], bounds[4]),
      new Vector3(bounds[1], bounds[3], bounds[5]),
    ];
    
    let maxDistance = 0;
    for (const corner of corners) {
      const distance = corner.distanceTo(cameraPose.position);
      maxDistance = Math.max(maxDistance, distance);
    }
    
    this.config = {
      rMin: 1,
      rMax: maxDistance * 1.1,
      base90dResolution: 0, // Will be calculated
      pixelsPerCube: 1.84,
      testDownscale: 5,
      upscale1: 2,
      upscale2: 4,
      rLengthen: 1,
      completeDepthTest: true,
      fovHorizontal: cameraPose.fov,
      fovVertical: cameraPose.fov / cameraPose.aspect,
      renderHeight: cameraPose.fov > 0 ? 1080 : 1080,
      renderWidth: cameraPose.fov > 0 ? 1920 : 1920,
      ...config,
    };
    
    // Calculate base resolution
    if (this.config.base90dResolution === 0) {
      const { pixelsPerCube, upscale1, upscale2, fovHorizontal, renderHeight } = this.config;
      this.config.base90dResolution = Math.floor(
        1 / (pixelsPerCube * upscale1 * upscale2 * fovHorizontal / Math.PI * 2 / renderHeight)
      );
      // Align to testDownscale
      this.config.base90dResolution = Math.floor(
        this.config.base90dResolution / this.config.testDownscale
      ) * this.config.testDownscale;
    }
  }
  
  /**
   * Generate mesh from SDF kernels using spherical coordinate sampling
   */
  public generateMesh(kernels: SDFKernel[]): BufferGeometry {
    const vertices: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    
    // Sample in spherical coordinates around camera
    const { rMin, rMax, base90dResolution, upscale1, upscale2 } = this.config;
    const { position } = this.cameraPose;
    
    // Calculate radial layers (logarithmic spacing)
    const logRMin = Math.log(rMin);
    const logRMax = Math.log(rMax);
    const baseR = Math.floor((logRMax - logRMin) / (Math.PI / 2 / base90dResolution) / this.config.rLengthen);
    const R = baseR * upscale1;
    
    // Calculate angular resolution
    const baseAngleResolution = Math.PI / 2 / base90dResolution;
    
    // Calculate FOV coverage
    const N0 = Math.floor((1 - this.config.fovHorizontal * 2 / Math.PI) / 2 * base90dResolution);
    const N1 = Math.floor((1 - this.config.fovVertical * 2 / Math.PI) / 2 * base90dResolution);
    
    const H = (base90dResolution - N0 * 2) * upscale1;
    const W = (base90dResolution - N1 * 2) * upscale1;
    
    console.log(`SphericalMesher: In-view resolution ${H}x${W}x${R}`);
    console.log(`SphericalMesher: Angular resolution 90°/${base90dResolution * upscale1 * upscale2}`);
    
    // Sample SDF values on spherical grid
    const sdfGrid = this.sampleSDFGrid(kernels, position, rMin, rMax, H, W, R);
    
    // Run marching cubes on the sampled grid
    const marchingCubesResult = this.runMarchingCubes(sdfGrid, H, W, R);
    
    // Convert to Three.js geometry
    for (const vertex of marchingCubesResult.vertices) {
      vertices.push(vertex.x, vertex.y, vertex.z);
    }
    
    for (const normal of marchingCubesResult.normals) {
      normals.push(normal.x, normal.y, normal.z);
    }
    
    for (let i = 0; i < marchingCubesResult.indices.length; i += 3) {
      indices.push(
        marchingCubesResult.indices[i],
        marchingCubesResult.indices[i + 2], // Reverse winding for correct face orientation
        marchingCubesResult.indices[i + 1]
      );
    }
    
    // Generate UVs based on spherical coordinates
    for (let i = 0; i < vertices.length; i += 3) {
      const x = vertices[i] - position.x;
      const y = vertices[i + 1] - position.y;
      const z = vertices[i + 2] - position.z;
      
      const r = Math.sqrt(x * x + y * y + z * z);
      const theta = Math.atan2(z, x);
      const phi = Math.acos(y / r);
      
      uvs.push(
        (theta + Math.PI) / (2 * Math.PI),
        phi / Math.PI
      );
    }
    
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
    
    return geometry;
  }
  
  /**
   * Sample SDF values on a spherical grid
   */
  protected sampleSDFGrid(
    kernels: SDFKernel[],
    center: Vector3,
    rMin: number,
    rMax: number,
    H: number,
    W: number,
    R: number
  ): Float32Array {
    const grid = new Float32Array(H * W * R);
    const logRMin = Math.log(rMin);
    const logRMax = Math.log(rMax);
    
    for (let r = 0; r < R; r++) {
      // Logarithmic radial spacing
      const logR = logRMin + (r / R) * (logRMax - logRMin);
      const radius = Math.exp(logR);
      
      for (let theta = 0; theta < H; theta++) {
        // Polar angle (0 to π)
        const polarAngle = (theta / H) * Math.PI;
        
        for (let phi = 0; phi < W; phi++) {
          // Azimuthal angle (0 to 2π)
          const azimuthalAngle = (phi / W) * 2 * Math.PI;
          
          // Convert to Cartesian coordinates
          const x = center.x + radius * Math.sin(polarAngle) * Math.cos(azimuthalAngle);
          const y = center.y + radius * Math.sin(polarAngle) * Math.sin(azimuthalAngle);
          const z = center.z + radius * Math.cos(polarAngle);
          
          // Evaluate SDF kernels
          let minSDF = Infinity;
          for (const kernel of kernels) {
            const sdf = kernel.evaluate(new Vector3(x, y, z));
            minSDF = Math.min(minSDF, sdf);
          }
          
          const idx = r * H * W + theta * W + phi;
          grid[idx] = minSDF;
        }
      }
    }
    
    return grid;
  }
  
  /**
   * Run marching cubes algorithm on SDF grid
   */
  protected runMarchingCubes(
    grid: Float32Array,
    H: number,
    W: number,
    R: number
  ): { vertices: Vector3[]; normals: Vector3[]; indices: number[] } {
    const vertices: Vector3[] = [];
    const normals: Vector3[] = [];
    const indices: number[] = [];
    
    // Simplified marching cubes implementation
    // In production, this would use a optimized lookup table approach
    
    const isolevel = 0;
    const dx = 1.0 / H;
    const dy = 1.0 / W;
    const dz = 1.0 / R;
    
    for (let r = 0; r < R - 1; r++) {
      for (let theta = 0; theta < H - 1; theta++) {
        for (let phi = 0; phi < W - 1; phi++) {
          const idx = r * H * W + theta * W + phi;
          
          // Get cube corner values
          const v000 = grid[idx];
          const v100 = grid[idx + 1];
          const v010 = grid[idx + W];
          const v110 = grid[idx + W + 1];
          const v001 = grid[idx + H * W];
          const v101 = grid[idx + H * W + 1];
          const v011 = grid[idx + H * W + W];
          const v111 = grid[idx + H * W + W + 1];
          
          // Check if cube crosses isolevel
          const cubeIndex = this.calculateCubeIndex(v000, v100, v010, v110, v001, v101, v011, v111, isolevel);
          
          if (cubeIndex !== 0 && cubeIndex !== 255) {
            // Cube intersects surface - generate triangles
            this.processIntersectingCube(
              vertices, normals, indices,
              theta, phi, r,
              dx, dy, dz,
              v000, v100, v010, v110, v001, v101, v011, v111,
              cubeIndex,
              isolevel
            );
          }
        }
      }
    }
    
    return { vertices, normals, indices };
  }
  
  protected calculateCubeIndex(
    v000: number, v100: number, v010: number, v110: number,
    v001: number, v101: number, v011: number, v111: number,
    isolevel: number
  ): number {
    let index = 0;
    if (v000 >= isolevel) index |= 1;
    if (v100 >= isolevel) index |= 2;
    if (v010 >= isolevel) index |= 4;
    if (v110 >= isolevel) index |= 8;
    if (v001 >= isolevel) index |= 16;
    if (v101 >= isolevel) index |= 32;
    if (v011 >= isolevel) index |= 64;
    if (v111 >= isolevel) index |= 128;
    return index;
  }
  
  protected processIntersectingCube(
    vertices: Vector3[],
    normals: Vector3[],
    indices: number[],
    theta: number,
    phi: number,
    r: number,
    dx: number,
    dy: number,
    dz: number,
    v000: number, v100: number, v010: number, v110: number,
    v001: number, v101: number, v011: number, v111: number,
    cubeIndex: number,
    isolevel: number
  ): void {
    // Marching cubes edge intersection and triangle generation
    // This is a simplified placeholder - full implementation needs lookup tables
    const edgeTable = [
      0x000, 0x109, 0x203, 0x30a, 0x406, 0x50f, 0x605, 0x70c,
      0x80c, 0x905, 0xa0f, 0xb06, 0xc0a, 0xd03, 0xe09, 0xf00
    ];
    
    const triTable = [
      [-1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
      [0, 8, 3, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
      // ... full table would be included in production
    ];
    
    // Placeholder: add simple quad at cube center
    const cx = theta * dx + dx / 2;
    const cy = phi * dy + dy / 2;
    const cz = r * dz + dz / 2;
    
    const startVertex = vertices.length;
    vertices.push(
      new Vector3(cx, cy, cz),
      new Vector3(cx + dx, cy, cz),
      new Vector3(cx + dx, cy + dy, cz),
      new Vector3(cx, cy + dy, cz)
    );
    
    const normal = new Vector3(0, 0, 1);
    normals.push(normal, normal, normal, normal);
    
    indices.push(
      startVertex, startVertex + 1, startVertex + 2,
      startVertex, startVertex + 2, startVertex + 3
    );
  }
}

export class OpaqueSphericalMesher extends SphericalMesher {
  public generateOpaqueMesh(kernels: SDFKernel[]): BufferGeometry {
    return this.generateMesh(kernels);
  }
}

export class TransparentSphericalMesher extends SphericalMesher {
  private invScale: number;
  
  constructor(
    cameraPose: CameraPose,
    bounds: [number, number, number, number, number, number],
    config: Partial<SphericalMesherConfig & { invScale: number }> = {}
  ) {
    super(cameraPose, bounds, config);
    this.invScale = config.invScale || 8;
  }
  
  public generateTransparentMesh(kernels: SDFKernel[]): BufferGeometry {
    // Override with transparency-specific sampling
    return this.generateMesh(kernels);
  }
}
