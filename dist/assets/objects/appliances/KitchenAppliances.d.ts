/**
 * KitchenAppliances - Procedural generation of kitchen appliances
 *
 * Generates: Refrigerators, Stoves/Ovens, Dishwashers, Microwaves
 * Each with multiple variations, parametric controls, and style options
 */
import { Group } from 'three';
import { ApplianceBase, ApplianceParams } from './ApplianceBase';
export interface KitchenApplianceParams extends ApplianceParams {
    applianceType: 'refrigerator' | 'stove' | 'dishwasher' | 'microwave';
    capacity?: 'compact' | 'standard' | 'large';
    fuelType?: 'electric' | 'gas';
    hasIceMaker?: boolean;
    hasConvection?: boolean;
    burnerCount?: 4 | 5 | 6;
}
export declare class KitchenAppliances extends ApplianceBase {
    protected defaultParams: KitchenApplianceParams;
    constructor();
    generate(params?: Partial<KitchenApplianceParams>): Group;
    private generateRefrigerator;
    private generateStove;
    private generateDishwasher;
    private generateMicrowave;
    private createCooktop;
    private createControlPanel;
    private createOvenDoor;
    private createBackguard;
    private addGasBurners;
    private addElectricCoils;
    private getBurnerPositions;
    private createBurnerGrate;
    private createDrawer;
    private createIceDispenser;
    private createMicrowaveDoor;
    private createMicrowaveControls;
    private createControlStrip;
    private createKickPlate;
    private addRefrigeratorHandles;
    getRandomParams(): KitchenApplianceParams;
}
//# sourceMappingURL=KitchenAppliances.d.ts.map