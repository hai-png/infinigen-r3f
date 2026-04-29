/**
 * Texture Nodes - Procedural texture generation nodes
 * Based on Blender texture nodes and infinigen asset generation
 *
 * These nodes generate procedural textures for materials and shading
 */
import { NodeTypes } from '../core/node-types';
// ============================================================================
// Node Implementations
// ============================================================================
/**
 * Texture Brick Node
 * Generates a brick pattern texture with customizable parameters
 */
export class TextureBrickNode {
    constructor() {
        this.type = NodeTypes.TextureBrick;
        this.name = 'Texture Brick';
        this.inputs = {
            vector: [0, 0, 0],
            scale: 1.0,
            offset: 0.5,
            frequency: 1.0,
            brickWidth: 0.5,
            rowHeight: 0.25,
            mortarSize: 0.02,
            mortarSmooth: 0.5,
            offsetAmount: 0.5,
            offsetFrequency: 1.0,
        };
        this.outputs = {
            color: { r: 0, g: 0, b: 0 },
            float: 0,
        };
    }
    execute() {
        const { vector = [0, 0, 0], scale = 1.0 } = this.inputs;
        const x = vector[0] * scale;
        const y = vector[1] * scale;
        const brickWidth = this.inputs.brickWidth || 0.5;
        const rowHeight = this.inputs.rowHeight || 0.25;
        const mortarSize = this.inputs.mortarSize || 0.02;
        // Calculate brick coordinates
        const brickX = Math.floor(x / brickWidth);
        const brickY = Math.floor(y / rowHeight);
        // Offset every other row
        const offset = (brickY % 2) * (this.inputs.offsetAmount || 0.5) * brickWidth;
        const adjustedX = x + offset;
        const adjustedBrickX = Math.floor(adjustedX / brickWidth);
        // Local position within brick
        const localX = ((adjustedX % brickWidth) + brickWidth) % brickWidth;
        const localY = ((y % rowHeight) + rowHeight) % rowHeight;
        // Check if in mortar
        const inMortarX = localX < mortarSize || localX > brickWidth - mortarSize;
        const inMortarY = localY < mortarSize || localY > rowHeight - mortarSize;
        const inMortar = inMortarX || inMortarY;
        const value = inMortar ? 0 : 1;
        this.outputs.float = value;
        this.outputs.color = { r: value, g: value, b: value };
        return this.outputs;
    }
}
/**
 * Texture Checker Node
 * Generates a checkerboard pattern
 */
export class TextureCheckerNode {
    constructor() {
        this.type = NodeTypes.TextureChecker;
        this.name = 'Texture Checker';
        this.inputs = {
            vector: [0, 0, 0],
            scale: 1.0,
        };
        this.outputs = {
            color: { r: 0, g: 0, b: 0 },
            float: 0,
        };
    }
    execute() {
        const { vector = [0, 0, 0], scale = 1.0 } = this.inputs;
        const x = Math.floor(vector[0] * scale);
        const y = Math.floor(vector[1] * scale);
        const z = Math.floor(vector[2] * scale);
        const value = (x + y + z) % 2 === 0 ? 1 : 0;
        this.outputs.float = value;
        this.outputs.color = { r: value, g: value, b: value };
        return this.outputs;
    }
}
/**
 * Texture Gradient Node
 * Generates gradient patterns (linear, radial, spherical, etc.)
 */
export class TextureGradientNode {
    constructor() {
        this.type = NodeTypes.TextureGradient;
        this.name = 'Texture Gradient';
        this.inputs = {
            vector: [0, 0, 0],
            gradientType: 'linear',
            interpolation: 'linear',
        };
        this.outputs = {
            color: { r: 0, g: 0, b: 0 },
            float: 0,
        };
    }
    execute() {
        const { vector = [0, 0, 0], gradientType = 'linear' } = this.inputs;
        let value = 0;
        switch (gradientType) {
            case 'linear':
                value = Math.max(0, Math.min(1, vector[0]));
                break;
            case 'quadratic':
                value = vector[0] * vector[0];
                break;
            case 'diagonal':
                value = (vector[0] + vector[1]) / 2;
                break;
            case 'spherical':
                value = Math.sqrt(vector[0] ** 2 + vector[1] ** 2 + vector[2] ** 2);
                break;
            case 'radial':
                value = Math.sqrt(vector[0] ** 2 + vector[1] ** 2);
                break;
            default:
                value = vector[0];
        }
        // Apply interpolation
        value = this.applyInterpolation(value);
        value = Math.max(0, Math.min(1, value));
        this.outputs.float = value;
        this.outputs.color = { r: value, g: value, b: value };
        return this.outputs;
    }
    applyInterpolation(value) {
        const interpolation = this.inputs.interpolation || 'linear';
        switch (interpolation) {
            case 'smooth':
                return value * value * (3 - 2 * value);
            case 'ease':
                return 0.5 * Math.sin((value - 0.5) * Math.PI) + 0.5;
            case 'cubic':
                return value * value * value;
            default:
                return value;
        }
    }
}
/**
 * Texture Noise Node
 * Generates Perlin/Simplex noise patterns
 */
export class TextureNoiseNode {
    execute() {
        const { vector = [0, 0, 0], scale = 1.0 } = this.inputs;
        const x = vector[0] * scale;
        const y = vector[1] * scale;
        const z = vector[2] * scale || 0;
        const value = this.perlinNoise(x, y, z);
        const normalizedValue = (value + 1) / 2; // Normalize to [0, 1]
        this.outputs.float = normalizedValue;
        this.outputs.color = { r: normalizedValue, g: normalizedValue, b: normalizedValue };
        return this.outputs;
    }
    perlinNoise(x, y, z) {
        // Simplified Perlin noise implementation
        const X = Math.floor(x) & 255;
        const Y = Math.floor(y) & 255;
        const Z = Math.floor(z) & 255;
        x -= Math.floor(x);
        y -= Math.floor(y);
        z -= Math.floor(z);
        const u = this.fade(x);
        const v = this.fade(y);
        const w = this.fade(z);
        const A = this.p[X] + Y;
        const AA = this.p[A] + Z;
        const AB = this.p[A + 1] + Z;
        const B = this.p[X + 1] + Y;
        const BA = this.p[B] + Z;
        const BB = this.p[B + 1] + Z;
        return this.lerp(w, this.lerp(v, this.lerp(u, this.grad(this.p[AA], x, y, z), this.grad(this.p[BA], x - 1, y, z)), this.lerp(u, this.grad(this.p[AB], x, y - 1, z), this.grad(this.p[BB], x - 1, y - 1, z))), this.lerp(v, this.lerp(u, this.grad(this.p[AA + 1], x, y, z - 1), this.grad(this.p[BA + 1], x - 1, y, z - 1)), this.lerp(u, this.grad(this.p[AB + 1], x, y - 1, z - 1), this.grad(this.p[BB + 1], x - 1, y - 1, z - 1))));
    }
    fade(t) {
        return t * t * t * (t * (t * 6 - 15) + 10);
    }
    lerp(t, a, b) {
        return a + t * (b - a);
    }
    grad(hash, x, y, z) {
        const h = hash & 15;
        const u = h < 8 ? x : y;
        const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
        return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
    }
    constructor() {
        this.type = NodeTypes.TextureNoise;
        this.name = 'Texture Noise';
        this.inputs = {
            vector: [0, 0, 0],
            scale: 1.0,
            detail: 2.0,
            roughness: 0.5,
            distortion: 0.0,
            lacunarity: 2.0,
            offset: 0.0,
            gain: 1.0,
        };
        this.outputs = {
            color: { r: 0, g: 0, b: 0 },
            float: 0,
        };
        this.p = [];
        // Initialize permutation table
        const perm = Array.from({ length: 256 }, (_, i) => i);
        for (let i = 255; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [perm[i], perm[j]] = [perm[j], perm[i]];
        }
        this.p = [...perm, ...perm];
    }
}
/**
 * Texture Voronoi Node
 * Generates Voronoi/Worley noise patterns
 */
export class TextureVoronoiNode {
    constructor() {
        this.type = NodeTypes.TextureVoronoi;
        this.name = 'Texture Voronoi';
        this.inputs = {
            vector: [0, 0, 0],
            scale: 1.0,
            smoothness: 0.0,
            exponent: 1.0,
            intensity: 1.0,
            distanceMetric: 'euclidean',
            featureMode: 'f1',
            seed: 0,
        };
        this.outputs = {
            distance: 0,
            position: [0, 0, 0],
            color: { r: 0, g: 0, b: 0 },
        };
    }
    execute() {
        const { vector = [0, 0, 0], scale = 1.0 } = this.inputs;
        const x = vector[0] * scale;
        const y = vector[1] * scale;
        const z = vector[2] * scale || 0;
        const { distance, position } = this.voronoi(x, y, z);
        this.outputs.distance = distance;
        this.outputs.position = position;
        this.outputs.color = { r: distance, g: distance, b: distance };
        return this.outputs;
    }
    voronoi(x, y, z) {
        const cellX = Math.floor(x);
        const cellY = Math.floor(y);
        const cellZ = Math.floor(z);
        let minDistance = Infinity;
        let closestPoint = [0, 0, 0];
        // Check neighboring cells
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                for (let dz = -1; dz <= 1; dz++) {
                    const neighborX = cellX + dx;
                    const neighborY = cellY + dy;
                    const neighborZ = cellZ + dz;
                    // Generate pseudo-random point in cell
                    const rand = this.hash(neighborX, neighborY, neighborZ);
                    const pointX = neighborX + rand[0];
                    const pointY = neighborY + rand[1];
                    const pointZ = neighborZ + rand[2];
                    // Calculate distance
                    const distX = x - pointX;
                    const distY = y - pointY;
                    const distZ = z - pointZ;
                    const distance = Math.sqrt(distX ** 2 + distY ** 2 + distZ ** 2);
                    if (distance < minDistance) {
                        minDistance = distance;
                        closestPoint = [pointX, pointY, pointZ];
                    }
                }
            }
        }
        return { distance: minDistance, position: closestPoint };
    }
    hash(x, y, z) {
        const n = Math.sin(x * 12.9898 + y * 78.233 + z * 45.543) * 43758.5453;
        const f = n - Math.floor(n);
        return [f, (Math.sin(f * 1000) + 1) / 2, (Math.cos(f * 1000) + 1) / 2];
    }
}
/**
 * Texture Wave Node
 * Generates wave patterns (sine, saw, triangle, square)
 */
export class TextureWaveNode {
    constructor() {
        this.type = NodeTypes.TextureWave;
        this.name = 'Texture Wave';
        this.inputs = {
            vector: [0, 0, 0],
            xAmplitude: 1.0,
            yAmplitude: 1.0,
            xScale: 1.0,
            yScale: 1.0,
            velocity: 0.0,
            time: 0.0,
            waveType: 'sine',
            bandPass: false,
        };
        this.outputs = {
            color: { r: 0, g: 0, b: 0 },
            float: 0,
        };
    }
    execute() {
        const { vector = [0, 0, 0] } = this.inputs;
        const time = this.inputs.time || 0;
        const velocity = this.inputs.velocity || 0;
        const x = vector[0] * (this.inputs.xScale || 1) + time * velocity;
        const y = vector[1] * (this.inputs.yScale || 1) + time * velocity;
        const xAmp = this.inputs.xAmplitude || 1;
        const yAmp = this.inputs.yAmplitude || 1;
        const waveType = this.inputs.waveType || 'sine';
        let value = 0;
        switch (waveType) {
            case 'sine':
                value = Math.sin(x * Math.PI * 2) * xAmp + Math.sin(y * Math.PI * 2) * yAmp;
                break;
            case 'saw':
                value = ((x % 1) + 1) % 1 * xAmp + ((y % 1) + 1) % 1 * yAmp;
                break;
            case 'triangle':
                value = (2 * Math.abs(2 * ((x % 1) + 1) % 1 - 1) - 1) * xAmp +
                    (2 * Math.abs(2 * ((y % 1) + 1) % 1 - 1) - 1) * yAmp;
                break;
            case 'square':
                value = (Math.sign(Math.sin(x * Math.PI * 2)) * xAmp +
                    Math.sign(Math.sin(y * Math.PI * 2)) * yAmp) / 2;
                break;
        }
        value = (value + 2) / 4; // Normalize to [0, 1]
        this.outputs.float = value;
        this.outputs.color = { r: value, g: value, b: value };
        return this.outputs;
    }
}
/**
 * Texture White Noise Node
 * Generates random white noise
 */
export class TextureWhiteNoiseNode {
    constructor() {
        this.type = NodeTypes.TextureWhiteNoise;
        this.name = 'Texture White Noise';
        this.inputs = {
            seed: 0,
            id: 0,
        };
        this.outputs = {
            value: 0,
            color: { r: 0, g: 0, b: 0 },
        };
    }
    execute() {
        const seed = this.inputs.seed || 0;
        const id = this.inputs.id || 0;
        const value = this.hash(seed + id);
        this.outputs.value = value;
        this.outputs.color = { r: value, g: value, b: value };
        return this.outputs;
    }
    hash(n) {
        const x = Math.sin(n * 12.9898) * 43758.5453;
        return x - Math.floor(x);
    }
}
/**
 * Texture Musgrave Node
 * Generates fractal noise patterns (FBM, multifractal, etc.)
 */
export class TextureMusgraveNode {
    constructor() {
        this.type = NodeTypes.TextureMusgrave;
        this.name = 'Texture Musgrave';
        this.inputs = {
            vector: [0, 0, 0],
            scale: 1.0,
            detail: 2.0,
            dimension: 2.0,
            lacunarity: 2.0,
            offset: 0.0,
            gain: 1.0,
            musgraveType: 'fbm',
        };
        this.outputs = {
            float: 0,
        };
    }
    execute() {
        const { vector = [0, 0, 0], scale = 1.0 } = this.inputs;
        const x = vector[0] * scale;
        const y = vector[1] * scale;
        const z = vector[2] * scale || 0;
        const detail = Math.floor(this.inputs.detail || 2);
        const lacunarity = this.inputs.lacunarity || 2;
        const dimension = this.inputs.dimension || 2;
        const gain = this.inputs.gain || 1;
        let value = 0;
        let amplitude = 1;
        let frequency = 1;
        let totalAmplitude = 0;
        for (let i = 0; i < detail; i++) {
            const noise = this.perlinNoise(x * frequency, y * frequency, z * frequency);
            value += noise * amplitude;
            totalAmplitude += amplitude;
            amplitude *= gain;
            frequency *= lacunarity;
        }
        value /= totalAmplitude;
        value = (value + 1) / 2; // Normalize to [0, 1]
        this.outputs.float = value;
        return this.outputs;
    }
    perlinNoise(x, y, z) {
        // Simplified implementation (same as TextureNoiseNode)
        return Math.sin(x) * Math.cos(y) * Math.sin(z);
    }
}
/**
 * Texture Magic Node
 * Generates magical/swirly patterns
 */
export class TextureMagicNode {
    constructor() {
        this.type = NodeTypes.TextureMagic;
        this.name = 'Texture Magic';
        this.inputs = {
            vector: [0, 0, 0],
            scale: 1.0,
            distort: 1.0,
            depth: 3,
        };
        this.outputs = {
            color: { r: 0, g: 0, b: 0 },
            float: 0,
        };
    }
    execute() {
        const { vector = [0, 0, 0], scale = 1.0 } = this.inputs;
        const x = vector[0] * scale;
        const y = vector[1] * scale;
        const z = vector[2] * scale || 0;
        const distort = this.inputs.distort || 1;
        const depth = this.inputs.depth || 3;
        let value = 0;
        let px = x;
        let py = y;
        let pz = z;
        for (let i = 0; i < depth; i++) {
            value += Math.sin(px * Math.PI) * Math.sin(py * Math.PI) * Math.sin(pz * Math.PI);
            const nx = py + Math.sin(pz + value);
            const ny = pz + Math.sin(px + value);
            const nz = px + Math.sin(py + value);
            px = nx * distort;
            py = ny * distort;
            pz = nz * distort;
        }
        value = (value + 1) / 2; // Normalize to [0, 1]
        this.outputs.float = value;
        this.outputs.color = { r: value, g: value, b: value };
        return this.outputs;
    }
}
/**
 * Texture Gabor Node
 * Generates Gabor noise patterns (oriented noise)
 */
export class TextureGaborNode {
    constructor() {
        this.type = NodeTypes.TextureGabor;
        this.name = 'Texture Gabor';
        this.inputs = {
            vector: [0, 0, 0],
            scale: 1.0,
            orientation: 0,
            anisotropy: 1.0,
            frequency: 1.0,
            phase: 0,
        };
        this.outputs = {
            float: 0,
        };
    }
    execute() {
        const { vector = [0, 0, 0], scale = 1.0 } = this.inputs;
        const x = vector[0] * scale;
        const y = vector[1] * scale;
        const orientation = this.inputs.orientation || 0;
        const anisotropy = this.inputs.anisotropy || 1;
        const frequency = this.inputs.frequency || 1;
        const phase = this.inputs.phase || 0;
        // Rotate coordinates
        const cos = Math.cos(orientation);
        const sin = Math.sin(orientation);
        const rx = x * cos - y * sin;
        const ry = x * sin + y * cos;
        // Gabor function
        const envelope = Math.exp(-(rx * rx + ry * ry * anisotropy) / 2);
        const carrier = Math.cos(rx * frequency * Math.PI * 2 + phase);
        const value = (envelope * carrier + 1) / 2; // Normalize to [0, 1]
        this.outputs.float = value;
        return this.outputs;
    }
}
// ============================================================================
// Factory Functions
// ============================================================================
export function createTextureBrickNode(inputs) {
    const node = new TextureBrickNode();
    if (inputs)
        Object.assign(node.inputs, inputs);
    return node;
}
export function createTextureCheckerNode(inputs) {
    const node = new TextureCheckerNode();
    if (inputs)
        Object.assign(node.inputs, inputs);
    return node;
}
export function createTextureGradientNode(inputs) {
    const node = new TextureGradientNode();
    if (inputs)
        Object.assign(node.inputs, inputs);
    return node;
}
export function createTextureNoiseNode(inputs) {
    const node = new TextureNoiseNode();
    if (inputs)
        Object.assign(node.inputs, inputs);
    return node;
}
export function createTextureVoronoiNode(inputs) {
    const node = new TextureVoronoiNode();
    if (inputs)
        Object.assign(node.inputs, inputs);
    return node;
}
export function createTextureWaveNode(inputs) {
    const node = new TextureWaveNode();
    if (inputs)
        Object.assign(node.inputs, inputs);
    return node;
}
export function createTextureWhiteNoiseNode(inputs) {
    const node = new TextureWhiteNoiseNode();
    if (inputs)
        Object.assign(node.inputs, inputs);
    return node;
}
export function createTextureMusgraveNode(inputs) {
    const node = new TextureMusgraveNode();
    if (inputs)
        Object.assign(node.inputs, inputs);
    return node;
}
export function createTextureMagicNode(inputs) {
    const node = new TextureMagicNode();
    if (inputs)
        Object.assign(node.inputs, inputs);
    return node;
}
export function createTextureGaborNode(inputs) {
    const node = new TextureGaborNode();
    if (inputs)
        Object.assign(node.inputs, inputs);
    return node;
}
//# sourceMappingURL=TextureNodes.js.map