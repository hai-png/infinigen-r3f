/**
 * Material Blending System - Multi-material mixing, gradient blends, mask-based blending
 */
import { Material, Texture } from 'three';
export interface BlendParams {
    material1: Material;
    material2: Material;
    blendFactor: number;
    blendType: 'linear' | 'gradient' | 'noise' | 'mask';
    noiseScale: number;
    gradientDirection: 'horizontal' | 'vertical' | 'radial';
}
export declare class MaterialBlender {
    blend(params: BlendParams, seed: number): {
        blendedMaterial: Material;
        blendMap: Texture;
    };
    private generateBlendMap;
    private generateLinearBlend;
    private generateGradientBlend;
    private generateNoiseBlend;
    private generateMaskBlend;
    getDefaultParams(material1: Material, material2: Material): BlendParams;
}
//# sourceMappingURL=MaterialBlender.d.ts.map