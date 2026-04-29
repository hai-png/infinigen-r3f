import * as THREE from 'three';
/**
 * Clothing configuration interface
 */
export interface ClothingConfig {
    /** Garment type */
    type: 'shirt' | 'pants' | 'dress' | 'skirt' | 'jacket' | 'coat' | 'socks' | 'underwear';
    /** Fabric material type */
    fabricType: 'cotton' | 'wool' | 'silk' | 'linen' | 'polyester' | 'denim' | 'leather';
    /** Size category */
    size: 'xs' | 's' | 'm' | 'l' | 'xl' | 'xxl';
    /** Pattern type */
    pattern?: 'solid' | 'striped' | 'checkered' | 'floral' | 'polkadot' | 'plaid';
    /** Primary color */
    primaryColor: THREE.Color;
    /** Secondary color (for patterns) */
    secondaryColor?: THREE.Color;
    /** Weathering level (0-1) */
    wearLevel?: number;
    /** Whether to generate hanger */
    includeHanger?: boolean;
    /** Fold style if not hanging */
    foldStyle?: 'neat' | 'casual' | 'crumpled';
}
/**
 * Clothing generator for creating garment meshes
 */
export declare class ClothingGenerator {
    private config;
    constructor(config: ClothingConfig);
    /**
     * Generate clothing mesh
     */
    generate(): THREE.Group;
    /**
     * Create base garment mesh based on type
     */
    private createGarmentMesh;
    /**
     * Get geometry for specific garment type
     */
    private getGarmentGeometry;
    /**
     * Create shirt geometry
     */
    private createShirtGeometry;
    /**
     * Create pants geometry
     */
    private createPantsGeometry;
    /**
     * Create dress geometry
     */
    private createDressGeometry;
    /**
     * Create skirt geometry
     */
    private createSkirtGeometry;
    /**
     * Create jacket/coat geometry
     */
    private createJacketGeometry;
    /**
     * Create socks geometry
     */
    private createSocksGeometry;
    /**
     * Create simple cloth geometry for unsupported types
     */
    private createSimpleClothGeometry;
    /**
     * Get size factor based on size config
     */
    private getSizeFactor;
    /**
     * Create fabric material
     */
    private createFabricMaterial;
    /**
     * Get fabric properties based on type
     */
    private getFabricProperties;
    /**
     * Apply pattern to material
     */
    private applyPatternToMaterial;
    /**
     * Apply wear effects to clothing
     */
    private applyWearEffects;
    /**
     * Create hanger for clothing
     */
    private createHanger;
    /**
     * Generate folded clothing pile
     */
    generateFoldedPile(count?: number): THREE.Group;
    /**
     * Create a single folded piece of clothing
     */
    private createFoldedPiece;
}
export default ClothingGenerator;
//# sourceMappingURL=ClothingGenerator.d.ts.map