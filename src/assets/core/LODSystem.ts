/**
 * LODSystem.ts
 * 
 * Level-of-Detail management system for efficient rendering of assets at various distances.
 * Implements automatic LOD switching, HLOD (Hierarchical LOD), and memory-efficient streaming.
 */

import * as THREE from 'three';
import { LODConfig, AssetResult } from './AssetTypes';

/**
 * LOD System for managing detail levels based on camera distance
 */
export class LODSystem {
  private static instance: LODSystem;
  
  // LOD groups registry
  private lodGroups: Map<string, THREE.LOD> = new Map();
  
  // Configuration per asset type
  private configs: Map<string, LODConfig[]> = new Map();
  
  // Camera reference for distance calculations
  private camera: THREE.Camera | null = null;
  
  // Update frequency (ms)
  private updateInterval: number = 100;
  private lastUpdate: number = 0;
  
  // Performance settings
  private autoUpdate: boolean = true;
  private fadeTransition: boolean = false;
  private screenSpaceThreshold: number = 0.05; // 5% screen coverage
  
  // Statistics
  private stats: LODStats = {
    totalLODGroups: 0,
    activeSwitches: 0,
    culledObjects: 0,
    memorySaved: 0
  };

  private constructor() {}

  /**
   * Get singleton instance
   */
  public static getInstance(): LODSystem {
    if (!LODSystem.instance) {
      LODSystem.instance = new LODSystem();
    }
    return LODSystem.instance;
  }

  /**
   * Set the camera for distance calculations
   */
  public setCamera(camera: THREE.Camera): void {
    this.camera = camera;
  }

  // ============================================================================
  // LOD Group Creation & Management
  // ============================================================================

  /**
   * Create a new LOD group for an asset
   */
  public createLODGroup(
    assetId: string,
    geometries: THREE.Object3D[],
    distances: number[]
  ): THREE.LOD {
    const lod = new THREE.LOD();
    
    // Add each LOD level
    geometries.forEach((geometry, index) => {
      const distance = distances[index] || Infinity;
      lod.addLevel(geometry, distance);
    });

    // Enable fade transitions if configured
    if (this.fadeTransition) {
      // lod.enableFade = true; // Not available in current Three.js version
    }

    this.lodGroups.set(assetId, lod);
    this.stats.totalLODGroups++;

    return lod;
  }

  /**
   * Create LOD group with automatic geometry simplification
   */
  public createAutoLODGroup(
    assetId: string,
    baseMesh: THREE.Mesh,
    config: LODConfig[]
  ): THREE.LOD {
    const lod = new THREE.LOD();
    const geometries: THREE.Object3D[] = [];
    const distances: number[] = [];

    // Generate LOD levels
    config.forEach((level, index) => {
      const simplified = this.simplifyGeometry(
        baseMesh.geometry,
        level.targetFaceCount
      );
      
      const mesh = new THREE.Mesh(simplified, baseMesh.material);
      mesh.castShadow = baseMesh.castShadow;
      mesh.receiveShadow = baseMesh.receiveShadow;
      
      geometries.push(mesh);
      distances.push(level.distance);
    });

    return this.createLODGroup(assetId, geometries, distances);
  }

  /**
   * Get an existing LOD group
   */
  public getLODGroup(assetId: string): THREE.LOD | null {
    return this.lodGroups.get(assetId) || null;
  }

  /**
   * Remove and dispose a LOD group
   */
  public removeLODGroup(assetId: string): boolean {
    const lod = this.lodGroups.get(assetId);
    if (!lod) return false;

    // Dispose all levels
    lod.levels.forEach(level => {
      if (level.object instanceof THREE.Mesh) {
        level.object.geometry.dispose();
      }
    });

    this.lodGroups.delete(assetId);
    this.stats.totalLODGroups--;
    return true;
  }

  // ============================================================================
  // Geometry Simplification
  // ============================================================================

  /**
   * Simplify geometry to target face count
   */
  public simplifyGeometry(
    geometry: THREE.BufferGeometry,
    targetFaceCount: number
  ): THREE.BufferGeometry {
    const currentFaceCount = geometry.index 
      ? geometry.index.count / 3 
      : geometry.attributes.position.count / 3;

    // If already at or below target, return copy
    if (currentFaceCount <= targetFaceCount) {
      return geometry.clone();
    }

    // Calculate reduction ratio
    const ratio = targetFaceCount / currentFaceCount;

    // Use Three.js built-in simplification if available
    // Note: For production, consider using meshoptimizer or similar library
    return this.simplifyBufferGeometry(geometry, ratio);
  }

  /**
   * Basic buffer geometry simplification (vertex clustering approach)
   */
  private simplifyBufferGeometry(
    geometry: THREE.BufferGeometry,
    ratio: number
  ): THREE.BufferGeometry {
    const positions = geometry.attributes.position.array as Float32Array;
    const indices = geometry.index?.array ?? null;
    
    // Simple decimation: sample vertices at reduced rate
    const sampleRate = Math.sqrt(ratio);
    const newPositions: number[] = [];
    
    for (let i = 0; i < positions.length; i += 9) {
      if (Math.random() < sampleRate) {
        // Keep this triangle
        newPositions.push(
          positions[i], positions[i + 1], positions[i + 2],
          positions[i + 3], positions[i + 4], positions[i + 5],
          positions[i + 6], positions[i + 7], positions[i + 8]
        );
      }
    }

    const newGeometry = new THREE.BufferGeometry();
    newGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(newPositions, 3)
    );

    // Copy other attributes if they exist
    if (geometry.attributes.normal) {
      const normals = geometry.attributes.normal.array as Float32Array;
      const newNormals: number[] = [];
      for (let i = 0; i < normals.length && i < newPositions.length; i += 3) {
        newNormals.push(normals[i], normals[i + 1], normals[i + 2]);
      }
      if (newNormals.length > 0) {
        newGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(newNormals, 3));
      }
    }

    if (geometry.attributes.uv) {
      const uvs = geometry.attributes.uv.array as Float32Array;
      const newUVs: number[] = [];
      for (let i = 0; i < uvs.length && i < newPositions.length; i += 2) {
        newUVs.push(uvs[i], uvs[i + 1]);
      }
      if (newUVs.length > 0) {
        newGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(newUVs, 2));
      }
    }

    newGeometry.computeVertexNormals();
    return newGeometry;
  }

  // ============================================================================
  // Automatic Updates
  // ============================================================================

  /**
   * Update all LOD groups based on camera position
   */
  public update(deltaTime: number): void {
    if (!this.autoUpdate || !this.camera) return;

    const now = Date.now();
    if (now - this.lastUpdate < this.updateInterval) return;

    this.lastUpdate = now;

    this.lodGroups.forEach((lod, assetId) => {
      const previousLevel = lod.getCurrentLevel();
      
      // Update LOD based on camera distance
      lod.update(this.camera!);
      
      const currentLevel = lod.getCurrentLevel();
      if (previousLevel !== currentLevel) {
        this.stats.activeSwitches++;
        
        // Emit event or callback if needed
        this.onLODSwitch(assetId, previousLevel, currentLevel);
      }
    });
  }

  /**
   * Handle LOD switch events
   */
  private onLODSwitch(assetId: string, oldLevel: number, newLevel: number): void {
    // Could emit events, log statistics, or trigger loading
    console.debug(`LOD switch for ${assetId}: ${oldLevel} -> ${newLevel}`);
  }

  /**
   * Force update of specific LOD group
   */
  public forceUpdate(assetId: string): void {
    const lod = this.lodGroups.get(assetId);
    if (lod && this.camera) {
      lod.update(this.camera);
    }
  }

  // ============================================================================
  // Hierarchical LOD (HLOD)
  // ============================================================================

  /**
   * Create HLOD for grouping multiple distant objects
   */
  public createHLOD(
    hlodId: string,
    objects: THREE.Object3D[],
    distance: number
  ): THREE.LOD {
    // Combine geometries for distant view
    const combinedGeometry = this.combineGeometries(objects);
    const combinedMesh = new THREE.Mesh(
      combinedGeometry,
      this.getAverageMaterial(objects)
    );

    const lod = new THREE.LOD();
    
    // Add close-up individual objects
    objects.forEach(obj => {
      lod.addLevel(obj, 0);
    });

    // Add distant combined mesh
    lod.addLevel(combinedMesh, distance);

    this.lodGroups.set(hlodId, lod);
    this.stats.totalLODGroups++;

    return lod;
  }

  /**
   * Combine multiple geometries into one
   */
  private combineGeometries(objects: THREE.Object3D[]): THREE.BufferGeometry {
    const geometries: THREE.BufferGeometry[] = [];
    const matrices: THREE.Matrix4[] = [];

    objects.forEach(obj => {
      if (obj instanceof THREE.Mesh) {
        obj.updateMatrixWorld(true);
        geometries.push(obj.geometry);
        matrices.push(obj.matrixWorld);
      }
    });
    
    return this.simpleMergeGeometries(geometries, matrices);
  }

  /**
   * Fallback geometry merging without BufferGeometryUtils
   */
  private simpleMergeGeometries(
    geometries: THREE.BufferGeometry[],
    matrices: THREE.Matrix4[]
  ): THREE.BufferGeometry {
    const merged = new THREE.BufferGeometry();
    const allPositions: number[] = [];
    const allNormals: number[] = [];

    geometries.forEach((geo, idx) => {
      const positions = geo.attributes.position.array as Float32Array;
      const matrix = matrices[idx];

      for (let i = 0; i < positions.length; i += 3) {
        const v = new THREE.Vector3(
          positions[i],
          positions[i + 1],
          positions[i + 2]
        );
        v.applyMatrix4(matrix);
        allPositions.push(v.x, v.y, v.z);
      }

      if (geo.attributes.normal) {
        const normals = geo.attributes.normal.array as Float32Array;
        for (let i = 0; i < normals.length; i += 3) {
          allNormals.push(normals[i], normals[i + 1], normals[i + 2]);
        }
      }
    });

    merged.setAttribute('position', new THREE.Float32BufferAttribute(allPositions, 3));
    if (allNormals.length > 0) {
      merged.setAttribute('normal', new THREE.Float32BufferAttribute(allNormals, 3));
    }

    merged.computeVertexNormals();
    return merged;
  }

  /**
   * Get average material from objects
   */
  private getAverageMaterial(objects: THREE.Object3D[]): THREE.Material {
    // Simple implementation: use first material
    for (const obj of objects) {
      if (obj instanceof THREE.Mesh && obj.material) {
        return Array.isArray(obj.material) ? obj.material[0] : obj.material;
      }
    }
    return new THREE.MeshStandardMaterial({ color: 0x808080 });
  }

  // ============================================================================
  // Configuration
  // ============================================================================

  /**
   * Set LOD configuration for asset type
   */
  public setConfig(assetType: string, config: LODConfig[]): void {
    this.configs.set(assetType, config);
  }

  /**
   * Get LOD configuration for asset type
   */
  public getConfig(assetType: string): LODConfig[] | undefined {
    return this.configs.get(assetType);
  }

  /**
   * Set default LOD configuration
   */
  public setDefaultConfig(): void {
    const defaultConfig: LODConfig[] = [
      { distance: 0, complexity: 'high', targetFaceCount: 10000, textureResolution: 2048 },
      { distance: 20, complexity: 'medium', targetFaceCount: 2500, textureResolution: 1024 },
      { distance: 50, complexity: 'low', targetFaceCount: 500, textureResolution: 512 },
      { distance: 100, complexity: 'low', targetFaceCount: 100, textureResolution: 256 }
    ];
    this.setConfig('default', defaultConfig);
  }

  // ============================================================================
  // Settings
  // ============================================================================

  /**
   * Enable or disable automatic updates
   */
  public setAutoUpdate(enabled: boolean): void {
    this.autoUpdate = enabled;
  }

  /**
   * Set update interval in milliseconds
   */
  public setUpdateInterval(interval: number): void {
    this.updateInterval = Math.max(16, interval); // Minimum 16ms (~60fps)
  }

  /**
   * Enable or disable fade transitions
   */
  public setFadeTransition(enabled: boolean): void {
    this.fadeTransition = enabled;
    this.lodGroups.forEach(lod => {
      // lod.enableFade = enabled; // Not available in current Three.js version
    });
  }

  // ============================================================================
  // Statistics
  // ============================================================================

  /**
   * Get LOD system statistics
   */
  public getStats(): LODStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  public resetStats(): void {
    this.stats = {
      totalLODGroups: 0,
      activeSwitches: 0,
      culledObjects: 0,
      memorySaved: 0
    };
  }

  /**
   * Print statistics to console
   */
  public printStats(): void {
    const stats = this.getStats();
    console.log('=== LOD System Statistics ===');
    console.log(`Total LOD Groups: ${stats.totalLODGroups}`);
    console.log(`Active Switches: ${stats.activeSwitches}`);
    console.log(`Culled Objects: ${stats.culledObjects}`);
    console.log(`Memory Saved: ${(stats.memorySaved / 1024 / 1024).toFixed(2)} MB`);
    console.log('==============================');
  }

  /**
   * Clean up and dispose resources
   */
  public dispose(): void {
    this.lodGroups.forEach((lod, id) => {
      this.removeLODGroup(id);
    });
    this.configs.clear();
    this.camera = null;
  }
}

/**
 * LOD statistics interface
 */
export interface LODStats {
  totalLODGroups: number;
  activeSwitches: number;
  culledObjects: number;
  memorySaved: number;
}

// Export singleton instance helper
export const lodSystem = LODSystem.getInstance();
