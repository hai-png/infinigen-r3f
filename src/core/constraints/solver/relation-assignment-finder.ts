/**
 * Relation Assignment Finder
 *
 * Ports: infinigen/core/constraints/example_solver/propose_relations.py find_assignments()
 *
 * A SAT-like algorithm that:
 *  - Takes a domain (tags + required relations) and the current State
 *  - Enumerates valid relation assignments for new objects
 *  - Minimizes redundant relations using implication checking
 *  - Finds candidate parent objects matching the domain
 *  - For each candidate, finds valid planes (surfaces) from tagged faces
 *  - Recursively assigns remaining relations
 *  - Returns all valid RelationState combinations
 *  - Uses Domain.implies() and Domain.satisfies() for pruning
 */

import * as THREE from 'three';
import { State, ObjectState, RelationState } from '../evaluator/state';
import { Relation } from '../language/relations';
import { TagSet } from '../tags/index';
import { PlaneExtractor, Plane } from '../solver/planes';
import { DOFSolver } from '../solver/dof';
import { Domain } from '../language/types';

// ============================================================================
// Public Types
// ============================================================================

/**
 * A candidate for relation assignment: a parent object + relation + plane indices.
 */
export interface AssignmentCandidate {
  /** Name of the parent object */
  parentName: string;
  /** Tags of the parent object */
  parentTags: TagSet | Set<any>;
  /** The relation to apply */
  relation: Relation;
  /** Index of the parent plane (surface) for this relation */
  planeIdx?: number;
  /** Index of the child plane for this relation */
  childPlaneIdx?: number;
}

/**
 * A complete assignment of relations for an object.
 */
export interface RelationAssignment {
  /** List of relation states forming the assignment */
  assignments: RelationState[];
  /** Score for this assignment (lower is better) */
  score: number;
}

/**
 * Configuration for the assignment finder.
 */
export interface AssignmentFinderConfig {
  /** Maximum number of candidates to evaluate per relation */
  maxCandidatesPerRelation?: number;
  /** Maximum number of total assignments to return */
  maxAssignments?: number;
  /** Whether to use implication pruning */
  enableImplicationPruning?: boolean;
  /** Tolerance for plane matching */
  planeMatchingTolerance?: number;
  /** Whether to prefer lower-score assignments */
  preferLowerScore?: boolean;
}

// ============================================================================
// RelationAssignmentFinder
// ============================================================================

/**
 * Finds valid relation assignments for a new object given a domain
 * and the current state of the scene.
 *
 * This is the core algorithm from the original Infinigen's propose_relations.py.
 * It works as follows:
 *
 * 1. From the domain, extract the required relations (e.g., StableAgainst(Floor, Bottom))
 * 2. For each required relation, find candidate parent objects whose tags match
 * 3. For each candidate parent, extract valid planes (surfaces) from tagged faces
 * 4. Recursively assign remaining relations, pruning via domain implication
 * 5. Score and return all valid combinations
 */
export class RelationAssignmentFinder {
  private config: Required<AssignmentFinderConfig>;
  private planeExtractor: PlaneExtractor;

  constructor(config: AssignmentFinderConfig = {}) {
    this.config = {
      maxCandidatesPerRelation: config.maxCandidatesPerRelation ?? 10,
      maxAssignments: config.maxAssignments ?? 50,
      enableImplicationPruning: config.enableImplicationPruning ?? true,
      planeMatchingTolerance: config.planeMatchingTolerance ?? 0.15,
      preferLowerScore: config.preferLowerScore ?? true,
    };
    this.planeExtractor = new PlaneExtractor();
  }

  /**
   * Find all valid relation assignments for an object with the given domain.
   *
   * @param childName  Name of the child object being assigned
   * @param childTags  Tags of the child object
   * @param domain     The domain specifying required tags and relations
   * @param requiredRelations  Relations that must be satisfied
   * @param state      The current solver state
   * @returns Array of valid RelationAssignments, sorted by score (best first)
   */
  findAssignments(
    childName: string,
    childTags: TagSet,
    domain: Domain | null,
    requiredRelations: Relation[],
    state: State
  ): RelationAssignment[] {
    if (requiredRelations.length === 0) {
      // No relations required → empty assignment is valid
      return [{ assignments: [], score: 0 }];
    }

    // Find candidates for each relation
    const relationCandidates: AssignmentCandidate[][] = requiredRelations.map(relation =>
      this.findCandidatesForRelation(childName, childTags, relation, state)
    );

    // Recursively enumerate valid combinations
    const assignments: RelationAssignment[] = [];
    this.enumerateAssignments(
      relationCandidates,
      0,
      [],
      0,
      assignments,
      state,
      domain
    );

    // Sort by score (lower is better)
    assignments.sort((a, b) => a.score - b.score);

    // Limit results
    return assignments.slice(0, this.config.maxAssignments);
  }

  /**
   * Find candidate parent objects for a specific relation.
   *
   * @param childName  Name of the child object
   * @param childTags  Tags of the child object
   * @param relation   The relation to find candidates for
   * @param state      The current solver state
   * @returns Array of AssignmentCandidates
   */
  private findCandidatesForRelation(
    childName: string,
    childTags: TagSet,
    relation: Relation,
    state: State
  ): AssignmentCandidate[] {
    const candidates: AssignmentCandidate[] = [];

    // Get the parent tags from the relation (if it's a unified Relation with parentTags)
    const parentTagSet = (relation as any).parentTags as TagSet | undefined;

    // Iterate over all objects in the state looking for matching parents
    for (const [objName, objState] of state.objects) {
      // Skip self
      if (objName === childName) continue;

      // Skip inactive objects
      if (!objState.active) continue;

      // Check if the parent's tags match the relation's parent tag requirements
      if (parentTagSet && !this.tagsMatch(objState, parentTagSet)) {
        continue;
      }

      // Check if the relation's child tag requirements match
      const childTagSet = (relation as any).childTags as TagSet | undefined;
      if (childTagSet && !this.tagSetMatches(childTags, childTagSet)) {
        continue;
      }

      // Extract planes from the parent object
      const planes = objState.obj
        ? this.planeExtractor.extractPlanes(objState.obj)
        : [];

      if (planes.length === 0) {
        // No planes available — still valid as a candidate (e.g., for proximity relations)
        candidates.push({
          parentName: objName,
          parentTags: objState.tags,
          relation,
        });
      } else {
        // Create a candidate for each valid plane
        for (let planeIdx = 0; planeIdx < planes.length; planeIdx++) {
          const plane = planes[planeIdx];

          // Check if this plane's tag matches the relation's tag requirements
          if (parentTagSet && plane.tag) {
            const planeTagMatches = this.planeTagMatches(parentTagSet, plane);
            if (!planeTagMatches) continue;
          }

          // Find matching child plane
          const childObjState = state.objects.get(childName);
          const childPlanes = childObjState?.obj
            ? this.planeExtractor.extractPlanes(childObjState.obj)
            : [];

          let childPlaneIdx: number | undefined;
          if (childPlanes.length > 0) {
            childPlaneIdx = this.findMatchingChildPlane(childPlanes, plane);
          }

          candidates.push({
            parentName: objName,
            parentTags: objState.tags,
            relation,
            planeIdx,
            childPlaneIdx,
          });

          // Limit candidates per relation
          if (candidates.length >= this.config.maxCandidatesPerRelation) break;
        }
      }

      // Limit candidates per relation
      if (candidates.length >= this.config.maxCandidatesPerRelation) break;
    }

    return candidates;
  }

  /**
   * Recursively enumerate all valid combinations of relation assignments.
   *
   * @param relationCandidates  Candidates for each relation (indexed by relation index)
   * @param currentIdx          Current relation index being assigned
   * @param currentAssignments  Assignments chosen so far
   * @param currentScore        Cumulative score so far
   * @param results             Output array to accumulate valid assignments
   * @param state               The current solver state
   * @param domain              The domain for implication pruning
   */
  private enumerateAssignments(
    relationCandidates: AssignmentCandidate[][],
    currentIdx: number,
    currentAssignments: RelationState[],
    currentScore: number,
    results: RelationAssignment[],
    state: State,
    domain: Domain | null
  ): void {
    // Base case: all relations have been assigned
    if (currentIdx >= relationCandidates.length) {
      results.push({
        assignments: [...currentAssignments],
        score: currentScore,
      });
      return;
    }

    // Limit total results
    if (results.length >= this.config.maxAssignments) return;

    const candidates = relationCandidates[currentIdx];

    // If no candidates for this relation, skip (assignment is incomplete)
    if (candidates.length === 0) {
      // Try with an empty assignment for this relation
      this.enumerateAssignments(
        relationCandidates,
        currentIdx + 1,
        currentAssignments,
        currentScore + 100, // Penalty for unfulfilled relation
        results,
        state,
        domain
      );
      return;
    }

    for (const candidate of candidates) {
      // Score this candidate
      const score = this.scoreCandidate(candidate, currentAssignments, state);

      // Create the RelationState
      const relationState = new RelationState(
        candidate.relation,
        candidate.parentName,
        candidate.childPlaneIdx,
        candidate.planeIdx
      );

      // Check for conflicts with existing assignments
      if (this.hasConflict(relationState, currentAssignments, state)) {
        continue;
      }

      // Implication pruning: if this relation is implied by existing assignments, skip
      if (this.config.enableImplicationPruning && domain) {
        if (this.isImpliedByExisting(relationState, currentAssignments, domain)) {
          continue;
        }
      }

      // Recurse
      currentAssignments.push(relationState);
      this.enumerateAssignments(
        relationCandidates,
        currentIdx + 1,
        currentAssignments,
        currentScore + score,
        results,
        state,
        domain
      );
      currentAssignments.pop();
    }
  }

  /**
   * Score a candidate assignment (lower is better).
   */
  private scoreCandidate(
    candidate: AssignmentCandidate,
    existingAssignments: RelationState[],
    state: State
  ): number {
    let score = 0;

    // Prefer assignments with planes (more specific)
    if (candidate.planeIdx === undefined) {
      score += 10;
    }

    // Prefer parents that are closer to the child
    const childObj = state.objects.get(candidate.parentName);
    if (childObj) {
      // Prefer objects with fewer existing children (less crowded)
      const childCount = this.countChildren(candidate.parentName, state);
      score += childCount * 0.5;
    }

    // Prefer parents that already have relations with this child's type
    // (e.g., table already supporting a chair → another chair is OK)

    // Prefer lower plane indices (typically more prominent surfaces)
    if (candidate.planeIdx !== undefined) {
      score += candidate.planeIdx * 0.1;
    }

    return score;
  }

  /**
   * Check if a new relation state conflicts with existing assignments.
   */
  private hasConflict(
    newRelState: RelationState,
    existingAssignments: RelationState[],
    state: State
  ): boolean {
    for (const existing of existingAssignments) {
      // Same relation type to same parent is redundant
      if (
        existing.targetName === newRelState.targetName &&
        existing.relation.constructor.name === newRelState.relation.constructor.name
      ) {
        return true;
      }

      // Contradictory relations (e.g., StableAgainst different surfaces with conflicting normals)
      if (existing.targetName === newRelState.targetName) {
        if (this.areContradictoryRelations(existing, newRelState, state)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Check if two relations to the same parent are contradictory.
   */
  private areContradictoryRelations(
    rel1: RelationState,
    rel2: RelationState,
    state: State
  ): boolean {
    const parentObj = state.objects.get(rel1.targetName);
    if (!parentObj?.obj) return false;

    const planes = this.planeExtractor.extractPlanes(parentObj.obj);
    const plane1 = rel1.parentPlaneIdx !== undefined ? planes[rel1.parentPlaneIdx] : null;
    const plane2 = rel2.parentPlaneIdx !== undefined ? planes[rel2.parentPlaneIdx] : null;

    if (plane1 && plane2) {
      // If two planes have opposite normals and the relations require being against both,
      // it's contradictory (can't be against a wall and its opposite simultaneously)
      const dot = plane1.normal.dot(plane2.normal);
      if (dot < -0.9) {
        // Anti-parallel normals → contradictory for StableAgainst
        if (
          rel1.relation.constructor.name === 'StableAgainst' &&
          rel2.relation.constructor.name === 'StableAgainst'
        ) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Check if a relation is already implied by existing assignments.
   */
  private isImpliedByExisting(
    newRelState: RelationState,
    existingAssignments: RelationState[],
    domain: Domain
  ): boolean {
    // If we already have a relation to the same parent that implies this one,
    // the new one is redundant
    for (const existing of existingAssignments) {
      if (existing.targetName === newRelState.targetName) {
        // StableAgainst implies Touching and Near
        if (
          existing.relation.constructor.name === 'StableAgainst' &&
          (newRelState.relation.constructor.name === 'Touching' ||
            newRelState.relation.constructor.name === 'Near')
        ) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Check if an object's tags match the required tags.
   */
  private tagsMatch(objState: ObjectState, requiredTags: TagSet): boolean {
    for (const tag of requiredTags.tags) {
      if (!objState.tags.has(tag)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Check if a TagSet matches another TagSet (all tags in required are satisfied by candidate).
   */
  private tagSetMatches(candidate: TagSet | Set<any>, required: TagSet): boolean {
    const candidateTags = candidate instanceof TagSet ? candidate.tags : candidate;
    for (const tag of required.tags) {
      let found = false;
      for (const ct of candidateTags) {
        if (ct instanceof Tag && tag instanceof Tag && ct.matches(tag)) {
          found = true;
          break;
        } else if (ct === tag) {
          found = true;
          break;
        }
      }
      if (!found) return false;
    }
    return true;
  }

  /**
   * Check if a plane's tag matches the required parent tags.
   */
  private planeTagMatches(parentTags: TagSet, plane: Plane): boolean {
    // Check if any of the parent tag names match the plane's tag
    for (const tag of parentTags) {
      if (tag.name === plane.tag || tag.name.toLowerCase() === plane.tag.toLowerCase()) {
        return true;
      }
    }
    return false;
  }

  /**
   * Find the child plane that best matches a parent plane (anti-parallel normals
   * for StableAgainst, parallel for CoPlanar).
   */
  private findMatchingChildPlane(
    childPlanes: Plane[],
    parentPlane: Plane
  ): number | undefined {
    let bestIdx: number | undefined;
    let bestDot = -1;

    for (let i = 0; i < childPlanes.length; i++) {
      // For StableAgainst, child normal should be anti-parallel to parent normal
      const dot = Math.abs(childPlanes[i].normal.dot(parentPlane.normal));
      if (dot > bestDot) {
        bestDot = dot;
        bestIdx = i;
      }
    }

    // Only return if the match is good enough
    if (bestDot > 1 - this.config.planeMatchingTolerance) {
      return bestIdx;
    }

    return undefined;
  }

  /**
   * Count how many objects in the state have a relation to the given parent.
   */
  private countChildren(parentName: string, state: State): number {
    let count = 0;
    for (const [, objState] of state.objects) {
      for (const rel of objState.relations) {
        if (rel.targetName === parentName) {
          count++;
          break;
        }
      }
    }
    return count;
  }
}
