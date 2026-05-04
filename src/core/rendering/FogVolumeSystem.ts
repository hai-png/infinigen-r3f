/**
 * FogVolumeSystem — Volumetric Fog for Path-Traced Rendering
 *
 * Replaces custom fog with pathtracer FogVolumeMaterial.
 * Creates Box/Sphere mesh containers for fog volumes.
 * Supports multiple fog volumes per scene (ground fog, cloud layers).
 *
 * Phase 1 — P1.4: Fog Volume Integration
 *
 * @module rendering
 */

import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FogVolumeConfig {
  /** Fog density (0..1, default: 0.015) */
  density: number;
  /** Fog color */
  color: THREE.ColorRepresentation;
  /** Emissive color (for glowing fog) */
  emissive?: THREE.ColorRepresentation;
  /** Emissive intensity */
  emissiveIntensity?: number;
  /** Base opacity */
  opacity?: number;
  /** Container shape: 'box' or 'sphere' */
  shape: 'box' | 'sphere';
  /** Container dimensions (for box: width, height, depth; for sphere: radius) */
  dimensions: { width: number; height: number; depth: number } | { radius: number };
  /** Position of the fog volume */
  position: THREE.Vector3;
  /** Rotation of the fog volume */
  rotation?: THREE.Euler;
}

export interface GroundFogConfig {
  /** Density of ground fog */
  density: number;
  /** Color of ground fog */
  color: THREE.ColorRepresentation;
  /** Height of fog layer */
  height: number;
  /** Spread area (width and depth) */
  spread: number;
  /** Y position of fog base */
  baseY: number;
}

export interface CloudLayerConfig {
  /** Density of cloud layer */
  density: number;
  /** Color of cloud */
  color: THREE.ColorRepresentation;
  /** Altitude of cloud layer */
  altitude: number;
  /** Thickness of cloud layer */
  thickness: number;
  /** Horizontal extent */
  extent: number;
  /** Wind-driven horizontal offset */
  offset?: THREE.Vector3;
}

// ---------------------------------------------------------------------------
// Fog Volume Factory
// ---------------------------------------------------------------------------

/**
 * Create a fog volume mesh compatible with both rasterized and path-traced rendering.
 * In pathtrace mode, uses FogVolumeMaterial from three-gpu-pathtracer.
 * In rasterize mode, uses a semi-transparent MeshStandardMaterial approximation.
 */
export async function createFogVolume(config: Partial<FogVolumeConfig> = {}): Promise<THREE.Mesh> {
  const fullConfig: FogVolumeConfig = {
    density: 0.015,
    color: 0xcccccc,
    emissive: 0x000000,
    emissiveIntensity: 0,
    opacity: 0.15,
    shape: 'box',
    dimensions: { width: 100, height: 10, depth: 100 },
    position: new THREE.Vector3(0, 5, 0),
    ...config,
  };

  // Create container geometry
  let geometry: THREE.BufferGeometry;
  if (fullConfig.shape === 'sphere') {
    const dims = fullConfig.dimensions as { radius: number };
    geometry = new THREE.SphereGeometry(dims.radius, 16, 16);
  } else {
    const dims = fullConfig.dimensions as { width: number; height: number; depth: number };
    geometry = new THREE.BoxGeometry(dims.width, dims.height, dims.depth);
  }

  // Try to use FogVolumeMaterial from three-gpu-pathtracer
  let material: THREE.Material;

  try {
    const { FogVolumeMaterial } = await import('three-gpu-pathtracer');

    material = new FogVolumeMaterial({
      color: new THREE.Color(fullConfig.color),
      density: fullConfig.density,
      emissive: new THREE.Color(fullConfig.emissive ?? 0x000000),
      emissiveIntensity: fullConfig.emissiveIntensity ?? 0,
      opacity: fullConfig.opacity ?? 0.15,
      transparent: true,
    });
  } catch (err) {
    // Silently fall back - FogVolumeMaterial not available, using semi-transparent MeshStandardMaterial
    if (process.env.NODE_ENV === 'development') console.debug('[FogVolumeSystem] FogVolumeMaterial fallback:', err);
    material = new THREE.MeshStandardMaterial({
      color: fullConfig.color,
      transparent: true,
      opacity: (fullConfig.opacity ?? 0.15) * fullConfig.density * 10,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(fullConfig.position);
  if (fullConfig.rotation) {
    mesh.rotation.copy(fullConfig.rotation);
  }
  mesh.userData._isFogVolume = true;
  mesh.userData._fogDensity = fullConfig.density;

  return mesh;
}

// ---------------------------------------------------------------------------
// Preset Fog Volumes
// ---------------------------------------------------------------------------

/**
 * Create a ground-level fog layer.
 * This is a wide, flat box of fog sitting on or near the ground.
 */
export async function createGroundFog(config: Partial<GroundFogConfig> = {}): Promise<THREE.Mesh> {
  const fullConfig: GroundFogConfig = {
    density: 0.02,
    color: 0xdddddd,
    height: 5,
    spread: 200,
    baseY: 0,
    ...config,
  };

  return createFogVolume({
    density: fullConfig.density,
    color: fullConfig.color,
    shape: 'box',
    dimensions: {
      width: fullConfig.spread,
      height: fullConfig.height,
      depth: fullConfig.spread,
    },
    position: new THREE.Vector3(0, fullConfig.baseY + fullConfig.height / 2, 0),
    opacity: 0.2,
  });
}

/**
 * Create a cloud layer at altitude.
 * This is a thin, wide box of fog positioned high in the scene.
 */
export async function createCloudLayer(config: Partial<CloudLayerConfig> = {}): Promise<THREE.Mesh> {
  const fullConfig: CloudLayerConfig = {
    density: 0.008,
    color: 0xffffff,
    altitude: 80,
    thickness: 15,
    extent: 500,
    ...config,
  };

  const position = new THREE.Vector3(
    fullConfig.offset?.x ?? 0,
    fullConfig.altitude,
    fullConfig.offset?.z ?? 0,
  );

  return createFogVolume({
    density: fullConfig.density,
    color: fullConfig.color,
    shape: 'box',
    dimensions: {
      width: fullConfig.extent,
      height: fullConfig.thickness,
      depth: fullConfig.extent,
    },
    position,
    opacity: 0.1,
  });
}

/**
 * Create a localized fog effect (e.g., for misty areas, steam).
 */
export async function createLocalizedFog(
  position: THREE.Vector3,
  radius: number = 5,
  density: number = 0.03,
  color: THREE.ColorRepresentation = 0xcccccc
): Promise<THREE.Mesh> {
  return createFogVolume({
    density,
    color,
    shape: 'sphere',
    dimensions: { radius },
    position,
    opacity: 0.25,
  });
}

// ---------------------------------------------------------------------------
// Fog Volume Manager
// ---------------------------------------------------------------------------

/**
 * Manages multiple fog volumes in a scene.
 * Provides add/remove/update operations and handles
 * conversion between rasterized and path-traced modes.
 */
export class FogVolumeManager {
  private volumes: Map<string, THREE.Mesh> = new Map();
  private group: THREE.Group;

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'fog-volumes';
  }

  /**
   * Add a named fog volume to the manager.
   */
  async addVolume(name: string, config: Partial<FogVolumeConfig>): Promise<THREE.Mesh> {
    // Remove existing volume with the same name
    if (this.volumes.has(name)) {
      this.removeVolume(name);
    }

    const volume = await createFogVolume(config);
    volume.name = `fog-${name}`;
    this.volumes.set(name, volume);
    this.group.add(volume);
    return volume;
  }

  /**
   * Add a ground fog layer.
   */
  async addGroundFog(name: string, config: Partial<GroundFogConfig> = {}): Promise<THREE.Mesh> {
    const volume = await createGroundFog(config);
    volume.name = `fog-ground-${name}`;

    // Remove existing
    if (this.volumes.has(name)) {
      this.removeVolume(name);
    }

    this.volumes.set(name, volume);
    this.group.add(volume);
    return volume;
  }

  /**
   * Add a cloud layer.
   */
  async addCloudLayer(name: string, config: Partial<CloudLayerConfig> = {}): Promise<THREE.Mesh> {
    const volume = await createCloudLayer(config);
    volume.name = `fog-cloud-${name}`;

    if (this.volumes.has(name)) {
      this.removeVolume(name);
    }

    this.volumes.set(name, volume);
    this.group.add(volume);
    return volume;
  }

  /**
   * Remove a named fog volume.
   */
  removeVolume(name: string): boolean {
    const volume = this.volumes.get(name);
    if (!volume) return false;

    this.group.remove(volume);

    // Dispose geometry and material
    if (volume.geometry) volume.geometry.dispose();
    if (volume.material) {
      if (Array.isArray(volume.material)) {
        volume.material.forEach(m => m.dispose());
      } else {
        volume.material.dispose();
      }
    }

    this.volumes.delete(name);
    return true;
  }

  /**
   * Get a fog volume by name.
   */
  getVolume(name: string): THREE.Mesh | undefined {
    return this.volumes.get(name);
  }

  /**
   * Update the density of a fog volume.
   */
  updateDensity(name: string, density: number): boolean {
    const volume = this.volumes.get(name);
    if (!volume) return false;

    const material = volume.material as any;
    if (material.density !== undefined) {
      material.density = density;
    } else {
      // Fallback MeshStandardMaterial
      material.opacity = density * 10;
      material.needsUpdate = true;
    }

    volume.userData._fogDensity = density;
    return true;
  }

  /**
   * Get the group containing all fog volumes.
   */
  getGroup(): THREE.Group {
    return this.group;
  }

  /**
   * Get all fog volume names.
   */
  getVolumeNames(): string[] {
    return Array.from(this.volumes.keys());
  }

  /**
   * Remove all fog volumes.
   */
  clear(): void {
    for (const name of this.volumes.keys()) {
      this.removeVolume(name);
    }
  }

  /**
   * Dispose all resources.
   */
  dispose(): void {
    this.clear();
  }
}
