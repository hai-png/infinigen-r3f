/**
 * Infinigen R3F Port - Phase 10: Terrain Generation
 * Core Terrain Generator with Multi-Octave Noise, Erosion, and Tectonics
 */
import { SeededRandom } from '../../util/MathUtils';
export class TerrainGenerator {
    constructor(config = {}) {
        this.config = {
            seed: Math.floor(Math.random() * 10000),
            width: 512,
            height: 512,
            scale: 100,
            octaves: 6,
            persistence: 0.5,
            lacunarity: 2.0,
            elevationOffset: 0,
            erosionStrength: 0.3,
            erosionIterations: 20,
            tectonicPlates: 4,
            seaLevel: 0.3,
            ...config,
        };
        this.rng = new SeededRandom(this.config.seed);
        this.width = this.config.width;
        this.height = this.config.height;
        this.permutationTable = [];
        this.initPermutationTable();
    }
    /**
     * Generate complete terrain data
     */
    generate() {
        console.log(`Generating terrain with seed ${this.config.seed}...`);
        // 1. Generate base heightmap with noise
        const heightMap = this.generateBaseHeightMap();
        // 2. Apply tectonic uplift
        this.applyTectonics(heightMap);
        // 3. Apply hydraulic erosion
        this.applyErosion(heightMap);
        // 4. Normalize and offset
        this.normalizeHeightMap(heightMap);
        // 5. Calculate derived maps
        const normalMap = this.calculateNormals(heightMap);
        const slopeMap = this.calculateSlopes(heightMap);
        const biomeMask = this.generateBiomeMask(heightMap, slopeMap);
        return {
            heightMap,
            normalMap,
            slopeMap,
            biomeMask,
            config: { ...this.config },
        };
    }
    /**
     * Generate base heightmap using Fractal Brownian Motion
     */
    generateBaseHeightMap() {
        const map = new Float32Array(this.width * this.height);
        const amplitude = 1.0;
        const frequency = 1.0 / this.config.scale;
        let maxVal = -Infinity;
        let minVal = Infinity;
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                let value = 0;
                let amp = amplitude;
                let freq = frequency;
                // Multi-octave noise
                for (let i = 0; i < this.config.octaves; i++) {
                    const nx = x * freq;
                    const ny = y * freq;
                    value += this.perlinNoise(nx, ny) * amp;
                    maxVal = Math.max(maxVal, value);
                    minVal = Math.min(minVal, value);
                    amp *= this.config.persistence;
                    freq *= this.config.lacunarity;
                }
                map[y * this.width + x] = value;
            }
        }
        // Normalize to 0-1 range
        const range = maxVal - minVal;
        for (let i = 0; i < map.length; i++) {
            map[i] = (map[i] - minVal) / range;
        }
        return map;
    }
    /**
     * Apply tectonic plate simulation for mountain ranges
     */
    applyTectonics(heightMap) {
        if (this.config.tectonicPlates <= 0)
            return;
        // Generate plate centers
        const plates = [];
        for (let i = 0; i < this.config.tectonicPlates; i++) {
            plates.push({
                x: this.rng.next() * this.width,
                y: this.rng.next() * this.height,
                height: 0.5 + this.rng.next() * 0.5,
                radius: (Math.min(this.width, this.height) / 3) * (0.5 + this.rng.next()),
            });
        }
        // Apply plate influence
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                let uplift = 0;
                for (const plate of plates) {
                    const dx = x - plate.x;
                    const dy = y - plate.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < plate.radius) {
                        const falloff = 1 - (dist / plate.radius);
                        uplift += plate.height * falloff * falloff; // Quadratic falloff
                    }
                }
                const idx = y * this.width + x;
                heightMap[idx] = Math.min(1.0, heightMap[idx] + uplift * 0.5);
            }
        }
    }
    /**
     * Apply hydraulic erosion simulation
     */
    applyErosion(heightMap) {
        const iterations = this.config.erosionIterations;
        const inertia = 0.05;
        const sedimentCapacityFactor = 4;
        const erodeSpeed = 0.3;
        const depositSpeed = 0.3;
        const evaporateSpeed = 0.01;
        const gravity = 4;
        const maxDropletLifetime = 30;
        const tempMap = new Float32Array(heightMap);
        for (let iter = 0; iter < iterations; iter++) {
            // Initialize droplet
            let posX = this.rng.next() * this.width;
            let posY = this.rng.next() * this.height;
            let dirX = 0;
            let dirY = 0;
            let speed = 0;
            let water = 1;
            let sediment = 0;
            for (let lifetime = 0; lifetime < maxDropletLifetime; lifetime++) {
                const nodeX = Math.floor(posX);
                const nodeY = Math.floor(posY);
                const cellX = posX - nodeX;
                const cellY = posY - nodeY;
                if (nodeX < 0 || nodeX >= this.width - 1 || nodeY < 0 || nodeY >= this.height - 1)
                    break;
                // Get heights at corners
                const idx00 = nodeY * this.width + nodeX;
                const idx10 = nodeY * this.width + (nodeX + 1);
                const idx01 = (nodeY + 1) * this.width + nodeX;
                const idx11 = (nodeY + 1) * this.width + (nodeX + 1);
                const h00 = tempMap[idx00];
                const h10 = tempMap[idx10];
                const h01 = tempMap[idx01];
                const h11 = tempMap[idx11];
                // Bilinear interpolation for height at droplet position
                const height = h00 * (1 - cellX) * (1 - cellY) +
                    h10 * cellX * (1 - cellY) +
                    h01 * (1 - cellX) * cellY +
                    h11 * cellX * cellY;
                // Calculate gradient
                const deltaX = (h10 - h00) * (1 - cellY) + (h11 - h01) * cellY;
                const deltaY = (h01 - h00) * (1 - cellX) + (h11 - h10) * cellX;
                // Update direction with inertia
                dirX = dirX * inertia - deltaX * (1 - inertia);
                dirY = dirY * inertia - deltaY * (1 - inertia);
                // Normalize
                const len = Math.sqrt(dirX * dirX + dirY * dirY);
                if (len > 0) {
                    dirX /= len;
                    dirY /= len;
                }
                // Move droplet
                posX += dirX;
                posY += dirY;
                // Update speed
                const currentHeight = tempMap[Math.floor(posY) * this.width + Math.floor(posX)];
                speed = Math.sqrt(speed * speed + gravity * (height - currentHeight));
                // Sediment capacity
                const sedimentCapacity = Math.max(-speed, 1) * Math.min(speed, 4) * sedimentCapacityFactor;
                // Erosion or deposition
                if (sediment > sedimentCapacity || speed === 0) {
                    // Deposit
                    const amount = (sediment - sedimentCapacity) * depositSpeed;
                    sediment -= amount;
                    // Distribute to corners
                    const distrib = (1 - cellX) * (1 - cellY);
                    tempMap[idx00] += amount * distrib;
                    tempMap[idx10] += amount * cellX * (1 - cellY);
                    tempMap[idx01] += amount * (1 - cellX) * cellY;
                    tempMap[idx11] += amount * cellX * cellY;
                }
                else {
                    // Erode
                    const amount = Math.min((sedimentCapacity - sediment) * erodeSpeed, -height * speed * water);
                    if (amount > 0) {
                        sediment += amount;
                        // Remove from corners
                        const distrib = (1 - cellX) * (1 - cellY);
                        tempMap[idx00] -= amount * distrib;
                        tempMap[idx10] -= amount * cellX * (1 - cellY);
                        tempMap[idx01] -= amount * (1 - cellX) * cellY;
                        tempMap[idx11] -= amount * cellX * cellY;
                    }
                }
                // Evaporation
                water *= (1 - evaporateSpeed);
                if (water <= 0)
                    break;
            }
        }
        // Copy back
        for (let i = 0; i < heightMap.length; i++) {
            heightMap[i] = Math.max(0, Math.min(1, tempMap[i]));
        }
    }
    /**
     * Normalize heightmap to 0-1 range with optional offset
     */
    normalizeHeightMap(heightMap) {
        let max = -Infinity;
        let min = Infinity;
        for (let i = 0; i < heightMap.length; i++) {
            max = Math.max(max, heightMap[i]);
            min = Math.min(min, heightMap[i]);
        }
        const range = max - min;
        for (let i = 0; i < heightMap.length; i++) {
            heightMap[i] = ((heightMap[i] - min) / range) + this.config.elevationOffset;
            heightMap[i] = Math.max(0, Math.min(1, heightMap[i]));
        }
    }
    /**
     * Calculate normal vectors for lighting
     */
    calculateNormals(heightMap) {
        const normals = new Float32Array(this.width * this.height * 3);
        const scale = 1.0 / this.config.scale;
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const left = x > 0 ? heightMap[y * this.width + (x - 1)] : heightMap[y * this.width + x];
                const right = x < this.width - 1 ? heightMap[y * this.width + (x + 1)] : heightMap[y * this.width + x];
                const top = y > 0 ? heightMap[(y - 1) * this.width + x] : heightMap[y * this.width + x];
                const bottom = y < this.height - 1 ? heightMap[(y + 1) * this.width + x] : heightMap[y * this.width + x];
                const dx = (right - left) * scale;
                const dy = (bottom - top) * scale;
                const dz = 1.0;
                const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
                const idx = (y * this.width + x) * 3;
                normals[idx] = -dx / len; // X
                normals[idx + 1] = -dy / len; // Y
                normals[idx + 2] = dz / len; // Z
            }
        }
        return normals;
    }
    /**
     * Calculate slope values for biome determination
     */
    calculateSlopes(heightMap) {
        const slopes = new Float32Array(this.width * this.height);
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const center = heightMap[y * this.width + x];
                const right = x < this.width - 1 ? heightMap[y * this.width + (x + 1)] : center;
                const bottom = y < this.height - 1 ? heightMap[(y + 1) * this.width + x] : center;
                const dx = right - center;
                const dy = bottom - center;
                slopes[y * this.width + x] = Math.sqrt(dx * dx + dy * dy);
            }
        }
        // Normalize slopes
        let maxSlope = 0;
        for (let i = 0; i < slopes.length; i++) {
            maxSlope = Math.max(maxSlope, slopes[i]);
        }
        if (maxSlope > 0) {
            for (let i = 0; i < slopes.length; i++) {
                slopes[i] /= maxSlope;
            }
        }
        return slopes;
    }
    /**
     * Generate biome mask based on height and slope
     */
    generateBiomeMask(heightMap, slopeMap) {
        const mask = new Uint8Array(this.width * this.height);
        for (let i = 0; i < heightMap.length; i++) {
            const h = heightMap[i];
            const s = slopeMap[i];
            let biome = 0; // Deep water
            if (h < this.config.seaLevel - 0.1)
                biome = 0; // Deep water
            else if (h < this.config.seaLevel)
                biome = 1; // Shore
            else if (h < this.config.seaLevel + 0.1 && s < 0.1)
                biome = 2; // Beach
            else if (h < 0.4 && s < 0.2)
                biome = 3; // Plains
            else if (h < 0.4 && s >= 0.2)
                biome = 4; // Hills
            else if (h < 0.7 && s < 0.3)
                biome = 5; // Forest
            else if (h < 0.7 && s >= 0.3)
                biome = 6; // Mountain Forest
            else if (h < 0.85)
                biome = 7; // Mountain
            else
                biome = 8; // Snow Peak
            mask[i] = biome;
        }
        return mask;
    }
    /**
     * Perlin noise implementation
     */
    perlinNoise(x, y) {
        const X = Math.floor(x) & 255;
        const Y = Math.floor(y) & 255;
        x -= Math.floor(x);
        y -= Math.floor(y);
        const u = this.fade(x);
        const v = this.fade(y);
        const A = this.permutationTable[X] + Y;
        const B = this.permutationTable[X + 1] + Y;
        return this.lerp(v, this.lerp(u, this.grad(this.permutationTable[A], x, y), this.grad(this.permutationTable[B], x - 1, y)), this.lerp(u, this.grad(this.permutationTable[A + 1], x, y - 1), this.grad(this.permutationTable[B + 1], x - 1, y - 1)));
    }
    fade(t) {
        return t * t * t * (t * (t * 6 - 15) + 10);
    }
    lerp(t, a, b) {
        return a + t * (b - a);
    }
    grad(hash, x, y) {
        const h = hash & 3;
        const u = h < 2 ? x : y;
        const v = h < 2 ? y : x;
        return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
    }
    /**
     * Initialize permutation table for noise
     */
    initPermutationTable() {
        this.permutationTable = new Array(512);
        const perm = new Array(256);
        for (let i = 0; i < 256; i++) {
            perm[i] = i;
        }
        // Shuffle based on seed
        for (let i = 255; i > 0; i--) {
            const j = Math.floor(this.rng.next() * (i + 1));
            [perm[i], perm[j]] = [perm[j], perm[i]];
        }
        for (let i = 0; i < 512; i++) {
            this.permutationTable[i] = perm[i & 255];
        }
    }
    /**
     * Reseed the generator
     */
    reseed(seed) {
        this.rng = new SeededRandom(seed);
        this.config.seed = seed;
        this.initPermutationTable();
    }
    /**
     * Get height at specific coordinates
     */
    getHeightAt(x, y) {
        const xi = Math.floor(x);
        const yi = Math.floor(y);
        if (xi < 0 || xi >= this.width - 1 || yi < 0 || yi >= this.height - 1) {
            return 0;
        }
        const xf = x - xi;
        const yf = y - yi;
        const idx00 = yi * this.width + xi;
        const idx10 = yi * this.width + (xi + 1);
        const idx01 = (yi + 1) * this.width + xi;
        const idx11 = (yi + 1) * this.width + (xi + 1);
        // Bilinear interpolation would require storing the heightmap
        // For now, return interpolated value from stored data
        return 0; // Placeholder - actual implementation would need access to generated heightmap
    }
}
//# sourceMappingURL=TerrainGenerator.js.map