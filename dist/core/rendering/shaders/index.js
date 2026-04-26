/**
 * Shaders Module - Ground Truth Shaders for Infinigen R3F
 *
 * This module provides shader materials for generating ground truth data:
 * - Flat shading for instance segmentation
 * - Depth, normal, position passes
 * - ID encoding for segmentation
 * - Material property visualization
 *
 * @module shaders
 */
export { GTFlatShadingMaterial, GTDepthMaterial, GTNormalMaterial, GTPositionMaterial, GTUVMaterial, GTInstanceIdMaterial, GTMaterialIdMaterial, GTAlbedoMaterial, GTRoughnessMaterial, GTMetalnessMaterial, GTEmissionMaterial, createGTMaterial, applyGTMaterialsToScene, restoreOriginalMaterials, } from './gt-shaders';
//# sourceMappingURL=index.js.map