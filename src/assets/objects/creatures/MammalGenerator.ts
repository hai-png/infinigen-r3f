import { SeededRandom } from '@/core/util/MathUtils';
/**
 * MammalGenerator - Procedural mammal generation
 * Generates various mammals with fur, body proportions, and limb structures
 * Now includes 4 legs with upper/lower segments and paws
 * Now supports shell-texture fur rendering for realistic fur appearance
 *
 * Geometry improvements:
 * - Body uses LatheGeometry with species-specific profiles (like FruitGenerator)
 *   instead of sphere/ellipsoid, producing smooth anatomically correct silhouettes
 * - Head uses LatheGeometry with species-specific head profiles
 * - Subdivision smoothing applied at body-head junction for smooth transitions
 */

import { Object3D, Group, Mesh, Material, MeshStandardMaterial, Color, Vector2, Vector3, LatheGeometry, Shape, ShapeGeometry } from 'three';
import { CreatureBase, CreatureParams, CreatureType } from './CreatureBase';
import {
  ShellTextureFurRenderer,
  createFurConfig,
  ShellTextureFurConfig,
} from '../../materials/categories/Fur/ShellTextureFur';
import { smoothCreatureJunction } from '../../../core/util/GeometryUtils';
import type { PatternType } from './skin/CreatureSkinSystem';

/** Configuration for shell-texture fur on mammals */
export interface FurConfig {
  /** Number of shell layers (default 16) */
  shellCount?: number;
  /** Fur length in world units (overrides MammalParameters.furLength if set) */
  furLength?: number;
  /** Hair density 0-1 (default 0.8) */
  furDensity?: number;
  /** Fur color (overrides MammalParameters.primaryColor if set) */
  furColor?: string;
}

export interface MammalParameters extends CreatureParams {
  furLength: number;
  furPattern: 'solid' | 'striped' | 'spotted' | 'gradient';
  earShape: 'rounded' | 'pointed' | 'floppy' | 'tufted';
  tailType: 'bushy' | 'thin' | 'prehensile' | 'none';
  legType: 'digitigrade' | 'plantigrade' | 'unguligrade';
  primaryColor: string;
  secondaryColor: string;
  /** When provided, enables shell-texture fur rendering */
  furConfig?: FurConfig;
}

export type MammalSpecies = 'dog' | 'cat' | 'deer' | 'bear' | 'rabbit' | 'fox' | 'elephant' | 'giraffe';

export class MammalGenerator extends CreatureBase {
  private _rng = new SeededRandom(42);
  private _seed: number = 0;
  private _furRenderers: ShellTextureFurRenderer[] = [];

  constructor(seed?: number) {
    super({ seed: seed || 42 });
    this._seed = this.params.seed;
  }

  getDefaultConfig(): MammalParameters {
    return {
      ...this.params,
      creatureType: CreatureType.MAMMAL,
      furLength: 0.05,
      furPattern: 'solid',
      earShape: 'rounded',
      tailType: 'bushy',
      legType: 'digitigrade',
      primaryColor: '#8B4513',
      secondaryColor: '#D2691E',
    } as MammalParameters;
  }

  generate(species: MammalSpecies = 'dog', params: Partial<MammalParameters> = {}): Group {
    // Clean up previous fur renderers
    this.disposeFurRenderers();

    const parameters = this.mergeParameters(this.getDefaultConfig(), params);
    this.applySpeciesDefaults(species, parameters);

    const s = parameters.size;
    const mammal = new Group();
    mammal.name = `Mammal_${species}`;
    mammal.userData.parameters = parameters;

    // Body - LatheGeometry with species-specific profile
    const body = this.generateBody(parameters, species);
    const bodyFur = this.applyFurToMesh(body, parameters);
    mammal.add(bodyFur);

    // Head - LatheGeometry with species-specific head profile
    const head = this.generateHeadMesh(parameters, species);
    head.position.set(0, s * 0.25, s * 0.45);
    head.name = 'head';
    // Apply fur to head meshes inside the head group
    this.applyFurToGroup(head, parameters);
    mammal.add(head);

    // Eyes
    const eyeMat = new MeshStandardMaterial({ color: 0x222222, roughness: 0.3 });
    const eyeGeo = this.createSphereGeometry(s * 0.03);
    const leftEye = new Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-s * 0.08, s * 0.32, s * 0.6);
    leftEye.name = 'leftEye';
    mammal.add(leftEye);
    const rightEye = new Mesh(eyeGeo, eyeMat);
    rightEye.position.set(s * 0.08, s * 0.32, s * 0.6);
    rightEye.name = 'rightEye';
    mammal.add(rightEye);

    // Nose
    const noseMat = new MeshStandardMaterial({ color: 0x111111, roughness: 0.5 });
    const nose = new Mesh(this.createSphereGeometry(s * 0.025), noseMat);
    nose.position.set(0, s * 0.22, s * 0.62);
    nose.name = 'nose';
    mammal.add(nose);

    // 4 Legs with upper/lower segments + paws
    const legs = this.generateLegs(parameters);
    legs.forEach(leg => mammal.add(leg));

    // Tail
    if (parameters.tailType !== 'none') {
      const tail = this.generateTail(parameters);
      tail.position.set(0, s * 0.15, -s * 0.45);
      mammal.add(tail);
    }

    // Ears
    const ears = this.generateEars(parameters);
    ears.forEach(ear => mammal.add(ear));

    // Store fur renderers reference in userData for animation updates
    mammal.userData.furRenderers = this._furRenderers;

    return mammal;
  }

  generateBodyCore(): Object3D {
    return this.generateBody(this.getDefaultConfig(), 'dog');
  }

  generateHead(): Object3D {
    const params = this.getDefaultConfig();
    const s = params.size;
    const headGroup = this.generateHeadMesh(params, 'dog');

    // Eyes (needed for complete head via abstract method chain)
    const eyeMat = new MeshStandardMaterial({ color: 0x222222, roughness: 0.3 });
    const eyeGeo = this.createSphereGeometry(s * 0.03);
    const leftEye = new Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-s * 0.08, s * 0.32, s * 0.6);
    leftEye.name = 'leftEye';
    headGroup.add(leftEye);
    const rightEye = new Mesh(eyeGeo, eyeMat);
    rightEye.position.set(s * 0.08, s * 0.32, s * 0.6);
    rightEye.name = 'rightEye';
    headGroup.add(rightEye);

    // Nose
    const noseMat = new MeshStandardMaterial({ color: 0x111111, roughness: 0.5 });
    const nose = new Mesh(this.createSphereGeometry(s * 0.025), noseMat);
    nose.position.set(0, s * 0.22, s * 0.62);
    nose.name = 'nose';
    headGroup.add(nose);

    return headGroup;
  }

  generateLimbs(): Object3D[] {
    return this.generateLegs(this.getDefaultConfig());
  }

  generateAppendages(): Object3D[] {
    const params = this.getDefaultConfig();
    const appendages: Object3D[] = [];
    // Ears
    appendages.push(...this.generateEars(params));
    // Tail
    if (params.tailType !== 'none') {
      const tail = this.generateTail(params);
      tail.position.set(0, params.size * 0.15, -params.size * 0.45);
      appendages.push(tail);
    }
    return appendages;
  }

  applySkin(materials: Material[]): Material[] {
    return materials;
  }

  /**
   * Update all fur renderers (call each frame for wind animation).
   * @param dt - Delta time in seconds
   */
  updateFur(dt: number): void {
    for (const renderer of this._furRenderers) {
      renderer.update(dt);
    }
  }

  /**
   * Set wind parameters on all fur renderers.
   */
  setFurWind(amplitude: number, frequency: number): void {
    for (const renderer of this._furRenderers) {
      renderer.setWind(amplitude, frequency);
    }
  }

  /**
   * Clean up all fur renderer resources.
   */
  disposeFurRenderers(): void {
    for (const renderer of this._furRenderers) {
      renderer.dispose();
    }
    this._furRenderers = [];
  }

  // ── Shell-Texture Fur Integration ──────────────────────────────

  /**
   * Apply shell-texture fur to a mesh if furConfig is enabled.
   * Returns either the fur group (with shells) or the original mesh.
   */
  private applyFurToMesh(mesh: Mesh, params: MammalParameters): Object3D {
    if (!params.furConfig) {
      // No shell fur configured — use the original MeshStandardMaterial approach
      return mesh;
    }

    const furConfig = this.buildShellFurConfig(params, mesh.name);
    const renderer = new ShellTextureFurRenderer(furConfig);
    const furGroup = renderer.generate(mesh);
    this._furRenderers.push(renderer);

    // Preserve the mesh's transform on the group
    furGroup.position.copy(mesh.position);
    furGroup.rotation.copy(mesh.rotation);
    furGroup.scale.copy(mesh.scale);
    // Reset mesh local transform since group now owns it
    mesh.position.set(0, 0, 0);
    mesh.rotation.set(0, 0, 0);
    mesh.scale.set(1, 1, 1);

    furGroup.name = `${mesh.name}_fur`;
    return furGroup;
  }

  /**
   * Apply shell-texture fur to all Mesh children in a Group.
   */
  private applyFurToGroup(group: Group, params: MammalParameters): void {
    if (!params.furConfig) return;

    const meshesToReplace: { mesh: Mesh; parent: Object3D; index: number }[] = [];

    group.children.forEach((child, index) => {
      if (child instanceof Mesh) {
        meshesToReplace.push({ mesh: child, parent: group, index });
      }
    });

    for (const entry of meshesToReplace) {
      const { mesh, parent } = entry;

      // Store mesh's local transform
      const savedPos = mesh.position.clone();
      const savedRot = mesh.rotation.clone();
      const savedScale = mesh.scale.clone();

      const furConfig = this.buildShellFurConfig(params, mesh.name);
      const renderer = new ShellTextureFurRenderer(furConfig);
      const furGroup = renderer.generate(mesh);
      this._furRenderers.push(renderer);

      // Apply the original mesh's transform to the fur group
      furGroup.position.copy(savedPos);
      furGroup.rotation.copy(savedRot);
      furGroup.scale.copy(savedScale);

      furGroup.name = `${mesh.name}_fur`;

      // Replace mesh with fur group in the parent
      parent.remove(mesh);
      parent.add(furGroup);
    }
  }

  /**
   * Build a ShellTextureFurConfig from MammalParameters and the furConfig overrides.
   */
  private buildShellFurConfig(params: MammalParameters, partName: string): ShellTextureFurConfig {
    const fc = params.furConfig!;
    const primaryColor = new Color(params.primaryColor);
    const secondaryColor = new Color(params.secondaryColor);

    // Compute a deterministic seed from the part name
    let partSeed = 0;
    for (let i = 0; i < partName.length; i++) {
      partSeed = ((partSeed << 5) - partSeed + partName.charCodeAt(i)) | 0;
    }
    partSeed = Math.abs(partSeed) + this._seed;

    return createFurConfig({
      shellCount: fc.shellCount,
      furLength: fc.furLength ?? params.furLength,
      furDensity: fc.furDensity,
      furColor: fc.furColor ?? params.primaryColor,
      // Tip color: slightly lighter version of primary
      tipColor: primaryColor.clone().lerp(new Color(0xffffff), 0.2),
      // Undercoat: slightly darker, towards secondary color
      undercoatColor: primaryColor.clone().lerp(secondaryColor, 0.3),
      hairDirection: new Vector3(0, 1, 0).normalize(),
      seed: partSeed,
    });
  }

  private applySpeciesDefaults(species: MammalSpecies, params: MammalParameters): void {
    switch (species) {
      case 'dog':
        params.size = 0.6; params.furLength = 0.03; params.furPattern = 'solid';
        params.earShape = 'floppy'; params.tailType = 'bushy'; params.legType = 'digitigrade';
        params.primaryColor = '#8B4513'; break;
      case 'cat':
        params.size = 0.4; params.furLength = 0.02; params.furPattern = 'striped';
        params.earShape = 'pointed'; params.tailType = 'thin'; params.legType = 'digitigrade';
        params.primaryColor = '#696969'; break;
      case 'deer':
        params.size = 1.2; params.furLength = 0.02; params.furPattern = 'spotted';
        params.earShape = 'pointed'; params.tailType = 'thin'; params.legType = 'unguligrade';
        params.primaryColor = '#CD853F'; break;
      case 'bear':
        params.size = 1.8; params.furLength = 0.08; params.furPattern = 'solid';
        params.earShape = 'rounded'; params.tailType = 'none'; params.legType = 'plantigrade';
        params.primaryColor = '#2F1B0C'; break;
      case 'rabbit':
        params.size = 0.3; params.furLength = 0.03; params.furPattern = 'solid';
        params.earShape = 'tufted'; params.tailType = 'bushy'; params.legType = 'digitigrade';
        params.primaryColor = '#FFFFFF'; break;
      case 'fox':
        params.size = 0.5; params.furLength = 0.04; params.furPattern = 'gradient';
        params.earShape = 'pointed'; params.tailType = 'bushy'; params.legType = 'digitigrade';
        params.primaryColor = '#FF4500'; break;
      case 'elephant':
        params.size = 3.0; params.furLength = 0.001; params.furPattern = 'solid';
        params.earShape = 'floppy'; params.tailType = 'thin'; params.legType = 'unguligrade';
        params.primaryColor = '#808080'; break;
      case 'giraffe':
        params.size = 4.0; params.furLength = 0.01; params.furPattern = 'spotted';
        params.earShape = 'rounded'; params.tailType = 'thin'; params.legType = 'unguligrade';
        params.primaryColor = '#FFD700'; params.secondaryColor = '#8B4513'; break;
    }
  }

  /**
   * Generate mammal body using LatheGeometry with species-specific profiles.
   *
   * Instead of a simple scaled sphere (ellipsoid), this uses a 2D profile
   * revolved around the Y axis — exactly like how FruitGenerator creates
   * smooth fruit shapes. The profile varies by species:
   *   - Fox: elongated, slender
   *   - Rabbit: compact, round
   *   - Bear: broad, heavy
   *   - Deer: slender with deep chest
   *   - Elephant: massive, columnar
   *   - Giraffe: very elongated with long neck base
   */
  private generateBody(params: MammalParameters, species: MammalSpecies): Mesh {
    const s = params.size;
    const bodyWidth = s * 0.3;  // Maximum half-width (radius)
    const bodyHeight = s * 0.25; // Maximum half-height
    const bodyLength = s * 0.8;  // Total body length

    // Species-specific profile control points
    // Each entry: [t along body, radius factor] where t goes from tail (0) to head (1)
    const profileData = this.getBodyProfile(species);

    const segments = 24;
    const points: Vector2[] = [];

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      let r = 0;
      for (let c = 0; c < profileData.length - 1; c++) {
        const [t0, r0] = profileData[c];
        const [t1, r1] = profileData[c + 1];
        if (t >= t0 && t <= t1) {
          const localT = (t - t0) / (t1 - t0);
          const st = localT * localT * (3 - 2 * localT); // Smoothstep
          r = r0 + (r1 - r0) * st;
          break;
        }
      }
      points.push(new Vector2(
        Math.max(0.001, r * bodyWidth),
        t * bodyLength - bodyLength * 0.5,
      ));
    }

    const bodyGeometry = new LatheGeometry(points, 16);

    // Scale to make elliptical cross-section (mammals are wider side-to-side
    // than top-to-bottom at the belly, but the back is often taller)
    bodyGeometry.scale(1, bodyHeight / bodyWidth, 1);

    // Apply subdivision smoothing for smooth body silhouette
    const smoothedGeo = smoothCreatureJunction(bodyGeometry, 1);

    const bodyMaterial = this.createFurMaterial(params.primaryColor, params.furLength, params.furPattern);
    const mesh = new Mesh(smoothedGeo, bodyMaterial);
    mesh.name = 'body';

    // Rotate so body is horizontal (LatheGeometry produces vertical shapes)
    mesh.rotation.x = Math.PI / 2;

    return mesh;
  }

  /**
   * Get species-specific body profile control points for LatheGeometry.
   * Returns [t, radiusFactor] pairs where t goes from tail to head.
   */
  private getBodyProfile(species: MammalSpecies): [number, number][] {
    switch (species) {
      case 'fox':
        // Elongated, slender body with deep chest
        return [
          [0.0,  0.10], // Tail base — narrow
          [0.08, 0.30], // Hindquarters start
          [0.20, 0.65], // Lower back
          [0.35, 0.80], // Mid body — slender
          [0.50, 0.90], // Ribcage
          [0.65, 1.00], // Deep chest (widest)
          [0.80, 0.70], // Shoulder
          [0.92, 0.35], // Neck base
          [1.0,  0.15], // Neck
        ];
      case 'rabbit':
        // Compact, round body
        return [
          [0.0,  0.15], // Tail tuft area
          [0.08, 0.45], // Hindquarters
          [0.20, 0.80], // Round rear
          [0.35, 0.95], // Belly
          [0.50, 1.00], // Roundest point
          [0.65, 0.90], // Chest
          [0.80, 0.60], // Shoulder
          [0.92, 0.30], // Neck base
          [1.0,  0.12], // Neck
        ];
      case 'bear':
        // Broad, heavy body with massive shoulders
        return [
          [0.0,  0.15], // Rear
          [0.10, 0.55], // Hindquarters — wide
          [0.25, 0.85], // Lower back
          [0.40, 0.95], // Belly
          [0.55, 1.00], // Widest
          [0.70, 0.95], // Massive shoulders
          [0.85, 0.65], // Shoulder/neck
          [0.95, 0.35], // Neck
          [1.0,  0.20], // Neck base
        ];
      case 'deer':
        // Slender with deep chest
        return [
          [0.0,  0.08], // Tail base
          [0.08, 0.30], // Hindquarters
          [0.20, 0.55], // Slim waist
          [0.35, 0.70], // Ribcage
          [0.50, 0.85], // Deep chest
          [0.65, 1.00], // Chest peak
          [0.80, 0.60], // Shoulder
          [0.92, 0.25], // Neck
          [1.0,  0.10], // Long neck
        ];
      case 'elephant':
        // Massive, columnar body
        return [
          [0.0,  0.25], // Rear — wide
          [0.10, 0.65], // Hindquarters
          [0.25, 0.90], // Massive belly
          [0.40, 1.00], // Barrel body
          [0.55, 0.95], // Continuing barrel
          [0.70, 0.85], // Shoulder
          [0.85, 0.55], // Neck
          [0.95, 0.30], // Neck
          [1.0,  0.20], // Head attachment
        ];
      case 'giraffe':
        // Very elongated with sloping back
        return [
          [0.0,  0.08], // Tail
          [0.08, 0.30], // Hindquarters
          [0.20, 0.55], // Sloping back
          [0.35, 0.65], // Body
          [0.50, 0.70], // Ribcage
          [0.65, 0.80], // Chest
          [0.80, 0.50], // Shoulder
          [0.92, 0.20], // Long neck base
          [1.0,  0.08], // Neck
        ];
      case 'cat':
        // Slender, flexible body
        return [
          [0.0,  0.08], // Tail base
          [0.08, 0.35], // Hindquarters
          [0.20, 0.70], // Lower back
          [0.35, 0.90], // Ribcage
          [0.50, 1.00], // Chest
          [0.65, 0.85], // Shoulder
          [0.80, 0.55], // Neck base
          [0.92, 0.25], // Neck
          [1.0,  0.10], // Head
        ];
      case 'dog':
      default:
        // Default dog-like body
        return [
          [0.0,  0.10], // Tail base
          [0.08, 0.35], // Hindquarters
          [0.20, 0.65], // Lower back
          [0.35, 0.85], // Ribcage
          [0.50, 1.00], // Chest (widest)
          [0.65, 0.85], // Shoulder
          [0.80, 0.55], // Neck base
          [0.92, 0.25], // Neck
          [1.0,  0.12], // Head attachment
        ];
    }
  }

  /**
   * Generate head using LatheGeometry with species-specific head profiles.
   *
   * The head profile varies by species:
   *   - Fox: long snout, pointed
   *   - Rabbit: round with short nose
   *   - Bear: broad, rounded
   *   - Elephant: wide with trunk base
   *   - Giraffe: elongated with long face
   */
  private generateHeadMesh(params: MammalParameters, species: MammalSpecies): Group {
    const s = params.size;
    const headGroup = new Group();
    headGroup.name = 'headGroup';

    // Species-specific head using LatheGeometry
    const headWidth = s * 0.15;
    const headLength = s * 0.25;
    const headProfile = this.getHeadProfile(species);

    const segments = 20;
    const points: Vector2[] = [];

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      let r = 0;
      for (let c = 0; c < headProfile.length - 1; c++) {
        const [t0, r0] = headProfile[c];
        const [t1, r1] = headProfile[c + 1];
        if (t >= t0 && t <= t1) {
          const localT = (t - t0) / (t1 - t0);
          const st = localT * localT * (3 - 2 * localT);
          r = r0 + (r1 - r0) * st;
          break;
        }
      }
      points.push(new Vector2(
        Math.max(0.001, r * headWidth),
        t * headLength - headLength * 0.3,
      ));
    }

    const headGeo = new LatheGeometry(points, 14);
    // Apply subdivision for smooth head
    const smoothedGeo = smoothCreatureJunction(headGeo, 1);

    const headMat = this.createFurMaterial(params.primaryColor, params.furLength * 0.8, params.furPattern);
    const headMesh = new Mesh(smoothedGeo, headMat);
    headMesh.name = 'head';
    // Rotate to be horizontal
    headMesh.rotation.x = Math.PI / 2;
    headGroup.add(headMesh);

    // Snout — species-specific using ExtrudeGeometry from a 2D profile
    const snoutProfile = this.getSnoutProfile(species);
    const snoutShape = new Shape();
    snoutShape.moveTo(0, 0);
    for (let i = 1; i < snoutProfile.length; i++) {
      snoutShape.lineTo(snoutProfile[i][0] * s, snoutProfile[i][1] * s);
    }
    snoutShape.lineTo(0, 0);

    const snoutGeo = new ShapeGeometry(snoutShape, 6);
    const snout = new Mesh(snoutGeo, headMat);
    snout.position.set(0, -s * 0.04, s * 0.14);
    snout.rotation.x = -0.2;
    snout.name = 'snout';
    headGroup.add(snout);

    return headGroup;
  }

  /**
   * Get species-specific head profile control points for LatheGeometry.
   * Returns [t, radiusFactor] pairs where t goes from back of head to snout.
   */
  private getHeadProfile(species: MammalSpecies): [number, number][] {
    switch (species) {
      case 'fox':
        return [
          [0.0,  0.30], // Back of head
          [0.15, 0.80], // Braincase
          [0.30, 1.00], // Widest
          [0.50, 0.75], // Cheekbones
          [0.70, 0.50], // Muzzle taper
          [0.85, 0.25], // Snout
          [1.0,  0.08], // Nose
        ];
      case 'rabbit':
        return [
          [0.0,  0.35], // Back of head
          [0.15, 0.85], // Braincase
          [0.30, 1.00], // Round head
          [0.50, 0.85], // Cheeks
          [0.70, 0.55], // Short muzzle
          [0.90, 0.25], // Nose
          [1.0,  0.12], // Nose tip
        ];
      case 'bear':
        return [
          [0.0,  0.40], // Back of head
          [0.15, 0.85], // Braincase
          [0.30, 1.00], // Wide head
          [0.50, 0.90], // Cheeks — heavy
          [0.70, 0.65], // Muzzle
          [0.85, 0.45], // Snout
          [1.0,  0.20], // Nose
        ];
      case 'elephant':
        return [
          [0.0,  0.35], // Back of head
          [0.15, 0.80], // Braincase — large
          [0.30, 1.00], // Wide head
          [0.50, 0.90], // Forehead
          [0.65, 0.70], // Face
          [0.80, 0.50], // Trunk base
          [0.95, 0.35], // Trunk
          [1.0,  0.20], // Trunk tip
        ];
      case 'giraffe':
        return [
          [0.0,  0.20], // Back of head
          [0.15, 0.60], // Braincase
          [0.30, 0.80], // Head
          [0.50, 0.65], // Long face
          [0.70, 0.40], // Muzzle
          [0.85, 0.22], // Snout
          [1.0,  0.08], // Nose
        ];
      case 'deer':
        return [
          [0.0,  0.25], // Back of head
          [0.15, 0.75], // Braincase
          [0.30, 1.00], // Wide head
          [0.50, 0.70], // Face
          [0.70, 0.45], // Muzzle
          [0.85, 0.22], // Snout
          [1.0,  0.08], // Nose
        ];
      case 'cat':
        return [
          [0.0,  0.25], // Back of head
          [0.15, 0.80], // Braincase
          [0.30, 1.00], // Round head
          [0.50, 0.75], // Cheeks
          [0.70, 0.45], // Short muzzle
          [0.85, 0.20], // Nose
          [1.0,  0.06], // Nose tip
        ];
      case 'dog':
      default:
        return [
          [0.0,  0.25], // Back of head
          [0.15, 0.75], // Braincase
          [0.30, 1.00], // Widest
          [0.50, 0.70], // Cheekbones
          [0.70, 0.50], // Muzzle
          [0.85, 0.30], // Snout
          [1.0,  0.10], // Nose
        ];
    }
  }

  /**
   * Get snout profile as 2D points for ShapeGeometry.
   * Returns [x, y] pairs defining the snout outline from side view.
   */
  private getSnoutProfile(species: MammalSpecies): [number, number][] {
    const s = 1; // Will be scaled by params.size
    switch (species) {
      case 'fox':
        return [[0, 0], [0.02, 0.06], [0.06, 0.04], [0.10, 0.02], [0.12, 0], [0, -0.02], [0, 0]];
      case 'rabbit':
        return [[0, 0], [0.02, 0.04], [0.04, 0.05], [0.05, 0.03], [0.04, 0], [0, -0.02], [0, 0]];
      case 'bear':
        return [[0, 0], [0.03, 0.08], [0.07, 0.08], [0.10, 0.05], [0.10, 0], [0, -0.04], [0, 0]];
      case 'elephant':
        return [[0, 0], [0.02, 0.06], [0.04, 0.08], [0.06, 0.06], [0.08, 0.03], [0.06, 0], [0, -0.03], [0, 0]];
      case 'giraffe':
        return [[0, 0], [0.015, 0.05], [0.04, 0.04], [0.07, 0.03], [0.09, 0.01], [0.08, 0], [0, -0.02], [0, 0]];
      case 'dog':
      default:
        return [[0, 0], [0.02, 0.05], [0.05, 0.05], [0.08, 0.03], [0.08, 0], [0, -0.03], [0, 0]];
    }
  }

  private generateLegs(params: MammalParameters): Group[] {
    const s = params.size;
    const legMat = this.createFurMaterial(params.primaryColor, params.furLength * 0.7, 'solid');
    const pawMat = new MeshStandardMaterial({ color: params.secondaryColor, roughness: 0.6 });
    const legs: Group[] = [];

    const legPositions = [
      { x: -s * 0.15, z: s * 0.2, name: 'frontLeft' },
      { x: s * 0.15, z: s * 0.2, name: 'frontRight' },
      { x: -s * 0.15, z: -s * 0.2, name: 'backLeft' },
      { x: s * 0.15, z: -s * 0.2, name: 'backRight' },
    ];

    const upperLen = s * 0.2;
    const lowerLen = s * 0.2;
    const legRadius = s * 0.04;
    const pawSize = s * 0.06;

    for (const pos of legPositions) {
      const legGroup = new Group();
      legGroup.name = pos.name;
      legGroup.position.set(pos.x, -s * 0.05, pos.z);

      // Upper leg
      const upperGeo = this.createCylinderGeometry(legRadius, legRadius * 0.9, upperLen);
      const upper = new Mesh(upperGeo, legMat);
      upper.position.y = -upperLen / 2;
      upper.name = 'upperLeg';
      legGroup.add(upper);

      // Lower leg
      const lowerGeo = this.createCylinderGeometry(legRadius * 0.9, legRadius * 0.7, lowerLen);
      const lower = new Mesh(lowerGeo, legMat);
      lower.position.y = -upperLen - lowerLen / 2;
      lower.name = 'lowerLeg';
      legGroup.add(lower);

      // Paw
      const pawGeo = this.createBoxGeometry(pawSize, pawSize * 0.4, pawSize * 0.8);
      const paw = new Mesh(pawGeo, pawMat);
      paw.position.y = -upperLen - lowerLen - pawSize * 0.2;
      paw.name = 'paw';
      legGroup.add(paw);

      legs.push(legGroup);
    }

    return legs;
  }

  private generateTail(params: MammalParameters): Group {
    const s = params.size;
    const tailGroup = new Group();
    tailGroup.name = 'tail';

    if (params.tailType === 'bushy') {
      // Tapered cylinder + fluffy tip
      const tailGeo = this.createCylinderGeometry(s * 0.04, s * 0.06, s * 0.3);
      const tailMat = this.createFurMaterial(params.primaryColor, params.furLength * 1.5, params.furPattern);
      const tail = new Mesh(tailGeo, tailMat);
      tail.rotation.x = Math.PI * 0.3;
      tailGroup.add(tail);
      // Fluffy tip
      const tipGeo = this.createSphereGeometry(s * 0.06);
      const tip = new Mesh(tipGeo, tailMat);
      tip.position.set(0, s * 0.12, -s * 0.08);
      tailGroup.add(tip);
    } else {
      // Thin tail
      const tailGeo = this.createCylinderGeometry(s * 0.02, s * 0.01, s * 0.4);
      const tailMat = new MeshStandardMaterial({ color: params.primaryColor });
      const tail = new Mesh(tailGeo, tailMat);
      tail.rotation.x = Math.PI * 0.35;
      tailGroup.add(tail);
    }

    return tailGroup;
  }

  private generateEars(params: MammalParameters): Group[] {
    const s = params.size;
    const earMat = this.createFurMaterial(params.secondaryColor, params.furLength * 0.5, 'solid');
    const innerMat = new MeshStandardMaterial({ color: 0xffcccc, roughness: 0.7 });
    const ears: Group[] = [];

    const earHeight = s * 0.12;
    const earWidth = s * 0.06;

    for (const side of [-1, 1]) {
      const earGroup = new Group();
      earGroup.name = side === -1 ? 'leftEar' : 'rightEar';

      const earGeo = this.createEarGeometry(earWidth, earHeight, earWidth * 0.4);
      const outer = new Mesh(earGeo, earMat);
      earGroup.add(outer);

      // Inner ear
      const innerGeo = this.createEarGeometry(earWidth * 0.6, earHeight * 0.7, earWidth * 0.2);
      const inner = new Mesh(innerGeo, innerMat);
      inner.position.z = earWidth * 0.1;
      inner.name = 'inner';
      earGroup.add(inner);

      earGroup.position.set(side * s * 0.1, s * 0.38, s * 0.38);
      if (params.earShape === 'floppy') {
        earGroup.rotation.z = side * 0.5;
      }
      ears.push(earGroup);
    }

    return ears;
  }

  /**
   * Create a fur material with procedural textures via CreatureSkinSystem.
   *
   * Fix (w1-6): Instead of only adjusting roughness, this now delegates to
   * CreatureSkinSystem which generates real fur pattern textures (stripes,
   * spots, etc.) and bump maps for visible fur strand detail.
   * Falls back to a simple roughness-only material if the skin system fails.
   */
  private createFurMaterial(color: string, length: number, pattern: string): MeshStandardMaterial {
    const skinPattern = this.mapFurPattern(pattern);
    const primaryColor = new Color(color);
    // Derive a slightly different secondary color for pattern contrast
    const secondaryColor = primaryColor.clone().offsetHSL(0, -0.05, -0.12);
    // Accent for rosettes / detail
    const accentColor = primaryColor.clone().offsetHSL(0.02, 0, -0.2);

    try {
      const skinConfig = this.skinSystem.createSkinConfig('quadruped', {
        skinType: 'fur',
        pattern: skinPattern,
        primaryColor,
        secondaryColor,
        accentColor,
        furLength: length,
        furDensity: Math.min(0.6 + length * 5, 0.95),
        roughness: Math.min(0.5 + length * 5, 1.0),
        bumpStrength: Math.min(0.3 + length * 3, 0.8),
        patternScale: 8,
        patternContrast: 0.5,
        textureResolution: 256,
      });

      return this.skinSystem.generateMaterial(skinConfig);
    } catch (err) {
      // Silently fall back - skin system failed, using roughness-only material
      if (process.env.NODE_ENV === 'development') console.debug('[MammalGenerator] skinSystem material fallback:', err);
      const roughness = Math.min(0.5 + length * 5, 1.0);
      const mat = new MeshStandardMaterial({
        color,
        roughness,
        metalness: 0.0,
      });
      if (pattern === 'striped') {
        mat.color.multiplyScalar(0.9);
      } else if (pattern === 'spotted') {
        mat.color.offsetHSL(0.02, 0, 0.05);
      }
      return mat;
    }
  }

  /**
   * Map MammalGenerator pattern names to CreatureSkinSystem PatternType values.
   */
  private mapFurPattern(pattern: string): PatternType {
    switch (pattern) {
      case 'striped': return 'stripes';
      case 'spotted': return 'spots';
      case 'gradient': return 'gradient';
      case 'solid':
      default: return 'solid';
    }
  }
}
