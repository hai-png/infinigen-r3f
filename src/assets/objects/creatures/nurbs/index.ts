/**
 * NURBS Body System - Non-Uniform Rational B-Spline surface generation for creatures
 *
 * This module provides both parametric body profiles and species-specific
 * NURBS control point data (ported from the original Infinigen .npy files)
 * to produce anatomically accurate creature shapes.
 *
 * Architecture:
 * - NURBSSurface: Core math engine (de Boor algorithm, tessellation)
 * - NURBSBodyProfile: Parametric profile generators for 6 species types
 * - NURBSBodyBuilder: High-level API for building complete creature bodies
 * - nurbsControlPointData: Species-specific NURBS data from original Infinigen
 */

// Core NURBS math
export {
  NURBSSurface,
  findKnotSpan,
  evaluateBasis,
  evaluateBasisDerivatives,
  createBSplineSurface,
  createNURBSSurfaceFromArrays,
} from './NURBSSurface';

// Parametric body profiles
export type {
  BodyProfileType,
  BodyProfileConfig,
} from './NURBSBodyProfile';

export {
  DEFAULT_BODY_PROFILE_CONFIG,
  createBodyProfile,
  createMammalProfile,
  createReptileProfile,
  createBirdProfile,
  createFishProfile,
  createAmphibianProfile,
  createInsectProfile,
  getDefaultConfigForType,
} from './NURBSBodyProfile';

// Body builder
export {
  NURBSBodyBuilder,
  buildCreatureBody,
  TESSELLATION_LOW,
  TESSELLATION_MEDIUM,
  TESSELLATION_HIGH,
} from './NURBSBodyBuilder';

export type {
  TessellationConfig,
  AttachmentPoint,
  NURBSBodyResult,
} from './NURBSBodyBuilder';

// Species-specific NURBS control point data
export type {
  NURBSSpeciesData,
  NURBSControlPointDataset,
} from './nurbsControlPointData';

export {
  CONTROL_POINT_DATA,
  getSpeciesData,
  getSpeciesNames,
  getCategoryData,
  hasSpeciesData,
  getSpeciesBodyProfileConfig,
} from './nurbsControlPointData';
