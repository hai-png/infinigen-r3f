/**
 * ProceduralLamps.ts
 *
 * Procedural lamp geometry factories that create both mesh geometry and
 * THREE.Light instances with blackbody-correct color temperature.
 *
 * Three lamp factories:
 * - CeilingLampFactory: Ceiling-mounted light fixture with shade + PointLight
 * - TableLampFactory: Table lamp with base + shade + PointLight
 * - FloorLampFactory: Floor lamp with stand + shade + PointLight
 *
 * Each factory:
 * - Creates the mesh geometry for the lamp fixture
 * - Creates a THREE.PointLight with blackbody-correct color temperature
 * - Supports configurable wattage (40–100W) and temperature (2700–6500K)
 * - Supports configurable shade color and shape
 * - Returns a result object with both the mesh group and the light
 *
 * @module assets/objects/lighting
 */

import * as THREE from 'three';
import { GeometryPipeline } from '@/assets/utils/GeometryPipeline';
import {
  blackbodyToRGB,
  createBlackbodyLight,
  COLOR_TEMPERATURES,
} from '@/assets/lighting/BlackbodyShader';

// ============================================================================
// Shared Types
// ============================================================================

/** Base configuration shared by all lamp factories */
export interface ProceduralLampConfig {
  /** Bulb wattage (40–100W). Affects light intensity. */
  wattage: number;
  /** Color temperature in Kelvin (2700–6500K) */
  temperature: number;
  /** Shade colour */
  shadeColor: THREE.ColorRepresentation;
  /** Shade shape */
  shadeShape: 'cylinder' | 'cone' | 'empire' | 'drum' | 'bell';
  /** Base/stand material */
  baseMaterial: 'metal' | 'wood' | 'ceramic' | 'glass';
  /** Base/stand colour */
  baseColor: THREE.ColorRepresentation;
  /** Master seed for deterministic variation */
  seed: number;
}

/** Default lamp configuration */
export const DEFAULT_LAMP_CONFIG: ProceduralLampConfig = {
  wattage: 60,
  temperature: 2700,
  shadeColor: 0xf5f5dc,
  shadeShape: 'cylinder',
  baseMaterial: 'metal',
  baseColor: 0xcccccc,
  seed: 42,
};

/** Result returned by all lamp factories */
export interface LampFactoryResult {
  /** The complete lamp mesh group (including shade, base, bulb, etc.) */
  group: THREE.Group;
  /** The THREE.PointLight created for this lamp */
  light: THREE.PointLight;
  /** The shade mesh (for dynamic colour/opacity changes) */
  shade: THREE.Mesh;
  /** The bulb mesh (for emissive updates) */
  bulb: THREE.Mesh;
  /** Configuration used to generate this lamp */
  config: ProceduralLampConfig;
}

// ============================================================================
// Internal helpers
// ============================================================================

/**
 * Create a PBR material for the lamp base/stand.
 */
function createBaseMaterial(
  materialType: ProceduralLampConfig['baseMaterial'],
  color: THREE.ColorRepresentation,
): THREE.MeshStandardMaterial {
  switch (materialType) {
    case 'metal':
      return new THREE.MeshStandardMaterial({
        color,
        metalness: 0.85,
        roughness: 0.2,
      });
    case 'wood':
      return new THREE.MeshStandardMaterial({
        color,
        metalness: 0.0,
        roughness: 0.75,
      });
    case 'ceramic':
      return new THREE.MeshStandardMaterial({
        color,
        metalness: 0.05,
        roughness: 0.3,
      });
    case 'glass':
      return new THREE.MeshPhysicalMaterial({
        color,
        metalness: 0.0,
        roughness: 0.05,
        transmission: 0.8,
        transparent: true,
        opacity: 0.5,
      });
    default:
      return new THREE.MeshStandardMaterial({ color });
  }
}

/**
 * Create a shade material (typically fabric or translucent).
 */
function createShadeMaterial(
  color: THREE.ColorRepresentation,
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    metalness: 0.0,
    roughness: 0.9,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.85,
  });
}

/**
 * Create the shade geometry based on shape type.
 */
function createShadeGeometry(
  shape: ProceduralLampConfig['shadeShape'],
  topRadius: number,
  bottomRadius: number,
  height: number,
): THREE.BufferGeometry {
  switch (shape) {
    case 'cone':
      return new THREE.ConeGeometry(bottomRadius, height, 32, 1, true);
    case 'empire':
      // Empire shade — wider at bottom, slight outward curve
      return new THREE.CylinderGeometry(topRadius, bottomRadius * 1.15, height, 32, 1, true);
    case 'drum':
      return new THREE.CylinderGeometry(bottomRadius, bottomRadius, height, 32, 1, true);
    case 'bell':
      // Bell shade — wider at bottom, inward curve at top
      return new THREE.CylinderGeometry(topRadius * 0.6, bottomRadius, height, 32, 1, true);
    case 'cylinder':
    default:
      return new THREE.CylinderGeometry(topRadius, bottomRadius, height, 32, 1, true);
  }
}

/**
 * Create a bulb mesh with emissive material matching the blackbody color.
 */
function createBulbMesh(temperature: number, radius: number = 0.035): THREE.Mesh {
  const bbColor = blackbodyToRGB(temperature);
  const bulbGeo = new THREE.SphereGeometry(radius, 16, 16);
  const bulbMat = new THREE.MeshStandardMaterial({
    color: bbColor,
    emissive: bbColor,
    emissiveIntensity: 0.8,
    transparent: true,
    opacity: 0.9,
  });

  const bulb = new THREE.Mesh(bulbGeo, bulbMat);
  bulb.name = 'LampBulb';
  return bulb;
}

/**
 * Create a socket for the bulb.
 */
function createSocket(): THREE.Mesh {
  const socketGeo = new THREE.CylinderGeometry(0.02, 0.028, 0.05, 12);
  const socketMat = new THREE.MeshStandardMaterial({
    color: 0x333333,
    metalness: 0.5,
    roughness: 0.4,
  });

  const socket = new THREE.Mesh(socketGeo, socketMat);
  socket.name = 'LampSocket';
  return socket;
}

/**
 * Compute light intensity from wattage.
 * Approximate: higher wattage = brighter light.
 * Uses a non-linear mapping to simulate perceived brightness.
 */
function wattageToIntensity(wattage: number): number {
  // 40W ≈ 0.5, 60W ≈ 0.8, 100W ≈ 1.5
  return 0.2 + (wattage - 40) * (1.3 / 60);
}

// ============================================================================
// CeilingLampFactory
// ============================================================================

/** Configuration specific to ceiling lamps */
export interface CeilingLampConfig extends ProceduralLampConfig {
  /** Canopy (ceiling plate) diameter */
  canopyDiameter: number;
  /** Drop length from ceiling to shade top (chain/rod length) */
  dropLength: number;
  /** Shade diameter */
  shadeDiameter: number;
  /** Shade height */
  shadeHeight: number;
}

/** Default ceiling lamp config */
const DEFAULT_CEILING_LAMP_CONFIG: CeilingLampConfig = {
  ...DEFAULT_LAMP_CONFIG,
  canopyDiameter: 0.12,
  dropLength: 0.4,
  shadeDiameter: 0.35,
  shadeHeight: 0.22,
};

/**
 * **Ceiling Lamp Factory** — Creates a ceiling-mounted light fixture
 * with shade and PointLight.
 *
 * The fixture consists of:
 * 1. Canopy (ceiling plate)
 * 2. Drop rod/chain
 * 3. Shade (various shapes)
 * 4. Bulb with blackbody emissive color
 * 5. PointLight with blackbody-correct color temperature
 *
 * @example
 * ```ts
 * const factory = new CeilingLampFactory();
 * const result = factory.create({ wattage: 60, temperature: 2700 });
 * scene.add(result.group);
 * ```
 */
export class CeilingLampFactory {
  /**
   * Create a ceiling lamp fixture with geometry and light.
   *
   * @param config — Configuration overrides
   * @returns LampFactoryResult with group, light, shade, and bulb
   */
  create(config: Partial<CeilingLampConfig> = {}): LampFactoryResult {
    const cfg: CeilingLampConfig = { ...DEFAULT_CEILING_LAMP_CONFIG, ...config };
    const group = new THREE.Group();
    group.name = 'CeilingLamp';

    const baseMat = createBaseMaterial(cfg.baseMaterial, cfg.baseColor);
    const shadeMat = createShadeMaterial(cfg.shadeColor);
    const shadeTopRadius = cfg.shadeDiameter * 0.35;
    const shadeBottomRadius = cfg.shadeDiameter / 2;

    // 1. Canopy (ceiling plate)
    const canopyGeo = new THREE.CylinderGeometry(
      cfg.canopyDiameter / 2,
      cfg.canopyDiameter / 2,
      0.02,
      24,
    );
    const canopy = new THREE.Mesh(canopyGeo, baseMat);
    canopy.position.y = cfg.dropLength + cfg.shadeHeight / 2 + 0.01;
    canopy.castShadow = true;
    group.add(canopy);

    // 2. Drop rod
    const rodGeo = new THREE.CylinderGeometry(0.01, 0.01, cfg.dropLength, 8);
    const rod = new THREE.Mesh(rodGeo, baseMat);
    rod.position.y = cfg.dropLength / 2 + cfg.shadeHeight / 2;
    group.add(rod);

    // 3. Shade
    const shadeGeo = createShadeGeometry(
      cfg.shadeShape,
      shadeTopRadius,
      shadeBottomRadius,
      cfg.shadeHeight,
    );
    const shade = new THREE.Mesh(shadeGeo, shadeMat);
    shade.position.y = cfg.shadeHeight / 2;
    shade.castShadow = true;
    shade.receiveShadow = true;
    group.add(shade);

    // 4. Socket + bulb
    const socket = createSocket();
    socket.position.y = cfg.shadeHeight * 0.3;
    group.add(socket);

    const bulb = createBulbMesh(cfg.temperature);
    bulb.position.y = cfg.shadeHeight * 0.15;
    group.add(bulb);

    // 5. PointLight with blackbody color
    const intensity = wattageToIntensity(cfg.wattage);
    const light = createBlackbodyLight(cfg.temperature, intensity);
    light.position.y = 0;
    light.distance = 15;
    light.decay = 2;
    group.add(light);

    return {
      group,
      light,
      shade,
      bulb,
      config: cfg,
    };
  }
}

// ============================================================================
// TableLampFactory
// ============================================================================

/** Configuration specific to table lamps */
export interface TableLampConfig extends ProceduralLampConfig {
  /** Base diameter */
  baseDiameter: number;
  /** Base height */
  baseHeight: number;
  /** Stem height */
  stemHeight: number;
  /** Shade diameter */
  shadeDiameter: number;
  /** Shade height */
  shadeHeight: number;
}

/** Default table lamp config */
const DEFAULT_TABLE_LAMP_CONFIG: TableLampConfig = {
  ...DEFAULT_LAMP_CONFIG,
  baseDiameter: 0.16,
  baseHeight: 0.08,
  stemHeight: 0.35,
  shadeDiameter: 0.25,
  shadeHeight: 0.2,
};

/**
 * **Table Lamp Factory** — Creates a table lamp with base, stem, shade,
 * and PointLight.
 *
 * The fixture consists of:
 * 1. Base (various shapes based on baseMaterial)
 * 2. Stem/pole
 * 3. Shade (various shapes)
 * 4. Bulb with blackbody emissive color
 * 5. PointLight with blackbody-correct color temperature
 *
 * @example
 * ```ts
 * const factory = new TableLampFactory();
 * const result = factory.create({ wattage: 40, temperature: 3500 });
 * scene.add(result.group);
 * ```
 */
export class TableLampFactory {
  /**
   * Create a table lamp fixture with geometry and light.
   *
   * @param config — Configuration overrides
   * @returns LampFactoryResult with group, light, shade, and bulb
   */
  create(config: Partial<TableLampConfig> = {}): LampFactoryResult {
    const cfg: TableLampConfig = { ...DEFAULT_TABLE_LAMP_CONFIG, ...config };
    const group = new THREE.Group();
    group.name = 'TableLamp';

    const baseMat = createBaseMaterial(cfg.baseMaterial, cfg.baseColor);
    const shadeMat = createShadeMaterial(cfg.shadeColor);
    const shadeTopRadius = cfg.shadeDiameter * 0.35;
    const shadeBottomRadius = cfg.shadeDiameter / 2;
    const totalStemTop = cfg.baseHeight + cfg.stemHeight;

    // 1. Base
    let baseMesh: THREE.Mesh;
    if (cfg.baseMaterial === 'ceramic' || cfg.baseMaterial === 'glass') {
      // Rounded base
      const baseGeo = new THREE.CylinderGeometry(
        cfg.baseDiameter / 2,
        cfg.baseDiameter / 2,
        cfg.baseHeight,
        24,
      );
      baseMesh = new THREE.Mesh(baseGeo, baseMat);
    } else if (cfg.baseMaterial === 'wood') {
      // Turned wood base
      const baseGeo = new THREE.CylinderGeometry(
        cfg.baseDiameter / 2,
        cfg.baseDiameter / 2 * 1.1,
        cfg.baseHeight,
        16,
      );
      baseMesh = new THREE.Mesh(baseGeo, baseMat);
    } else {
      // Metal — slim profile
      const baseGeo = new THREE.CylinderGeometry(
        cfg.baseDiameter / 2,
        cfg.baseDiameter / 2,
        cfg.baseHeight * 0.7,
        24,
      );
      baseMesh = new THREE.Mesh(baseGeo, baseMat);
    }

    baseMesh.position.y = cfg.baseHeight / 2;
    baseMesh.castShadow = true;
    baseMesh.receiveShadow = true;
    group.add(baseMesh);

    // 2. Stem
    const stemRadius = 0.015;
    const stemGeo = new THREE.CylinderGeometry(stemRadius, stemRadius, cfg.stemHeight, 12);
    const stem = new THREE.Mesh(stemGeo, baseMat);
    stem.position.y = cfg.baseHeight + cfg.stemHeight / 2;
    stem.castShadow = true;
    group.add(stem);

    // 3. Shade
    const shadeGeo = createShadeGeometry(
      cfg.shadeShape,
      shadeTopRadius,
      shadeBottomRadius,
      cfg.shadeHeight,
    );
    const shade = new THREE.Mesh(shadeGeo, shadeMat);
    shade.position.y = totalStemTop + cfg.shadeHeight / 2;
    shade.castShadow = true;
    shade.receiveShadow = true;
    group.add(shade);

    // 4. Socket + bulb
    const socket = createSocket();
    socket.position.y = totalStemTop + cfg.shadeHeight * 0.3;
    group.add(socket);

    const bulb = createBulbMesh(cfg.temperature);
    bulb.position.y = totalStemTop + cfg.shadeHeight * 0.15;
    group.add(bulb);

    // 5. PointLight with blackbody color
    const intensity = wattageToIntensity(cfg.wattage);
    const light = createBlackbodyLight(cfg.temperature, intensity);
    light.position.y = totalStemTop;
    light.distance = 12;
    light.decay = 2;
    group.add(light);

    return {
      group,
      light,
      shade,
      bulb,
      config: cfg,
    };
  }
}

// ============================================================================
// FloorLampFactory
// ============================================================================

/** Configuration specific to floor lamps */
export interface FloorLampConfig extends ProceduralLampConfig {
  /** Base diameter */
  baseDiameter: number;
  /** Base height */
  baseHeight: number;
  /** Stand/pole height */
  standHeight: number;
  /** Shade diameter */
  shadeDiameter: number;
  /** Shade height */
  shadeHeight: number;
  /** Whether the stand has a torchiere (upward-facing) design */
  torchiere: boolean;
}

/** Default floor lamp config */
const DEFAULT_FLOOR_LAMP_CONFIG: FloorLampConfig = {
  ...DEFAULT_LAMP_CONFIG,
  baseDiameter: 0.25,
  baseHeight: 0.05,
  standHeight: 1.5,
  shadeDiameter: 0.4,
  shadeHeight: 0.28,
  torchiere: false,
};

/**
 * **Floor Lamp Factory** — Creates a floor lamp with stand, shade,
 * and PointLight.
 *
 * The fixture consists of:
 * 1. Heavy base (wider than table lamp for stability)
 * 2. Tall stand/pole
 * 3. Shade (various shapes, or torchiere uplight)
 * 4. Bulb with blackbody emissive color
 * 5. PointLight with blackbody-correct color temperature
 *
 * @example
 * ```ts
 * const factory = new FloorLampFactory();
 * const result = factory.create({ wattage: 75, temperature: 3000, torchiere: true });
 * scene.add(result.group);
 * ```
 */
export class FloorLampFactory {
  /**
   * Create a floor lamp fixture with geometry and light.
   *
   * @param config — Configuration overrides
   * @returns LampFactoryResult with group, light, shade, and bulb
   */
  create(config: Partial<FloorLampConfig> = {}): LampFactoryResult {
    const cfg: FloorLampConfig = { ...DEFAULT_FLOOR_LAMP_CONFIG, ...config };
    const group = new THREE.Group();
    group.name = 'FloorLamp';

    const baseMat = createBaseMaterial(cfg.baseMaterial, cfg.baseColor);
    const shadeMat = createShadeMaterial(cfg.shadeColor);
    const shadeTopRadius = cfg.shadeDiameter * 0.35;
    const shadeBottomRadius = cfg.shadeDiameter / 2;
    const standTop = cfg.baseHeight + cfg.standHeight;

    // 1. Base — heavy and wide for stability
    const baseGeo = new THREE.CylinderGeometry(
      cfg.baseDiameter / 2,
      cfg.baseDiameter / 2 * 1.1, // slightly wider at bottom
      cfg.baseHeight,
      24,
    );
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = cfg.baseHeight / 2;
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);

    // 2. Stand/pole
    const standRadius = 0.02;
    const standGeo = new THREE.CylinderGeometry(
      standRadius,
      standRadius * 1.2,
      cfg.standHeight,
      12,
    );
    const stand = new THREE.Mesh(standGeo, baseMat);
    stand.position.y = cfg.baseHeight + cfg.standHeight / 2;
    stand.castShadow = true;
    group.add(stand);

    // Optional: decorative ring at stand midpoint
    const ringGeo = new THREE.TorusGeometry(standRadius * 2.5, 0.005, 8, 16);
    const ring = new THREE.Mesh(ringGeo, baseMat);
    ring.position.y = cfg.baseHeight + cfg.standHeight * 0.5;
    ring.rotation.x = Math.PI / 2;
    group.add(ring);

    if (cfg.torchiere) {
      // Torchiere design — upward-facing bowl shade
      const torchiereGeo = new THREE.SphereGeometry(
        cfg.shadeDiameter / 2,
        24,
        12,
        0,
        Math.PI * 2,
        0,
        Math.PI / 2.5,
      );
      const shade = new THREE.Mesh(torchiereGeo, shadeMat);
      shade.position.y = standTop;
      shade.rotation.x = Math.PI; // Flip to face upward
      shade.castShadow = true;
      group.add(shade);

      // Bulb at the top, facing up
      const bulb = createBulbMesh(cfg.temperature, 0.04);
      bulb.position.y = standTop + 0.02;
      group.add(bulb);

      // Light pointing upward
      const intensity = wattageToIntensity(cfg.wattage);
      const light = createBlackbodyLight(cfg.temperature, intensity);
      light.position.y = standTop + 0.05;
      light.distance = 20;
      light.decay = 2;
      group.add(light);

      return {
        group,
        light,
        shade,
        bulb,
        config: cfg,
      };
    } else {
      // Standard shade design
      const shadeGeo = createShadeGeometry(
        cfg.shadeShape,
        shadeTopRadius,
        shadeBottomRadius,
        cfg.shadeHeight,
      );
      const shade = new THREE.Mesh(shadeGeo, shadeMat);
      shade.position.y = standTop + cfg.shadeHeight / 2;
      shade.castShadow = true;
      shade.receiveShadow = true;
      group.add(shade);

      // Socket + bulb
      const socket = createSocket();
      socket.position.y = standTop + cfg.shadeHeight * 0.3;
      group.add(socket);

      const bulb = createBulbMesh(cfg.temperature);
      bulb.position.y = standTop + cfg.shadeHeight * 0.15;
      group.add(bulb);

      // PointLight with blackbody color
      const intensity = wattageToIntensity(cfg.wattage);
      const light = createBlackbodyLight(cfg.temperature, intensity);
      light.position.y = standTop;
      light.distance = 18;
      light.decay = 2;
      group.add(light);

      return {
        group,
        light,
        shade,
        bulb,
        config: cfg,
      };
    }
  }
}

// ============================================================================
// Convenience factory functions
// ============================================================================

/**
 * Create a ceiling lamp in a single call.
 */
export function createCeilingLamp(
  config: Partial<CeilingLampConfig> = {},
): LampFactoryResult {
  return new CeilingLampFactory().create(config);
}

/**
 * Create a table lamp in a single call.
 */
export function createTableLamp(
  config: Partial<TableLampConfig> = {},
): LampFactoryResult {
  return new TableLampFactory().create(config);
}

/**
 * Create a floor lamp in a single call.
 */
export function createFloorLamp(
  config: Partial<FloorLampConfig> = {},
): LampFactoryResult {
  return new FloorLampFactory().create(config);
}
