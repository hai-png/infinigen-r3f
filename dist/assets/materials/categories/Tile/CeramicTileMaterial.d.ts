import * as THREE from 'three';
export interface CeramicTileMaterialConfig {
    baseColor: THREE.Color;
    groutColor: THREE.Color;
    tileSize: number;
    groutWidth: number;
    roughness: number;
    enablePattern: boolean;
    pattern: 'straight' | 'herringbone' | 'basketweave' | 'diagonal';
    enableWear: boolean;
    wearAmount: number;
}
export declare class CeramicTileMaterial {
    private config;
    private material;
    constructor(config?: Partial<CeramicTileMaterialConfig>);
    private createMaterial;
    private generateTileTexture;
    private transformHerringbone;
    private transformBasketweave;
    private transformDiagonal;
    getMaterial(): THREE.MeshStandardMaterial;
    static createPreset(preset: 'bathroom' | 'kitchen' | 'floor' | 'mosaic' | 'vintage'): CeramicTileMaterial;
}
//# sourceMappingURL=CeramicTileMaterial.d.ts.map