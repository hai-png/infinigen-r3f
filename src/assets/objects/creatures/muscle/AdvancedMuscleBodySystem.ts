/**
 * AdvancedMuscleBodySystem.ts — P3-6: Surface Muscle Body (Multi-Muscle-Layer Composition)
 *
 * Provides an advanced dual-tube creature body system with 5 surface muscle layers,
 * per-muscle animation, and skeleton-driven activation. Inspired by the original
 * Infinigen surface muscle pipeline, this system generates real geometry with
 * proper vertex manipulation for anatomically plausible creature bodies.
 *
 * Core classes:
 * 1. BodyTube          — Parametric NURBS-like tube with radius profile + deformations
 * 2. MuscleLayer       — Complete muscle layer on a body tube (5 muscle groups)
 * 3. DualTubeBody      — Two-tube creature body (primary + head) with muscle layers
 * 4. MuscleAnimationDriver — Drives muscle activation from skeleton pose
 * 5. MuscleBodyPreset  — Enum and factory for creature body types
 * 6. MuscleBodyConfig  — Configuration interface for the body system
 *
 * @module creatures/muscle/AdvancedMuscleBodySystem
 */

import * as THREE from 'three';

// ============================================================================
// Types & Interfaces
// ============================================================================

/**
 * Muscle groups supported by the system.
 * Each group maps to a region of the creature body.
 */
export enum SurfaceMuscleGroup {
  SHOULDER = 'shoulder',
  BACK = 'back',
  ABDOMEN = 'abdomen',
  HIP = 'hip',
  LIMB = 'limb',
}

/**
 * Definition of a single surface muscle on a body tube.
 */
export interface SurfaceMuscleDef {
  /** Unique name for this muscle */
  name: string;
  /** Which muscle group this belongs to */
  group: SurfaceMuscleGroup;
  /** Start parameter along tube axis [0, 1] */
  startT: number;
  /** End parameter along tube axis [0, 1] */
  endT: number;
  /** Center angle around the tube circumference in radians */
  angle: number;
  /** Angular extent (half-width) in radians */
  angularExtent: number;
  /** Peak displacement along surface normal at full activation */
  peakDisplacement: number;
  /** Current activation level [0, 1] */
  activation: number;
}

/**
 * A single deformation entry on the body tube surface.
 */
export interface SurfaceDeformation {
  /** Position along tube axis (t: 0→1) */
  t: number;
  /** Angle around the tube circumference (radians) */
  angle: number;
  /** Displacement along surface normal */
  displacement: number;
  /** Falloff radius in t-direction */
  tFalloff: number;
  /** Falloff radius in angular direction (radians) */
  angularFalloff: number;
}

/**
 * Neck connection specification between the two body tubes.
 */
export interface NeckConnection {
  /** t-parameter on the primary (body) tube where the neck connects */
  bodyT: number;
  /** t-parameter on the secondary (head) tube where the neck connects */
  headT: number;
  /** Radius of the neck connection */
  radius: number;
  /** Number of radial segments for the neck bridge */
  bridgeSegments: number;
}

/**
 * Activation curve definition for a muscle group.
 * Maps a normalized input (0-1) to an activation output (0-1).
 */
export interface ActivationCurve {
  /** Control points: array of [input, output] pairs forming a piecewise curve */
  points: [number, number][];
}

/**
 * Configuration for the advanced muscle body system.
 */
export interface MuscleBodyConfig {
  /** Length of the primary body tube */
  bodyLength: number;
  /** Base radius of the body tube */
  bodyRadius: number;
  /** Length of the head tube */
  headLength: number;
  /** Base radius of the head tube */
  headRadius: number;
  /** Length of the neck connector */
  neckLength: number;
  /** Radius of the neck connector */
  neckRadius: number;
  /** Maximum depth of muscle displacement */
  muscleDepth: number;
  /** Resolution of muscle displacement sampling */
  muscleResolution: number;
  /** Number of axial segments for tube generation */
  segmentCount: number;
  /** Number of radial segments around the tube circumference */
  radialSegments: number;
}

/**
 * Preset body types for the muscle body system.
 */
export enum MuscleBodyPreset {
  /** 4-legged animal (horse, dog, cat) */
  QUADRUPED = 'quadruped',
  /** 2-legged body (human-like) */
  BIPED = 'biped',
  /** Snake-like elongated body */
  SERPENTINE = 'serpentine',
  /** Bird body with compact torso */
  AVIAN = 'avian',
}

// ============================================================================
// BodyTube
// ============================================================================

/**
 * BodyTube — A single parametric NURBS-like tube for creature body surfaces.
 *
 * Generates a tube geometry from a radius profile function and optional
 * surface deformations. The tube is oriented along the Y-axis (t: 0 = bottom,
 * t: 1 = top) with the radius controlled by a callback.
 *
 * Supports:
 * - Dynamic radius profiles (setProfile)
 * - Surface deformations (setDeformation)
 * - Point queries (getPointAt)
 * - Real geometry generation (buildGeometry)
 */
export class BodyTube {
  /** The radius profile: maps t∈[0,1] to radius */
  private profile: (t: number) => number;
  /** Surface deformations applied during geometry build */
  private deformations: SurfaceDeformation[] = [];
  /** Number of axial segments */
  readonly segmentCount: number;
  /** Number of radial segments around circumference */
  readonly radialSegments: number;
  /** Total length of the tube along Y-axis */
  readonly length: number;

  /**
   * Create a new BodyTube.
   *
   * @param profile - Function mapping t∈[0,1] to radius at that point
   * @param segmentCount - Number of axial segments
   * @param radialSegments - Number of circumferential segments
   * @param length - Total length of the tube
   */
  constructor(
    profile: (t: number) => number,
    segmentCount: number = 32,
    radialSegments: number = 24,
    length: number = 2.0,
  ) {
    this.profile = profile;
    this.segmentCount = segmentCount;
    this.radialSegments = radialSegments;
    this.length = length;
  }

  /**
   * Set the radius profile along the tube axis.
   *
   * @param profile - Function mapping t∈[0,1] to radius
   */
  setProfile(profile: (t: number) => number): void {
    this.profile = profile;
  }

  /**
   * Get the radius at a given t parameter.
   */
  getRadiusAt(t: number): number {
    return this.profile(Math.max(0, Math.min(1, t)));
  }

  /**
   * Add a surface deformation at a point on the tube.
   *
   * @param t - Position along tube axis [0, 1]
   * @param angle - Angle around circumference (radians)
   * @param displacement - Displacement along surface normal
   * @param tFalloff - Falloff radius in t-direction (default: 0.05)
   * @param angularFalloff - Falloff radius in angular direction (default: 0.3 rad)
   */
  setDeformation(
    t: number,
    angle: number,
    displacement: number,
    tFalloff: number = 0.05,
    angularFalloff: number = 0.3,
  ): void {
    this.deformations.push({ t, angle, displacement, tFalloff, angularFalloff });
  }

  /**
   * Clear all deformations.
   */
  clearDeformations(): void {
    this.deformations = [];
  }

  /**
   * Compute the total displacement at a surface point from all deformations.
   */
  getDisplacementAt(t: number, angle: number): number {
    let total = 0;
    for (const def of this.deformations) {
      const dt = (t - def.t) / Math.max(0.001, def.tFalloff);
      const da = this.shortestAngularDist(angle, def.angle) / Math.max(0.001, def.angularFalloff);
      const dist2 = dt * dt + da * da;
      total += def.displacement * Math.exp(-dist2);
    }
    return total;
  }

  /**
   * Get a world-space point on the tube surface.
   *
   * @param t - Position along tube axis [0, 1]
   * @param angle - Angle around circumference (radians)
   * @returns World-space position on the surface
   */
  getPointAt(t: number, angle: number): THREE.Vector3 {
    const clampedT = Math.max(0, Math.min(1, t));
    const y = (clampedT - 0.5) * this.length;
    const radius = this.profile(clampedT) + this.getDisplacementAt(clampedT, angle);
    const x = Math.sin(angle) * radius;
    const z = Math.cos(angle) * radius;
    return new THREE.Vector3(x, y, z);
  }

  /**
   * Get the surface normal at a point on the tube.
   *
   * @param t - Position along tube axis [0, 1]
   * @param angle - Angle around circumference (radians)
   * @returns Surface normal vector (unit length)
   */
  getNormalAt(t: number, angle: number): THREE.Vector3 {
    const eps = 0.001;

    // Tangent along the tube axis (dt direction)
    const p0 = this.getPointAt(t - eps, angle);
    const p1 = this.getPointAt(t + eps, angle);
    const tangentT = new THREE.Vector3().subVectors(p1, p0).normalize();

    // Tangent around the circumference (dangle direction)
    const pa = this.getPointAt(t, angle - eps);
    const pb = this.getPointAt(t, angle + eps);
    const tangentA = new THREE.Vector3().subVectors(pb, pa).normalize();

    // Normal = cross product of the two tangents
    const normal = new THREE.Vector3().crossVectors(tangentT, tangentA).normalize();

    // Ensure normal points outward (away from tube center)
    const center = new THREE.Vector3(0, (t - 0.5) * this.length, 0);
    const surfacePoint = this.getPointAt(t, angle);
    const outward = new THREE.Vector3().subVectors(surfacePoint, center);
    if (normal.dot(outward) < 0) {
      normal.negate();
    }

    return normal;
  }

  /**
   * Build the tube geometry as a THREE.BufferGeometry.
   *
   * Creates a watertight tube mesh with proper UVs and normals.
   * Applies all registered deformations to the vertex positions.
   *
   * @returns BufferGeometry of the tube
   */
  buildGeometry(): THREE.BufferGeometry {
    const { segmentCount, radialSegments, length } = this;

    const vertexCount = (segmentCount + 1) * (radialSegments + 1);
    const positions = new Float32Array(vertexCount * 3);
    const normals = new Float32Array(vertexCount * 3);
    const uvs = new Float32Array(vertexCount * 2);

    // Generate vertices
    let vIdx = 0;
    let uvIdx = 0;

    for (let i = 0; i <= segmentCount; i++) {
      const t = i / segmentCount;
      const y = (t - 0.5) * length;

      for (let j = 0; j <= radialSegments; j++) {
        const angle = (j / radialSegments) * Math.PI * 2;
        const radius = this.profile(t) + this.getDisplacementAt(t, angle);

        const x = Math.sin(angle) * radius;
        const z = Math.cos(angle) * radius;

        positions[vIdx * 3] = x;
        positions[vIdx * 3 + 1] = y;
        positions[vIdx * 3 + 2] = z;

        uvs[uvIdx * 2] = j / radialSegments;
        uvs[uvIdx * 2 + 1] = t;

        vIdx++;
        uvIdx++;
      }
    }

    // Generate indices
    const indexCount = segmentCount * radialSegments * 6;
    const indices = new Uint32Array(indexCount);
    let idx = 0;

    for (let i = 0; i < segmentCount; i++) {
      for (let j = 0; j < radialSegments; j++) {
        const a = i * (radialSegments + 1) + j;
        const b = a + 1;
        const c = (i + 1) * (radialSegments + 1) + j;
        const d = c + 1;

        indices[idx++] = a;
        indices[idx++] = c;
        indices[idx++] = b;

        indices[idx++] = b;
        indices[idx++] = c;
        indices[idx++] = d;
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.computeVertexNormals();

    return geometry;
  }

  /**
   * Compute shortest angular distance between two angles.
   */
  private shortestAngularDist(a: number, b: number): number {
    let d = a - b;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }
}

// ============================================================================
// MuscleLayer
// ============================================================================

/**
 * MuscleLayer — A complete muscle layer on a body tube.
 *
 * Manages a collection of SurfaceMuscleDef instances and applies their
 * displacements to a BodyTube's geometry. Supports 5 muscle groups:
 * SHOULDER, BACK, ABDOMEN, HIP, LIMB.
 *
 * Each muscle's displacement is modulated by its activation level, enabling
 * real-time animation of muscle bulging.
 */
export class MuscleLayer {
  /** The body tube this layer is attached to */
  private bodyTube: BodyTube;
  /** Muscle definitions in this layer */
  private muscles: SurfaceMuscleDef[] = [];
  /** Depth scaling factor for all muscles in this layer */
  readonly layerDepth: number;
  /** Per-group activation curves */
  private activationCurves: Map<SurfaceMuscleGroup, ActivationCurve> = new Map();

  /**
   * Create a new MuscleLayer.
   *
   * @param bodyTube - The body tube this layer wraps
   * @param muscleDefs - Array of muscle definitions for this layer
   * @param layerDepth - Depth scaling factor (default: 1.0)
   */
  constructor(
    bodyTube: BodyTube,
    muscleDefs: SurfaceMuscleDef[] = [],
    layerDepth: number = 1.0,
  ) {
    this.bodyTube = bodyTube;
    this.muscles = muscleDefs.map(m => ({ ...m }));
    this.layerDepth = layerDepth;

    // Initialize default activation curves (linear)
    for (const group of Object.values(SurfaceMuscleGroup)) {
      this.activationCurves.set(group, {
        points: [[0, 0], [1, 1]],
      });
    }
  }

  /**
   * Apply muscle displacement to a geometry.
   *
   * Iterates over all vertices and displaces them along surface normals
   * based on the muscle definitions and their current activation levels.
   *
   * @param geometry - The BufferGeometry to modify
   */
  applyToGeometry(geometry: THREE.BufferGeometry): void {
    const posAttr = geometry.getAttribute('position');
    const normalAttr = geometry.getAttribute('normal');

    if (!normalAttr) {
      geometry.computeVertexNormals();
    }

    const normals = geometry.getAttribute('normal');
    const halfLength = this.bodyTube.length * 0.5;

    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const y = posAttr.getY(i);
      const z = posAttr.getZ(i);

      // Compute t parameter from y position
      const t = y / halfLength + 0.5;
      const clampedT = Math.max(0, Math.min(1, t));

      // Compute angle from x, z
      const angle = Math.atan2(x, z);

      // Get displacement from this muscle layer
      const displacement = this.getDisplacementAt(clampedT, angle);

      if (Math.abs(displacement) > 0.0001) {
        const nx = normals.getX(i);
        const ny = normals.getY(i);
        const nz = normals.getZ(i);

        posAttr.setX(i, x + nx * displacement);
        posAttr.setY(i, y + ny * displacement);
        posAttr.setZ(i, z + nz * displacement);
      }
    }

    posAttr.needsUpdate = true;
    geometry.computeVertexNormals();
  }

  /**
   * Set the activation level for a muscle group.
   *
   * @param group - The muscle group to activate
   * @param activation - Activation level [0, 1]
   */
  setActivation(group: SurfaceMuscleGroup, activation: number): void {
    const clamped = Math.max(0, Math.min(1, activation));

    // Apply activation curve
    const curve = this.activationCurves.get(group);
    const mappedActivation = curve ? this.evaluateActivationCurve(curve, clamped) : clamped;

    for (const muscle of this.muscles) {
      if (muscle.group === group) {
        muscle.activation = mappedActivation;
      }
    }

    // Update deformations on the body tube
    this.syncDeformations();
  }

  /**
   * Get the displacement at a surface point from all muscles in this layer.
   *
   * @param t - Position along tube axis [0, 1]
   * @param angle - Angle around circumference (radians)
   * @returns Displacement along surface normal
   */
  getDisplacementAt(t: number, angle: number): number {
    let total = 0;

    for (const muscle of this.muscles) {
      if (muscle.activation < 0.001) continue;

      // Check t-range
      if (t < muscle.startT || t > muscle.endT) continue;

      // Compute displacement along muscle length (smooth bell curve)
      const muscleCenter = (muscle.startT + muscle.endT) * 0.5;
      const muscleHalfWidth = (muscle.endT - muscle.startT) * 0.5;
      const dt = (t - muscleCenter) / Math.max(0.001, muscleHalfWidth);
      const lengthProfile = Math.exp(-dt * dt * 2);

      // Compute displacement cross-section (Gaussian angular profile)
      const da = this.shortestAngularDist(angle, muscle.angle) /
        Math.max(0.001, muscle.angularExtent);
      const crossSection = Math.exp(-da * da * 3);

      // Displacement = peak * activation * length_profile * cross_section * layer_depth
      total += muscle.peakDisplacement * muscle.activation * lengthProfile *
        crossSection * this.layerDepth;
    }

    return total;
  }

  /**
   * Get all muscle definitions in this layer.
   */
  getMuscles(): readonly SurfaceMuscleDef[] {
    return this.muscles;
  }

  /**
   * Add a muscle definition to this layer.
   */
  addMuscle(def: SurfaceMuscleDef): void {
    this.muscles.push({ ...def });
  }

  /**
   * Set a custom activation curve for a muscle group.
   *
   * @param group - The muscle group
   * @param curve - The activation curve
   */
  setActivationCurve(group: SurfaceMuscleGroup, curve: ActivationCurve): void {
    this.activationCurves.set(group, curve);
  }

  /**
   * Sync the body tube's deformations from current muscle activations.
   */
  private syncDeformations(): void {
    // We don't directly modify bodyTube deformations here because
    // displacement is computed on-the-fly in getDisplacementAt().
    // The bodyTube's own deformations are separate from muscle layer displacements.
  }

  /**
   * Evaluate an activation curve at a given input.
   */
  private evaluateActivationCurve(curve: ActivationCurve, input: number): number {
    const points = curve.points;
    if (points.length === 0) return input;
    if (points.length === 1) return points[0][1];

    // Clamp input to curve range
    const clampedInput = Math.max(points[0][0], Math.min(points[points.length - 1][0], input));

    // Find the segment containing the input
    for (let i = 0; i < points.length - 1; i++) {
      if (clampedInput >= points[i][0] && clampedInput <= points[i + 1][0]) {
        const t = (clampedInput - points[i][0]) /
          Math.max(0.0001, points[i + 1][0] - points[i][0]);
        // Smooth interpolation (smoothstep)
        const st = t * t * (3 - 2 * t);
        return points[i][1] + (points[i + 1][1] - points[i][1]) * st;
      }
    }

    return points[points.length - 1][1];
  }

  /**
   * Shortest angular distance between two angles.
   */
  private shortestAngularDist(a: number, b: number): number {
    let d = a - b;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }
}

// ============================================================================
// DualTubeBody
// ============================================================================

/**
 * DualTubeBody — Two-tube creature body with muscle layers.
 *
 * The primary tube represents the main body (torso + abdomen),
 * while the secondary tube represents the head/neck. The two tubes
 * are connected by a smooth neck bridge.
 *
 * Supports adding multiple muscle layers and animating muscle bulging
 * per muscle group.
 */
export class DualTubeBody {
  /** Primary body tube */
  private bodyTube: BodyTube;
  /** Secondary head tube */
  private headTube: BodyTube;
  /** Muscle layers on the body */
  private bodyMuscleLayers: MuscleLayer[] = [];
  /** Muscle layers on the head */
  private headMuscleLayers: MuscleLayer[] = [];
  /** Neck connection specification */
  private neckConnection: NeckConnection;
  /** The built mesh group */
  private meshGroup: THREE.Group | null = null;
  /** Configuration */
  private config: MuscleBodyConfig;

  /**
   * Create a new DualTubeBody.
   *
   * @param config - Body configuration parameters
   */
  constructor(config: Partial<MuscleBodyConfig> = {}) {
    this.config = {
      bodyLength: 2.0,
      bodyRadius: 0.35,
      headLength: 0.6,
      headRadius: 0.25,
      neckLength: 0.3,
      neckRadius: 0.12,
      muscleDepth: 1.0,
      muscleResolution: 1.0,
      segmentCount: 32,
      radialSegments: 24,
      ...config,
    };

    // Create body tube with default quadruped-like profile
    this.bodyTube = new BodyTube(
      (t: number) => this.defaultBodyProfile(t),
      this.config.segmentCount,
      this.config.radialSegments,
      this.config.bodyLength,
    );

    // Create head tube with default profile
    this.headTube = new BodyTube(
      (t: number) => this.defaultHeadProfile(t),
      Math.max(8, Math.floor(this.config.segmentCount * 0.5)),
      this.config.radialSegments,
      this.config.headLength,
    );

    // Default neck connection
    this.neckConnection = {
      bodyT: 0.15,
      headT: 0.85,
      radius: this.config.neckRadius,
      bridgeSegments: 8,
    };
  }

  /**
   * Set the primary body tube profile.
   *
   * @param profile - Function mapping t∈[0,1] to radius at that point
   */
  setBodyProfile(profile: (t: number) => number): void {
    this.bodyTube.setProfile(profile);
  }

  /**
   * Set the secondary head tube profile.
   *
   * @param profile - Function mapping t∈[0,1] to radius at that point
   */
  setHeadProfile(profile: (t: number) => number): void {
    this.headTube.setProfile(profile);
  }

  /**
   * Set the neck connection between the two tubes.
   *
   * @param bodyT - t-parameter on the body tube where the neck connects
   * @param headT - t-parameter on the head tube where the neck connects
   * @param radius - Radius of the neck connection
   */
  setNeckConnection(bodyT: number, headT: number, radius: number): void {
    this.neckConnection = { bodyT, headT, radius, bridgeSegments: 8 };
  }

  /**
   * Add a muscle layer to the body.
   *
   * @param muscleDefs - Array of muscle definitions for this layer
   * @param target - Which tube to apply the layer to ('body' or 'head')
   * @returns The created MuscleLayer
   */
  addMuscleLayer(
    muscleDefs: SurfaceMuscleDef[],
    target: 'body' | 'head' = 'body',
  ): MuscleLayer {
    const tube = target === 'body' ? this.bodyTube : this.headTube;
    const layer = new MuscleLayer(tube, muscleDefs, this.config.muscleDepth);

    if (target === 'body') {
      this.bodyMuscleLayers.push(layer);
    } else {
      this.headMuscleLayers.push(layer);
    }

    return layer;
  }

  /**
   * Set the activation of a muscle group across all layers.
   *
   * @param group - The muscle group to activate
   * @param activation - Activation level [0, 1]
   */
  setMuscleActivation(group: SurfaceMuscleGroup, activation: number): void {
    for (const layer of this.bodyMuscleLayers) {
      layer.setActivation(group, activation);
    }
    for (const layer of this.headMuscleLayers) {
      layer.setActivation(group, activation);
    }
  }

  /**
   * Build the complete body mesh.
   *
   * Generates geometry for the body tube, head tube, and neck bridge,
   * applies all muscle layers, and returns a THREE.Group.
   *
   * @returns THREE.Group containing the complete body mesh
   */
  build(): THREE.Group {
    this.meshGroup = new THREE.Group();
    this.meshGroup.name = 'dualTubeBody';

    // Build body tube geometry
    const bodyGeometry = this.bodyTube.buildGeometry();
    this.applyMuscleLayersToGeometry(bodyGeometry, this.bodyMuscleLayers);

    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0x8b7355,
      roughness: 0.7,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });

    const bodyMesh = new THREE.Mesh(bodyGeometry, bodyMaterial);
    bodyMesh.name = 'bodyTube';
    this.meshGroup.add(bodyMesh);

    // Build head tube geometry and position it
    const headGeometry = this.headTube.buildGeometry();
    this.applyMuscleLayersToGeometry(headGeometry, this.headMuscleLayers);

    const headMaterial = new THREE.MeshStandardMaterial({
      color: 0x8b7355,
      roughness: 0.65,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });

    const headMesh = new THREE.Mesh(headGeometry, headMaterial);
    headMesh.name = 'headTube';

    // Position the head above the body's neck connection point
    const neckBodyPoint = this.bodyTube.getPointAt(this.neckConnection.bodyT, 0);
    const headOffset = neckBodyPoint.y + this.config.headLength * 0.5 + this.config.neckLength;
    headMesh.position.y = headOffset;

    this.meshGroup.add(headMesh);

    // Build neck bridge geometry
    const neckGeometry = this.buildNeckBridge();
    if (neckGeometry) {
      const neckMaterial = new THREE.MeshStandardMaterial({
        color: 0x8b7355,
        roughness: 0.75,
        metalness: 0.0,
        side: THREE.DoubleSide,
      });

      const neckMesh = new THREE.Mesh(neckGeometry, neckMaterial);
      neckMesh.name = 'neckBridge';
      this.meshGroup.add(neckMesh);
    }

    return this.meshGroup;
  }

  /**
   * Get the body tube.
   */
  getBodyTube(): BodyTube {
    return this.bodyTube;
  }

  /**
   * Get the head tube.
   */
  getHeadTube(): BodyTube {
    return this.headTube;
  }

  /**
   * Get all muscle layers.
   */
  getMuscleLayers(): { body: MuscleLayer[]; head: MuscleLayer[] } {
    return { body: this.bodyMuscleLayers, head: this.headMuscleLayers };
  }

  /**
   * Get the mesh group (must call build() first).
   */
  getMeshGroup(): THREE.Group | null {
    return this.meshGroup;
  }

  /**
   * Update muscle displacements on the existing mesh.
   *
   * Call this after changing muscle activations to update the visual geometry.
   * Rebuilds the geometry and replaces it on the mesh.
   */
  updateMuscles(): void {
    if (!this.meshGroup) return;

    const bodyMesh = this.meshGroup.getObjectByName('bodyTube') as THREE.Mesh | undefined;
    if (bodyMesh) {
      const newGeometry = this.bodyTube.buildGeometry();
      this.applyMuscleLayersToGeometry(newGeometry, this.bodyMuscleLayers);
      bodyMesh.geometry.dispose();
      bodyMesh.geometry = newGeometry;
    }

    const headMesh = this.meshGroup.getObjectByName('headTube') as THREE.Mesh | undefined;
    if (headMesh) {
      const newGeometry = this.headTube.buildGeometry();
      this.applyMuscleLayersToGeometry(newGeometry, this.headMuscleLayers);
      headMesh.geometry.dispose();
      headMesh.geometry = newGeometry;
    }
  }

  // ── Private Helpers ──────────────────────────────────────────────────

  /**
   * Default body profile for a quadruped-like body.
   * Wider at the chest and hip, narrower at the waist.
   */
  private defaultBodyProfile(t: number): number {
    const base = this.config.bodyRadius;

    // Chest/shoulder bulge (t ≈ 0.2)
    const shoulderBulge = 0.15 * Math.exp(-Math.pow((t - 0.2) * 5, 2));
    // Abdomen bulge (t ≈ 0.45)
    const abdomenBulge = 0.08 * Math.exp(-Math.pow((t - 0.45) * 5, 2));
    // Hip bulge (t ≈ 0.7)
    const hipBulge = 0.12 * Math.exp(-Math.pow((t - 0.7) * 5, 2));
    // Taper at head end (t → 0)
    const headTaper = t < 0.1 ? t / 0.1 : 1.0;
    // Taper at tail end (t → 1)
    const tailTaper = t > 0.85 ? (1 - t) / 0.15 : 1.0;

    return base * (1 + shoulderBulge + abdomenBulge + hipBulge) * headTaper * tailTaper;
  }

  /**
   * Default head profile.
   * Wider in the middle (cranium), tapering to the snout.
   */
  private defaultHeadProfile(t: number): number {
    const base = this.config.headRadius;

    // Cranium bulge (t ≈ 0.5)
    const cranium = 0.2 * Math.exp(-Math.pow((t - 0.5) * 3, 2));
    // Jaw line (t ≈ 0.2)
    const jaw = 0.1 * Math.exp(-Math.pow((t - 0.2) * 4, 2));
    // Snout taper (t → 0)
    const snoutTaper = t < 0.15 ? t / 0.15 : 1.0;
    // Back of head taper (t → 1)
    const backTaper = t > 0.85 ? (1 - t) / 0.15 : 1.0;

    return base * (1 + cranium + jaw) * snoutTaper * backTaper;
  }

  /**
   * Apply muscle layers to a geometry.
   */
  private applyMuscleLayersToGeometry(
    geometry: THREE.BufferGeometry,
    layers: MuscleLayer[],
  ): void {
    for (const layer of layers) {
      layer.applyToGeometry(geometry);
    }
  }

  /**
   * Build the neck bridge geometry connecting the body and head tubes.
   *
   * Creates a smooth transitional surface between the neck connection point
   * on the body tube and the corresponding point on the head tube.
   */
  private buildNeckBridge(): THREE.BufferGeometry | null {
    const { neckConnection, bodyTube, headTube, config } = this;
    const segs = neckConnection.bridgeSegments;
    const radSegs = config.radialSegments;

    const vertexCount = (segs + 1) * (radSegs + 1);
    const positions = new Float32Array(vertexCount * 3);
    const uvs = new Float32Array(vertexCount * 2);

    // Get connection points
    const bodyNeckY = (neckConnection.bodyT - 0.5) * bodyTube.length;
    const headBottomY = bodyNeckY + config.neckLength + config.headLength * 0.5;
    const bodyRadius = bodyTube.getRadiusAt(neckConnection.bodyT);
    const headRadius = headTube.getRadiusAt(neckConnection.headT);

    // Generate vertices - interpolate between body and head cross-sections
    let vIdx = 0;
    let uvIdx = 0;

    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const y = bodyNeckY + t * (headBottomY - bodyNeckY);

      // Smooth interpolation of radius (use neck radius as minimum)
      const r = this.smoothNeckRadius(
        t,
        bodyRadius,
        neckConnection.radius,
        headRadius,
      );

      for (let j = 0; j <= radSegs; j++) {
        const angle = (j / radSegs) * Math.PI * 2;
        positions[vIdx * 3] = Math.sin(angle) * r;
        positions[vIdx * 3 + 1] = y;
        positions[vIdx * 3 + 2] = Math.cos(angle) * r;

        uvs[uvIdx * 2] = j / radSegs;
        uvs[uvIdx * 2 + 1] = t;

        vIdx++;
        uvIdx++;
      }
    }

    // Generate indices
    const indexCount = segs * radSegs * 6;
    const indices = new Uint32Array(indexCount);
    let idx = 0;

    for (let i = 0; i < segs; i++) {
      for (let j = 0; j < radSegs; j++) {
        const a = i * (radSegs + 1) + j;
        const b = a + 1;
        const c = (i + 1) * (radSegs + 1) + j;
        const d = c + 1;

        indices[idx++] = a;
        indices[idx++] = c;
        indices[idx++] = b;

        indices[idx++] = b;
        indices[idx++] = c;
        indices[idx++] = d;
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.computeVertexNormals();

    return geometry;
  }

  /**
   * Smooth neck radius interpolation between body and head.
   */
  private smoothNeckRadius(
    t: number,
    bodyRadius: number,
    neckRadius: number,
    headRadius: number,
  ): number {
    // Smoothstep from bodyRadius → neckRadius → headRadius
    if (t < 0.3) {
      const s = t / 0.3;
      const ss = s * s * (3 - 2 * s);
      return THREE.MathUtils.lerp(bodyRadius, neckRadius, ss);
    } else if (t < 0.7) {
      return neckRadius;
    } else {
      const s = (t - 0.7) / 0.3;
      const ss = s * s * (3 - 2 * s);
      return THREE.MathUtils.lerp(neckRadius, headRadius, ss);
    }
  }
}

// ============================================================================
// MuscleAnimationDriver
// ============================================================================

/**
 * MuscleAnimationDriver — Drives muscle activation based on skeleton pose.
 *
 * Monitors bone transforms in a THREE.Skeleton and automatically activates
 * corresponding muscle groups when limbs move. Supports:
 * - Walking (leg muscles cycle)
 * - Breathing (abdomen oscillates)
 * - Jaw movement (head muscles activate)
 *
 * Usage:
 * ```typescript
 * const driver = new MuscleAnimationDriver(dualTubeBody);
 * driver.setActivationCurve(SurfaceMuscleGroup.LIMB, { points: [[0, 0], [0.3, 0], [0.5, 0.8], [1, 1]] });
 * // In animation loop:
 * driver.update(skeleton, deltaTime);
 * ```
 */
export class MuscleAnimationDriver {
  /** The dual tube body to drive */
  private body: DualTubeBody;
  /** Per-group activation curves */
  private activationCurves: Map<SurfaceMuscleGroup, ActivationCurve> = new Map();
  /** Currently active muscle groups and their activation levels */
  private activeMuscles: Map<SurfaceMuscleGroup, number> = new Map();
  /** Previous bone transforms for velocity computation */
  private prevBoneTransforms: Map<string, { position: THREE.Vector3; rotation: THREE.Quaternion }> = new Map();
  /** Breathing phase accumulator */
  private breathPhase: number = 0;
  /** Breathing rate in cycles per second */
  private breathRate: number = 0.3;
  /** Breathing depth (max abdomen activation from breathing) */
  private breathDepth: number = 0.15;
  /** Walking phase accumulator */
  private walkPhase: number = 0;
  /** Walking speed (cycles per second) */
  private walkSpeed: number = 1.2;
  /** Whether the creature is walking */
  private isWalking: boolean = false;
  /** Smoothing factor for activation changes */
  private smoothingFactor: number = 5.0;

  /**
   * Create a new MuscleAnimationDriver.
   *
   * @param body - The DualTubeBody to animate
   */
  constructor(body: DualTubeBody) {
    this.body = body;

    // Initialize default activation curves
    for (const group of Object.values(SurfaceMuscleGroup)) {
      this.activationCurves.set(group, {
        points: [[0, 0], [0.2, 0.1], [0.5, 0.5], [0.8, 0.85], [1, 1]],
      });
      this.activeMuscles.set(group, 0);
    }
  }

  /**
   * Update muscle activations from skeleton pose.
   *
   * Examines bone transforms to detect limb movement, jaw opening,
   * and body motion, then activates appropriate muscle groups.
   *
   * @param skeleton - The creature's skeleton
   * @param deltaTime - Time step in seconds
   */
  update(skeleton: THREE.Skeleton, deltaTime: number): void {
    const dt = Math.min(deltaTime, 0.05);

    // Analyze skeleton pose to determine muscle activations
    const limbMotion = this.computeLimbMotion(skeleton);
    const jawMotion = this.computeJawMotion(skeleton);
    const spinalMotion = this.computeSpinalMotion(skeleton);

    // Determine if walking based on leg motion
    this.isWalking = limbMotion > 0.1;

    // Update walking phase
    if (this.isWalking) {
      this.walkPhase += dt * this.walkSpeed * Math.PI * 2;
    } else {
      this.walkPhase *= 0.95; // Decay when not walking
    }

    // Update breathing
    this.breathPhase += dt * this.breathRate * Math.PI * 2;

    // Compute target activations
    const targets = new Map<SurfaceMuscleGroup, number>();

    // SHOULDER: Activated by front leg motion
    targets.set(SurfaceMuscleGroup.SHOULDER, Math.min(1, limbMotion * 1.5));

    // BACK: Activated by spinal motion and walking
    const walkBackActivation = this.isWalking ?
      0.3 + 0.2 * Math.sin(this.walkPhase * 2) : 0;
    targets.set(SurfaceMuscleGroup.BACK, Math.min(1,
      Math.max(spinalMotion * 0.8, walkBackActivation)));

    // ABDOMEN: Activated by breathing and walking
    const breathActivation = this.breathDepth *
      (0.5 + 0.5 * Math.sin(this.breathPhase));
    const walkAbdomenActivation = this.isWalking ?
      0.2 + 0.15 * Math.sin(this.walkPhase) : 0;
    targets.set(SurfaceMuscleGroup.ABDOMEN, Math.min(1,
      Math.max(breathActivation, walkAbdomenActivation)));

    // HIP: Activated by hind leg motion
    targets.set(SurfaceMuscleGroup.HIP, Math.min(1, limbMotion * 1.2));

    // LIMB: Activated by any limb motion with walking cycle
    const walkLimbActivation = this.isWalking ?
      0.3 + 0.4 * Math.abs(Math.sin(this.walkPhase)) : limbMotion * 0.5;
    targets.set(SurfaceMuscleGroup.LIMB, Math.min(1, walkLimbActivation));

    // Jaw activation
    if (jawMotion > 0.05) {
      const currentShoulder = targets.get(SurfaceMuscleGroup.SHOULDER) ?? 0;
      targets.set(SurfaceMuscleGroup.SHOULDER, Math.min(1, currentShoulder + jawMotion * 0.3));
    }

    // Smooth and apply activations
    for (const [group, targetActivation] of targets) {
      const curve = this.activationCurves.get(group);
      const mappedTarget = curve ?
        this.evaluateActivationCurve(curve, targetActivation) : targetActivation;

      const current = this.activeMuscles.get(group) ?? 0;
      const smoothed = current + (mappedTarget - current) *
        Math.min(1, this.smoothingFactor * dt);

      this.activeMuscles.set(group, smoothed);
      this.body.setMuscleActivation(group, smoothed);
    }

    // Store current bone transforms for next frame
    this.cacheBoneTransforms(skeleton);
  }

  /**
   * Set a custom activation curve for a muscle group.
   *
   * @param group - The muscle group
   * @param curve - The activation curve
   */
  setActivationCurve(group: SurfaceMuscleGroup, curve: ActivationCurve): void {
    this.activationCurves.set(group, curve);
  }

  /**
   * Get currently active muscle groups and their activation levels.
   *
   * @returns Map of muscle groups to their current activation (0-1)
   */
  getActiveMuscles(): Map<SurfaceMuscleGroup, number> {
    return new Map(this.activeMuscles);
  }

  /**
   * Set the walking state directly.
   */
  setWalking(isWalking: boolean, speed: number = 1.2): void {
    this.isWalking = isWalking;
    this.walkSpeed = speed;
  }

  /**
   * Set the breathing parameters.
   */
  setBreathing(rate: number, depth: number): void {
    this.breathRate = rate;
    this.breathDepth = depth;
  }

  // ── Private Helpers ──────────────────────────────────────────────────

  /**
   * Compute limb motion from skeleton bone velocities.
   */
  private computeLimbMotion(skeleton: THREE.Skeleton): number {
    let totalMotion = 0;
    let count = 0;

    const limbNames = ['humerus', 'femur', 'radius', 'tibia', 'hand', 'foot',
      'upper_', 'lower_', 'leg_'];

    for (const bone of skeleton.bones) {
      const isLimb = limbNames.some(name => bone.name.includes(name));
      if (!isLimb) continue;

      const prev = this.prevBoneTransforms.get(bone.name);
      if (!prev) continue;

      // Compute position delta
      const posDelta = bone.position.distanceTo(prev.position);

      // Compute rotation delta (angle)
      const rotDelta = prev.rotation.angleTo(bone.quaternion);

      totalMotion += posDelta + rotDelta * 0.5;
      count++;
    }

    return count > 0 ? Math.min(1, totalMotion / count * 10) : 0;
  }

  /**
   * Compute jaw motion from skeleton.
   */
  private computeJawMotion(skeleton: THREE.Skeleton): number {
    const jawBone = skeleton.bones.find(b =>
      b.name.includes('jaw') || b.name.includes('beak'));

    if (!jawBone) return 0;

    const prev = this.prevBoneTransforms.get(jawBone.name);
    if (!prev) return 0;

    const rotDelta = prev.rotation.angleTo(jawBone.quaternion);
    return Math.min(1, rotDelta * 3);
  }

  /**
   * Compute spinal motion from skeleton.
   */
  private computeSpinalMotion(skeleton: THREE.Skeleton): number {
    let totalMotion = 0;
    let count = 0;

    for (const bone of skeleton.bones) {
      if (!bone.name.includes('spine')) continue;

      const prev = this.prevBoneTransforms.get(bone.name);
      if (!prev) continue;

      const rotDelta = prev.rotation.angleTo(bone.quaternion);
      totalMotion += rotDelta;
      count++;
    }

    return count > 0 ? Math.min(1, totalMotion / count * 5) : 0;
  }

  /**
   * Cache current bone transforms for next frame's velocity computation.
   */
  private cacheBoneTransforms(skeleton: THREE.Skeleton): void {
    for (const bone of skeleton.bones) {
      this.prevBoneTransforms.set(bone.name, {
        position: bone.position.clone(),
        rotation: bone.quaternion.clone(),
      });
    }
  }

  /**
   * Evaluate an activation curve at a given input.
   */
  private evaluateActivationCurve(curve: ActivationCurve, input: number): number {
    const points = curve.points;
    if (points.length === 0) return input;
    if (points.length === 1) return points[0][1];

    const clampedInput = Math.max(points[0][0], Math.min(points[points.length - 1][0], input));

    for (let i = 0; i < points.length - 1; i++) {
      if (clampedInput >= points[i][0] && clampedInput <= points[i + 1][0]) {
        const t = (clampedInput - points[i][0]) /
          Math.max(0.0001, points[i + 1][0] - points[i][0]);
        const st = t * t * (3 - 2 * t);
        return points[i][1] + (points[i + 1][1] - points[i][1]) * st;
      }
    }

    return points[points.length - 1][1];
  }
}

// ============================================================================
// Preset Factory
// ============================================================================

/**
 * Default muscle definitions for a quadruped body.
 * 10 muscles per side (20 total) covering major groups.
 */
const QUADRUPED_BODY_MUSCLES: SurfaceMuscleDef[] = [
  // Left side - Shoulder group
  { name: 'deltoid_L', group: SurfaceMuscleGroup.SHOULDER, startT: 0.12, endT: 0.25, angle: Math.PI * 0.5, angularExtent: 0.6, peakDisplacement: 0.06, activation: 0 },
  { name: 'trapezius_L', group: SurfaceMuscleGroup.SHOULDER, startT: 0.08, endT: 0.22, angle: Math.PI * 0.35, angularExtent: 0.4, peakDisplacement: 0.04, activation: 0 },
  // Left side - Back group
  { name: 'latissimus_L', group: SurfaceMuscleGroup.BACK, startT: 0.2, endT: 0.45, angle: Math.PI * 0.4, angularExtent: 0.5, peakDisplacement: 0.05, activation: 0 },
  { name: 'erector_L', group: SurfaceMuscleGroup.BACK, startT: 0.15, endT: 0.6, angle: Math.PI * 0.15, angularExtent: 0.3, peakDisplacement: 0.03, activation: 0 },
  // Left side - Abdomen group
  { name: 'rectus_abdominis_L', group: SurfaceMuscleGroup.ABDOMEN, startT: 0.35, endT: 0.55, angle: Math.PI * 0.6, angularExtent: 0.35, peakDisplacement: 0.03, activation: 0 },
  { name: 'external_oblique_L', group: SurfaceMuscleGroup.ABDOMEN, startT: 0.3, endT: 0.5, angle: Math.PI * 0.55, angularExtent: 0.4, peakDisplacement: 0.025, activation: 0 },
  // Left side - Hip group
  { name: 'gluteus_L', group: SurfaceMuscleGroup.HIP, startT: 0.6, endT: 0.75, angle: Math.PI * 0.45, angularExtent: 0.5, peakDisplacement: 0.06, activation: 0 },
  { name: 'hamstring_L', group: SurfaceMuscleGroup.HIP, startT: 0.55, endT: 0.72, angle: Math.PI * 0.55, angularExtent: 0.35, peakDisplacement: 0.05, activation: 0 },
  // Left side - Limb group
  { name: 'quadriceps_L', group: SurfaceMuscleGroup.LIMB, startT: 0.6, endT: 0.72, angle: Math.PI * 0.65, angularExtent: 0.3, peakDisplacement: 0.04, activation: 0 },
  { name: 'triceps_L', group: SurfaceMuscleGroup.LIMB, startT: 0.15, endT: 0.25, angle: Math.PI * 0.6, angularExtent: 0.25, peakDisplacement: 0.035, activation: 0 },

  // Right side (mirrored) - Shoulder group
  { name: 'deltoid_R', group: SurfaceMuscleGroup.SHOULDER, startT: 0.12, endT: 0.25, angle: -Math.PI * 0.5, angularExtent: 0.6, peakDisplacement: 0.06, activation: 0 },
  { name: 'trapezius_R', group: SurfaceMuscleGroup.SHOULDER, startT: 0.08, endT: 0.22, angle: -Math.PI * 0.35, angularExtent: 0.4, peakDisplacement: 0.04, activation: 0 },
  // Right side - Back group
  { name: 'latissimus_R', group: SurfaceMuscleGroup.BACK, startT: 0.2, endT: 0.45, angle: -Math.PI * 0.4, angularExtent: 0.5, peakDisplacement: 0.05, activation: 0 },
  { name: 'erector_R', group: SurfaceMuscleGroup.BACK, startT: 0.15, endT: 0.6, angle: -Math.PI * 0.15, angularExtent: 0.3, peakDisplacement: 0.03, activation: 0 },
  // Right side - Abdomen group
  { name: 'rectus_abdominis_R', group: SurfaceMuscleGroup.ABDOMEN, startT: 0.35, endT: 0.55, angle: -Math.PI * 0.6, angularExtent: 0.35, peakDisplacement: 0.03, activation: 0 },
  { name: 'external_oblique_R', group: SurfaceMuscleGroup.ABDOMEN, startT: 0.3, endT: 0.5, angle: -Math.PI * 0.55, angularExtent: 0.4, peakDisplacement: 0.025, activation: 0 },
  // Right side - Hip group
  { name: 'gluteus_R', group: SurfaceMuscleGroup.HIP, startT: 0.6, endT: 0.75, angle: -Math.PI * 0.45, angularExtent: 0.5, peakDisplacement: 0.06, activation: 0 },
  { name: 'hamstring_R', group: SurfaceMuscleGroup.HIP, startT: 0.55, endT: 0.72, angle: -Math.PI * 0.55, angularExtent: 0.35, peakDisplacement: 0.05, activation: 0 },
  // Right side - Limb group
  { name: 'quadriceps_R', group: SurfaceMuscleGroup.LIMB, startT: 0.6, endT: 0.72, angle: -Math.PI * 0.65, angularExtent: 0.3, peakDisplacement: 0.04, activation: 0 },
  { name: 'triceps_R', group: SurfaceMuscleGroup.LIMB, startT: 0.15, endT: 0.25, angle: -Math.PI * 0.6, angularExtent: 0.25, peakDisplacement: 0.035, activation: 0 },
];

/**
 * Default muscle definitions for a biped body.
 */
const BIPED_BODY_MUSCLES: SurfaceMuscleDef[] = [
  // Left side
  { name: 'deltoid_L', group: SurfaceMuscleGroup.SHOULDER, startT: 0.08, endT: 0.18, angle: Math.PI * 0.5, angularExtent: 0.5, peakDisplacement: 0.07, activation: 0 },
  { name: 'pectoralis_L', group: SurfaceMuscleGroup.SHOULDER, startT: 0.1, endT: 0.22, angle: Math.PI * 0.55, angularExtent: 0.45, peakDisplacement: 0.06, activation: 0 },
  { name: 'latissimus_L', group: SurfaceMuscleGroup.BACK, startT: 0.12, endT: 0.4, angle: Math.PI * 0.3, angularExtent: 0.5, peakDisplacement: 0.05, activation: 0 },
  { name: 'erector_L', group: SurfaceMuscleGroup.BACK, startT: 0.1, endT: 0.55, angle: Math.PI * 0.1, angularExtent: 0.25, peakDisplacement: 0.03, activation: 0 },
  { name: 'rectus_abdominis_L', group: SurfaceMuscleGroup.ABDOMEN, startT: 0.25, endT: 0.5, angle: Math.PI * 0.6, angularExtent: 0.3, peakDisplacement: 0.04, activation: 0 },
  { name: 'external_oblique_L', group: SurfaceMuscleGroup.ABDOMEN, startT: 0.22, endT: 0.45, angle: Math.PI * 0.5, angularExtent: 0.35, peakDisplacement: 0.03, activation: 0 },
  { name: 'gluteus_L', group: SurfaceMuscleGroup.HIP, startT: 0.55, endT: 0.7, angle: Math.PI * 0.4, angularExtent: 0.5, peakDisplacement: 0.07, activation: 0 },
  { name: 'quadriceps_L', group: SurfaceMuscleGroup.LIMB, startT: 0.55, endT: 0.68, angle: Math.PI * 0.6, angularExtent: 0.35, peakDisplacement: 0.05, activation: 0 },
  { name: 'hamstring_L', group: SurfaceMuscleGroup.HIP, startT: 0.55, endT: 0.7, angle: Math.PI * 0.5, angularExtent: 0.3, peakDisplacement: 0.045, activation: 0 },
  { name: 'calf_L', group: SurfaceMuscleGroup.LIMB, startT: 0.6, endT: 0.72, angle: Math.PI * 0.55, angularExtent: 0.25, peakDisplacement: 0.04, activation: 0 },

  // Right side (mirrored)
  { name: 'deltoid_R', group: SurfaceMuscleGroup.SHOULDER, startT: 0.08, endT: 0.18, angle: -Math.PI * 0.5, angularExtent: 0.5, peakDisplacement: 0.07, activation: 0 },
  { name: 'pectoralis_R', group: SurfaceMuscleGroup.SHOULDER, startT: 0.1, endT: 0.22, angle: -Math.PI * 0.55, angularExtent: 0.45, peakDisplacement: 0.06, activation: 0 },
  { name: 'latissimus_R', group: SurfaceMuscleGroup.BACK, startT: 0.12, endT: 0.4, angle: -Math.PI * 0.3, angularExtent: 0.5, peakDisplacement: 0.05, activation: 0 },
  { name: 'erector_R', group: SurfaceMuscleGroup.BACK, startT: 0.1, endT: 0.55, angle: -Math.PI * 0.1, angularExtent: 0.25, peakDisplacement: 0.03, activation: 0 },
  { name: 'rectus_abdominis_R', group: SurfaceMuscleGroup.ABDOMEN, startT: 0.25, endT: 0.5, angle: -Math.PI * 0.6, angularExtent: 0.3, peakDisplacement: 0.04, activation: 0 },
  { name: 'external_oblique_R', group: SurfaceMuscleGroup.ABDOMEN, startT: 0.22, endT: 0.45, angle: -Math.PI * 0.5, angularExtent: 0.35, peakDisplacement: 0.03, activation: 0 },
  { name: 'gluteus_R', group: SurfaceMuscleGroup.HIP, startT: 0.55, endT: 0.7, angle: -Math.PI * 0.4, angularExtent: 0.5, peakDisplacement: 0.07, activation: 0 },
  { name: 'quadriceps_R', group: SurfaceMuscleGroup.LIMB, startT: 0.55, endT: 0.68, angle: -Math.PI * 0.6, angularExtent: 0.35, peakDisplacement: 0.05, activation: 0 },
  { name: 'hamstring_R', group: SurfaceMuscleGroup.HIP, startT: 0.55, endT: 0.7, angle: -Math.PI * 0.5, angularExtent: 0.3, peakDisplacement: 0.045, activation: 0 },
  { name: 'calf_R', group: SurfaceMuscleGroup.LIMB, startT: 0.6, endT: 0.72, angle: -Math.PI * 0.55, angularExtent: 0.25, peakDisplacement: 0.04, activation: 0 },
];

/**
 * Default muscle definitions for a serpentine body.
 * Simpler, elongated muscle pattern along the spine.
 */
const SERPENTINE_BODY_MUSCLES: SurfaceMuscleDef[] = [
  // Segmented muscles along the body
  ...Array.from({ length: 8 }, (_, i) => {
    const t0 = i * 0.11 + 0.05;
    return [
      { name: `segment_${i}_L`, group: SurfaceMuscleGroup.BACK, startT: t0, endT: t0 + 0.09, angle: Math.PI * 0.4, angularExtent: 0.5, peakDisplacement: 0.03, activation: 0 } as SurfaceMuscleDef,
      { name: `segment_${i}_R`, group: SurfaceMuscleGroup.BACK, startT: t0, endT: t0 + 0.09, angle: -Math.PI * 0.4, angularExtent: 0.5, peakDisplacement: 0.03, activation: 0 } as SurfaceMuscleDef,
    ];
  }).flat(),
  // Abdomen muscles
  { name: 'ventral_0', group: SurfaceMuscleGroup.ABDOMEN, startT: 0.1, endT: 0.3, angle: Math.PI, angularExtent: 0.4, peakDisplacement: 0.02, activation: 0 },
  { name: 'ventral_1', group: SurfaceMuscleGroup.ABDOMEN, startT: 0.35, endT: 0.55, angle: Math.PI, angularExtent: 0.4, peakDisplacement: 0.02, activation: 0 },
  { name: 'ventral_2', group: SurfaceMuscleGroup.ABDOMEN, startT: 0.6, endT: 0.8, angle: Math.PI, angularExtent: 0.4, peakDisplacement: 0.02, activation: 0 },
];

/**
 * Default muscle definitions for an avian body.
 * Compact torso with prominent flight muscles.
 */
const AVIAN_BODY_MUSCLES: SurfaceMuscleDef[] = [
  // Large pectoral muscles for flight
  { name: 'pectoralis_L', group: SurfaceMuscleGroup.SHOULDER, startT: 0.15, endT: 0.4, angle: Math.PI * 0.5, angularExtent: 0.6, peakDisplacement: 0.08, activation: 0 },
  { name: 'pectoralis_R', group: SurfaceMuscleGroup.SHOULDER, startT: 0.15, endT: 0.4, angle: -Math.PI * 0.5, angularExtent: 0.6, peakDisplacement: 0.08, activation: 0 },
  // Supracoracoideus (below pectoralis)
  { name: 'supracoracoideus_L', group: SurfaceMuscleGroup.SHOULDER, startT: 0.2, endT: 0.35, angle: Math.PI * 0.55, angularExtent: 0.4, peakDisplacement: 0.04, activation: 0 },
  { name: 'supracoracoideus_R', group: SurfaceMuscleGroup.SHOULDER, startT: 0.2, endT: 0.35, angle: -Math.PI * 0.55, angularExtent: 0.4, peakDisplacement: 0.04, activation: 0 },
  // Back muscles
  { name: 'latissimus_L', group: SurfaceMuscleGroup.BACK, startT: 0.18, endT: 0.38, angle: Math.PI * 0.25, angularExtent: 0.35, peakDisplacement: 0.03, activation: 0 },
  { name: 'latissimus_R', group: SurfaceMuscleGroup.BACK, startT: 0.18, endT: 0.38, angle: -Math.PI * 0.25, angularExtent: 0.35, peakDisplacement: 0.03, activation: 0 },
  // Abdomen
  { name: 'abdomen_L', group: SurfaceMuscleGroup.ABDOMEN, startT: 0.35, endT: 0.55, angle: Math.PI * 0.55, angularExtent: 0.3, peakDisplacement: 0.025, activation: 0 },
  { name: 'abdomen_R', group: SurfaceMuscleGroup.ABDOMEN, startT: 0.35, endT: 0.55, angle: -Math.PI * 0.55, angularExtent: 0.3, peakDisplacement: 0.025, activation: 0 },
  // Hip/thigh
  { name: 'thigh_L', group: SurfaceMuscleGroup.HIP, startT: 0.55, endT: 0.7, angle: Math.PI * 0.45, angularExtent: 0.35, peakDisplacement: 0.04, activation: 0 },
  { name: 'thigh_R', group: SurfaceMuscleGroup.HIP, startT: 0.55, endT: 0.7, angle: -Math.PI * 0.45, angularExtent: 0.35, peakDisplacement: 0.04, activation: 0 },
  // Limb
  { name: 'leg_L', group: SurfaceMuscleGroup.LIMB, startT: 0.58, endT: 0.68, angle: Math.PI * 0.55, angularExtent: 0.25, peakDisplacement: 0.03, activation: 0 },
  { name: 'leg_R', group: SurfaceMuscleGroup.LIMB, startT: 0.58, endT: 0.68, angle: -Math.PI * 0.55, angularExtent: 0.25, peakDisplacement: 0.03, activation: 0 },
];

/**
 * Head muscle definitions for a quadruped.
 */
const QUADRUPED_HEAD_MUSCLES: SurfaceMuscleDef[] = [
  { name: 'temporalis_L', group: SurfaceMuscleGroup.SHOULDER, startT: 0.4, endT: 0.6, angle: Math.PI * 0.4, angularExtent: 0.4, peakDisplacement: 0.03, activation: 0 },
  { name: 'temporalis_R', group: SurfaceMuscleGroup.SHOULDER, startT: 0.4, endT: 0.6, angle: -Math.PI * 0.4, angularExtent: 0.4, peakDisplacement: 0.03, activation: 0 },
  { name: 'masseter_L', group: SurfaceMuscleGroup.SHOULDER, startT: 0.25, endT: 0.4, angle: Math.PI * 0.55, angularExtent: 0.3, peakDisplacement: 0.025, activation: 0 },
  { name: 'masseter_R', group: SurfaceMuscleGroup.SHOULDER, startT: 0.25, endT: 0.4, angle: -Math.PI * 0.55, angularExtent: 0.3, peakDisplacement: 0.025, activation: 0 },
];

/**
 * Factory function: Create a DualTubeBody from a preset.
 *
 * Generates a fully configured DualTubeBody with appropriate muscle
 * layers for the given creature type.
 *
 * @param preset - The body preset type
 * @param configOverrides - Optional config overrides
 * @returns Configured DualTubeBody with muscle layers
 */
export function createMuscleBodyFromPreset(
  preset: MuscleBodyPreset,
  configOverrides: Partial<MuscleBodyConfig> = {},
): DualTubeBody {
  let config: Partial<MuscleBodyConfig>;
  let bodyMuscles: SurfaceMuscleDef[];
  let headMuscles: SurfaceMuscleDef[];

  switch (preset) {
    case MuscleBodyPreset.QUADRUPED:
      config = {
        bodyLength: 2.0,
        bodyRadius: 0.35,
        headLength: 0.6,
        headRadius: 0.25,
        neckLength: 0.3,
        neckRadius: 0.12,
        muscleDepth: 1.0,
        segmentCount: 32,
        radialSegments: 24,
        ...configOverrides,
      };
      bodyMuscles = QUADRUPED_BODY_MUSCLES;
      headMuscles = QUADRUPED_HEAD_MUSCLES;
      break;

    case MuscleBodyPreset.BIPED:
      config = {
        bodyLength: 1.6,
        bodyRadius: 0.3,
        headLength: 0.5,
        headRadius: 0.22,
        neckLength: 0.25,
        neckRadius: 0.1,
        muscleDepth: 1.0,
        segmentCount: 32,
        radialSegments: 24,
        ...configOverrides,
      };
      bodyMuscles = BIPED_BODY_MUSCLES;
      headMuscles = QUADRUPED_HEAD_MUSCLES; // Reuse head muscles
      break;

    case MuscleBodyPreset.SERPENTINE:
      config = {
        bodyLength: 3.0,
        bodyRadius: 0.15,
        headLength: 0.25,
        headRadius: 0.18,
        neckLength: 0.05,
        neckRadius: 0.12,
        muscleDepth: 0.6,
        segmentCount: 48,
        radialSegments: 20,
        ...configOverrides,
      };
      bodyMuscles = SERPENTINE_BODY_MUSCLES;
      headMuscles = []; // Minimal head muscles for snakes
      break;

    case MuscleBodyPreset.AVIAN:
      config = {
        bodyLength: 1.2,
        bodyRadius: 0.25,
        headLength: 0.35,
        headRadius: 0.15,
        neckLength: 0.2,
        neckRadius: 0.06,
        muscleDepth: 0.8,
        segmentCount: 28,
        radialSegments: 20,
        ...configOverrides,
      };
      bodyMuscles = AVIAN_BODY_MUSCLES;
      headMuscles = []; // Birds have minimal head muscles
      break;

    default:
      config = {
        bodyLength: 2.0,
        bodyRadius: 0.35,
        headLength: 0.6,
        headRadius: 0.25,
        neckLength: 0.3,
        neckRadius: 0.12,
        muscleDepth: 1.0,
        segmentCount: 32,
        radialSegments: 24,
        ...configOverrides,
      };
      bodyMuscles = QUADRUPED_BODY_MUSCLES;
      headMuscles = QUADRUPED_HEAD_MUSCLES;
  }

  const body = new DualTubeBody(config);

  // Add body muscle layers (can add multiple layers for depth)
  if (bodyMuscles.length > 0) {
    body.addMuscleLayer(bodyMuscles, 'body');
  }

  // Add head muscle layers
  if (headMuscles.length > 0) {
    body.addMuscleLayer(headMuscles, 'head');
  }

  return body;
}

/**
 * Get the default MuscleBodyConfig for a preset.
 *
 * @param preset - The body preset type
 * @returns Default configuration for the preset
 */
export function getDefaultConfigForPreset(preset: MuscleBodyPreset): MuscleBodyConfig {
  switch (preset) {
    case MuscleBodyPreset.QUADRUPED:
      return {
        bodyLength: 2.0, bodyRadius: 0.35,
        headLength: 0.6, headRadius: 0.25,
        neckLength: 0.3, neckRadius: 0.12,
        muscleDepth: 1.0, muscleResolution: 1.0,
        segmentCount: 32, radialSegments: 24,
      };
    case MuscleBodyPreset.BIPED:
      return {
        bodyLength: 1.6, bodyRadius: 0.3,
        headLength: 0.5, headRadius: 0.22,
        neckLength: 0.25, neckRadius: 0.1,
        muscleDepth: 1.0, muscleResolution: 1.0,
        segmentCount: 32, radialSegments: 24,
      };
    case MuscleBodyPreset.SERPENTINE:
      return {
        bodyLength: 3.0, bodyRadius: 0.15,
        headLength: 0.25, headRadius: 0.18,
        neckLength: 0.05, neckRadius: 0.12,
        muscleDepth: 0.6, muscleResolution: 1.0,
        segmentCount: 48, radialSegments: 20,
      };
    case MuscleBodyPreset.AVIAN:
      return {
        bodyLength: 1.2, bodyRadius: 0.25,
        headLength: 0.35, headRadius: 0.15,
        neckLength: 0.2, neckRadius: 0.06,
        muscleDepth: 0.8, muscleResolution: 1.0,
        segmentCount: 28, radialSegments: 20,
      };
  }
}
