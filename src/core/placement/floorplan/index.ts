/**
 * Floor Plan Generator Module
 *
 * Procedural floor plan generation ported from infinigen's room solver.
 * Generates 2D layouts with adjacency constraints and converts to 3D Three.js geometry.
 *
 * @example
 * ```ts
 * import { createFloorPlan, RoomType, BuildingStyle } from './floorplan';
 *
 * const plan = createFloorPlan({
 *   seed: 42,
 *   totalArea: 100,
 *   roomCount: 5,
 *   roomTypes: [RoomType.LivingRoom, RoomType.Bedroom, RoomType.Kitchen, RoomType.Bathroom, RoomType.Hallway],
 *   style: BuildingStyle.Apartment,
 * });
 *
 * // Add 3D geometry to scene
 * if (plan.group) scene.add(plan.group);
 *
 * // Access room data
 * for (const room of plan.rooms) {
 *   console.log(`${room.name}: ${room.area}m²`);
 * }
 * ```
 */

// Types and enums
export {
  RoomType,
  BuildingStyle,
  ConnectionType,
  SurfaceType,
} from './types';

export type {
  Polygon2D,
  LineSegment2D,
  Bounds2D,
  AdjacencyConstraint,
  RoomSizeConstraint,
  BuildingConstraints,
  Wall,
  WallOpening,
  Door,
  Window,
  Room,
  FloorPlan,
  FloorPlanParams,
  RoomMaterialPreset,
} from './types';

export {
  BUILDING_DEFAULTS,
  ROOM_TYPICAL_AREAS,
  ROOM_COLORS,
  ROOM_MATERIALS,
} from './types';

// Generator
export {
  FloorPlanGenerator,
  createFloorPlan,
  decorateFloorPlan,
} from './FloorPlanGenerator';

export type {
  FurniturePlacement,
} from './FloorPlanGenerator';
