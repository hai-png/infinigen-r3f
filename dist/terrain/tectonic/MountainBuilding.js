/**
 * Mountain Building System
 * Implements orogenic processes for mountain range formation
 *
 * Based on original Infinigen tectonic mountain building algorithms
 */
import { Vector3, Matrix4 } from 'three';
export class MountainBuilding {
    constructor(params) {
        this.params = {
            upliftRate: 0.5, // mm/year equivalent
            maxElevation: 8848, // Everest height
            crustalThickness: 35, // km
            foldWavelength: 50, // km
            foldAmplitude: 2000, // m
            foldTightness: 0.6,
            thrustSpacing: 20, // km
            thrustDip: 30, // degrees
            thrustDisplacement: 5000, // m
            erosionalUnloading: 0.7,
            glacialCarving: 0.3,
            simulationTime: 50, // Myr
            timeStep: 0.1, // Myr
            ...params
        };
    }
    /**
     * Set tectonic plate simulator for coupled simulation
     */
    setPlateSimulator(simulator) {
        this.plateSimulator = simulator;
    }
    /**
     * Update parameters
     */
    updateParams(params) {
        this.params = { ...this.params, ...params };
    }
    /**
     * Generate mountain range from tectonic collision
     */
    generateMountainRange(collisionZone, plateVelocity, gridSize, resolution) {
        const { upliftRate, maxElevation, foldWavelength, foldAmplitude, thrustSpacing, thrustDip, thrustDisplacement, simulationTime, timeStep } = this.params;
        // Initialize elevation map
        const numPoints = gridSize * gridSize;
        const elevationMap = new Float32Array(numPoints);
        const cellSize = resolution / gridSize;
        // Calculate total convergence
        const totalConvergence = plateVelocity.length() * simulationTime * 1e6; // meters
        // Step 1: Calculate initial uplift from crustal thickening
        this.applyCrustalThickening(elevationMap, collisionZone, gridSize, cellSize, totalConvergence);
        // Step 2: Generate fold structures
        const foldAxes = this.generateFoldStructures(elevationMap, gridSize, cellSize, foldWavelength, foldAmplitude);
        // Step 3: Create thrust fault system
        const thrustFaults = this.createThrustFaultSystem(elevationMap, collisionZone, gridSize, cellSize, thrustSpacing, thrustDip * Math.PI / 180, thrustDisplacement);
        // Step 4: Apply erosional modification over time
        this.applyErosionalModification(elevationMap, gridSize, cellSize, simulationTime, timeStep);
        // Step 5: Extract topographic features
        const { peaks, ridges, valleys } = this.extractTopographicFeatures(elevationMap, gridSize, cellSize);
        // Cap elevation at maximum
        for (let i = 0; i < numPoints; i++) {
            elevationMap[i] = Math.min(elevationMap[i], maxElevation);
        }
        return {
            peaks,
            ridges,
            valleys,
            elevationMap,
            foldAxes,
            thrustFaults
        };
    }
    /**
     * Apply crustal thickening from plate convergence
     */
    applyCrustalThickening(elevationMap, collisionZone, gridSize, cellSize, convergence) {
        const { crustalThickness, upliftRate } = this.params;
        // Airy isostasy: elevation = convergence * (crust_density / mantle_density)
        const densityRatio = 2.7 / 3.3; // crust/mantle density
        const maxUplift = convergence * densityRatio * 0.5; // 50% efficiency
        // Create uplift zone around collision boundary
        for (let y = 0; y < gridSize; y++) {
            for (let x = 0; x < gridSize; x++) {
                const worldX = x * cellSize;
                const worldY = y * cellSize;
                const pos = new Vector3(worldX, 0, worldY);
                // Find distance to collision zone
                let minDistance = Infinity;
                for (const zonePoint of collisionZone) {
                    const distance = pos.distanceTo(zonePoint);
                    minDistance = Math.min(minDistance, distance);
                }
                // Uplift decreases with distance from collision zone
                const influenceRadius = 200 * 1000; // 200 km
                if (minDistance < influenceRadius) {
                    const falloff = Math.exp(-minDistance / (influenceRadius * 0.3));
                    const localUplift = maxUplift * falloff;
                    const index = y * gridSize + x;
                    elevationMap[index] = localUplift;
                }
            }
        }
    }
    /**
     * Generate fold structures in rock layers
     */
    generateFoldStructures(elevationMap, gridSize, cellSize, wavelength, amplitude) {
        const { foldTightness } = this.params;
        const foldAxes = [];
        // Convert wavelength to grid units
        const wavelengthGrid = (wavelength * 1000) / cellSize;
        const frequency = (2 * Math.PI) / wavelengthGrid;
        // Generate multiple fold sets with different orientations
        const numFoldSets = 3;
        for (let set = 0; set < numFoldSets; set++) {
            const orientation = (set / numFoldSets) * Math.PI;
            const phaseOffset = set * (Math.PI / 4);
            // Store fold axis
            const axisDirection = new Vector3(Math.cos(orientation), 0, Math.sin(orientation));
            foldAxes.push(axisDirection);
            // Apply folding to elevation
            for (let y = 0; y < gridSize; y++) {
                for (let x = 0; x < gridSize; x++) {
                    // Project position onto fold direction
                    const worldX = x * cellSize;
                    const worldZ = y * cellSize;
                    const projectedDist = worldX * Math.cos(orientation) + worldZ * Math.sin(orientation);
                    // Calculate fold displacement with tightness factor
                    const foldPhase = projectedDist * frequency + phaseOffset;
                    let foldDisplacement;
                    if (foldTightness > 0.7) {
                        // Tight folds: chevron pattern
                        foldDisplacement = amplitude * Math.abs(Math.sin(foldPhase)) / Math.sin(Math.PI / 2);
                    }
                    else if (foldTightness > 0.4) {
                        // Moderate folds: rounded chevron
                        foldDisplacement = amplitude * Math.pow(Math.abs(Math.sin(foldPhase)), 0.7);
                    }
                    else {
                        // Open folds: sinusoidal
                        foldDisplacement = amplitude * Math.sin(foldPhase);
                    }
                    const index = y * gridSize + x;
                    elevationMap[index] += foldDisplacement * 0.3; // Modulate existing elevation
                }
            }
        }
        return foldAxes;
    }
    /**
     * Create thrust fault system
     */
    createThrustFaultSystem(elevationMap, collisionZone, gridSize, cellSize, spacing, dipAngle, displacement) {
        const thrustFaults = [];
        const spacingGrid = (spacing * 1000) / cellSize;
        // Determine primary compression direction (perpendicular to collision zone)
        let compressionDir = new Vector3(1, 0, 0);
        if (collisionZone.length >= 2) {
            const zoneDir = new Vector3().subVectors(collisionZone[1], collisionZone[0]).normalize();
            compressionDir = new Vector3(-zoneDir.z, 0, zoneDir.x); // Perpendicular
        }
        // Create series of thrust faults parallel to collision zone
        let faultIndex = 0;
        for (let offset = 0; offset < gridSize * cellSize; offset += spacing * 1000) {
            const faultPosition = new Vector3(collisionZone[0]?.x || 0, 0, collisionZone[0]?.z || 0).add(compressionDir.clone().multiplyScalar(offset));
            // Fault normal (dipping away from collision zone)
            const faultNormal = new Vector3(-compressionDir.x * Math.sin(dipAngle), Math.cos(dipAngle), -compressionDir.z * Math.sin(dipAngle)).normalize();
            const thrustFault = {
                position: faultPosition,
                normal: faultNormal,
                dipAngle: dipAngle,
                displacement: displacement * (1 - offset / (gridSize * cellSize)), // Decrease with distance
                length: gridSize * cellSize * 0.8
            };
            thrustFaults.push(thrustFault);
            // Apply displacement to hanging wall
            this.applyThrustDisplacement(elevationMap, thrustFault, gridSize, cellSize);
            faultIndex++;
            if (faultIndex > 10)
                break; // Limit number of faults
        }
        return thrustFaults;
    }
    /**
     * Apply displacement along thrust fault
     */
    applyThrustDisplacement(elevationMap, fault, gridSize, cellSize) {
        const { displacement, dipAngle } = fault;
        const horizontalComponent = displacement * Math.cos(dipAngle);
        const verticalComponent = displacement * Math.sin(dipAngle);
        // Hanging wall is in direction opposite to fault normal's horizontal component
        const hwDirection = new Vector3(-fault.normal.x, 0, -fault.normal.z).normalize();
        for (let y = 0; y < gridSize; y++) {
            for (let x = 0; x < gridSize; x++) {
                const worldX = x * cellSize;
                const worldZ = y * cellSize;
                const pos = new Vector3(worldX, 0, worldZ);
                // Check if point is in hanging wall
                const vectorToFault = new Vector3().subVectors(pos, fault.position);
                const isInHangingWall = vectorToFault.dot(hwDirection) > 0;
                if (isInHangingWall) {
                    // Distance from fault trace
                    const distanceFromFault = Math.abs(vectorToFault.dot(new Vector3(fault.normal.x, 0, fault.normal.z)));
                    // Displacement decreases with distance from fault
                    const decayLength = 50 * 1000; // 50 km
                    const falloff = Math.exp(-distanceFromFault / decayLength);
                    const index = y * gridSize + x;
                    elevationMap[index] += verticalComponent * falloff;
                }
            }
        }
    }
    /**
     * Apply erosional modification over geological time
     */
    applyErosionalModification(elevationMap, gridSize, cellSize, simulationTime, timeStep) {
        const { erosionalUnloading, glacialCarving } = this.params;
        const numSteps = Math.floor(simulationTime / timeStep);
        // Temporary buffer for erosion calculations
        const tempElevation = new Float32Array(elevationMap.length);
        for (let step = 0; step < Math.min(numSteps, 100); step++) {
            // Copy current elevation
            tempElevation.set(elevationMap);
            for (let y = 0; y < gridSize; y++) {
                for (let x = 0; x < gridSize; x++) {
                    const index = y * gridSize + x;
                    const elevation = elevationMap[index];
                    // Slope-based erosion (steeper slopes erode faster)
                    const slope = this.calculateSlope(elevationMap, x, y, gridSize, cellSize);
                    const slopeErosion = slope * 0.01 * timeStep;
                    // Glacial carving (higher elevations erode more)
                    const glacialErosion = (elevation > 2000 ? glacialCarving : 0) * 0.005 * timeStep;
                    // Total erosion
                    const totalErosion = slopeErosion + glacialErosion;
                    tempElevation[index] -= totalErosion;
                    // Isostatic rebound from erosional unloading
                    const rebound = totalErosion * erosionalUnloading * 0.3;
                    tempElevation[index] += rebound;
                }
            }
            // Update elevation map
            elevationMap.set(tempElevation);
        }
    }
    /**
     * Calculate local slope at a point
     */
    calculateSlope(elevationMap, x, y, gridSize, cellSize) {
        const getElevation = (px, py) => {
            if (px < 0 || px >= gridSize || py < 0 || py >= gridSize) {
                return 0;
            }
            return elevationMap[py * gridSize + px];
        };
        // Central difference for gradient
        const dzdx = (getElevation(x + 1, y) - getElevation(x - 1, y)) / (2 * cellSize);
        const dzdy = (getElevation(x, y + 1) - getElevation(x, y - 1)) / (2 * cellSize);
        return Math.sqrt(dzdx * dzdx + dzdy * dzdy);
    }
    /**
     * Extract topographic features from elevation map
     */
    extractTopographicFeatures(elevationMap, gridSize, cellSize) {
        const peaks = [];
        const ridges = [];
        const valleys = [];
        const windowSize = 3;
        const halfWindow = Math.floor(windowSize / 2);
        // Find local maxima (peaks)
        for (let y = halfWindow; y < gridSize - halfWindow; y++) {
            for (let x = halfWindow; x < gridSize - halfWindow; x++) {
                const index = y * gridSize + x;
                const centerElev = elevationMap[index];
                // Check if local maximum
                let isPeak = true;
                for (let dy = -halfWindow; dy <= halfWindow; dy++) {
                    for (let dx = -halfWindow; dx <= halfWindow; dx++) {
                        if (dx === 0 && dy === 0)
                            continue;
                        const neighborIndex = (y + dy) * gridSize + (x + dx);
                        if (elevationMap[neighborIndex] > centerElev) {
                            isPeak = false;
                            break;
                        }
                    }
                    if (!isPeak)
                        break;
                }
                if (isPeak && centerElev > 1000) { // Only significant peaks
                    peaks.push(new Vector3(x * cellSize, centerElev, y * cellSize));
                }
            }
        }
        // Extract ridgelines and valleys using curvature analysis
        this.extractLinearFeatures(elevationMap, gridSize, cellSize, ridges, valleys);
        return { peaks, ridges, valleys };
    }
    /**
     * Extract linear features (ridges and valleys)
     */
    extractLinearFeatures(elevationMap, gridSize, cellSize, ridges, valleys) {
        // Simplified ridge/valley extraction using second derivative
        const threshold = 0.001;
        for (let y = 1; y < gridSize - 1; y++) {
            const ridgeLine = [];
            const valleyLine = [];
            for (let x = 1; x < gridSize - 1; x++) {
                const index = y * gridSize + x;
                const left = elevationMap[y * gridSize + (x - 1)];
                const right = elevationMap[y * gridSize + (x + 1)];
                const center = elevationMap[index];
                // Second derivative (curvature)
                const curvature = left - 2 * center + right;
                const worldX = x * cellSize;
                const worldZ = y * cellSize;
                const pos = new Vector3(worldX, center, worldZ);
                if (curvature > threshold) {
                    ridgeLine.push(pos);
                }
                else if (curvature < -threshold) {
                    valleyLine.push(pos);
                }
            }
            if (ridgeLine.length > 5)
                ridges.push(ridgeLine);
            if (valleyLine.length > 5)
                valleys.push(valleyLine);
        }
    }
    /**
     * Apply mountain building to terrain mesh vertices
     */
    applyToMesh(positions, mountainRange, transform) {
        const inverseTransform = new Matrix4().copy(transform).invert();
        for (let i = 0; i < positions.length; i += 3) {
            const vertex = new Vector3(positions[i], positions[i + 1], positions[i + 2]);
            // Transform to mountain range coordinate space
            vertex.applyMatrix4(inverseTransform);
            // Find corresponding elevation from mountain range
            const gridX = Math.floor(vertex.x);
            const gridY = Math.floor(vertex.z);
            // Simple bilinear interpolation could be added here
            // For now, just use nearest neighbor
            const elevation = mountainRange.elevationMap[gridY * Math.sqrt(mountainRange.elevationMap.length) + gridX];
            if (elevation !== undefined && !isNaN(elevation)) {
                positions[i + 1] = elevation;
            }
        }
    }
}
//# sourceMappingURL=MountainBuilding.js.map