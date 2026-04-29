/**
 * LaundryAppliances - Procedural generation of laundry appliances
 *
 * Generates: Washing Machines, Dryers, Washer-Dryer Combos
 * Each with multiple variations, parametric controls, and style options
 */
import { Group } from 'three';
import { ApplianceBase, ApplianceParams } from './ApplianceBase';
export interface LaundryApplianceParams extends ApplianceParams {
    applianceType: 'washer' | 'dryer' | 'combo';
    capacity?: 'compact' | 'standard' | 'large';
    loadType?: 'front' | 'top';
    hasSteam?: boolean;
    hasSmartControls?: boolean;
    drumSize?: number;
}
export declare class LaundryAppliances extends ApplianceBase<LaundryApplianceParams> {
    getDefaultConfig(): LaundryApplianceParams;
    constructor();
    generate(params?: Partial<LaundryApplianceParams>): Group;
    private generateWasher;
    private generateDryer;
    private generateCombo;
    private createFrontLoadDoor;
    private createDryerDoor;
    private createTopLid;
    private createDrumInterior;
    private createWasherControls;
    private createTopLoadControls;
    private createDryerControls;
    private createDetergentDrawer;
    private createWasherSection;
    private createDryerSection;
    private createDivider;
    private createLintIndicator;
    private createVentConnection;
    private addApplianceFeet;
    getRandomParams(): LaundryApplianceParams;
}
//# sourceMappingURL=LaundryAppliances.d.ts.map