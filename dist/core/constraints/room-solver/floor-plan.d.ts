/**
 * Infinigen R3F Port - Floor Plan Generation
 * Ports: core/indoor/floor_plan.py
 */
import { RoomGraph } from './base.js';
import { Vector2 } from 'three';
export interface FloorPlanParams {
    minRoomArea: number;
    maxRoomArea: number;
    aspectRatioMin: number;
    aspectRatioMax: number;
}
export interface RoomContour {
    vertices: Vector2[];
    area: number;
    centroid: Vector2;
    roomId: string;
}
export declare class FloorPlanGenerator {
    private params;
    constructor(params?: Partial<FloorPlanParams>);
    generate(roomGraph: RoomGraph): RoomContour[];
    private generateRoomContour;
    private validateContour;
}
//# sourceMappingURL=floor-plan.d.ts.map