/**
 * Serving Dishes Generator
 *
 * Procedural serving dish generation with various types,
 * materials, sizes, and decorative elements.
 */
import * as THREE from 'three';
import { BaseObjectGenerator } from '../BaseObjectGenerator';
export interface ServingDishConfig {
    type: 'platter' | 'bowl' | 'tureen' | 'casserole' | 'tray' | 'pitcher';
    material: 'ceramic' | 'porcelain' | 'silver' | 'stainless' | 'glass' | 'wood';
    color: string;
    size: 'small' | 'medium' | 'large' | 'xlarge';
    hasLid: boolean;
    lidStyle: 'domed' | 'flat' | 'ornate' | 'knobbed';
    handles: 'none' | 'side' | 'loop' | 'integrated';
    pattern: 'none' | 'rim' | 'centered' | 'full' | 'embossed';
    patternColor: string;
    ornateLevel: 0 | 1 | 2 | 3;
    seed?: number;
}
export declare class ServingDishesGenerator extends BaseObjectGenerator<ServingDishConfig> {
    protected readonly defaultParams: ServingDishConfig;
    private readonly sizeDimensions;
    generate(params?: Partial<ServingDishConfig>): THREE.Group;
    private createDishBody;
    private createPlatterGeometry;
    private createBowlGeometry;
    private createTureenGeometry;
    private createCasseroleGeometry;
    private createTrayGeometry;
    private createPitcherGeometry;
    private getDishMaterial;
    private createLid;
    private createOrnateLidGeometry;
    private createKnobbedLidGeometry;
    private createHandles;
    getVariations(): ServingDishConfig[];
}
//# sourceMappingURL=ServingDishes.d.ts.map