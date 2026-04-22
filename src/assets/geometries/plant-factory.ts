/**
 * Simple Plant Factory - Procedural grass and small plant generation
 * Ported from: infinigen/assets/small_plants/
 * 
 * Generates simple grass blades and small plants using curved planes
 */

import { AssetFactory, FactoryConfig } from '../../placement/factory';
import * as THREE from 'three';

export interface PlantConfig extends FactoryConfig {
  /** Height of the plant */
  height: number;
  /** Width at base */
  width: number;
  /** Number of blades in a clump */
  bladeCount: number;
  /** Curvature of blades (0-1) */
  curvature: number;
  /** Color variation */
  colorVariation: number;
  /** Base green color */
  baseColor: THREE.Color;
  /** Whether to add randomness to blade shape */
  randomizeShape: boolean;
}

const DEFAULT_PLANT_CONFIG: PlantConfig = {
  seed: Math.random(),
  height: 0.3,
  width: 0.05,
  bladeCount: 5,
  curvature: 0.3,
  colorVariation: 0.15,
  baseColor: new THREE.Color(0x4a7c23),
  randomizeShape: true,
};

/**
 * SimplePlantFactory - Generates procedural grass and small plants
 */
export class SimplePlantFactory extends AssetFactory<PlantConfig> {
  protected defaultConfig: PlantConfig = DEFAULT_PLANT_CONFIG;
  
  public readonly assetType = 'plant';
  public readonly tags = ['vegetation', 'natural', 'static', 'grass'];

  constructor(config?: Partial<PlantConfig>) {
    super(config);
  }

  /**
   * Generate a single grass/plant clump
   */
  async generateAsset(config?: Partial<PlantConfig>): Promise<THREE.Group> {
    const finalConfig = this.mergeConfig(config);
    this.setSeed(finalConfig.seed);

    const group = new THREE.Group();

    // Generate multiple blades
    for (let i = 0; i < finalConfig.bladeCount; i++) {
      const blade = this.createBlade(finalConfig);
      
      // Random rotation around center
      const angle = this.randomRange(0, Math.PI * 2);
      const offset = this.randomRange(0, finalConfig.width * 0.5);
      
      blade.position.x = Math.cos(angle) * offset;
      blade.position.z = Math.sin(angle) * offset;
      blade.rotation.y = angle + this.randomRange(-0.2, 0.2);
      
      group.add(blade);
    }

    group.userData.factoryType = 'plant';
    group.userData.seed = finalConfig.seed;
    group.userData.config = finalConfig;

    return group;
  }

  /**
   * Create a single grass blade
   */
  protected createBlade(config: PlantConfig): THREE.Mesh {
    // Create curved plane geometry for grass blade
    const height = config.height * (0.8 + this.random() * 0.4);
    const width = config.width * (0.7 + this.random() * 0.6);
    
    // Use plane geometry with segments for curvature
    const segments = 8;
    const geometry = new THREE.PlaneGeometry(width, height, 1, segments);
    
    // Apply curvature by bending vertices
    this.applyCurvature(geometry, config.curvature, height);
    
    // Add some random shape variation
    if (config.randomizeShape) {
      this.addShapeVariation(geometry);
    }

    // Create material with vertex colors
    const material = this.createBladeMaterial(config);

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    // Position at ground level
    mesh.position.y = height * 0.5;

    return mesh;
  }

  /**
   * Apply curvature to grass blade
   */
  protected applyCurvature(
    geometry: THREE.PlaneGeometry,
    curvature: number,
    height: number
  ): void {
    const positionAttribute = geometry.attributes.position;
    const vertex = new THREE.Vector3();

    for (let i = 0; i < positionAttribute.count; i++) {
      vertex.fromBufferAttribute(positionAttribute, i);
      
      // Only bend upper part of blade
      const t = (vertex.y + height * 0.5) / height; // 0 at bottom, 1 at top
      
      if (t > 0.3) {
        // Bend along Z axis
        const bendAmount = curvature * Math.pow(t - 0.3, 1.5) * height * 0.3;
        vertex.z += bendAmount;
        
        // Slight twist
        vertex.x *= 1 + t * 0.1 * (this.random() - 0.5);
      }
      
      positionAttribute.setXYZ(i, vertex.x, vertex.y, vertex.z);
    }

    geometry.computeVertexNormals();
    positionAttribute.needsUpdate = true;
  }

  /**
   * Add random shape variation to blade
   */
  protected addShapeVariation(geometry: THREE.PlaneGeometry): void {
    const positionAttribute = geometry.attributes.position;
    const vertex = new THREE.Vector3();

    for (let i = 0; i < positionAttribute.count; i++) {
      vertex.fromBufferAttribute(positionAttribute, i);
      
      // Add slight width variation along the blade
      if (Math.abs(vertex.y) < geometry.parameters.height * 0.4) {
        const variation = 1 + (this.random() - 0.5) * 0.2;
        vertex.x *= variation;
        positionAttribute.setXYZ(i, vertex.x, vertex.y, vertex.z);
      }
    }

    positionAttribute.needsUpdate = true;
  }

  /**
   * Create material for grass blade
   */
  protected createBladeMaterial(config: PlantConfig): THREE.MeshStandardMaterial {
    // Add color variation
    const variation = config.colorVariation * (this.random() - 0.5);
    const color = config.baseColor.clone();
    color.r += variation;
    color.g += variation;
    color.b += variation;
    color.clamp();

    const material = new THREE.MeshStandardMaterial({
      color: color,
      side: THREE.DoubleSide,
      roughness: 0.9,
      metalness: 0.0,
      flatShading: false,
      transparent: true,
      alphaTest: 0.5,
    });

    return material;
  }

  /**
   * Generate a field of grass/plants
   */
  async generateField(
    count: number,
    areaSize: number,
    config?: Partial<PlantConfig>
  ): Promise<THREE.InstancedMesh> {
    const finalConfig = this.mergeConfig(config);
    const prototype = await this.generateAsset(finalConfig);
    
    // Get the first blade mesh for instancing
    const bladeMesh = prototype.children[0] as THREE.Mesh;
    
    const instancedMesh = new THREE.InstancedMesh(
      bladeMesh.geometry,
      bladeMesh.material,
      count * finalConfig.bladeCount
    );

    instancedMesh.castShadow = true;
    instancedMesh.receiveShadow = true;

    const dummy = new THREE.Object3D();
    let instanceIndex = 0;

    for (let i = 0; i < count; i++) {
      // Random position in area
      const x = this.randomRange(-areaSize * 0.5, areaSize * 0.5);
      const z = this.randomRange(-areaSize * 0.5, areaSize * 0.5);

      // Create each blade in the clump
      for (let j = 0; j < finalConfig.bladeCount; j++) {
        const angle = (j / finalConfig.bladeCount) * Math.PI * 2;
        const offset = this.randomRange(0, finalConfig.width * 0.5);
        
        dummy.position.set(
          x + Math.cos(angle) * offset,
          0,
          z + Math.sin(angle) * offset
        );
        
        dummy.rotation.set(
          this.randomRange(-0.1, 0.1),
          angle + this.randomRange(-0.2, 0.2),
          this.randomRange(-0.1, 0.1)
        );
        
        const scale = 0.8 + this.random() * 0.4;
        dummy.scale.setScalar(scale);
        
        dummy.updateMatrix();
        instancedMesh.setMatrixAt(instanceIndex++, dummy.matrix);
      }
    }

    instancedMesh.instanceMatrix.needsUpdate = true;

    // Clean up prototype
    prototype.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.geometry.dispose();
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach(m => m.dispose());
        } else {
          mesh.material.dispose();
        }
      }
    });

    return instancedMesh;
  }
}

export default SimplePlantFactory;
