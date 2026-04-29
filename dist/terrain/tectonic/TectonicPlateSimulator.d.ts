/**
 * TectonicPlateSimulator - Continental plate tectonics simulation
 *
 * Simulates plate tectonics with:
 * - Plate boundary generation
 * - Continental drift
 * - Mountain building at convergence zones
 * - Rift valley formation at divergence zones
 * - Transform fault systems
 * - Volcanic arc generation
 *
 * Ported from: infinigen/terrain/tectonic/plate_simulator.py
 */
import * as THREE from 'three';
export interface PlateConfig {
    seed: number;
    numPlates: number;
    plateVelocity: number;
    convergenceUpliftRate: number;
    divergenceSubsidenceRate: number;
    mountainBuildingIntensity: number;
    riftDepth: number;
    volcanicActivity: number;
    simulationSteps: number;
}
export interface TectonicPlate {
    id: number;
    centroid: THREE.Vector3;
    velocity: THREE.Vector3;
    rotation: number;
    angularVelocity: number;
    type: 'continental' | 'oceanic';
    thickness: number;
    density: number;
    boundaryCells: number[];
}
export interface PlateBoundary {
    plate1: number;
    plate2: number;
    type: 'convergent' | 'divergent' | 'transform';
    cells: number[];
    uplift: Float32Array;
}
export declare class TectonicPlateSimulator {
    private config;
    private noise;
    private plates;
    private boundaries;
    private plateMap;
    constructor(config?: Partial<PlateConfig>);
    /**
     * Initialize tectonic plates using Voronoi tessellation
     */
    initializePlates(resolution: number, worldSize: number): Int32Array;
    /**
     * Detect plate boundaries
     */
    detectBoundaries(plateMap: Int32Array, resolution: number): PlateBoundary[];
    /**
     * Simulate one timestep of plate movement
     */
    simulateStep(resolution: number, worldSize: number, deltaTime: number): void;
    /**
     * Apply tectonic forces to heightmap
     */
    applyTectonicForces(heightmap: Float32Array, resolution: number, worldSize: number): Float32Array;
    /**
     * Generate volcanic arcs near subduction zones
     */
    generateVolcanicArcs(heightmap: Float32Array, resolution: number, worldSize: number): {
        positions: THREE.Vector3[];
        intensities: number[];
    };
    /**
     * Run full tectonic simulation
     */
    simulate(heightmap: Float32Array, resolution: number, worldSize: number): {
        finalHeightmap: Float32Array;
        plates: TectonicPlate[];
        boundaries: PlateBoundary[];
        volcanicArcs: {
            positions: THREE.Vector3[];
            intensities: number[];
        };
    };
    /**
     * Update configuration
     */
    updateConfig(config: Partial<PlateConfig>): void;
    /**
     * Get current plate map
     */
    getPlateMap(): Int32Array | null;
}
//# sourceMappingURL=TectonicPlateSimulator.d.ts.map