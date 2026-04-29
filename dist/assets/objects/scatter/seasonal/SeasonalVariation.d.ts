/**
 * SeasonalVariation - Season changes system
 */
import * as THREE from 'three';
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export interface SeasonalConfig {
    season: Season;
    leafColorSpring: number;
    leafColorSummer: number;
    leafColorAutumn: number;
    snowCoverage: number;
}
export declare class SeasonalVariation {
    private config;
    constructor(config?: Partial<SeasonalConfig>);
    applySeason(object: THREE.Object3D, season: Season): void;
    private modifyMaterial;
    getSeasonProgress(from: Season, to: Season, t: number): SeasonalConfig;
}
//# sourceMappingURL=SeasonalVariation.d.ts.map