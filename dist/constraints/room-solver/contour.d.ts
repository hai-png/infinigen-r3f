/**
 * Infinigen R3F Port - Contour Operations
 * Ports: core/indoor/contour.py
 */
import { Vector2 } from 'three';
export interface Contour {
    vertices: Vector2[];
    holes: Contour[];
    isHole: boolean;
}
export declare class ContourOperations {
    simplify(vertices: Vector2[], epsilon?: number): Vector2[];
    private perpDistance;
    convexHull(points: Vector2[]): Vector2[];
    private cross;
    area(vertices: Vector2[]): number;
    containsPoint(vertices: Vector2[], point: Vector2): boolean;
}
//# sourceMappingURL=contour.d.ts.map