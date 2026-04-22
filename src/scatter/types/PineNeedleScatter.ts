/**
 * Pine Needle Scatter System
 * Distributes pine needle clusters across forest floors, especially under coniferous trees
 */

import * as THREE from 'three';
import type { ScatterParams, ScatterResult, ScatterInstance } from './types';

export interface PineNeedleScatterParams extends ScatterParams {
  /** Number of needle clusters to generate (default: 200) */
  count?: number;
  /** Base scale for needle clusters (default: 0.03) */
  baseScale?: number;
  /** Scale variation (default: 0.4) */
  scaleVariation?: number;
  /** Pine species affecting needle color and length (default: 'pine') */
  species?: 'pine' | 'spruce' | 'fir' | 'cedar';
  /** Needle freshness: 0=fresh green, 1=old brown (default: 0.3) */
  decayState?: number;
  /** Cluster density multiplier (default: 1.0) */
  densityMultiplier?: number;
  /** Minimum distance between clusters (default: 0.15) */
  minDistance?: number;
  /** Whether to align clusters to surface normal (default: true) */
  alignToNormal?: boolean;
  /** Wind animation strength (default: 0.0) */
  windStrength?: number;
}

interface PineNeedleCluster {
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: THREE.Vector3;
  color: THREE.Color;
  freshness: number;
}

export class PineNeedleScatter implements ScatterInstance<PineNeedleScatterParams> {
  readonly type = 'pineNeedle';
  
  private params: Required<PineNeedleScatterParams>;
  private clusterGeometry: THREE.InstancedBufferGeometry;
  private material: THREE.ShaderMaterial;
  
  constructor(params: PineNeedleScatterParams = {}) {
    this.params = {
      count: 200,
      baseScale: 0.03,
      scaleVariation: 0.4,
      species: 'pine',
      decayState: 0.3,
      densityMultiplier: 1.0,
      minDistance: 0.15,
      alignToNormal: true,
      windStrength: 0.0,
      ...params,
    };
    
    this.clusterGeometry = this.createClusterGeometry();
    this.material = this.createMaterial();
  }
  
  private createClusterGeometry(): THREE.InstancedBufferGeometry {
    // Create a fan-shaped cluster of needles
    const needleCount = 8;
    const geometries: THREE.BufferGeometry[] = [];
    
    for (let i = 0; i < needleCount; i++) {
      const angle = (i / needleCount) * Math.PI - Math.PI / 2;
      const length = 0.04 + Math.random() * 0.02;
      const width = 0.003;
      const thickness = 0.001;
      
      const geometry = new THREE.BoxGeometry(width, length, thickness);
      geometry.translate(0, length / 2, 0);
      geometry.rotateZ(angle * 0.5);
      
      geometries.push(geometry);
    }
    
    return new THREE.InstancedBufferGeometry().mergeGeometries(geometries);
  }
  
  private createMaterial(): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      vertexShader: `
        attribute vec3 color;
        attribute float freshness;
        varying vec3 vColor;
        varying float vFreshness;
        
        #ifdef USE_WIND
        uniform float time;
        uniform float windStrength;
        #endif
        
        void main() {
          vColor = color;
          vFreshness = freshness;
          
          vec3 transformed = position;
          
          #ifdef USE_WIND
          float wind = sin(time * 2.0 + position.y * 10.0) * windStrength * 0.02;
          transformed.x += wind * (1.0 - position.y / 0.05);
          #endif
          
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(transformed, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        varying float vFreshness;
        
        void main() {
          vec3 color = vColor;
          
          // Add slight translucency effect based on freshness
          float alpha = 0.85 + vFreshness * 0.15;
          
          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      uniforms: {
        time: { value: 0 },
        windStrength: { value: this.params.windStrength },
      },
    });
  }
  
  private getColorForSpecies(species: string, decayState: number): THREE.Color {
    const colors = {
      pine: {
        fresh: new THREE.Color(0x2d5a27),
        old: new THREE.Color(0x8b6f47),
      },
      spruce: {
        fresh: new THREE.Color(0x1e4d2b),
        old: new THREE.Color(0x7a5c3e),
      },
      fir: {
        fresh: new THREE.Color(0x355e3b),
        old: new THREE.Color(0x9c7a5a),
      },
      cedar: {
        fresh: new THREE.Color(0x4a6741),
        old: new THREE.Color(0xa68b6c),
      },
    };
    
    const speciesColors = colors[species as keyof typeof colors] || colors.pine;
    const color = speciesColors.fresh.clone().lerp(speciesColors.old, decayState);
    
    // Add slight variation
    color.r *= 0.9 + Math.random() * 0.2;
    color.g *= 0.9 + Math.random() * 0.2;
    color.b *= 0.9 + Math.random() * 0.2;
    
    return color;
  }
  
  async apply(surface: THREE.Object3D): Promise<ScatterResult> {
    const { count, baseScale, scaleVariation, species, decayState, 
            densityMultiplier, minDistance, alignToNormal, windStrength } = this.params;
    
    const clusters: PineNeedleCluster[] = [];
    const raycaster = new THREE.Raycaster();
    const down = new THREE.Vector3(0, -1, 0);
    
    // Generate cluster positions with minimum distance constraint
    const attempts = count * 3;
    const surfaceBox = new THREE.Box3().setFromObject(surface);
    const surfaceSize = new THREE.Vector3();
    surfaceBox.getSize(surfaceSize);
    
    for (let i = 0; i < attempts && clusters.length < count; i++) {
      const x = (Math.random() - 0.5) * surfaceSize.x * densityMultiplier;
      const z = (Math.random() - 0.5) * surfaceSize.z * densityMultiplier;
      const testPos = new THREE.Vector3(x, surfaceBox.max.y + 1, z);
      
      raycaster.set(testPos, down);
      const intersects = raycaster.intersectObject(surface, true);
      
      if (intersects.length > 0) {
        const hit = intersects[0];
        const position = hit.point.clone();
        
        // Check minimum distance
        let tooClose = false;
        for (const cluster of clusters) {
          if (position.distanceTo(cluster.position) < minDistance) {
            tooClose = true;
            break;
          }
        }
        
        if (!tooClose) {
          const rotation = alignToNormal 
            ? new THREE.Euler().setFromQuaternion(hit.face?.normal ? 
                new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), hit.face!.normal) : 
                new THREE.Quaternion())
            : new THREE.Euler(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, 0);
          
          const scaleVar = 1 + (Math.random() - 0.5) * scaleVariation;
          const scale = new THREE.Vector3(baseScale * scaleVar, baseScale * scaleVar, baseScale * scaleVar);
          
          clusters.push({
            position,
            rotation,
            scale,
            color: this.getColorForSpecies(species, decayState),
            freshness: 1 - decayState,
          });
        }
      }
    }
    
    // Create instanced mesh
    const mesh = new THREE.InstancedMesh(
      this.clusterGeometry,
      this.material,
      clusters.length
    );
    
    const dummy = new THREE.Object3D();
    const colorAttr = new Float32Array(clusters.length * 3);
    const freshnessAttr = new Float32Array(clusters.length);
    
    clusters.forEach((cluster, i) => {
      dummy.position.copy(cluster.position);
      dummy.rotation.copy(cluster.rotation);
      dummy.scale.copy(cluster.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      
      colorAttr[i * 3] = cluster.color.r;
      colorAttr[i * 3 + 1] = cluster.color.g;
      colorAttr[i * 3 + 2] = cluster.color.b;
      
      freshnessAttr[i] = cluster.freshness;
    });
    
    this.clusterGeometry.setAttribute('color', new THREE.InstancedBufferAttribute(colorAttr, 3));
    this.clusterGeometry.setAttribute('freshness', new THREE.InstancedBufferAttribute(freshnessAttr, 1));
    
    // Enable wind animation if requested
    if (windStrength > 0) {
      this.material.defines = { ...this.material.defines, USE_WIND: true };
      this.material.uniforms.windStrength.value = windStrength;
      this.material.needsUpdate = true;
    }
    
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = `PineNeedles_${species}`;
    
    return {
      scatterObject: mesh,
      instances: clusters.map(c => ({
        position: c.position,
        rotation: c.rotation,
        scale: c.scale,
      })),
      metadata: {
        count: clusters.length,
        species,
        decayState,
        boundingBox: new THREE.Box3().setFromObject(mesh),
      },
    };
  }
  
  update(time: number) {
    if (this.params.windStrength > 0 && this.material.uniforms.time) {
      this.material.uniforms.time.value = time;
    }
  }
}

export type { PineNeedleScatterParams };
