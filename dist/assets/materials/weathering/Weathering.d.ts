/**
 * Weathering Effects - Rust, oxidation, moss, water stains, UV damage
 */
import { Texture } from 'three';
export interface WeatheringParams {
    rustIntensity: number;
    mossCoverage: number;
    waterStains: number;
    uvDamage: number;
    dirtBuildup: number;
}
export declare class WeatheringGenerator {
    generate(params: WeatheringParams, seed: number): {
        colorMap: Texture;
        roughnessMap: Texture;
        normalMap: Texture;
    };
    private generateColorWeathering;
    private generateRoughnessWeathering;
    private generateNormalWeathering;
    getDefaultParams(): WeatheringParams;
}
//# sourceMappingURL=Weathering.d.ts.map