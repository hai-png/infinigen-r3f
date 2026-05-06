/**
 * CreatureBase - Abstract base class for all creature generators
 * Provides framework for procedural creature generation with anatomy, materials, animation hooks,
 * skeleton rigging, and behavior tree for autonomous AI.
 *
 * Phase 3.2: Now integrates BodyPlanSystem for template-based creature generation,
 * CreatureSkinSystem for procedural skinning, and LocomotionSystem for body-plan-specific gaits.
 */

import {
  Object3D, Group, Mesh, Material, SphereGeometry, BoxGeometry, CylinderGeometry,
  MeshStandardMaterial, ConeGeometry, CapsuleGeometry, TorusGeometry,
  BufferGeometry, Float32BufferAttribute, Vector3, Skeleton, Bone,
  SkinnedMesh, AnimationClip, AnimationMixer, Color,
} from 'three';
import { SeededRandom } from '@/core/util/MathUtils';
import { BaseObjectGenerator, BaseGeneratorConfig } from '../utils/BaseObjectGenerator';
import { SkeletonBuilder, CreatureSkeletonConfig } from './skeleton/SkeletonBuilder';
import { IdleAnimation, IdleBehavior } from './animation/IdleAnimation';
import { WalkCycle, GaitType, WalkCycleParams } from './animation/WalkCycle';
import { BehaviorTree, CreatureContext, BehaviorState, createDefaultContext } from './animation/BehaviorTree';
import { SkinnedMeshBuilder } from './skeleton/SkinnedMeshBuilder';
import { IKController, IKChain, IKEffector } from './animation/IKController';
import { BodyPlanSystem, BodyPlanType, ResolvedBodyPlan } from './BodyPlanSystem';
import { HeadGenerator, TorsoGenerator, LimbGenerator, TailGenerator } from './parts/PartGenerators';
import { CreatureSkinSystem, CreatureSkinConfig } from './skin/CreatureSkinSystem';
import { LocomotionSystem, LocomotionConfig, SpeedLevel } from './animation/LocomotionSystem';

export enum CreatureType {
  MAMMAL = 'mammal',
  BIRD = 'bird',
  REPTILE = 'reptile',
  AMPHIBIAN = 'amphibian',
  FISH = 'fish',
  INSECT = 'insect',
  INVERTEBRATE = 'invertebrate'
}

export interface CreatureParams extends BaseGeneratorConfig {
  seed: number;
  species: string;
  size: number;
  age: 'juvenile' | 'adult' | 'elder';
  gender: 'male' | 'female' | 'neutral';
  health: number;
  biome: string;
  creatureType?: CreatureType;
}

export type CreatureParameters = CreatureParams;

export abstract class CreatureBase extends BaseObjectGenerator<CreatureParams> {
  protected params: CreatureParams;
  protected rng: SeededRandom;

  // Skeleton and animation system
  protected skeletonBuilder: SkeletonBuilder;
  protected idleAnimation: IdleAnimation;
  protected walkCycle: WalkCycle;
  protected behaviorTree: BehaviorTree;

  // Skinning & IK
  protected skinnedMeshBuilder: SkinnedMeshBuilder;
  protected ikController: IKController | null = null;

  // Stored results
  protected skeleton: Skeleton | null = null;
  protected idleClip: AnimationClip | null = null;
  protected walkClip: AnimationClip | null = null;
  protected animationMixer: AnimationMixer | null = null;

  // Phase 3.2: Body plan and skin systems
  protected bodyPlanSystem: BodyPlanSystem;
  protected resolvedBodyPlan: ResolvedBodyPlan | null = null;
  protected skinSystem: CreatureSkinSystem;
  protected skinConfig: CreatureSkinConfig | null = null;
  protected headGenerator: HeadGenerator;
  protected torsoGenerator: TorsoGenerator;
  protected limbGenerator: LimbGenerator;
  protected tailGenerator: TailGenerator;

  constructor(params: Partial<CreatureParams> = {}) {
    super(0);
    this.params = {
      seed: params.seed ?? Math.floor(Date.now() * Math.random()) % 10000,
      species: 'unknown',
      size: 1.0,
      age: 'adult',
      gender: 'neutral',
      health: 1.0,
      biome: 'temperate',
      ...params
    };
    this.rng = new SeededRandom(this.params.seed);

    // Initialize subsystems
    this.skeletonBuilder = new SkeletonBuilder(this.params.seed);
    this.skinnedMeshBuilder = new SkinnedMeshBuilder();
    this.idleAnimation = new IdleAnimation(this.params.seed);
    this.walkCycle = new WalkCycle(this.params.seed);
    this.behaviorTree = new BehaviorTree(createDefaultContext());

    // Phase 3.2: Initialize new systems
    this.bodyPlanSystem = new BodyPlanSystem(this.params.seed);
    this.skinSystem = new CreatureSkinSystem(this.params.seed);
    this.headGenerator = new HeadGenerator(this.params.seed);
    this.torsoGenerator = new TorsoGenerator(this.params.seed);
    this.limbGenerator = new LimbGenerator(this.params.seed);
    this.tailGenerator = new TailGenerator(this.params.seed);
  }

  getDefaultConfig(): CreatureParams {
    return this.params;
  }

  /**
   * Resolve the body plan type from CreatureType
   */
  protected getBodyPlanType(): BodyPlanType {
    switch (this.params.creatureType) {
      case CreatureType.MAMMAL:     return 'quadruped';
      case CreatureType.BIRD:       return 'avian';
      case CreatureType.FISH:       return 'aquatic';
      case CreatureType.REPTILE:    return 'serpentine';
      case CreatureType.INSECT:     return 'insectoid';
      case CreatureType.AMPHIBIAN:  return 'quadruped';
      default:                      return 'quadruped';
    }
  }

  /**
   * Generate a creature using the abstract method chain (Template Method pattern).
   *
   * The chain is: generateBodyCore → generateHead → generateLimbs →
   * generateAppendages → applySkin. Each step delegates to subclass
   * implementations, ensuring that CreatureBase.generate() produces a
   * complete creature for every creature type — not just through
   * species-specific overloads.
   *
   * Subclasses may override generate() with species-specific signatures
   * (e.g. UnderwaterGenerator.generate('jellyfish')), but this base
   * implementation serves as the canonical template for assembling a
   * creature from its abstract parts.
   */
  generate(): Group {
    const group = new Group();
    group.name = `Creature_${this.params.species}`;

    const s = this.params.size;
    const bodyPlanType = this.getBodyPlanType();

    // 1. Resolve body plan (available to subclasses via this.resolvedBodyPlan)
    this.resolvedBodyPlan = this.bodyPlanSystem.createBodyPlan(bodyPlanType, s);

    // 2. Generate skin config (available to subclasses via this.skinConfig)
    this.skinConfig = this.skinSystem.createSkinConfig(bodyPlanType);

    // 3. Assemble creature through the abstract method chain
    const body = this.generateBodyCore();
    if (body) group.add(body);

    const head = this.generateHead();
    if (head) group.add(head);

    const limbs = this.generateLimbs();
    limbs.forEach(limb => { if (limb) group.add(limb); });

    const appendages = this.generateAppendages();
    appendages.forEach(appendage => { if (appendage) group.add(appendage); });

    // 4. Apply skin material to all meshes via applySkin + applySkinToGroup
    const baseMaterials = this.collectMaterials(group);
    const skinnedMaterials = this.applySkin(baseMaterials);
    this.applySkinnedMaterials(group, skinnedMaterials, baseMaterials);

    // Also apply the CreatureSkinSystem material for texture patterns
    this.applySkinToGroup(group, this.skinConfig);

    // Store metadata
    group.userData.bodyPlan = this.resolvedBodyPlan;
    group.userData.skinConfig = this.skinConfig;
    group.userData.creatureType = this.params.creatureType;

    return group;
  }

  /**
   * Collect all MeshStandardMaterial instances from a group's meshes.
   * Used to build the material array for applySkin().
   */
  private collectMaterials(group: Group): Material[] {
    const materials: Material[] = [];
    group.traverse((child) => {
      if (child instanceof Mesh && child.material instanceof MeshStandardMaterial) {
        materials.push(child.material);
      }
    });
    return materials;
  }

  /**
   * Apply skinned materials back to the meshes in the group,
   * matching by index with the original materials array.
   * Skips special parts (eyes, mouth, etc.) that should keep their own materials.
   */
  private applySkinnedMaterials(group: Group, skinned: Material[], original: Material[]): void {
    let matIndex = 0;
    group.traverse((child) => {
      if (child instanceof Mesh && child.material instanceof MeshStandardMaterial) {
        const name = child.name.toLowerCase();
        const isSpecialPart = name.includes('eye') || name.includes('pupil') ||
          name.includes('sclera') || name.includes('nostril') ||
          name.includes('fang') || name.includes('beak') ||
          name.includes('horn') || name.includes('mouth') ||
          name.includes('foot') || name.includes('inner');

        if (!isSpecialPart && matIndex < skinned.length) {
          child.material = skinned[matIndex] as MeshStandardMaterial;
        }
        matIndex++;
      }
    });
  }

  /**
   * Generate a fully rigged creature with skeleton, animations, and behavior.
   * Uses BodyPlanSystem for skeleton-driven mesh deformation.
   */
  generateRigged(config?: CreatureSkeletonConfig): Group {
    const group = this.generate();
    group.name = `${this.params.species}_rigged`;

    // Build and attach skeleton
    const skeleton = this.buildSkeleton(config);
    group.userData.skeleton = skeleton;
    group.userData.creatureType = this.getCreatureTypeString();

    // Build animations using LocomotionSystem
    const idleClip = this.buildIdleAnimation();
    const walkClip = this.buildWalkAnimationWithLocomotion();
    group.userData.animations = [idleClip, walkClip];

    // Set up behavior context
    this.behaviorTree.updateContext({
      health: this.params.health,
      position: { x: 0, y: 0, z: 0 },
      homePosition: { x: 0, y: 0, z: 0 },
    });
    group.userData.behaviorTree = this.behaviorTree;

    // Add skeleton bones to group
    const rootBone = skeleton.bones[0];
    group.add(rootBone);

    // Set up animation mixer
    this.setupAnimationMixer(group);
    group.userData.animationMixer = this.animationMixer;

    return group;
  }

  /**
   * Apply skin material to all meshes in a group
   */
  protected applySkinToGroup(group: Group, skinConfig: CreatureSkinConfig): void {
    const material = this.skinSystem.generateMaterial(skinConfig);

    group.traverse((child) => {
      if (child instanceof Mesh) {
        // Keep eye, pupil, nose, fang, and beak materials as-is
        const name = child.name.toLowerCase();
        const isSpecialPart = name.includes('eye') || name.includes('pupil') ||
          name.includes('sclera') || name.includes('nostril') ||
          name.includes('fang') || name.includes('beak') ||
          name.includes('horn') || name.includes('mouth') ||
          name.includes('foot') || name.includes('inner');

        if (!isSpecialPart && child.material instanceof MeshStandardMaterial) {
          // Blend the original color with the skin pattern
          const oldMat = child.material as MeshStandardMaterial;
          const newMat = material.clone();
          // Preserve the original geometry color if it was set
          if (oldMat.color) {
            newMat.color.copy(oldMat.color);
          }
          child.material = newMat;
        }
      }
    });
  }

  /**
   * Build walk animation using the LocomotionSystem
   */
  protected buildWalkAnimationWithLocomotion(speed: SpeedLevel = 'walk'): AnimationClip {
    if (!this.resolvedBodyPlan) {
      return this.buildWalkAnimation();
    }

    const config: LocomotionConfig = {
      bodyPlanType: this.resolvedBodyPlan.type,
      locomotionType: this.resolvedBodyPlan.locomotionType,
      size: this.resolvedBodyPlan.size,
      speed,
      speedMultiplier: 1.0,
      strideLength: 0.3,
      bodyScale: this.params.size,
      spineSegments: this.resolvedBodyPlan.spineSegments,
      tailSegments: this.resolvedBodyPlan.tailSegments,
    };

    this.walkClip = LocomotionSystem.generateWalkClip(config);
    return this.walkClip;
  }

  /**
   * Build idle animation using the LocomotionSystem
   */
  protected buildIdleAnimationWithLocomotion(): AnimationClip {
    if (!this.resolvedBodyPlan) {
      return this.buildIdleAnimation();
    }

    this.idleClip = LocomotionSystem.generateIdleClip(
      this.resolvedBodyPlan.type,
      this.params.size,
      this.resolvedBodyPlan.tailSegments,
    );
    return this.idleClip;
  }

  // ── Skeleton System ──────────────────────────────────────────────

  /**
   * Build a skeleton for this creature type and store it
   */
  buildSkeleton(config?: CreatureSkeletonConfig): Skeleton {
    const creatureType = this.getCreatureTypeString();
    this.skeleton = this.skeletonBuilder.buildSkeleton(creatureType, {
      size: this.params.size,
      ...config,
    });
    return this.skeleton;
  }

  /**
   * Get the current skeleton (builds one if none exists)
   */
  getSkeleton(config?: CreatureSkeletonConfig): Skeleton {
    if (!this.skeleton) {
      this.buildSkeleton(config);
    }
    return this.skeleton;
  }

  /**
   * Create a skinned mesh using the creature's skeleton
   */
  createSkinnedMesh(geometry: BufferGeometry, material: Material): SkinnedMesh {
    const skeleton = this.getSkeleton();
    const mesh = new SkinnedMesh(geometry, material);
    mesh.add(skeleton.bones[0]); // Add root bone
    mesh.bind(skeleton);
    mesh.name = 'skinnedBody';
    return mesh;
  }

  /**
   * Build the full skeleton, compute skin weights, create a SkinnedMesh,
   * and initialize the IK controller for this creature.
   */
  buildSkeletonAndSkin(
    bodyGeometry?: BufferGeometry,
    bodyMaterial?: Material,
    skeletonConfig?: CreatureSkeletonConfig,
  ): SkinnedMesh {
    const skeleton = this.buildSkeleton(skeletonConfig);

    const geometry = bodyGeometry ?? this.createEllipsoidGeometry(
      this.params.size * 0.4,
      this.params.size * 0.35,
      this.params.size * 0.5,
    );

    const boneWeights = new Map<string, number[]>();
    const material = bodyMaterial ?? this.createStandardMaterial({
      color: 0x8b7355,
      roughness: 0.8,
      skinning: true,
    });

    if (material instanceof MeshStandardMaterial) {
      (material as any).skinning = true;
    }

    const skinnedMesh = this.skinnedMeshBuilder.buildSkinnedMesh(
      geometry,
      skeleton,
      boneWeights,
      material,
    );

    this.skeleton = skeleton;
    this.ikController = new IKController();
    this.buildDefaultIKChains(skeleton);

    return skinnedMesh;
  }

  /**
   * Get the IK controller (null if buildSkeletonAndSkin hasn't been called)
   */
  getIKController(): IKController | null {
    return this.ikController;
  }

  /**
   * Convenience: solve all IK chains
   */
  solveIK(iterations?: number): void {
    this.ikController?.solve(iterations);
  }

  /**
   * Build default IK chains from the skeleton by detecting limb patterns.
   */
  protected buildDefaultIKChains(skeleton: Skeleton): void {
    if (!this.ikController) return;

    const bones = skeleton.bones;

    const limbPatterns = [
      { root: /^scapula_(L|R)$/, upper: /^humerus_front_(L|R)$/, lower: /^radius_front_(L|R)$/, end: /^hand_front_(L|R)$/ },
      { root: /^pelvis$/, upper: /^femur_hind_(L|R)$/, lower: /^tibia_hind_(L|R)$/, end: /^foot_hind_(L|R)$/ },
      { root: /^leg_(front|hind)_(L|R)$/, upper: /^upper_(front|hind)_(L|R)$/, lower: /^lower_(front|hind)_(L|R)$/, end: /^foot_(front|hind)_(L|R)$/ },
      { root: /^pelvis$/, upper: /^femur_(L|R)$/, lower: /^tibiotarsus_(L|R)$/, end: /^tarsometatarsus_(L|R)$/ },
      { root: /^coxa_(pro|meso|meta)_(L|R)$/, upper: /^femur_(pro|meso|meta)_(L|R)$/, lower: /^tibia_(pro|meso|meta)_(L|R)$/, end: /^tarsus_(pro|meso|meta)_(L|R)$/ },
    ];

    const boneMap = new Map<string, Bone>();
    for (const bone of bones) {
      boneMap.set(bone.name, bone);
    }

    for (const pattern of limbPatterns) {
      for (const bone of bones) {
        const match = bone.name.match(pattern.upper);
        if (!match) continue;

        const side = match[match.length - 1];
        const chainBones: Bone[] = [];

        const rootBone = this.findBoneByPattern(bones, pattern.root, side);
        if (rootBone) chainBones.push(rootBone);
        chainBones.push(bone);

        const lowerBone = this.findBoneInHierarchy(bone, pattern.lower);
        if (lowerBone) chainBones.push(lowerBone);

        const endBone = lowerBone
          ? this.findBoneInHierarchy(lowerBone, pattern.end)
          : null;
        if (endBone) chainBones.push(endBone);

        if (chainBones.length < 2) continue;

        const effectorBone = endBone ?? lowerBone ?? bone;
        const effectorPos = new Vector3();
        effectorBone.getWorldPosition(effectorPos);

        const effector: IKEffector = {
          bone: effectorBone,
          targetPosition: effectorPos.clone(),
          weight: 1.0,
        };

        const chain: IKChain = {
          bones: chainBones,
          effector,
        };

        this.ikController.addChain(chain);
      }
    }
  }

  private findBoneByPattern(bones: Bone[], pattern: RegExp, side: string): Bone | null {
    for (const bone of bones) {
      const match = bone.name.match(pattern);
      if (match && bone.name.includes(side)) {
        return bone;
      }
    }
    return null;
  }

  private findBoneInHierarchy(bone: Bone, pattern: RegExp): Bone | null {
    for (const child of bone.children) {
      if (child instanceof Bone) {
        if (pattern.test(child.name)) {
          return child;
        }
        const found = this.findBoneInHierarchy(child, pattern);
        if (found) return found;
      }
    }
    return null;
  }

  // ── Animation System ─────────────────────────────────────────────

  /**
   * Build the idle animation clip for this creature
   */
  buildIdleAnimation(behaviors?: IdleBehavior[]): AnimationClip {
    this.idleClip = this.idleAnimation.generate(behaviors ?? ['breathing', 'tailWagging']);
    return this.idleClip;
  }

  /**
   * Build the walk cycle animation clip for this creature
   */
  buildWalkAnimation(gait?: GaitType, speed?: number, params?: WalkCycleParams): AnimationClip {
    const actualGait = gait ?? this.getDefaultGait();
    this.walkClip = this.walkCycle.generate(actualGait, speed ?? 1.0, {
      bodyScale: this.params.size,
      ...params,
    });
    return this.walkClip;
  }

  /**
   * Get all available animation clips
   */
  getAnimationClips(): AnimationClip[] {
    const clips: AnimationClip[] = [];
    if (this.idleClip) clips.push(this.idleClip);
    if (this.walkClip) clips.push(this.walkClip);
    return clips;
  }

  /**
   * Set up the animation mixer on a group
   */
  setupAnimationMixer(group: Group): AnimationMixer {
    this.animationMixer = new AnimationMixer(group);
    return this.animationMixer;
  }

  /**
   * Get the animation mixer
   */
  getAnimationMixer(): AnimationMixer | null {
    return this.animationMixer;
  }

  // ── Behavior Tree System ─────────────────────────────────────────

  tickBehavior(deltaTime: number): BehaviorState {
    return this.behaviorTree.execute(deltaTime);
  }

  getBehaviorContext(): CreatureContext {
    return this.behaviorTree.context;
  }

  updateBehaviorContext(partial: Partial<CreatureContext>): void {
    this.behaviorTree.updateContext(partial);
  }

  getCurrentBehavior(): string {
    return this.behaviorTree.getCurrentBehavior();
  }

  // ── Helpers ──────────────────────────────────────────────────────

  protected getDefaultGait(): GaitType {
    const type = this.params.creatureType;
    switch (type) {
      case CreatureType.BIRD:
        return 'biped';
      case CreatureType.INSECT:
        return 'hexapod';
      case CreatureType.FISH:
        return 'quadruped';
      default:
        return 'quadruped';
    }
  }

  protected getCreatureTypeString(): 'mammal' | 'bird' | 'fish' | 'reptile' | 'insect' | 'amphibian' {
    switch (this.params.creatureType) {
      case CreatureType.MAMMAL:     return 'mammal';
      case CreatureType.BIRD:       return 'bird';
      case CreatureType.FISH:       return 'fish';
      case CreatureType.REPTILE:    return 'reptile';
      case CreatureType.INSECT:     return 'insect';
      case CreatureType.AMPHIBIAN:  return 'amphibian';
      default:                      return 'mammal';
    }
  }

  protected createEllipsoidGeometry(x: number, y: number, z: number): SphereGeometry {
    const geometry = new SphereGeometry(1, 32, 32);
    geometry.scale(x, y, z);
    return geometry;
  }

  protected createSphereGeometry(radius: number): SphereGeometry {
    return new SphereGeometry(radius, 16, 16);
  }

  protected createBoxGeometry(width: number, height: number, depth: number): BoxGeometry {
    return new BoxGeometry(width, height, depth);
  }

  protected createCylinderGeometry(radiusTop: number, radiusBottom: number, height: number, segments: number = 16): CylinderGeometry {
    return new CylinderGeometry(radiusTop, radiusBottom, height, segments);
  }

  protected createConeGeometry(radius: number, height: number, segments: number = 16): ConeGeometry {
    return new ConeGeometry(radius, height, segments);
  }

  protected createCapsuleGeometry(radius: number, length: number): CapsuleGeometry {
    return new CapsuleGeometry(radius, length, 8, 16);
  }

  protected createStandardMaterial(params?: Record<string, any>): MeshStandardMaterial {
    return new MeshStandardMaterial({ roughness: 0.7, metalness: 0.0, ...params });
  }

  protected createFinGeometry(width: number, height: number, depth: number): BufferGeometry {
    const vertices = new Float32Array([
      0, height, 0,
      -width / 2, 0, -depth / 2,
      width / 2, 0, -depth / 2,
      0, height, 0,
      width / 2, 0, depth / 2,
      -width / 2, 0, depth / 2,
      0, height, 0,
      -width / 2, 0, -depth / 2,
      -width / 2, 0, depth / 2,
      0, height, 0,
      width / 2, 0, depth / 2,
      width / 2, 0, -depth / 2,
      -width / 2, 0, -depth / 2,
      width / 2, 0, -depth / 2,
      width / 2, 0, depth / 2,
      -width / 2, 0, -depth / 2,
      width / 2, 0, depth / 2,
      -width / 2, 0, depth / 2,
    ]);
    const geom = new BufferGeometry();
    geom.setAttribute('position', new Float32BufferAttribute(vertices, 3));
    geom.computeVertexNormals();
    return geom;
  }

  protected createEarGeometry(width: number, height: number, depth: number): BufferGeometry {
    const geo = new ConeGeometry(width / 2, height, 8);
    geo.scale(1, 1, depth / width);
    return geo;
  }

  protected createShellGeometry(radius: number, domeHeight: number): SphereGeometry {
    const geo = new SphereGeometry(radius, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.6);
    geo.scale(1, domeHeight / radius, 1);
    return geo;
  }

  protected mergeParameters(base: any, override: any): any {
    return { ...base, ...override };
  }

  abstract generateBodyCore(): Object3D;
  abstract generateHead(): Object3D;
  abstract generateLimbs(): Object3D[];
  abstract generateAppendages(): Object3D[];
  abstract applySkin(materials: Material[]): Material[];
}
