import * as THREE from 'three';
import { NoiseUtils } from '../../utils/NoiseUtils';

/**
 * Configuration for grassland ecosystem generation
 */
export interface GrasslandConfig {
  /** Area size in meters */
  areaSize: number;
  /** Grass density (0-1) */
  density: number;
  /** Mix of grass species */
  speciesMix: {
    tallGrass: number;
    shortGrass: number;
    ornamentalGrass: number;
    wildflowers: number;
  };
  /** Height variation */
  heightVariation: number;
  /** Color variation */
  colorVariation: {
    green: THREE.Color;
    yellow: THREE.Color;
    brown: THREE.Color;
  };
  /** Seasonal tint */
  season: 'spring' | 'summer' | 'autumn' | 'winter';
  /** Wind animation enabled */
  enableWind: boolean;
  /** Include wildflowers */
  includeWildflowers: boolean;
}

/**
 * Generator for grassland ecosystems with mixed grass species and wildflowers
 */
export class GrasslandGenerator {
  private readonly defaultConfig: GrasslandConfig = {
    areaSize: 10,
    density: 0.7,
    speciesMix: {
      tallGrass: 0.4,
      shortGrass: 0.3,
      ornamentalGrass: 0.2,
      wildflowers: 0.1,
    },
    heightVariation: 0.3,
    colorVariation: {
      green: new THREE.Color(0x4a7c23),
      yellow: new THREE.Color(0xd4c94e),
      brown: new THREE.Color(0x8b7355),
    },
    season: 'summer',
    enableWind: true,
    includeWildflowers: true,
  };

  /**
   * Generate a grassland ecosystem using instanced rendering
   */
  public generate(config: Partial<GrasslandConfig> = {}): THREE.InstancedMesh[] {
    const finalConfig = { ...this.defaultConfig, ...config };
    const meshes: THREE.InstancedMesh[] = [];

    // Calculate total instance count based on density and area
    const baseCount = Math.floor(finalConfig.areaSize * finalConfig.areaSize * finalConfig.density * 10);
    
    // Create separate instanced meshes for different grass types
    const tallGrassCount = Math.floor(baseCount * finalConfig.speciesMix.tallGrass);
    const shortGrassCount = Math.floor(baseCount * finalConfig.speciesMix.shortGrass);
    const ornamentalCount = Math.floor(baseCount * finalConfig.speciesMix.ornamentalGrass);
    const flowerCount = finalConfig.includeWildflowers 
      ? Math.floor(baseCount * finalConfig.speciesMix.wildflowers) 
      : 0;

    // Generate tall grass instances
    if (tallGrassCount > 0) {
      const tallGrassMesh = this.createTallGrassInstances(tallGrassCount, finalConfig);
      meshes.push(tallGrassMesh);
    }

    // Generate short grass instances
    if (shortGrassCount > 0) {
      const shortGrassMesh = this.createShortGrassInstances(shortGrassCount, finalConfig);
      meshes.push(shortGrassMesh);
    }

    // Generate ornamental grass instances
    if (ornamentalCount > 0) {
      const ornamentalMesh = this.createOrnamentalGrassInstances(ornamentalCount, finalConfig);
      meshes.push(ornamentalMesh);
    }

    // Generate wildflower instances
    if (flowerCount > 0) {
      const flowerMeshes = this.createWildflowerInstances(flowerCount, finalConfig);
      meshes.push(...flowerMeshes);
    }

    return meshes;
  }

  /**
   * Create instanced tall grass
   */
  private createTallGrassInstances(count: number, config: GrasslandConfig): THREE.InstancedMesh {
    const geometry = this.createGrassBladeGeometry(0.15, 0.6, true);
    const material = new THREE.MeshStandardMaterial({
      color: this.getSeasonalColor(config, 'green'),
      roughness: 0.8,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    const dummy = new THREE.Object3D();
    const noiseScale = 0.05;

    for (let i = 0; i < count; i++) {
      // Position using noise for natural distribution
      const x = (Math.random() - 0.5) * config.areaSize;
      const z = (Math.random() - 0.5) * config.areaSize;
      const noiseValue = NoiseUtils.perlin2D(x * noiseScale, z * noiseScale);
      
      // Skip if noise indicates sparse area
      if (noiseValue < -0.3 && Math.random() > 0.5) continue;

      const y = 0;
      const scale = 0.8 + Math.random() * 0.4 + config.heightVariation * noiseValue;
      const rotation = Math.random() * Math.PI * 2;
      const tilt = (Math.random() - 0.5) * 0.3;

      dummy.position.set(x, y, z);
      dummy.scale.set(scale, scale, scale);
      dummy.rotation.set(tilt, rotation, 0);
      dummy.updateMatrix();

      mesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }

  /**
   * Create instanced short grass
   */
  private createShortGrassInstances(count: number, config: GrasslandConfig): THREE.InstancedMesh {
    const geometry = this.createGrassBladeGeometry(0.08, 0.25, false);
    const material = new THREE.MeshStandardMaterial({
      color: this.getSeasonalColor(config, 'green'),
      roughness: 0.7,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.InstancedMesh(geometry, material, count);
    const dummy = new THREE.Object3D();

    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * config.areaSize;
      const z = (Math.random() - 0.5) * config.areaSize;
      const scale = 0.6 + Math.random() * 0.3;
      const rotation = Math.random() * Math.PI * 2;

      dummy.position.set(x, 0, z);
      dummy.scale.set(scale, scale, scale);
      dummy.rotation.set(0, rotation, 0);
      dummy.updateMatrix();

      mesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }

  /**
   * Create instanced ornamental grass (feathery plumes)
   */
  private createOrnamentalGrassInstances(count: number, config: GrasslandConfig): THREE.InstancedMesh {
    const geometry = this.createOrnamentalGrassGeometry();
    const material = new THREE.MeshStandardMaterial({
      color: this.getSeasonalColor(config, 'yellow'),
      roughness: 0.6,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.InstancedMesh(geometry, material, count);
    const dummy = new THREE.Object3D();

    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * config.areaSize;
      const z = (Math.random() - 0.5) * config.areaSize;
      const scale = 0.7 + Math.random() * 0.4;
      const rotation = Math.random() * Math.PI * 2;

      dummy.position.set(x, 0, z);
      dummy.scale.set(scale, scale, scale);
      dummy.rotation.set(0, rotation, 0);
      dummy.updateMatrix();

      mesh.setMatrixAt(i, dummy.matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }

  /**
   * Create wildflower instances
   */
  private createWildflowerInstances(count: number, config: GrasslandConfig): THREE.InstancedMesh[] {
    const meshes: THREE.InstancedMesh[] = [];
    const flowerTypes = ['daisy', 'tulip', 'wildflower'];
    const colors = [0xffffff, 0xff69b4, 0xffff00, 0xff6347, 0x9370db];

    flowerTypes.forEach((type, index) => {
      const typeCount = Math.floor(count / flowerTypes.length);
      if (typeCount === 0) return;

      const geometry = this.createFlowerGeometry(type);
      const color = colors[index % colors.length];
      const material = new THREE.MeshStandardMaterial({
        color: color,
        roughness: 0.5,
        metalness: 0.0,
      });

      const mesh = new THREE.InstancedMesh(geometry, material, typeCount);
      const dummy = new THREE.Object3D();

      for (let i = 0; i < typeCount; i++) {
        const x = (Math.random() - 0.5) * config.areaSize;
        const z = (Math.random() - 0.5) * config.areaSize;
        const scale = 0.5 + Math.random() * 0.3;
        const rotation = Math.random() * Math.PI * 2;
        const stemHeight = 0.05 + Math.random() * 0.05;

        dummy.position.set(x, stemHeight, z);
        dummy.scale.set(scale, scale, scale);
        dummy.rotation.set(0, rotation, 0);
        dummy.updateMatrix();

        mesh.setMatrixAt(i, dummy.matrix);
      }

      mesh.instanceMatrix.needsUpdate = true;
      meshes.push(mesh);
    });

    return meshes;
  }

  /**
   * Create a single grass blade geometry
   */
  private createGrassBladeGeometry(width: number, height: number, curved: boolean): THREE.BufferGeometry {
    const segments = curved ? 5 : 1;
    const geometry = new THREE.PlaneGeometry(width, height, 1, segments);

    if (curved) {
      const positions = geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < positions.length; i += 3) {
        const y = positions[i + 1];
        const t = y / height;
        // Add curve to the blade
        positions[i] += Math.sin(t * Math.PI) * width * 0.3;
        positions[i + 2] += (Math.random() - 0.5) * width * 0.1;
      }
      geometry.attributes.position.needsUpdate = true;
    }

    geometry.computeVertexNormals();
    return geometry;
  }

  /**
   * Create ornamental grass geometry with feathery plume
   */
  private createOrnamentalGrassGeometry(): THREE.BufferGeometry {
    const group = new THREE.Group();

    // Stem
    const stemGeometry = new THREE.CylinderGeometry(0.01, 0.015, 0.4, 6);
    const stem = new THREE.Mesh(stemGeometry);
    stem.position.y = 0.2;
    group.add(stem);

    // Feathery plume at top
    const plumeCount = 8;
    for (let i = 0; i < plumeCount; i++) {
      const angle = (i / plumeCount) * Math.PI * 2;
      const plumeGeometry = new THREE.ConeGeometry(0.02, 0.15, 4);
      const plume = new THREE.Mesh(plumeGeometry);
      plume.position.y = 0.4;
      plume.position.x = Math.cos(angle) * 0.03;
      plume.position.z = Math.sin(angle) * 0.03;
      plume.rotation.x = Math.PI / 4;
      plume.rotation.y = -angle;
      group.add(plume);
    }

    // Convert to single geometry
    const mergedGeometry = this.mergeGroupGeometries(group);
    return mergedGeometry || new THREE.PlaneGeometry(0.1, 0.5);
  }

  /**
   * Create flower geometry
   */
  private createFlowerGeometry(type: string): THREE.BufferGeometry {
    switch (type) {
      case 'daisy':
        return this.createDaisyGeometry();
      case 'tulip':
        return this.createTulipGeometry();
      default:
        return this.createSimpleFlowerGeometry();
    }
  }

  private createDaisyGeometry(): THREE.BufferGeometry {
    const group = new THREE.Group();

    // Petals
    const petalCount = 8;
    const petalGeometry = new THREE.SphereGeometry(0.03, 8, 8);
    petalGeometry.scale(1, 0.3, 0.5);

    for (let i = 0; i < petalCount; i++) {
      const angle = (i / petalCount) * Math.PI * 2;
      const petal = new THREE.Mesh(petalGeometry);
      petal.position.x = Math.cos(angle) * 0.04;
      petal.position.z = Math.sin(angle) * 0.04;
      petal.rotation.y = -angle;
      group.add(petal);
    }

    // Center
    const centerGeometry = new THREE.SphereGeometry(0.025, 8, 8);
    const center = new THREE.Mesh(centerGeometry);
    group.add(center);

    return this.mergeGroupGeometries(group) || new THREE.SphereGeometry(0.05);
  }

  private createTulipGeometry(): THREE.BufferGeometry {
    const geometry = new THREE.SphereGeometry(0.03, 8, 8);
    geometry.scale(0.8, 1.2, 0.8);
    return geometry;
  }

  private createSimpleFlowerGeometry(): THREE.BufferGeometry {
    return new THREE.SphereGeometry(0.03, 8, 8);
  }

  /**
   * Merge geometries from a group
   */
  private mergeGroupGeometries(group: THREE.Group): THREE.BufferGeometry | null {
    // Simplified merge - in production would use BufferGeometryUtils
    const geometries: THREE.BufferGeometry[] = [];
    group.traverse((child) => {
      if (child instanceof THREE.Mesh && child.geometry) {
        geometries.push(child.geometry.clone());
      }
    });

    if (geometries.length === 0) return null;
    if (geometries.length === 1) return geometries[0];

    // For simplicity, return first geometry
    // In production, use THREE.BufferGeometryUtils.mergeBufferGeometries
    return geometries[0];
  }

  /**
   * Get seasonal color adjustment
   */
  private getSeasonalColor(config: GrasslandConfig, baseType: string): THREE.Color {
    const baseColor = config.colorVariation[baseType as keyof typeof config.colorVariation] || config.colorVariation.green;
    const color = baseColor.clone();

    switch (config.season) {
      case 'spring':
        color.lerp(new THREE.Color(0x6b8e23), 0.3);
        break;
      case 'summer':
        // Keep base color
        break;
      case 'autumn':
        color.lerp(config.colorVariation.yellow, 0.4);
        color.lerp(config.colorVariation.brown, 0.2);
        break;
      case 'winter':
        color.lerp(new THREE.Color(0x8b8b7a), 0.5);
        break;
    }

    // Add variation
    const variation = (Math.random() - 0.5) * 0.1;
    color.r += variation;
    color.g += variation;
    color.b += variation;

    return color;
  }

  /**
   * Update wind animation for all grass instances
   */
  public updateWind(meshes: THREE.InstancedMesh[], time: number, windStrength: number = 0.5): void {
    if (!meshes || meshes.length === 0) return;

    const dummy = new THREE.Object3D();

    meshes.forEach((mesh) => {
      const count = mesh.count;
      for (let i = 0; i < count; i++) {
        mesh.getMatrixAt(i, dummy.matrix);
        dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);

        // Apply wind-based rotation
        const windAngle = Math.sin(time * 2 + dummy.position.x * 0.5) * windStrength * 0.1;
        dummy.rotation.x = windAngle;

        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    });
  }
}
