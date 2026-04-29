/**
 * CutleryGenerator - Procedural cutlery generation (forks, knives, spoons)
 *
 * Features:
 * - Forks: dinner, salad, dessert, serving with tine variations
 * - Knives: dinner, steak, butter, chef with blade profiles
 * - Spoons: tablespoon, teaspoon, soup, serving with bowl depths
 * - Handle patterns: smooth, fluted, ornate, modern
 * - Material slots for silver, stainless steel, gold plating
 */
import { Group } from 'three';
import { BaseObjectGenerator, BaseGeneratorConfig } from '../utils/BaseObjectGenerator';
export interface CutleryParams extends BaseGeneratorConfig {
    type: 'fork' | 'knife' | 'spoon';
    style: 'dinner' | 'salad' | 'dessert' | 'serving' | 'steak' | 'butter' | 'chef' | 'tablespoon' | 'teaspoon' | 'soup';
    handlePattern: 'smooth' | 'fluted' | 'ornate' | 'modern';
    material?: string;
    scale?: number;
    seed?: number;
}
export declare class CutleryGenerator extends BaseObjectGenerator<CutleryParams> {
    protected readonly defaultParams: CutleryParams;
    getDefaultConfig(): CutleryParams;
    generate(params?: Partial<CutleryParams>): Group;
    private createFork;
    private createKnife;
    private createSpoon;
    private mergeGroupToMesh;
    getVariations(): CutleryParams[];
}
//# sourceMappingURL=CutleryGenerator.d.ts.map