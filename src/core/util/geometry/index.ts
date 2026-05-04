/**
 * Geometry Utilities Index
 *
 * Re-exports from the geometry sub-modules for convenient access.
 *
 * @module core/util/geometry
 */

// Martinez-Rueda-Feito polygon clipping
export {
  union,
  intersection,
  difference,
  xor,
  MartinezPolygonClipping,
  type Point2D,
  type Polygon2D as MartinezPolygon2D,
  type BooleanOp,
} from './MartinezPolygonClipping';

// High-level polygon operations
export {
  PolygonOps,
  type Point2D as Point2DType,
  type Polygon2D,
  type BooleanOp as BooleanOpType,
} from './Polygon2DOperations';
