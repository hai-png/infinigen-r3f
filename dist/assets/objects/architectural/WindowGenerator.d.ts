/**
 * Procedural Window Generator for Infinigen R3F
 * Generates various window types: casement, double-hung, bay, skylights
 */
import { Group } from 'three';
import { BaseObjectGenerator } from '../utils/BaseObjectGenerator';
export interface WindowParams {
    width: number;
    height: number;
    depth: number;
    type: 'casement' | 'double-hung' | 'sliding' | 'bay' | 'skylight' | 'arched';
    style: 'modern' | 'traditional' | 'industrial' | 'rustic' | 'victorian';
    paneCount: number;
    hasShutters: boolean;
    frameMaterial: 'wood' | 'metal' | 'vinyl' | 'aluminum';
    glassType: 'clear' | 'frosted' | 'tinted' | 'stained';
    sillDepth: number;
}
export declare class WindowGenerator extends BaseObjectGenerator<WindowParams> {
    protected getDefaultParams(): WindowParams;
    generate(params?: Partial<WindowParams>): Group;
    private createWindow;
    private createFrame;
    private createPanes;
    private createMullions;
    private createShutters;
    private createSill;
    private getGlassMaterial;
    private getFrameColor;
    private getShutterColor;
    validateParams(params: WindowParams): boolean;
}
//# sourceMappingURL=WindowGenerator.d.ts.map