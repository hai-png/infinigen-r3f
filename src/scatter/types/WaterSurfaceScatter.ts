/**
 * WaterSurfaceScatter
 * Scatters floating objects on water surfaces (lily pads, leaves, debris)
 */

import {
  InstancedMesh,
  Matrix4,
  Vector3,
  Color,
  MeshStandardMaterial,
  PlaneGeometry,
  CircleGeometry,
  Group,
} from 'three';
import type { ScatterParams, ScatterResult } from './types';

export interface WaterSurfaceScatterParams extends ScatterParams {
  /** Number of floating objects (default: 20) */
  count?: number;
  /** Types of objects to scatter (default: ['lilypad', 'leaf']) */
  objectTypes?: ('lilypad' | 'leaf' | 'flower' | 'twig' | 'debris')[];
  /** Size scale of objects (default: 1.0) */
  scale?: number;
  /** Scale variation (default: 0.4) */
  scaleVariation?: number;
  /** Minimum distance between objects (default: 0.5) */
  minDistance?: number;
  /** Rotation randomness (default: Math.PI) */
  rotationRandomness?: number;
  /** Buoyancy animation amplitude (default: 0.05) */
  buoyancyAmplitude?: number;
  /** Buoyancy animation speed (default: 1.0) */
  buoyancySpeed?: number;
  /** Cluster tendency 0-1 (default: 0.3) */
  clusterFactor?: number;
  /** Boundary margin from surface edge (default: 0.5) */
  boundaryMargin?: number;
}

interface FloatingObject {
  position: Vector3;
  rotation: number;
  scale: number;
  type: string;
  buoyancyOffset: number;
  buoyancyPhase: number;
}

export class WaterSurfaceScatter {
  private params: Required<WaterSurfaceScatterParams>;

  constructor(params: WaterSurfaceScatterParams = {}) {
    this.params = {
      count: params.count ?? 20,
      objectTypes: params.objectTypes ?? ['lilypad', 'leaf'],
      scale: params.scale ?? 1.0,
      scaleVariation: params.scaleVariation ?? 0.4,
      minDistance: params.minDistance ?? 0.5,
      rotationRandomness: params.rotationRandomness ?? Math.PI,
      buoyancyAmplitude: params.buoyancyAmplitude ?? 0.05,
      buoyancySpeed: params.buoyancySpeed ?? 1.0,
      clusterFactor: params.clusterFactor ?? 0.3,
      boundaryMargin: params.boundaryMargin ?? 0.5,
      ...params,
    };
  }

  /**
   * Apply water surface scatter to a water mesh
   */
  async apply(waterMesh: any): Promise<ScatterResult> {
    const objects: FloatingObject[] = [];
    const boundingBox = new Vector3();
    
    // Get water surface bounds
    if (waterMesh.geometry.boundingBox) {
      waterMesh.geometry.boundingBox.getSize(boundingBox);
    } else {
      waterMesh.geometry.computeBoundingBox();
      waterMesh.geometry.boundingBox!.getSize(boundingBox);
    }

    const surfaceWidth = boundingBox.x - this.params.boundaryMargin * 2;
    const surfaceDepth = boundingBox.z - this.params.boundaryMargin * 2;
    const centerX = boundingBox.x / 2;
    const centerZ = boundingBox.z / 2;

    // Generate floating objects with clustering
    let attempts = 0;
    const maxAttempts = this.params.count * 50;
    const clusterCenters: Vector3[] = [];

    // Create cluster centers if clustering is enabled
    if (this.params.clusterFactor > 0) {
      const numClusters = Math.max(1, Math.floor(this.params.count * 0.3));
      for (let i = 0; i < numClusters; i++) {
        clusterCenters.push(
          new Vector3(
            centerX + (Math.random() - 0.5) * surfaceWidth * 0.6,
            0,
            centerZ + (Math.random() - 0.5) * surfaceDepth * 0.6
          )
        );
      }
    }

    while (objects.length < this.params.count && attempts < maxAttempts) {
      attempts++;

      let x: number, z: number;

      // Decide whether to place near cluster or randomly
      if (clusterCenters.length > 0 && Math.random() < this.params.clusterFactor) {
        const cluster = clusterCenters[Math.floor(Math.random() * clusterCenters.length)];
        const clusterRadius = Math.min(surfaceWidth, surfaceDepth) * 0.15;
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * clusterRadius;
        x = cluster.x + Math.cos(angle) * radius;
        z = cluster.z + Math.sin(angle) * radius;
      } else {
        x = centerX + (Math.random() - 0.5) * surfaceWidth;
        z = centerZ + (Math.random() - 0.5) * surfaceDepth;
      }

      const position = new Vector3(x, 0, z);

      // Check minimum distance
      const tooClose = objects.some((obj) => {
        const dx = obj.position.x - position.x;
        const dz = obj.position.z - position.z;
        return Math.sqrt(dx * dx + dz * dz) < this.params.minDistance;
      });

      if (!tooClose) {
        const objectType =
          this.params.objectTypes[Math.floor(Math.random() * this.params.objectTypes.length)];
        const scale =
          this.params.scale * (1 + (Math.random() - 0.5) * this.params.scaleVariation);
        const rotation = Math.random() * this.params.rotationRandomness;

        objects.push({
          position,
          rotation,
          scale,
          type: objectType,
          buoyancyOffset: Math.random() * Math.PI * 2,
          buoyancyPhase: Math.random() * Math.PI * 2,
        });
      }
    }

    // Create instanced meshes for each object type
    const scatterGroup = new Group();
    const materialMap = new Map<string, MeshStandardMaterial>();

    for (const objectType of this.params.objectTypes) {
      const typeObjects = objects.filter((obj) => obj.type === objectType);
      if (typeObjects.length === 0) continue;

      const geometry = this.createGeometryForType(objectType);
      
      if (!materialMap.has(objectType)) {
        materialMap.set(objectType, this.createMaterialForType(objectType));
      }
      const material = materialMap.get(objectType)!;

      const mesh = new InstancedMesh(geometry, material, typeObjects.length);
      mesh.instanceMatrix.setUsage(3); // DynamicDrawUsage

      const matrix = new Matrix4();
      const color = new Color();

      typeObjects.forEach((obj, index) => {
        matrix.makeScale(obj.scale, 0.01, obj.scale);
        matrix.setPosition(obj.position);
        mesh.setMatrixAt(index, matrix);

        // Slight color variation
        color.setHex(0xffffff);
        color.offsetHSL(0, 0, (Math.random() - 0.5) * 0.1);
        mesh.setColorAt(index, color);
      });

      mesh.userData.isFloatingObject = true;
      mesh.userData.buoyancyData = {
        amplitude: this.params.buoyancyAmplitude,
        speed: this.params.buoyancySpeed,
        objects: typeObjects.map((obj) => ({
          offset: obj.buoyancyOffset,
          phase: obj.buoyancyPhase,
        })),
      };

      scatterGroup.add(mesh);
    }

    // Store metadata
    const metadata = {
      count: objects.length,
      objectTypes: this.params.objectTypes,
      surfaceArea: surfaceWidth * surfaceDepth,
      density: objects.length / (surfaceWidth * surfaceDepth),
    };

    return {
      scatterObject: scatterGroup,
      instances: objects.map((obj) => ({
        position: obj.position.clone(),
        rotation: obj.rotation,
        scale: obj.scale,
        metadata: { type: obj.type },
      })),
      metadata,
    };
  }

  /**
   * Update buoyancy animation for floating objects
   */
  updateBuoyancy(scatterObject: Group, time: number): void {
    scatterObject.traverse((child: any) => {
      if (child.isInstancedMesh && child.userData.isFloatingObject) {
        const data = child.userData.buoyancyData;
        const amplitude = data.amplitude;
        const speed = data.speed;

        data.objects.forEach((obj: any, index: number) => {
          const y = Math.sin(time * speed + obj.phase) * amplitude;
          const matrix = new Matrix4();
          child.getMatrixAt(index, matrix);
          
          const position = new Vector3();
          position.setFromMatrixPosition(matrix);
          position.y = y;
          
          matrix.setPosition(position);
          child.setMatrixAt(index, matrix);
        });

        child.instanceMatrix.needsUpdate = true;
      }
    });
  }

  private createGeometryForType(type: string) {
    switch (type) {
      case 'lilypad':
        return new CircleGeometry(0.3, 8);
      case 'leaf':
        return this.createLeafGeometry();
      case 'flower':
        return this.createFlowerGeometry();
      case 'twig':
        return this.createTwigGeometry();
      case 'debris':
        return new PlaneGeometry(0.2, 0.1, 1, 1);
      default:
        return new CircleGeometry(0.2, 6);
    }
  }

  private createLeafGeometry() {
    const shape = new (require('three').Shape)();
    shape.moveTo(0, 0);
    shape.quadraticCurveTo(0.15, 0.1, 0.3, 0);
    shape.quadraticCurveTo(0.15, -0.1, 0, 0);
    return new (require('three').ExtrudeGeometry)(shape, { depth: 0.01, bevelEnabled: false });
  }

  private createFlowerGeometry() {
    const group = new Group();
    const petalGeometry = new CircleGeometry(0.1, 6);
    for (let i = 0; i < 5; i++) {
      const petal = new InstancedMesh(petalGeometry, new MeshStandardMaterial(), 1);
      const matrix = new Matrix4();
      const angle = (i / 5) * Math.PI * 2;
      matrix.makeRotationZ(angle);
      matrix.setPosition(Math.cos(angle) * 0.15, 0, Math.sin(angle) * 0.15);
      petal.setMatrixAt(0, matrix);
      group.add(petal);
    }
    return group;
  }

  private createTwigGeometry() {
    return new (require('three').CylinderGeometry)(0.02, 0.03, 0.4, 6);
  }

  private createMaterialForType(type: string) {
    switch (type) {
      case 'lilypad':
        return new MeshStandardMaterial({
          color: 0x2d5a27,
          side: 2, // DoubleSide
          roughness: 0.8,
          metalness: 0.0,
        });
      case 'leaf':
        return new MeshStandardMaterial({
          color: 0x3d6b35,
          side: 2,
          roughness: 0.7,
          metalness: 0.0,
        });
      case 'flower':
        return new MeshStandardMaterial({
          color: 0xff69b4,
          side: 2,
          roughness: 0.6,
          metalness: 0.0,
        });
      case 'twig':
        return new MeshStandardMaterial({
          color: 0x8b6f47,
          roughness: 0.9,
          metalness: 0.0,
        });
      case 'debris':
        return new MeshStandardMaterial({
          color: 0x654321,
          side: 2,
          roughness: 0.95,
          metalness: 0.0,
        });
      default:
        return new MeshStandardMaterial({
          color: 0x888888,
          side: 2,
          roughness: 0.8,
          metalness: 0.0,
        });
    }
  }
}
