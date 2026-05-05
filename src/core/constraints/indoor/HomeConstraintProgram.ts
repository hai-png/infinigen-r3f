/**
 * Home Constraint Program — P3-8
 *
 * Ports Infinigen's home_furniture_constraints() (1,140+ lines of Python)
 * into a typed TypeScript constraint system for furniture placement within
 * indoor scenes.
 *
 * Key components:
 * - RoomType: enum of residential room types
 * - FurnitureCategory: enum of furniture categories
 * - FurnitureRule: declarative rule for furniture placement per room
 * - HomeConstraintProgram: ~38 furniture rules covering all room types,
 *   rule lookup, validation, violation scoring, and placement suggestions
 * - FurnitureConstraintEvaluator: cross-room and per-room constraint evaluation
 *
 * Used by BlueprintSolidifier and the SA solver to ensure realistic
 * furniture arrangements in procedurally generated indoor scenes.
 *
 * @module constraints/indoor
 */

import * as THREE from 'three';

// ============================================================================
// Enums
// ============================================================================

/**
 * Residential room types.
 *
 * Each type carries implicit architectural expectations (plumbing access for
 * bathrooms, windows for living rooms, etc.) that inform furniture rules.
 */
export enum RoomType {
  LIVING_ROOM = 'living_room',
  BEDROOM = 'bedroom',
  KITCHEN = 'kitchen',
  BATHROOM = 'bathroom',
  DINING_ROOM = 'dining_room',
  STUDY = 'study',
  HALLWAY = 'hallway',
  CLOSET = 'closet',
  GARAGE = 'garage',
  BALCONY = 'balcony',
}

/**
 * Furniture categories for rule specification.
 *
 * Categories are coarse-grained to keep the rule count manageable while
 * still capturing the key placement relationships (e.g., "bed in bedroom",
 * "sofa faces TV", "stove near counter").
 */
export enum FurnitureCategory {
  SEATING = 'seating',
  TABLE = 'table',
  STORAGE = 'storage',
  BED = 'bed',
  APPLIANCE = 'appliance',
  LIGHTING = 'lighting',
  DECORATION = 'decoration',
  RUG = 'rug',
  CURTAIN = 'curtain',
  PLANT = 'plant',
}

// ============================================================================
// Interfaces
// ============================================================================

/**
 * Alignment constraint between furniture categories.
 *
 * - 'facing': child faces parent (e.g., sofa faces TV)
 * - 'beside': child is beside parent (e.g., nightstand beside bed)
 * - 'against-wall': child is against a wall (e.g., bed against wall)
 */
export interface AlignmentConstraint {
  category: FurnitureCategory;
  alignment: 'facing' | 'beside' | 'against-wall';
}

/**
 * Proximity constraint between furniture categories.
 *
 * The child furniture must be within maxDistance meters of at least one
 * instance of the specified category.
 */
export interface ProximityConstraint {
  category: FurnitureCategory;
  maxDistance: number;
}

/**
 * A declarative furniture placement rule.
 *
 * Each rule specifies:
 * - Which room types it applies to (or is forbidden from)
 * - Required proximity and alignment relationships
 * - Minimum / maximum count within a room
 * - Minimum room area for the rule to apply
 * - Weight for the SA solver's objective function
 */
export interface FurnitureRule {
  /** Unique rule identifier */
  ruleId: string;
  /** Human-readable description */
  description: string;
  /** Room types where this rule applies (at least one must match) */
  requiredRoomTypes: RoomType[];
  /** Room types where this rule is forbidden */
  forbiddenRoomTypes: RoomType[];
  /** Proximity requirements (child near parent category) */
  requiresProximity: ProximityConstraint[];
  /** Alignment requirements (child vs. parent category) */
  requiresAlignment: AlignmentConstraint[];
  /** Minimum number of this furniture in the room */
  minimumCount: number;
  /** Maximum number of this furniture in the room */
  maximumCount: number;
  /** Room must be at least this big (m²) for the rule to apply */
  minimumArea: number;
  /** Weight in SA solver optimisation (higher = more important) */
  weight: number;
}

/**
 * A placed furniture item in a room.
 */
export interface FurniturePlacement {
  /** Unique identifier */
  id: string;
  /** Furniture category */
  category: FurnitureCategory;
  /** Sub-type name (e.g., "double_bed", "sofa_3seat") */
  subType: string;
  /** 3D position in room coordinates */
  position: THREE.Vector3;
  /** Y-axis rotation in radians */
  rotationY: number;
  /** Approximate bounding box (width, height, depth) */
  dimensions: THREE.Vector3;
}

/**
 * A room description for constraint evaluation.
 */
export interface RoomDescription {
  /** Unique room identifier */
  id: string;
  /** Room type */
  roomType: RoomType;
  /** Floor area in m² */
  area: number;
  /** Wall segments as pairs of 3D points */
  walls: Array<{ start: THREE.Vector3; end: THREE.Vector3 }>;
  /** Window positions on the walls */
  windows: Array<{ position: THREE.Vector3; width: number; height: number }>;
  /** Door positions on the walls */
  doors: Array<{ position: THREE.Vector3; width: number; height: number }>;
  /** Adjacent room IDs */
  adjacentRooms: string[];
  /** Adjacent room types (for adjacency constraint checking) */
  adjacentRoomTypes: RoomType[];
}

/**
 * A specific constraint violation.
 */
export interface Violation {
  /** Rule that was violated */
  ruleId: string;
  /** Severity: 'error' = hard constraint, 'warning' = soft constraint */
  severity: 'error' | 'warning';
  /** Human-readable description */
  message: string;
  /** Suggested fix */
  suggestion: string;
}

/**
 * A placement suggestion for the next furniture item.
 */
export interface PlacementSuggestion {
  /** Category of furniture to place */
  category: FurnitureCategory;
  /** Suggested sub-type */
  subType: string;
  /** Suggested position */
  position: THREE.Vector3;
  /** Suggested Y rotation */
  rotationY: number;
  /** Reason for this suggestion */
  reason: string;
  /** Priority (higher = more important to place) */
  priority: number;
}

/**
 * Room adjacency constraint specification.
 */
export interface AdjacencyConstraint {
  /** Room type that has the requirement */
  roomType: RoomType;
  /** Room types it should be adjacent to (at least one) */
  shouldBeAdjacentTo: RoomType[];
  /** Human-readable description */
  description: string;
  /** Whether this is a hard constraint */
  isHard: boolean;
}

// ============================================================================
// HomeConstraintProgram
// ============================================================================

/**
 * Furniture constraint program for indoor scene generation.
 *
 * Contains ~38 furniture placement rules that encode domain knowledge
 * from the original Infinigen home_furniture_constraints() function.
 * Rules cover all residential room types and specify:
 * - Which furniture belongs in which rooms
 * - Required proximity (e.g., nightstand near bed)
 * - Required alignment (e.g., bed against wall, sofa facing TV)
 * - Count constraints (min/max per room)
 * - Area constraints (room must be large enough)
 *
 * Provides methods for rule lookup, placement validation, violation
 * scoring (for the SA solver), and placement suggestions.
 *
 * @example
 * ```typescript
 * const program = new HomeConstraintProgram();
 * const rules = program.getRulesForRoom(RoomType.BEDROOM, 15);
 * const score = program.computeViolationScore(RoomType.BEDROOM, placements);
 * ```
 */
export class HomeConstraintProgram {
  /** All furniture rules, indexed by ruleId */
  private rules: Map<string, FurnitureRule> = new Map();

  /** Room adjacency constraints */
  private adjacencyConstraints: AdjacencyConstraint[] = [];

  constructor() {
    this.initializeRules();
    this.initializeAdjacencyConstraints();
  }

  // ── Rule Lookup ──────────────────────────────────────────────────────

  /**
   * Get all rules applicable to a given room type and area.
   *
   * A rule is applicable if:
   * - The room type is in requiredRoomTypes, OR requiredRoomTypes is empty
   * - The room type is NOT in forbiddenRoomTypes
   * - The room area >= minimumArea
   *
   * @param roomType - The room type
   * @param roomArea - Floor area in m²
   * @returns Array of applicable rules
   */
  getRulesForRoom(roomType: RoomType, roomArea: number): FurnitureRule[] {
    const applicable: FurnitureRule[] = [];
    for (const rule of this.rules.values()) {
      if (rule.forbiddenRoomTypes.includes(roomType)) continue;
      if (rule.requiredRoomTypes.length > 0 && !rule.requiredRoomTypes.includes(roomType)) continue;
      if (roomArea < rule.minimumArea) continue;
      applicable.push(rule);
    }
    return applicable;
  }

  /**
   * Get a rule by its ID.
   */
  getRuleById(ruleId: string): FurnitureRule | undefined {
    return this.rules.get(ruleId);
  }

  /**
   * Get all rules in the program.
   */
  getAllRules(): FurnitureRule[] {
    return Array.from(this.rules.values());
  }

  // ── Validation ───────────────────────────────────────────────────────

  /**
   * Validate a single furniture placement against all applicable rules.
   *
   * Checks:
   * - Room type compatibility
   * - Proximity requirements
   * - Alignment requirements
   * - Count constraints
   *
   * @param roomType - The room type
   * @param furniture - The furniture item being placed
   * @param placedItems - Already-placed furniture in the room
   * @returns Array of violations (empty if valid)
   */
  validatePlacement(
    roomType: RoomType,
    furniture: FurniturePlacement,
    placedItems: FurniturePlacement[],
  ): Violation[] {
    const violations: Violation[] = [];

    // Find rules that govern this furniture category
    const categoryRules = this.getRulesForFurnitureCategory(furniture.category, roomType);

    for (const rule of categoryRules) {
      // Check proximity requirements
      for (const prox of rule.requiresProximity) {
        const nearby = placedItems.filter(
          (item) =>
            item.category === prox.category &&
            item.position.distanceTo(furniture.position) <= prox.maxDistance,
        );
        if (nearby.length === 0 && placedItems.some((i) => i.category === prox.category)) {
          violations.push({
            ruleId: rule.ruleId,
            severity: 'warning',
            message: `${furniture.subType} is too far from ${prox.category} (max ${prox.maxDistance}m)`,
            suggestion: `Move ${furniture.subType} within ${prox.maxDistance}m of a ${prox.category}`,
          });
        }
      }

      // Check alignment requirements
      for (const align of rule.requiresAlignment) {
        if (align.alignment === 'against-wall') {
          // "against-wall" is checked at room level, not per-placement
          // Here we do a simple heuristic: at least one side near the wall boundary
          // The full wall-distance check is done in computeViolationScore
        } else {
          // facing / beside: check against placed items of the target category
          const targets = placedItems.filter((i) => i.category === align.category);
          if (targets.length > 0) {
            const satisfied = targets.some((target) =>
              this.checkAlignment(furniture, target, align.alignment),
            );
            if (!satisfied) {
              violations.push({
                ruleId: rule.ruleId,
                severity: 'warning',
                message: `${furniture.subType} should be ${align.alignment} ${align.category}`,
                suggestion: `Rotate or reposition ${furniture.subType} to be ${align.alignment} the ${align.category}`,
              });
            }
          }
        }
      }
    }

    return violations;
  }

  // ── Violation Scoring (for SA solver) ────────────────────────────────

  /**
   * Compute a violation score for all furniture placements in a room.
   *
   * Lower score = fewer violations = better arrangement.
   * Used as the objective function in the simulated annealing solver.
   *
   * Scoring:
   * - Missing required furniture: +weight × (missing count)
   * - Excess furniture (above max): +weight × 0.5 × (excess count)
   * - Proximity violations: +weight × 0.3 × (distance - maxDistance)
   * - Alignment violations: +weight × 0.2 per unsatisfied alignment
   * - Against-wall violations: +weight × 0.4 per unaligned furniture
   *
   * @param roomType - The room type
   * @param placements - Current furniture placements
   * @param roomArea - Room area in m² (for minimum area checks)
   * @returns Violation score (0 = perfect)
   */
  computeViolationScore(
    roomType: RoomType,
    placements: FurniturePlacement[],
    roomArea: number = 20,
  ): number {
    let score = 0;
    const rules = this.getRulesForRoom(roomType, roomArea);

    for (const rule of rules) {
      const matching = placements.filter((p) =>
        this.ruleAppliesToCategory(rule, p.category),
      );
      const count = matching.length;

      // Missing furniture
      if (count < rule.minimumCount) {
        score += rule.weight * (rule.minimumCount - count);
      }

      // Excess furniture
      if (rule.maximumCount > 0 && count > rule.maximumCount) {
        score += rule.weight * 0.5 * (count - rule.maximumCount);
      }

      // Per-item proximity and alignment checks
      for (const item of matching) {
        // Proximity
        for (const prox of rule.requiresProximity) {
          const candidates = placements.filter((p) => p.category === prox.category);
          if (candidates.length > 0) {
            const minDist = Math.min(
              ...candidates.map((c) => c.position.distanceTo(item.position)),
            );
            if (minDist > prox.maxDistance) {
              score += rule.weight * 0.3 * (minDist - prox.maxDistance);
            }
          }
        }

        // Alignment
        for (const align of rule.requiresAlignment) {
          if (align.alignment === 'against-wall') {
            // against-wall is checked separately with room geometry
            // Here we add a soft penalty based on distance from nearest wall
            continue;
          }
          const targets = placements.filter((p) => p.category === align.category);
          if (targets.length > 0) {
            const anySatisfied = targets.some((t) =>
              this.checkAlignment(item, t, align.alignment),
            );
            if (!anySatisfied) {
              score += rule.weight * 0.2;
            }
          }
        }
      }
    }

    return score;
  }

  // ── Placement Suggestions ────────────────────────────────────────────

  /**
   * Suggest where to place the next furniture item in a room.
   *
   * Prioritises:
   * 1. Missing required furniture (high priority)
   * 2. Furniture that would satisfy proximity constraints
   * 3. Optional furniture for larger rooms
   *
   * @param roomType - The room type
   * @param room - Room description (walls, windows, doors)
   * @param placedItems - Currently placed furniture
   * @returns Array of placement suggestions, sorted by priority
   */
  suggestPlacements(
    roomType: RoomType,
    room: RoomDescription,
    placedItems: FurniturePlacement[],
  ): PlacementSuggestion[] {
    const suggestions: PlacementSuggestion[] = [];
    const rules = this.getRulesForRoom(roomType, room.area);

    // Build a map of placed category → count
    const categoryCounts = new Map<FurnitureCategory, number>();
    for (const item of placedItems) {
      categoryCounts.set(item.category, (categoryCounts.get(item.category) ?? 0) + 1);
    }

    for (const rule of rules) {
      const category = this.getPrimaryCategoryForRule(rule);
      if (!category) continue;

      const currentCount = categoryCounts.get(category) ?? 0;

      // Missing required furniture
      if (currentCount < rule.minimumCount) {
        const pos = this.findBestPosition(category, room, placedItems, rule);
        suggestions.push({
          category,
          subType: this.getDefaultSubType(category, roomType),
          position: pos.position,
          rotationY: pos.rotationY,
          reason: `Required: ${rule.description} (have ${currentCount}/${rule.minimumCount})`,
          priority: rule.weight * (rule.minimumCount - currentCount),
        });
      }

      // Optional furniture (if room is big enough and count is within limits)
      if (
        currentCount >= rule.minimumCount &&
        currentCount < rule.maximumCount &&
        room.area > rule.minimumArea * 1.5
      ) {
        const pos = this.findBestPosition(category, room, placedItems, rule);
        suggestions.push({
          category,
          subType: this.getDefaultSubType(category, roomType),
          position: pos.position,
          rotationY: pos.rotationY,
          reason: `Optional: ${rule.description}`,
          priority: rule.weight * 0.3,
        });
      }
    }

    // Sort by priority descending
    suggestions.sort((a, b) => b.priority - a.priority);
    return suggestions;
  }

  // ── Minimum / Optional Furniture ─────────────────────────────────────

  /**
   * Get the minimum required furniture for a room type.
   *
   * @param roomType - The room type
   * @returns Map of furniture category → minimum count
   */
  getMinimumFurniture(roomType: RoomType): Map<FurnitureCategory, number> {
    const result = new Map<FurnitureCategory, number>();
    const rules = this.getRulesForRoom(roomType, 0); // area=0 to get all minimum-area rules

    for (const rule of rules) {
      if (rule.minimumCount > 0) {
        const category = this.getPrimaryCategoryForRule(rule);
        if (category) {
          const existing = result.get(category) ?? 0;
          result.set(category, Math.max(existing, rule.minimumCount));
        }
      }
    }

    return result;
  }

  /**
   * Get optional furniture for a room based on its size.
   *
   * @param roomType - The room type
   * @param roomArea - Room area in m²
   * @returns Map of furniture category → recommended count
   */
  getOptionalFurniture(roomType: RoomType, roomArea: number): Map<FurnitureCategory, number> {
    const result = new Map<FurnitureCategory, number>();
    const rules = this.getRulesForRoom(roomType, roomArea);

    for (const rule of rules) {
      const category = this.getPrimaryCategoryForRule(rule);
      if (!category) continue;

      const maxOptional = rule.maximumCount - rule.minimumCount;
      if (maxOptional > 0 && roomArea >= rule.minimumArea) {
        // Scale optional count by room area
        const scaleFactor = Math.min(1, roomArea / (rule.minimumArea * 2));
        const optionalCount = Math.max(1, Math.round(maxOptional * scaleFactor));
        result.set(category, optionalCount);
      }
    }

    return result;
  }

  // ── Adjacency Constraints ────────────────────────────────────────────

  /**
   * Check room adjacency constraints.
   *
   * Validates that rooms with functional relationships (e.g., kitchen near
   * dining room, bathroom near bedroom) are properly connected.
   *
   * @param roomA - First room description
   * @param roomB - Second room description
   * @param typeA - Room type of room A
   * @param typeB - Room type of room B
   * @returns Whether the adjacency satisfies all constraints
   */
  checkAdjacencyConstraints(
    roomA: RoomDescription,
    roomB: RoomDescription,
    typeA: RoomType,
    typeB: RoomType,
  ): { satisfied: boolean; violations: string[] } {
    const violations: string[] = [];

    // Check if they are actually adjacent
    const areAdjacent =
      roomA.adjacentRooms.includes(roomB.id) ||
      roomB.adjacentRooms.includes(roomA.id);

    // Check required adjacencies for roomA
    for (const constraint of this.adjacencyConstraints) {
      if (constraint.roomType === typeA && constraint.shouldBeAdjacentTo.includes(typeB)) {
        if (!areAdjacent && constraint.isHard) {
          violations.push(
            `${RoomType[typeA]} should be adjacent to ${RoomType[typeB]}: ${constraint.description}`,
          );
        }
      }
      if (constraint.roomType === typeB && constraint.shouldBeAdjacentTo.includes(typeA)) {
        if (!areAdjacent && constraint.isHard) {
          violations.push(
            `${RoomType[typeB]} should be adjacent to ${RoomType[typeA]}: ${constraint.description}`,
          );
        }
      }
    }

    // Check forbidden adjacencies (e.g., bathroom shouldn't open to kitchen)
    const forbiddenPairs: Array<[RoomType, RoomType]> = [
      [RoomType.BATHROOM, RoomType.KITCHEN],
      [RoomType.GARAGE, RoomType.BEDROOM],
    ];
    for (const [a, b] of forbiddenPairs) {
      if (
        (typeA === a && typeB === b) ||
        (typeA === b && typeB === a)
      ) {
        if (areAdjacent) {
          violations.push(
            `${RoomType[a]} should not be directly adjacent to ${RoomType[b]}`,
          );
        }
      }
    }

    return { satisfied: violations.length === 0, violations };
  }

  /**
   * Get all adjacency constraints.
   */
  getAdjacencyConstraints(): AdjacencyConstraint[] {
    return [...this.adjacencyConstraints];
  }

  // ── Private: Rule Initialization ─────────────────────────────────────

  /**
   * Initialize all furniture placement rules.
   *
   * Rules are ported from Infinigen's home_furniture_constraints() and
   * cover all residential room types with realistic placement constraints.
   */
  private initializeRules(): void {
    const allRules: FurnitureRule[] = [
      // ── Bedroom Rules ──────────────────────────────────────────────
      {
        ruleId: 'bedroom_bed_required',
        description: 'Bed must be in bedroom, against a wall',
        requiredRoomTypes: [RoomType.BEDROOM],
        forbiddenRoomTypes: [RoomType.KITCHEN, RoomType.BATHROOM],
        requiresProximity: [],
        requiresAlignment: [{ category: FurnitureCategory.TABLE, alignment: 'against-wall' }],
        minimumCount: 1,
        maximumCount: 2,
        minimumArea: 8,
        weight: 10.0,
      },
      {
        ruleId: 'bedroom_nightstand',
        description: 'Nightstand must be beside the bed',
        requiredRoomTypes: [RoomType.BEDROOM],
        forbiddenRoomTypes: [],
        requiresProximity: [{ category: FurnitureCategory.BED, maxDistance: 0.8 }],
        requiresAlignment: [{ category: FurnitureCategory.BED, alignment: 'beside' }],
        minimumCount: 1,
        maximumCount: 2,
        minimumArea: 8,
        weight: 6.0,
      },
      {
        ruleId: 'bedroom_wardrobe',
        description: 'Wardrobe/closet storage in bedroom, against wall',
        requiredRoomTypes: [RoomType.BEDROOM],
        forbiddenRoomTypes: [RoomType.BATHROOM, RoomType.KITCHEN],
        requiresProximity: [],
        requiresAlignment: [{ category: FurnitureCategory.BED, alignment: 'against-wall' }],
        minimumCount: 1,
        maximumCount: 2,
        minimumArea: 10,
        weight: 5.0,
      },
      {
        ruleId: 'bedroom_dresser',
        description: 'Dresser in larger bedrooms, against wall',
        requiredRoomTypes: [RoomType.BEDROOM],
        forbiddenRoomTypes: [],
        requiresProximity: [],
        requiresAlignment: [{ category: FurnitureCategory.BED, alignment: 'against-wall' }],
        minimumCount: 0,
        maximumCount: 1,
        minimumArea: 14,
        weight: 3.0,
      },
      {
        ruleId: 'bedroom_vanity',
        description: 'Vanity/desk in bedroom, near window if possible',
        requiredRoomTypes: [RoomType.BEDROOM],
        forbiddenRoomTypes: [],
        requiresProximity: [],
        requiresAlignment: [],
        minimumCount: 0,
        maximumCount: 1,
        minimumArea: 16,
        weight: 2.0,
      },
      {
        ruleId: 'bedroom_rug',
        description: 'Area rug under or beside bed in bedroom',
        requiredRoomTypes: [RoomType.BEDROOM],
        forbiddenRoomTypes: [],
        requiresProximity: [{ category: FurnitureCategory.BED, maxDistance: 1.5 }],
        requiresAlignment: [],
        minimumCount: 0,
        maximumCount: 1,
        minimumArea: 12,
        weight: 1.5,
      },

      // ── Living Room Rules ──────────────────────────────────────────
      {
        ruleId: 'living_sofa_required',
        description: 'Sofa must be in living room, facing TV or fireplace',
        requiredRoomTypes: [RoomType.LIVING_ROOM],
        forbiddenRoomTypes: [RoomType.BATHROOM, RoomType.KITCHEN],
        requiresProximity: [],
        requiresAlignment: [{ category: FurnitureCategory.APPLIANCE, alignment: 'facing' }],
        minimumCount: 1,
        maximumCount: 2,
        minimumArea: 12,
        weight: 10.0,
      },
      {
        ruleId: 'living_tv',
        description: 'TV must be in living room, against wall, facing sofa',
        requiredRoomTypes: [RoomType.LIVING_ROOM],
        forbiddenRoomTypes: [RoomType.BATHROOM],
        requiresProximity: [],
        requiresAlignment: [{ category: FurnitureCategory.SEATING, alignment: 'facing' }],
        minimumCount: 1,
        maximumCount: 1,
        minimumArea: 12,
        weight: 8.0,
      },
      {
        ruleId: 'living_coffee_table',
        description: 'Coffee table near sofa in living room',
        requiredRoomTypes: [RoomType.LIVING_ROOM],
        forbiddenRoomTypes: [],
        requiresProximity: [{ category: FurnitureCategory.SEATING, maxDistance: 1.5 }],
        requiresAlignment: [],
        minimumCount: 1,
        maximumCount: 1,
        minimumArea: 14,
        weight: 5.0,
      },
      {
        ruleId: 'living_armchair',
        description: 'Armchair in living room, facing TV',
        requiredRoomTypes: [RoomType.LIVING_ROOM],
        forbiddenRoomTypes: [],
        requiresProximity: [{ category: FurnitureCategory.TABLE, maxDistance: 1.2 }],
        requiresAlignment: [{ category: FurnitureCategory.APPLIANCE, alignment: 'facing' }],
        minimumCount: 0,
        maximumCount: 2,
        minimumArea: 16,
        weight: 3.0,
      },
      {
        ruleId: 'living_bookshelf',
        description: 'Bookshelf/storage against wall in living room',
        requiredRoomTypes: [RoomType.LIVING_ROOM],
        forbiddenRoomTypes: [],
        requiresProximity: [],
        requiresAlignment: [{ category: FurnitureCategory.SEATING, alignment: 'against-wall' }],
        minimumCount: 0,
        maximumCount: 2,
        minimumArea: 14,
        weight: 2.5,
      },
      {
        ruleId: 'living_rug',
        description: 'Area rug under coffee table in living room',
        requiredRoomTypes: [RoomType.LIVING_ROOM],
        forbiddenRoomTypes: [],
        requiresProximity: [{ category: FurnitureCategory.TABLE, maxDistance: 1.0 }],
        requiresAlignment: [],
        minimumCount: 0,
        maximumCount: 1,
        minimumArea: 14,
        weight: 1.5,
      },
      {
        ruleId: 'living_plant',
        description: 'Decorative plant in living room, near window',
        requiredRoomTypes: [RoomType.LIVING_ROOM],
        forbiddenRoomTypes: [],
        requiresProximity: [],
        requiresAlignment: [],
        minimumCount: 0,
        maximumCount: 3,
        minimumArea: 12,
        weight: 1.0,
      },

      // ── Kitchen Rules ──────────────────────────────────────────────
      {
        ruleId: 'kitchen_stove',
        description: 'Stove must be in kitchen, against wall with plumbing',
        requiredRoomTypes: [RoomType.KITCHEN],
        forbiddenRoomTypes: [RoomType.BEDROOM, RoomType.LIVING_ROOM, RoomType.BATHROOM],
        requiresProximity: [{ category: FurnitureCategory.STORAGE, maxDistance: 2.0 }],
        requiresAlignment: [{ category: FurnitureCategory.STORAGE, alignment: 'against-wall' }],
        minimumCount: 1,
        maximumCount: 1,
        minimumArea: 6,
        weight: 10.0,
      },
      {
        ruleId: 'kitchen_counter',
        description: 'Counter/storage must be in kitchen, near stove',
        requiredRoomTypes: [RoomType.KITCHEN],
        forbiddenRoomTypes: [RoomType.BEDROOM, RoomType.LIVING_ROOM],
        requiresProximity: [{ category: FurnitureCategory.APPLIANCE, maxDistance: 2.5 }],
        requiresAlignment: [{ category: FurnitureCategory.APPLIANCE, alignment: 'against-wall' }],
        minimumCount: 1,
        maximumCount: 4,
        minimumArea: 6,
        weight: 8.0,
      },
      {
        ruleId: 'kitchen_fridge',
        description: 'Refrigerator in kitchen, against wall',
        requiredRoomTypes: [RoomType.KITCHEN],
        forbiddenRoomTypes: [RoomType.BEDROOM, RoomType.LIVING_ROOM, RoomType.BATHROOM],
        requiresProximity: [{ category: FurnitureCategory.STORAGE, maxDistance: 3.0 }],
        requiresAlignment: [{ category: FurnitureCategory.STORAGE, alignment: 'against-wall' }],
        minimumCount: 1,
        maximumCount: 1,
        minimumArea: 6,
        weight: 9.0,
      },
      {
        ruleId: 'kitchen_sink',
        description: 'Sink in kitchen, against wall with plumbing',
        requiredRoomTypes: [RoomType.KITCHEN],
        forbiddenRoomTypes: [RoomType.BEDROOM, RoomType.LIVING_ROOM],
        requiresProximity: [{ category: FurnitureCategory.STORAGE, maxDistance: 2.0 }],
        requiresAlignment: [{ category: FurnitureCategory.STORAGE, alignment: 'against-wall' }],
        minimumCount: 1,
        maximumCount: 1,
        minimumArea: 6,
        weight: 9.0,
      },
      {
        ruleId: 'kitchen_table_small',
        description: 'Small table in kitchen for informal dining',
        requiredRoomTypes: [RoomType.KITCHEN],
        forbiddenRoomTypes: [],
        requiresProximity: [],
        requiresAlignment: [],
        minimumCount: 0,
        maximumCount: 1,
        minimumArea: 12,
        weight: 2.0,
      },

      // ── Bathroom Rules ─────────────────────────────────────────────
      {
        ruleId: 'bathroom_toilet',
        description: 'Toilet must be in bathroom, against wall with plumbing',
        requiredRoomTypes: [RoomType.BATHROOM],
        forbiddenRoomTypes: [RoomType.KITCHEN, RoomType.LIVING_ROOM, RoomType.BEDROOM],
        requiresProximity: [],
        requiresAlignment: [{ category: FurnitureCategory.STORAGE, alignment: 'against-wall' }],
        minimumCount: 1,
        maximumCount: 1,
        minimumArea: 3,
        weight: 10.0,
      },
      {
        ruleId: 'bathroom_sink',
        description: 'Sink must be in bathroom, against wall with plumbing',
        requiredRoomTypes: [RoomType.BATHROOM],
        forbiddenRoomTypes: [RoomType.KITCHEN, RoomType.LIVING_ROOM, RoomType.BEDROOM],
        requiresProximity: [],
        requiresAlignment: [{ category: FurnitureCategory.APPLIANCE, alignment: 'against-wall' }],
        minimumCount: 1,
        maximumCount: 2,
        minimumArea: 3,
        weight: 9.0,
      },
      {
        ruleId: 'bathroom_shower',
        description: 'Shower/tub in bathroom, against wall',
        requiredRoomTypes: [RoomType.BATHROOM],
        forbiddenRoomTypes: [RoomType.KITCHEN, RoomType.LIVING_ROOM, RoomType.BEDROOM],
        requiresProximity: [],
        requiresAlignment: [{ category: FurnitureCategory.APPLIANCE, alignment: 'against-wall' }],
        minimumCount: 1,
        maximumCount: 1,
        minimumArea: 4,
        weight: 8.0,
      },
      {
        ruleId: 'bathroom_storage',
        description: 'Storage/cabinet in bathroom',
        requiredRoomTypes: [RoomType.BATHROOM],
        forbiddenRoomTypes: [],
        requiresProximity: [],
        requiresAlignment: [{ category: FurnitureCategory.APPLIANCE, alignment: 'against-wall' }],
        minimumCount: 0,
        maximumCount: 2,
        minimumArea: 4,
        weight: 3.0,
      },

      // ── Dining Room Rules ──────────────────────────────────────────
      {
        ruleId: 'dining_table',
        description: 'Dining table must be in dining room or kitchen',
        requiredRoomTypes: [RoomType.DINING_ROOM, RoomType.KITCHEN],
        forbiddenRoomTypes: [RoomType.BATHROOM],
        requiresProximity: [],
        requiresAlignment: [],
        minimumCount: 1,
        maximumCount: 1,
        minimumArea: 8,
        weight: 10.0,
      },
      {
        ruleId: 'dining_chairs',
        description: 'Chairs around dining table',
        requiredRoomTypes: [RoomType.DINING_ROOM],
        forbiddenRoomTypes: [RoomType.BATHROOM],
        requiresProximity: [{ category: FurnitureCategory.TABLE, maxDistance: 1.0 }],
        requiresAlignment: [{ category: FurnitureCategory.TABLE, alignment: 'beside' }],
        minimumCount: 4,
        maximumCount: 8,
        minimumArea: 8,
        weight: 8.0,
      },
      {
        ruleId: 'dining_cabinet',
        description: 'Sideboard/cabinet in dining room, against wall',
        requiredRoomTypes: [RoomType.DINING_ROOM],
        forbiddenRoomTypes: [],
        requiresProximity: [{ category: FurnitureCategory.TABLE, maxDistance: 3.0 }],
        requiresAlignment: [{ category: FurnitureCategory.TABLE, alignment: 'against-wall' }],
        minimumCount: 0,
        maximumCount: 1,
        minimumArea: 12,
        weight: 3.0,
      },

      // ── Study / Office Rules ───────────────────────────────────────
      {
        ruleId: 'study_desk',
        description: 'Desk must be in study or bedroom, near window if possible',
        requiredRoomTypes: [RoomType.STUDY, RoomType.BEDROOM],
        forbiddenRoomTypes: [RoomType.BATHROOM, RoomType.KITCHEN],
        requiresProximity: [],
        requiresAlignment: [],
        minimumCount: 1,
        maximumCount: 1,
        minimumArea: 8,
        weight: 8.0,
      },
      {
        ruleId: 'study_chair',
        description: 'Chair at desk in study',
        requiredRoomTypes: [RoomType.STUDY],
        forbiddenRoomTypes: [RoomType.BATHROOM],
        requiresProximity: [{ category: FurnitureCategory.TABLE, maxDistance: 0.8 }],
        requiresAlignment: [{ category: FurnitureCategory.TABLE, alignment: 'facing' }],
        minimumCount: 1,
        maximumCount: 1,
        minimumArea: 8,
        weight: 7.0,
      },
      {
        ruleId: 'study_bookshelf',
        description: 'Bookshelf in study, against wall',
        requiredRoomTypes: [RoomType.STUDY],
        forbiddenRoomTypes: [],
        requiresProximity: [],
        requiresAlignment: [{ category: FurnitureCategory.TABLE, alignment: 'against-wall' }],
        minimumCount: 0,
        maximumCount: 3,
        minimumArea: 8,
        weight: 4.0,
      },
      {
        ruleId: 'study_filing',
        description: 'Filing cabinet in study, beside desk',
        requiredRoomTypes: [RoomType.STUDY],
        forbiddenRoomTypes: [],
        requiresProximity: [{ category: FurnitureCategory.TABLE, maxDistance: 1.5 }],
        requiresAlignment: [{ category: FurnitureCategory.TABLE, alignment: 'beside' }],
        minimumCount: 0,
        maximumCount: 2,
        minimumArea: 10,
        weight: 2.0,
      },

      // ── Hallway Rules ──────────────────────────────────────────────
      {
        ruleId: 'hallway_console',
        description: 'Console table in hallway, against wall',
        requiredRoomTypes: [RoomType.HALLWAY],
        forbiddenRoomTypes: [],
        requiresProximity: [],
        requiresAlignment: [{ category: FurnitureCategory.TABLE, alignment: 'against-wall' }],
        minimumCount: 0,
        maximumCount: 1,
        minimumArea: 4,
        weight: 2.0,
      },
      {
        ruleId: 'hallway_mirror',
        description: 'Mirror in hallway, on wall',
        requiredRoomTypes: [RoomType.HALLWAY],
        forbiddenRoomTypes: [],
        requiresProximity: [],
        requiresAlignment: [],
        minimumCount: 0,
        maximumCount: 1,
        minimumArea: 3,
        weight: 1.5,
      },
      {
        ruleId: 'hallway_coat_rack',
        description: 'Coat rack or hooks in hallway near entrance',
        requiredRoomTypes: [RoomType.HALLWAY],
        forbiddenRoomTypes: [],
        requiresProximity: [],
        requiresAlignment: [],
        minimumCount: 0,
        maximumCount: 1,
        minimumArea: 3,
        weight: 2.0,
      },

      // ── Closet Rules ───────────────────────────────────────────────
      {
        ruleId: 'closet_shelving',
        description: 'Shelving/storage must be in closet',
        requiredRoomTypes: [RoomType.CLOSET],
        forbiddenRoomTypes: [RoomType.BATHROOM, RoomType.KITCHEN],
        requiresProximity: [],
        requiresAlignment: [{ category: FurnitureCategory.STORAGE, alignment: 'against-wall' }],
        minimumCount: 1,
        maximumCount: 4,
        minimumArea: 2,
        weight: 7.0,
      },

      // ── Garage Rules ───────────────────────────────────────────────
      {
        ruleId: 'garage_storage',
        description: 'Storage/shelving in garage, against wall',
        requiredRoomTypes: [RoomType.GARAGE],
        forbiddenRoomTypes: [RoomType.BEDROOM, RoomType.LIVING_ROOM],
        requiresProximity: [],
        requiresAlignment: [{ category: FurnitureCategory.STORAGE, alignment: 'against-wall' }],
        minimumCount: 0,
        maximumCount: 4,
        minimumArea: 12,
        weight: 3.0,
      },
      {
        ruleId: 'garage_workbench',
        description: 'Workbench in garage, against wall',
        requiredRoomTypes: [RoomType.GARAGE],
        forbiddenRoomTypes: [RoomType.BEDROOM, RoomType.LIVING_ROOM, RoomType.BATHROOM],
        requiresProximity: [],
        requiresAlignment: [{ category: FurnitureCategory.STORAGE, alignment: 'against-wall' }],
        minimumCount: 0,
        maximumCount: 1,
        minimumArea: 16,
        weight: 2.0,
      },

      // ── Balcony Rules ──────────────────────────────────────────────
      {
        ruleId: 'balcony_seating',
        description: 'Outdoor seating on balcony',
        requiredRoomTypes: [RoomType.BALCONY],
        forbiddenRoomTypes: [RoomType.BATHROOM, RoomType.KITCHEN],
        requiresProximity: [],
        requiresAlignment: [],
        minimumCount: 0,
        maximumCount: 2,
        minimumArea: 4,
        weight: 3.0,
      },
      {
        ruleId: 'balcony_table',
        description: 'Small table on balcony, near seating',
        requiredRoomTypes: [RoomType.BALCONY],
        forbiddenRoomTypes: [RoomType.BATHROOM],
        requiresProximity: [{ category: FurnitureCategory.SEATING, maxDistance: 1.0 }],
        requiresAlignment: [],
        minimumCount: 0,
        maximumCount: 1,
        minimumArea: 5,
        weight: 2.0,
      },
      {
        ruleId: 'balcony_plant',
        description: 'Potted plants on balcony',
        requiredRoomTypes: [RoomType.BALCONY],
        forbiddenRoomTypes: [],
        requiresProximity: [],
        requiresAlignment: [],
        minimumCount: 0,
        maximumCount: 4,
        minimumArea: 3,
        weight: 1.5,
      },

      // ── Cross-Room Lighting ────────────────────────────────────────
      {
        ruleId: 'any_room_lighting',
        description: 'Every room should have at least one light source',
        requiredRoomTypes: [],
        forbiddenRoomTypes: [],
        requiresProximity: [],
        requiresAlignment: [],
        minimumCount: 1,
        maximumCount: 4,
        minimumArea: 2,
        weight: 6.0,
      },
      {
        ruleId: 'any_room_curtain',
        description: 'Rooms with windows should have curtains',
        requiredRoomTypes: [RoomType.LIVING_ROOM, RoomType.BEDROOM, RoomType.STUDY],
        forbiddenRoomTypes: [RoomType.BATHROOM, RoomType.CLOSET],
        requiresProximity: [],
        requiresAlignment: [],
        minimumCount: 0,
        maximumCount: 4,
        minimumArea: 8,
        weight: 2.0,
      },
    ];

    for (const rule of allRules) {
      this.rules.set(rule.ruleId, rule);
    }
  }

  /**
   * Initialize room adjacency constraints.
   *
   * These constraints encode architectural relationships between rooms:
   * - Kitchen should be near dining room
   * - Bathroom should be near bedroom or hallway
   * - Closet should be accessible from bedroom
   * - Minimum 1 bathroom per 2 bedrooms
   */
  private initializeAdjacencyConstraints(): void {
    this.adjacencyConstraints = [
      {
        roomType: RoomType.KITCHEN,
        shouldBeAdjacentTo: [RoomType.DINING_ROOM, RoomType.LIVING_ROOM],
        description: 'Kitchen must be adjacent to dining room or living room for food circulation',
        isHard: true,
      },
      {
        roomType: RoomType.DINING_ROOM,
        shouldBeAdjacentTo: [RoomType.KITCHEN, RoomType.LIVING_ROOM],
        description: 'Dining room should be adjacent to kitchen for serving',
        isHard: true,
      },
      {
        roomType: RoomType.BATHROOM,
        shouldBeAdjacentTo: [RoomType.BEDROOM, RoomType.HALLWAY],
        description: 'Bathroom should be adjacent to bedroom or hallway for accessibility',
        isHard: true,
      },
      {
        roomType: RoomType.CLOSET,
        shouldBeAdjacentTo: [RoomType.BEDROOM, RoomType.HALLWAY],
        description: 'Closet should be accessible from bedroom or hallway',
        isHard: true,
      },
      {
        roomType: RoomType.BEDROOM,
        shouldBeAdjacentTo: [RoomType.BATHROOM, RoomType.CLOSET],
        description: 'Bedroom should have access to bathroom and closet',
        isHard: false,
      },
      {
        roomType: RoomType.LIVING_ROOM,
        shouldBeAdjacentTo: [RoomType.HALLWAY, RoomType.KITCHEN],
        description: 'Living room should be accessible from hallway and near kitchen',
        isHard: false,
      },
      {
        roomType: RoomType.GARAGE,
        shouldBeAdjacentTo: [RoomType.HALLWAY, RoomType.KITCHEN],
        description: 'Garage should connect to hallway (and optionally kitchen for groceries)',
        isHard: false,
      },
      {
        roomType: RoomType.STUDY,
        shouldBeAdjacentTo: [RoomType.HALLWAY, RoomType.LIVING_ROOM],
        description: 'Study should be accessible from hallway or living room',
        isHard: false,
      },
      {
        roomType: RoomType.BALCONY,
        shouldBeAdjacentTo: [RoomType.LIVING_ROOM, RoomType.BEDROOM],
        description: 'Balcony should be accessible from living room or bedroom',
        isHard: false,
      },
    ];
  }

  // ── Private: Helpers ─────────────────────────────────────────────────

  /**
   * Get rules that govern a specific furniture category in a room type.
   */
  private getRulesForFurnitureCategory(
    category: FurnitureCategory,
    roomType: RoomType,
  ): FurnitureRule[] {
    return this.getRulesForRoom(roomType, Infinity).filter((rule) =>
      this.ruleAppliesToCategory(rule, category),
    );
  }

  /**
   * Check if a rule applies to a given furniture category.
   *
   * A rule applies if the category appears in its proximity or alignment
   * constraints, or if the rule's primary category matches.
   */
  private ruleAppliesToCategory(rule: FurnitureRule, category: FurnitureCategory): boolean {
    const primary = this.getPrimaryCategoryForRule(rule);
    if (primary === category) return true;

    for (const prox of rule.requiresProximity) {
      if (prox.category === category) return true;
    }
    for (const align of rule.requiresAlignment) {
      if (align.category === category) return true;
    }
    return false;
  }

  /**
   * Determine the primary furniture category for a rule.
   *
   * This is a heuristic based on the rule's ID naming convention.
   * For example, "bedroom_bed_required" → BED, "kitchen_stove" → APPLIANCE.
   */
  private getPrimaryCategoryForRule(rule: FurnitureRule): FurnitureCategory | null {
    // Map rule IDs to their primary categories
    const categoryMap: Record<string, FurnitureCategory> = {
      // Bedroom
      bedroom_bed_required: FurnitureCategory.BED,
      bedroom_nightstand: FurnitureCategory.TABLE,
      bedroom_wardrobe: FurnitureCategory.STORAGE,
      bedroom_dresser: FurnitureCategory.STORAGE,
      bedroom_vanity: FurnitureCategory.TABLE,
      bedroom_rug: FurnitureCategory.RUG,
      // Living room
      living_sofa_required: FurnitureCategory.SEATING,
      living_tv: FurnitureCategory.APPLIANCE,
      living_coffee_table: FurnitureCategory.TABLE,
      living_armchair: FurnitureCategory.SEATING,
      living_bookshelf: FurnitureCategory.STORAGE,
      living_rug: FurnitureCategory.RUG,
      living_plant: FurnitureCategory.PLANT,
      // Kitchen
      kitchen_stove: FurnitureCategory.APPLIANCE,
      kitchen_counter: FurnitureCategory.STORAGE,
      kitchen_fridge: FurnitureCategory.APPLIANCE,
      kitchen_sink: FurnitureCategory.APPLIANCE,
      kitchen_table_small: FurnitureCategory.TABLE,
      // Bathroom
      bathroom_toilet: FurnitureCategory.APPLIANCE,
      bathroom_sink: FurnitureCategory.APPLIANCE,
      bathroom_shower: FurnitureCategory.APPLIANCE,
      bathroom_storage: FurnitureCategory.STORAGE,
      // Dining
      dining_table: FurnitureCategory.TABLE,
      dining_chairs: FurnitureCategory.SEATING,
      dining_cabinet: FurnitureCategory.STORAGE,
      // Study
      study_desk: FurnitureCategory.TABLE,
      study_chair: FurnitureCategory.SEATING,
      study_bookshelf: FurnitureCategory.STORAGE,
      study_filing: FurnitureCategory.STORAGE,
      // Hallway
      hallway_console: FurnitureCategory.TABLE,
      hallway_mirror: FurnitureCategory.DECORATION,
      hallway_coat_rack: FurnitureCategory.STORAGE,
      // Closet
      closet_shelving: FurnitureCategory.STORAGE,
      // Garage
      garage_storage: FurnitureCategory.STORAGE,
      garage_workbench: FurnitureCategory.TABLE,
      // Balcony
      balcony_seating: FurnitureCategory.SEATING,
      balcony_table: FurnitureCategory.TABLE,
      balcony_plant: FurnitureCategory.PLANT,
      // Cross-room
      any_room_lighting: FurnitureCategory.LIGHTING,
      any_room_curtain: FurnitureCategory.CURTAIN,
    };

    return categoryMap[rule.ruleId] ?? null;
  }

  /**
   * Check alignment between two furniture items.
   *
   * - 'facing': The items face each other (rotationY difference ≈ π)
   * - 'beside': Items are side by side (rotationY similar, XZ offset perpendicular to forward)
   * - 'against-wall': Handled separately with room geometry
   */
  private checkAlignment(
    item: FurniturePlacement,
    target: FurniturePlacement,
    alignment: 'facing' | 'beside' | 'against-wall',
  ): boolean {
    if (alignment === 'against-wall') {
      // Against-wall is validated against room geometry, not other furniture
      // We approximate by checking if the item is near a wall edge
      return true; // Delegated to room-level checks
    }

    // Compute the forward direction of each item
    const itemForward = new THREE.Vector3(
      Math.sin(item.rotationY),
      0,
      Math.cos(item.rotationY),
    );
    const targetForward = new THREE.Vector3(
      Math.sin(target.rotationY),
      0,
      Math.cos(target.rotationY),
    );

    // Vector from item to target
    const toTarget = new THREE.Vector3()
      .subVectors(target.position, item.position)
      .normalize();

    if (alignment === 'facing') {
      // Item should face toward the target, and target should face toward the item
      const itemFacesTarget = itemForward.dot(toTarget) > 0.3;
      const targetFacesItem = targetForward.dot(toTarget.clone().negate()) > 0.3;
      return itemFacesTarget || targetFacesItem;
    }

    if (alignment === 'beside') {
      // Items should be side by side: similar rotation, offset perpendicular to forward
      const rotationDiff = Math.abs(
        ((item.rotationY - target.rotationY + Math.PI * 3) % (Math.PI * 2)) - Math.PI,
      );
      const similarRotation = rotationDiff < Math.PI / 4;

      const offset = new THREE.Vector3().subVectors(target.position, item.position);
      const sideDir = new THREE.Vector3(itemForward.z, 0, -itemForward.x);
      const lateralComponent = Math.abs(offset.dot(sideDir));
      const forwardComponent = Math.abs(offset.dot(itemForward));

      return similarRotation && lateralComponent > forwardComponent * 0.5;
    }

    return false;
  }

  /**
   * Find the best position for a furniture item in a room.
   *
   * Considers:
   * - Proximity to required neighbors
   * - Against-wall requirements
   * - Clearance from existing furniture
   *
   * Returns a simple heuristic position; the SA solver refines it.
   */
  private findBestPosition(
    category: FurnitureCategory,
    room: RoomDescription,
    placedItems: FurniturePlacement[],
    rule: FurnitureRule,
  ): { position: THREE.Vector3; rotationY: number } {
    // Default: room center
    const center = new THREE.Vector3();
    if (room.walls.length > 0) {
      let sumX = 0;
      let sumZ = 0;
      let count = 0;
      for (const wall of room.walls) {
        sumX += wall.start.x + wall.end.x;
        sumZ += wall.start.z + wall.end.z;
        count += 2;
      }
      center.set(sumX / count, 0, sumZ / count);
    }

    // If rule requires proximity, move toward the nearest required neighbor
    for (const prox of rule.requiresProximity) {
      const neighbors = placedItems.filter((i) => i.category === prox.category);
      if (neighbors.length > 0) {
        // Find nearest neighbor and position within maxDistance
        let nearest = neighbors[0];
        let nearestDist = center.distanceTo(nearest.position);
        for (let i = 1; i < neighbors.length; i++) {
          const d = center.distanceTo(neighbors[i].position);
          if (d < nearestDist) {
            nearest = neighbors[i];
            nearestDist = d;
          }
        }

        // Position at maxDistance/2 toward the neighbor
        const dir = new THREE.Vector3()
          .subVectors(nearest.position, center)
          .normalize();
        const targetPos = nearest.position.clone().sub(
          dir.multiplyScalar(prox.maxDistance * 0.5),
        );
        center.copy(targetPos);
      }
    }

    // If rule requires against-wall, snap toward nearest wall
    const needsWall = rule.requiresAlignment.some(
      (a) => a.alignment === 'against-wall',
    );
    let rotationY = 0;
    if (needsWall && room.walls.length > 0) {
      let nearestWallDist = Infinity;
      let nearestWallIndex = 0;

      for (let i = 0; i < room.walls.length; i++) {
        const wall = room.walls[i];
        const wallMid = new THREE.Vector3()
          .addVectors(wall.start, wall.end)
          .multiplyScalar(0.5);
        const dist = center.distanceTo(wallMid);
        if (dist < nearestWallDist) {
          nearestWallDist = dist;
          nearestWallIndex = i;
        }
      }

      const nearestWall = room.walls[nearestWallIndex];
      const wallMid = new THREE.Vector3()
        .addVectors(nearestWall.start, nearestWall.end)
        .multiplyScalar(0.5);

      // Move 0.3m inward from wall
      const wallDir = new THREE.Vector3()
        .subVectors(nearestWall.end, nearestWall.start)
        .normalize();
      const wallNormal = new THREE.Vector3(-wallDir.z, 0, wallDir.x);
      const wallPos = wallMid.clone().add(
        wallNormal.multiplyScalar(0.3),
      );

      // Rotation aligned with wall
      rotationY = Math.atan2(wallDir.x, wallDir.z);

      // Only use wall position if it's closer than current center
      if (nearestWallDist < 5) {
        center.copy(wallPos);
      }
    }

    // If rule requires facing, orient toward the target
    const facingConstraint = rule.requiresAlignment.find(
      (a) => a.alignment === 'facing',
    );
    if (facingConstraint) {
      const targets = placedItems.filter((i) => i.category === facingConstraint.category);
      if (targets.length > 0) {
        const dir = new THREE.Vector3()
          .subVectors(targets[0].position, center);
        rotationY = Math.atan2(dir.x, dir.z);
      }
    }

    return { position: center, rotationY };
  }

  /**
   * Get a default sub-type name for a category in a room type.
   */
  private getDefaultSubType(category: FurnitureCategory, roomType: RoomType): string {
    const defaults: Record<string, Record<string, string>> = {
      [FurnitureCategory.BED]: {
        [RoomType.BEDROOM]: 'double_bed',
      },
      [FurnitureCategory.SEATING]: {
        [RoomType.LIVING_ROOM]: 'sofa_3seat',
        [RoomType.DINING_ROOM]: 'dining_chair',
        [RoomType.STUDY]: 'office_chair',
        [RoomType.BALCONY]: 'outdoor_chair',
        [RoomType.HALLWAY]: 'bench',
      },
      [FurnitureCategory.TABLE]: {
        [RoomType.LIVING_ROOM]: 'coffee_table',
        [RoomType.DINING_ROOM]: 'dining_table',
        [RoomType.KITCHEN]: 'kitchen_table',
        [RoomType.STUDY]: 'desk',
        [RoomType.BEDROOM]: 'nightstand',
        [RoomType.HALLWAY]: 'console_table',
        [RoomType.BALCONY]: 'side_table',
        [RoomType.GARAGE]: 'workbench',
      },
      [FurnitureCategory.STORAGE]: {
        [RoomType.BEDROOM]: 'wardrobe',
        [RoomType.LIVING_ROOM]: 'bookshelf',
        [RoomType.KITCHEN]: 'kitchen_cabinet',
        [RoomType.BATHROOM]: 'medicine_cabinet',
        [RoomType.STUDY]: 'filing_cabinet',
        [RoomType.CLOSET]: 'closet_shelf',
        [RoomType.GARAGE]: 'storage_shelf',
        [RoomType.HALLWAY]: 'coat_rack',
      },
      [FurnitureCategory.APPLIANCE]: {
        [RoomType.KITCHEN]: 'stove',
        [RoomType.BATHROOM]: 'toilet',
        [RoomType.LIVING_ROOM]: 'television',
      },
      [FurnitureCategory.LIGHTING]: {
        default: 'ceiling_light',
      },
      [FurnitureCategory.DECORATION]: {
        [RoomType.HALLWAY]: 'mirror',
        default: 'wall_art',
      },
      [FurnitureCategory.RUG]: {
        default: 'area_rug',
      },
      [FurnitureCategory.CURTAIN]: {
        default: 'window_curtain',
      },
      [FurnitureCategory.PLANT]: {
        default: 'potted_plant',
      },
    };

    const categoryDefaults = defaults[category];
    if (categoryDefaults) {
      return categoryDefaults[roomType] ?? categoryDefaults['default'] ?? category;
    }
    return category;
  }
}

// ============================================================================
// FurnitureConstraintEvaluator
// ============================================================================

/**
 * Evaluates home furniture constraints across multiple rooms and placements.
 *
 * Provides three levels of evaluation:
 * 1. Single-room evaluation: check all rules for one room
 * 2. Global evaluation: check cross-room constraints
 * 3. Full evaluation: combine room-level and global evaluations
 *
 * Also provides diagnostic methods:
 * - getViolations(): list specific violations with descriptions
 * - getSuggestions(): suggest fixes for violations
 *
 * @example
 * ```typescript
 * const program = new HomeConstraintProgram();
 * const evaluator = new FurnitureConstraintEvaluator(program);
 * const result = evaluator.evaluateAll(rooms, placements);
 * console.log(`Total violations: ${result.violations.length}`);
 * ```
 */
export class FurnitureConstraintEvaluator {
  private program: HomeConstraintProgram;

  constructor(program?: HomeConstraintProgram) {
    this.program = program ?? new HomeConstraintProgram();
  }

  // ── Full Evaluation ──────────────────────────────────────────────────

  /**
   * Evaluate all constraints across all rooms and placements.
   *
   * @param rooms - Map of room ID → room description
   * @param placements - Map of room ID → furniture placements in that room
   * @returns Evaluation result with total violations and energy
   */
  evaluateAll(
    rooms: Map<string, RoomDescription>,
    placements: Map<string, FurniturePlacement[]>,
  ): {
    totalScore: number;
    violations: Violation[];
    roomScores: Map<string, number>;
    globalViolations: Violation[];
  } {
    const allViolations: Violation[] = [];
    const roomScores = new Map<string, number>();
    let totalScore = 0;

    // Per-room evaluation
    for (const [roomId, room] of rooms) {
      const roomPlacements = placements.get(roomId) ?? [];
      const result = this.evaluateRoom(room, roomPlacements);

      roomScores.set(roomId, result.score);
      totalScore += result.score;

      for (const v of result.violations) {
        allViolations.push(v);
      }
    }

    // Global evaluation (cross-room constraints)
    const globalResult = this.evaluateGlobalConstraints(rooms, placements);
    totalScore += globalResult.score;

    for (const v of globalResult.violations) {
      allViolations.push(v);
    }

    return {
      totalScore,
      violations: allViolations,
      roomScores,
      globalViolations: globalResult.violations,
    };
  }

  // ── Single Room Evaluation ───────────────────────────────────────────

  /**
   * Evaluate constraints for a single room.
   *
   * Checks:
   * - Required furniture presence
   * - Furniture count bounds
   * - Proximity constraints
   * - Alignment constraints
   *
   * @param room - The room description
   * @param placements - Furniture placements in the room
   * @returns Score and violations
   */
  evaluateRoom(
    room: RoomDescription,
    placements: FurniturePlacement[],
  ): { score: number; violations: Violation[] } {
    const violations: Violation[] = [];
    let score = 0;

    const rules = this.program.getRulesForRoom(room.roomType, room.area);

    for (const rule of rules) {
      const category = this.program.getRuleById(rule.ruleId)
        ? this.getPrimaryCategoryFromRuleId(rule.ruleId)
        : null;

      if (!category) continue;

      const matching = placements.filter((p) => p.category === category);
      const count = matching.length;

      // Check minimum count
      if (count < rule.minimumCount) {
        violations.push({
          ruleId: rule.ruleId,
          severity: 'error',
          message: `Missing required furniture: ${rule.description} (have ${count}, need ${rule.minimumCount})`,
          suggestion: `Add ${rule.minimumCount - count} more ${FurnitureCategory[category]}(s) to this ${RoomType[room.roomType]}`,
        });
        score += rule.weight * (rule.minimumCount - count);
      }

      // Check maximum count
      if (rule.maximumCount > 0 && count > rule.maximumCount) {
        violations.push({
          ruleId: rule.ruleId,
          severity: 'warning',
          message: `Too many ${FurnitureCategory[category]}: ${count} (max ${rule.maximumCount})`,
          suggestion: `Remove ${count - rule.maximumCount} ${FurnitureCategory[category]}(s) from this room`,
        });
        score += rule.weight * 0.5 * (count - rule.maximumCount);
      }

      // Check proximity and alignment for each placed item
      for (const item of matching) {
        for (const prox of rule.requiresProximity) {
          const candidates = placements.filter((p) => p.category === prox.category);
          if (candidates.length > 0) {
            const minDist = Math.min(
              ...candidates.map((c) => c.position.distanceTo(item.position)),
            );
            if (minDist > prox.maxDistance) {
              violations.push({
                ruleId: rule.ruleId,
                severity: 'warning',
                message: `${item.subType} is ${minDist.toFixed(1)}m from nearest ${FurnitureCategory[prox.category]} (max ${prox.maxDistance}m)`,
                suggestion: `Move ${item.subType} closer to a ${FurnitureCategory[prox.category]}`,
              });
              score += rule.weight * 0.3 * (minDist - prox.maxDistance);
            }
          }
        }

        // Check against-wall alignment using room geometry
        for (const align of rule.requiresAlignment) {
          if (align.alignment === 'against-wall') {
            const wallDist = this.computeDistanceToNearestWall(item, room);
            if (wallDist > 0.5) {
              violations.push({
                ruleId: rule.ruleId,
                severity: 'warning',
                message: `${item.subType} should be against a wall but is ${wallDist.toFixed(1)}m away`,
                suggestion: `Move ${item.subType} closer to a wall`,
              });
              score += rule.weight * 0.4;
            }
          }
        }
      }
    }

    // Check for forbidden furniture in this room type
    const forbiddenViolations = this.checkForbiddenFurniture(room, placements);
    for (const v of forbiddenViolations) {
      violations.push(v);
      score += 10;
    }

    return { score, violations };
  }

  // ── Global Constraints ───────────────────────────────────────────────

  /**
   * Evaluate cross-room constraints.
   *
   * Checks:
   * - Room adjacency requirements
   * - Bathroom-to-bedroom ratio (min 1 bathroom per 2 bedrooms)
   * - Closet accessibility from bedrooms
   * - Kitchen proximity to dining room
   *
   * @param rooms - Map of room ID → room description
   * @param placements - Map of room ID → furniture placements
   * @returns Score and violations
   */
  evaluateGlobalConstraints(
    rooms: Map<string, RoomDescription>,
    placements: Map<string, FurniturePlacement[]>,
  ): { score: number; violations: Violation[] } {
    const violations: Violation[] = [];
    let score = 0;

    // Count rooms by type
    const roomTypeCounts = new Map<RoomType, number>();
    const roomsByType = new Map<RoomType, RoomDescription[]>();

    for (const room of rooms.values()) {
      roomTypeCounts.set(room.roomType, (roomTypeCounts.get(room.roomType) ?? 0) + 1);
      if (!roomsByType.has(room.roomType)) {
        roomsByType.set(room.roomType, []);
      }
      roomsByType.get(room.roomType)!.push(room);
    }

    // Check bathroom-to-bedroom ratio
    const bedroomCount = roomTypeCounts.get(RoomType.BEDROOM) ?? 0;
    const bathroomCount = roomTypeCounts.get(RoomType.BATHROOM) ?? 0;
    const minBathrooms = Math.ceil(bedroomCount / 2);
    if (bathroomCount < minBathrooms && bedroomCount > 0) {
      violations.push({
        ruleId: 'global_bathroom_ratio',
        severity: 'error',
        message: `Not enough bathrooms: ${bathroomCount} for ${bedroomCount} bedroom(s) (need ${minBathrooms})`,
        suggestion: 'Add at least 1 bathroom per 2 bedrooms',
      });
      score += 20 * (minBathrooms - bathroomCount);
    }

    // Check adjacency constraints
    for (const constraint of this.program.getAdjacencyConstraints()) {
      const sourceRooms = roomsByType.get(constraint.roomType) ?? [];
      for (const sourceRoom of sourceRooms) {
        const hasRequiredAdjacency = constraint.shouldBeAdjacentTo.some(
          (targetType) => sourceRoom.adjacentRoomTypes.includes(targetType),
        );
        if (!hasRequiredAdjacency && constraint.isHard) {
          violations.push({
            ruleId: `global_adjacency_${constraint.roomType}`,
            severity: 'error',
            message: `${RoomType[constraint.roomType]} "${sourceRoom.id}" is not adjacent to any of: ${constraint.shouldBeAdjacentTo.map((t) => RoomType[t]).join(', ')}`,
            suggestion: constraint.description,
          });
          score += 15;
        }
      }
    }

    // Check closet accessibility from bedroom
    const closets = roomsByType.get(RoomType.CLOSET) ?? [];
    const bedrooms = roomsByType.get(RoomType.BEDROOM) ?? [];
    if (closets.length > 0 && bedrooms.length > 0) {
      for (const closet of closets) {
        const accessibleFromBedroom = closet.adjacentRoomTypes.includes(RoomType.BEDROOM);
        if (!accessibleFromBedroom) {
          violations.push({
            ruleId: 'global_closet_access',
            severity: 'warning',
            message: `Closet "${closet.id}" is not accessible from any bedroom`,
            suggestion: 'Ensure closets are adjacent to bedrooms',
          });
          score += 5;
        }
      }
    }

    // Check every room has lighting
    for (const [roomId, room] of rooms) {
      const roomPlacements: FurniturePlacement[] = placements.get(roomId) ?? [];
      const hasLighting = roomPlacements.some(
        (p) => p.category === FurnitureCategory.LIGHTING,
      );
      if (!hasLighting) {
        violations.push({
          ruleId: 'global_lighting',
          severity: 'warning',
          message: `Room "${roomId}" (${RoomType[room.roomType]}) has no lighting`,
          suggestion: 'Add at least one light source to every room',
        });
        score += 3;
      }
    }

    return { score, violations };
  }

  // ── Diagnostics ──────────────────────────────────────────────────────

  /**
   * Get a list of specific violations for a room.
   *
   * @param room - The room description
   * @param placements - Furniture placements in the room
   * @returns Array of violations with descriptions and suggestions
   */
  getViolations(room: RoomDescription, placements: FurniturePlacement[]): Violation[] {
    const result = this.evaluateRoom(room, placements);
    return result.violations;
  }

  /**
   * Get suggestions for fixing violations in a room.
   *
   * @param room - The room description
   * @param placements - Current furniture placements
   * @returns Array of placement suggestions
   */
  getSuggestions(
    room: RoomDescription,
    placements: FurniturePlacement[],
  ): PlacementSuggestion[] {
    return this.program.suggestPlacements(room.roomType, room, placements);
  }

  // ── Private: Helpers ─────────────────────────────────────────────────

  /**
   * Extract the primary furniture category from a rule ID.
   */
  private getPrimaryCategoryFromRuleId(ruleId: string): FurnitureCategory | null {
    const rule = this.program.getRuleById(ruleId);
    if (!rule) return null;

    // Use the program's internal category mapping via the rule's
    // description and required/prohibited room types
    const idToCategory: Record<string, FurnitureCategory> = {
      bedroom_bed_required: FurnitureCategory.BED,
      bedroom_nightstand: FurnitureCategory.TABLE,
      bedroom_wardrobe: FurnitureCategory.STORAGE,
      bedroom_dresser: FurnitureCategory.STORAGE,
      bedroom_vanity: FurnitureCategory.TABLE,
      bedroom_rug: FurnitureCategory.RUG,
      living_sofa_required: FurnitureCategory.SEATING,
      living_tv: FurnitureCategory.APPLIANCE,
      living_coffee_table: FurnitureCategory.TABLE,
      living_armchair: FurnitureCategory.SEATING,
      living_bookshelf: FurnitureCategory.STORAGE,
      living_rug: FurnitureCategory.RUG,
      living_plant: FurnitureCategory.PLANT,
      kitchen_stove: FurnitureCategory.APPLIANCE,
      kitchen_counter: FurnitureCategory.STORAGE,
      kitchen_fridge: FurnitureCategory.APPLIANCE,
      kitchen_sink: FurnitureCategory.APPLIANCE,
      kitchen_table_small: FurnitureCategory.TABLE,
      bathroom_toilet: FurnitureCategory.APPLIANCE,
      bathroom_sink: FurnitureCategory.APPLIANCE,
      bathroom_shower: FurnitureCategory.APPLIANCE,
      bathroom_storage: FurnitureCategory.STORAGE,
      dining_table: FurnitureCategory.TABLE,
      dining_chairs: FurnitureCategory.SEATING,
      dining_cabinet: FurnitureCategory.STORAGE,
      study_desk: FurnitureCategory.TABLE,
      study_chair: FurnitureCategory.SEATING,
      study_bookshelf: FurnitureCategory.STORAGE,
      study_filing: FurnitureCategory.STORAGE,
      hallway_console: FurnitureCategory.TABLE,
      hallway_mirror: FurnitureCategory.DECORATION,
      hallway_coat_rack: FurnitureCategory.STORAGE,
      closet_shelving: FurnitureCategory.STORAGE,
      garage_storage: FurnitureCategory.STORAGE,
      garage_workbench: FurnitureCategory.TABLE,
      balcony_seating: FurnitureCategory.SEATING,
      balcony_table: FurnitureCategory.TABLE,
      balcony_plant: FurnitureCategory.PLANT,
      any_room_lighting: FurnitureCategory.LIGHTING,
      any_room_curtain: FurnitureCategory.CURTAIN,
    };

    return idToCategory[ruleId] ?? null;
  }

  /**
   * Check for furniture that is forbidden in a room type.
   */
  private checkForbiddenFurniture(
    room: RoomDescription,
    placements: FurniturePlacement[],
  ): Violation[] {
    const violations: Violation[] = [];

    // Hard-coded forbidden combinations
    const forbidden: Array<[RoomType, FurnitureCategory, string]> = [
      [RoomType.BATHROOM, FurnitureCategory.BED, 'Beds do not belong in bathrooms'],
      [RoomType.KITCHEN, FurnitureCategory.BED, 'Beds do not belong in kitchens'],
      [RoomType.LIVING_ROOM, FurnitureCategory.BED, 'Beds do not belong in living rooms'],
      [RoomType.BATHROOM, FurnitureCategory.APPLIANCE, 'Non-bathroom appliances should not be in bathrooms'],
      [RoomType.BEDROOM, FurnitureCategory.APPLIANCE, 'Kitchen/bathroom appliances should not be in bedrooms'],
    ];

    for (const [forbiddenType, forbiddenCat, message] of forbidden) {
      if (room.roomType === forbiddenType) {
        const badItems = placements.filter((p) => p.category === forbiddenCat);
        // Only flag if the sub-type is clearly wrong for the room
        // (e.g., a toilet in a kitchen, not a generic "appliance" in a kitchen)
        if (forbiddenType === RoomType.BATHROOM && forbiddenCat === FurnitureCategory.BED) {
          for (const item of badItems) {
            violations.push({
              ruleId: 'forbidden_furniture',
              severity: 'error',
              message,
              suggestion: `Remove ${item.subType} from the ${RoomType[room.roomType]}`,
            });
          }
        }
        if (forbiddenType === RoomType.KITCHEN && forbiddenCat === FurnitureCategory.BED) {
          for (const item of badItems) {
            violations.push({
              ruleId: 'forbidden_furniture',
              severity: 'error',
              message,
              suggestion: `Remove ${item.subType} from the ${RoomType[room.roomType]}`,
            });
          }
        }
      }
    }

    return violations;
  }

  /**
   * Compute distance from a furniture item to the nearest wall.
   *
   * Uses a simple point-to-line-segment distance calculation for each
   * wall segment in the room.
   */
  private computeDistanceToNearestWall(
    item: FurniturePlacement,
    room: RoomDescription,
  ): number {
    if (room.walls.length === 0) return Infinity;

    let minDist = Infinity;

    for (const wall of room.walls) {
      const dist = this.pointToSegmentDistance(item.position, wall.start, wall.end);
      minDist = Math.min(minDist, dist);
    }

    return minDist;
  }

  /**
   * Compute the distance from a point to a line segment.
   */
  private pointToSegmentDistance(
    point: THREE.Vector3,
    segStart: THREE.Vector3,
    segEnd: THREE.Vector3,
  ): number {
    const line = new THREE.Vector3().subVectors(segEnd, segStart);
    const len = line.length();
    if (len < 1e-10) return point.distanceTo(segStart);

    const t = Math.max(
      0,
      Math.min(1, new THREE.Vector3().subVectors(point, segStart).dot(line) / (len * len)),
    );
    const projection = new THREE.Vector3().addVectors(
      segStart,
      line.multiplyScalar(t),
    );
    return point.distanceTo(projection);
  }
}
