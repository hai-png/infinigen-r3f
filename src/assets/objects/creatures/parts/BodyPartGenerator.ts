/**
 * BodyPartGenerator - NURBS-driven body part generation for creatures
 *
 * Generates anatomically detailed body parts (torso, neck, tail base) using
 * the NURBS surface framework. Leverages species-specific control point data
 * and parametric body profiles to produce BufferGeometry with proper normals,
 * UVs, vertex colors, and named attachment points.
 *
 * Key features:
 * - Uses NURBSBodyBuilder for NURBS surface construction and tessellation
 * - Integrates with nurbsControlPointData (30+ entries across 22+ species)
 * - Supports deformation: muscle bulge, fat distribution, age scaling
 * - Integrates with CreatureGenome for genetic variation
 * - Computes named attachment points for head, limbs, tail
 * - Produces BufferGeometry with position, normal, uv, and color attributes
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';
import { NURBSBodyBuilder, AttachmentPoint, NURBSBodyResult, TessellationConfig, TESSELLATION_MEDIUM } from '../nurbs/NURBSBodyBuilder';
import { BodyProfileType, BodyProfileConfig, DEFAULT_BODY_PROFILE_CONFIG } from '../nurbs/NURBSBodyProfile';
import { hasSpeciesData, getSpeciesData } from '../nurbs/nurbsControlPointData';
import { CreatureGenome, GeneColor } from '../genome/CreatureGenome';

// ── Type Definitions ──────────────────────────────────────────────────

/**
 * The type of body part to generate.
 */
export type BodyPartType = 'torso' | 'neck' | 'tailBase' | 'head' | 'fullBody';

/**
 * Deformation parameters for body part modification.
 */
export interface DeformationParams {
  /** Muscle bulge factor: 0 = no muscle, 1 = very muscular (default 0.3) */
  muscleBulge: number;
  /** Fat distribution factor: 0 = lean, 1 = obese (default 0.1) */
  fatDistribution: number;
  /** Age scaling factor: 0 = juvenile, 1 = elderly (default 0.3) */
  ageScale: number;
  /** Asymmetry factor: 0 = perfectly symmetric, 1 = very asymmetric (default 0.02) */
  asymmetry: number;
}

/**
 * Parameters for body part generation.
 */
export interface BodyPartParams {
  /** Species identifier, e.g. "feline_tiger", "bird_duck" */
  species: string;
  /** Which body part to generate */
  partType: BodyPartType;
  /** Tessellation quality (default MEDIUM) */
  tessellation?: TessellationConfig;
  /** Deformation parameters */
  deformation?: Partial<DeformationParams>;
  /** Override body profile parameters */
  profileOverrides?: Partial<BodyProfileConfig>;
  /** Random variation amount for organic feel (0 = exact, 1 = full variation) */
  variation?: number;
  /** Scale multiplier for the body (1.0 = original size) */
  scaleMultiplier?: number;
  /** Optional genome for genetic variation */
  genome?: CreatureGenome;
  /** Color for vertex coloring (optional) */
  baseColor?: THREE.Color;
}

/**
 * Result of body part generation.
 */
export interface BodyPartResult {
  /** The generated BufferGeometry */
  geometry: THREE.BufferGeometry;
  /** Named attachment points for part assembly */
  attachmentPoints: Map<string, AttachmentPoint>;
  /** The body profile configuration used */
  config: BodyProfileConfig;
  /** The species this part was generated for */
  species: string;
  /** The type of body part */
  partType: BodyPartType;
  /** Bounding box of the generated geometry */
  boundingBox: THREE.Box3;
}

// ── Default Deformation ───────────────────────────────────────────────

const DEFAULT_DEFORMATION: DeformationParams = {
  muscleBulge: 0.3,
  fatDistribution: 0.1,
  ageScale: 0.3,
  asymmetry: 0.02,
};

// ── Species-to-Profile Mapping ────────────────────────────────────────

/**
 * Map a species name to a BodyProfileType.
 * Falls back to 'mammal' for unknown species.
 */
function speciesToProfileType(species: string): BodyProfileType {
  if (species.startsWith('feline') || species.startsWith('carnivore') || species.startsWith('herbivore')) return 'mammal';
  if (species.startsWith('canine')) return 'mammal';
  if (species.startsWith('bird')) return 'bird';
  if (species.startsWith('fish')) return 'fish';
  if (species.startsWith('insect') || species.startsWith('arthropod')) return 'insect';
  if (species.startsWith('reptile') || species.startsWith('snake') || species.startsWith('lizard')) return 'reptile';
  if (species.startsWith('amphibian') || species.startsWith('frog') || species.startsWith('salamander')) return 'amphibian';
  return 'mammal';
}

// ── BodyPartGenerator Class ───────────────────────────────────────────

/**
 * Generates body parts from NURBS profiles with parametric control,
 * deformation support, and attachment point computation.
 *
 * Usage:
 * ```ts
 * const generator = new BodyPartGenerator(42);
 * const result = generator.generateBodyPart('feline_tiger', {
 *   species: 'feline_tiger',
 *   partType: 'torso',
 *   deformation: { muscleBulge: 0.6 },
 * });
 * const mesh = new THREE.Mesh(result.geometry, material);
 * const headPos = result.attachmentPoints.get('head')?.position;
 * ```
 */
export class BodyPartGenerator {
  private rng: SeededRandom;
  private builder: NURBSBodyBuilder;

  constructor(seed: number = 42) {
    this.rng = new SeededRandom(seed);
    this.builder = new NURBSBodyBuilder(seed);
  }

  /**
   * Generate a body part for the given species and parameters.
   *
   * The method:
   * 1. Resolves the species to a profile type (mammal, bird, etc.)
   * 2. Attempts to use species-specific NURBS control point data
   * 3. Falls back to parametric body profiles if no data exists
   * 4. Applies deformation (muscle, fat, age, asymmetry)
   * 5. Applies genome-driven genetic variation
   * 6. Computes attachment points
   * 7. Returns geometry with normals, UVs, and vertex colors
   *
   * @param species - Species identifier (e.g., "feline_tiger")
   * @param params - Generation parameters
   * @returns BodyPartResult with geometry, attachment points, and metadata
   */
  generateBodyPart(species: string, params: BodyPartParams): BodyPartResult {
    const profileType = speciesToProfileType(species);
    const variation = params.variation ?? 0.05;
    const scaleMultiplier = params.scaleMultiplier ?? 1.0;
    const tessellation = params.tessellation ?? TESSELLATION_MEDIUM;
    const deformation: DeformationParams = {
      ...DEFAULT_DEFORMATION,
      ...params.deformation,
    };

    // Step 1: Build the NURBS body result
    let bodyResult: NURBSBodyResult;

    if (hasSpeciesData('body', species)) {
      // Use species-specific control point data
      const result = this.builder.fromControlPointData(
        species, variation, scaleMultiplier, tessellation,
      );
      if (result) {
        bodyResult = result;
      } else {
        // Fallback to parametric profile
        bodyResult = this.builder.buildCreatureBody(
          profileType, params.profileOverrides ?? {}, tessellation,
        );
      }
    } else {
      // Use parametric body profile
      bodyResult = this.builder.buildCreatureBody(
        profileType, params.profileOverrides ?? {}, tessellation,
      );
    }

    // Step 2: Extract geometry and apply deformation
    let geometry = bodyResult.geometry;

    // Apply deformation to vertex positions
    geometry = this.applyDeformation(geometry, deformation, profileType);

    // Step 3: Apply genome-driven variation
    if (params.genome) {
      geometry = this.applyGenomeVariation(geometry, params.genome, profileType);
    }

    // Step 4: Add vertex colors
    geometry = this.addVertexColors(geometry, params.baseColor, profileType);

    // Step 5: Compute bounding box
    geometry.computeBoundingBox();
    const boundingBox = geometry.boundingBox!.clone();

    // Step 6: Filter attachment points based on part type
    const attachmentPoints = this.filterAttachmentPoints(
      bodyResult.attachmentPoints, params.partType,
    );

    return {
      geometry,
      attachmentPoints,
      config: bodyResult.config,
      species,
      partType: params.partType,
      boundingBox,
    };
  }

  /**
   * Generate a complete creature body (all parts combined).
   * Convenience method that generates a full body result.
   *
   * @param species - Species identifier
   * @param profileOverrides - Optional body profile parameter overrides
   * @param variation - Random variation amount
   * @param scaleMultiplier - Scale factor
   * @returns BodyPartResult for the complete body
   */
  generateFullBody(
    species: string,
    profileOverrides?: Partial<BodyProfileConfig>,
    variation: number = 0.05,
    scaleMultiplier: number = 1.0,
  ): BodyPartResult {
    return this.generateBodyPart(species, {
      species,
      partType: 'fullBody',
      profileOverrides,
      variation,
      scaleMultiplier,
    });
  }

  /**
   * Generate a head part from species-specific NURBS control point data.
   *
   * @param species - Species identifier
   * @param variation - Random variation amount
   * @param scaleMultiplier - Scale factor
   * @returns BodyPartResult for the head, or null if no head data exists
   */
  generateHead(
    species: string,
    variation: number = 0.05,
    scaleMultiplier: number = 1.0,
  ): BodyPartResult | null {
    const headResult = this.builder.buildHeadFromControlPointData(
      species, variation, scaleMultiplier, TESSELLATION_MEDIUM,
    );
    if (!headResult) return null;

    let geometry = headResult.geometry;

    // Add vertex colors
    const profileType = speciesToProfileType(species);
    geometry = this.addVertexColors(geometry, undefined, profileType);

    geometry.computeBoundingBox();

    return {
      geometry,
      attachmentPoints: headResult.attachmentPoints,
      config: headResult.config,
      species,
      partType: 'head',
      boundingBox: geometry.boundingBox!.clone(),
    };
  }

  // ── Deformation Methods ───────────────────────────────────────────

  /**
   * Apply deformation to geometry vertices.
   * Modifies vertex positions based on muscle bulge, fat distribution,
   * age scaling, and asymmetry parameters.
   */
  private applyDeformation(
    geometry: THREE.BufferGeometry,
    deformation: DeformationParams,
    profileType: BodyProfileType,
  ): THREE.BufferGeometry {
    const posAttr = geometry.getAttribute('position');
    const normalAttr = geometry.getAttribute('normal');
    const uvAttr = geometry.getAttribute('uv');

    if (!posAttr || !normalAttr) return geometry;

    const positions = new Float32Array(posAttr.array);
    const normals = normalAttr.array;
    const uvs = uvAttr ? uvAttr.array : null;
    const vertexCount = posAttr.count;

    for (let i = 0; i < vertexCount; i++) {
      const px = positions[i * 3];
      const py = positions[i * 3 + 1];
      const pz = positions[i * 3 + 2];
      const nx = normals[i * 3];
      const ny = normals[i * 3 + 1];
      const nz = normals[i * 3 + 2];

      // Get UV for position-dependent effects
      const u = uvs ? uvs[i * 2] : 0.5;
      const v = uvs ? uvs[i * 2 + 1] : 0.5;

      // ── Muscle Bulge ─────────────────────────────────────
      // Muscle creates localized bulges at limb attachment regions
      // The bulge is strongest around u=0.25 (front limbs) and u=0.6 (hind limbs)
      let muscleOffset = 0;
      if (deformation.muscleBulge > 0) {
        const frontLimbProx = Math.exp(-Math.pow((u - 0.25) * 8, 2));
        const hindLimbProx = Math.exp(-Math.pow((u - 0.6) * 8, 2));
        const shoulderBulge = Math.exp(-Math.pow((u - 0.2) * 6, 2)) * 0.5;

        // Muscle bulge is more pronounced on the lateral sides (v ~0.25 and 0.75)
        const lateralFactor = Math.sin(v * Math.PI * 2) * 0.5 + 0.5;
        const muscleMag = deformation.muscleBulge * 0.15;
        muscleOffset = muscleMag * (frontLimbProx + hindLimbProx + shoulderBulge) * lateralFactor;
      }

      // ── Fat Distribution ─────────────────────────────────
      // Fat accumulates ventrally (v ~0.5) and centrally (u ~0.4-0.6)
      let fatOffset = 0;
      if (deformation.fatDistribution > 0) {
        // Ventral proximity: strongest at bottom of cross-section
        const ventralFactor = Math.pow(Math.sin(v * Math.PI), 2);
        // Central body proximity
        const centralFactor = Math.exp(-Math.pow((u - 0.45) * 3, 2));
        const fatMag = deformation.fatDistribution * 0.2;
        fatOffset = fatMag * ventralFactor * centralFactor;
      }

      // ── Age Scaling ──────────────────────────────────────
      // Older creatures: saggy skin (downward displacement on ventral side),
      // reduced muscle definition, slight shrinkage
      let ageOffset = 0;
      if (deformation.ageScale > 0) {
        // Sagging: ventral vertices move downward
        const ventralWeight = Math.max(0, -py) / (Math.abs(py) + 0.01);
        const sagAmount = deformation.ageScale * 0.05 * ventralWeight;

        // Skin loosening: slight outward displacement
        const loosenAmount = deformation.ageScale * 0.03 * Math.sin(v * Math.PI);

        // Apply sag as Y displacement
        positions[i * 3 + 1] -= sagAmount;
        ageOffset = loosenAmount;
      }

      // ── Asymmetry ────────────────────────────────────────
      // Random lateral offset to break perfect bilateral symmetry
      let asymOffset = 0;
      if (deformation.asymmetry > 0) {
        // Use deterministic noise based on vertex position
        const noise = this.simpleHashNoise(px * 13.37, py * 7.13, pz * 3.71);
        asymOffset = deformation.asymmetry * 0.05 * noise;
      }

      // ── Apply Combined Displacement Along Normal ─────────
      const totalOffset = muscleOffset + fatOffset + ageOffset + asymOffset;
      if (Math.abs(totalOffset) > 1e-6) {
        positions[i * 3]     += nx * totalOffset;
        positions[i * 3 + 1] += ny * totalOffset;
        positions[i * 3 + 2] += nz * totalOffset;
      }
    }

    const deformedGeometry = geometry.clone();
    deformedGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    deformedGeometry.computeVertexNormals();

    return deformedGeometry;
  }

  /**
   * Apply genome-driven variation to geometry.
   * Reads body-related genes and modifies geometry accordingly.
   */
  private applyGenomeVariation(
    geometry: THREE.BufferGeometry,
    genome: CreatureGenome,
    profileType: BodyProfileType,
  ): THREE.BufferGeometry {
    const posAttr = geometry.getAttribute('position');
    if (!posAttr) return geometry;

    const positions = new Float32Array(posAttr.array);
    const vertexCount = posAttr.count;

    // Extract genome influence values with safe defaults
    const bodyLengthGene = genome.getGene('bodyLength');
    const bodyWidthGene = genome.getGene('bodyWidth');
    const bodyHeightGene = genome.getGene('bodyHeight');
    const muscleMassGene = genome.getGene('muscleMass');
    const fatGene = genome.getGene('fatRatio');

    // Compute scale factors from genome
    const lengthScale = bodyLengthGene ? (bodyLengthGene.value as number) : 1.0;
    const widthScale = bodyWidthGene ? (bodyWidthGene.value as number) : 1.0;
    const heightScale = bodyHeightGene ? (bodyHeightGene.value as number) : 1.0;
    const muscleFactor = muscleMassGene ? (muscleMassGene.value as number) : 0.3;
    const fatFactor = fatGene ? (fatGene.value as number) : 0.1;

    // Normalize scales (genome values may be in different units)
    const normLength = Math.max(0.5, Math.min(2.0, lengthScale / 1.5));
    const normWidth = Math.max(0.5, Math.min(2.0, widthScale / 0.4));
    const normHeight = Math.max(0.5, Math.min(2.0, heightScale / 0.35));

    for (let i = 0; i < vertexCount; i++) {
      // Apply anisotropic scaling based on genome
      positions[i * 3]     *= normWidth;   // X = lateral
      positions[i * 3 + 1] *= normHeight;  // Y = vertical
      positions[i * 3 + 2] *= normLength;  // Z = longitudinal
    }

    const variedGeometry = geometry.clone();
    variedGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    variedGeometry.computeVertexNormals();

    return variedGeometry;
  }

  /**
   * Add vertex color attribute to geometry.
   * Colors are based on the base color with positional variation for
   * countershading (darker on top, lighter on bottom).
   */
  private addVertexColors(
    geometry: THREE.BufferGeometry,
    baseColor: THREE.Color | undefined,
    profileType: BodyProfileType,
  ): THREE.BufferGeometry {
    const posAttr = geometry.getAttribute('position');
    const normalAttr = geometry.getAttribute('normal');
    if (!posAttr || !normalAttr) return geometry;

    const defaultColor = baseColor ?? this.getDefaultColor(profileType);
    const vertexCount = posAttr.count;
    const colors = new Float32Array(vertexCount * 3);

    for (let i = 0; i < vertexCount; i++) {
      const py = posAttr.getY(i);
      const ny = normalAttr.getY(i);

      // Countershading: dorsal (top) is darker, ventral (bottom) is lighter
      // This is a common natural pattern seen in most animals
      const dorsalFactor = Math.max(0, ny) * 0.15; // Darker on top
      const ventralFactor = Math.max(0, -ny) * 0.1; // Lighter on bottom

      // Position-based variation: slight darkening toward extremities
      const pz = posAttr.getZ(i);
      const extremityDarken = 0.05;

      colors[i * 3]     = Math.max(0, Math.min(1, defaultColor.r - dorsalFactor + ventralFactor - extremityDarken * 0.5));
      colors[i * 3 + 1] = Math.max(0, Math.min(1, defaultColor.g - dorsalFactor * 0.8 + ventralFactor * 0.8 - extremityDarken * 0.3));
      colors[i * 3 + 2] = Math.max(0, Math.min(1, defaultColor.b - dorsalFactor * 0.6 + ventralFactor * 0.6 - extremityDarken * 0.2));
    }

    const coloredGeometry = geometry.clone();
    coloredGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    return coloredGeometry;
  }

  /**
   * Filter attachment points based on the body part type.
   * Only returns attachment points relevant to the requested part.
   */
  private filterAttachmentPoints(
    allPoints: Map<string, AttachmentPoint>,
    partType: BodyPartType,
  ): Map<string, AttachmentPoint> {
    const filtered = new Map<string, AttachmentPoint>();

    // Define which attachment points belong to each part type
    const partAttachments: Record<BodyPartType, string[]> = {
      torso: ['frontLeftLeg', 'frontRightLeg', 'hindLeftLeg', 'hindRightLeg', 'dorsalMid', 'ventralMid', 'leftWing', 'rightWing', 'breast', 'midLeftLeg', 'midRightLeg', 'leftPectoralFin', 'rightPectoralFin', 'dorsalFin', 'analFin', 'gillLeft', 'gillRight'],
      neck: ['head', 'neck', 'leftEar', 'rightEar', 'leftEye', 'rightEye', 'beak', 'leftAntenna', 'rightAntenna'],
      tailBase: ['tailBase'],
      head: ['head', 'neck', 'leftEar', 'rightEar', 'beak', 'leftEye', 'rightEye', 'leftAntenna', 'rightAntenna'],
      fullBody: [], // Empty = keep all
    };

    const relevantNames = partAttachments[partType];

    if (relevantNames.length === 0) {
      // Keep all attachment points for fullBody
      return new Map(allPoints);
    }

    for (const [name, point] of allPoints) {
      if (relevantNames.includes(name)) {
        filtered.set(name, point);
      }
    }

    return filtered;
  }

  /**
   * Get a default color for a body profile type.
   * Returns naturalistic colors appropriate to each species type.
   */
  private getDefaultColor(profileType: BodyProfileType): THREE.Color {
    switch (profileType) {
      case 'mammal':
        return new THREE.Color(0x8b7355);   // Warm brown
      case 'reptile':
        return new THREE.Color(0x556b2f);   // Olive green
      case 'bird':
        return new THREE.Color(0x8b7355);   // Drab brown
      case 'fish':
        return new THREE.Color(0xc0c0c0);   // Silver
      case 'amphibian':
        return new THREE.Color(0x2e8b57);   // Green
      case 'insect':
        return new THREE.Color(0x1a1a1a);   // Near black
      default:
        return new THREE.Color(0x888888);   // Gray
    }
  }

  /**
   * Simple deterministic hash-based noise function.
   * Returns a value in approximately [-1, 1].
   * Used for asymmetry and small-scale variation.
   */
  private simpleHashNoise(x: number, y: number, z: number): number {
    let h = (x * 374761393 + y * 668265263 + z * 1013904223) | 0;
    h = ((h ^ (h >> 13)) * 1274126177) | 0;
    h = (h ^ (h >> 16));
    return ((h & 0x7fffffff) / 0x7fffffff) * 2 - 1;
  }

  /**
   * Compute UV mapping based on NURBS parameterization.
   * Re-maps the UV coordinates to be more suitable for texture mapping
   * on organic body shapes.
   *
   * @param geometry - The geometry to remap UVs on
   * @param profileType - The body profile type for UV layout hints
   * @returns Geometry with remapped UVs
   */
  remapUVs(geometry: THREE.BufferGeometry, profileType: BodyProfileType): THREE.BufferGeometry {
    const posAttr = geometry.getAttribute('position');
    const uvAttr = geometry.getAttribute('uv');
    if (!posAttr || !uvAttr) return geometry;

    const positions = posAttr.array;
    const uvs = new Float32Array(uvAttr.array);
    const vertexCount = posAttr.count;

    // Compute bounding box for normalization
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    for (let i = 0; i < vertexCount; i++) {
      const x = positions[i * 3];
      const y = positions[i * 3 + 1];
      const z = positions[i * 3 + 2];
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    }

    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;
    const rangeZ = maxZ - minZ || 1;

    // Remap UVs: u = longitudinal position, v = circumferential angle
    for (let i = 0; i < vertexCount; i++) {
      const x = positions[i * 3];
      const y = positions[i * 3 + 1];
      const z = positions[i * 3 + 2];

      // U: along the body axis (z in model space)
      const u = (z - minZ) / rangeZ;

      // V: around the circumference based on angle from center
      const cx = x / (rangeX * 0.5 + 0.001);
      const cy = y / (rangeY * 0.5 + 0.001);
      const angle = Math.atan2(cy, cx);
      const v = (angle + Math.PI) / (2 * Math.PI);

      uvs[i * 2] = u;
      uvs[i * 2 + 1] = v;
    }

    const remappedGeometry = geometry.clone();
    remappedGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));

    return remappedGeometry;
  }

  /**
   * Get the list of available species that have NURBS control point data.
   * Useful for UI display and validation.
   */
  getAvailableSpecies(): string[] {
    // Known species from nurbsControlPointData
    return [
      'bird_duck', 'bird_gull', 'bird_robin',
      'feline_cheetah', 'feline_housecat', 'feline_tiger', 'feline_tiger_2',
      'herbivore_cow', 'herbivore_deer', 'herbivore_horse', 'herbivore_rhino',
      'carnivore_wolf', 'carnivore_bear',
      'fish_goldfish', 'fish_bass', 'fish_shark', 'fish_trout',
      'reptile_lizard', 'reptile_crocodile', 'reptile_iguana',
      'insect_beetle', 'insect_mantis',
      'amphibian_frog', 'amphibian_salamander',
    ];
  }

  /**
   * Get the profile type for a given species name.
   */
  getProfileType(species: string): BodyProfileType {
    return speciesToProfileType(species);
  }

  /**
   * Create a deformation preset for a given body type.
   * Returns typical deformation parameters for common body shapes.
   */
  static getDeformationPreset(preset: string): DeformationParams {
    switch (preset) {
      case 'muscular':
        return { muscleBulge: 0.8, fatDistribution: 0.05, ageScale: 0.2, asymmetry: 0.03 };
      case 'lean':
        return { muscleBulge: 0.15, fatDistribution: 0.02, ageScale: 0.1, asymmetry: 0.01 };
      case 'obese':
        return { muscleBulge: 0.2, fatDistribution: 0.7, ageScale: 0.3, asymmetry: 0.04 };
      case 'elderly':
        return { muscleBulge: 0.1, fatDistribution: 0.15, ageScale: 0.8, asymmetry: 0.06 };
      case 'juvenile':
        return { muscleBulge: 0.1, fatDistribution: 0.2, ageScale: 0.05, asymmetry: 0.01 };
      case 'athletic':
        return { muscleBulge: 0.5, fatDistribution: 0.05, ageScale: 0.15, asymmetry: 0.02 };
      default:
        return { ...DEFAULT_DEFORMATION };
    }
  }

  /**
   * Create a BodyPartParams object with sensible defaults for a species.
   */
  static createDefaultParams(species: string, partType: BodyPartType = 'fullBody'): BodyPartParams {
    const profileType = speciesToProfileType(species);
    const deformation = DEFAULT_DEFORMATION;

    // Adjust deformation based on profile type
    switch (profileType) {
      case 'mammal':
        deformation.muscleBulge = 0.3;
        deformation.fatDistribution = 0.1;
        break;
      case 'reptile':
        deformation.muscleBulge = 0.15;
        deformation.fatDistribution = 0.05;
        break;
      case 'bird':
        deformation.muscleBulge = 0.2;
        deformation.fatDistribution = 0.08;
        break;
      case 'fish':
        deformation.muscleBulge = 0.25;
        deformation.fatDistribution = 0.03;
        break;
      case 'insect':
        deformation.muscleBulge = 0.05;
        deformation.fatDistribution = 0.0;
        break;
      case 'amphibian':
        deformation.muscleBulge = 0.1;
        deformation.fatDistribution = 0.05;
        break;
    }

    return {
      species,
      partType,
      deformation,
      variation: 0.05,
      scaleMultiplier: 1.0,
    };
  }
}
