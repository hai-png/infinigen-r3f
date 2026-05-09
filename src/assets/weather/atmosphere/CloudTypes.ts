/**
 * CloudTypes.ts
 *
 * Procedural cloud type definitions and generators — provides four distinct
 * cloud types matching the original Infinigen atmosphere system:
 *
 * - CumulusCloud: Puffy, flat-bottomed, vertical development
 * - CumulonimbusCloud: Towering, anvil-shaped top (storm cloud)
 * - StratocumulusCloud: Low, layered, lumpy (stratus + cumulus hybrid)
 * - AltocumulusCloud: Mid-level, small puffs in groups ("mackerel sky")
 *
 * Each cloud type is a class with:
 * - `generate(config): THREE.Group` — Creates the cloud mesh group
 * - Different geometry shapes (sphere clusters, flattened, etc.)
 * - Different density/opacity ranges
 * - Different altitude ranges
 * - All use VolumetricClouds as the rendering backend
 *
 * @module assets/weather/atmosphere
 */

import * as THREE from 'three';
import { VolumetricClouds, CloudLayer } from './VolumetricClouds';

// ============================================================================
// Shared Types
// ============================================================================

/** Base configuration shared by all cloud types */
export interface CloudTypeConfig {
  /** Master seed for deterministic generation */
  seed: number;
  /** Horizontal extent of the cloud field (world units) */
  coverage: number;
  /** Override density (0–2); if undefined, type-specific default is used */
  density?: number;
  /** Override opacity (0–1); if undefined, type-specific default is used */
  opacity?: number;
  /** Override altitude (world units); if undefined, type-specific default is used */
  altitude?: number;
  /** Wind speed (m/s) for animation */
  windSpeed?: number;
  /** Number of individual cloud puffs/clusters */
  puffCount?: number;
  /** Whether to enable animation */
  animate?: boolean;
}

/** Default base config */
export const DEFAULT_CLOUD_TYPE_CONFIG: CloudTypeConfig = {
  seed: 42,
  coverage: 1.0,
  animate: true,
};

// ============================================================================
// Seeded RNG helper (lightweight, self-contained)
// ============================================================================

class CloudRNG {
  private state: number;

  constructor(seed: number) {
    this.state = seed | 0;
  }

  next(): number {
    // xorshift32
    let s = this.state;
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    this.state = s;
    return (s >>> 0) / 4294967296;
  }

  uniform(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  nextInt(min: number, max: number): number {
    return Math.floor(this.uniform(min, max + 1));
  }
}

// ============================================================================
// Cloud puff geometry builder
// ============================================================================

/**
 * Create a single cloud puff (sphere) geometry with noise displacement
 * for organic shape. Puffs are merged together to form a cloud cluster.
 */
function createPuffGeometry(
  radius: number,
  seed: number,
  segments: number = 8,
): THREE.BufferGeometry {
  const geometry = new THREE.SphereGeometry(radius, segments, segments);

  // Apply noise displacement for organic shape
  const posAttr = geometry.attributes.position;
  const vertex = new THREE.Vector3();
  const rng = new CloudRNG(seed);

  for (let i = 0; i < posAttr.count; i++) {
    vertex.fromBufferAttribute(posAttr, i);

    // Simple hash-based noise for vertex displacement
    const noiseScale = 1.5;
    const nx = Math.sin(vertex.x * noiseScale + rng.next() * 6.28) * 0.5 + 0.5;
    const ny = Math.sin(vertex.y * noiseScale + rng.next() * 6.28) * 0.5 + 0.5;
    const nz = Math.sin(vertex.z * noiseScale + rng.next() * 6.28) * 0.5 + 0.5;
    const noise = (nx + ny + nz) / 3;

    const displacement = 1 + (noise - 0.5) * 0.15;
    vertex.multiplyScalar(displacement);
    posAttr.setXYZ(i, vertex.x, vertex.y, vertex.z);
  }

  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Create a cloud material with the given opacity and color.
 */
function createCloudMaterial(
  opacity: number,
  color: THREE.Color = new THREE.Color(0xffffff),
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    transparent: true,
    opacity,
    roughness: 1.0,
    metalness: 0.0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
}

// ============================================================================
// CumulusCloud
// ============================================================================

/**
 * Configuration specific to Cumulus clouds.
 */
export interface CumulusCloudConfig extends CloudTypeConfig {
  /** Vertical development factor (0.5–2.0). Higher = taller clouds. */
  verticalDevelopment?: number;
  /** Base width of each puff */
  puffBaseWidth?: number;
}

/**
 * **Cumulus Cloud** — Puffy, flat-bottomed clouds with vertical development.
 *
 * The most common "fair weather" cloud. Formed by convective uplift with
 * a flat base at the lifting condensation level and cauliflower-like tops.
 *
 * Geometry: Clusters of overlapping spheres with flat bottoms.
 * Altitude range: 1000–3000m
 * Density range: 1.0–2.0
 * Opacity range: 0.7–0.9
 */
export class CumulusCloud {
  /** Default altitude for cumulus clouds (meters) */
  static readonly DEFAULT_ALTITUDE = 2000;
  /** Default density */
  static readonly DEFAULT_DENSITY = 1.5;
  /** Default opacity */
  static readonly DEFAULT_OPACITY = 0.85;

  /**
   * Generate a cumulus cloud as a THREE.Group of puff meshes.
   *
   * @param config — Cloud type configuration
   * @returns A Group containing the cloud mesh cluster
   */
  generate(config: Partial<CumulusCloudConfig> = {}): THREE.Group {
    const cfg: CumulusCloudConfig = { ...DEFAULT_CLOUD_TYPE_CONFIG, ...config };
    const {
      seed,
      coverage,
      density = CumulusCloud.DEFAULT_DENSITY,
      opacity = CumulusCloud.DEFAULT_OPACITY,
      altitude = CumulusCloud.DEFAULT_ALTITUDE,
      windSpeed = 10,
      puffCount = 8,
      verticalDevelopment = 1.0,
      puffBaseWidth = 3.0,
    } = cfg;

    const rng = new CloudRNG(seed);
    const group = new THREE.Group();
    group.name = 'CumulusCloud';

    const material = createCloudMaterial(opacity);

    for (let i = 0; i < puffCount; i++) {
      const radius = puffBaseWidth * rng.uniform(0.6, 1.4);
      const puffGeo = createPuffGeometry(radius, seed + i * 31);

      const puff = new THREE.Mesh(puffGeo, material);

      // Horizontal spread — flat bottom arrangement
      const angle = rng.uniform(0, Math.PI * 2);
      const dist = rng.uniform(0, puffBaseWidth * 0.8);
      puff.position.set(
        Math.cos(angle) * dist * coverage,
        rng.uniform(0, puffBaseWidth * 0.4 * verticalDevelopment),
        Math.sin(angle) * dist * coverage,
      );

      // Flatten the bottom to create flat base
      puff.scale.y = rng.uniform(0.6, 0.9) * verticalDevelopment;

      group.add(puff);
    }

    // Center vertically so bottom is at y=0 (flat base)
    const bbox = new THREE.Box3().setFromObject(group);
    group.position.y = -bbox.min.y;

    // Set altitude
    group.position.y += altitude;

    group.userData = {
      cloudType: 'cumulus',
      density,
      altitude,
      windSpeed,
      coverage,
    };

    return group;
  }
}

// ============================================================================
// CumulonimbusCloud
// ============================================================================

/**
 * Configuration specific to Cumulonimbus clouds.
 */
export interface CumulonimbusCloudConfig extends CloudTypeConfig {
  /** Anvil spread factor (0.5–2.0). Higher = wider anvil top. */
  anvilSpread?: number;
  /** Tower height multiplier (1.0–3.0) */
  towerHeight?: number;
}

/**
 * **Cumulonimbus Cloud** — Towering storm cloud with anvil-shaped top.
 *
 * The thunderstorm cloud. Extends from low altitude to the tropopause,
 * with vigorous vertical development and a characteristic anvil-shaped
 * top formed by high-altitude winds shearing the top.
 *
 * Geometry: Tall cluster of spheres at base, wide flattened anvil at top.
 * Altitude range: 500–12000m (base to top)
 * Density range: 2.0–3.0
 * Opacity range: 0.85–0.95
 */
export class CumulonimbusCloud {
  /** Default base altitude (meters) */
  static readonly DEFAULT_ALTITUDE = 1500;
  /** Default density */
  static readonly DEFAULT_DENSITY = 2.5;
  /** Default opacity */
  static readonly DEFAULT_OPACITY = 0.9;

  /**
   * Generate a cumulonimbus cloud as a THREE.Group.
   *
   * @param config — Cloud type configuration
   * @returns A Group containing the cloud mesh cluster
   */
  generate(config: Partial<CumulonimbusCloudConfig> = {}): THREE.Group {
    const cfg: CumulonimbusCloudConfig = { ...DEFAULT_CLOUD_TYPE_CONFIG, ...config };
    const {
      seed,
      coverage,
      density = CumulonimbusCloud.DEFAULT_DENSITY,
      opacity = CumulonimbusCloud.DEFAULT_OPACITY,
      altitude = CumulonimbusCloud.DEFAULT_ALTITUDE,
      windSpeed = 15,
      puffCount = 15,
      anvilSpread = 1.0,
      towerHeight = 2.0,
    } = cfg;

    const rng = new CloudRNG(seed);
    const group = new THREE.Group();
    group.name = 'CumulonimbusCloud';

    const material = createCloudMaterial(opacity, new THREE.Color(0xe8e8e8));

    // Build the tower section (vertical development)
    const towerPuffs = Math.floor(puffCount * 0.6);
    for (let i = 0; i < towerPuffs; i++) {
      const layerRatio = i / towerPuffs;
      const radius = 2.0 * (1 + layerRatio * 0.3) * coverage;

      const puffGeo = createPuffGeometry(radius, seed + i * 31);
      const puff = new THREE.Mesh(puffGeo, material);

      const angle = rng.uniform(0, Math.PI * 2);
      const dist = rng.uniform(0, 1.5 * (1 - layerRatio * 0.5));

      puff.position.set(
        Math.cos(angle) * dist,
        layerRatio * 8.0 * towerHeight,
        Math.sin(angle) * dist,
      );

      // Narrower at top for tower shape
      puff.scale.x = 1 - layerRatio * 0.2;
      puff.scale.z = 1 - layerRatio * 0.2;

      group.add(puff);
    }

    // Build the anvil top (flattened, spread out)
    const anvilPuffs = puffCount - towerPuffs;
    const anvilBaseY = 8.0 * towerHeight;
    for (let i = 0; i < anvilPuffs; i++) {
      const radius = 3.0 * anvilSpread * coverage;

      const puffGeo = createPuffGeometry(radius, seed + (towerPuffs + i) * 31);
      const puff = new THREE.Mesh(puffGeo, material);

      const angle = rng.uniform(0, Math.PI * 2);
      const dist = rng.uniform(2, 5 * anvilSpread);

      puff.position.set(
        Math.cos(angle) * dist,
        anvilBaseY + rng.uniform(-0.5, 1.0),
        Math.sin(angle) * dist,
      );

      // Flatten the anvil
      puff.scale.y = 0.3;

      group.add(puff);
    }

    // Center and set altitude
    group.position.y = altitude;

    group.userData = {
      cloudType: 'cumulonimbus',
      density,
      altitude,
      windSpeed,
      coverage,
    };

    return group;
  }
}

// ============================================================================
// StratocumulusCloud
// ============================================================================

/**
 * Configuration specific to Stratocumulus clouds.
 */
export interface StratocumulusCloudConfig extends CloudTypeConfig {
  /** Layer thickness (0.5–2.0) */
  layerThickness?: number;
  /** Lumpiness factor (0 = smooth stratus, 1 = very lumpy) */
  lumpiness?: number;
}

/**
 * **Stratocumulus Cloud** — Low, layered, lumpy cloud.
 *
 * A hybrid between stratus and cumulus — a widespread layer of cloud
 * with lumpy, rounded masses. Often covers the entire sky with patches
 * of blue between the thicker elements.
 *
 * Geometry: Flattened, wide sphere clusters arranged in a horizontal layer.
 * Altitude range: 600–2000m
 * Density range: 0.8–1.5
 * Opacity range: 0.6–0.85
 */
export class StratocumulusCloud {
  /** Default base altitude (meters) */
  static readonly DEFAULT_ALTITUDE = 1200;
  /** Default density */
  static readonly DEFAULT_DENSITY = 1.2;
  /** Default opacity */
  static readonly DEFAULT_OPACITY = 0.75;

  /**
   * Generate a stratocumulus cloud as a THREE.Group.
   *
   * @param config — Cloud type configuration
   * @returns A Group containing the cloud mesh cluster
   */
  generate(config: Partial<StratocumulusCloudConfig> = {}): THREE.Group {
    const cfg: StratocumulusCloudConfig = { ...DEFAULT_CLOUD_TYPE_CONFIG, ...config };
    const {
      seed,
      coverage,
      density = StratocumulusCloud.DEFAULT_DENSITY,
      opacity = StratocumulusCloud.DEFAULT_OPACITY,
      altitude = StratocumulusCloud.DEFAULT_ALTITUDE,
      windSpeed = 8,
      puffCount = 12,
      layerThickness = 1.0,
      lumpiness = 0.6,
    } = cfg;

    const rng = new CloudRNG(seed);
    const group = new THREE.Group();
    group.name = 'StratocumulusCloud';

    const material = createCloudMaterial(opacity);

    // Arrange puffs in a grid-like pattern with slight randomness
    const gridCols = Math.ceil(Math.sqrt(puffCount));
    const gridRows = Math.ceil(puffCount / gridCols);
    const spacing = 4.0 * coverage;
    let puffIdx = 0;

    for (let row = 0; row < gridRows && puffIdx < puffCount; row++) {
      for (let col = 0; col < gridCols && puffIdx < puffCount; col++) {
        const radius = rng.uniform(2.5, 4.5) * coverage;

        const puffGeo = createPuffGeometry(radius, seed + puffIdx * 31);
        const puff = new THREE.Mesh(puffGeo, material);

        // Grid position with random offset
        puff.position.set(
          (col - gridCols / 2) * spacing + rng.uniform(-spacing * 0.3, spacing * 0.3),
          rng.uniform(-0.5, 0.5) * layerThickness,
          (row - gridRows / 2) * spacing + rng.uniform(-spacing * 0.3, spacing * 0.3),
        );

        // Flatten vertically — layered appearance
        puff.scale.y = rng.uniform(0.2, 0.4) * layerThickness;

        // Add lumpiness variation
        const lumpScale = 1 + (rng.next() - 0.5) * lumpiness * 0.4;
        puff.scale.x *= lumpScale;
        puff.scale.z *= lumpScale;

        group.add(puff);
        puffIdx++;
      }
    }

    group.position.y = altitude;

    group.userData = {
      cloudType: 'stratocumulus',
      density,
      altitude,
      windSpeed,
      coverage,
    };

    return group;
  }
}

// ============================================================================
// AltocumulusCloud
// ============================================================================

/**
 * Configuration specific to Altocumulus clouds.
 */
export interface AltocumulusCloudConfig extends CloudTypeConfig {
  /** Patch arrangement: 'regular' (ordered) or 'irregular' (scattered) */
  arrangement?: 'regular' | 'irregular';
  /** Size of individual puffs relative to default */
  puffScale?: number;
}

/**
 * **Altocumulus Cloud** — Mid-level, small puffs in groups ("mackerel sky").
 *
 * Patches or rolls of small cloud elements at mid-altitude. Often called
 * "sheep's fleece" or "mackerel sky" due to the regular pattern of small
 * rounded masses separated by blue sky.
 *
 * Geometry: Small, uniform sphere clusters in organized rows or patches.
 * Altitude range: 2000–6000m
 * Density range: 0.5–1.2
 * Opacity range: 0.5–0.75
 */
export class AltocumulusCloud {
  /** Default base altitude (meters) */
  static readonly DEFAULT_ALTITUDE = 4000;
  /** Default density */
  static readonly DEFAULT_DENSITY = 0.9;
  /** Default opacity */
  static readonly DEFAULT_OPACITY = 0.65;

  /**
   * Generate an altocumulus cloud as a THREE.Group.
   *
   * @param config — Cloud type configuration
   * @returns A Group containing the cloud mesh cluster
   */
  generate(config: Partial<AltocumulusCloudConfig> = {}): THREE.Group {
    const cfg: AltocumulusCloudConfig = { ...DEFAULT_CLOUD_TYPE_CONFIG, ...config };
    const {
      seed,
      coverage,
      density = AltocumulusCloud.DEFAULT_DENSITY,
      opacity = AltocumulusCloud.DEFAULT_OPACITY,
      altitude = AltocumulusCloud.DEFAULT_ALTITUDE,
      windSpeed = 12,
      puffCount = 20,
      arrangement = 'regular',
      puffScale = 1.0,
    } = cfg;

    const rng = new CloudRNG(seed);
    const group = new THREE.Group();
    group.name = 'AltocumulusCloud';

    const material = createCloudMaterial(opacity);

    const puffRadius = 1.2 * puffScale * coverage;
    const spacing = 3.0 * coverage;

    if (arrangement === 'regular') {
      // Regular grid pattern (mackerel sky)
      const cols = Math.ceil(Math.sqrt(puffCount * 1.5));
      const rows = Math.ceil(puffCount / cols);
      let idx = 0;

      for (let row = 0; row < rows && idx < puffCount; row++) {
        for (let col = 0; col < cols && idx < puffCount; col++) {
          const puffGeo = createPuffGeometry(
            puffRadius * rng.uniform(0.8, 1.2),
            seed + idx * 17,
          );

          const puff = new THREE.Mesh(puffGeo, material);

          // Offset every other row for honeycomb pattern
          const rowOffset = row % 2 === 0 ? 0 : spacing * 0.5;

          puff.position.set(
            (col - cols / 2) * spacing + rowOffset + rng.uniform(-0.2, 0.2),
            rng.uniform(-0.3, 0.3),
            (row - rows / 2) * spacing * 0.866 + rng.uniform(-0.2, 0.2),
          );

          // Slightly flattened
          puff.scale.y = rng.uniform(0.5, 0.7);
          puff.scale.x *= rng.uniform(0.9, 1.1);
          puff.scale.z *= rng.uniform(0.9, 1.1);

          group.add(puff);
          idx++;
        }
      }
    } else {
      // Irregular scattered patches
      for (let i = 0; i < puffCount; i++) {
        const puffGeo = createPuffGeometry(
          puffRadius * rng.uniform(0.7, 1.3),
          seed + i * 23,
        );

        const puff = new THREE.Mesh(puffGeo, material);

        // Cluster around 2–3 centres
        const clusterIdx = Math.floor(rng.next() * 3);
        const clusterCenterX = (clusterIdx - 1) * spacing * 3;
        const clusterCenterZ = (clusterIdx % 2 === 0 ? 1 : -1) * spacing * 2;

        puff.position.set(
          clusterCenterX + rng.uniform(-spacing * 2, spacing * 2),
          rng.uniform(-0.5, 0.5),
          clusterCenterZ + rng.uniform(-spacing * 2, spacing * 2),
        );

        puff.scale.y = rng.uniform(0.4, 0.7);

        group.add(puff);
      }
    }

    group.position.y = altitude;

    group.userData = {
      cloudType: 'altocumulus',
      density,
      altitude,
      windSpeed,
      coverage,
    };

    return group;
  }
}

// ============================================================================
// Cloud type registry / factory
// ============================================================================

/** All supported cloud type names */
export type CloudTypeName = 'cumulus' | 'cumulonimbus' | 'stratocumulus' | 'altocumulus';

/** All available cloud type names for enumeration */
export const CLOUD_TYPE_NAMES: readonly CloudTypeName[] = [
  'cumulus',
  'cumulonimbus',
  'stratocumulus',
  'altocumulus',
] as const;

/** Altitude ranges for each cloud type (meters) */
export const CLOUD_ALTITUDE_RANGES: Record<CloudTypeName, { min: number; max: number }> = {
  cumulus: { min: 1000, max: 3000 },
  cumulonimbus: { min: 500, max: 12000 },
  stratocumulus: { min: 600, max: 2000 },
  altocumulus: { min: 2000, max: 6000 },
};

/** Density ranges for each cloud type */
export const CLOUD_DENSITY_RANGES: Record<CloudTypeName, { min: number; max: number }> = {
  cumulus: { min: 1.0, max: 2.0 },
  cumulonimbus: { min: 2.0, max: 3.0 },
  stratocumulus: { min: 0.8, max: 1.5 },
  altocumulus: { min: 0.5, max: 1.2 },
};

/** Opacity ranges for each cloud type */
export const CLOUD_OPACITY_RANGES: Record<CloudTypeName, { min: number; max: number }> = {
  cumulus: { min: 0.7, max: 0.9 },
  cumulonimbus: { min: 0.85, max: 0.95 },
  stratocumulus: { min: 0.6, max: 0.85 },
  altocumulus: { min: 0.5, max: 0.75 },
};

/**
 * Factory function — create a cloud group by type name.
 *
 * @param type — Cloud type name
 * @param config — Configuration for the cloud
 * @returns A THREE.Group containing the cloud meshes
 */
export function createCloudByType(
  type: CloudTypeName,
  config: Partial<CloudTypeConfig> = {},
): THREE.Group {
  switch (type) {
    case 'cumulus':
      return new CumulusCloud().generate(config);
    case 'cumulonimbus':
      return new CumulonimbusCloud().generate(config);
    case 'stratocumulus':
      return new StratocumulusCloud().generate(config);
    case 'altocumulus':
      return new AltocumulusCloud().generate(config);
    default:
      return new CumulusCloud().generate(config);
  }
}

/**
 * Get the VolumetricClouds CloudLayer parameters for a given cloud type.
 * This allows using CloudTypes with the existing VolumetricClouds raymarching backend.
 *
 * @param type — Cloud type name
 * @returns CloudLayer instance configured for the type
 */
export function getCloudLayerForType(type: CloudTypeName): CloudLayer {
  switch (type) {
    case 'cumulus':
      return new CloudLayer('cumulus', {
        height: CumulusCloud.DEFAULT_ALTITUDE,
        thickness: 1200,
        density: CumulusCloud.DEFAULT_DENSITY,
        coverage: 0.5,
        scale: 1.0,
        detail: 3.0,
      });
    case 'cumulonimbus':
      return new CloudLayer('cumulus', {
        height: CumulonimbusCloud.DEFAULT_ALTITUDE,
        thickness: 10000,
        density: CumulonimbusCloud.DEFAULT_DENSITY,
        coverage: 0.6,
        scale: 0.8,
        detail: 4.0,
      });
    case 'stratocumulus':
      return new CloudLayer('stratus', {
        height: StratocumulusCloud.DEFAULT_ALTITUDE,
        thickness: 800,
        density: StratocumulusCloud.DEFAULT_DENSITY,
        coverage: 0.7,
        scale: 2.0,
        detail: 2.0,
      });
    case 'altocumulus':
      return new CloudLayer('cumulus', {
        height: AltocumulusCloud.DEFAULT_ALTITUDE,
        thickness: 600,
        density: AltocumulusCloud.DEFAULT_DENSITY,
        coverage: 0.4,
        scale: 1.5,
        detail: 3.5,
      });
    default:
      return new CloudLayer('cumulus');
  }
}
