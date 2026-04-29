/**
 * BathroomFixtures - Procedural generation of bathroom fixtures
 *
 * Generates: Toilets, Sinks, Bathtubs, Showers
 * Each with multiple variations, parametric controls, and style options
 */
import { Group, Mesh } from 'three';
import { BaseObjectGenerator, BaseGeneratorConfig } from '../utils/BaseObjectGenerator';
import { BBox } from '../../../core/util/math/bbox';
export interface BathroomFixtureParams extends BaseGeneratorConfig {
    fixtureType: 'toilet' | 'sink' | 'bathtub' | 'shower';
    style: 'modern' | 'traditional' | 'minimal' | 'luxury';
    finish: 'white' | 'black' | 'stainless' | 'colored';
    faucetStyle?: 'single' | 'double' | 'wall' | 'floor';
    hasBidet?: boolean;
    tubShape?: 'rectangular' | 'oval' | 'corner' | 'freestanding';
    showerType?: 'enclosure' | 'walk-in' | 'tub-shower';
    size?: 'compact' | 'standard' | 'large';
}
export declare class BathroomFixtures extends BaseObjectGenerator<BathroomFixtureParams> {
    protected defaultParams: BathroomFixtureParams;
    getDefaultConfig(): BathroomFixtureParams;
    constructor();
    protected validateParams(params: Partial<BathroomFixtureParams>): Partial<BathroomFixtureParams>;
    generate(params?: Partial<BathroomFixtureParams>): Group;
    private generateToilet;
    private generateSink;
    private generateBathtub;
    private generateShower;
    private createToiletBowlShape;
    private createToiletSeatShape;
    private createSinkBasin;
    private createPedestal;
    private createVesselSink;
    private createSinkCabinet;
    private createCountertop;
    private createUndermountBasin;
    private createFaucet;
    private createDrainPipe;
    private createFreestandingTub;
    private createCornerTub;
    private createAlcoveTub;
    private createTubSkirt;
    private createFloorFaucet;
    private createWallFaucet;
    private createShowerEnclosure;
    private createWalkInShower;
    private createTubShowerCombo;
    private createShowerHead;
    private createFlushButton;
    private createFlushHandle;
    private createBidetAttachment;
    private getSinkType;
    private getCeramicMaterial;
    private getSeatMaterial;
    private getMetalMaterial;
    private getWoodMaterial;
    private getStoneMaterial;
    getBoundingBox(params: BathroomFixtureParams): BBox;
    getCollisionMesh(params: BathroomFixtureParams): Mesh;
    getRandomParams(): BathroomFixtureParams;
}
//# sourceMappingURL=BathroomFixtures.d.ts.map