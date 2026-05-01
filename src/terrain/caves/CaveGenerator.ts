/**
 * Cave Generation System
 * Implements asset-based cave generation with decorations, stalactites/stalagmites, and lighting
 */

import * as THREE from 'three';
import { SDFOperations } from '../sdf/SDFOperations';

export interface CaveParams {
  /** Cave density (0-1) */
  density: number;
  /** Average cave size in meters */
  caveSize: number;
  /** Cave complexity/noise scale */
  complexity: number;
  /** Enable stalactites (ceiling formations) */
  enableStalactites: boolean;
  /** Enable stalagmites (floor formations) */
  enableStalagmites: boolean;
  /** Stalactite density */
  stalactiteDensity: number;
  /** Stalagmite density */
  stalagmiteDensity: number;
  /** Enable cave decorations (crystals, rocks, etc.) */
  enableDecorations: boolean;
  /** Decoration density */
  decorationDensity: number;
  /** Enable cave lighting */
  enableLighting: boolean;
  /** Light intensity */
  lightIntensity: number;
  /** Light color */
  lightColor: THREE.Color;
}

export interface CaveDecoration {
  type: 'stalactite' | 'stalagmite' | 'crystal' | 'rock' | 'puddle';
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: THREE.Vector3;
  material?: THREE.Material;
}

export class CaveGenerator {
  private params: CaveParams;
  private sdfOps: SDFOperations;
  private decorations: CaveDecoration[] = [];
  private perm: number[] = [];

  constructor(params: Partial<CaveParams> = {}) {
    this.params = {
      density: 0.3,
      caveSize: 3.0,
      complexity: 0.5,
      enableStalactites: true,
      enableStalagmites: true,
      stalactiteDensity: 0.2,
      stalagmiteDensity: 0.2,
      enableDecorations: true,
      decorationDensity: 0.1,
      enableLighting: true,
      lightIntensity: 0.5,
      lightColor: new THREE.Color(0xffaa88),
      ...params,
    };
    this.sdfOps = new SDFOperations({ resolution: 1, bounds: new THREE.Box3(new THREE.Vector3(-50, -50, -50), new THREE.Vector3(50, 50, 50)) });
    this.initPerm();
  }

  /**
   * Initialize standard Perlin permutation table (256 entries duplicated to 512)
   */
  private initPerm(): void {
    const base = [
      151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,
      140,36,103,30,69,142,8,99,37,240,21,10,23,190,6,148,
      247,120,234,75,0,26,197,62,94,252,219,203,117,35,11,32,
      57,177,33,88,237,149,56,87,174,20,125,136,171,168,68,175,
      74,165,71,134,139,48,27,166,77,146,158,231,83,111,229,122,
      60,211,133,230,220,105,92,41,55,46,245,40,244,102,143,54,
      65,25,63,161,1,216,80,73,209,76,132,187,208,89,18,169,
      200,196,135,130,116,188,159,86,164,100,109,198,173,186,3,64,
      52,217,226,250,124,123,5,202,38,147,118,126,255,82,85,212,
      207,206,59,227,47,16,58,17,182,189,28,42,223,183,170,213,
      119,248,152,2,44,154,163,70,221,153,101,155,167,43,172,9,
      129,22,39,253,19,98,108,110,79,113,224,232,178,185,112,104,
      218,246,97,228,251,34,242,193,238,210,144,12,191,179,162,241,
      81,51,145,235,249,14,239,107,49,192,214,31,181,199,106,157,
      184,84,204,176,115,121,50,45,127,4,150,254,138,236,205,93,
      222,114,67,29,24,72,243,141,128,195,78,66,215,61,156,180
    ];
    this.perm = new Array(512);
    for (let i = 0; i < 256; i++) {
      this.perm[i] = base[i];
      this.perm[256 + i] = base[i];
    }
  }

  /**
   * Generate cave SDF by subtracting from terrain SDF
   */
  generateCaves(terrainSDF: Float32Array, width: number, height: number, depth: number): Float32Array {
    const caveSDF = new Float32Array(width * height * depth);
    
    // Generate cave network using noise
    for (let z = 0; z < depth; z++) {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = z * width * height + y * width + x;
          
          // Multi-scale noise for cave formation
          const noise1 = this.perlinNoise(x / 20, y / 20, z / 20);
          const noise2 = this.perlinNoise(x / 5, y / 5, z / 5) * 0.5;
          const noise3 = this.perlinNoise(x / 2, y / 2, z / 2) * 0.25;
          
          const combinedNoise = (noise1 + noise2 + noise3) / 1.75;
          
          // Carve caves where noise exceeds threshold
          const threshold = 1.0 - this.params.density;
          const caveValue = combinedNoise > threshold ? 
            -(Math.abs(combinedNoise - threshold) * this.params.caveSize) : 
            1000;
          
          caveSDF[idx] = caveValue;
        }
      }
    }
    
    // Combine with terrain SDF (subtractive operation)
    const result = new Float32Array(terrainSDF.length);
    for (let i = 0; i < terrainSDF.length; i++) {
      result[i] = Math.min(terrainSDF[i], caveSDF[i]);
    }
    
    return result;
  }

  /**
   * Generate cave decorations
   */
  generateDecorations(
    caveMesh: THREE.Mesh,
    bounds: { min: THREE.Vector3; max: THREE.Vector3 }
  ): CaveDecoration[] {
    this.decorations = [];
    
    if (this.params.enableStalactites) {
      this.generateStalactites(bounds);
    }
    
    if (this.params.enableStalagmites) {
      this.generateStalagmites(bounds);
    }
    
    if (this.params.enableDecorations) {
      this.generateAdditionalDecorations(bounds);
    }
    
    return this.decorations;
  }

  private generateStalactites(bounds: { min: THREE.Vector3; max: THREE.Vector3 }): void {
    const count = Math.floor(
      this.params.stalactiteDensity * 
      (bounds.max.x - bounds.min.x) * 
      (bounds.max.z - bounds.min.z)
    );
    
    for (let i = 0; i < count; i++) {
      const x = bounds.min.x + Math.random() * (bounds.max.x - bounds.min.x);
      const z = bounds.min.z + Math.random() * (bounds.max.z - bounds.min.z);
      const y = bounds.max.y - 0.1; // Near ceiling
      
      const height = 0.5 + Math.random() * 2.0;
      const radius = 0.1 + Math.random() * 0.3;
      
      this.decorations.push({
        type: 'stalactite',
        position: new THREE.Vector3(x, y, z),
        rotation: new THREE.Euler(Math.PI, 0, 0), // Point downward
        scale: new THREE.Vector3(radius, height, radius),
      });
    }
  }

  private generateStalagmites(bounds: { min: THREE.Vector3; max: THREE.Vector3 }): void {
    const count = Math.floor(
      this.params.stalagmiteDensity * 
      (bounds.max.x - bounds.min.x) * 
      (bounds.max.z - bounds.min.z)
    );
    
    for (let i = 0; i < count; i++) {
      const x = bounds.min.x + Math.random() * (bounds.max.x - bounds.min.x);
      const z = bounds.min.z + Math.random() * (bounds.max.z - bounds.min.z);
      const y = bounds.min.y + 0.1; // Near floor
      
      const height = 0.3 + Math.random() * 1.5;
      const radius = 0.1 + Math.random() * 0.4;
      
      this.decorations.push({
        type: 'stalagmite',
        position: new THREE.Vector3(x, y, z),
        rotation: new THREE.Euler(0, 0, 0),
        scale: new THREE.Vector3(radius, height, radius),
      });
    }
  }

  private generateAdditionalDecorations(bounds: { min: THREE.Vector3; max: THREE.Vector3 }): void {
    const decorationTypes: Array<'crystal' | 'rock' | 'puddle'> = ['crystal', 'rock', 'puddle'];
    const totalArea = (bounds.max.x - bounds.min.x) * (bounds.max.z - bounds.min.z);
    const count = Math.floor(this.params.decorationDensity * totalArea);
    
    for (let i = 0; i < count; i++) {
      const type = decorationTypes[Math.floor(Math.random() * decorationTypes.length)];
      const x = bounds.min.x + Math.random() * (bounds.max.x - bounds.min.x);
      const z = bounds.min.z + Math.random() * (bounds.max.z - bounds.min.z);
      const y = bounds.min.y + 0.05 + Math.random() * (bounds.max.y - bounds.min.y - 0.1);
      
      const scale = 0.2 + Math.random() * 0.8;
      
      this.decorations.push({
        type,
        position: new THREE.Vector3(x, y, z),
        rotation: new THREE.Euler(
          Math.random() * Math.PI,
          Math.random() * Math.PI,
          Math.random() * Math.PI
        ),
        scale: new THREE.Vector3(scale, scale, scale),
      });
    }
  }

  /**
   * Create geometry for decorations
   */
  createDecorationGeometry(decoration: CaveDecoration): THREE.BufferGeometry {
    switch (decoration.type) {
      case 'stalactite':
      case 'stalagmite':
        return new THREE.ConeGeometry(1, 1, 8, 1);
      case 'crystal':
        return new THREE.OctahedronGeometry(1, 0);
      case 'rock':
        return new THREE.DodecahedronGeometry(1, 0);
      case 'puddle':
        return new THREE.CircleGeometry(1, 16);
      default:
        return new THREE.SphereGeometry(1, 8, 8);
    }
  }

  /**
   * Create instanced mesh for all decorations
   */
  createInstancedMesh(scene: THREE.Scene): THREE.InstancedMesh {
    const totalDecorations = this.decorations.length;
    if (totalDecorations === 0) {
      return new THREE.InstancedMesh(
        new THREE.SphereGeometry(1, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0x888888 }),
        0
      );
    }

    // Group decorations by type for efficient instancing
    const byType = new Map<string, CaveDecoration[]>();
    for (const dec of this.decorations) {
      const key = dec.type;
      if (!byType.has(key)) {
        byType.set(key, []);
      }
      byType.get(key)!.push(dec);
    }

    // Create first type as main mesh (simplified - would need multiple meshes in production)
    const firstType = Array.from(byType.entries())[0];
    const geometry = this.createDecorationGeometry(firstType[1][0]);
    const material = new THREE.MeshStandardMaterial({
      color: 0x888888,
      roughness: 0.9,
      metalness: 0.1,
    });

    const mesh = new THREE.InstancedMesh(geometry, material, totalDecorations);
    
    let idx = 0;
    for (const [type, decals] of byType) {
      for (const dec of decals) {
        const matrix = new THREE.Matrix4();
        matrix.compose(dec.position, new THREE.Quaternion().setFromEuler(dec.rotation), dec.scale);
        mesh.setMatrixAt(idx++, matrix);
      }
    }

    scene.add(mesh);
    return mesh;
  }

  /**
   * Create cave lighting
   */
  createLighting(scene: THREE.Scene, bounds: { min: THREE.Vector3; max: THREE.Vector3 }): void {
    if (!this.params.enableLighting) return;

    // Add point lights throughout the cave
    const lightCount = Math.max(3, Math.floor(
      (bounds.max.x - bounds.min.x) * (bounds.max.z - bounds.min.z) / 50
    ));

    for (let i = 0; i < lightCount; i++) {
      const x = bounds.min.x + Math.random() * (bounds.max.x - bounds.min.x);
      const z = bounds.min.z + Math.random() * (bounds.max.z - bounds.min.z);
      const y = bounds.min.y + (bounds.max.y - bounds.min.y) * 0.7;

      const light = new THREE.PointLight(
        this.params.lightColor,
        this.params.lightIntensity,
        15
      );
      light.position.set(x, y, z);
      scene.add(light);
    }
  }

  /**
   * Update parameters
   */
  setParams(params: Partial<CaveParams>): void {
    this.params = { ...this.params, ...params };
  }

  /**
   * Get decorations
   */
  getDecorations(): CaveDecoration[] {
    return this.decorations;
  }

  /**
   * Simple Perlin-like noise function
   */
  private perlinNoise(x: number, y: number, z: number): number {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const Z = Math.floor(z) & 255;

    x -= Math.floor(x);
    y -= Math.floor(y);
    z -= Math.floor(z);

    const u = this.fade(x);
    const v = this.fade(y);
    const w = this.fade(z);

    const A = this.perm[X] + Y;
    const AA = this.perm[A] + Z;
    const AB = this.perm[A + 1] + Z;
    const B = this.perm[X + 1] + Y;
    const BA = this.perm[B] + Z;
    const BB = this.perm[B + 1] + Z;

    return this.lerp(
      w,
      this.lerp(
        v,
        this.lerp(
          u,
          this.grad(this.perm[AA], x, y, z),
          this.grad(this.perm[BA], x - 1, y, z)
        ),
        this.lerp(
          u,
          this.grad(this.perm[AB], x, y - 1, z),
          this.grad(this.perm[BB], x - 1, y - 1, z)
        )
      ),
      this.lerp(
        v,
        this.lerp(
          u,
          this.grad(this.perm[AA + 1], x, y, z - 1),
          this.grad(this.perm[BA + 1], x - 1, y, z - 1)
        ),
        this.lerp(
          u,
          this.grad(this.perm[AB + 1], x, y - 1, z - 1),
          this.grad(this.perm[BB + 1], x - 1, y - 1, z - 1)
        )
      )
    );
  }

  private fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  private lerp(t: number, a: number, b: number): number {
    return a + t * (b - a);
  }

  private grad(hash: number, x: number, y: number, z: number): number {
    const h = hash & 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }
}

export default CaveGenerator;
