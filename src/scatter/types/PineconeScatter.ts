/**
 * Pinecone Scatter System
 * Distributes pinecones and cone debris on forest floors near coniferous trees
 */

import * as THREE from 'three';
import type { ScatterParams, ScatterResult, ScatterInstance } from './types';

export interface PineconeScatterParams extends ScatterParams {
  /** Number of pinecones to generate (default: 80) */
  count?: number;
  /** Base scale for pinecones (default: 0.04) */
  baseScale?: number;
  /** Scale variation (default: 0.5) */
  scaleVariation?: number;
  /** Cone type affecting shape and color (default: 'pine') */
  coneType?: 'pine' | 'spruce' | 'fir' | 'cedar';
  /** Openness: 0=closed, 1=open (default: 0.6) */
  openness?: number;
  /** Whether to include small cone scales/debris (default: true) */
  includeDebris?: boolean;
  /** Debris count multiplier (default: 3) */
  debrisMultiplier?: number;
  /** Minimum distance between cones (default: 0.2) */
  minDistance?: number;
  /** Cluster near trees (default: true) */
  clusterNearTrees?: boolean;
}

interface PineconeInstance {
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: THREE.Vector3;
  openness: number;
  hasDebris: boolean;
}

export class PineconeScatter implements ScatterInstance<PineconeScatterParams> {
  readonly type = 'pinecone';
  
  private params: Required<PineconeScatterParams>;
  private coneGeometry: THREE.BufferGeometry;
  private material: THREE.MeshStandardMaterial;
  private debrisGeometry?: THREE.BufferGeometry;
  
  constructor(params: PineconeScatterParams = {}) {
    this.params = {
      count: 80,
      baseScale: 0.04,
      scaleVariation: 0.5,
      coneType: 'pine',
      openness: 0.6,
      includeDebris: true,
      debrisMultiplier: 3,
      minDistance: 0.2,
      clusterNearTrees: true,
      ...params,
    };
    
    this.coneGeometry = this.createConeGeometry();
    this.material = new THREE.MeshStandardMaterial({
      color: 0x8b6f47,
      roughness: 0.9,
      metalness: 0.0,
    });
    
    if (this.params.includeDebris) {
      this.debrisGeometry = this.createDebrisGeometry();
    }
  }
  
  private createConeGeometry(): THREE.BufferGeometry {
    const { coneType, openness } = this.params;
    
    // Base cone shape varies by type
    const shapes = {
      pine: { height: 1.2, radius: 0.4, segments: 8 },
      spruce: { height: 0.8, radius: 0.25, segments: 6 },
      fir: { height: 1.0, radius: 0.35, segments: 7 },
      cedar: { height: 0.6, radius: 0.3, segments: 6 },
    };
    
    const shape = shapes[coneType];
    const geometry = new THREE.ConeGeometry(shape.radius, shape.height, shape.segments);
    
    // Add scale detail using vertex displacement
    const positions = geometry.attributes.position.array as Float32Array;
    const layers = 12;
    const layerHeight = shape.height / layers;
    
    for (let i = 0; i < positions.length; i += 3) {
      const y = positions[i + 1];
      const layer = Math.floor((y + shape.height / 2) / layerHeight);
      
      // Create scale pattern
      if (layer % 2 === 0) {
        const scale = 1.0 + openness * 0.3 * Math.sin(layer * 0.5);
        positions[i] *= scale;
        positions[i + 2] *= scale;
      }
    }
    
    geometry.computeVertexNormals();
    return geometry;
  }
  
  private createDebrisGeometry(): THREE.BufferGeometry {
    // Small cone scale fragments
    const geometries: THREE.BufferGeometry[] = [];
    
    for (let i = 0; i < 5; i++) {
      const size = 0.01 + Math.random() * 0.015;
      const geo = new THREE.BoxGeometry(size, size * 0.3, size * 0.5);
      geo.rotateY(Math.random() * Math.PI);
      geometries.push(geo);
    }
    
    return new THREE.BufferGeometry().mergeGeometries(geometries);
  }
  
  async apply(surface: THREE.Object3D): Promise<ScatterResult> {
    const { count, baseScale, scaleVariation, coneType, openness,
            includeDebris, debrisMultiplier, minDistance } = this.params;
    
    const instances: PineconeInstance[] = [];
    const raycaster = new THREE.Raycaster();
    const down = new THREE.Vector3(0, -1, 0);
    
    const surfaceBox = new THREE.Box3().setFromObject(surface);
    const surfaceSize = new THREE.Vector3();
    surfaceBox.getSize(surfaceSize);
    
    // Generate cone positions
    const attempts = count * 3;
    for (let i = 0; i < attempts && instances.length < count; i++) {
      const x = (Math.random() - 0.5) * surfaceSize.x;
      const z = (Math.random() - 0.5) * surfaceSize.z;
      const testPos = new THREE.Vector3(x, surfaceBox.max.y + 1, z);
      
      raycaster.set(testPos, down);
      const intersects = raycaster.intersectObject(surface, true);
      
      if (intersects.length > 0) {
        const hit = intersects[0];
        const position = hit.point.clone();
        
        // Check minimum distance
        let tooClose = false;
        for (const inst of instances) {
          if (position.distanceTo(inst.position) < minDistance) {
            tooClose = true;
            break;
          }
        }
        
        if (!tooClose) {
          // Natural orientation: mostly lying on side
          const rotX = Math.PI / 2 + (Math.random() - 0.5) * 0.5;
          const rotY = Math.random() * Math.PI * 2;
          const rotZ = (Math.random() - 0.5) * 0.3;
          
          const scaleVar = 1 + (Math.random() - 0.5) * scaleVariation;
          const scale = new THREE.Vector3(
            baseScale * scaleVar,
            baseScale * scaleVar,
            baseScale * scaleVar
          );
          
          instances.push({
            position,
            rotation: new THREE.Euler(rotX, rotY, rotZ),
            scale,
            openness: openness * (0.8 + Math.random() * 0.4),
            hasDebris: includeDebris && Math.random() > 0.3,
          });
        }
      }
    }
    
    // Create main cone mesh
    const coneMesh = new THREE.InstancedMesh(this.coneGeometry, this.material, instances.length);
    const dummy = new THREE.Object3D();
    
    instances.forEach((inst, i) => {
      dummy.position.copy(inst.position);
      dummy.rotation.copy(inst.rotation);
      dummy.scale.copy(inst.scale);
      dummy.updateMatrix();
      coneMesh.setMatrixAt(i, dummy.matrix);
    });
    
    coneMesh.castShadow = true;
    coneMesh.receiveShadow = true;
    coneMesh.name = `Pinecones_${coneType}`;
    
    // Create debris if enabled
    let debrisMesh: THREE.InstancedMesh | undefined;
    if (includeDebris && this.debrisGeometry && instances.some(i => i.hasDebris)) {
      const debrisCount = Math.floor(instances.filter(i => i.hasDebris).length * debrisMultiplier);
      debrisMesh = new THREE.InstancedMesh(this.debrisGeometry, this.material, debrisCount);
      
      let debrisIdx = 0;
      instances.forEach((inst) => {
        if (!inst.hasDebris || debrisIdx >= debrisCount) return;
        
        for (let d = 0; d < debrisMultiplier && debrisIdx < debrisCount; d++) {
          const offset = new THREE.Vector3(
            (Math.random() - 0.5) * 0.15,
            0,
            (Math.random() - 0.5) * 0.15
          );
          const debrisPos = inst.position.clone().add(offset);
          
          dummy.position.copy(debrisPos);
          dummy.rotation.set(
            Math.random() * Math.PI,
            Math.random() * Math.PI,
            Math.random() * Math.PI
          );
          const debrisScale = 0.5 + Math.random() * 0.5;
          dummy.scale.setScalar(debrisScale);
          dummy.updateMatrix();
          debrisMesh!.setMatrixAt(debrisIdx++, dummy.matrix);
        }
      });
      
      debrisMesh.castShadow = true;
      debrisMesh.receiveShadow = true;
      debrisMesh.name = `PineconeDebris_${coneType}`;
    }
    
    // Group results
    const group = new THREE.Group();
    group.add(coneMesh);
    if (debrisMesh) group.add(debrisMesh);
    group.name = `PineconeScatter_${coneType}`;
    
    return {
      scatterObject: group,
      instances: instances.map(i => ({
        position: i.position,
        rotation: i.rotation,
        scale: i.scale,
      })),
      metadata: {
        count: instances.length,
        coneType,
        openness,
        debrisCount: debrisMesh ? debrisMesh.count : 0,
        boundingBox: new THREE.Box3().setFromObject(group),
      },
    };
  }
}

export type { PineconeScatterParams };
