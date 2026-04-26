/**
 * StaircaseGenerator - Procedural staircase generation
 *
 * Generates various staircase types: straight, L-shaped, U-shaped, spiral, curved
 * with configurable treads, risers, stringers, and landing platforms.
 *
 * @category Architectural
 * @subcategory Vertical Circulation
 */
import { Group } from 'three';
import { BaseObjectGenerator } from '../utils/BaseObjectGenerator';
export interface StaircaseParams {
    totalHeight: number;
    totalRun: number;
    width: number;
    numSteps: number;
    stairType: 'straight' | 'L' | 'U' | 'spiral' | 'curved';
    hasLanding: boolean;
    landingPosition?: number;
    hasStringers: boolean;
    stringerType: 'closed' | 'open' | 'mono';
    hasRisers: boolean;
    treadThickness: number;
    riserThickness: number;
    style: 'modern' | 'traditional' | 'industrial' | 'rustic' | 'minimalist';
    treadMaterial: string;
    riserMaterial: string;
    stringerMaterial: string;
    railingAttachment: boolean;
}
export declare class StaircaseGenerator extends BaseObjectGenerator<StaircaseParams> {
    constructor(seed?: number);
    getDefaultParams(): StaircaseParams;
    generate(params?: Partial<StaircaseParams>): Group;
    private generateStraightStairs;
    private addStraightStringers;
    private generateLStairs;
    private generateUStairs;
    private generateSpiralStairs;
    private generateCurvedStairs;
    private addRailingAttachments;
    getStylePresets(): Record<string, Partial<StaircaseParams>>;
}
//# sourceMappingURL=StaircaseGenerator.d.ts.map