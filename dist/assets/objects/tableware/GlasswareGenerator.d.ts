/**
 * GlasswareGenerator - Procedural glassware generation (glasses, bottles)
 */
import { Group } from 'three';
import { BaseObjectGenerator, BaseGeneratorConfig } from '../utils/BaseObjectGenerator';
export interface GlasswareParams extends BaseGeneratorConfig {
    type: 'wine' | 'beer' | 'water' | 'champagne' | 'whiskey' | 'cocktail' | 'bottle_wine' | 'bottle_beer' | 'bottle_spirit';
    style: 'elegant' | 'casual' | 'modern' | 'vintage';
    size: 'small' | 'medium' | 'large';
    material?: string;
    seed?: number;
}
export declare class GlasswareGenerator extends BaseObjectGenerator<GlasswareParams> {
    protected readonly defaultParams: GlasswareParams;
    getDefaultConfig(): GlasswareParams;
    generate(params?: Partial<GlasswareParams>): Group;
    private createGlass;
    private createBottle;
    private mergeGroupToMesh;
    getVariations(): GlasswareParams[];
}
//# sourceMappingURL=GlasswareGenerator.d.ts.map