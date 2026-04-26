import * as THREE from 'three';
import { NoiseUtils } from '../../../utils/NoiseUtils';
/**
 * Realistic fur/hair material with anisotropic shading
 */
export class FurMaterial {
    constructor(config) {
        this.config = {
            baseColor: new THREE.Color(0x8d6e63),
            tipColor: new THREE.Color(0xa1887f),
            undercoatColor: new THREE.Color(0x5d4037),
            furLength: 0.5,
            density: 0.7,
            roughness: 0.8,
            enableStripes: false,
            stripeColor: new THREE.Color(0x212121),
            stripeWidth: 0.1,
            enableSpots: false,
            spotColor: new THREE.Color(0x212121),
            spotSize: 0.15,
            anisotropy: 0.7,
            ...config,
        };
        this.material = this.createMaterial();
    }
    createMaterial() {
        const material = new THREE.MeshStandardMaterial({
            color: this.config.baseColor,
            roughness: this.config.roughness,
            metalness: 0.0,
            side: THREE.DoubleSide,
        });
        // Generate fur gradient texture
        this.generateFurGradient(material);
        // Add patterns if enabled
        if (this.config.enableStripes) {
            this.addStripes(material);
        }
        else if (this.config.enableSpots) {
            this.addSpots(material);
        }
        return material;
    }
    generateFurGradient(material) {
        const size = 512;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const imageData = ctx.createImageData(size, size);
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const index = (y * size + x) * 4;
                // Create gradient from undercoat to base to tip
                const t = y / size;
                let r, g, b;
                if (t < 0.3) {
                    // Undercoat region
                    const localT = t / 0.3;
                    r = this.config.undercoatColor.r * (1 - localT) + this.config.baseColor.r * localT;
                    g = this.config.undercoatColor.g * (1 - localT) + this.config.baseColor.g * localT;
                    b = this.config.undercoatColor.b * (1 - localT) + this.config.baseColor.b * localT;
                }
                else {
                    // Base to tip region
                    const localT = (t - 0.3) / 0.7;
                    r = this.config.baseColor.r * (1 - localT) + this.config.tipColor.r * localT;
                    g = this.config.baseColor.g * (1 - localT) + this.config.tipColor.g * localT;
                    b = this.config.baseColor.b * (1 - localT) + this.config.tipColor.b * localT;
                }
                // Add noise for individual hair variation
                const noise = NoiseUtils.perlin2D(x * 0.1, y * 0.1) * 0.1;
                r = Math.max(0, Math.min(1, r + noise));
                g = Math.max(0, Math.min(1, g + noise));
                b = Math.max(0, Math.min(1, b + noise));
                imageData.data[index] = Math.floor(r * 255);
                imageData.data[index + 1] = Math.floor(g * 255);
                imageData.data[index + 2] = Math.floor(b * 255);
                imageData.data[index + 3] = 255;
            }
        }
        ctx.putImageData(imageData, 0, 0);
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        material.map = texture;
    }
    addStripes(material) {
        const size = 512;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const imageData = ctx.createImageData(size, size);
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const index = (y * size + x) * 4;
                // Get base color from existing texture
                const baseR = imageData.data[index] / 255;
                const baseG = imageData.data[index + 1] / 255;
                const baseB = imageData.data[index + 2] / 255;
                // Create stripe pattern using noise
                const stripeNoise = NoiseUtils.perlin2D(x * 0.05, y * 0.01);
                const stripePattern = Math.sin(stripeNoise * Math.PI * 10) > 0 ? 1 : 0;
                let r = baseR, g = baseG, b = baseB;
                if (stripePattern > 0.5) {
                    // Blend with stripe color
                    const blend = this.config.stripeWidth;
                    r = baseR * (1 - blend) + this.config.stripeColor.r * blend;
                    g = baseG * (1 - blend) + this.config.stripeColor.g * blend;
                    b = baseB * (1 - blend) + this.config.stripeColor.b * blend;
                }
                imageData.data[index] = Math.floor(r * 255);
                imageData.data[index + 1] = Math.floor(g * 255);
                imageData.data[index + 2] = Math.floor(b * 255);
                imageData.data[index + 3] = 255;
            }
        }
        ctx.putImageData(imageData, 0, 0);
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        material.map = texture;
    }
    addSpots(material) {
        const size = 512;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const imageData = ctx.createImageData(size, size);
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const index = (y * size + x) * 4;
                // Get base color
                const baseR = imageData.data[index] / 255;
                const baseG = imageData.data[index + 1] / 255;
                const baseB = imageData.data[index + 2] / 255;
                // Create spot pattern using noise
                const spotNoise1 = NoiseUtils.perlin2D(x * 0.03, y * 0.03);
                const spotNoise2 = NoiseUtils.perlin2D(x * 0.06, y * 0.06) * 0.5;
                const combinedNoise = (spotNoise1 + spotNoise2 + 1) / 2;
                let r = baseR, g = baseG, b = baseB;
                // Create irregular spots
                if (combinedNoise > 1 - this.config.spotSize) {
                    const blend = (combinedNoise - (1 - this.config.spotSize)) / this.config.spotSize;
                    r = baseR * (1 - blend) + this.config.spotColor.r * blend;
                    g = baseG * (1 - blend) + this.config.spotColor.g * blend;
                    b = baseB * (1 - blend) + this.config.spotColor.b * blend;
                }
                imageData.data[index] = Math.floor(r * 255);
                imageData.data[index + 1] = Math.floor(g * 255);
                imageData.data[index + 2] = Math.floor(b * 255);
                imageData.data[index + 3] = 255;
            }
        }
        ctx.putImageData(imageData, 0, 0);
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        material.map = texture;
    }
    /**
     * Get the Three.js material instance
     */
    getMaterial() {
        return this.material;
    }
    /**
     * Update fur configuration dynamically
     */
    updateConfig(config) {
        this.config = { ...this.config, ...config };
        // Update material properties
        this.material.color.set(this.config.baseColor);
        this.material.roughness = this.config.roughness;
        // Regenerate textures if pattern changed
        if (config.enableStripes !== undefined || config.enableSpots !== undefined ||
            config.baseColor !== undefined || config.tipColor !== undefined) {
            this.generateFurGradient(this.material);
            if (this.config.enableStripes) {
                this.addStripes(this.material);
            }
            else if (this.config.enableSpots) {
                this.addSpots(this.material);
            }
        }
    }
    /**
     * Create preset fur types
     */
    static createPreset(preset) {
        switch (preset) {
            case 'cat':
                return new FurMaterial({
                    baseColor: new THREE.Color(0xa1887f),
                    tipColor: new THREE.Color(0xbcaaa4),
                    undercoatColor: new THREE.Color(0x6d4c41),
                    furLength: 0.3,
                    density: 0.8,
                });
            case 'dog':
                return new FurMaterial({
                    baseColor: new THREE.Color(0x8d6e63),
                    tipColor: new THREE.Color(0xa1887f),
                    undercoatColor: new THREE.Color(0x5d4037),
                    furLength: 0.6,
                    density: 0.9,
                });
            case 'tiger':
                return new FurMaterial({
                    baseColor: new THREE.Color(0xff9800),
                    tipColor: new THREE.Color(0xffb74d),
                    undercoatColor: new THREE.Color(0xf57c00),
                    furLength: 0.4,
                    density: 0.85,
                    enableStripes: true,
                    stripeColor: new THREE.Color(0x212121),
                    stripeWidth: 0.3,
                });
            case 'leopard':
                return new FurMaterial({
                    baseColor: new THREE.Color(0xffcc80),
                    tipColor: new THREE.Color(0xffe0b2),
                    undercoatColor: new THREE.Color(0xffa726),
                    furLength: 0.35,
                    density: 0.8,
                    enableSpots: true,
                    spotColor: new THREE.Color(0x3e2723),
                    spotSize: 0.2,
                });
            case 'bear':
                return new FurMaterial({
                    baseColor: new THREE.Color(0x4e342e),
                    tipColor: new THREE.Color(0x6d4c41),
                    undercoatColor: new THREE.Color(0x3e2723),
                    furLength: 0.8,
                    density: 0.95,
                    roughness: 0.9,
                });
            case 'rabbit':
                return new FurMaterial({
                    baseColor: new THREE.Color(0xd7ccc8),
                    tipColor: new THREE.Color(0xefebE9),
                    undercoatColor: new THREE.Color(0xbcAAA4),
                    furLength: 0.5,
                    density: 0.9,
                    roughness: 0.7,
                });
            default:
                return new FurMaterial();
        }
    }
}
//# sourceMappingURL=FurMaterial.js.map