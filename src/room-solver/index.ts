/**
 * Room Solver Module - Indoor Scene Layout Generation
 * 
 * Exports room graph and floor plan generation components.
 */

// Core room graph representation
export {
  RoomGraph,
  RoomGraphData,
  getRoomType,
  getRoomLevel,
  generateRoomName,
  getValidRooms
} from './base.js';

// Floor plan generation (to be implemented)
// export {
//   FloorPlan,
//   generateFloorPlan
// } from './floor-plan.js';

// Contour operations (to be implemented)
// export {
//   Contour,
//   simplifyContour
// } from './contour.js';

// Segment operations (to be implemented)
// export {
//   Segment,
//   divideSegment
// } from './segment.js';

// Room solver main class (to be implemented)
// export {
//   RoomSolver,
//   RoomSolverConfig
// } from './solver.js';
