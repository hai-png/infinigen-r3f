import * as THREE from 'three';
import { InstancedMesh } from 'three';
import { SeededRandom } from '../../core/util/math/index';

/**
 * Configuration for grass scattering
 */
export interface GrassScatterConfig {
  // Density and distribution
  density: number;
  minSpacing: number;
  maxSpacing: number;
  
  // Blade properties
  bladeHeight: number;
  bladeHeightVariation: number;
  bladeWidth: number;
  bladeSegments: number;
  bladeColor: THREE.Color;
  bladeColorVariation: number;
  
  // Wind animation
  enableWind: boolean;
  windSpeed: number;
  windStrength: number;
  
  // Area constraints
  area: THREE.Box3;
  excludeObjects?: THREE.Object3D[];

  // Seed for deterministic generation
  seed: number;
}

/**
 * Grass Scatter System
 * Generates realistic grass fields using instanced meshes
 */
export class GrassScatterSystem {
  private config: GrassScatterConfig;
  private mesh: InstancedMesh | null = null;
  private dummy = new THREE.Object3D();
  private time: number = 0;
  private rng: SeededRandom;

  constructor(config: Partial<GrassScatterConfig>) {
    const seed = config.seed ?? 42;
    this.config = {
      density: 50,
      minSpacing: 0.1,
      maxSpacing: 0.3,
      bladeHeight: 0.3,
      bladeHeightVariation: 0.4,
      bladeWidth: 0.02,
      bladeSegments: 3,
      bladeColor: new THREE.Color(0x228b22),
      bladeColorVariation: 0.2,
      enableWind: true,
      windSpeed: 1.0,
      windStrength: 0.1,
      area: new THREE.Box3(
        new THREE.Vector3(-10, 0, -10),
        new THREE.Vector3(10, 0, 10)
      ),
      seed,
      ...config
    };
    this.rng = new SeededRandom(seed);
  }

  /**
   * Generate grass field
   */
  generate(): InstancedMesh {
    const size = this.config.area.getSize(new THREE.Vector3());
    const areaSize = Math.max(size.x, size.z);
    const grassCount = Math.floor(areaSize * areaSize * this.config.density);
    
    // Create blade geometry
    const bladeGeometry = this.createBladeGeometry();
    
    // Create material with transparency
    const material = new THREE.MeshStandardMaterial({
      color: this.config.bladeColor,
      roughness: 0.8,
      side: THREE.DoubleSide,
      alphaTest: 0.5
    });
    
    // Create instanced mesh
    this.mesh = new InstancedMesh(bladeGeometry, material, grassCount);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    
    // Position blades
    const positions: THREE.Vector3[] = [];
    
    for (let i = 0; i < grassCount; i++) {
      let position: THREE.Vector3;
      let attempts = 0;
      
      // Find valid position with minimum spacing
      do {
        position = new THREE.Vector3(
          this.config.area.min.x + this.rng.next() * size.x,
          this.config.area.min.y,
          this.config.area.min.z + this.rng.next() * size.z
        );
        attempts++;
      } while (
        this.isTooClose(position, positions, this.config.minSpacing) &&
        attempts < 10
      );
      
      if (attempts >= 10) continue;
      
      positions.push(position);
      
      // Set instance transform
      this.dummy.position.copy(position);
      
      // Random rotation around Y axis
      this.dummy.rotation.y = this.rng.uniform(0, Math.PI * 2);
      
      // Random scale variation
      const heightScale = 1 + (this.rng.next() - 0.5) * this.config.bladeHeightVariation;
      const widthScale = 0.8 + this.rng.next() * 0.4;
      this.dummy.scale.set(widthScale, heightScale, 1);
      
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      
      // Color variation
      if (this.config.bladeColorVariation > 0) {
        const color = this.config.bladeColor.clone();
        const variation = (this.rng.next() - 0.5) * this.config.bladeColorVariation;
        color.offsetHSL(0, 0, variation);
        this.mesh.setColorAt(i, color);
      }
    }
    
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) {
      this.mesh.instanceColor.needsUpdate = true;
    }
    
    return this.mesh;
  }

  /**
   * Create individual grass blade geometry
   */
  private createBladeGeometry(): THREE.BufferGeometry {
    const shape = new THREE.Shape();
    const w = this.config.bladeWidth;
    const h = this.config.bladeHeight;
    
    // Curved blade shape
    shape.moveTo(-w / 2, 0);
    shape.quadraticCurveTo(0, h * 0.3, w / 2, 0);
    shape.quadraticCurveTo(w / 4, h * 0.7, 0, h);
    shape.quadraticCurveTo(-w / 4, h * 0.7, -w / 2, 0);
    
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.001,
      bevelEnabled: false
    });
    
    // Center and rotate to stand upright
    geometry.center();
    geometry.rotateX(Math.PI / 2);
    
    return geometry;
  }

  /**
   * Check if position is too close to existing positions
   */
  private isTooClose(
    position: THREE.Vector3,
    positions: THREE.Vector3[],
    minDistance: number
  ): boolean {
    for (const existing of positions) {
      if (position.distanceTo(existing) < minDistance) {
        return true;
      }
    }
    return false;
  }

  /**
   * Update wind animation
   */
  update(deltaTime: number): void {
    if (!this.mesh || !this.config.enableWind) return;
    
    this.time += deltaTime * this.config.windSpeed;
    
    const count = this.mesh.count;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    
    for (let i = 0; i < count; i++) {
      this.mesh.getMatrixAt(i, matrix);
      matrix.decompose(position, quaternion, scale);
      
      // Calculate wind effect based on position and time
      const windX = Math.sin(this.time + position.x * 0.5) * this.config.windStrength;
      const windZ = Math.cos(this.time + position.z * 0.3) * this.config.windStrength;
      
      // Apply bend rotation
      const bendQuaternion = new THREE.Quaternion();
      bendQuaternion.setFromEuler(new THREE.Euler(windX, 0, windZ));
      quaternion.multiply(bendQuaternion);
      
      matrix.compose(position, quaternion, scale);
      this.mesh.setMatrixAt(i, matrix);
    }
    
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * Get grass mesh
   */
  getMesh(): InstancedMesh | null {
    return this.mesh;
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<GrassScatterConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
