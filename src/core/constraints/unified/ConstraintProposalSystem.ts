/**
 * Constraint-Aware Proposal System + Lazy Memoization (P1)
 *
 * This module provides constraint-aware proposal generation and lazy memoization
 * for the unified constraint solver. It builds on the P0 UnifiedConstraintSystem
 * to generate proposals that are aware of constraint bounds, usage lookups,
 * and relation assignments.
 *
 * Key components:
 * - ConstraintAwareProposer: Generates constraint-aware move proposals
 *   (addition, translation, rotation, resample, removal, plane_change)
 * - ConstraintBounds: Extracts which object types satisfy which constraints
 * - UsageLookup: Maps constraint names to generators/object types
 * - RelationAssignmentFinder: Finds valid relation assignments for new objects
 * - LazyConstraintMemo: Enhanced memo with proper eviction and hit-rate tracking
 * - ProposalWeightConfig: Temperature-annealed proposal weights
 * - ConstraintAwareSASolver: Full SA solver integrating all components
 *
 * This is a NEW module that does not modify existing files.
 */

import * as THREE from 'three';
import { SeededRandom } from '@/core/util/MathUtils';
import {
  Tag,
  TagSet,
  ObjectState,
  Relation,
  ViolationAwareSA,
  Constraint,
  MoveProposal,
  SAConfig,
  DEFAULT_SA_CONFIG,
  DOFConstraints,
  Polygon2D,
  RelationEntry,
  RelationResult,
} from './UnifiedConstraintSystem';

// ============================================================================
// Extended MoveProposal types
// ============================================================================

/**
 * Extended proposal type including addition, removal, and plane change.
 * Extends the base MoveProposal types with constraint-aware operations.
 */
export type ProposalType =
  | 'addition'
  | 'translation'
  | 'rotation'
  | 'resample'
  | 'removal'
  | 'plane_change'
  | 'translate'
  | 'rotate'
  | 'translate_rotate'
  | 'reinit';

/**
 * Extended move proposal with constraint-aware fields.
 *
 * In addition to the base MoveProposal fields, this includes:
 * - Extended type union supporting addition, removal, resample, plane_change
 * - Optional new object state for addition proposals
 * - Optional generator params for resample proposals
 * - Optional plane info for plane_change proposals
 */
export interface ExtendedMoveProposal {
  /** The object ID to move */
  objectId: string;

  /** New position (absolute) */
  newPosition?: THREE.Vector3;

  /** Position delta (relative to current) */
  deltaPosition?: THREE.Vector3;

  /** New rotation (absolute) */
  newRotation?: THREE.Euler;

  /** Rotation delta (relative to current) */
  deltaRotation?: THREE.Euler;

  /** Extended proposal type */
  type: ProposalType;

  /** Energy change from this proposal (filled after evaluation) */
  energyChange?: number;

  /** Violation change from this proposal (filled after evaluation) */
  violationChange?: number;

  /** New object state (for addition proposals) */
  newObjectState?: ObjectState;

  /** Generator parameters (for resample proposals) */
  generatorParams?: Record<string, number>;

  /** Target plane normal (for plane_change proposals) */
  planeNormal?: THREE.Vector3;

  /** Target plane position (for plane_change proposals) */
  planePosition?: THREE.Vector3;

  /** Object IDs of neighbors affected by this proposal (for memo eviction) */
  affectedObjectIds?: string[];
}

// ============================================================================
// ConstraintBound — Extracted constraint information for proposal generation
// ============================================================================

/**
 * Information extracted from a constraint about what object types satisfy it.
 *
 * This drives the proposeAddition logic: when we want to add an object
 * that satisfies a particular constraint, we look up the constraint's
 * bound to find valid object types and tag requirements.
 */
export interface ConstraintBound {
  /** The constraint name this bound was extracted from */
  constraintName: string;

  /** Tags that an object must have to satisfy this constraint */
  requiredTags: Tag[];

  /** Object types that can satisfy this constraint */
  validObjectTypes: string[];

  /** Maximum number of objects of this type allowed */
  maxCount: number;

  /** Minimum number of objects of this type required */
  minCount: number;

  /** Whether this is a hard constraint */
  hard: boolean;
}

// ============================================================================
// Generator — Object generator interface for UsageLookup
// ============================================================================

/**
 * Interface for object generators used by UsageLookup.
 *
 * A generator can produce an ObjectState for a given object type,
 * optionally with seeded randomness for deterministic generation.
 */
export interface Generator {
  /** Unique name for this generator */
  name: string;

  /** The object type this generator produces */
  objectType: string;

  /** Tags that generated objects will have */
  tags: Tag[];

  /**
   * Generate a new object state.
   *
   * @param id - The object ID to assign
   * @param rng - Seeded random number generator
   * @param params - Optional generation parameters
   * @returns A new ObjectState
   */
  generate(id: string, rng: SeededRandom, params?: Record<string, number>): ObjectState;

  /**
   * Get default parameters for this generator.
   */
  getDefaultParams(): Record<string, number>;
}

// ============================================================================
// RelationAssignment — Valid placement for a new object
// ============================================================================

/**
 * A valid relation assignment for placing a new object.
 *
 * Describes a (relation, targetObject, position) triple that
 * the RelationAssignmentFinder determines as a valid placement
 * for a new object of a given type.
 */
export interface RelationAssignment {
  /** The relation that this assignment satisfies */
  relation: Relation;

  /** The target (parent) object ID */
  targetObjectId: string;

  /** The valid placement position */
  position: THREE.Vector3;

  /** Optional orientation at the placement position */
  rotation?: THREE.Euler;

  /** Score indicating how well this assignment satisfies the relation (0-1) */
  score: number;
}

// ============================================================================
// ConstraintBounds — Extract constraint bounds for proposal generation
// ============================================================================

/**
 * Extracts constraint bounds from a set of constraints and a usage lookup.
 *
 * For each constraint, determines what object types satisfy it,
 * what tags are required, and the min/max count bounds.
 * This drives the proposeAddition logic: instead of blindly
 * adding random objects, we add objects that contribute to
 * constraint satisfaction.
 */
export class ConstraintBounds {
  private bounds: Map<string, ConstraintBound> = new Map();

  /**
   * Extract bounds from a set of constraints and a usage lookup.
   *
   * For each constraint, inspects its tags and the usage lookup to
   * determine which object types and tags are relevant.
   *
   * @param constraints - Array of constraints to extract bounds from
   * @param usageLookup - Usage lookup to find generators for each constraint
   * @returns Map of constraint name → ConstraintBound
   */
  extractFromConstraints(
    constraints: Constraint[],
    usageLookup: UsageLookup
  ): Map<string, ConstraintBound> {
    this.bounds.clear();

    for (const constraint of constraints) {
      const generators = usageLookup.getGenerators(constraint.id);
      const constraintNames = generators.map(g => g.objectType);

      // Extract required tags from generators
      const requiredTags: Tag[] = [];
      for (const gen of generators) {
        for (const tag of gen.tags) {
          if (!requiredTags.some(t => t.equals(tag))) {
            requiredTags.push(tag);
          }
        }
      }

      // Determine min/max counts from constraint metadata
      // Default: min=0, max=Infinity unless specified
      const bound: ConstraintBound = {
        constraintName: constraint.id,
        requiredTags,
        validObjectTypes: constraintNames.length > 0 ? constraintNames : ['unknown'],
        maxCount: Infinity,
        minCount: 0,
        hard: constraint.hard,
      };

      this.bounds.set(constraint.id, bound);
    }

    return new Map(this.bounds);
  }

  /**
   * Get the bound for a specific constraint.
   */
  getBound(constraintName: string): ConstraintBound | undefined {
    return this.bounds.get(constraintName);
  }

  /**
   * Get all bounds.
   */
  getAllBounds(): Map<string, ConstraintBound> {
    return new Map(this.bounds);
  }

  /**
   * Find constraints that require a specific object type.
   */
  getConstraintsForType(objectType: string): ConstraintBound[] {
    const result: ConstraintBound[] = [];
    for (const bound of this.bounds.values()) {
      if (bound.validObjectTypes.includes(objectType)) {
        result.push(bound);
      }
    }
    return result;
  }

  /**
   * Find constraints that require any of the given tags.
   */
  getConstraintsForTags(tags: Tag[]): ConstraintBound[] {
    const result: ConstraintBound[] = [];
    for (const bound of this.bounds.values()) {
      if (bound.requiredTags.some(rt => tags.some(t => t.equals(rt)))) {
        result.push(bound);
      }
    }
    return result;
  }
}

// ============================================================================
// UsageLookup — Maps constraint names to generators
// ============================================================================

/**
 * Maps constraint names to object generators and vice versa.
 *
 * The UsageLookup is the bridge between constraints and the generators
 * that can produce objects satisfying those constraints. When
 * proposeAddition needs to add an object for a constraint, it
 * looks up the appropriate generator here.
 */
export class UsageLookup {
  /** Mapping: constraint name → generators that produce objects for it */
  private constraintToGenerators: Map<string, Generator[]> = new Map();

  /** Mapping: object type → constraint names that it can satisfy */
  private objectTypeToConstraints: Map<string, string[]> = new Map();

  /** All registered generators by name */
  private generatorsByName: Map<string, Generator> = new Map();

  /**
   * Register a generator for a constraint name and object type.
   *
   * @param constraintName - The constraint this generator helps satisfy
   * @param objectType - The object type this generator produces
   * @param generator - The generator instance
   */
  register(constraintName: string, objectType: string, generator: Generator): void {
    // Add to constraint → generators map
    const existing = this.constraintToGenerators.get(constraintName) ?? [];
    if (!existing.some(g => g.name === generator.name)) {
      existing.push(generator);
    }
    this.constraintToGenerators.set(constraintName, existing);

    // Add to objectType → constraints map
    const constraintList = this.objectTypeToConstraints.get(objectType) ?? [];
    if (!constraintList.includes(constraintName)) {
      constraintList.push(constraintName);
    }
    this.objectTypeToConstraints.set(objectType, constraintList);

    // Register by name
    this.generatorsByName.set(generator.name, generator);
  }

  /**
   * Get all generators registered for a constraint name.
   *
   * @param constraintName - The constraint to look up
   * @returns Array of generators, empty if none registered
   */
  getGenerators(constraintName: string): Generator[] {
    return this.constraintToGenerators.get(constraintName) ?? [];
  }

  /**
   * Get all constraint names that an object type can satisfy.
   *
   * @param objectType - The object type to look up
   * @returns Array of constraint names
   */
  getConstraintNames(objectType: string): string[] {
    return this.objectTypeToConstraints.get(objectType) ?? [];
  }

  /**
   * Get the best generator for a constraint, selected randomly.
   *
   * If multiple generators are registered for a constraint,
   * one is selected uniformly at random using the provided RNG.
   *
   * @param constraintName - The constraint to look up
   * @param rng - Seeded random number generator for selection
   * @returns A randomly selected generator, or undefined if none
   */
  getBestGenerator(constraintName: string, rng: SeededRandom): Generator | undefined {
    const generators = this.getGenerators(constraintName);
    if (generators.length === 0) return undefined;
    if (generators.length === 1) return generators[0];
    const idx = Math.floor(rng.next() * generators.length);
    return generators[idx];
  }

  /**
   * Get a generator by its unique name.
   */
  getGeneratorByName(name: string): Generator | undefined {
    return this.generatorsByName.get(name);
  }

  /**
   * Get all registered object types.
   */
  getAllObjectTypes(): string[] {
    return Array.from(this.objectTypeToConstraints.keys());
  }

  /**
   * Get the total number of registered generators.
   */
  get size(): number {
    return this.generatorsByName.size;
  }
}

// ============================================================================
// RelationAssignmentFinder — Finds valid relation assignments for new objects
// ============================================================================

/**
 * Finds valid relation assignments for placing a new object.
 *
 * Given a set of relations and the current state, this class determines
 * which existing objects can serve as parents for a new object of a
 * given type, and computes valid placement positions using relation geometry.
 */
export class RelationAssignmentFinder {
  /**
   * Find valid relation assignments for a new object of the given type.
   *
   * For each relation that involves the newObjectType (via child tags),
   * find existing objects that match the parent tags, and compute
   * valid placement positions using relation geometry.
   *
   * @param relations - Array of relations to consider
   * @param state - Current state map of object ID → ObjectState
   * @param newObjectType - The type of the new object to place
   * @param rng - Seeded random number generator
   * @returns Array of valid (relation, targetObject, position) triples
   */
  findAssignments(
    relations: Relation[],
    state: Map<string, ObjectState>,
    newObjectType: string,
    rng: SeededRandom
  ): RelationAssignment[] {
    const assignments: RelationAssignment[] = [];

    // Create a temporary object state for tag matching
    const tempObject = new ObjectState({
      type: newObjectType,
      tags: new TagSet([new Tag(newObjectType)]),
    });

    for (const relation of relations) {
      // Check if this relation's child tags match the new object type
      if (!relation.childTagsMatch(tempObject)) continue;

      // Find parent objects that match this relation's parent tags
      for (const [objectId, objectState] of state) {
        if (!relation.parentTagsMatch(objectState)) continue;

        // Compute valid placement positions using relation geometry
        const positions = this.computePlacementPositions(
          relation,
          objectState,
          tempObject,
          rng
        );

        for (const pos of positions) {
          assignments.push({
            relation,
            targetObjectId: objectId,
            position: pos.position,
            rotation: pos.rotation,
            score: pos.score,
          });
        }
      }
    }

    // Sort by score (descending) and return
    assignments.sort((a, b) => b.score - a.score);
    return assignments;
  }

  /**
   * Compute valid placement positions for a child relative to a parent,
   * given a relation.
   *
   * Uses the relation type and geometry to determine where a child
   * object can be placed while satisfying the relation.
   *
   * @param relation - The relation to satisfy
   * @param parent - The parent object state
   * @param child - The child object state (template)
   * @param rng - Seeded random number generator
   * @returns Array of valid placement positions with scores
   */
  private computePlacementPositions(
    relation: Relation,
    parent: ObjectState,
    child: ObjectState,
    rng: SeededRandom
  ): Array<{ position: THREE.Vector3; rotation?: THREE.Euler; score: number }> {
    const positions: Array<{ position: THREE.Vector3; rotation?: THREE.Euler; score: number }> = [];

    switch (relation.name) {
      case 'stable_against':
      case 'on_floor': {
        // Place on top of the parent surface
        const onTop = this.computeOnTopPosition(parent, rng);
        if (onTop) positions.push(onTop);
        break;
      }
      case 'supported_by': {
        // Place on top with XZ overlap
        const supported = this.computeSupportedPosition(parent, rng);
        if (supported) positions.push(supported);
        break;
      }
      case 'touching': {
        // Place near the parent
        const nearby = this.computeNearbyPositions(parent, rng, 3);
        positions.push(...nearby);
        break;
      }
      case 'distance': {
        // Place at a valid distance from the parent
        const distPositions = this.computeDistancePositions(parent, rng, 3);
        positions.push(...distPositions);
        break;
      }
      case 'coplanar': {
        // Place on the same plane
        const coplanar = this.computeCoplanarPositions(parent, rng, 2);
        positions.push(...coplanar);
        break;
      }
      default: {
        // Generic: place near the parent centroid
        const centroid = parent.position.clone();
        const offset = new THREE.Vector3(
          (rng.next() - 0.5) * 2,
          0,
          (rng.next() - 0.5) * 2
        );
        positions.push({
          position: centroid.add(offset),
          rotation: new THREE.Euler(0, rng.next() * Math.PI * 2, 0),
          score: 0.5,
        });
        break;
      }
    }

    return positions;
  }

  /**
   * Compute a position on top of a parent object.
   */
  private computeOnTopPosition(
    parent: ObjectState,
    rng: SeededRandom
  ): { position: THREE.Vector3; rotation?: THREE.Euler; score: number } | null {
    const topY = parent.boundingBox.max.y;
    const centerX = (parent.boundingBox.min.x + parent.boundingBox.max.x) / 2;
    const centerZ = (parent.boundingBox.min.z + parent.boundingBox.max.z) / 2;
    const halfW = (parent.boundingBox.max.x - parent.boundingBox.min.x) / 4;
    const halfD = (parent.boundingBox.max.z - parent.boundingBox.min.z) / 4;

    return {
      position: new THREE.Vector3(
        centerX + (rng.next() - 0.5) * halfW,
        topY,
        centerZ + (rng.next() - 0.5) * halfD
      ),
      rotation: new THREE.Euler(0, rng.next() * Math.PI * 2, 0),
      score: 0.9,
    };
  }

  /**
   * Compute a supported position (on top with XZ overlap).
   */
  private computeSupportedPosition(
    parent: ObjectState,
    rng: SeededRandom
  ): { position: THREE.Vector3; rotation?: THREE.Euler; score: number } | null {
    const pos = this.computeOnTopPosition(parent, rng);
    if (pos) {
      pos.score = 0.85;
    }
    return pos;
  }

  /**
   * Compute nearby positions around a parent object.
   */
  private computeNearbyPositions(
    parent: ObjectState,
    rng: SeededRandom,
    count: number
  ): Array<{ position: THREE.Vector3; rotation?: THREE.Euler; score: number }> {
    const positions: Array<{ position: THREE.Vector3; rotation?: THREE.Euler; score: number }> = [];
    const threshold = 0.5;

    for (let i = 0; i < count; i++) {
      const angle = rng.next() * Math.PI * 2;
      const dist = threshold + rng.next() * 1.5;
      positions.push({
        position: new THREE.Vector3(
          parent.position.x + Math.cos(angle) * dist,
          parent.position.y,
          parent.position.z + Math.sin(angle) * dist
        ),
        rotation: new THREE.Euler(0, rng.next() * Math.PI * 2, 0),
        score: 0.6,
      });
    }

    return positions;
  }

  /**
   * Compute positions at valid distances from a parent object.
   */
  private computeDistancePositions(
    parent: ObjectState,
    rng: SeededRandom,
    count: number
  ): Array<{ position: THREE.Vector3; rotation?: THREE.Euler; score: number }> {
    const positions: Array<{ position: THREE.Vector3; rotation?: THREE.Euler; score: number }> = [];
    const minDist = 0.5;
    const maxDist = 5.0;

    for (let i = 0; i < count; i++) {
      const angle = rng.next() * Math.PI * 2;
      const dist = minDist + rng.next() * (maxDist - minDist);
      positions.push({
        position: new THREE.Vector3(
          parent.position.x + Math.cos(angle) * dist,
          parent.position.y,
          parent.position.z + Math.sin(angle) * dist
        ),
        rotation: new THREE.Euler(0, rng.next() * Math.PI * 2, 0),
        score: 0.7,
      });
    }

    return positions;
  }

  /**
   * Compute coplanar positions (same Y as parent).
   */
  private computeCoplanarPositions(
    parent: ObjectState,
    rng: SeededRandom,
    count: number
  ): Array<{ position: THREE.Vector3; rotation?: THREE.Euler; score: number }> {
    const positions: Array<{ position: THREE.Vector3; rotation?: THREE.Euler; score: number }> = [];

    for (let i = 0; i < count; i++) {
      const angle = rng.next() * Math.PI * 2;
      const dist = 0.3 + rng.next() * 2.0;
      positions.push({
        position: new THREE.Vector3(
          parent.position.x + Math.cos(angle) * dist,
          parent.position.y,
          parent.position.z + Math.sin(angle) * dist
        ),
        rotation: new THREE.Euler(0, rng.next() * Math.PI * 2, 0),
        score: 0.75,
      });
    }

    return positions;
  }
}

// ============================================================================
// ProposalWeightConfig — Temperature-annealed proposal weights
// ============================================================================

/**
 * Configuration for proposal type weights with temperature-based annealing.
 *
 * At high temperatures, addition/removal proposals have higher weights
 * to explore the solution space broadly. As temperature decreases,
 * these weights shrink, focusing on fine-tuning via translation/rotation.
 */
export interface ProposalWeightConfig {
  /** Weight for addition proposals */
  additionWeight: number;

  /** Weight for translation proposals */
  translationWeight: number;

  /** Weight for rotation proposals */
  rotationWeight: number;

  /** Weight for resample proposals */
  resampleWeight: number;

  /** Weight for removal proposals */
  removalWeight: number;

  /** Weight for plane_change proposals */
  planeChangeWeight: number;

  /**
   * Temperature below which addition/removal weights start decreasing.
   * At T < annealStartTemp, the weight is multiplied by T/annealStartTemp.
   */
  annealStartTemp: number;
}

/** Default proposal weight configuration */
export const DEFAULT_PROPOSAL_WEIGHTS: ProposalWeightConfig = {
  additionWeight: 0.15,
  translationWeight: 0.35,
  rotationWeight: 0.20,
  resampleWeight: 0.10,
  removalWeight: 0.10,
  planeChangeWeight: 0.10,
  annealStartTemp: 100,
};

/**
 * Compute temperature-annealed weights for proposal selection.
 *
 * As temperature drops below annealStartTemp, the addition and removal
 * weights are scaled down proportionally, making the solver focus on
 * fine-tuning (translation, rotation, resample) at low temperatures.
 *
 * @param config - Base weight configuration
 * @param temperature - Current SA temperature
 * @returns Map of proposal type → effective weight
 */
export function computeAnnealedWeights(
  config: ProposalWeightConfig,
  temperature: number
): Map<ProposalType, number> {
  const annealFactor = temperature < config.annealStartTemp
    ? temperature / config.annealStartTemp
    : 1.0;

  const weights = new Map<ProposalType, number>();
  weights.set('addition', config.additionWeight * annealFactor);
  weights.set('translation', config.translationWeight);
  weights.set('rotation', config.rotationWeight);
  weights.set('resample', config.resampleWeight);
  weights.set('removal', config.removalWeight * annealFactor);
  weights.set('plane_change', config.planeChangeWeight);

  return weights;
}

/**
 * Select a proposal type based on weighted random selection.
 *
 * @param weights - Map of proposal type → weight
 * @param rng - Seeded random number generator
 * @returns Selected proposal type
 */
export function selectProposalType(
  weights: Map<ProposalType, number>,
  rng: SeededRandom
): ProposalType {
  let totalWeight = 0;
  for (const w of weights.values()) {
    totalWeight += w;
  }

  if (totalWeight <= 0) return 'translation'; // fallback

  let r = rng.next() * totalWeight;
  for (const [type, weight] of weights) {
    r -= weight;
    if (r <= 0) return type;
  }

  return 'translation'; // fallback
}

// ============================================================================
// PlaneInfo — Information about a placement plane
// ============================================================================

/**
 * Information about a surface/plane for the plane_change proposal.
 */
export interface PlaneInfo {
  /** Plane identifier */
  id: string;

  /** Plane normal vector */
  normal: THREE.Vector3;

  /** A point on the plane */
  position: THREE.Vector3;

  /** Bounding box of the plane surface */
  bounds: THREE.Box3;

  /** Tags associated with this plane (e.g., "floor", "wall", "ceiling") */
  tags: Tag[];
}

// ============================================================================
// ConstraintAwareProposer — Generates constraint-aware move proposals
// ============================================================================

/**
 * Generates constraint-aware move proposals for the SA solver.
 *
 * Unlike the P0 ViolationAwareSA's generateRandomProposal() which
 * generates simple random moves, this proposer:
 *
 * - Uses constraint bounds to determine WHAT to add
 * - Uses usage lookup to find generators for constraint-satisfying objects
 * - Uses relation assignment finder to determine WHERE to place new objects
 * - Respects DOF constraints for translation/rotation proposals
 * - Applies ±15% variation for resample proposals
 * - Supports plane changes for objects that can attach to different surfaces
 */
export class ConstraintAwareProposer {
  private constraintBounds: ConstraintBounds;
  private usageLookup: UsageLookup;
  private relationAssignmentFinder: RelationAssignmentFinder;
  private nextObjectId: number = 0;

  constructor(
    constraintBounds: ConstraintBounds,
    usageLookup: UsageLookup,
    relationAssignmentFinder?: RelationAssignmentFinder
  ) {
    this.constraintBounds = constraintBounds;
    this.usageLookup = usageLookup;
    this.relationAssignmentFinder = relationAssignmentFinder ?? new RelationAssignmentFinder();
  }

  /**
   * Generate an addition proposal: add a new object that satisfies a constraint.
   *
   * Algorithm:
   * 1. Find constraints with unsatisfied minCount or room for more objects
   * 2. Look up generators from usageLookup by constraint name
   * 3. Find valid relation assignments using relationAssignmentFinder
   * 4. Place new object at the best valid position
   * 5. Return ExtendedMoveProposal with type='addition'
   *
   * @param state - Current state map
   * @param constraintBounds - Extracted constraint bounds
   * @param usageLookup - Generator lookup
   * @param relations - Relations to satisfy
   * @param rng - Seeded random number generator
   * @returns Addition proposal, or null if no valid addition possible
   */
  proposeAddition(
    state: Map<string, ObjectState>,
    constraintBounds: ConstraintBounds,
    usageLookup: UsageLookup,
    relations: Relation[],
    rng: SeededRandom
  ): ExtendedMoveProposal | null {
    // Find constraints with room for more objects
    const candidateBounds: ConstraintBound[] = [];
    for (const bound of constraintBounds.getAllBounds().values()) {
      const currentCount = this.countObjectsOfType(state, bound.validObjectTypes);
      if (currentCount < bound.maxCount) {
        candidateBounds.push(bound);
      }
    }

    if (candidateBounds.length === 0) return null;

    // Pick a random constraint to satisfy
    const selectedBound = candidateBounds[Math.floor(rng.next() * candidateBounds.length)];

    // Look up generators for this constraint
    const generator = usageLookup.getBestGenerator(selectedBound.constraintName, rng);
    if (!generator) return null;

    // Find valid relation assignments
    const assignments = this.relationAssignmentFinder.findAssignments(
      relations,
      state,
      generator.objectType,
      rng
    );

    // Determine placement position
    let position: THREE.Vector3;
    let rotation: THREE.Euler;
    let affectedIds: string[] = [];

    if (assignments.length > 0) {
      // Use the best assignment
      const best = assignments[0];
      position = best.position.clone();
      rotation = best.rotation?.clone() ?? new THREE.Euler(0, rng.next() * Math.PI * 2, 0);
      affectedIds = [best.targetObjectId];
    } else {
      // No valid assignments: place at a random position within bounds
      position = new THREE.Vector3(
        (rng.next() - 0.5) * 10,
        0,
        (rng.next() - 0.5) * 10
      );
      rotation = new THREE.Euler(0, rng.next() * Math.PI * 2, 0);
    }

    // Generate the new object state
    const newId = `obj_${this.nextObjectId++}_${Date.now()}`;
    const newObject = generator.generate(newId, rng);

    // Override position and rotation
    newObject.position.copy(position);
    newObject.rotation.copy(rotation);
    newObject.updateBoundingBox();

    return {
      objectId: newId,
      newPosition: position,
      newRotation: rotation,
      type: 'addition',
      newObjectState: newObject,
      affectedObjectIds: affectedIds,
    };
  }

  /**
   * Generate a translation proposal: move an object along allowed DOF axes.
   *
   * Algorithm:
   * 1. Pick a random object from the state
   * 2. Generate a random translation vector
   * 3. Project onto DOF matrix translation axes (zero disallowed axes)
   * 4. Clamp to translation_range [min, max]
   * 5. Return ExtendedMoveProposal with type='translation'
   *
   * @param state - Current state map
   * @param objectId - ID of the object to translate
   * @param rng - Seeded random number generator
   * @returns Translation proposal
   */
  proposeTranslation(
    state: Map<string, ObjectState>,
    objectId: string,
    rng: SeededRandom
  ): ExtendedMoveProposal | null {
    const obj = state.get(objectId);
    if (!obj) return null;

    const dof = obj.dofConstraints;

    // Generate random translation vector
    const magnitude = 0.1 + rng.next() * 0.9; // 0.1 to 1.0
    const rawDelta = new THREE.Vector3(
      dof.translationAxes[0] ? (rng.next() - 0.5) * 2 * magnitude : 0,
      dof.translationAxes[1] ? (rng.next() - 0.5) * 2 * magnitude : 0,
      dof.translationAxes[2] ? (rng.next() - 0.5) * 2 * magnitude : 0
    );

    // Project onto DOF axes and clamp to range
    const projectedDelta = dof.projectTranslation(rawDelta);

    // Compute neighbors for memo eviction
    const affectedIds = this.findNeighborIds(state, objectId);

    return {
      objectId,
      deltaPosition: projectedDelta,
      type: 'translation',
      affectedObjectIds: [objectId, ...affectedIds],
    };
  }

  /**
   * Generate a rotation proposal: rotate an object along allowed axes.
   *
   * Algorithm:
   * 1. Pick a random object from the state
   * 2. Generate a random rotation
   * 3. Project onto allowed rotation axes (from DOF constraints)
   * 4. Quantize to quantizedRotationStep (e.g., π/4 for 45° steps)
   * 5. Clamp to rotation_range [min, max]
   * 6. Return ExtendedMoveProposal with type='rotation'
   *
   * @param state - Current state map
   * @param objectId - ID of the object to rotate
   * @param rng - Seeded random number generator
   * @returns Rotation proposal
   */
  proposeRotation(
    state: Map<string, ObjectState>,
    objectId: string,
    rng: SeededRandom
  ): ExtendedMoveProposal | null {
    const obj = state.get(objectId);
    if (!obj) return null;

    const dof = obj.dofConstraints;

    // Generate random rotation deltas
    const rawRotation = new THREE.Euler(
      dof.rotationAxes[0] ? (rng.next() - 0.5) * Math.PI : 0,
      dof.rotationAxes[1] ? (rng.next() - 0.5) * Math.PI : 0,
      dof.rotationAxes[2] ? (rng.next() - 0.5) * Math.PI : 0
    );

    // Quantize and clamp
    const quantized = dof.quantizeRotation(rawRotation);

    // Compute as delta from current
    const deltaRotation = new THREE.Euler(
      quantized.x - obj.rotation.x,
      quantized.y - obj.rotation.y,
      quantized.z - obj.rotation.z
    );

    const affectedIds = this.findNeighborIds(state, objectId);

    return {
      objectId,
      deltaRotation,
      type: 'rotation',
      affectedObjectIds: [objectId, ...affectedIds],
    };
  }

  /**
   * Generate a resample proposal: regenerate object parameters.
   *
   * Algorithm:
   * 1. Pick a random object from the state
   * 2. Regenerate object parameters using the generator factory
   * 3. Apply ±15% random variation to existing params
   * 4. Return ExtendedMoveProposal with type='resample'
   *
   * @param state - Current state map
   * @param objectId - ID of the object to resample
   * @param generatorFactory - Optional generator factory for re-generation
   * @param rng - Seeded random number generator
   * @returns Resample proposal
   */
  proposeResample(
    state: Map<string, ObjectState>,
    objectId: string,
    generatorFactory: UsageLookup | null,
    rng: SeededRandom
  ): ExtendedMoveProposal | null {
    const obj = state.get(objectId);
    if (!obj) return null;

    // Try to find a generator for this object's type
    let generatorParams: Record<string, number> = {};
    if (generatorFactory) {
      const constraintNames = generatorFactory.getConstraintNames(obj.type);
      for (const cname of constraintNames) {
        const gen = generatorFactory.getBestGenerator(cname, rng);
        if (gen) {
          generatorParams = gen.getDefaultParams();
          break;
        }
      }
    }

    // Apply ±15% random variation to existing params
    const variation: Record<string, number> = {};
    for (const [key, value] of Object.entries(generatorParams)) {
      const factor = 1 + (rng.next() - 0.5) * 0.3; // ±15%
      variation[key] = value * factor;
    }

    // Generate slight position/rotation variation as well
    const posJitter = new THREE.Vector3(
      (rng.next() - 0.5) * 0.1,
      0,
      (rng.next() - 0.5) * 0.1
    );
    const rotJitter = new THREE.Euler(
      0,
      (rng.next() - 0.5) * 0.2,
      0
    );

    const affectedIds = this.findNeighborIds(state, objectId);

    return {
      objectId,
      deltaPosition: posJitter,
      deltaRotation: rotJitter,
      type: 'resample',
      generatorParams: variation,
      affectedObjectIds: [objectId, ...affectedIds],
    };
  }

  /**
   * Generate a removal proposal: remove an object from the scene.
   *
   * @param state - Current state map
   * @param objectId - ID of the object to remove
   * @param rng - Seeded random number generator (unused, for API consistency)
   * @returns Removal proposal
   */
  proposeRemoval(
    state: Map<string, ObjectState>,
    objectId: string,
    rng: SeededRandom
  ): ExtendedMoveProposal | null {
    const obj = state.get(objectId);
    if (!obj) return null;

    // Don't remove objects that are required (minCount > 0)
    const allBounds = this.constraintBounds.getAllBounds();
    for (const bound of allBounds.values()) {
      if (bound.validObjectTypes.includes(obj.type)) {
        const currentCount = this.countObjectsOfType(state, bound.validObjectTypes);
        if (currentCount <= bound.minCount) {
          return null; // Can't remove: would violate minCount
        }
      }
    }

    const affectedIds = this.findNeighborIds(state, objectId);

    return {
      objectId,
      type: 'removal',
      affectedObjectIds: [objectId, ...affectedIds],
    };
  }

  /**
   * Generate a plane change proposal: move object to a different surface.
   *
   * Algorithm:
   * 1. Pick a random object from the state
   * 2. Find the closest valid plane from available list
   * 3. Compute position on the new plane
   * 4. Return ExtendedMoveProposal with type='plane_change'
   *
   * @param state - Current state map
   * @param objectId - ID of the object to move
   * @param planes - Available planes to move to
   * @param rng - Seeded random number generator
   * @returns Plane change proposal
   */
  proposePlaneChange(
    state: Map<string, ObjectState>,
    objectId: string,
    planes: PlaneInfo[],
    rng: SeededRandom
  ): ExtendedMoveProposal | null {
    const obj = state.get(objectId);
    if (!obj || planes.length === 0) return null;

    // Find the closest valid plane (different from current)
    let bestPlane: PlaneInfo | null = null;
    let bestDist = Infinity;

    for (const plane of planes) {
      // Compute distance from object to plane
      const dist = this.distanceToPlane(obj.position, plane);
      // Skip if object is already very close to this plane
      if (dist < 0.1) continue;
      if (dist < bestDist) {
        bestDist = dist;
        bestPlane = plane;
      }
    }

    if (!bestPlane) {
      // All planes too close; pick a random one with slight offset
      bestPlane = planes[Math.floor(rng.next() * planes.length)];
    }

    // Project object position onto the new plane
    const projectedPos = this.projectOntoPlane(obj.position, bestPlane, rng);

    // Compute rotation to align with plane normal
    const upVector = new THREE.Vector3(0, 1, 0);
    const planeNormal = bestPlane.normal.clone().normalize();
    const quaternion = new THREE.Quaternion().setFromUnitVectors(upVector, planeNormal);
    const newRotation = new THREE.Euler().setFromQuaternion(quaternion);

    const affectedIds = this.findNeighborIds(state, objectId);

    return {
      objectId,
      newPosition: projectedPos,
      newRotation: newRotation,
      type: 'plane_change',
      planeNormal: bestPlane.normal.clone(),
      planePosition: bestPlane.position.clone(),
      affectedObjectIds: [objectId, ...affectedIds],
    };
  }

  // ── Private helpers ──────────────────────────────────────────────────

  /**
   * Count objects of the given types in the state.
   */
  private countObjectsOfType(state: Map<string, ObjectState>, types: string[]): number {
    let count = 0;
    for (const obj of state.values()) {
      if (types.includes(obj.type)) {
        count++;
      }
    }
    return count;
  }

  /**
   * Find IDs of objects that are spatially near the given object.
   * Used for determining which memo entries to evict.
   */
  private findNeighborIds(state: Map<string, ObjectState>, objectId: string): string[] {
    const obj = state.get(objectId);
    if (!obj) return [];

    const neighbors: string[] = [];
    const maxDist = 5.0; // neighbor distance threshold

    for (const [id, other] of state) {
      if (id === objectId) continue;
      if (obj.position.distanceTo(other.position) < maxDist) {
        neighbors.push(id);
      }
    }

    return neighbors;
  }

  /**
   * Compute distance from a point to a plane.
   */
  private distanceToPlane(point: THREE.Vector3, plane: PlaneInfo): number {
    const normal = plane.normal.clone().normalize();
    const toPoint = new THREE.Vector3().subVectors(point, plane.position);
    return Math.abs(toPoint.dot(normal));
  }

  /**
   * Project a point onto a plane with random XZ offset.
   */
  private projectOntoPlane(
    point: THREE.Vector3,
    plane: PlaneInfo,
    rng: SeededRandom
  ): THREE.Vector3 {
    const normal = plane.normal.clone().normalize();
    const toPoint = new THREE.Vector3().subVectors(point, plane.position);
    const dist = toPoint.dot(normal);
    const projected = point.clone().sub(normal.clone().multiplyScalar(dist));

    // Add random offset within plane bounds
    if (plane.bounds) {
      const halfW = (plane.bounds.max.x - plane.bounds.min.x) / 4;
      const halfD = (plane.bounds.max.z - plane.bounds.min.z) / 4;
      const cx = (plane.bounds.max.x + plane.bounds.min.x) / 2;
      const cz = (plane.bounds.max.z + plane.bounds.min.z) / 2;

      projected.x = cx + (rng.next() - 0.5) * halfW;
      projected.z = cz + (rng.next() - 0.5) * halfD;
    }

    return projected;
  }
}

// ============================================================================
// LazyConstraintMemo — Enhanced memo with proper eviction and hit rate
// ============================================================================

/**
 * Memo entry that tracks which objects affect the cached result.
 */
interface MemoEntry {
  /** The cached constraint evaluation value */
  value: number;

  /** Set of object IDs whose movement would invalidate this entry */
  affectedObjects: Set<string>;

  /** Timestamp of when this entry was computed (for LRU if needed) */
  computedAt: number;
}

/**
 * Enhanced lazy constraint memoization with proper eviction and hit rate tracking.
 *
 * Unlike the P0 LazyConstraintMemo which uses simple string matching for
 * eviction (key.includes(objectId)), this enhanced version:
 *
 * - Tracks affectedObjects per entry for precise eviction
 * - Provides evictForAddition and evictForRemoval operations
 * - Tracks cache hit/miss statistics for performance monitoring
 * - Supports size limits with LRU eviction
 */
export class LazyConstraintMemo {
  private memo: Map<string, MemoEntry> = new Map();
  private maxEntries: number;

  /** Cache hit count */
  private hits: number = 0;

  /** Cache miss count */
  private misses: number = 0;

  /** Monotonic counter for timestamps */
  private timestamp: number = 0;

  constructor(maxEntries: number = 10000) {
    this.maxEntries = maxEntries;
  }

  /**
   * Evaluate a constraint with memoization.
   *
   * If the result for this constraintId is already cached and the
   * affected objects haven't moved, return the cached value.
   * Otherwise, call computeFn() to compute and cache the result.
   *
   * @param constraintId - Unique key for this constraint evaluation
   * @param computeFn - Function to compute the value if not cached
   * @param affectedObjects - Object IDs that this constraint depends on
   * @returns The cached or computed value
   */
  evaluate(
    constraintId: string,
    computeFn: () => number,
    affectedObjects?: Set<string>
  ): number {
    const entry = this.memo.get(constraintId);
    if (entry !== undefined) {
      this.hits++;
      return entry.value;
    }

    this.misses++;
    const value = computeFn();
    this.timestamp++;

    // Enforce max entries with simple eviction (delete oldest)
    if (this.memo.size >= this.maxEntries) {
      this.evictOldest();
    }

    this.memo.set(constraintId, {
      value,
      affectedObjects: affectedObjects ?? new Set(),
      computedAt: this.timestamp,
    });

    return value;
  }

  /**
   * Evict all entries whose affectedObjects contains the moved object ID.
   *
   * This is the critical optimization: only re-evaluate constraints
   * that are affected by a move, rather than re-evaluating all constraints.
   *
   * @param movedObjectId - ID of the object that was moved
   */
  evictForMove(movedObjectId: string): void {
    const keysToDelete: string[] = [];
    for (const [key, entry] of this.memo) {
      if (entry.affectedObjects.has(movedObjectId)) {
        keysToDelete.push(key);
      }
    }
    for (const key of keysToDelete) {
      this.memo.delete(key);
    }
  }

  /**
   * Evict entries referencing the new object and its neighbors.
   *
   * When a new object is added, constraints that involve the new
   * object or its neighbors need to be re-evaluated.
   *
   * @param objectId - ID of the newly added object
   */
  evictForAddition(objectId: string): void {
    // New object affects all constraints that might involve it
    this.evictForMove(objectId);
  }

  /**
   * Evict entries referencing the removed object.
   *
   * When an object is removed, all constraints that involved it
   * must be re-evaluated.
   *
   * @param objectId - ID of the removed object
   */
  evictForRemoval(objectId: string): void {
    this.evictForMove(objectId);
  }

  /**
   * Invalidate all memo entries.
   */
  invalidateAll(): void {
    this.memo.clear();
  }

  /**
   * Get the number of cached entries.
   */
  get size(): number {
    return this.memo.size;
  }

  /**
   * Get the cache hit rate (hits / (hits + misses)).
   *
   * Returns 0 if no evaluations have been performed.
   */
  get hitRate(): number {
    const total = this.hits + this.misses;
    return total > 0 ? this.hits / total : 0;
  }

  /**
   * Get cache statistics.
   */
  getStats(): { hits: number; misses: number; hitRate: number; size: number } {
    return {
      hits: this.hits,
      misses: this.misses,
      hitRate: this.hitRate,
      size: this.size,
    };
  }

  /**
   * Reset statistics counters (does not clear the cache).
   */
  resetStats(): void {
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Check if a constraint is cached.
   */
  has(constraintId: string): boolean {
    return this.memo.has(constraintId);
  }

  /**
   * Evict the oldest entry (simple LRU approximation).
   */
  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.memo) {
      if (entry.computedAt < oldestTime) {
        oldestTime = entry.computedAt;
        oldestKey = key;
      }
    }

    if (oldestKey !== null) {
      this.memo.delete(oldestKey);
    }
  }
}

// ============================================================================
// ConstraintAwareSASolver — Full SA solver with constraint-aware proposals
// ============================================================================

/**
 * Configuration for the constraint-aware SA solver.
 *
 * Extends the base SAConfig with proposal-specific parameters.
 */
export interface ConstraintAwareSAConfig extends SAConfig {
  /** Proposal weight configuration */
  proposalWeights: ProposalWeightConfig;

  /** Available planes for plane_change proposals */
  planes: PlaneInfo[];

  /** Whether to use lazy memoization */
  useLazyMemo: boolean;

  /** Maximum number of objects in the scene (stops addition when reached) */
  maxObjects: number;

  /** Minimum number of objects in the scene (stops removal when reached) */
  minObjects: number;

  /** Step size for translation proposals */
  translationStepSize: number;

  /** Step size for rotation proposals (radians) */
  rotationStepSize: number;

  /** Resample variation factor (default 0.15 = ±15%) */
  resampleVariation: number;
}

/** Default configuration for the constraint-aware SA solver */
export const DEFAULT_CONSTRAINT_AWARE_SA_CONFIG: ConstraintAwareSAConfig = {
  ...DEFAULT_SA_CONFIG,
  proposalWeights: DEFAULT_PROPOSAL_WEIGHTS,
  planes: [],
  useLazyMemo: true,
  maxObjects: 100,
  minObjects: 1,
  translationStepSize: 0.5,
  rotationStepSize: Math.PI / 8,
  resampleVariation: 0.15,
};

/**
 * Full constraint-aware SA solver.
 *
 * Integrates ConstraintAwareProposer + LazyConstraintMemo + ViolationAwareSA
 * into a complete solving pipeline that:
 *
 * 1. Chooses proposal type based on temperature-annealed weights
 * 2. Generates proposals via ConstraintAwareProposer
 * 3. Evaluates constraints using LazyConstraintMemo
 * 4. Accepts/rejects via ViolationAwareSA's Metropolis-Hastings criterion
 * 5. Evicts memo entries for moved/added/removed objects
 * 6. Returns the best state found
 *
 * Usage:
 * ```typescript
 * const solver = new ConstraintAwareSASolver(config);
 * const result = solver.solve(initialState, constraints, relations);
 * ```
 */
export class ConstraintAwareSASolver {
  private config: ConstraintAwareSAConfig;
  private rng: SeededRandom;
  private temperature: number;
  private proposer: ConstraintAwareProposer;
  private constraintBounds: ConstraintBounds;
  private usageLookup: UsageLookup;
  private lazyMemo: LazyConstraintMemo;
  private violationAwareSA: ViolationAwareSA;

  /** Best state found so far */
  private bestState: Map<string, ObjectState> | null = null;

  /** Energy of the best state */
  private bestEnergy: number = Infinity;

  /** Statistics tracking */
  stats: {
    totalIterations: number;
    proposalsByType: Map<ProposalType, number>;
    acceptedByType: Map<ProposalType, number>;
    memoHitRates: number[];
    energyHistory: number[];
    temperatureHistory: number[];
  };

  constructor(config: Partial<ConstraintAwareSAConfig> = {}) {
    this.config = { ...DEFAULT_CONSTRAINT_AWARE_SA_CONFIG, ...config };
    this.rng = new SeededRandom(this.config.randomSeed);
    this.temperature = this.config.initialTemperature;

    this.constraintBounds = new ConstraintBounds();
    this.usageLookup = new UsageLookup();
    this.lazyMemo = new LazyConstraintMemo();
    this.proposer = new ConstraintAwareProposer(
      this.constraintBounds,
      this.usageLookup
    );
    this.violationAwareSA = new ViolationAwareSA(config);

    this.stats = {
      totalIterations: 0,
      proposalsByType: new Map(),
      acceptedByType: new Map(),
      memoHitRates: [],
      energyHistory: [],
      temperatureHistory: [],
    };
  }

  /**
   * Get the constraint bounds instance (for external setup).
   */
  getConstraintBounds(): ConstraintBounds {
    return this.constraintBounds;
  }

  /**
   * Get the usage lookup instance (for external setup).
   */
  getUsageLookup(): UsageLookup {
    return this.usageLookup;
  }

  /**
   * Get the lazy memo instance (for external access).
   */
  getLazyMemo(): LazyConstraintMemo {
    return this.lazyMemo;
  }

  /**
   * Run the constraint-aware SA solver.
   *
   * @param initialState - Map of object ID → ObjectState
   * @param constraints - Array of constraints to satisfy
   * @param relations - Array of relations to evaluate
   * @param config - Optional config override
   * @returns The best-found state as a map of object ID → ObjectState
   */
  solve(
    initialState: Map<string, ObjectState>,
    constraints: Constraint[],
    relations: Relation[],
    config?: Partial<ConstraintAwareSAConfig>
  ): Map<string, ObjectState> {
    if (config) {
      this.config = { ...this.config, ...config };
    }

    // Initialize
    this.temperature = this.config.initialTemperature;
    this.rng = new SeededRandom(this.config.randomSeed);
    this.lazyMemo.invalidateAll();

    // Extract constraint bounds
    this.constraintBounds.extractFromConstraints(constraints, this.usageLookup);

    // Recreate proposer with updated bounds
    this.proposer = new ConstraintAwareProposer(
      this.constraintBounds,
      this.usageLookup
    );

    // Compute initial energy
    let currentEnergy = this.computeEnergyWithMemo(initialState, constraints, relations);
    let currentState = this.cloneState(initialState);

    this.bestEnergy = currentEnergy;
    this.bestState = this.cloneState(currentState);

    // SA loop
    while (this.temperature > this.config.minTemperature) {
      this.stats.temperatureHistory.push(this.temperature);

      for (let i = 0; i < this.config.maxIterationsPerTemp; i++) {
        this.stats.totalIterations++;

        // Step 1: Choose proposal type based on annealed weights
        const weights = computeAnnealedWeights(
          this.config.proposalWeights,
          this.temperature
        );
        const proposalType = selectProposalType(weights, this.rng);

        // Step 2: Generate proposal
        const proposal = this.generateProposal(
          proposalType,
          currentState,
          constraints,
          relations
        );

        if (!proposal) continue;

        // Track proposal type
        const typeCount = this.stats.proposalsByType.get(proposalType) ?? 0;
        this.stats.proposalsByType.set(proposalType, typeCount + 1);

        // Step 3: Apply proposal to get new state
        const newState = this.applyProposal(currentState, proposal);

        // Step 4: Evaluate constraints using LazyConstraintMemo
        const newEnergy = this.computeEnergyWithMemo(newState, constraints, relations);
        const deltaEnergy = newEnergy - currentEnergy;

        // Step 5: Accept/reject via violation-aware criterion
        const hardViolation = this.computeHardViolation(newState, constraints, relations);
        const currentHardViolation = this.computeHardViolation(currentState, constraints, relations);
        const hardDelta = hardViolation - currentHardViolation;

        let accepted = false;

        // Never accept moves that increase hard constraint violations
        if (hardDelta > 0) {
          accepted = false;
        }
        // Always accept violation-decreasing moves
        else if (deltaEnergy <= 0) {
          accepted = true;
        }
        // Standard Metropolis for soft violation-increasing moves
        else if (this.config.acceptSoftViolations) {
          const acceptanceProb = Math.exp(-deltaEnergy / this.temperature);
          accepted = this.rng.next() < acceptanceProb;
        }

        if (accepted) {
          currentState = newState;
          currentEnergy = newEnergy;

          // Track accepted type
          const acceptedCount = this.stats.acceptedByType.get(proposalType) ?? 0;
          this.stats.acceptedByType.set(proposalType, acceptedCount + 1);

          // Track best state
          if (currentEnergy < this.bestEnergy) {
            this.bestEnergy = currentEnergy;
            this.bestState = this.cloneState(currentState);
          }
        }

        // Step 6: Evict memo entries for affected objects
        if (this.config.useLazyMemo) {
          if (accepted && proposal.affectedObjectIds) {
            for (const id of proposal.affectedObjectIds) {
              if (proposal.type === 'addition') {
                this.lazyMemo.evictForAddition(id);
              } else if (proposal.type === 'removal') {
                this.lazyMemo.evictForRemoval(id);
              } else {
                this.lazyMemo.evictForMove(id);
              }
            }
          }
        }

        this.stats.energyHistory.push(currentEnergy);

        // Record memo hit rate periodically
        if (this.stats.totalIterations % 100 === 0) {
          this.stats.memoHitRates.push(this.lazyMemo.hitRate);
        }

        // Early convergence
        if (currentEnergy < this.config.convergenceThreshold) {
          return this.bestState ?? currentState;
        }
      }

      // Cool down
      this.temperature *= this.config.coolingRate;
    }

    return this.bestState ?? currentState;
  }

  // ── Private helpers ──────────────────────────────────────────────────

  /**
   * Generate a proposal of the specified type.
   */
  private generateProposal(
    type: ProposalType,
    state: Map<string, ObjectState>,
    constraints: Constraint[],
    relations: Relation[]
  ): ExtendedMoveProposal | null {
    const ids = Array.from(state.keys());

    switch (type) {
      case 'addition':
        return this.proposer.proposeAddition(
          state, this.constraintBounds, this.usageLookup, relations, this.rng
        );

      case 'translation': {
        if (ids.length === 0) return null;
        const objId = ids[Math.floor(this.rng.next() * ids.length)];
        return this.proposer.proposeTranslation(state, objId, this.rng);
      }

      case 'rotation': {
        if (ids.length === 0) return null;
        const objId = ids[Math.floor(this.rng.next() * ids.length)];
        return this.proposer.proposeRotation(state, objId, this.rng);
      }

      case 'resample': {
        if (ids.length === 0) return null;
        const objId = ids[Math.floor(this.rng.next() * ids.length)];
        return this.proposer.proposeResample(state, objId, this.usageLookup, this.rng);
      }

      case 'removal': {
        if (ids.length <= this.config.minObjects) return null;
        const objId = ids[Math.floor(this.rng.next() * ids.length)];
        return this.proposer.proposeRemoval(state, objId, this.rng);
      }

      case 'plane_change': {
        if (ids.length === 0 || this.config.planes.length === 0) return null;
        const objId = ids[Math.floor(this.rng.next() * ids.length)];
        return this.proposer.proposePlaneChange(state, objId, this.config.planes, this.rng);
      }

      default:
        return null;
    }
  }

  /**
   * Apply a proposal to the state, returning a new state.
   */
  private applyProposal(
    state: Map<string, ObjectState>,
    proposal: ExtendedMoveProposal
  ): Map<string, ObjectState> {
    const newState = this.cloneState(state);

    switch (proposal.type) {
      case 'addition': {
        if (proposal.newObjectState) {
          newState.set(proposal.objectId, proposal.newObjectState.clone());
        }
        break;
      }

      case 'removal': {
        newState.delete(proposal.objectId);
        break;
      }

      case 'translation':
      case 'rotation':
      case 'resample':
      case 'translate':
      case 'rotate':
      case 'translate_rotate': {
        const obj = newState.get(proposal.objectId);
        if (!obj) break;

        if (proposal.newPosition) {
          obj.position.copy(proposal.newPosition);
        }
        if (proposal.deltaPosition) {
          obj.position.add(proposal.deltaPosition);
        }
        if (proposal.newRotation) {
          obj.rotation.copy(proposal.newRotation);
        }
        if (proposal.deltaRotation) {
          obj.rotation.x += proposal.deltaRotation.x;
          obj.rotation.y += proposal.deltaRotation.y;
          obj.rotation.z += proposal.deltaRotation.z;
        }

        // Apply DOF constraints
        const dof = obj.dofConstraints;
        obj.position.copy(dof.projectTranslation(obj.position));
        obj.rotation.copy(dof.quantizeRotation(obj.rotation));
        obj.updateBoundingBox();
        break;
      }

      case 'plane_change': {
        const obj = newState.get(proposal.objectId);
        if (!obj) break;

        if (proposal.newPosition) {
          obj.position.copy(proposal.newPosition);
        }
        if (proposal.newRotation) {
          obj.rotation.copy(proposal.newRotation);
        }
        obj.updateBoundingBox();
        break;
      }

      case 'reinit': {
        const obj = newState.get(proposal.objectId);
        if (!obj) break;
        // Reinitialize from generator params if available
        if (proposal.generatorParams) {
          for (const [key, val] of Object.entries(proposal.generatorParams)) {
            switch (key) {
              case 'scaleX': obj.scale.x = val; break;
              case 'scaleY': obj.scale.y = val; break;
              case 'scaleZ': obj.scale.z = val; break;
            }
          }
          obj.updateBoundingBox();
        }
        break;
      }
    }

    return newState;
  }

  /**
   * Compute total energy using lazy memoization.
   */
  private computeEnergyWithMemo(
    state: Map<string, ObjectState>,
    constraints: Constraint[],
    relations: Relation[]
  ): number {
    let hardViolation = 0;
    let softViolation = 0;

    // Evaluate constraints with memoization
    for (const constraint of constraints) {
      const constraintId = constraint.id;
      const affectedObjects = this.getAffectedObjectIds(state, constraint);

      const viol = this.lazyMemo.evaluate(
        constraintId,
        () => constraint.evaluate(state),
        affectedObjects
      );

      if (constraint.hard) {
        hardViolation += viol;
      } else {
        softViolation += viol * constraint.weight;
      }
    }

    // Evaluate relations
    const objects = Array.from(state.entries());
    for (const [childId, childState] of objects) {
      for (const [parentId, parentState] of objects) {
        if (childId === parentId) continue;
        for (const relation of relations) {
          if (relation.childTagsMatch(childState) && relation.parentTagsMatch(parentState)) {
            const relationId = `${relation.name}_${childId}_${parentId}`;
            const affectedObjects = new Set([childId, parentId]);

            const result = this.lazyMemo.evaluate(
              relationId,
              () => relation.evaluate(childState, parentState).violationAmount,
              affectedObjects
            );

            if (result > 0) {
              hardViolation += result;
            }
          }
        }
      }
    }

    return hardViolation * this.config.hardConstraintWeight +
           softViolation * this.config.softConstraintWeight;
  }

  /**
   * Compute only hard constraint violations.
   */
  private computeHardViolation(
    state: Map<string, ObjectState>,
    constraints: Constraint[],
    relations: Relation[]
  ): number {
    let violation = 0;

    for (const constraint of constraints) {
      if (constraint.hard) {
        violation += constraint.evaluate(state);
      }
    }

    // Relations are treated as hard constraints
    const objects = Array.from(state.entries());
    for (const [childId, childState] of objects) {
      for (const [parentId, parentState] of objects) {
        if (childId === parentId) continue;
        for (const relation of relations) {
          if (relation.childTagsMatch(childState) && relation.parentTagsMatch(parentState)) {
            const result = relation.evaluate(childState, parentState);
            if (!result.satisfied) {
              violation += result.violationAmount;
            }
          }
        }
      }
    }

    return violation;
  }

  /**
   * Get the set of object IDs that a constraint depends on.
   *
   * This is a heuristic: for now, we assume all objects in the state
   * could potentially affect a constraint. A more precise implementation
   * would require constraints to declare their dependencies.
   */
  private getAffectedObjectIds(
    state: Map<string, ObjectState>,
    _constraint: Constraint
  ): Set<string> {
    return new Set(state.keys());
  }

  /**
   * Deep clone a state map.
   */
  private cloneState(state: Map<string, ObjectState>): Map<string, ObjectState> {
    const result = new Map<string, ObjectState>();
    for (const [key, value] of state) {
      result.set(key, value.clone());
    }
    return result;
  }
}
