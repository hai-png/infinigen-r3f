/**
 * CompositionalGenome.ts — Tree-structured compositional genome for creature generation
 *
 * Implements the original Infinigen's Tree[CreatureNode] architecture where each node
 * holds a PartFactory and an Attachment, replacing the flat gene map (Map<string, CreatureGene>)
 * with a compositional part-tree that captures hierarchical body structure.
 *
 * Key innovations over the flat gene pool:
 * 1. Part-tree structure mirrors actual creature anatomy (torso → head → eyes, etc.)
 * 2. BVH raycast surface attachment — child parts placed on parent surface via raycast
 * 3. Joint constraints per part enable realistic animation
 * 4. Bipartite matching on attachment coordinates for smooth cross-species interpolation
 * 5. Deterministic generation given the same seed and params
 *
 * Architecture matches the original Infinigen:
 *   CreatureGenome = Tree[CreatureNode]
 *   CreatureNode = { PartFactory, Attachment, JointConfig, IKParams, children }
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';
import { GeometryPipeline } from '@/assets/utils/GeometryPipeline';

// ============================================================================
// PartType — All body part types
// ============================================================================

/**
 * Enumeration of all body part types in the compositional genome.
 * Each type maps to a specific PartFactory that generates the geometry.
 */
export enum PartType {
  Torso = 'torso',
  Head = 'head',
  Limb = 'limb',
  Tail = 'tail',
  Wing = 'wing',
  Fin = 'fin',
  Eye = 'eye',
  Mouth = 'mouth',
  Ear = 'ear',
  Horn = 'horn',
  Antenna = 'antenna',
}

// ============================================================================
// JointConfig — Joint parameters for animation
// ============================================================================

/**
 * Describes the joint connecting a child part to its parent.
 * Joint limits are essential for realistic animation and IK solving.
 */
export interface JointConfig {
  /** Joint type determining degrees of freedom */
  type: 'hinge' | 'ball' | 'weld' | 'prismatic';
  /** Rotation axis for hinge joints (in parent's local space) */
  axis: THREE.Vector3;
  /** Per-axis rotation limits in radians */
  limits: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
  };
  /** Joint stiffness (0 = fully compliant, 1 = fully rigid) */
  stiffness: number;
  /** Joint stretch factor (0 = no stretch, 1 = max stretch) */
  stretch: number;
}

// ============================================================================
// IKParams — Inverse kinematics parameters
// ============================================================================

/**
 * IK parameters for a part in the tree.
 * Controls how the part's bone chain is solved for IK targets.
 */
export interface IKParams {
  /** Number of bones in the IK chain for this part */
  chainCount: number;
  /** Rotation weight for IK solving (0–1) */
  rotationWeight: number;
  /** IK solving mode */
  mode: 'auto' | 'manual';
  /** Offset from part center for the IK target position */
  targetOffset: THREE.Vector3;
}

// ============================================================================
// Attachment — How a child part attaches to parent
// ============================================================================

/**
 * Describes how a child part attaches to its parent part.
 * Supports three attachment methods matching the original Infinigen:
 * - raycast_surface: Cast ray from parent center to find surface point
 * - fixed_offset: Known offset from parent center
 * - joint_connected: Connected via a joint (physics-driven)
 */
export class Attachment {
  /** Attachment method */
  method: 'raycast_surface' | 'fixed_offset' | 'joint_connected';

  /** For raycast_surface: direction to cast from parent surface */
  rayDirection: THREE.Vector3;

  /** For fixed_offset: offset from parent center */
  offset: THREE.Vector3;

  /** Target tags on parent surface for attachment (e.g., 'shoulder', 'hip') */
  targetTags: string[];

  /** Attachment coordinate for bipartite matching (3D position in parent space) */
  coordinate: THREE.Vector3;

  constructor(opts?: Partial<Attachment>) {
    this.method = opts?.method ?? 'fixed_offset';
    this.rayDirection = opts?.rayDirection ?? new THREE.Vector3(0, 1, 0);
    this.offset = opts?.offset ?? new THREE.Vector3();
    this.targetTags = opts?.targetTags ?? [];
    this.coordinate = opts?.coordinate ?? new THREE.Vector3();
  }

  /**
   * Create a fixed-offset attachment at the given position.
   */
  static fixed(offset: THREE.Vector3, tags: string[] = []): Attachment {
    return new Attachment({
      method: 'fixed_offset',
      offset: offset.clone(),
      coordinate: offset.clone(),
      targetTags: tags,
    });
  }

  /**
   * Create a raycast-surface attachment.
   */
  static raycast(
    direction: THREE.Vector3,
    offsetHint: THREE.Vector3,
    tags: string[] = [],
  ): Attachment {
    return new Attachment({
      method: 'raycast_surface',
      rayDirection: direction.clone(),
      offset: offsetHint.clone(),
      coordinate: offsetHint.clone(),
      targetTags: tags,
    });
  }

  /**
   * Create a joint-connected attachment.
   */
  static jointConnected(offset: THREE.Vector3, tags: string[] = []): Attachment {
    return new Attachment({
      method: 'joint_connected',
      offset: offset.clone(),
      coordinate: offset.clone(),
      targetTags: tags,
    });
  }

  /**
   * Clone this attachment.
   */
  clone(): Attachment {
    return new Attachment({
      method: this.method,
      rayDirection: this.rayDirection.clone(),
      offset: this.offset.clone(),
      targetTags: [...this.targetTags],
      coordinate: this.coordinate.clone(),
    });
  }
}

// ============================================================================
// PartParams — Parameters passed to PartFactory.generate()
// ============================================================================

/**
 * Parameters for generating a body part's geometry.
 * Each PartFactory interprets these differently.
 */
export interface PartParams {
  /** Scale factor for the part (relative to creature size) */
  scale: number;
  /** Length along the primary axis */
  length: number;
  /** Width perpendicular to primary axis */
  width: number;
  /** Height perpendicular to primary and width axes */
  height: number;
  /** Number of segments (for segmented parts like limbs and tails) */
  segments: number;
  /** Taper ratio from base to tip (0 = no taper, 1 = full taper) */
  taper: number;
  /** Additional named parameters */
  extras: Record<string, number>;
}

// ============================================================================
// PartFactory — Abstract base class for part geometry generation
// ============================================================================

/**
 * Abstract factory that generates geometry for a specific body part type.
 * Each concrete factory knows how to create BufferGeometry for its part type,
 * and provides default attachment, joint, and IK configurations.
 */
export abstract class PartFactory {
  /** The part type this factory produces */
  abstract readonly partType: PartType;

  /**
   * Generate the geometry for this body part.
   * Must be deterministic given the same params and rng seed.
   *
   * @param params - Shape parameters for the part
   * @param rng - Seeded random for deterministic variation
   * @returns The generated BufferGeometry
   */
  abstract generate(params: PartParams, rng: SeededRandom): THREE.BufferGeometry;

  /**
   * Get the default attachment configuration for this part type.
   * Used when no explicit attachment is provided.
   */
  abstract getDefaultAttachment(): Attachment;

  /**
   * Get the default joint configuration for this part type.
   */
  abstract getJointConfig(): JointConfig;
}

// ============================================================================
// Concrete Part Factories
// ============================================================================

/**
 * Generates NURBS tube body with muscle layer variation.
 * Produces the main torso geometry — the root of the part tree.
 */
export class TorsoPartFactory extends PartFactory {
  readonly partType = PartType.Torso;

  generate(params: PartParams, rng: SeededRandom): THREE.BufferGeometry {
    const length = params.scale * params.length;
    const width = params.scale * params.width;
    const height = params.scale * params.height;
    const segments = Math.max(8, params.segments);

    // Create elongated ellipsoid for torso body
    const geo = new THREE.SphereGeometry(1, 24, segments);
    geo.scale(width, height, length);

    // Apply muscle layer variation: slight bulging at shoulder and hip regions
    const posAttr = geo.getAttribute('position');
    for (let i = 0; i < posAttr.count; i++) {
      const z = posAttr.getZ(i);
      const normalizedZ = z / length; // [-1, 1]
      const absZ = Math.abs(normalizedZ);

      // Shoulder bulge at ~30% from head
      const shoulderFactor = 0.08 * Math.exp(-Math.pow((normalizedZ - 0.3) * 5, 2));
      // Hip bulge at ~-30% from center
      const hipFactor = 0.06 * Math.exp(-Math.pow((normalizedZ + 0.3) * 5, 2));

      const bulgeFactor = 1.0 + shoulderFactor + hipFactor;

      // Add slight random muscle asymmetry
      const muscleNoise = rng.nextFloat(-0.02, 0.02);
      const x = posAttr.getX(i);
      const y = posAttr.getY(i);

      posAttr.setX(i, x * (bulgeFactor + muscleNoise));
      posAttr.setY(i, y * (bulgeFactor + muscleNoise * 0.5));
    }
    posAttr.needsUpdate = true;
    geo.computeVertexNormals();

    return geo;
  }

  getDefaultAttachment(): Attachment {
    return Attachment.fixed(new THREE.Vector3(0, 0, 0));
  }

  getJointConfig(): JointConfig {
    return {
      type: 'weld',
      axis: new THREE.Vector3(0, 1, 0),
      limits: { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 },
      stiffness: 1.0,
      stretch: 0,
    };
  }
}

/**
 * Generates head geometry with species-specific shape variation.
 */
export class HeadPartFactory extends PartFactory {
  readonly partType = PartType.Head;

  generate(params: PartParams, rng: SeededRandom): THREE.BufferGeometry {
    const size = params.scale * params.width;
    const snoutLength = params.extras.snoutLength ?? 0.15;

    // Head shape variation based on params
    const shapeVariation = rng.nextFloat(0.8, 1.2);
    const geo = new THREE.SphereGeometry(size, 24, 24);

    // Scale to create head shape (slightly elongated forward)
    geo.scale(shapeVariation, 0.85, 1.0 + snoutLength * 2);

    // Add snout protrusion
    const posAttr = geo.getAttribute('position');
    for (let i = 0; i < posAttr.count; i++) {
      const z = posAttr.getZ(i);
      if (z > size * 0.5) {
        // Front of head — extend for snout
        const t = (z - size * 0.5) / (size * 0.5);
        const snoutExtend = snoutLength * params.scale * t;
        posAttr.setZ(i, z + snoutExtend);
        // Taper snout
        const taperFactor = 1.0 - 0.3 * t;
        posAttr.setX(i, posAttr.getX(i) * taperFactor);
        posAttr.setY(i, posAttr.getY(i) * taperFactor);
      }
    }
    posAttr.needsUpdate = true;
    geo.computeVertexNormals();

    return geo;
  }

  getDefaultAttachment(): Attachment {
    return Attachment.raycast(
      new THREE.Vector3(0, 1, 1),
      new THREE.Vector3(0, 0.15, 0.5),
      ['head'],
    );
  }

  getJointConfig(): JointConfig {
    return {
      type: 'ball',
      axis: new THREE.Vector3(0, 1, 0),
      limits: {
        minX: -Math.PI * 0.4,
        maxX: Math.PI * 0.4,
        minY: -Math.PI * 0.25,
        maxY: Math.PI * 0.25,
        minZ: -Math.PI * 0.3,
        maxZ: Math.PI * 0.3,
      },
      stiffness: 0.6,
      stretch: 0.02,
    };
  }
}

/**
 * Generates arm/leg with configurable segments.
 * Produces a limb with upper and lower segments, tapering from base to tip.
 */
export class LimbPartFactory extends PartFactory {
  readonly partType = PartType.Limb;

  generate(params: PartParams, rng: SeededRandom): THREE.BufferGeometry {
    const totalLength = params.scale * params.length;
    const baseRadius = params.scale * params.width * 0.5;
    const tipRadius = baseRadius * (1.0 - params.taper);
    const segments = Math.max(2, params.segments);

    // Create limb as a tapered cylinder with segments
    const geo = new THREE.CylinderGeometry(tipRadius, baseRadius, totalLength, 12, segments);

    // Add slight curvature to limb segments
    const posAttr = geo.getAttribute('position');
    for (let i = 0; i < posAttr.count; i++) {
      const y = posAttr.getY(i);
      const normalizedY = y / totalLength + 0.5; // [0, 1] from base to tip
      const curveAmount = Math.sin(normalizedY * Math.PI) * 0.03 * params.scale;
      posAttr.setX(i, posAttr.getX(i) + curveAmount);
    }
    posAttr.needsUpdate = true;
    geo.computeVertexNormals();

    return geo;
  }

  getDefaultAttachment(): Attachment {
    return Attachment.jointConnected(
      new THREE.Vector3(0.3, -0.1, 0.2),
      ['shoulder', 'hip'],
    );
  }

  getJointConfig(): JointConfig {
    return {
      type: 'hinge',
      axis: new THREE.Vector3(1, 0, 0),
      limits: {
        minX: -Math.PI * 0.8,
        maxX: Math.PI * 0.5,
        minY: -Math.PI * 0.15,
        maxY: Math.PI * 0.15,
        minZ: -Math.PI * 0.1,
        maxZ: Math.PI * 0.1,
      },
      stiffness: 0.4,
      stretch: 0.05,
    };
  }
}

/**
 * Generates tail with configurable segments and taper.
 */
export class TailPartFactory extends PartFactory {
  readonly partType = PartType.Tail;

  generate(params: PartParams, rng: SeededRandom): THREE.BufferGeometry {
    const totalLength = params.scale * params.length;
    const baseRadius = params.scale * params.width * 0.3;
    const tipRadius = baseRadius * 0.1;
    const segments = Math.max(4, params.segments);

    // Tapered cylinder for tail
    const geo = new THREE.CylinderGeometry(tipRadius, baseRadius, totalLength, 8, segments);

    // Add downward curve and slight S-bend
    const flexibility = params.extras.flexibility ?? 0.5;
    const posAttr = geo.getAttribute('position');
    for (let i = 0; i < posAttr.count; i++) {
      const y = posAttr.getY(i);
      const normalizedY = y / totalLength + 0.5; // [0, 1]
      const droop = -normalizedY * normalizedY * flexibility * 0.3 * params.scale;
      const sBend = Math.sin(normalizedY * Math.PI * 2) * flexibility * 0.05 * params.scale;
      posAttr.setZ(i, posAttr.getZ(i) + droop);
      posAttr.setX(i, posAttr.getX(i) + sBend);
    }
    posAttr.needsUpdate = true;
    geo.computeVertexNormals();

    return geo;
  }

  getDefaultAttachment(): Attachment {
    return Attachment.raycast(
      new THREE.Vector3(0, 0, -1),
      new THREE.Vector3(0, 0, -0.4),
      ['tail_base'],
    );
  }

  getJointConfig(): JointConfig {
    return {
      type: 'ball',
      axis: new THREE.Vector3(0, 1, 0),
      limits: {
        minX: -Math.PI * 0.5,
        maxX: Math.PI * 0.5,
        minY: -Math.PI * 0.3,
        maxY: Math.PI * 0.3,
        minZ: -Math.PI * 0.6,
        maxZ: Math.PI * 0.2,
      },
      stiffness: 0.3,
      stretch: 0.03,
    };
  }
}

/**
 * Generates wing membrane + bone structure.
 */
export class WingPartFactory extends PartFactory {
  readonly partType = PartType.Wing;

  generate(params: PartParams, rng: SeededRandom): THREE.BufferGeometry {
    const span = params.scale * params.length;
    const chord = params.scale * params.width;
    const thickness = params.scale * params.height * 0.05; // Wings are thin

    // Create wing as a flat, tapered quad
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(span, chord * 0.3);
    shape.lineTo(span * 0.9, chord * 0.15);
    shape.lineTo(span * 0.6, 0);
    shape.lineTo(0, -chord * 0.1);
    shape.closePath();

    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
      depth: thickness,
      bevelEnabled: false,
    };
    const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);

    // Add wing bone ridges on the surface
    const posAttr = geo.getAttribute('position');
    const boneCount = 3;
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const y = posAttr.getY(i);

      // Add subtle bone ridge lines
      for (let b = 1; b <= boneCount; b++) {
        const boneX = (b / (boneCount + 1)) * span;
        const distToBone = Math.abs(x - boneX);
        if (distToBone < span * 0.02) {
          const ridgeHeight = thickness * 2.0 * (1.0 - distToBone / (span * 0.02));
          const z = posAttr.getZ(i);
          posAttr.setZ(i, z + ridgeHeight);
        }
      }

      // Add membrane thinning toward edges
      const edgeFactor = Math.abs(x) / span;
      const membraneThin = 1.0 - edgeFactor * 0.7;
      const z = posAttr.getZ(i);
      posAttr.setZ(i, z * membraneThin);
    }
    posAttr.needsUpdate = true;
    geo.computeVertexNormals();

    return geo;
  }

  getDefaultAttachment(): Attachment {
    return Attachment.jointConnected(
      new THREE.Vector3(0.3, 0.1, 0),
      ['shoulder'],
    );
  }

  getJointConfig(): JointConfig {
    return {
      type: 'ball',
      axis: new THREE.Vector3(0, 0, 1),
      limits: {
        minX: -Math.PI * 0.1,
        maxX: Math.PI * 0.7,
        minY: -Math.PI * 0.3,
        maxY: Math.PI * 0.3,
        minZ: -Math.PI * 0.1,
        maxZ: Math.PI * 0.5,
      },
      stiffness: 0.2,
      stretch: 0.0,
    };
  }
}

/**
 * Generates fin geometry for aquatic creatures.
 */
export class FinPartFactory extends PartFactory {
  readonly partType = PartType.Fin;

  generate(params: PartParams, rng: SeededRandom): THREE.BufferGeometry {
    const width = params.scale * params.width;
    const height = params.scale * params.height;
    const thickness = params.scale * 0.01;

    // Create fin as thin triangular shape
    const vertices = new Float32Array([
      // Front face
      0, height, 0,
      -width / 2, 0, -thickness / 2,
      width / 2, 0, -thickness / 2,
      // Back face
      0, height, 0,
      width / 2, 0, thickness / 2,
      -width / 2, 0, thickness / 2,
      // Left face
      0, height, 0,
      -width / 2, 0, thickness / 2,
      -width / 2, 0, -thickness / 2,
      // Right face
      0, height, 0,
      width / 2, 0, -thickness / 2,
      width / 2, 0, thickness / 2,
      // Bottom face
      -width / 2, 0, -thickness / 2,
      width / 2, 0, -thickness / 2,
      width / 2, 0, thickness / 2,
      -width / 2, 0, -thickness / 2,
      width / 2, 0, thickness / 2,
      -width / 2, 0, thickness / 2,
    ]);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geo.computeVertexNormals();

    // Add slight wave deformation for organic look
    const posAttr = geo.getAttribute('position');
    const waveSeed = rng.nextInt(0, 1000);
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const y = posAttr.getY(i);
      // Sinusoidal wave along the fin
      const wave = Math.sin(x * 5 + waveSeed) * 0.01 * params.scale;
      posAttr.setZ(i, posAttr.getZ(i) + wave * (y / height));
    }
    posAttr.needsUpdate = true;
    geo.computeVertexNormals();

    return geo;
  }

  getDefaultAttachment(): Attachment {
    return Attachment.raycast(
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0.2, 0, 0.1),
      ['pectoral', 'dorsal'],
    );
  }

  getJointConfig(): JointConfig {
    return {
      type: 'hinge',
      axis: new THREE.Vector3(0, 0, 1),
      limits: {
        minX: -Math.PI * 0.4,
        maxX: Math.PI * 0.4,
        minY: -Math.PI * 0.1,
        maxY: Math.PI * 0.1,
        minZ: -0.1,
        maxZ: 0.1,
      },
      stiffness: 0.5,
      stretch: 0.0,
    };
  }
}

/**
 * Generates eye sphere with pupil and iris variation.
 */
export class EyePartFactory extends PartFactory {
  readonly partType = PartType.Eye;

  generate(params: PartParams, rng: SeededRandom): THREE.BufferGeometry {
    const radius = params.scale * params.width * 0.5;
    const detail = Math.max(8, Math.round(radius * 100));

    // Eye is a sphere
    const geo = new THREE.SphereGeometry(radius, detail, detail);

    // Slightly flatten the front of the eye for corneal bulge
    const pupilShape = params.extras.pupilShape ?? 0; // 0=round, 1=slit
    const posAttr = geo.getAttribute('position');
    for (let i = 0; i < posAttr.count; i++) {
      const z = posAttr.getZ(i);
      if (z > radius * 0.6) {
        // Corneal bulge: slightly push forward
        const t = (z - radius * 0.6) / (radius * 0.4);
        const bulge = t * radius * 0.15;
        posAttr.setZ(i, z + bulge);
      }

      // Apply slit pupil deformation
      if (pupilShape === 1) {
        const x = posAttr.getX(i);
        const z = posAttr.getZ(i);
        if (z > radius * 0.7) {
          // Narrow horizontally for slit pupil
          posAttr.setX(i, x * 0.4);
        }
      }
    }
    posAttr.needsUpdate = true;
    geo.computeVertexNormals();

    return geo;
  }

  getDefaultAttachment(): Attachment {
    return Attachment.raycast(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0.15, 0.08, 0.3),
      ['head_front'],
    );
  }

  getJointConfig(): JointConfig {
    return {
      type: 'ball',
      axis: new THREE.Vector3(0, 0, 1),
      limits: {
        minX: -Math.PI * 0.25,
        maxX: Math.PI * 0.25,
        minY: -Math.PI * 0.25,
        maxY: Math.PI * 0.25,
        minZ: 0,
        maxZ: 0,
      },
      stiffness: 0.9,
      stretch: 0,
    };
  }
}

/**
 * Generates jaw/mouth geometry.
 */
export class MouthPartFactory extends PartFactory {
  readonly partType = PartType.Mouth;

  generate(params: PartParams, rng: SeededRandom): THREE.BufferGeometry {
    const width = params.scale * params.width;
    const height = params.scale * params.height * 0.3;
    const depth = (params.extras.snoutLength ?? 0.1) * params.scale;

    const mouthType = Math.round(params.extras.mouthType ?? 0);
    // 0 = jaw, 1 = beak_sharp, 2 = beak_flat

    if (mouthType === 1 || mouthType === 2) {
      // Beak: upper and lower mandible as cones
      const beakLength = depth * 2;
      const beakRadius = width * 0.15;
      const upperGeo = new THREE.ConeGeometry(beakRadius, beakLength, 8);
      // Rotate to point forward
      upperGeo.rotateX(-Math.PI / 2);

      // Flatten for flat beak
      if (mouthType === 2) {
        upperGeo.scale(1.5, 0.5, 1.0);
      }
      return upperGeo;
    }

    // Default: jaw/snout
    const geo = new THREE.SphereGeometry(width * 0.5, 12, 12);
    geo.scale(0.6, 0.5, 1.5);

    return geo;
  }

  getDefaultAttachment(): Attachment {
    return Attachment.raycast(
      new THREE.Vector3(0, -0.5, 1),
      new THREE.Vector3(0, -0.05, 0.3),
      ['head_front', 'jaw'],
    );
  }

  getJointConfig(): JointConfig {
    return {
      type: 'hinge',
      axis: new THREE.Vector3(1, 0, 0),
      limits: {
        minX: 0,
        maxX: Math.PI * 0.4,
        minY: 0,
        maxY: 0,
        minZ: 0,
        maxZ: 0,
      },
      stiffness: 0.5,
      stretch: 0,
    };
  }
}

// ============================================================================
// PartNode — A node in the compositional part-tree
// ============================================================================

/**
 * A node in the compositional part-tree genome.
 * Each node represents a body part with its factory, attachment method,
 * joint configuration, IK parameters, and child parts.
 *
 * The tree structure mirrors actual creature anatomy:
 *   torso → (head → (eyes, mouth, ears), limbs, tail)
 */
export interface PartNode {
  /** Unique identifier for this part node */
  id: string;
  /** The type of body part */
  partType: PartType;
  /** Factory that generates this part's geometry */
  partFactory: PartFactory;
  /** How this part attaches to its parent */
  attachment: Attachment;
  /** Joint parameters for animation */
  joint: JointConfig;
  /** IK parameters for this part */
  ikParams: IKParams;
  /** Child parts attached to this part */
  children: PartNode[];
  /** Local transform relative to parent (computed after geometry generation) */
  transform: THREE.Matrix4;
  /** BVH for raycast (computed after geometry generation) */
  bvh: THREE.Raycaster | null;
  /** Generated geometry (populated after generate() is called) */
  geometry: THREE.BufferGeometry | null;
  /** Part parameters used for geometry generation */
  params: PartParams;
}

// ============================================================================
// SpeciesType and GenomeParams
// ============================================================================

/**
 * Species type for the compositional genome.
 * Determines the overall body plan and part tree structure.
 */
export type SpeciesType = 'mammal' | 'bird' | 'fish' | 'insect' | 'reptile' | 'amphibian';

/**
 * Base parameters shared across all species.
 */
export interface GenomeParams {
  /** Overall creature size multiplier */
  size: number;
  /** Body length (along spine axis) */
  bodyLength: number;
  /** Body width (lateral) */
  bodyWidth: number;
  /** Body height (dorsal-ventral) */
  bodyHeight: number;
  /** Head size relative to body */
  headSize: number;
  /** Leg length relative to body */
  legLength: number;
  /** Leg thickness relative to body width */
  legThickness: number;
  /** Tail length relative to body */
  tailLength: number;
  /** Neck length */
  neckLength: number;
  /** Arm/wing length */
  armLength: number;
  /** Snout/beak length relative to head */
  snoutLength: number;
  /** Number of limb pairs */
  limbPairs: number;
  /** Whether creature has wings */
  hasWings: boolean;
  /** Whether creature has tail */
  hasTail: boolean;
  /** Whether creature has antennae */
  hasAntennae: boolean;
  /** Whether creature has horns */
  hasHorns: boolean;
  /** Tail flexibility (0-1) */
  tailFlexibility: number;
  /** Pupil shape: 0=round, 1=slit */
  pupilShape: number;
  /** Mouth type: 0=jaw, 1=beak_sharp, 2=beak_flat */
  mouthType: number;
}

/**
 * Mammal-specific genome parameters.
 */
export interface MammalParams extends GenomeParams {
  /** Ear size relative to head */
  earSize: number;
  /** Fur length */
  furLength: number;
}

/**
 * Bird-specific genome parameters.
 */
export interface BirdParams extends GenomeParams {
  /** Wing span multiplier */
  wingSpan: number;
  /** Feather count per wing */
  featherCount: number;
}

/**
 * Fish-specific genome parameters.
 */
export interface FishParams extends GenomeParams {
  /** Number of dorsal fin spines */
  dorsalSpines: number;
  /** Streamlining factor (0-1) */
  streamlining: number;
}

/**
 * Insect-specific genome parameters.
 */
export interface InsectParams extends GenomeParams {
  /** Number of leg pairs (typically 3) */
  legPairCount: number;
  /** Antenna length relative to body */
  antennaLength: number;
  /** Whether has wings */
  hasInsectWings: boolean;
}

/**
 * Reptile-specific genome parameters.
 */
export interface ReptileParams extends GenomeParams {
  /** Scale pattern type */
  scalePattern: number;
  /** Body elongation factor */
  elongation: number;
}

/**
 * Amphibian-specific genome parameters.
 */
export interface AmphibianParams extends GenomeParams {
  /** Webbing factor for feet (0-1) */
  webbing: number;
  /** Skin moistness */
  skinMoisture: number;
}

// ============================================================================
// CompositionalGenome — The tree-structured genome
// ============================================================================

/**
 * CompositionalGenome — Tree-structured genome for creature generation.
 *
 * The key innovation over the flat gene pool (Map<string, CreatureGene>) is that
 * the part-tree structure mirrors actual creature anatomy. Each node holds:
 * - A PartFactory that generates the part's geometry
 * - An Attachment describing how it connects to its parent
 * - A JointConfig for animation constraints
 * - IKParams for inverse kinematics
 * - Children (sub-parts)
 *
 * This matches the original Infinigen's Tree[CreatureNode] architecture where
 * CreatureGenome contains a tree of nodes, each with a PartFactory and Attachment.
 */
export class CompositionalGenome {
  /** Root of the part tree (always a torso) */
  root: PartNode;
  /** Species type */
  speciesType: SpeciesType;
  /** Species-specific parameters */
  params: GenomeParams;
  /** Seed for deterministic generation */
  seed: number;

  constructor(root: PartNode, speciesType: SpeciesType, params: GenomeParams, seed: number) {
    this.root = root;
    this.speciesType = speciesType;
    this.params = params;
    this.seed = seed;
  }

  /**
   * Build a compositional genome from species parameters.
   * Deterministic given the same species type, params, and rng seed.
   *
   * @param type - Species type determining body plan
   * @param params - Genome parameters for body proportions
   * @param rng - Seeded random for deterministic variation
   * @returns A new CompositionalGenome with fully populated part tree
   */
  static fromSpecies(type: SpeciesType, params: GenomeParams, rng: SeededRandom): CompositionalGenome {
    const seed = rng.seed;
    const builder = getSpeciesBuilder(type);
    const root = builder(params, rng);
    return new CompositionalGenome(root, type, params, seed);
  }

  /**
   * Interpolate between two genomes using bipartite matching on
   * attachment coordinates for smooth cross-species blending.
   *
   * @param other - The other genome to interpolate with
   * @param t - Interpolation parameter (0 = this, 1 = other)
   * @returns A new interpolated CompositionalGenome
   */
  interpolate(other: CompositionalGenome, t: number): CompositionalGenome {
    return GenomeInterpolator.interpolate(this, other, t);
  }

  /**
   * Get all parts as a flat list (depth-first traversal).
   * Useful for iteration over all body parts.
   */
  getAllParts(): PartNode[] {
    const result: PartNode[] = [];
    this.collectParts(this.root, result);
    return result;
  }

  /**
   * Get parts filtered by type.
   */
  getPartsByType(type: PartType): PartNode[] {
    return this.getAllParts().filter(p => p.partType === type);
  }

  /**
   * Generate geometry for all parts in the tree.
   * Populates each PartNode's geometry and transform fields.
   *
   * @param rng - Seeded random for deterministic generation
   */
  generateAllGeometries(rng: SeededRandom): void {
    this.generateGeometryRecursive(this.root, rng);
    this.computeTransforms(this.root, new THREE.Matrix4());
  }

  /**
   * Generate full skinned mesh from the part tree.
   * Merges all part geometries with skin weights for bone-based animation.
   */
  generateMesh(): THREE.SkinnedMesh {
    // Generate geometries if not done yet
    const rng = new SeededRandom(this.seed);
    this.generateAllGeometries(rng);

    // Collect all geometries and create a merged mesh
    const geometries: THREE.BufferGeometry[] = [];
    this.collectGeometries(this.root, geometries);

    if (geometries.length === 0) {
      // Fallback: return empty skinned mesh
      const emptyGeo = new THREE.BufferGeometry();
      const mat = new THREE.MeshStandardMaterial({ color: 0x888888 });
      (mat as any).skinning = true;
      const mesh = new THREE.SkinnedMesh(emptyGeo, mat);
      return mesh;
    }

    // Merge geometries
    const merged = this.mergeGeometries(geometries);
    const material = new THREE.MeshStandardMaterial({
      color: 0x8b7355,
      roughness: 0.7,
    });
    (material as any).skinning = true;

    // Create skeleton from part tree
    const skeleton = this.generateArmature();
    const mesh = new THREE.SkinnedMesh(merged, material);
    mesh.add(skeleton.bones[0]);
    mesh.bind(skeleton);
    mesh.name = 'creatureSkinnedMesh';

    return mesh;
  }

  /**
   * Generate armature (skeleton) from the part tree.
   * Creates bones at each part node's position with joint constraints.
   */
  generateArmature(): THREE.Skeleton {
    const bones: THREE.Bone[] = [];
    const boneMatrices: THREE.Matrix4[] = [];

    const rootBone = new THREE.Bone();
    rootBone.name = 'root';
    bones.push(rootBone);

    // Build bone hierarchy from part tree
    this.buildBoneHierarchy(this.root, rootBone, bones);

    // Compute inverse bind matrices
    rootBone.updateMatrixWorld(true);
    for (const bone of bones) {
      const m = new THREE.Matrix4();
      bone.updateWorldMatrix(true, false);
      m.copy(bone.matrixWorld).invert();
      boneMatrices.push(m);
    }

    const skeleton = new THREE.Skeleton(bones, boneMatrices);
    skeleton.calculateInverses();
    return skeleton;
  }

  /**
   * Deep clone this genome.
   */
  clone(): CompositionalGenome {
    const clonedRoot = this.cloneNode(this.root);
    return new CompositionalGenome(clonedRoot, this.speciesType, { ...this.params }, this.seed);
  }

  // ── Private Helpers ──────────────────────────────────────────────

  private collectParts(node: PartNode, result: PartNode[]): void {
    result.push(node);
    for (const child of node.children) {
      this.collectParts(child, result);
    }
  }

  private collectGeometries(node: PartNode, result: THREE.BufferGeometry[]): void {
    if (node.geometry) {
      result.push(node.geometry);
    }
    for (const child of node.children) {
      this.collectGeometries(child, result);
    }
  }

  private generateGeometryRecursive(node: PartNode, rng: SeededRandom): void {
    node.geometry = node.partFactory.generate(node.params, rng);

    // Create BVH raycaster for surface attachment
    if (node.geometry) {
      node.bvh = new THREE.Raycaster();
    }

    for (const child of node.children) {
      this.generateGeometryRecursive(child, rng);
    }
  }

  private computeTransforms(node: PartNode, parentWorld: THREE.Matrix4): void {
    // Compute local transform from attachment
    let localTransform: THREE.Matrix4;

    if (node.attachment.method === 'fixed_offset') {
      localTransform = new THREE.Matrix4().setPosition(node.attachment.offset);
    } else if (node.attachment.method === 'raycast_surface' && parentWorld) {
      // For raycast surface, we compute position via BVHRaycastAttachment
      // but since we don't have the parent geometry here during tree construction,
      // fall back to offset as initial placement
      localTransform = new THREE.Matrix4().setPosition(node.attachment.offset);
    } else {
      localTransform = new THREE.Matrix4().setPosition(node.attachment.offset);
    }

    node.transform = localTransform;

    // Compute world transform for children
    const worldTransform = new THREE.Matrix4().multiplyMatrices(parentWorld, localTransform);

    for (const child of node.children) {
      this.computeTransforms(child, worldTransform);
    }
  }

  private buildBoneHierarchy(node: PartNode, parentBone: THREE.Bone, bones: THREE.Bone[]): void {
    for (const child of node.children) {
      const bone = new THREE.Bone();
      bone.name = child.id;

      // Set position from attachment offset
      bone.position.copy(child.attachment.offset);

      // Apply joint constraints as userData for animation system
      bone.userData.jointConfig = child.joint;
      bone.userData.ikParams = child.ikParams;
      bone.userData.rotationLimits = {
        minX: child.joint.limits.minX,
        maxX: child.joint.limits.maxX,
        minY: child.joint.limits.minY,
        maxY: child.joint.limits.maxY,
        minZ: child.joint.limits.minZ,
        maxZ: child.joint.limits.maxZ,
      };

      parentBone.add(bone);
      bones.push(bone);

      this.buildBoneHierarchy(child, bone, bones);
    }
  }

  /**
   * Merge geometries, delegating to the canonical GeometryPipeline.
   */
  private mergeGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
    if (geometries.length === 1) return geometries[0];
    return GeometryPipeline.mergeGeometries(geometries);
  }

  private cloneNode(node: PartNode): PartNode {
    return {
      id: node.id,
      partType: node.partType,
      partFactory: node.partFactory,
      attachment: node.attachment.clone(),
      joint: {
        ...node.joint,
        axis: node.joint.axis.clone(),
        limits: { ...node.joint.limits },
      },
      ikParams: {
        ...node.ikParams,
        targetOffset: node.ikParams.targetOffset.clone(),
      },
      children: node.children.map(c => this.cloneNode(c)),
      transform: node.transform.clone(),
      bvh: null,
      geometry: null,
      params: { ...node.params, extras: { ...node.params.extras } },
    };
  }
}

// ============================================================================
// BVHRaycastAttachment — BVH-accelerated raycast for positioning child parts
// ============================================================================

/**
 * Performs BVH-accelerated raycast for positioning child parts on parent surfaces.
 *
 * Algorithm:
 * 1. Cast ray from parent center + offset in attachment direction
 * 2. Find intersection point on parent mesh
 * 3. Place child at intersection, oriented by surface normal
 *
 * This matches the original Infinigen's BVH raycast surface attachment where
 * child parts are positioned on the parent's surface using ray intersection.
 */
export class BVHRaycastAttachment {
  /**
   * Position a child part on the parent's surface using raycast.
   *
   * @param child - The child part node to position
   * @param parent - The parent part node (must have geometry)
   * @param attachment - Attachment specification
   * @param rng - Seeded random for deterministic jitter
   * @returns The local transform matrix positioning the child on the parent surface
   */
  static attach(
    child: PartNode,
    parent: PartNode,
    attachment: Attachment,
    rng: SeededRandom,
  ): THREE.Matrix4 {
    if (!parent.geometry) {
      // No geometry — fall back to fixed offset
      return new THREE.Matrix4().setPosition(attachment.offset);
    }

    // Create a temporary mesh for raycasting
    const parentMesh = new THREE.Mesh(
      parent.geometry,
      new THREE.MeshBasicMaterial(),
    );

    // Set up raycaster from parent center + offset in attachment direction
    const rayOrigin = attachment.offset.clone();
    const rayDirection = attachment.rayDirection.clone().normalize();

    const raycaster = new THREE.Raycaster(rayOrigin, rayDirection, 0.001, 100);

    // Perform raycast
    const intersections = raycaster.intersectObject(parentMesh);

    if (intersections.length > 0) {
      const hit = intersections[0];
      const position = hit.point.clone();
      const normal = hit.face?.normal?.clone() ?? rayDirection.clone();

      // Add small deterministic jitter for natural variation
      const jitter = new THREE.Vector3(
        rng.nextFloat(-0.005, 0.005),
        rng.nextFloat(-0.005, 0.005),
        rng.nextFloat(-0.005, 0.005),
      );
      position.add(jitter);

      // Build transform: position + orientation from surface normal
      const up = new THREE.Vector3(0, 1, 0);
      const quaternion = new THREE.Quaternion().setFromUnitVectors(up, normal.normalize());
      const rotation = new THREE.Matrix4().makeRotationFromQuaternion(quaternion);
      const translation = new THREE.Matrix4().setPosition(position);

      const result = new THREE.Matrix4().multiplyMatrices(translation, rotation);

      // Update the attachment coordinate for bipartite matching
      attachment.coordinate.copy(position);

      return result;
    }

    // No intersection — fall back to fixed offset
    return new THREE.Matrix4().setPosition(attachment.offset);
  }

  /**
   * Batch-attach all children of a parent node using BVH raycast.
   * Processes children in order, ensuring deterministic placement.
   *
   * @param parent - Parent part node (must have geometry)
   * @param rng - Seeded random for deterministic jitter
   */
  static attachChildren(parent: PartNode, rng: SeededRandom): void {
    for (const child of parent.children) {
      if (child.attachment.method === 'raycast_surface') {
        child.transform = BVHRaycastAttachment.attach(child, parent, child.attachment, rng);
      } else if (child.attachment.method === 'fixed_offset') {
        child.transform = new THREE.Matrix4().setPosition(child.attachment.offset);
      } else {
        // joint_connected: same as fixed_offset for initial placement
        child.transform = new THREE.Matrix4().setPosition(child.attachment.offset);
      }
    }
  }
}

// ============================================================================
// GenomeInterpolator — Smooth cross-species blending via bipartite matching
// ============================================================================

/**
 * Smooth cross-species genome interpolation using bipartite matching.
 *
 * Uses the Hungarian algorithm (maximum bipartite matching) on attachment
 * coordinates for smooth interpolation between different species.
 * This matches the original Infinigen's interp_genome() approach:
 * 1. Match parts between two genomes based on type and attachment coordinate
 * 2. Interpolate positions/shapes for matched pairs
 * 3. Fade out unmatched parts from the minority genome
 */
export class GenomeInterpolator {
  /**
   * Interpolate between two compositional genomes at parameter t.
   *
   * Algorithm:
   * 1. Flatten both genome trees into part lists
   * 2. Build similarity matrix based on part type and attachment coordinate distance
   * 3. Use Hungarian algorithm for optimal matching
   * 4. Interpolate matched pairs (position, scale, joint limits)
   * 5. Fade unmatched parts based on t
   *
   * @param genomeA - First parent genome
   * @param genomeB - Second parent genome
   * @param t - Interpolation parameter (0 = A, 1 = B)
   * @returns New interpolated CompositionalGenome
   */
  static interpolate(
    genomeA: CompositionalGenome,
    genomeB: CompositionalGenome,
    t: number,
  ): CompositionalGenome {
    const partsA = genomeA.getAllParts();
    const partsB = genomeB.getAllParts();

    // Build similarity matrix
    const simMatrix = GenomeInterpolator.buildSimilarityMatrix(partsA, partsB);

    // Compute optimal matching using Hungarian algorithm
    const matching = GenomeInterpolator.hungarianMatching(simMatrix, partsA.length, partsB.length);

    // Track matched parts
    const matchedA = new Set<number>();
    const matchedB = new Set<number>();

    // Start with a clone of the dominant parent
    const dominantGenome = t < 0.5 ? genomeA : genomeB;
    const result = dominantGenome.clone();
    const resultParts = result.getAllParts();

    // Interpolate matched pairs
    for (const [idxA, idxB] of matching) {
      matchedA.add(idxA);
      matchedB.add(idxB);

      const partA = partsA[idxA];
      const partB = partsB[idxB];
      const resultPart = resultParts.find(p => p.id === partA.id || p.id === partB.id);

      if (resultPart) {
        // Interpolate attachment offset
        resultPart.attachment.offset.lerpVectors(partA.attachment.offset, partB.attachment.offset, t);
        resultPart.attachment.coordinate.lerpVectors(partA.attachment.coordinate, partB.attachment.coordinate, t);

        // Interpolate params
        resultPart.params.scale = partA.params.scale + (partB.params.scale - partA.params.scale) * t;
        resultPart.params.length = partA.params.length + (partB.params.length - partA.params.length) * t;
        resultPart.params.width = partA.params.width + (partB.params.width - partA.params.width) * t;
        resultPart.params.height = partA.params.height + (partB.params.height - partA.params.height) * t;

        // Interpolate joint limits
        resultPart.joint.limits.minX = partA.joint.limits.minX + (partB.joint.limits.minX - partA.joint.limits.minX) * t;
        resultPart.joint.limits.maxX = partA.joint.limits.maxX + (partB.joint.limits.maxX - partA.joint.limits.maxX) * t;
        resultPart.joint.limits.minY = partA.joint.limits.minY + (partB.joint.limits.minY - partA.joint.limits.minY) * t;
        resultPart.joint.limits.maxY = partA.joint.limits.maxY + (partB.joint.limits.maxY - partA.joint.limits.maxY) * t;
        resultPart.joint.limits.minZ = partA.joint.limits.minZ + (partB.joint.limits.minZ - partA.joint.limits.minZ) * t;
        resultPart.joint.limits.maxZ = partA.joint.limits.maxZ + (partB.joint.limits.maxZ - partA.joint.limits.maxZ) * t;
        resultPart.joint.stiffness = partA.joint.stiffness + (partB.joint.stiffness - partA.joint.stiffness) * t;
        resultPart.joint.stretch = partA.joint.stretch + (partB.joint.stretch - partA.joint.stretch) * t;
      }
    }

    // Scale down unmatched parts from A
    for (let i = 0; i < partsA.length; i++) {
      if (!matchedA.has(i)) {
        const part = resultParts.find(p => p.id === partsA[i].id);
        if (part) {
          const fadeScale = 1.0 - t;
          part.params.scale *= fadeScale;
        }
      }
    }

    // Scale down unmatched parts from B
    for (let j = 0; j < partsB.length; j++) {
      if (!matchedB.has(j)) {
        const part = resultParts.find(p => p.id === partsB[j].id);
        if (part) {
          const fadeScale = t;
          part.params.scale *= fadeScale;
        }
      }
    }

    // Set species type from dominant parent
    result.speciesType = t < 0.5 ? genomeA.speciesType : genomeB.speciesType;

    return result;
  }

  // ── Private Helpers ──────────────────────────────────────────────

  /**
   * Build similarity matrix between two sets of parts.
   * Similarity is based on:
   * - Part type match (high weight)
   * - Attachment coordinate distance (proximity = higher similarity)
   */
  private static buildSimilarityMatrix(partsA: PartNode[], partsB: PartNode[]): number[][] {
    const matrix: number[][] = [];
    for (let i = 0; i < partsA.length; i++) {
      matrix[i] = [];
      for (let j = 0; j < partsB.length; j++) {
        matrix[i][j] = GenomeInterpolator.partSimilarity(partsA[i], partsB[j]);
      }
    }
    return matrix;
  }

  /**
   * Compute similarity between two parts.
   * Returns a value in [0, 1] where 1 = perfect match.
   */
  private static partSimilarity(a: PartNode, b: PartNode): number {
    let score = 0;

    // Part type match (strongest signal)
    if (a.partType === b.partType) {
      score += 0.6;
    }

    // Attachment coordinate proximity (normalized)
    const coordDist = a.attachment.coordinate.distanceTo(b.attachment.coordinate);
    const proximityScore = Math.max(0, 0.3 * (1.0 - coordDist));
    score += proximityScore;

    // ID similarity (for named parts like 'leftEye', 'rightEye')
    if (a.id === b.id) {
      score += 0.1;
    }

    return Math.min(1, score);
  }

  /**
   * Hungarian algorithm for maximum-weight bipartite matching.
   * Returns pairs of indices [idxA, idxB] representing matched parts.
   */
  private static hungarianMatching(
    simMatrix: number[][],
    nA: number,
    nB: number,
  ): [number, number][] {
    if (nA === 0 || nB === 0) return [];

    const size = Math.max(nA, nB);

    // Pad to square matrix
    const cost: number[][] = [];
    for (let i = 0; i < size; i++) {
      cost[i] = [];
      for (let j = 0; j < size; j++) {
        cost[i][j] = i < nA && j < nB ? simMatrix[i][j] : 0;
      }
    }

    // Convert to minimization (Hungarian minimizes)
    let maxVal = -Infinity;
    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) {
        maxVal = Math.max(maxVal, cost[i][j]);
      }
    }
    const minMatrix: number[][] = [];
    for (let i = 0; i < size; i++) {
      minMatrix[i] = [];
      for (let j = 0; j < size; j++) {
        minMatrix[i][j] = maxVal - cost[i][j];
      }
    }

    // Hungarian algorithm (O(n^3))
    const INF = 1e18;
    const u = new Float64Array(size + 1);
    const v = new Float64Array(size + 1);
    const p = new Int32Array(size + 1);
    const way = new Int32Array(size + 1);

    for (let i = 1; i <= size; i++) {
      p[0] = i;
      let j0 = 0;
      const minv = new Float64Array(size + 1).fill(INF);
      const used = new Uint8Array(size + 1);

      do {
        used[j0] = 1;
        const i0 = p[j0];
        let delta = INF;
        let j1 = 0;

        for (let j = 1; j <= size; j++) {
          if (!used[j]) {
            const cur = minMatrix[i0 - 1][j - 1] - u[i0] - v[j];
            if (cur < minv[j]) {
              minv[j] = cur;
              way[j] = j0;
            }
            if (minv[j] < delta) {
              delta = minv[j];
              j1 = j;
            }
          }
        }

        for (let j = 0; j <= size; j++) {
          if (used[j]) {
            u[p[j]] += delta;
            v[j] -= delta;
          } else {
            minv[j] -= delta;
          }
        }

        j0 = j1;
      } while (p[j0] !== 0);

      // Update matching along augmenting path
      do {
        const j1 = way[j0];
        p[j0] = p[j1];
        j0 = j1;
      } while (j0 !== 0);
    }

    // Convert to 0-indexed result, filtering out padding
    const result: [number, number][] = [];
    for (let j = 1; j <= size; j++) {
      if (p[j] > 0 && p[j] - 1 < nA && j - 1 < nB) {
        // Only include matches with reasonable similarity
        const sim = simMatrix[p[j] - 1][j - 1];
        if (sim > 0.15) {
          result.push([p[j] - 1, j - 1]);
        }
      }
    }

    return result;
  }
}

// ============================================================================
// Species Preset Builders
// ============================================================================

/**
 * Type for a species builder function.
 */
type SpeciesBuilder = (params: GenomeParams, rng: SeededRandom) => PartNode;

/**
 * Get the species builder function for a given species type.
 */
function getSpeciesBuilder(type: SpeciesType): SpeciesBuilder {
  switch (type) {
    case 'mammal':    return buildMammalGenome;
    case 'bird':      return buildBirdGenome;
    case 'fish':      return buildFishGenome;
    case 'insect':    return buildInsectGenome;
    case 'reptile':   return buildReptileGenome;
    case 'amphibian': return buildAmphibianGenome;
  }
}

/**
 * Build a mammal genome part tree.
 * Structure: torso → (head → (eyes, mouth, ears), legs×4, tail)
 */
export function buildMammalGenome(params: GenomeParams, rng: SeededRandom): PartNode {
  const s = params.size;

  // Root: torso
  const torso: PartNode = {
    id: 'torso',
    partType: PartType.Torso,
    partFactory: new TorsoPartFactory(),
    attachment: Attachment.fixed(new THREE.Vector3(0, 0, 0)),
    joint: new TorsoPartFactory().getJointConfig(),
    ikParams: { chainCount: 1, rotationWeight: 0.5, mode: 'auto', targetOffset: new THREE.Vector3() },
    children: [],
    transform: new THREE.Matrix4(),
    bvh: null,
    geometry: null,
    params: {
      scale: s,
      length: params.bodyLength,
      width: params.bodyWidth,
      height: params.bodyHeight,
      segments: 16,
      taper: 0.3,
      extras: {},
    },
  };

  // Head
  const head: PartNode = {
    id: 'head',
    partType: PartType.Head,
    partFactory: new HeadPartFactory(),
    attachment: Attachment.raycast(
      new THREE.Vector3(0, 0.3, 1),
      new THREE.Vector3(0, s * params.bodyHeight * 0.15, s * params.bodyLength * 0.45),
      ['head'],
    ),
    joint: new HeadPartFactory().getJointConfig(),
    ikParams: { chainCount: 2, rotationWeight: 0.7, mode: 'auto', targetOffset: new THREE.Vector3(0, 0, s * 0.1) },
    children: [],
    transform: new THREE.Matrix4(),
    bvh: null,
    geometry: null,
    params: {
      scale: s,
      length: params.headSize,
      width: params.headSize * 0.8,
      height: params.headSize * 0.7,
      segments: 12,
      taper: 0,
      extras: { snoutLength: params.snoutLength },
    },
  };

  // Eyes (bilateral)
  for (const side of ['left', 'right'] as const) {
    const xDir = side === 'left' ? -1 : 1;
    const eye: PartNode = {
      id: `${side}Eye`,
      partType: PartType.Eye,
      partFactory: new EyePartFactory(),
      attachment: Attachment.raycast(
        new THREE.Vector3(xDir, 0, 1),
        new THREE.Vector3(xDir * s * 0.12, s * 0.04, s * params.headSize * 0.4),
        ['head_front'],
      ),
      joint: new EyePartFactory().getJointConfig(),
      ikParams: { chainCount: 1, rotationWeight: 0.9, mode: 'auto', targetOffset: new THREE.Vector3(0, 0, s * 0.01) },
      children: [],
      transform: new THREE.Matrix4(),
      bvh: null,
      geometry: null,
      params: {
        scale: s,
        length: s * 0.04,
        width: s * 0.04,
        height: s * 0.04,
        segments: 8,
        taper: 0,
        extras: { pupilShape: params.pupilShape },
      },
    };
    head.children.push(eye);
  }

  // Mouth
  const mouth: PartNode = {
    id: 'mouth',
    partType: PartType.Mouth,
    partFactory: new MouthPartFactory(),
    attachment: Attachment.raycast(
      new THREE.Vector3(0, -0.5, 1),
      new THREE.Vector3(0, -s * 0.03, s * params.headSize * 0.4),
      ['jaw'],
    ),
    joint: new MouthPartFactory().getJointConfig(),
    ikParams: { chainCount: 1, rotationWeight: 0.3, mode: 'manual', targetOffset: new THREE.Vector3(0, 0, s * 0.05) },
    children: [],
    transform: new THREE.Matrix4(),
    bvh: null,
    geometry: null,
    params: {
      scale: s,
      length: s * params.snoutLength * 0.5,
      width: s * params.headSize * 0.4,
      height: s * params.headSize * 0.2,
      segments: 8,
      taper: 0.3,
      extras: { mouthType: params.mouthType, snoutLength: params.snoutLength },
    },
  };
  head.children.push(mouth);

  // Ears (bilateral)
  for (const side of ['left', 'right'] as const) {
    const xDir = side === 'left' ? -1 : 1;
    const earSize = rng.nextFloat(0.03, 0.08);
    const ear: PartNode = {
      id: `${side}Ear`,
      partType: PartType.Ear,
      partFactory: new EarPartFactory(), // Use the ear factory defined below
      attachment: Attachment.raycast(
        new THREE.Vector3(xDir, 1, 0),
        new THREE.Vector3(xDir * s * params.headSize * 0.5, s * params.headSize * 0.35, 0),
        ['head_top'],
      ),
      joint: {
        type: 'hinge',
        axis: new THREE.Vector3(0, 0, 1),
        limits: { minX: -0.1, maxX: 0.1, minY: 0, maxY: 0, minZ: -0.15, maxZ: 0.15 },
        stiffness: 0.8,
        stretch: 0,
      },
      ikParams: { chainCount: 1, rotationWeight: 0.3, mode: 'auto', targetOffset: new THREE.Vector3(0, s * earSize, 0) },
      children: [],
      transform: new THREE.Matrix4(),
      bvh: null,
      geometry: null,
      params: {
        scale: s,
        length: s * earSize * 2,
        width: s * earSize,
        height: s * earSize * 0.5,
        segments: 4,
        taper: 0.4,
        extras: {},
      },
    };
    head.children.push(ear);
  }

  torso.children.push(head);

  // Legs (4 for mammal: front-left, front-right, hind-left, hind-right)
  const legPositions = [
    { name: 'frontLeft',  x: -1, z: 1 },
    { name: 'frontRight', x: 1,  z: 1 },
    { name: 'hindLeft',   x: -1, z: -1 },
    { name: 'hindRight',  x: 1,  z: -1 },
  ];

  for (const pos of legPositions) {
    const limb: PartNode = {
      id: `${pos.name}Leg`,
      partType: PartType.Limb,
      partFactory: new LimbPartFactory(),
      attachment: Attachment.jointConnected(
        new THREE.Vector3(
          pos.x * s * params.bodyWidth * 0.5,
          -s * params.bodyHeight * 0.3,
          pos.z * s * params.bodyLength * 0.2,
        ),
        [pos.z > 0 ? 'shoulder' : 'hip'],
      ),
      joint: new LimbPartFactory().getJointConfig(),
      ikParams: {
        chainCount: 3,
        rotationWeight: 0.6,
        mode: 'auto',
        targetOffset: new THREE.Vector3(0, -s * params.legLength, 0),
      },
      children: [],
      transform: new THREE.Matrix4(),
      bvh: null,
      geometry: null,
      params: {
        scale: s,
        length: params.legLength,
        width: params.legThickness,
        height: params.legThickness * 0.8,
        segments: 3,
        taper: 0.35,
        extras: {},
      },
    };
    torso.children.push(limb);
  }

  // Tail
  if (params.hasTail) {
    const tail: PartNode = {
      id: 'tail',
      partType: PartType.Tail,
      partFactory: new TailPartFactory(),
      attachment: Attachment.raycast(
        new THREE.Vector3(0, 0, -1),
        new THREE.Vector3(0, 0, -s * params.bodyLength * 0.35),
        ['tail_base'],
      ),
      joint: new TailPartFactory().getJointConfig(),
      ikParams: { chainCount: 5, rotationWeight: 0.3, mode: 'auto', targetOffset: new THREE.Vector3(0, 0, -s * params.tailLength) },
      children: [],
      transform: new THREE.Matrix4(),
      bvh: null,
      geometry: null,
      params: {
        scale: s,
        length: params.tailLength,
        width: params.legThickness * 1.5,
        height: params.legThickness,
        segments: 8,
        taper: 0.8,
        extras: { flexibility: params.tailFlexibility },
      },
    };
    torso.children.push(tail);
  }

  // Horns (optional)
  if (params.hasHorns) {
    for (const side of ['left', 'right'] as const) {
      const xDir = side === 'left' ? -1 : 1;
      const horn: PartNode = {
        id: `${side}Horn`,
        partType: PartType.Horn,
        partFactory: new HornPartFactory(),
        attachment: Attachment.raycast(
          new THREE.Vector3(xDir, 1, -0.3),
          new THREE.Vector3(xDir * s * params.headSize * 0.4, s * params.headSize * 0.5, -s * 0.02),
          ['head_top'],
        ),
        joint: {
          type: 'weld',
          axis: new THREE.Vector3(0, 1, 0),
          limits: { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 },
          stiffness: 1.0,
          stretch: 0,
        },
        ikParams: { chainCount: 1, rotationWeight: 1.0, mode: 'manual', targetOffset: new THREE.Vector3() },
        children: [],
        transform: new THREE.Matrix4(),
        bvh: null,
        geometry: null,
        params: {
          scale: s,
          length: s * params.headSize * 0.6,
          width: s * 0.015,
          height: s * 0.015,
          segments: 4,
          taper: 0.9,
          extras: { curvature: rng.nextFloat(0.3, 0.8) },
        },
      };
      head.children.push(horn);
    }
  }

  return torso;
}

/**
 * Build a bird genome part tree.
 * Structure: torso → (head → (eyes, beak), wings×2, legs×2, tail)
 */
export function buildBirdGenome(params: GenomeParams, rng: SeededRandom): PartNode {
  const s = params.size;

  const torso: PartNode = {
    id: 'torso',
    partType: PartType.Torso,
    partFactory: new TorsoPartFactory(),
    attachment: Attachment.fixed(new THREE.Vector3(0, 0, 0)),
    joint: new TorsoPartFactory().getJointConfig(),
    ikParams: { chainCount: 1, rotationWeight: 0.5, mode: 'auto', targetOffset: new THREE.Vector3() },
    children: [],
    transform: new THREE.Matrix4(),
    bvh: null,
    geometry: null,
    params: {
      scale: s,
      length: params.bodyLength * 0.6, // Compact bird body
      width: params.bodyWidth,
      height: params.bodyHeight,
      segments: 12,
      taper: 0.2,
      extras: {},
    },
  };

  // Head
  const head: PartNode = {
    id: 'head',
    partType: PartType.Head,
    partFactory: new HeadPartFactory(),
    attachment: Attachment.raycast(
      new THREE.Vector3(0, 0.5, 1),
      new THREE.Vector3(0, s * params.neckLength * 2, s * params.bodyLength * 0.35),
      ['head'],
    ),
    joint: new HeadPartFactory().getJointConfig(),
    ikParams: { chainCount: 3, rotationWeight: 0.7, mode: 'auto', targetOffset: new THREE.Vector3(0, s * 0.05, s * 0.08) },
    children: [],
    transform: new THREE.Matrix4(),
    bvh: null,
    geometry: null,
    params: {
      scale: s,
      length: params.headSize,
      width: params.headSize * 0.7,
      height: params.headSize * 0.65,
      segments: 12,
      taper: 0,
      extras: { snoutLength: params.snoutLength },
    },
  };

  // Eyes
  for (const side of ['left', 'right'] as const) {
    const xDir = side === 'left' ? -1 : 1;
    head.children.push({
      id: `${side}Eye`,
      partType: PartType.Eye,
      partFactory: new EyePartFactory(),
      attachment: Attachment.raycast(
        new THREE.Vector3(xDir, 0, 1),
        new THREE.Vector3(xDir * s * 0.08, s * 0.03, s * params.headSize * 0.35),
        ['head_front'],
      ),
      joint: new EyePartFactory().getJointConfig(),
      ikParams: { chainCount: 1, rotationWeight: 0.9, mode: 'auto', targetOffset: new THREE.Vector3(0, 0, s * 0.01) },
      children: [],
      transform: new THREE.Matrix4(),
      bvh: null,
      geometry: null,
      params: {
        scale: s,
        length: s * 0.03,
        width: s * 0.03,
        height: s * 0.03,
        segments: 8,
        taper: 0,
        extras: { pupilShape: 0 },
      },
    });
  }

  // Beak (mouth type = 1 for sharp beak)
  head.children.push({
    id: 'beak',
    partType: PartType.Mouth,
    partFactory: new MouthPartFactory(),
    attachment: Attachment.raycast(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, s * 0.02, s * params.headSize * 0.4),
      ['jaw'],
    ),
    joint: new MouthPartFactory().getJointConfig(),
    ikParams: { chainCount: 1, rotationWeight: 0.3, mode: 'manual', targetOffset: new THREE.Vector3(0, 0, s * 0.05) },
    children: [],
    transform: new THREE.Matrix4(),
    bvh: null,
    geometry: null,
    params: {
      scale: s,
      length: s * params.snoutLength * 0.8,
      width: s * params.headSize * 0.2,
      height: s * params.headSize * 0.15,
      segments: 6,
      taper: 0.5,
      extras: { mouthType: 1, snoutLength: params.snoutLength },
    },
  });

  torso.children.push(head);

  // Wings (bilateral)
  for (const side of ['left', 'right'] as const) {
    const xDir = side === 'left' ? -1 : 1;
    torso.children.push({
      id: `${side}Wing`,
      partType: PartType.Wing,
      partFactory: new WingPartFactory(),
      attachment: Attachment.jointConnected(
        new THREE.Vector3(xDir * s * params.bodyWidth * 0.4, s * params.bodyHeight * 0.15, 0),
        ['shoulder'],
      ),
      joint: new WingPartFactory().getJointConfig(),
      ikParams: { chainCount: 3, rotationWeight: 0.4, mode: 'auto', targetOffset: new THREE.Vector3(xDir * s * params.armLength * 0.5, 0, 0) },
      children: [],
      transform: new THREE.Matrix4(),
      bvh: null,
      geometry: null,
      params: {
        scale: s,
        length: params.armLength,
        width: params.bodyLength * 0.15,
        height: params.bodyHeight * 0.05,
        segments: 4,
        taper: 0.3,
        extras: {},
      },
    });
  }

  // Legs (2 for bird)
  for (const side of ['left', 'right'] as const) {
    const xDir = side === 'left' ? -1 : 1;
    torso.children.push({
      id: `${side}Leg`,
      partType: PartType.Limb,
      partFactory: new LimbPartFactory(),
      attachment: Attachment.jointConnected(
        new THREE.Vector3(xDir * s * params.bodyWidth * 0.25, -s * params.bodyHeight * 0.3, 0),
        ['hip'],
      ),
      joint: new LimbPartFactory().getJointConfig(),
      ikParams: {
        chainCount: 3,
        rotationWeight: 0.6,
        mode: 'auto',
        targetOffset: new THREE.Vector3(0, -s * params.legLength, 0),
      },
      children: [],
      transform: new THREE.Matrix4(),
      bvh: null,
      geometry: null,
      params: {
        scale: s,
        length: params.legLength,
        width: params.legThickness * 0.6,
        height: params.legThickness * 0.5,
        segments: 3,
        taper: 0.4,
        extras: {},
      },
    });
  }

  // Tail feathers
  if (params.hasTail) {
    torso.children.push({
      id: 'tail',
      partType: PartType.Tail,
      partFactory: new TailPartFactory(),
      attachment: Attachment.raycast(
        new THREE.Vector3(0, 0, -1),
        new THREE.Vector3(0, 0, -s * params.bodyLength * 0.25),
        ['tail_base'],
      ),
      joint: new TailPartFactory().getJointConfig(),
      ikParams: { chainCount: 2, rotationWeight: 0.2, mode: 'auto', targetOffset: new THREE.Vector3(0, 0, -s * params.tailLength) },
      children: [],
      transform: new THREE.Matrix4(),
      bvh: null,
      geometry: null,
      params: {
        scale: s,
        length: params.tailLength,
        width: params.legThickness * 2,
        height: params.legThickness,
        segments: 4,
        taper: 0.5,
        extras: { flexibility: 0.6 },
      },
    });
  }

  return torso;
}

/**
 * Build a fish genome part tree.
 * Structure: torso → (head → (eyes, mouth), fins, tail)
 */
export function buildFishGenome(params: GenomeParams, rng: SeededRandom): PartNode {
  const s = params.size;

  const torso: PartNode = {
    id: 'torso',
    partType: PartType.Torso,
    partFactory: new TorsoPartFactory(),
    attachment: Attachment.fixed(new THREE.Vector3(0, 0, 0)),
    joint: new TorsoPartFactory().getJointConfig(),
    ikParams: { chainCount: 1, rotationWeight: 0.5, mode: 'auto', targetOffset: new THREE.Vector3() },
    children: [],
    transform: new THREE.Matrix4(),
    bvh: null,
    geometry: null,
    params: {
      scale: s,
      length: params.bodyLength,
      width: params.bodyWidth * 0.8, // Streamlined
      height: params.bodyHeight * 0.9,
      segments: 20,
      taper: 0.6,
      extras: {},
    },
  };

  // Head (integrated into streamlined body)
  const head: PartNode = {
    id: 'head',
    partType: PartType.Head,
    partFactory: new HeadPartFactory(),
    attachment: Attachment.raycast(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, s * params.bodyHeight * 0.05, s * params.bodyLength * 0.4),
      ['head'],
    ),
    joint: {
      type: 'ball',
      axis: new THREE.Vector3(0, 1, 0),
      limits: {
        minX: -0.3, maxX: 0.3,
        minY: -0.2, maxY: 0.2,
        minZ: -0.15, maxZ: 0.15,
      },
      stiffness: 0.7,
      stretch: 0.01,
    },
    ikParams: { chainCount: 1, rotationWeight: 0.5, mode: 'auto', targetOffset: new THREE.Vector3(0, 0, s * 0.05) },
    children: [],
    transform: new THREE.Matrix4(),
    bvh: null,
    geometry: null,
    params: {
      scale: s,
      length: params.headSize,
      width: params.headSize * 0.7,
      height: params.headSize * 0.6,
      segments: 12,
      taper: 0.2,
      extras: { snoutLength: params.snoutLength },
    },
  };

  // Eyes
  for (const side of ['left', 'right'] as const) {
    const xDir = side === 'left' ? -1 : 1;
    head.children.push({
      id: `${side}Eye`,
      partType: PartType.Eye,
      partFactory: new EyePartFactory(),
      attachment: Attachment.raycast(
        new THREE.Vector3(xDir, 0.3, 1),
        new THREE.Vector3(xDir * s * params.headSize * 0.45, s * 0.02, s * params.headSize * 0.3),
        ['head_front'],
      ),
      joint: new EyePartFactory().getJointConfig(),
      ikParams: { chainCount: 1, rotationWeight: 0.9, mode: 'auto', targetOffset: new THREE.Vector3(0, 0, s * 0.01) },
      children: [],
      transform: new THREE.Matrix4(),
      bvh: null,
      geometry: null,
      params: {
        scale: s,
        length: s * 0.05,
        width: s * 0.05,
        height: s * 0.05,
        segments: 8,
        taper: 0,
        extras: { pupilShape: 0 },
      },
    });
  }

  // Mouth
  head.children.push({
    id: 'mouth',
    partType: PartType.Mouth,
    partFactory: new MouthPartFactory(),
    attachment: Attachment.raycast(
      new THREE.Vector3(0, -0.3, 1),
      new THREE.Vector3(0, -s * 0.02, s * params.headSize * 0.35),
      ['jaw'],
    ),
    joint: new MouthPartFactory().getJointConfig(),
    ikParams: { chainCount: 1, rotationWeight: 0.2, mode: 'manual', targetOffset: new THREE.Vector3(0, 0, s * 0.03) },
    children: [],
    transform: new THREE.Matrix4(),
    bvh: null,
    geometry: null,
    params: {
      scale: s,
      length: s * params.snoutLength,
      width: s * params.headSize * 0.3,
      height: s * params.headSize * 0.15,
      segments: 6,
      taper: 0.3,
      extras: { mouthType: 0, snoutLength: params.snoutLength },
    },
  });

  torso.children.push(head);

  // Pectoral fins (bilateral)
  for (const side of ['left', 'right'] as const) {
    const xDir = side === 'left' ? -1 : 1;
    torso.children.push({
      id: `${side}PectoralFin`,
      partType: PartType.Fin,
      partFactory: new FinPartFactory(),
      attachment: Attachment.raycast(
        new THREE.Vector3(xDir, 0, 0),
        new THREE.Vector3(xDir * s * params.bodyWidth * 0.7, -s * 0.02, s * params.bodyLength * 0.1),
        ['pectoral'],
      ),
      joint: new FinPartFactory().getJointConfig(),
      ikParams: { chainCount: 1, rotationWeight: 0.4, mode: 'auto', targetOffset: new THREE.Vector3(xDir * s * 0.1, 0, 0) },
      children: [],
      transform: new THREE.Matrix4(),
      bvh: null,
      geometry: null,
      params: {
        scale: s,
        length: s * params.bodyWidth * 0.6,
        width: s * 0.1,
        height: s * 0.08,
        segments: 4,
        taper: 0.5,
        extras: {},
      },
    });
  }

  // Dorsal fin
  torso.children.push({
    id: 'dorsalFin',
    partType: PartType.Fin,
    partFactory: new FinPartFactory(),
    attachment: Attachment.raycast(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, s * params.bodyHeight * 0.5, -s * 0.05),
      ['dorsal'],
    ),
    joint: new FinPartFactory().getJointConfig(),
    ikParams: { chainCount: 1, rotationWeight: 0.3, mode: 'auto', targetOffset: new THREE.Vector3(0, s * 0.1, 0) },
    children: [],
    transform: new THREE.Matrix4(),
    bvh: null,
    geometry: null,
    params: {
      scale: s,
      length: s * params.bodyLength * 0.15,
      width: s * 0.08,
      height: s * params.bodyHeight * 0.4,
      segments: 4,
      taper: 0.6,
      extras: {},
    },
  });

  // Tail fin
  if (params.hasTail) {
    torso.children.push({
      id: 'tailFin',
      partType: PartType.Fin,
      partFactory: new FinPartFactory(),
      attachment: Attachment.raycast(
        new THREE.Vector3(0, 0, -1),
        new THREE.Vector3(0, 0, -s * params.bodyLength * 0.45),
        ['tail_base'],
      ),
      joint: {
        type: 'ball',
        axis: new THREE.Vector3(0, 1, 0),
        limits: {
          minX: -Math.PI * 0.4, maxX: Math.PI * 0.4,
          minY: -0.15, maxY: 0.15,
          minZ: -0.15, maxZ: 0.15,
        },
        stiffness: 0.3,
        stretch: 0.02,
      },
      ikParams: { chainCount: 1, rotationWeight: 0.3, mode: 'auto', targetOffset: new THREE.Vector3(0, 0, -s * params.tailLength) },
      children: [],
      transform: new THREE.Matrix4(),
      bvh: null,
      geometry: null,
      params: {
        scale: s,
        length: s * params.bodyWidth * 1.2,
        width: s * params.tailLength,
        height: s * params.bodyHeight * 0.3,
        segments: 4,
        taper: 0.3,
        extras: {},
      },
    });
  }

  return torso;
}

/**
 * Build an insect genome part tree.
 * Structure: torso → (head → (eyes, mouth, antennae), legs×6, wings?)
 */
export function buildInsectGenome(params: GenomeParams, rng: SeededRandom): PartNode {
  const s = params.size;

  const torso: PartNode = {
    id: 'torso',
    partType: PartType.Torso,
    partFactory: new TorsoPartFactory(),
    attachment: Attachment.fixed(new THREE.Vector3(0, 0, 0)),
    joint: new TorsoPartFactory().getJointConfig(),
    ikParams: { chainCount: 1, rotationWeight: 0.5, mode: 'auto', targetOffset: new THREE.Vector3() },
    children: [],
    transform: new THREE.Matrix4(),
    bvh: null,
    geometry: null,
    params: {
      scale: s,
      length: params.bodyLength * 0.8,
      width: params.bodyWidth,
      height: params.bodyHeight * 0.75, // Flattened
      segments: 8,
      taper: 0.15,
      extras: {},
    },
  };

  // Head
  const head: PartNode = {
    id: 'head',
    partType: PartType.Head,
    partFactory: new HeadPartFactory(),
    attachment: Attachment.raycast(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, s * params.bodyHeight * 0.05, s * params.bodyLength * 0.4),
      ['head'],
    ),
    joint: new HeadPartFactory().getJointConfig(),
    ikParams: { chainCount: 1, rotationWeight: 0.6, mode: 'auto', targetOffset: new THREE.Vector3(0, 0, s * 0.05) },
    children: [],
    transform: new THREE.Matrix4(),
    bvh: null,
    geometry: null,
    params: {
      scale: s,
      length: params.headSize,
      width: params.headSize * 0.9,
      height: params.headSize * 0.7,
      segments: 10,
      taper: 0,
      extras: { snoutLength: params.snoutLength },
    },
  };

  // Compound eyes
  for (const side of ['left', 'right'] as const) {
    const xDir = side === 'left' ? -1 : 1;
    head.children.push({
      id: `${side}CompoundEye`,
      partType: PartType.Eye,
      partFactory: new EyePartFactory(),
      attachment: Attachment.raycast(
        new THREE.Vector3(xDir, 0.2, 0.8),
        new THREE.Vector3(xDir * s * params.headSize * 0.5, s * 0.02, s * params.headSize * 0.3),
        ['head_front'],
      ),
      joint: new EyePartFactory().getJointConfig(),
      ikParams: { chainCount: 1, rotationWeight: 1.0, mode: 'manual', targetOffset: new THREE.Vector3() },
      children: [],
      transform: new THREE.Matrix4(),
      bvh: null,
      geometry: null,
      params: {
        scale: s,
        length: s * 0.06,
        width: s * 0.06,
        height: s * 0.05,
        segments: 12,
        taper: 0,
        extras: { pupilShape: 0 },
      },
    });
  }

  // Mouth parts
  head.children.push({
    id: 'mouthParts',
    partType: PartType.Mouth,
    partFactory: new MouthPartFactory(),
    attachment: Attachment.raycast(
      new THREE.Vector3(0, -0.5, 1),
      new THREE.Vector3(0, -s * 0.02, s * params.headSize * 0.4),
      ['jaw'],
    ),
    joint: new MouthPartFactory().getJointConfig(),
    ikParams: { chainCount: 1, rotationWeight: 0.2, mode: 'manual', targetOffset: new THREE.Vector3(0, 0, s * 0.03) },
    children: [],
    transform: new THREE.Matrix4(),
    bvh: null,
    geometry: null,
    params: {
      scale: s,
      length: s * params.snoutLength * 0.5,
      width: s * params.headSize * 0.3,
      height: s * params.headSize * 0.15,
      segments: 6,
      taper: 0.3,
      extras: { mouthType: 0, snoutLength: params.snoutLength },
    },
  });

  // Antennae
  if (params.hasAntennae) {
    for (const side of ['left', 'right'] as const) {
      const xDir = side === 'left' ? -1 : 1;
      const antennaLen = rng.nextFloat(0.15, 0.4);
      head.children.push({
        id: `${side}Antenna`,
        partType: PartType.Antenna,
        partFactory: new AntennaPartFactory(),
        attachment: Attachment.raycast(
          new THREE.Vector3(xDir, 0.8, 0.5),
          new THREE.Vector3(xDir * s * 0.04, s * params.headSize * 0.4, s * 0.08),
          ['head_top'],
        ),
        joint: {
          type: 'ball',
          axis: new THREE.Vector3(xDir, 0, 0),
          limits: {
            minX: -0.3, maxX: 0.3,
            minY: -0.5, maxY: 0.5,
            minZ: -0.3, maxZ: 0.3,
          },
          stiffness: 0.3,
          stretch: 0.05,
        },
        ikParams: { chainCount: 4, rotationWeight: 0.2, mode: 'auto', targetOffset: new THREE.Vector3(xDir * s * antennaLen, s * 0.05, s * 0.05) },
        children: [],
        transform: new THREE.Matrix4(),
        bvh: null,
        geometry: null,
        params: {
          scale: s,
          length: s * antennaLen,
          width: s * 0.008,
          height: s * 0.008,
          segments: 6,
          taper: 0.7,
          extras: {},
        },
      });
    }
  }

  torso.children.push(head);

  // 6 legs (3 pairs)
  const legPairs = params.limbPairs > 0 ? params.limbPairs : 3;
  for (let pairIdx = 0; pairIdx < legPairs; pairIdx++) {
    for (const side of ['left', 'right'] as const) {
      const xDir = side === 'left' ? -1 : 1;
      const zOffset = (1 - pairIdx / (legPairs - 1)) * 0.3 - 0.1; // spread along body
      torso.children.push({
        id: `leg_${pairIdx}_${side}`,
        partType: PartType.Limb,
        partFactory: new LimbPartFactory(),
        attachment: Attachment.jointConnected(
          new THREE.Vector3(
            xDir * s * params.bodyWidth * 0.5,
            -s * params.bodyHeight * 0.3,
            zOffset * s * params.bodyLength,
          ),
          ['coxa'],
        ),
        joint: {
          type: 'hinge',
          axis: new THREE.Vector3(1, 0, 0),
          limits: {
            minX: -Math.PI * 0.6, maxX: Math.PI * 0.3,
            minY: -0.15, maxY: 0.15,
            minZ: -0.1, maxZ: 0.1,
          },
          stiffness: 0.5,
          stretch: 0.03,
        },
        ikParams: {
          chainCount: 4,
          rotationWeight: 0.5,
          mode: 'auto',
          targetOffset: new THREE.Vector3(xDir * s * 0.03, -s * params.legLength, s * 0.01),
        },
        children: [],
        transform: new THREE.Matrix4(),
        bvh: null,
        geometry: null,
        params: {
          scale: s,
          length: params.legLength * 0.7,
          width: params.legThickness * 0.5,
          height: params.legThickness * 0.4,
          segments: 4,
          taper: 0.5,
          extras: {},
        },
      });
    }
  }

  // Optional wings
  if (params.hasWings) {
    for (const side of ['left', 'right'] as const) {
      const xDir = side === 'left' ? -1 : 1;
      torso.children.push({
        id: `${side}Wing`,
        partType: PartType.Wing,
        partFactory: new WingPartFactory(),
        attachment: Attachment.jointConnected(
          new THREE.Vector3(xDir * s * params.bodyWidth * 0.3, s * params.bodyHeight * 0.15, s * 0.05),
          ['thorax'],
        ),
        joint: new WingPartFactory().getJointConfig(),
        ikParams: { chainCount: 2, rotationWeight: 0.3, mode: 'auto', targetOffset: new THREE.Vector3(xDir * s * params.armLength * 0.4, 0, 0) },
        children: [],
        transform: new THREE.Matrix4(),
        bvh: null,
        geometry: null,
        params: {
          scale: s,
          length: params.armLength * 0.6,
          width: params.bodyLength * 0.12,
          height: params.bodyHeight * 0.03,
          segments: 3,
          taper: 0.4,
          extras: {},
        },
      });
    }
  }

  return torso;
}

/**
 * Build a reptile genome part tree.
 * Structure: torso → (head → (eyes, mouth), legs×4, long tail)
 */
export function buildReptileGenome(params: GenomeParams, rng: SeededRandom): PartNode {
  const s = params.size;

  const torso: PartNode = {
    id: 'torso',
    partType: PartType.Torso,
    partFactory: new TorsoPartFactory(),
    attachment: Attachment.fixed(new THREE.Vector3(0, 0, 0)),
    joint: new TorsoPartFactory().getJointConfig(),
    ikParams: { chainCount: 1, rotationWeight: 0.5, mode: 'auto', targetOffset: new THREE.Vector3() },
    children: [],
    transform: new THREE.Matrix4(),
    bvh: null,
    geometry: null,
    params: {
      scale: s,
      length: params.bodyLength,
      width: params.bodyWidth * 0.7, // Elongated, narrow
      height: params.bodyHeight * 0.6,
      segments: 20,
      taper: 0.4,
      extras: {},
    },
  };

  // Head
  const head: PartNode = {
    id: 'head',
    partType: PartType.Head,
    partFactory: new HeadPartFactory(),
    attachment: Attachment.raycast(
      new THREE.Vector3(0, 0.2, 1),
      new THREE.Vector3(0, s * params.bodyHeight * 0.1, s * params.bodyLength * 0.45),
      ['head'],
    ),
    joint: new HeadPartFactory().getJointConfig(),
    ikParams: { chainCount: 2, rotationWeight: 0.6, mode: 'auto', targetOffset: new THREE.Vector3(0, 0, s * 0.08) },
    children: [],
    transform: new THREE.Matrix4(),
    bvh: null,
    geometry: null,
    params: {
      scale: s,
      length: params.headSize,
      width: params.headSize * 0.6,
      height: params.headSize * 0.5,
      segments: 12,
      taper: 0.1,
      extras: { snoutLength: params.snoutLength },
    },
  };

  // Eyes
  for (const side of ['left', 'right'] as const) {
    const xDir = side === 'left' ? -1 : 1;
    head.children.push({
      id: `${side}Eye`,
      partType: PartType.Eye,
      partFactory: new EyePartFactory(),
      attachment: Attachment.raycast(
        new THREE.Vector3(xDir, 0.3, 0.8),
        new THREE.Vector3(xDir * s * params.headSize * 0.45, s * 0.03, s * params.headSize * 0.35),
        ['head_front'],
      ),
      joint: new EyePartFactory().getJointConfig(),
      ikParams: { chainCount: 1, rotationWeight: 0.9, mode: 'auto', targetOffset: new THREE.Vector3(0, 0, s * 0.01) },
      children: [],
      transform: new THREE.Matrix4(),
      bvh: null,
      geometry: null,
      params: {
        scale: s,
        length: s * 0.04,
        width: s * 0.04,
        height: s * 0.03,
        segments: 8,
        taper: 0,
        extras: { pupilShape: 1 }, // Slit pupils for reptiles
      },
    });
  }

  // Mouth
  head.children.push({
    id: 'mouth',
    partType: PartType.Mouth,
    partFactory: new MouthPartFactory(),
    attachment: Attachment.raycast(
      new THREE.Vector3(0, -0.3, 1),
      new THREE.Vector3(0, -s * 0.02, s * params.headSize * 0.35),
      ['jaw'],
    ),
    joint: {
      type: 'hinge',
      axis: new THREE.Vector3(1, 0, 0),
      limits: { minX: 0, maxX: Math.PI * 0.5, minY: 0, maxY: 0, minZ: 0, maxZ: 0 },
      stiffness: 0.4,
      stretch: 0,
    },
    ikParams: { chainCount: 1, rotationWeight: 0.2, mode: 'manual', targetOffset: new THREE.Vector3(0, 0, s * 0.05) },
    children: [],
    transform: new THREE.Matrix4(),
    bvh: null,
    geometry: null,
    params: {
      scale: s,
      length: s * params.snoutLength,
      width: s * params.headSize * 0.35,
      height: s * params.headSize * 0.15,
      segments: 8,
      taper: 0.3,
      extras: { mouthType: 0, snoutLength: params.snoutLength },
    },
  });

  torso.children.push(head);

  // Legs (4 for most reptiles, or 0 for snakes)
  if (params.limbPairs > 0) {
    const legPositions = [
      { name: 'frontLeft',  x: -1, z: 1 },
      { name: 'frontRight', x: 1,  z: 1 },
      { name: 'hindLeft',   x: -1, z: -1 },
      { name: 'hindRight',  x: 1,  z: -1 },
    ];

    for (const pos of legPositions) {
      torso.children.push({
        id: `${pos.name}Leg`,
        partType: PartType.Limb,
        partFactory: new LimbPartFactory(),
        attachment: Attachment.jointConnected(
          new THREE.Vector3(
            pos.x * s * params.bodyWidth * 0.5,
            -s * params.bodyHeight * 0.25,
            pos.z * s * params.bodyLength * 0.15,
          ),
          [pos.z > 0 ? 'shoulder' : 'hip'],
        ),
        joint: {
          type: 'hinge',
          axis: new THREE.Vector3(1, 0, 0),
          limits: {
            minX: -Math.PI * 0.5, maxX: Math.PI * 0.3,
            minY: -0.2, maxY: 0.2,
            minZ: -0.15, maxZ: 0.15,
          },
          stiffness: 0.4,
          stretch: 0.03,
        },
        ikParams: {
          chainCount: 3,
          rotationWeight: 0.5,
          mode: 'auto',
          targetOffset: new THREE.Vector3(0, -s * params.legLength, s * 0.03),
        },
        children: [],
        transform: new THREE.Matrix4(),
        bvh: null,
        geometry: null,
        params: {
          scale: s,
          length: params.legLength * 0.8,
          width: params.legThickness * 0.7,
          height: params.legThickness * 0.6,
          segments: 3,
          taper: 0.4,
          extras: {},
        },
      });
    }
  }

  // Long tail
  if (params.hasTail) {
    torso.children.push({
      id: 'tail',
      partType: PartType.Tail,
      partFactory: new TailPartFactory(),
      attachment: Attachment.raycast(
        new THREE.Vector3(0, 0, -1),
        new THREE.Vector3(0, 0, -s * params.bodyLength * 0.4),
        ['tail_base'],
      ),
      joint: new TailPartFactory().getJointConfig(),
      ikParams: { chainCount: 8, rotationWeight: 0.2, mode: 'auto', targetOffset: new THREE.Vector3(0, 0, -s * params.tailLength) },
      children: [],
      transform: new THREE.Matrix4(),
      bvh: null,
      geometry: null,
      params: {
        scale: s,
        length: params.tailLength,
        width: params.legThickness * 1.2,
        height: params.legThickness * 0.8,
        segments: 12,
        taper: 0.9,
        extras: { flexibility: 0.8 },
      },
    });
  }

  return torso;
}

/**
 * Build an amphibian genome part tree.
 * Structure: torso → (head → (eyes, mouth), legs×4, short tail)
 */
export function buildAmphibianGenome(params: GenomeParams, rng: SeededRandom): PartNode {
  const s = params.size;

  const torso: PartNode = {
    id: 'torso',
    partType: PartType.Torso,
    partFactory: new TorsoPartFactory(),
    attachment: Attachment.fixed(new THREE.Vector3(0, 0, 0)),
    joint: new TorsoPartFactory().getJointConfig(),
    ikParams: { chainCount: 1, rotationWeight: 0.5, mode: 'auto', targetOffset: new THREE.Vector3() },
    children: [],
    transform: new THREE.Matrix4(),
    bvh: null,
    geometry: null,
    params: {
      scale: s,
      length: params.bodyLength * 0.8,
      width: params.bodyWidth * 1.1, // Wider for amphibian
      height: params.bodyHeight * 0.8,
      segments: 12,
      taper: 0.2,
      extras: {},
    },
  };

  // Head (wide, flat for amphibians)
  const head: PartNode = {
    id: 'head',
    partType: PartType.Head,
    partFactory: new HeadPartFactory(),
    attachment: Attachment.raycast(
      new THREE.Vector3(0, 0.3, 1),
      new THREE.Vector3(0, s * params.bodyHeight * 0.1, s * params.bodyLength * 0.35),
      ['head'],
    ),
    joint: new HeadPartFactory().getJointConfig(),
    ikParams: { chainCount: 1, rotationWeight: 0.6, mode: 'auto', targetOffset: new THREE.Vector3(0, 0, s * 0.06) },
    children: [],
    transform: new THREE.Matrix4(),
    bvh: null,
    geometry: null,
    params: {
      scale: s,
      length: params.headSize * 0.8,
      width: params.headSize * 1.2, // Wide head
      height: params.headSize * 0.5, // Flat
      segments: 12,
      taper: 0,
      extras: { snoutLength: params.snoutLength },
    },
  };

  // Eyes (prominent, bulging)
  for (const side of ['left', 'right'] as const) {
    const xDir = side === 'left' ? -1 : 1;
    head.children.push({
      id: `${side}Eye`,
      partType: PartType.Eye,
      partFactory: new EyePartFactory(),
      attachment: Attachment.raycast(
        new THREE.Vector3(xDir, 0.8, 0.5),
        new THREE.Vector3(xDir * s * params.headSize * 0.55, s * params.headSize * 0.35, s * params.headSize * 0.2),
        ['head_top'],
      ),
      joint: new EyePartFactory().getJointConfig(),
      ikParams: { chainCount: 1, rotationWeight: 0.8, mode: 'auto', targetOffset: new THREE.Vector3(0, 0, s * 0.01) },
      children: [],
      transform: new THREE.Matrix4(),
      bvh: null,
      geometry: null,
      params: {
        scale: s,
        length: s * 0.06,
        width: s * 0.06,
        height: s * 0.06,
        segments: 10,
        taper: 0,
        extras: { pupilShape: 0 }, // Round pupils
      },
    });
  }

  // Mouth (wide)
  head.children.push({
    id: 'mouth',
    partType: PartType.Mouth,
    partFactory: new MouthPartFactory(),
    attachment: Attachment.raycast(
      new THREE.Vector3(0, -0.5, 0.8),
      new THREE.Vector3(0, -s * 0.03, s * params.headSize * 0.3),
      ['jaw'],
    ),
    joint: new MouthPartFactory().getJointConfig(),
    ikParams: { chainCount: 1, rotationWeight: 0.2, mode: 'manual', targetOffset: new THREE.Vector3(0, 0, s * 0.04) },
    children: [],
    transform: new THREE.Matrix4(),
    bvh: null,
    geometry: null,
    params: {
      scale: s,
      length: s * params.snoutLength * 0.4,
      width: s * params.headSize * 0.6, // Wide mouth
      height: s * params.headSize * 0.15,
      segments: 6,
      taper: 0.2,
      extras: { mouthType: 0, snoutLength: params.snoutLength },
    },
  });

  torso.children.push(head);

  // Legs (4 for amphibians)
  const legPositions = [
    { name: 'frontLeft',  x: -1, z: 1 },
    { name: 'frontRight', x: 1,  z: 1 },
    { name: 'hindLeft',   x: -1, z: -1 },
    { name: 'hindRight',  x: 1,  z: -1 },
  ];

  for (const pos of legPositions) {
    // Hind legs are larger for jumping
    const isHind = pos.z < 0;
    const legScale = isHind ? 1.3 : 0.9;
    torso.children.push({
      id: `${pos.name}Leg`,
      partType: PartType.Limb,
      partFactory: new LimbPartFactory(),
      attachment: Attachment.jointConnected(
        new THREE.Vector3(
          pos.x * s * params.bodyWidth * 0.5,
          -s * params.bodyHeight * 0.25,
          pos.z * s * params.bodyLength * 0.2,
        ),
        [pos.z > 0 ? 'shoulder' : 'hip'],
      ),
      joint: {
        type: 'hinge',
        axis: new THREE.Vector3(1, 0, 0),
        limits: {
          minX: -Math.PI * 0.6, maxX: Math.PI * 0.4,
          minY: -0.2, maxY: 0.2,
          minZ: -0.15, maxZ: 0.15,
        },
        stiffness: 0.3,
        stretch: 0.05,
      },
      ikParams: {
        chainCount: 3,
        rotationWeight: 0.5,
        mode: 'auto',
        targetOffset: new THREE.Vector3(0, -s * params.legLength * legScale, 0),
      },
      children: [],
      transform: new THREE.Matrix4(),
      bvh: null,
      geometry: null,
      params: {
        scale: s,
        length: params.legLength * legScale,
        width: params.legThickness * (isHind ? 1.3 : 0.8),
        height: params.legThickness * (isHind ? 1.1 : 0.7),
        segments: 3,
        taper: 0.3,
        extras: {},
      },
    });
  }

  // Short tail
  if (params.hasTail) {
    torso.children.push({
      id: 'tail',
      partType: PartType.Tail,
      partFactory: new TailPartFactory(),
      attachment: Attachment.raycast(
        new THREE.Vector3(0, 0, -1),
        new THREE.Vector3(0, 0, -s * params.bodyLength * 0.3),
        ['tail_base'],
      ),
      joint: new TailPartFactory().getJointConfig(),
      ikParams: { chainCount: 3, rotationWeight: 0.2, mode: 'auto', targetOffset: new THREE.Vector3(0, 0, -s * params.tailLength) },
      children: [],
      transform: new THREE.Matrix4(),
      bvh: null,
      geometry: null,
      params: {
        scale: s,
        length: params.tailLength,
        width: params.legThickness * 1.8,
        height: params.legThickness * 1.0,
        segments: 6,
        taper: 0.7,
        extras: { flexibility: 0.6 },
      },
    });
  }

  return torso;
}

// ============================================================================
// Additional Part Factories (Ear, Horn, Antenna)
// ============================================================================

/**
 * Generates ear geometry (cone or sphere shapes).
 */
class EarPartFactory extends PartFactory {
  readonly partType = PartType.Ear;

  generate(params: PartParams, rng: SeededRandom): THREE.BufferGeometry {
    const height = params.scale * params.length;
    const width = params.scale * params.width;
    const earType = rng.nextInt(0, 2); // 0=pointed, 1=round, 2=long

    if (earType === 0) {
      // Pointed ear
      return new THREE.ConeGeometry(width, height, 8);
    } else if (earType === 1) {
      // Round ear
      return new THREE.SphereGeometry(width, 8, 8);
    } else {
      // Long ear
      const geo = new THREE.CylinderGeometry(width * 0.3, width * 0.5, height * 2, 8);
      return geo;
    }
  }

  getDefaultAttachment(): Attachment {
    return Attachment.raycast(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0.15, 0.2, 0),
      ['head_side'],
    );
  }

  getJointConfig(): JointConfig {
    return {
      type: 'hinge',
      axis: new THREE.Vector3(0, 0, 1),
      limits: {
        minX: -0.1, maxX: 0.1,
        minY: 0, maxY: 0,
        minZ: -0.15, maxZ: 0.15,
      },
      stiffness: 0.8,
      stretch: 0,
    };
  }
}

/**
 * Generates horn geometry (curved cone).
 */
class HornPartFactory extends PartFactory {
  readonly partType = PartType.Horn;

  generate(params: PartParams, rng: SeededRandom): THREE.BufferGeometry {
    const height = params.scale * params.length;
    const radius = params.scale * params.width;
    const curvature = params.extras.curvature ?? 0.5;

    // Create horn as a curved cone
    const segments = Math.max(4, params.segments);
    const geo = new THREE.ConeGeometry(radius, height, 8, segments);

    // Apply curvature by bending vertices
    const posAttr = geo.getAttribute('position');
    for (let i = 0; i < posAttr.count; i++) {
      const y = posAttr.getY(i);
      const normalizedY = y / height + 0.5; // [0, 1]
      // Bend outward
      const bendAmount = normalizedY * normalizedY * curvature * height * 0.3;
      posAttr.setX(i, posAttr.getX(i) + bendAmount * Math.sign(posAttr.getX(i)));
    }
    posAttr.needsUpdate = true;
    geo.computeVertexNormals();

    return geo;
  }

  getDefaultAttachment(): Attachment {
    return Attachment.raycast(
      new THREE.Vector3(0, 1, -0.3),
      new THREE.Vector3(0.15, 0.3, -0.02),
      ['head_top'],
    );
  }

  getJointConfig(): JointConfig {
    return {
      type: 'weld',
      axis: new THREE.Vector3(0, 1, 0),
      limits: { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 },
      stiffness: 1.0,
      stretch: 0,
    };
  }
}

/**
 * Generates antenna geometry (thin segmented tube).
 */
class AntennaPartFactory extends PartFactory {
  readonly partType = PartType.Antenna;

  generate(params: PartParams, rng: SeededRandom): THREE.BufferGeometry {
    const length = params.scale * params.length;
    const radius = params.scale * params.width;
    const segments = Math.max(4, params.segments);

    // Thin tapered cylinder
    const geo = new THREE.CylinderGeometry(radius * 0.3, radius, length, 6, segments);

    // Add S-curve for antenna shape
    const posAttr = geo.getAttribute('position');
    for (let i = 0; i < posAttr.count; i++) {
      const y = posAttr.getY(i);
      const normalizedY = y / length + 0.5; // [0, 1]
      // S-curve bend
      const bend = Math.sin(normalizedY * Math.PI * 2) * length * 0.08;
      posAttr.setX(i, posAttr.getX(i) + bend);
      // Slight forward lean at tip
      const lean = normalizedY * normalizedY * length * 0.1;
      posAttr.setZ(i, posAttr.getZ(i) + lean);
    }
    posAttr.needsUpdate = true;
    geo.computeVertexNormals();

    return geo;
  }

  getDefaultAttachment(): Attachment {
    return Attachment.raycast(
      new THREE.Vector3(0, 0.8, 0.5),
      new THREE.Vector3(0.04, 0.12, 0.08),
      ['head_front_top'],
    );
  }

  getJointConfig(): JointConfig {
    return {
      type: 'ball',
      axis: new THREE.Vector3(0, 1, 0),
      limits: {
        minX: -0.3, maxX: 0.3,
        minY: -0.5, maxY: 0.5,
        minZ: -0.3, maxZ: 0.3,
      },
      stiffness: 0.3,
      stretch: 0.05,
    };
  }
}

// ============================================================================
// Default GenomeParams per Species
// ============================================================================

/**
 * Default genome parameters for each species type.
 * These define the characteristic body proportions.
 */
export const DEFAULT_GENOME_PARAMS: Record<SpeciesType, GenomeParams> = {
  mammal: {
    size: 1.0,
    bodyLength: 1.5,
    bodyWidth: 0.4,
    bodyHeight: 0.35,
    headSize: 0.25,
    legLength: 0.5,
    legThickness: 0.08,
    tailLength: 0.4,
    neckLength: 0.15,
    armLength: 0.0,
    snoutLength: 0.15,
    limbPairs: 2,
    hasWings: false,
    hasTail: true,
    hasAntennae: false,
    hasHorns: false,
    tailFlexibility: 0.5,
    pupilShape: 0,
    mouthType: 0,
  },
  bird: {
    size: 0.5,
    bodyLength: 0.4,
    bodyWidth: 0.25,
    bodyHeight: 0.25,
    headSize: 0.12,
    legLength: 0.3,
    legThickness: 0.03,
    tailLength: 0.2,
    neckLength: 0.12,
    armLength: 1.0,
    snoutLength: 0.15,
    limbPairs: 1,
    hasWings: true,
    hasTail: true,
    hasAntennae: false,
    hasHorns: false,
    tailFlexibility: 0.6,
    pupilShape: 0,
    mouthType: 1,
  },
  fish: {
    size: 0.8,
    bodyLength: 1.5,
    bodyWidth: 0.2,
    bodyHeight: 0.18,
    headSize: 0.15,
    legLength: 0.0,
    legThickness: 0.0,
    tailLength: 0.3,
    neckLength: 0.0,
    armLength: 0.0,
    snoutLength: 0.1,
    limbPairs: 0,
    hasWings: false,
    hasTail: true,
    hasAntennae: false,
    hasHorns: false,
    tailFlexibility: 0.9,
    pupilShape: 0,
    mouthType: 0,
  },
  insect: {
    size: 0.3,
    bodyLength: 0.5,
    bodyWidth: 0.15,
    bodyHeight: 0.12,
    headSize: 0.1,
    legLength: 0.3,
    legThickness: 0.02,
    tailLength: 0.1,
    neckLength: 0.02,
    armLength: 0.2,
    snoutLength: 0.05,
    limbPairs: 3,
    hasWings: true,
    hasTail: false,
    hasAntennae: true,
    hasHorns: false,
    tailFlexibility: 0.3,
    pupilShape: 0,
    mouthType: 0,
  },
  reptile: {
    size: 0.7,
    bodyLength: 2.0,
    bodyWidth: 0.12,
    bodyHeight: 0.1,
    headSize: 0.08,
    legLength: 0.2,
    legThickness: 0.04,
    tailLength: 0.8,
    neckLength: 0.05,
    armLength: 0.0,
    snoutLength: 0.1,
    limbPairs: 2,
    hasWings: false,
    hasTail: true,
    hasAntennae: false,
    hasHorns: false,
    tailFlexibility: 0.8,
    pupilShape: 1,
    mouthType: 0,
  },
  amphibian: {
    size: 0.5,
    bodyLength: 0.8,
    bodyWidth: 0.25,
    bodyHeight: 0.15,
    headSize: 0.18,
    legLength: 0.35,
    legThickness: 0.06,
    tailLength: 0.15,
    neckLength: 0.02,
    armLength: 0.0,
    snoutLength: 0.05,
    limbPairs: 2,
    hasWings: false,
    hasTail: true,
    hasAntennae: false,
    hasHorns: false,
    tailFlexibility: 0.6,
    pupilShape: 0,
    mouthType: 0,
  },
};

/**
 * Create genome params with random variation for a species.
 * Deterministic given the same seed.
 */
export function createRandomizedParams(
  type: SpeciesType,
  rng: SeededRandom,
  overrides?: Partial<GenomeParams>,
): GenomeParams {
  const base = DEFAULT_GENOME_PARAMS[type];
  const variation = 0.15; // ±15% variation

  const params: GenomeParams = {
    size: base.size * rng.nextFloat(1 - variation, 1 + variation),
    bodyLength: base.bodyLength * rng.nextFloat(1 - variation, 1 + variation),
    bodyWidth: base.bodyWidth * rng.nextFloat(1 - variation, 1 + variation),
    bodyHeight: base.bodyHeight * rng.nextFloat(1 - variation, 1 + variation),
    headSize: base.headSize * rng.nextFloat(1 - variation, 1 + variation),
    legLength: base.legLength * rng.nextFloat(1 - variation, 1 + variation),
    legThickness: base.legThickness * rng.nextFloat(1 - variation, 1 + variation),
    tailLength: base.tailLength * rng.nextFloat(1 - variation, 1 + variation),
    neckLength: base.neckLength * rng.nextFloat(1 - variation, 1 + variation),
    armLength: base.armLength * rng.nextFloat(1 - variation, 1 + variation),
    snoutLength: base.snoutLength * rng.nextFloat(1 - variation, 1 + variation),
    limbPairs: base.limbPairs,
    hasWings: base.hasWings,
    hasTail: base.hasTail && rng.boolean(0.9),
    hasAntennae: base.hasAntennae,
    hasHorns: rng.boolean(0.15), // 15% chance of horns
    tailFlexibility: base.tailFlexibility * rng.nextFloat(0.7, 1.3),
    pupilShape: base.pupilShape,
    mouthType: base.mouthType,
    ...overrides,
  };

  return params;
}
