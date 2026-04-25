import * as THREE from 'three';
import { NoiseUtils } from '../../../utils/NoiseUtils';

/**
 * Configuration for gravel generation
 */
export interface GravelConfig {
  sizeMin: number;
  sizeMax: number;
  count: number;
  spreadArea: { width: number; depth: number };
  colorBase: THREE.Color;
  colorVariation: THREE.Color;
  density: number;
  includeMixedSizes: boolean;
}

/**
 * Generates gravel particles for ground cover
 * Optimized for instanced rendering of many small stones
 */
export class GravelGenerator {
  private noiseUtils: NoiseUtils;
  private materialCache: Map<string, THREE.MeshStandardMaterial>;

  constructor() {
    this.noiseUtils = new NoiseUtils();
    this.materialCache = new Map();
  }

  /**
   * Generate instanced gravel mesh for large quantities
   */
  generateGravelInstanced(config: Partial<GravelConfig> = {}): THREE.InstancedMesh {
    const finalConfig: GravelConfig = {
      sizeMin: 0.05,
      sizeMax: 0.15,
      count: 500,
      spreadArea: { width: 10, depth: 10 },
      colorBase: new THREE.Color(0x999999),
      colorVariation: new THREE.Color(0x777777),
      density: 0.8,
      includeMixedSizes: true,
      ...config,
    };

    // Create base geometry for a single gravel piece
    const baseGeometry = this.createGravelGeometry(
      (finalConfig.sizeMin + finalConfig.sizeMax) / 2
    );

    // Create material
    const material = this.getGravelMaterial(finalConfig);

    // Create instanced mesh
    const instancedMesh = new THREE.InstancedMesh(
      baseGeometry,
      material,
      finalConfig.count
    );

    // Position instances
    const dummy = new THREE.Object3D();
    let instanceIndex = 0;

    for (let i = 0; i < finalConfig.count && instanceIndex < finalConfig.count; i++) {
      const x = (Math.random() - 0.5) * finalConfig.spreadArea.width;
      const z = (Math.random() - 0.5) * finalConfig.spreadArea.depth;
      
      // Skip based on density
      if (Math.random() > finalConfig.density) continue;

      const size = finalConfig.includeMixedSizes
        ? finalConfig.sizeMin + Math.random() * (finalConfig.sizeMax - finalConfig.sizeMin)
        : (finalConfig.sizeMin + finalConfig.sizeMax) / 2;

      dummy.position.set(x, 0, z);
      dummy.scale.set(size, size, size);
      dummy.rotation.set(
        Math.random() * Math.PI,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI
      );
      dummy.updateMatrix();

      instancedMesh.setMatrixAt(instanceIndex++, dummy.matrix);
    }

    instancedMesh.instanceMatrix.needsUpdate = true;
    return instancedMesh;
  }

  /**
   * Generate gravel path or trail
   */
  generateGravelPath(config: Partial<GravelConfig> & { 
    pathWidth: number; 
    pathLength: number;
    curvature?: number;
  }): THREE.InstancedMesh {
    const pathConfig: GravelConfig & { 
      pathWidth: number; 
      pathLength: number;
      curvature: number;
    } = {
      sizeMin: 0.04,
      sizeMax: 0.12,
      count: 800,
      spreadArea: { width: 0, depth: 0 }, // Not used for paths
      colorBase: new THREE.Color(0xaaaaaa),
      colorVariation: new THREE.Color(0x888888),
      density: 0.9,
      includeMixedSizes: true,
      pathWidth: 2,
      pathLength: 20,
      curvature: 0,
      ...config,
    };

    const baseGeometry = this.createGravelGeometry(0.08);
    const material = this.getGravelMaterial(pathConfig);
    
    const instancedMesh = new THREE.InstancedMesh(baseGeometry, material, pathConfig.count);
    const dummy = new THREE.Object3D();
    let instanceIndex = 0;

    for (let i = 0; i < pathConfig.count && instanceIndex < pathConfig.count; i++) {
      // Position along path length
      const t = Math.random(); // 0 to 1 along path
      const alongPath = t * pathConfig.pathLength - pathConfig.pathLength / 2;
      
      // Apply curvature if specified
      const curveOffset = pathConfig.curvature !== 0 
        ? Math.sin(t * Math.PI) * pathConfig.curvature 
        : 0;

      // Width distribution (more dense in center)
      const widthOffset = (Math.random() - 0.5) * pathConfig.pathWidth * 
                         (0.5 + 0.5 * Math.cos(Math.random() * Math.PI));

      const x = widthOffset;
      const z = alongPath + curveOffset;

      const size = pathConfig.sizeMin + Math.random() * (pathConfig.sizeMax - pathConfig.sizeMin);

      dummy.position.set(x, 0, z);
      dummy.scale.set(size, size * 0.6, size); // Flatter for path gravel
      dummy.rotation.set(
        Math.random() * 0.3, // Slight tilt
        Math.random() * Math.PI * 2,
        Math.random() * 0.3
      );
      dummy.updateMatrix();

      instancedMesh.setMatrixAt(instanceIndex++, dummy.matrix);
    }

    instancedMesh.instanceMatrix.needsUpdate = true;
    return instancedMesh;
  }

  /**
   * Create simple gravel geometry
   */
  private createGravelGeometry(size: number): THREE.BufferGeometry {
    // Use octahedron for low-poly gravel look
    const geometry = new THREE.OctahedronGeometry(size, 0);
    
    // Add slight vertex displacement for variety
    const positions = geometry.attributes.position.array as Float32Array;
    
    for (let i = 0; i < positions.length; i += 3) {
      const variation = 0.85 + Math.random() * 0.3;
      positions[i] *= variation;
      positions[i + 1] *= variation * 0.7; // Flatter
      positions[i + 2] *= variation;
    }
    
    geometry.computeVertexNormals();
    return geometry;
  }

  /**
   * Get or create gravel material
   */
  private getGravelMaterial(config: GravelConfig): THREE.MeshStandardMaterial {
    const cacheKey = `gravel-${config.colorBase.getHex()}-${config.sizeMax}`;
    
    if (this.materialCache.has(cacheKey)) {
      return this.materialCache.get(cacheKey)!;
    }

    const material = new THREE.MeshStandardMaterial({
      color: config.colorBase.clone(),
      roughness: 0.9,
      metalness: 0.05,
      flatShading: true,
    });

    this.materialCache.set(cacheKey, material);
    return material;
  }

  /**
   * Generate decorative gravel borders
   */
  generateGravelBorder(config: {
    innerRadius: number;
    outerRadius: number;
    arcAngle?: number; // Full circle if not specified
    segmentCount?: number;
  }): THREE.Group {
    const {
      innerRadius,
      outerRadius,
      arcAngle = Math.PI * 2,
      segmentCount = 20,
    } = config;

    const group = new THREE.Group();
    const radius = (innerRadius + outerRadius) / 2;
    const width = outerRadius - innerRadius;

    for (let i = 0; i < segmentCount; i++) {
      const angle = (i / segmentCount) * arcAngle;
      const segmentArc = arcAngle / segmentCount;

      const gravelCluster = this.generateGravelInstanced({
        count: 50,
        spreadArea: { 
          width: width * 0.8, 
          depth: radius * segmentArc * 0.8 
        },
        sizeMin: 0.06,
        sizeMax: 0.14,
      });

      gravelCluster.position.set(
        Math.cos(angle) * radius,
        0,
        Math.sin(angle) * radius
      );
      gravelCluster.rotation.y = -angle;

      group.add(gravelCluster);
    }

    return group;
  }

  /**
   * Clear material cache
   */
  dispose(): void {
    this.materialCache.forEach((material) => material.dispose());
    this.materialCache.clear();
  }
}
