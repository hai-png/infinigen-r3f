import { SeededRandom } from '@/core/util/MathUtils';
/**
 * MammalGenerator - Procedural mammal generation
 * Generates various mammals with fur, body proportions, and limb structures
 * Now includes 4 legs with upper/lower segments and paws
 * Now supports shell-texture fur rendering for realistic fur appearance
 */

import { Object3D, Group, Mesh, Material, MeshStandardMaterial, Color, Vector3 } from 'three';
import { CreatureBase, CreatureParams, CreatureType } from './CreatureBase';
import {
  ShellTextureFurRenderer,
  createFurConfig,
  ShellTextureFurConfig,
} from '../../materials/categories/Fur/ShellTextureFur';
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

    // Body
    const body = this.generateBody(parameters);
    const bodyFur = this.applyFurToMesh(body, parameters);
    mammal.add(bodyFur);

    // Head
    const head = this.generateHeadMesh(parameters);
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
    mammal.add(leftEye);
    const rightEye = new Mesh(eyeGeo, eyeMat);
    rightEye.position.set(s * 0.08, s * 0.32, s * 0.6);
    mammal.add(rightEye);

    // Nose
    const noseMat = new MeshStandardMaterial({ color: 0x111111, roughness: 0.5 });
    const nose = new Mesh(this.createSphereGeometry(s * 0.025), noseMat);
    nose.position.set(0, s * 0.22, s * 0.62);
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
    return this.generateBody(this.getDefaultConfig());
  }

  generateHead(): Object3D {
    return this.generateHeadMesh(this.getDefaultConfig());
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
      hairDirection: new Vector3(0, 1, 0),
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

  private generateBody(params: MammalParameters): Mesh {
    const s = params.size;
    const bodyGeometry = this.createEllipsoidGeometry(s * 0.3, s * 0.25, s * 0.4);
    const bodyMaterial = this.createFurMaterial(params.primaryColor, params.furLength, params.furPattern);
    const mesh = new Mesh(bodyGeometry, bodyMaterial);
    mesh.name = 'body';
    return mesh;
  }

  private generateHeadMesh(params: MammalParameters): Group {
    const s = params.size;
    // Snout - elongated ellipsoid attached to head
    const headGroup = new Group();
    headGroup.name = 'headGroup';

    const headGeo = this.createSphereGeometry(s * 0.15);
    const headMat = this.createFurMaterial(params.primaryColor, params.furLength * 0.8, params.furPattern);
    const headMesh = new Mesh(headGeo, headMat);
    headGroup.add(headMesh);

    // Snout
    const snoutGeo = this.createEllipsoidGeometry(s * 0.06, s * 0.06, s * 0.12);
    const snout = new Mesh(snoutGeo, headMat);
    snout.position.set(0, -s * 0.04, s * 0.14);
    headGroup.add(snout);

    return headGroup;
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
    } catch {
      // Fallback: roughness-only material (previous behavior)
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
