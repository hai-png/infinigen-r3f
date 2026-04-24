/**
 * Infinigen R3F Port - Segment Division
 * Ports: core/indoor/segment.py
 */
import { Vector2 } from 'three';
export interface Segment {
    start: Vector2;
    end: Vector2;
    length: number;
    type: 'wall' | 'door' | 'window' | 'opening';
}
export interface RoomSegment {
    segments: Segment[];
    roomId: string;
}
export declare class SegmentDivider {
    divideIntoSegments(vertices: Vector2[], roomId: string, maxLen?: number): RoomSegment;
    private subdivideEdge;
    addDoor(segment: Segment, width: number, pos?: number): Segment[];
    getMidpoint(seg: Segment): Vector2;
    getNormal(seg: Segment, inward?: boolean): Vector2;
}
//# sourceMappingURL=segment.d.ts.map