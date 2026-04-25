import * as THREE from 'three';
import { NoiseUtils } from '../../../utils/NoiseUtils';

/**
 * Leaf litter types for seasonal ground cover
 */
export enum LeafType {
  OAK = 'oak',
  MAPLE = 'maple',
  BIRCH = 'birch',
  PINE = 'pine',
  MIXED = 'mixed'
}

/**
 * Decomposition states for realistic leaf aging
 */
export enum DecompositionState {
  FRESH = 'fresh',      // Recently fallen, vibrant colors
  DRYING = 'drying',    // Losing moisture, curling edges
  DECAYING = 'decaying', // Brown, breaking down
  HUMUS = 'humus'       // Nearly decomposed, dark
}

export interface LeafLitterConfig {
  leafType: LeafType;
  density: number;           // leaves per square meter
  area: THREE.Vector2;       // coverage area
  decompositionState: DecompositionState;
  colorVariation: boolean;
  windDirection?: THREE.Vector3;
  clusterSize?: number;      // average cluster size
  layerDepth?: number;       // stacking depth
}

/**
 * Generates realistic leaf litter for forest floors and gardens
 */
export class LeafLitterGenerator {
  private static readonly LEAF_SHAPES: Record<LeafType, number[][]> = {
    [LeafType.OAK]: [
      [0, 0.3], [0.2, 0.5], [0.4, 0.6], [0.6, 0.5], [0.8, 0.3],
      [1, 0], [0.8, -0.2], [0.6, -0.3], [0.4, -0.2], [0.2, -0.3]
    ],
    [LeafType.MAPLE]: [
      [0, 0.5], [0.3, 0.7], [0.5, 0.9], [0.7, 0.7], [1, 0.5],
      [0.7, 0.3], [0.5, 0.1], [0.3, 0.3], [0, 0.5], [-0.3, 0.3],
      [-0.5, 0.1], [-0.7, 0.3], [-1, 0.5], [-0.7, 0.7], [-0.5, 0.9], [-0.3, 0.7]
    ],
    [LeafType.BIRCH]: [
      [0, 0.4], [0.3, 0.6], [0.6, 0.4], [1, 0], [0.6, -0.4],
      [0.3, -0.6], [0, -0.4], [-0.3, -0.6], [-0.6, -0.4], [-1, 0], [-0.6, 0.4], [-0.3, 0.6]
    ],
    [LeafType.PINE]: [[0, 0.05], [0.8, 0], [0, -0.05], [-0.8, 0]],
    [LeafType.MIXED]: []
  };

  private static readonly COLORS: Record<DecompositionState, THREE.Color[]> = {
    [DecompositionState.FRESH]: [
      new THREE.Color(0x4a7c23), new THREE.Color(0x5c8a30),
      new THREE.Color(0x6b9b3f), new THREE.Color(0x3d6b1f)
    ],
    [DecompositionState.DRYING]: [
      new THREE.Color(0xc4a35a), new THREE.Color(0xd4b06a),
      new THREE.Color(0xe0c080), new THREE.Color(0xb89040)
    ],
    [DecompositionState.DECAYING]: [
      new THREE.Color(0x8b6f47), new THREE.Color(0x6b5437),
      new THREE.Color(0x5a4630), new THREE.Color(0x4a3a28)
    ],
    [DecompositionState.HUMUS]: [
      new THREE.Color(0x3d2f22), new THREE.Color(0x2f2419),
      new THREE.Color(0x241b13), new THREE.Color(0x1a1410)
    ]
  };

  /**
   * Generate leaf litter mesh with instanced rendering
   */
  static generate(config: LeafLitterConfig): THREE.InstancedMesh {
    const leafCount = Math.floor(config.density * config.area.x * config.area.y);
    const geometry = this.createLeafGeometry(config.leafType);
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9
    });

    const mesh = new THREE.InstancedMesh(geometry, material, leafCount);
    const dummy = new THREE.Object3D();
    const colors = LeafLitterGenerator.COLORS[config.decompositionState];

    for (let i = 0; i < leafCount; i++) {
      const x = (Math.random() - 0.5) * config.area.x;
      const z = (Math.random() - 0.5) * config.area.y;
      const y = this.calculateHeight(x, z, config.area);

      dummy.position.set(x, y, z);

      // Random rotation with slight bias from wind
      let rotationY = Math.random() * Math.PI * 2;
      if (config.windDirection) {
        const windInfluence = Math.atan2(config.windDirection.z, config.windDirection.x);
        rotationY = THREE.MathUtils.lerp(rotationY, windInfluence, 0.3);
      }
      dummy.rotation.set(
        (Math.random() - 0.5) * 0.3,
        rotationY,
        (Math.random() - 0.5) * 0.3
      );

      // Scale variation
      const scale = 0.8 + Math.random() * 0.4;
      dummy.scale.set(scale, scale, scale);

      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      // Color variation based on decomposition
      const colorIndex = Math.floor(Math.random() * colors.length);
      const color = colors[colorIndex].clone();
      if (config.colorVariation) {
        color.offsetHSL(0, 0, (Math.random() - 0.5) * 0.1);
      }
      mesh.setColorAt(i, color);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    return mesh;
  }

  /**
   * Create leaf geometry based on type
   */
  private static createLeafGeometry(leafType: LeafType): THREE.BufferGeometry {
    const shapePoints = this.LEAF_SHAPES[leafType] || this.LEAF_SHAPES[LeafType.OAK];
    
    if (leafType === LeafType.PINE) {
      // Pine needles are simple elongated shapes
      const geometry = new THREE.CylinderGeometry(0.02, 0.01, 0.3, 6);
      geometry.rotateX(Math.PI / 2);
      return geometry;
    }

    const shape = new THREE.Shape();
    shapePoints.forEach((point, index) => {
      if (index === 0) {
        shape.moveTo(point[0], point[1]);
      } else {
        shape.lineTo(point[0], point[1]);
      }
    });
    shape.closePath();

    // Add vein detail using noise
    const curveDivisions = 12;
    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
      depth: 0.02,
      bevelEnabled: true,
      bevelSegments: 2,
      bevelSize: 0.01,
      bevelThickness: 0.01
    };

    const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geometry.center();
    geometry.rotateX(-Math.PI / 2);

    // Add subtle curl using vertex displacement
    const positions = geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const z = positions[i + 2];
      const noise = NoiseUtils.perlin2D(x * 2, z * 2) * 0.02;
      positions[i + 1] += noise; // Y displacement for curl
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();

    return geometry;
  }

  /**
   * Calculate height based on terrain noise
   */
  private static calculateHeight(x: number, z: number, area: THREE.Vector2): number {
    const normalizedX = (x / area.x + 0.5) * 10;
    const normalizedZ = (z / area.y + 0.5) * 10;
    return NoiseUtils.perlin2D(normalizedX, normalizedZ) * 0.05;
  }

  /**
   * Generate clustered leaf piles
   */
  static generateClusters(config: LeafLitterConfig, clusterCount: number): THREE.Group {
    const group = new THREE.Group();
    const clusterSize = config.clusterSize || 50;

    for (let i = 0; i < clusterCount; i++) {
      const clusterConfig: LeafLitterConfig = {
        ...config,
        area: new THREE.Vector2(clusterSize * 0.1, clusterSize * 0.1),
        density: config.density * 2 // Higher density in clusters
      };

      const cluster = this.generate(clusterConfig);
      
      // Position cluster
      const x = (Math.random() - 0.5) * config.area.x * 0.8;
      const z = (Math.random() - 0.5) * config.area.y * 0.8;
      cluster.position.set(x, 0, z);
      
      group.add(cluster);
    }

    return group;
  }

  /**
   * Create multi-layer leaf litter for deep accumulation
   */
  static generateMultiLayer(config: LeafLitterConfig, layers: number): THREE.Group {
    const group = new THREE.Group();
    const layerDepth = config.layerDepth || 0.02;

    for (let i = 0; i < layers; i++) {
      const layerConfig: LeafLitterConfig = {
        ...config,
        decompositionState: this.getLayerDecomposition(i, layers)
      };

      const layer = this.generate(layerConfig);
      layer.position.y = i * layerDepth * 0.5;
      group.add(layer);
    }

    return group;
  }

  private static getLayerDecomposition(layerIndex: number, totalLayers: number): DecompositionState {
    const ratio = layerIndex / totalLayers;
    if (ratio < 0.25) return DecompositionState.FRESH;
    if (ratio < 0.5) return DecompositionState.DRYING;
    if (ratio < 0.75) return DecompositionState.DECAYING;
    return DecompositionState.HUMUS;
  }
}
