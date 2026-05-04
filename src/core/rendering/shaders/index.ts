/**
 * Shaders Module - Ground Truth Shaders for Infinigen R3F
 * 
 * This module provides shader materials for generating ground truth data:
 * - Flat shading for instance segmentation
 * - Depth, normal, position passes
 * - ID encoding for segmentation
 * - Material property visualization
 * - Optical flow motion vector rendering
 * 
 * @module shaders
 */

export {
  GTFlatShadingMaterial,
  GTDepthMaterial,
  GTNormalMaterial,
  GTPositionMaterial,
  GTUVMaterial,
  GTInstanceIdMaterial,
  GTMaterialIdMaterial,
  GTAlbedoMaterial,
  GTRoughnessMaterial,
  GTMetalnessMaterial,
  GTEmissionMaterial,
  createGTMaterial,
  applyGTMaterialsToScene,
  restoreOriginalMaterials,
} from './gt-shaders';

export {
  OPTICAL_FLOW_VERTEX_SHADER,
  OPTICAL_FLOW_FRAGMENT_SHADER,
  COMPOSITE_VERTEX_SHADER,
  COMPOSITE_FLOW_FRAGMENT_SHADER,
  POSITION_ENCODE_VERTEX_SHADER,
  POSITION_ENCODE_FRAGMENT_SHADER,
  GTOpticalFlowMaterial,
  GTPositionEncodeMaterial,
} from './OpticalFlowShader';

export {
  VOLUMETRIC_VERTEX_SHADER,
  VOLUMETRIC_FOG_FRAGMENT_SHADER,
  VOLUMETRIC_SMOKE_FRAGMENT_SHADER,
  ATMOSPHERIC_SCATTERING_FRAGMENT_SHADER,
  VOLUMETRIC_COMPOSITE_FRAGMENT_SHADER,
  DEFAULT_FOG_PARAMS,
  DEFAULT_SMOKE_PARAMS,
  DEFAULT_ATMOSPHERE_PARAMS,
  type VolumetricFogUniforms,
  type VolumetricSmokeUniforms,
  type AtmosphericScatteringUniforms,
} from './VolumetricFogShader';
