/**
 * Procedural Door Generator for Infinigen R3F
 * Generates various door types: interior, exterior, sliding, french, revolving
 */
import { Group } from 'three';
import { BaseObjectGenerator } from '../utils/BaseObjectGenerator';
export interface DoorParams {
    width: number;
    height: number;
    thickness: number;
    type: 'interior' | 'exterior' | 'sliding' | 'french' | 'revolving';
    style: 'modern' | 'traditional' | 'industrial' | 'rustic' | 'victorian';
    hasGlass: boolean;
    panelCount: number;
    handleType: 'knob' | 'lever' | 'pull';
    frameWidth: number;
    frameDepth: number;
    materialType: 'wood' | 'metal' | 'glass' | 'composite';
}
export declare class DoorGenerator extends BaseObjectGenerator<DoorParams> {
    protected getDefaultParams(): DoorParams;
    generate(params?: Partial<DoorParams>): Group;
    private createDoor;
    private createFrame;
    private createPanels;
    private createHandle;
    private createHinges;
    private createGlassPanels;
    private addDecorativePanels;
    private createSlidingHandle;
    private getFrameMaterial;
    private getPanelMaterial;
    validateParams(params: DoorParams): boolean;
}
//# sourceMappingURL=DoorGenerator.d.ts.map