/**
 * InfiniGen R3F Port - Procedural Cloud Generator
 *
 * Generates volumetric clouds using noise-based procedures,
 * supporting cumulus, stratus, and cirrus cloud types.
 *
 * Based on original InfiniGen cloud.py implementation
 *
 * @module assets/objects/cloud
 */

import * as THREE from 'three';
import { Vector3 } from '../../math/vector';
import { SimplexNoise } from '../../utils/noise';
import { GeometryUtils } from '../../utils/geometry';

// ============================================================================
// Type Definitions
// ============================================================================

export type CloudType = 'cumulus' | 'stratus' | 'cirrus' | 'custom';

export interface CloudParams {
  // Core parameters
  density: number;
  anisotropy: number;
  noiseScale: number;
  noiseDetail: number;
  voronoiScale: number;
  mixFactor: number;
  rotateAngle: number;
  emissionStrength: number;
  
  // Physical properties
  scale: Vector3;
  altitude: number;
  coverage: number;
  
  // Animation
  speed: number;
  evolution: number;
}

export interface CloudConfig {
  seed: number;
  type: CloudType;
  resolution: number;
  boundingBoxSize: number;
  detailLevels: number;
}

// ============================================================================
// Cloud Types Presets
// ============================================================================

const CLOUD_PRESETS: Record<CloudType, Partial<CloudParams>> = {
  cumulus: {
    density: 1.0,
    anisotropy: 0.0,
    noiseScale: 12.0,
    noiseDetail: 8.5,
    voronoiScale: 4.0,
    mixFactor: 0.55,
    rotateAngle: Math.PI / 8,
    emissionStrength: 0.0,
  },
  stratus: {
    density: 0.6,
    anisotropy: -0.3,
    noiseScale: 20.0,
    noiseDetail: 4.0,
    voronoiScale: 8.0,
    mixFactor: 0.4,
    rotateAngle: 0.0,
    emissionStrength: 0.0,
  },
  cirrus: {
    density: 0.3,
    anisotropy: 0.4,
    noiseScale: 30.0,
    noiseDetail: 2.0,
    voronoiScale: 12.0,
    mixFactor: 0.7,
    rotateAngle: Math.PI / 6,
    emissionStrength: 0.02,
  },
  custom: {},
};

// ============================================================================
// Cumulus Cloud Class
// ============================================================================

export class CumulusCloud {
  private params: CloudParams;
  private noise: SimplexNoise;
  private voronoiNoise: SimplexNoise;
  
  static readonly DENSITY_RANGE: [number, number] = [1.0, 1.0];
  static readonly ANISOTROPY_RANGE: [number, number] = [-0.5, 0.5];
  static readonly NOISE_SCALE_RANGE: [number, number] = [8.0, 16.0];
  static readonly NOISE_DETAIL_RANGE: [number, number] = [1.0, 16.0];
  static readonly VORONOI_SCALE_RANGE: [number, number] = [2.0, 6.0];
  static readonly MIX_FACTOR_RANGE: [number, number] = [0.3, 0.8];
  static readonly ANGLE_ROTATE_RANGE: [number, number] = [0.0, Math.PI / 4];
  static readonly EMISSION_RANGE: [number, number] = [0.0, 0.0];
  
  static readonly PLANE_SCALES: [number, number, number] = [16, 16, 4];
  
  constructor(seed: number, params?: Partial<CloudParams>) {
    this.noise = new SimplexNoise(seed);
    this.voronoiNoise = new SimplexNoise(seed + 1000);
    
    const preset = CLOUD_PRESETS.cumulus;
    this.params = {
      density: this.randomInRange(CumulusCloud.DENSITY_RANGE),
      anisotropy: this.randomInRange(CumulusCloud.ANISOTROPY_RANGE),
      noiseScale: this.randomInRange(CumulusCloud.NOISE_SCALE_RANGE),
      noiseDetail: this.randomInRange(CumulusCloud.NOISE_DETAIL_RANGE),
      voronoiScale: this.randomInRange(CumulusCloud.VORONOI_SCALE_RANGE),
      mixFactor: this.randomInRange(CumulusCloud.MIX_FACTOR_RANGE),
      rotateAngle: this.randomInRange(CumulusCloud.ANGLE_ROTATE_RANGE),
      emissionStrength: this.randomInRange(CumulusCloud.EMISSION_RANGE),
      scale: this.generateScale(),
      altitude: 1000 + Math.random() * 2000,
      coverage: 0.5 + Math.random() * 0.5,
      speed: 0.1 + Math.random() * 0.3,
      evolution: 0.0,
      ...preset,
      ...params,
    };
  }
  
  private randomInRange(range: [number, number]): number {
    return range[0] + Math.random() * (range[1] - range[0]);
  }
  
  private generateScale(): Vector3 {
    const scaleZ = 16.0 + Math.random() * 16.0;
    const scaleX = scaleZ * 1.2 + Math.random() * scaleZ * 0.8;
    const scaleY = scaleX * (0.5 + Math.random() * 1.5);
    return new Vector3(scaleX, scaleY, scaleZ);
  }
  
  /**
   * Generate density field for the cloud volume
   */
  public generateDensityField(
    width: number,
    height: number,
    depth: number,
    resolution: number
  ): Float32Array {
    const size = resolution * resolution * resolution;
    const densityField = new Float32Array(size);
    
    const scale = this.params.scale;
    const noiseScale = this.params.noiseScale;
    const voronoiScale = this.params.voronoiScale;
    const mixFactor = this.params.mixFactor;
    const time = this.params.evolution;
    
    for (let z = 0; z < resolution; z++) {
      for (let y = 0; y < resolution; y++) {
        for (let x = 0; x < resolution; x++) {
          const idx = x + y * resolution + z * resolution * resolution;
          
          // Normalize coordinates
          const nx = (x / resolution - 0.5) * width;
          const ny = (y / resolution - 0.5) * height;
          const nz = (z / resolution - 0.5) * depth;
          
          // Base noise
          const baseNoise = this.evaluateNoise(
            nx / noiseScale + time * 0.1,
            ny / noiseScale,
            nz / noiseScale * 0.5
          );
          
          // Voronoi noise for detail
          const voronoiValue = this.evaluateVoronoi(
            nx / voronoiScale,
            ny / voronoiScale,
            nz / voronoiScale * 0.5
          );
          
          // Mix noises
          let density = baseNoise * (1 - mixFactor) + voronoiValue * mixFactor;
          
          // Apply anisotropy (vertical stretching)
          density *= 1 + this.params.anisotropy * (nz / depth);
          
          // Apply distance falloff from center
          const distFromCenter = Math.sqrt(
            Math.pow(nx / scale.x, 2) +
            Math.pow(ny / scale.y, 2) +
            Math.pow(nz / scale.z, 2)
          );
          
          // Smooth falloff at edges
          if (distFromCenter > 1.0) {
            density *= Math.max(0, 1 - (distFromCenter - 1.0) * 2);
          }
          
          // Apply overall density
          density *= this.params.density;
          
          // Clamp to valid range
          densityField[idx] = Math.max(0, Math.min(1, density));
        }
      }
    }
    
    return densityField;
  }
  
  private evaluateNoise(x: number, y: number, z: number): number {
    const detail = this.params.noiseDetail;
    let value = 0;
    let amplitude = 1;
    let frequency = 1;
    let maxValue = 0;
    
    for (let i = 0; i < Math.floor(detail); i++) {
      value += this.noise.noise3d(x * frequency, y * frequency, z * frequency) * amplitude;
      maxValue += amplitude;
      amplitude *= 0.5;
      frequency *= 2;
    }
    
    return value / maxValue;
  }
  
  private evaluateVoronoi(x: number, y: number, z: number): number {
    // Simplified Voronoi using noise
    const cellSize = 1.0;
    const xi = Math.floor(x / cellSize);
    const yi = Math.floor(y / cellSize);
    const zi = Math.floor(z / cellSize);
    
    let minValue = Infinity;
    
    for (let dz = -1; dz <= 1; dz++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const px = xi + dx;
          const py = yi + dy;
          const pz = zi + dz;
          
          // Pseudo-random point in cell
          const seed = px * 371 + py * 757 + pz * 911;
          const randX = (this.noise.noise1d(seed) + 1) * 0.5;
          const randY = (this.noise.noise1d(seed + 1) + 1) * 0.5;
          const randZ = (this.noise.noise1d(seed + 2) + 1) * 0.5;
          
          const cellX = px * cellSize + randX * cellSize;
          const cellY = py * cellSize + randY * cellSize;
          const cellZ = pz * cellSize + randZ * cellSize;
          
          const dist = Math.sqrt(
            Math.pow(x - cellX, 2) +
            Math.pow(y - cellY, 2) +
            Math.pow(z - cellZ, 2)
          );
          
          minValue = Math.min(minValue, dist);
        }
      }
    }
    
    // Invert so centers are dense
    return 1 - Math.min(1, minValue);
  }
  
  /**
   * Update cloud parameters
   */
  public updateParams(params: Partial<CloudParams>): void {
    Object.assign(this.params, params);
  }
  
  /**
   * Animate cloud over time
   */
  public animate(deltaTime: number): void {
    this.params.evolution += deltaTime * this.params.speed;
  }
  
  /**
   * Get current parameters
   */
  public getParams(): CloudParams {
    return { ...this.params };
  }
}

// ============================================================================
// Cloud Generator
// ============================================================================

export class CloudGenerator {
  private config: CloudConfig;
  private clouds: CumulusCloud[];
  
  constructor(config: CloudConfig) {
    this.config = {
      seed: config.seed || Math.floor(Math.random() * 10000),
      type: config.type || 'cumulus',
      resolution: config.resolution || 64,
      boundingBoxSize: config.boundingBoxSize || 100,
      detailLevels: config.detailLevels || 3,
    };
    
    this.clouds = [];
  }
  
  /**
   * Generate a single cloud
   */
  public generateCloud(
    position: Vector3,
    params?: Partial<CloudParams>
  ): CumulusCloud {
    const cloud = new CumulusCloud(this.config.seed + this.clouds.length, params);
    this.clouds.push(cloud);
    return cloud;
  }
  
  /**
   * Generate cloud field with multiple clouds
   */
  public generateCloudField(
    area: { width: number; height: number; depth: number },
    count: number
  ): CumulusCloud[] {
    const clouds: CumulusCloud[] = [];
    
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * area.width;
      const y = (Math.random() - 0.5) * area.height;
      const z = (Math.random() - 0.5) * area.depth;
      
      const position = new Vector3(x, y, z);
      const cloud = this.generateCloud(position);
      clouds.push(cloud);
    }
    
    return clouds;
  }
  
  /**
   * Create volumetric mesh from cloud density field
   */
  public createVolumetricMesh(
    cloud: CumulusCloud,
    threshold: number = 0.3
  ): THREE.BufferGeometry {
    const resolution = this.config.resolution;
    const bboxSize = this.config.boundingBoxSize;
    
    const densityField = cloud.generateDensityField(
      bboxSize, bboxSize, bboxSize * 0.5,
      resolution
    );
    
    // Use marching cubes or similar algorithm
    const geometry = GeometryUtils.marchingCubes(
      densityField,
      resolution,
      bboxSize,
      threshold
    );
    
    return geometry;
  }
  
  /**
   * Create instanced cloud representation for performance
   */
  public createInstancedClouds(
    clouds: CumulusCloud[],
    material: THREE.Material
  ): THREE.InstancedMesh {
    const count = clouds.length;
    const geometry = new THREE.SphereGeometry(1, 32, 32);
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    
    clouds.forEach((cloud, i) => {
      const params = cloud.getParams();
      const scale = params.scale;
      
      mesh.setMatrixAt(i, new THREE.Matrix4().makeScale(scale.x, scale.y, scale.z));
    });
    
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }
  
  /**
   * Animate all clouds
   */
  public animate(deltaTime: number): void {
    this.clouds.forEach(cloud => cloud.animate(deltaTime));
  }
  
  /**
   * Get all generated clouds
   */
  public getClouds(): CumulusCloud[] {
    return [...this.clouds];
  }
  
  /**
   * Clear all clouds
   */
  public clear(): void {
    this.clouds = [];
  }
}

// ============================================================================
// Cloud Material Generator
// ============================================================================

export function createCloudMaterial(params: CloudParams): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uDensity: { value: params.density },
      uAnisotropy: { value: params.anisotropy },
      uEmission: { value: params.emissionStrength },
      uTime: { value: 0.0 },
      uLightDirection: { value: new THREE.Vector3(1, 1, 1).normalize() },
      uLightColor: { value: new THREE.Color(0xffffff) },
    },
    vertexShader: `
      varying vec3 vPosition;
      varying vec3 vNormal;
      varying vec2 vUv;
      
      void main() {
        vPosition = position;
        vNormal = normal;
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uDensity;
      uniform float uAnisotropy;
      uniform float uEmission;
      uniform float uTime;
      uniform vec3 uLightDirection;
      uniform vec3 uLightColor;
      
      varying vec3 vPosition;
      varying vec3 vNormal;
      varying vec2 vUv;
      
      void main() {
        // Basic lighting
        float diffuse = max(dot(vNormal, uLightDirection), 0.0);
        
        // Density-based coloring
        vec3 baseColor = vec3(1.0) * uDensity;
        vec3 litColor = baseColor * (diffuse + uEmission);
        
        // Add subtle color variation
        litColor += vec3(0.1, 0.1, 0.15) * (1.0 - diffuse);
        
        gl_FragColor = vec4(litColor, 0.9);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Sample curve points for cloud shape definition
 */
export function sampleCloudCurvePoints(): Vector3[] {
  const points: Vector3[] = [];
  const numPoints = 5 + Math.floor(Math.random() * 3);
  
  for (let i = 0; i < numPoints; i++) {
    const t = i / (numPoints - 1);
    const x = (t - 0.5) * 2;
    const y = Math.sin(t * Math.PI) * (0.5 + Math.random() * 0.5);
    points.push(new Vector3(x, y, 0));
  }
  
  return points;
}

/**
 * Calculate cloud coverage based on weather conditions
 */
export function calculateCloudCoverage(
  weatherType: string,
  intensity: number
): number {
  const baseCoverage: Record<string, number> = {
    clear: 0.1,
    cloudy: 0.7,
    rain: 0.9,
    storm: 0.95,
    snow: 0.8,
    fog: 0.6,
  };
  
  return Math.min(1.0, (baseCoverage[weatherType] || 0.5) * (0.5 + intensity * 0.5));
}

export default CloudGenerator;
