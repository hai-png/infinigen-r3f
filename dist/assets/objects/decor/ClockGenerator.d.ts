/**
 * ClockGenerator - Procedural clock generation with various styles
 * Generates wall clocks, mantel clocks, grandfather clocks, and digital clocks
 */
import { Group } from 'three';
import { BaseObjectGenerator } from '../utils/BaseObjectGenerator';
export type ClockStyle = 'wall' | 'mantel' | 'grandfather' | 'digital' | 'cuckoo' | 'pendulum' | 'alarm';
export type ClockMaterialType = 'wood' | 'metal' | 'plastic' | 'glass' | 'ceramic' | 'brass';
export type ClockFaceStyle = 'analog' | 'digital' | 'roman' | 'minimal' | 'ornate';
export interface ClockConfig {
    style: ClockStyle;
    materialType: ClockMaterialType;
    faceStyle: ClockFaceStyle;
    size: 'small' | 'medium' | 'large';
    hasPendulum: boolean;
    hasChime: boolean;
    ornateLevel: number;
    seed?: number;
}
export declare class ClockGenerator extends BaseObjectGenerator<ClockConfig> {
    protected readonly defaultParams: ClockConfig;
    private noise;
    constructor();
    generate(params?: Partial<ClockConfig>): Group;
    private createWallClock;
    private createMantelClock;
    private createGrandfatherClock;
    private createDigitalClock;
    private createCuckooClock;
    private createPendulumClock;
    private createAlarmClock;
    private createClockHands;
    private createPendulum;
    private getSizeMultiplier;
    private getMaterialByType;
    /**
     * Get the default configuration for clock generation
     */
    getDefaultConfig(): ClockConfig;
}
//# sourceMappingURL=ClockGenerator.d.ts.map