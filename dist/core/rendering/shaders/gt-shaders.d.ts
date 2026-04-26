/**
 * Ground Truth Shaders for Infinigen R3F
 *
 * Implements shader materials for generating ground truth render passes:
 * - Flat shading with random colors per instance
 * - Depth visualization
 * - Normal visualization
 * - Instance ID encoding
 * - Material ID encoding
 * - UV visualization
 * - Position encoding
 *
 * Based on: infinigen/core/rendering/render.py (global_flat_shading, shader_random)
 *
 * @module shaders
 */
import { ShaderMaterial, Color, Vector3 } from 'three';
/**
 * Ground truth flat shading shader
 * Replaces all materials with random color per instance for clean segmentation
 */
export declare class GTFlatShadingMaterial extends ShaderMaterial {
    constructor(instanceId?: number);
    /**
     * Generate deterministic random color from instance ID
     */
    private generateRandomColor;
    /**
     * Hash instance ID to get reproducible random value
     */
    private hashInstanceId;
}
/**
 * Ground truth depth shader
 * Outputs camera-space depth in meters
 */
export declare class GTDepthMaterial extends ShaderMaterial {
    constructor();
    /**
     * Update near/far planes
     */
    updatePlanes(near: number, far: number): void;
}
/**
 * Ground truth normal shader
 * Outputs world-space surface normals
 */
export declare class GTNormalMaterial extends ShaderMaterial {
    constructor();
}
/**
 * Ground truth position shader
 * Outputs world-space positions encoded as RGB
 */
export declare class GTPositionMaterial extends ShaderMaterial {
    constructor(scale?: number, offset?: Vector3);
    /**
     * Update scale and offset
     */
    updateTransform(scale: number, offset: Vector3): void;
}
/**
 * Ground truth UV shader
 * Outputs texture coordinates
 */
export declare class GTUVMaterial extends ShaderMaterial {
    constructor();
}
/**
 * Ground truth instance ID shader
 * Encodes instance ID as RGBA color for segmentation
 */
export declare class GTInstanceIdMaterial extends ShaderMaterial {
    constructor(instanceId?: number);
    /**
     * Update instance ID
     */
    setInstanceId(id: number): void;
}
/**
 * Ground truth material ID shader
 * Encodes material ID for material segmentation
 */
export declare class GTMaterialIdMaterial extends ShaderMaterial {
    constructor(materialId?: number);
    /**
     * Update material ID
     */
    setMaterialId(id: number): void;
}
/**
 * Ground truth albedo shader
 * Extracts base color without lighting
 */
export declare class GTAlbedoMaterial extends ShaderMaterial {
    constructor(baseColor?: Color);
    /**
     * Update base color
     */
    setColor(color: Color): void;
}
/**
 * Ground truth roughness shader
 * Outputs roughness values
 */
export declare class GTRoughnessMaterial extends ShaderMaterial {
    constructor(roughness?: number);
    /**
     * Update roughness value
     */
    setRoughness(value: number): void;
}
/**
 * Ground truth metalness shader
 * Outputs metalness values
 */
export declare class GTMetalnessMaterial extends ShaderMaterial {
    constructor(metalness?: number);
    /**
     * Update metalness value
     */
    setMetalness(value: number): void;
}
/**
 * Ground truth emission shader
 * Outputs emissive color
 */
export declare class GTEmissionMaterial extends ShaderMaterial {
    constructor(emissive?: Color);
    /**
     * Update emissive color
     */
    setEmissive(color: Color): void;
}
/**
 * Factory function to create appropriate GT material based on pass type
 */
export declare function createGTMaterial(passType: string, params?: any): ShaderMaterial;
/**
 * Apply ground truth materials to scene objects
 */
export declare function applyGTMaterialsToScene(scene: any, passType: string, params?: any): Map<any, any>;
/**
 * Restore original materials to scene objects
 */
export declare function restoreOriginalMaterials(scene: any, originalMaterials: Map<any, any>): void;
declare const _default: {
    GTFlatShadingMaterial: typeof GTFlatShadingMaterial;
    GTDepthMaterial: typeof GTDepthMaterial;
    GTNormalMaterial: typeof GTNormalMaterial;
    GTPositionMaterial: typeof GTPositionMaterial;
    GTUVMaterial: typeof GTUVMaterial;
    GTInstanceIdMaterial: typeof GTInstanceIdMaterial;
    GTMaterialIdMaterial: typeof GTMaterialIdMaterial;
    GTAlbedoMaterial: typeof GTAlbedoMaterial;
    GTRoughnessMaterial: typeof GTRoughnessMaterial;
    GTMetalnessMaterial: typeof GTMetalnessMaterial;
    GTEmissionMaterial: typeof GTEmissionMaterial;
    createGTMaterial: typeof createGTMaterial;
    applyGTMaterialsToScene: typeof applyGTMaterialsToScene;
    restoreOriginalMaterials: typeof restoreOriginalMaterials;
};
export default _default;
//# sourceMappingURL=gt-shaders.d.ts.map