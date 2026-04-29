/**
 * Mountain Building System
 * Implements orogenic processes for mountain range formation
 *
 * Based on original Infinigen tectonic mountain building algorithms
 */
import { Vector3, Matrix4 } from 'three';
import { TectonicPlateSimulator } from './TectonicPlateSimulator';
export interface MountainBuildingParams {
    upliftRate: number;
    maxElevation: number;
    crustalThickness: number;
    foldWavelength: number;
    foldAmplitude: number;
    foldTightness: number;
    thrustSpacing: number;
    thrustDip: number;
    thrustDisplacement: number;
    erosionalUnloading: number;
    glacialCarving: number;
    simulationTime: number;
    timeStep: number;
}
export interface MountainRange {
    peaks: Vector3[];
    ridges: Vector3[][];
    valleys: Vector3[][];
    elevationMap: Float32Array;
    foldAxes: Vector3[];
    thrustFaults: ThrustFault[];
}
export interface ThrustFault {
    position: Vector3;
    normal: Vector3;
    dipAngle: number;
    displacement: number;
    length: number;
}
export declare class MountainBuilding {
    private params;
    private plateSimulator?;
    constructor(params?: Partial<MountainBuildingParams>);
    /**
     * Set tectonic plate simulator for coupled simulation
     */
    setPlateSimulator(simulator: TectonicPlateSimulator): void;
    /**
     * Update parameters
     */
    updateParams(params: Partial<MountainBuildingParams>): void;
    /**
     * Generate mountain range from tectonic collision
     */
    generateMountainRange(collisionZone: Vector3[], plateVelocity: Vector3, gridSize: number, resolution: number): MountainRange;
    /**
     * Apply crustal thickening from plate convergence
     */
    private applyCrustalThickening;
    /**
     * Generate fold structures in rock layers
     */
    private generateFoldStructures;
    /**
     * Create thrust fault system
     */
    private createThrustFaultSystem;
    /**
     * Apply displacement along thrust fault
     */
    private applyThrustDisplacement;
    /**
     * Apply erosional modification over geological time
     */
    private applyErosionalModification;
    /**
     * Calculate local slope at a point
     */
    private calculateSlope;
    /**
     * Extract topographic features from elevation map
     */
    private extractTopographicFeatures;
    /**
     * Extract linear features (ridges and valleys)
     */
    private extractLinearFeatures;
    /**
     * Apply mountain building to terrain mesh vertices
     */
    applyToMesh(positions: Float32Array, mountainRange: MountainRange, transform: Matrix4): void;
}
//# sourceMappingURL=MountainBuilding.d.ts.map