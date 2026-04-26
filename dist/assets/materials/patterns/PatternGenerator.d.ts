/**
 * Procedural Pattern Generator - Stripes, checks, dots, geometric, organic
 */
import { Texture, Color } from 'three';
export interface PatternParams {
    type: 'stripes' | 'checkers' | 'dots' | 'geometric' | 'organic';
    color1: Color;
    color2: Color;
    scale: number;
    rotation: number;
    randomness: number;
}
export declare class PatternGenerator {
    generate(params: PatternParams, seed: number): Texture;
    private drawStripes;
    private drawCheckers;
    private drawDots;
    private drawGeometric;
    private drawOrganic;
    getDefaultParams(): PatternParams;
}
//# sourceMappingURL=PatternGenerator.d.ts.map