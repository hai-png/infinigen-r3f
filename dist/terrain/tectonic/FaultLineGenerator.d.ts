/**
 * Fault Line Generator
 * Generates geological fault lines and associated terrain features
 *
 * Based on original Infinigen tectonic fault generation algorithms
 */
import { Vector3 } from 'three';
export interface FaultLineParams {
    faultLength: number;
    faultDepth: number;
    dipAngle: number;
    strikeAngle: number;
    verticalSlip: number;
    horizontalSlip: number;
    slipVariation: number;
    numSegments: number;
    segmentVariation: number;
    generatePressureRidges: boolean;
    generateSagPonds: boolean;
    generateOffsetStreams: boolean;
    fractureWidth: number;
    fractureDensity: number;
}
export interface FaultSegment {
    start: Vector3;
    end: Vector3;
    dipAngle: number;
    slip: number;
    type: 'normal' | 'reverse' | 'strike-slip' | 'oblique';
}
export interface FaultLine {
    segments: FaultSegment[];
    trace: Vector3[];
    fractureZone: Vector3[];
    pressureRidges?: Vector3[][];
    sagPonds?: Vector3[];
    offsetFeatures?: OffsetFeature[];
}
export interface OffsetFeature {
    original: Vector3[];
    displaced: Vector3[];
    offsetAmount: number;
}
export declare class FaultLineGenerator {
    private params;
    constructor(params?: Partial<FaultLineParams>);
    /**
     * Update parameters
     */
    updateParams(params: Partial<FaultLineParams>): void;
    /**
     * Generate fault line system
     */
    generateFaultLine(origin: Vector3, gridSize: number, resolution: number): FaultLine;
    /**
     * Generate fracture zone around fault
     */
    private generateFractureZone;
    /**
     * Generate pressure ridges along strike-slip faults
     */
    private generatePressureRidges;
    /**
     * Generate sag ponds in releasing bends
     */
    private generateSagPonds;
    /**
     * Apply fault displacement to elevation map
     */
    applyDisplacementToElevation(elevationMap: Float32Array, faultLine: FaultLine, gridSize: number, resolution: number): void;
    /**
     * Find closest point on fault segment
     */
    private closestPointOnSegment;
    /**
     * Generate offset stream features
     */
    generateOffsetStreams(streams: Vector3[][], faultLine: FaultLine): OffsetFeature[];
    /**
     * Check if two 2D line segments intersect
     */
    private segmentsIntersect;
    /**
     * Find intersection point of two 2D lines
     */
    private findIntersection;
    /**
     * Render fault line as Three.js geometry
     */
    createFaultGeometry(faultLine: FaultLine): {
        positions: Float32Array;
        indices: Uint32Array;
    };
}
//# sourceMappingURL=FaultLineGenerator.d.ts.map