/**
 * Infinigen R3F Port - Fern Scatter Generator
 * Procedural fern scattering on terrain surfaces with wind effects
 * 
 * Based on original InfiniGen implementation from Princeton VL
 */

import * as THREE from 'three';
import { InstancedMesh } from 'three';
import { SimplexNoise } from '../util/MathUtils';

export interface FernInstance {
  position: THREE.Vector3;
  rotation: THREE.Quaternion;
  scale: THREE.Vector3;
  windOffset: number;
}

export interface FernScatterParams {
  density: number;
  minSpacing: number;
  baseScale: number;
  scaleRandomness: number;
  scaleRandomnessAxis: number;
  normalFactor: number;
  windStrength: number;
  moistureThreshold: number;
  shadePreference: number;
  coverage: number;
  seed?: number;
}

export class FernScatterGenerator {
  private noise: SimplexNoise;
  private params: FernScatterParams;

  constructor(params: Partial<FernScatterParams> = {}) {
    this.params = {
      density: 500, // instances per unit area
      minSpacing: 0.15,
      baseScale: 0.7,
      scaleRandomness: 0.7,
      scaleRandomnessAxis: 0.3,
      normalFactor: 0.3,
      windStrength: 10,
      moistureThreshold: 0.3,
      shadePreference: 0.4,
      coverage: 0.8,
      seed: Math.random() * 10000,
      ...params,
    };

    this.noise = new SimplexNoise(this.params.seed);
  }

  /**
   * Generate fern instances on terrain
   */
  generate(
    geometry: THREE.BufferGeometry,
    moistureMap?: THREE.DataTexture,
    shadeMap?: THREE.DataTexture
  ): FernInstance[] {
    const instances: FernInstance[] = [];
    const positions = geometry.attributes.position.array as Float32Array;
    const normals = geometry.attributes.normal?.array as Float32Array;
    
    if (!positions || positions.length === 0) {
      return instances;
    }

    const vertexCount = positions.length / 3;
    const validVertices: number[] = [];

    // Filter vertices based on environmental factors
    for (let i = 0; i < vertexCount; i++) {
      const idx = i * 3;
      const x = positions[idx];
      const y = positions[idx + 1];
      const z = positions[idx + 2];

      // Check slope - ferns prefer moderate slopes
      if (normals) {
        const nx = normals[idx];
        const ny = normals[idx + 1];
        const nz = normals[idx + 2];
        const slope = Math.sqrt(nx * nx + ny * ny);
        
        if (slope > 0.8) {
          continue;
        }
      }

      // Check moisture
      if (moistureMap) {
        const moisture = this.sampleTexture(moistureMap, x, z);
        if (moisture < this.params.moistureThreshold) {
          continue;
        }
      }

      // Check shade preference
      if (shadeMap) {
        const shade = this.sampleTexture(shadeMap, x, z);
        if (shade < this.params.shadePreference) {
          continue;
        }
      }

      // Apply coverage probability
      if (Math.random() > this.params.coverage) {
        continue;
      }

      validVertices.push(i);
    }

    // Calculate target instance count
    const boundingBox = new THREE.Box3();
    const tempVec = new THREE.Vector3();
    
    for (let i = 0; i < vertexCount; i++) {
      const idx = i * 3;
      tempVec.set(positions[idx], positions[idx + 1], positions[idx + 2]);
      boundingBox.expandByPoint(tempVec);
    }

    const size = new THREE.Vector3();
    boundingBox.getSize(size);
    const surfaceArea = size.x * size.z;
    const targetCount = Math.floor(surfaceArea * this.params.density / 100);
    const sampleCount = Math.min(targetCount, validVertices.length);

    // Sample fern instances
    const sampledIndices = this.reservoirSample(validVertices, sampleCount);

    // Enforce minimum spacing
    const selectedIndices = this.enforceMinSpacing(sampledIndices, positions);

    for (const vertexIdx of selectedIndices) {
      const idx = vertexIdx * 3;
      const position = new THREE.Vector3(
        positions[idx],
        positions[idx + 1],
        positions[idx + 2]
      );

      // Calculate orientation from normal
      let up: THREE.Vector3;
      if (normals) {
        const nx = normals[idx];
        const ny = normals[idx + 1];
        const nz = normals[idx + 2];
        up = new THREE.Vector3(nx, ny, nz).normalize();
        
        // Blend with world up based on normal factor
        const worldUp = new THREE.Vector3(0, 1, 0);
        up.lerp(worldUp, this.params.normalFactor).normalize();
      } else {
        up = new THREE.Vector3(0, 1, 0);
      }

      // Create rotation quaternion
      const rotation = new THREE.Quaternion();
      rotation.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);

      // Add wind rotation offset
      const windOffset = this.calculateWindOffset(position);
      const windQuaternion = new THREE.Quaternion();
      windQuaternion.setFromAxisAngle(up, windOffset);
      rotation.multiply(windQuaternion);

      // Randomize scale with anisotropic scaling
      const noiseValue = this.noise.noise3D(
        position.x * 1.5,
        position.y * 1.5,
        position.z * 1.5
      );
      
      const scaleMultiplier = 1.0 + noiseValue * this.params.scaleRandomness;
      const axisRandomness = 1.0 + (Math.random() - 0.5) * this.params.scaleRandomnessAxis;
      
      const scale = new THREE.Vector3(
        this.params.baseScale * scaleMultiplier,
        this.params.baseScale * scaleMultiplier * axisRandomness,
        this.params.baseScale * scaleMultiplier
      );

      instances.push({
        position,
        rotation,
        scale,
        windOffset,
      });
    }

    return instances;
  }

  /**
   * Create instanced mesh for rendering ferns
   */
  createInstancedMesh(
    instances: FernInstance[],
    fernGeometry: THREE.BufferGeometry,
    material: THREE.Material
  ): InstancedMesh {
    const mesh = new InstancedMesh(fernGeometry, material, instances.length);

    for (let i = 0; i < instances.length; i++) {
      const inst = instances[i];
      const matrix = new THREE.Matrix4();
      matrix.compose(inst.position, inst.rotation, inst.scale);
      mesh.setMatrixAt(i, matrix);
    }

    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }

  /**
   * Generate procedural fern frond geometry
   */
  static createFernGeometry(): THREE.BufferGeometry {
    // Create a simple fern frond shape using extruded curve
    const points: THREE.Vector3[] = [];
    
    // Main stem
    const stemLength = 0.4;
    const segments = 8;
    
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const curve = t * t * (3 - 2 * t); // Smooth step
      points.push(new THREE.Vector3(0, curve * stemLength, 0));
    }

    const curve = new THREE.CatmullRomCurve3(points);
    const tubeGeometry = new THREE.TubeGeometry(curve, segments, 0.015, 6, false);
    
    // Add leaflets along the stem
    const leafletGroups: THREE.BufferGeometry[] = [tubeGeometry];
    
    for (let i = 2; i < segments - 1; i++) {
      const point = curve.getPoint(i / segments);
      const tangent = curve.getTangent(i / segments);
      
      // Left leaflet
      const leftLeaflet = this.createLeafletGeometry(0.08, 0.03);
      const leftRotation = new THREE.Quaternion();
      leftRotation.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(-0.7, tangent.y, 0).normalize()
      );
      leftLeaflet.applyMatrix4(
        new THREE.Matrix4().makeRotationFromQuaternion(leftRotation)
      );
      leftLeaflet.translate(point.x - 0.04, point.y, point.z);
      leafletGroups.push(leftLeaflet);
      
      // Right leaflet
      const rightLeaflet = this.createLeafletGeometry(0.08, 0.03);
      const rightRotation = new THREE.Quaternion();
      rightRotation.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(0.7, tangent.y, 0).normalize()
      );
      rightLeaflet.applyMatrix4(
        new THREE.Matrix4().makeRotationFromQuaternion(rightRotation)
      );
      rightLeaflet.translate(point.x + 0.04, point.y, point.z);
      leafletGroups.push(rightLeaflet);
    }

    // Merge all geometries
    const mergedGeometry = this.mergeGeometries(leafletGroups);
    mergedGeometry.computeVertexNormals();

    // Cleanup
    tubeGeometry.dispose();
    leafletGroups.forEach(g => {
      if (g !== tubeGeometry && g !== mergedGeometry) {
        g.dispose();
      }
    });

    return mergedGeometry;
  }

  /**
   * Create fern material
   */
  static createFernMaterial(): THREE.MeshStandardMaterial {
    const hue = 0.25 + Math.random() * 0.08;
    const saturation = 0.5 + Math.random() * 0.2;
    const lightness = 0.35 + Math.random() * 0.15;
    
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(hue, saturation, lightness),
      roughness: 0.7,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });
  }

  /**
   * Animate ferns with wind
   */
  animateWind(instances: FernInstance[], time: number): void {
    for (const inst of instances) {
      const windVariation = Math.sin(time * 2 + inst.position.x * 0.5) * 0.1 +
                           Math.cos(time * 1.5 + inst.position.z * 0.3) * 0.05;
      
      const totalWind = inst.windOffset + windVariation * this.params.windStrength * 0.01;
      
      const up = new THREE.Vector3(0, 1, 0);
      inst.rotation.setFromUnitVectors(up, up);
      const windQuaternion = new THREE.Quaternion();
      windQuaternion.setFromAxisAngle(up, totalWind);
      inst.rotation.multiply(windQuaternion);
    }
  }

  private calculateWindOffset(position: THREE.Vector3): number {
    const windNoise = this.noise.noise3D(
      position.x * 0.1 + Date.now() * 0.001,
      position.y * 0.1,
      position.z * 0.1
    );
    
    return windNoise * this.params.windStrength * 0.01;
  }

  private enforceMinSpacing(indices: number[], positions: Float32Array): number[] {
    const result: number[] = [];
    const selectedPositions: THREE.Vector3[] = [];

    for (const idx of indices) {
      const posIdx = idx * 3;
      const position = new THREE.Vector3(
        positions[posIdx],
        positions[posIdx + 1],
        positions[posIdx + 2]
      );

      let tooClose = false;
      for (const selected of selectedPositions) {
        if (position.distanceTo(selected) < this.params.minSpacing) {
          tooClose = true;
          break;
        }
      }

      if (!tooClose) {
        result.push(idx);
        selectedPositions.push(position);
      }
    }

    return result;
  }

  private reservoirSample<T>(array: T[], k: number): T[] {
    const result = array.slice(0, k);
    for (let i = k; i < array.length; i++) {
      const j = Math.floor(Math.random() * (i + 1));
      if (j < k) {
        result[j] = array[i];
      }
    }
    return result;
  }

  private sampleTexture(texture: THREE.DataTexture, x: number, z: number): number {
    const image = texture.image;
    if (!image) return 0.5;

    const u = ((x % 100) + 100) % 100 / 100;
    const v = ((z % 100) + 100) % 100 / 100;

    const px = Math.floor(u * image.width);
    const py = Math.floor(v * image.height);
    const idx = (py * image.width + px) * 4;

    const data = image.data;
    return data[idx] / 255;
  }

  private static createLeafletGeometry(length: number, width: number): THREE.BufferGeometry {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.quadraticCurveTo(length * 0.5, width, length, 0);
    shape.quadraticCurveTo(length * 0.5, -width, 0, 0);
    
    const geometry = new THREE.ShapeGeometry(shape);
    geometry.rotateX(-Math.PI / 2);
    return geometry;
  }

  private static mergeGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
    if ((THREE as any).BufferGeometryUtils) {
      return (THREE as any).BufferGeometryUtils.mergeGeometries(geometries);
    }
    
    // Fallback simple merge
    const mergedGeometry = new THREE.BufferGeometry();
    const positions: number[] = [];
    const normals: number[] = [];

    for (const geo of geometries) {
      const pos = geo.attributes.position.array as Float32Array;
      const norm = geo.attributes.normal?.array as Float32Array;

      positions.push(...Array.from(pos));
      if (norm) {
        normals.push(...Array.from(norm));
      }
    }

    mergedGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    if (normals.length > 0) {
      mergedGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    }

    return mergedGeometry;
  }
}

export default FernScatterGenerator;
