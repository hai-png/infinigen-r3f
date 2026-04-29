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
import { Vector3 } from 'three';
import { NoiseUtils } from '../utils/NoiseUtils';
export class TectonicPlateSimulator {
    constructor(config) {
        this.plates = [];
        this.boundaries = [];
        this.plateMap = null;
        this.config = {
            seed: Math.random() * 10000,
            numPlates: 8,
            plateVelocity: 0.5,
            convergenceUpliftRate: 0.1,
            divergenceSubsidenceRate: 0.05,
            mountainBuildingIntensity: 2.0,
            riftDepth: 50.0,
            volcanicActivity: 0.7,
            simulationSteps: 100,
            ...config,
        };
        this.noise = new NoiseUtils(this.config.seed);
    }
    /**
     * Initialize tectonic plates using Voronoi tessellation
     */
    initializePlates(resolution, worldSize) {
        const plateMap = new Int32Array(resolution * resolution);
        const cellSize = worldSize / resolution;
        // Generate plate centroids
        this.plates = [];
        for (let i = 0; i < this.config.numPlates; i++) {
            const angle = (i / this.config.numPlates) * Math.PI * 2;
            const radius = (Math.random() * 0.6 + 0.2) * worldSize / 2;
            const centroid = new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
            // Random velocity direction
            const velocityAngle = Math.random() * Math.PI * 2;
            const velocity = new THREE.Vector3(Math.cos(velocityAngle), 0, Math.sin(velocityAngle)).multiplyScalar(this.config.plateVelocity * (0.5 + Math.random() * 0.5));
            // Determine plate type based on size and position
            const isContinental = Math.random() > 0.4;
            this.plates.push({
                id: i,
                centroid,
                velocity,
                rotation: 0,
                angularVelocity: (Math.random() - 0.5) * 0.01,
                type: isContinental ? 'continental' : 'oceanic',
                thickness: isContinental ? 35 : 7, // km
                density: isContinental ? 2.7 : 3.0, // g/cm³
                boundaryCells: [],
            });
        }
        // Assign each cell to nearest plate (Voronoi)
        for (let row = 0; row < resolution; row++) {
            for (let col = 0; col < resolution; col++) {
                const idx = row * resolution + col;
                const x = col * cellSize - worldSize / 2;
                const z = row * cellSize - worldSize / 2;
                const pos = new THREE.Vector3(x, 0, z);
                let minDist = Infinity;
                let nearestPlate = 0;
                for (let p = 0; p < this.plates.length; p++) {
                    const dist = pos.distanceTo(this.plates[p].centroid);
                    if (dist < minDist) {
                        minDist = dist;
                        nearestPlate = p;
                    }
                }
                plateMap[idx] = nearestPlate;
            }
        }
        this.plateMap = plateMap;
        return plateMap;
    }
    /**
     * Detect plate boundaries
     */
    detectBoundaries(plateMap, resolution) {
        const boundaries = new Map();
        for (let row = 0; row < resolution; row++) {
            for (let col = 0; col < resolution; col++) {
                const idx = row * resolution + col;
                const plate1 = plateMap[idx];
                // Check neighbors
                const neighbors = [
                    [col + 1, row],
                    [col, row + 1],
                ];
                for (const [nc, nr] of neighbors) {
                    if (nc >= 0 && nc < resolution && nr >= 0 && nr < resolution) {
                        const nIdx = nr * resolution + nc;
                        const plate2 = plateMap[nIdx];
                        if (plate1 !== plate2) {
                            // Create boundary key (sorted plate IDs)
                            const key = [plate1, plate2].sort().join('-');
                            if (!boundaries.has(key)) {
                                // Determine boundary type from relative velocities
                                const p1 = this.plates[plate1];
                                const p2 = this.plates[plate2];
                                const relativeVel = p1.velocity.clone().sub(p2.velocity);
                                const plateVector = p2.centroid.clone().sub(p1.centroid).normalize();
                                const dotProduct = relativeVel.dot(plateVector);
                                let boundaryType;
                                if (dotProduct < -0.3) {
                                    boundaryType = 'convergent';
                                }
                                else if (dotProduct > 0.3) {
                                    boundaryType = 'divergent';
                                }
                                else {
                                    boundaryType = 'transform';
                                }
                                boundaries.set(key, {
                                    plate1,
                                    plate2,
                                    type: boundaryType,
                                    cells: [],
                                    uplift: new Float32Array(resolution * resolution),
                                });
                            }
                            const boundary = boundaries.get(key);
                            boundary.cells.push(idx);
                        }
                    }
                }
            }
        }
        this.boundaries = Array.from(boundaries.values());
        return this.boundaries;
    }
    /**
     * Simulate one timestep of plate movement
     */
    simulateStep(resolution, worldSize, deltaTime) {
        const cellSize = worldSize / resolution;
        // Move plates
        for (const plate of this.plates) {
            // Translate
            plate.centroid.add(plate.velocity.clone().multiplyScalar(deltaTime));
            // Rotate
            plate.rotation += plate.angularVelocity * deltaTime;
            // Wrap around world bounds
            const halfWorld = worldSize / 2;
            if (plate.centroid.x > halfWorld)
                plate.centroid.x -= worldSize;
            if (plate.centroid.x < -halfWorld)
                plate.centroid.x += worldSize;
            if (plate.centroid.z > halfWorld)
                plate.centroid.z -= worldSize;
            if (plate.centroid.z < -halfWorld)
                plate.centroid.z += worldSize;
        }
        // Reassign plate map
        if (this.plateMap) {
            for (let row = 0; row < resolution; row++) {
                for (let col = 0; col < resolution; col++) {
                    const idx = row * resolution + col;
                    const x = col * cellSize - worldSize / 2;
                    const z = row * cellSize - worldSize / 2;
                    const pos = new THREE.Vector3(x, 0, z);
                    let minDist = Infinity;
                    let nearestPlate = 0;
                    for (let p = 0; p < this.plates.length; p++) {
                        const dist = pos.distanceTo(this.plates[p].centroid);
                        if (dist < minDist) {
                            minDist = dist;
                            nearestPlate = p;
                        }
                    }
                    this.plateMap[idx] = nearestPlate;
                }
            }
        }
        // Redetect boundaries
        if (this.plateMap) {
            this.detectBoundaries(this.plateMap, resolution);
        }
    }
    /**
     * Apply tectonic forces to heightmap
     */
    applyTectonicForces(heightmap, resolution, worldSize) {
        const result = new Float32Array(heightmap);
        const cellSize = worldSize / resolution;
        for (const boundary of this.boundaries) {
            const p1 = this.plates[boundary.plate1];
            const p2 = this.plates[boundary.plate2];
            for (const idx of boundary.cells) {
                const row = Math.floor(idx / resolution);
                const col = idx % resolution;
                const x = col * cellSize - worldSize / 2;
                const z = row * cellSize - worldSize / 2;
                // Calculate distance from plate boundary
                const boundaryPoint = new Vector3(x, 0, z);
                const distToP1 = boundaryPoint.distanceTo(p1.centroid);
                const distToP2 = boundaryPoint.distanceTo(p2.centroid);
                const boundaryDist = Math.min(distToP1, distToP2);
                // Apply effects based on boundary type
                const influenceRadius = 100 * cellSize;
                const influence = Math.max(0, 1 - boundaryDist / influenceRadius);
                switch (boundary.type) {
                    case 'convergent':
                        // Mountain building at convergent boundaries
                        const uplift = this.config.convergenceUpliftRate *
                            this.config.mountainBuildingIntensity * influence;
                        // Add noise for realistic mountain ranges
                        const mountainNoise = this.noise.perlin2D(x * 0.01, z * 0.01);
                        result[idx] += uplift * (1 + mountainNoise);
                        // Subduction zone trench
                        if (p1.type === 'oceanic' && p2.type === 'continental') {
                            const trenchDepth = -this.config.riftDepth * 0.5 * influence;
                            result[idx] += trenchDepth;
                        }
                        break;
                    case 'divergent':
                        // Rift valley formation
                        const riftProfile = Math.pow(influence, 2);
                        const subsidence = -this.config.divergenceSubsidenceRate * riftProfile;
                        result[idx] += subsidence;
                        // Mid-ocean ridge uplift
                        const ridgeUplift = this.config.convergenceUpliftRate * 0.3 * influence;
                        result[idx] += ridgeUplift;
                        break;
                    case 'transform':
                        // Lateral displacement creates linear valleys/ridges
                        const shearNoise = this.noise.perlin2D(x * 0.02, z * 0.02);
                        const shearEffect = shearNoise * influence * 0.5;
                        result[idx] += shearEffect;
                        break;
                }
            }
        }
        return result;
    }
    /**
     * Generate volcanic arcs near subduction zones
     */
    generateVolcanicArcs(heightmap, resolution, worldSize) {
        const positions = [];
        const intensities = [];
        const cellSize = worldSize / resolution;
        for (const boundary of this.boundaries) {
            if (boundary.type !== 'convergent')
                continue;
            const p1 = this.plates[boundary.plate1];
            const p2 = this.plates[boundary.plate2];
            // Volcanic arc forms on overriding plate
            const overridingPlate = p1.type === 'continental' ? p1 : p2;
            const subductingPlate = p1.type === 'continental' ? p2 : p1;
            for (const idx of boundary.cells) {
                if (Math.random() > this.config.volcanicActivity)
                    continue;
                const row = Math.floor(idx / resolution);
                const col = idx % resolution;
                const x = col * cellSize - worldSize / 2;
                const z = row * cellSize - worldSize / 2;
                // Volcanoes form 50-200km from trench
                const distToTrench = new THREE.Vector3(x, 0, z)
                    .distanceTo(subductingPlate.centroid);
                if (distToTrench > 50 && distToTrench < 200) {
                    // Offset toward overriding plate
                    const direction = overridingPlate.centroid.clone()
                        .sub(subductingPlate.centroid)
                        .normalize();
                    const offset = 100 * cellSize;
                    const volcanoPos = new THREE.Vector3(x + direction.x * offset, heightmap[idx], z + direction.z * offset);
                    positions.push(volcanoPos);
                    intensities.push(Math.random() * 0.5 + 0.5);
                }
            }
        }
        return { positions, intensities };
    }
    /**
     * Run full tectonic simulation
     */
    simulate(heightmap, resolution, worldSize) {
        // Initialize plates
        const plateMap = this.initializePlates(resolution, worldSize);
        // Detect initial boundaries
        this.detectBoundaries(plateMap, resolution);
        // Run simulation steps
        const dt = 1.0; // Time step
        for (let step = 0; step < this.config.simulationSteps; step++) {
            this.simulateStep(resolution, worldSize, dt);
        }
        // Apply tectonic forces to heightmap
        const modifiedHeightmap = this.applyTectonicForces(heightmap, resolution, worldSize);
        // Generate volcanic arcs
        const volcanicArcs = this.generateVolcanicArcs(modifiedHeightmap, resolution, worldSize);
        return {
            finalHeightmap: modifiedHeightmap,
            plates: this.plates,
            boundaries: this.boundaries,
            volcanicArcs,
        };
    }
    /**
     * Update configuration
     */
    updateConfig(config) {
        this.config = { ...this.config, ...config };
        this.noise = new NoiseUtils(this.config.seed);
        this.plates = [];
        this.boundaries = [];
        this.plateMap = null;
    }
    /**
     * Get current plate map
     */
    getPlateMap() {
        return this.plateMap;
    }
}
//# sourceMappingURL=TectonicPlateSimulator.js.map