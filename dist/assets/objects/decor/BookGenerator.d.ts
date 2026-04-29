/**
 * Book Generator
 *
 * Procedural book generation with configurable sizes,
 * covers, spines, and page details.
 */
import * as THREE from 'three';
import { BaseObjectGenerator } from '../utils/BaseObjectGenerator';
export interface BookConfig {
    size: 'small' | 'medium' | 'large' | 'folio';
    coverType: 'hardcover' | 'paperback' | 'leather';
    coverColor: string;
    hasDustJacket: boolean;
    spineStyle: 'flat' | 'rounded' | 'decorative';
    pageCount: number;
    thickness: number;
    condition: 'new' | 'good' | 'worn' | 'ancient';
    seed?: number;
}
export declare class BookGenerator extends BaseObjectGenerator<BookConfig> {
    protected readonly defaultParams: BookConfig;
    getDefaultConfig(): BookConfig;
    private readonly sizeDimensions;
    generate(params?: Partial<BookConfig>): THREE.Group;
    private getCoverMaterial;
    private addWearEffects;
    getVariations(count: number, _baseConfig?: Partial<BookConfig>): THREE.Object3D[];
}
//# sourceMappingURL=BookGenerator.d.ts.map