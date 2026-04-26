import * as THREE from 'three';
import { NoiseUtils } from '../../../utils/NoiseUtils';
/**
 * Realistic reptilian/dragon scale material with iridescence
 */
export class ScaleMaterial {
    constructor(config) {
        this.config = {
            baseColor: new THREE.Color(0x2e7d32),
            edgeColor: new THREE.Color(0x1b5e20),
            iridescentColor: new THREE.Color(0x9c27b0),
            scaleSize: 0.5,
            pattern: 'round',
            roughness: 0.3,
            metalness: 0.1,
            iridescence: 0.5,
            ior: 1.5,
            normalStrength: 0.8,
            enableBioluminescence: false,
            bioluminescentColor: new THREE.Color(0x00ffff),
            bioluminescenceIntensity: 1.0,
            ...config,
        };
        this.material = this.createMaterial();
    }
    createMaterial() {
        const material = new THREE.MeshPhysicalMaterial({
            color: this.config.baseColor,
            roughness: this.config.roughness,
            metalness: this.config.metalness,
            iridescence: this.config.iridescence,
            iridescenceIOR: this.config.ior,
            iridescenceColor: this.config.iridescentColor,
            clearcoat: 0.8,
            clearcoatRoughness: 0.2,
            side: THREE.DoubleSide,
        });
        // Generate scale pattern texture
        this.generateScalePattern(material);
        // Add bioluminescence if enabled
        if (this.config.enableBioluminescence) {
            this.addBioluminescence(material);
        }
        return material;
    }
    generateScalePattern(material) {
        const size = 1024;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const imageData = ctx.createImageData(size, size);
        const scaleFreq = 10 + this.config.scaleSize * 20;
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const index = (y * size + x) * 4;
                let scaleValue = 0;
                switch (this.config.pattern) {
                    case 'round':
                        scaleValue = this.generateRoundScales(x, y, size, scaleFreq);
                        break;
                    case 'hexagonal':
                        scaleValue = this.generateHexagonalScales(x, y, size, scaleFreq);
                        break;
                    case 'diamond':
                        scaleValue = this.generateDiamondScales(x, y, size, scaleFreq);
                        break;
                    case 'jagged':
                        scaleValue = this.generateJaggedScales(x, y, size, scaleFreq);
                        break;
                }
                // Apply edge color to scale boundaries
                const noise = NoiseUtils.perlin2D(x * 0.05, y * 0.05);
                const variation = noise * 0.2;
                // Blend base and edge colors based on scale value
                const r = this.config.baseColor.r * (1 - scaleValue) + this.config.edgeColor.r * scaleValue + variation;
                const g = this.config.baseColor.g * (1 - scaleValue) + this.config.edgeColor.g * scaleValue + variation;
                const b = this.config.baseColor.b * (1 - scaleValue) + this.config.edgeColor.b * scaleValue + variation;
                imageData.data[index] = Math.min(255, Math.floor(r * 255));
                imageData.data[index + 1] = Math.min(255, Math.floor(g * 255));
                imageData.data[index + 2] = Math.min(255, Math.floor(b * 255));
                imageData.data[index + 3] = 255;
            }
        }
        ctx.putImageData(imageData, 0, 0);
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(5, 5);
        // Use as normal map for scale relief
        material.normalMap = texture;
        material.normalScale = new THREE.Vector2(this.config.normalStrength, this.config.normalStrength);
    }
    generateRoundScales(x, y, size, freq) {
        const u = x / size;
        const v = y / size;
        const cx = Math.floor(u * freq) / freq;
        const cy = Math.floor(v * freq) / freq;
        const dx = u - (cx + 0.5 / freq);
        const dy = v - (cy + 0.5 / freq);
        const dist = Math.sqrt(dx * dx + dy * dy) * freq;
        // Create rounded scale shape with raised center
        const scaleShape = Math.max(0, 1 - dist * 2);
        return scaleShape * 0.5 + 0.5;
    }
    generateHexagonalScales(x, y, size, freq) {
        const u = x / size;
        const v = y / size;
        const row = Math.floor(v * freq);
        const offset = (row % 2) * 0.5 / freq;
        const cx = Math.floor((u - offset) * freq) / freq + offset;
        const cy = Math.floor(v * freq) / freq;
        const dx = u - cx;
        const dy = v - cy;
        const dist = Math.sqrt(dx * dx + dy * dy) * freq;
        const scaleShape = Math.max(0, 1 - dist * 1.5);
        return scaleShape * 0.5 + 0.5;
    }
    generateDiamondScales(x, y, size, freq) {
        const u = x / size;
        const v = y / size;
        const cx = Math.floor(u * freq) / freq;
        const cy = Math.floor(v * freq) / freq;
        const dx = Math.abs(u - (cx + 0.5 / freq)) * freq;
        const dy = Math.abs(v - (cy + 0.5 / freq)) * freq;
        const dist = dx + dy;
        const scaleShape = Math.max(0, 1 - dist);
        return scaleShape * 0.5 + 0.5;
    }
    generateJaggedScales(x, y, size, freq) {
        const u = x / size;
        const v = y / size;
        const noise1 = NoiseUtils.perlin2D(u * freq, v * freq);
        const noise2 = NoiseUtils.perlin2D(u * freq * 2, v * freq * 2) * 0.5;
        const combined = (noise1 + noise2 + 1) / 2;
        return combined;
    }
    addBioluminescence(material) {
        // Create emissive pattern for bioluminescence
        const size = 512;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const imageData = ctx.createImageData(size, size);
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const index = (y * size + x) * 4;
                // Pulsing bioluminescent pattern
                const noise = NoiseUtils.perlin2D(x * 0.03, y * 0.03);
                const pattern = Math.sin(noise * Math.PI * 4) * 0.5 + 0.5;
                const intensity = pattern > 0.7 ? pattern : 0;
                imageData.data[index] = Math.floor(this.config.bioluminescentColor.r * 255 * intensity);
                imageData.data[index + 1] = Math.floor(this.config.bioluminescentColor.g * 255 * intensity);
                imageData.data[index + 2] = Math.floor(this.config.bioluminescentColor.b * 255 * intensity);
                imageData.data[index + 3] = Math.floor(intensity * 255);
            }
        }
        ctx.putImageData(imageData, 0, 0);
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        material.emissiveMap = texture;
        material.emissive = this.config.bioluminescentColor;
        material.emissiveIntensity = this.config.bioluminescenceIntensity;
    }
    /**
     * Get the Three.js material instance
     */
    getMaterial() {
        return this.material;
    }
    /**
     * Update scale configuration dynamically
     */
    updateConfig(config) {
        this.config = { ...this.config, ...config };
        // Update material properties
        this.material.color.set(this.config.baseColor);
        this.material.roughness = this.config.roughness;
        this.material.metalness = this.config.metalness;
        this.material.iridescence = this.config.iridescence;
        this.material.iridescenceIOR = this.config.ior;
        this.material.iridescenceColor.set(this.config.iridescentColor);
        this.material.clearcoat = 0.8;
        this.material.clearcoatRoughness = 0.2;
        // Regenerate textures if pattern changed
        if (config.pattern !== undefined || config.scaleSize !== undefined) {
            this.generateScalePattern(this.material);
        }
        // Update bioluminescence
        if (config.enableBioluminescence !== undefined) {
            if (this.config.enableBioluminescence) {
                this.addBioluminescence(this.material);
            }
            else {
                this.material.emissiveMap = null;
                this.material.emissive = new THREE.Color(0x000000);
                this.material.emissiveIntensity = 0;
            }
        }
    }
    /**
     * Create preset scale types
     */
    static createPreset(preset) {
        switch (preset) {
            case 'snake':
                return new ScaleMaterial({
                    baseColor: new THREE.Color(0x4a7c23),
                    edgeColor: new THREE.Color(0x2d5016),
                    pattern: 'hexagonal',
                    scaleSize: 0.3,
                    roughness: 0.4,
                    iridescence: 0.3,
                });
            case 'dragon':
                return new ScaleMaterial({
                    baseColor: new THREE.Color(0x8b0000),
                    edgeColor: new THREE.Color(0x4a0000),
                    iridescentColor: new THREE.Color(0xff4500),
                    pattern: 'diamond',
                    scaleSize: 0.6,
                    roughness: 0.2,
                    metalness: 0.3,
                    iridescence: 0.8,
                });
            case 'fish':
                return new ScaleMaterial({
                    baseColor: new THREE.Color(0x4fc3f7),
                    edgeColor: new THREE.Color(0x0288d1),
                    iridescentColor: new THREE.Color(0xffffff),
                    pattern: 'round',
                    scaleSize: 0.4,
                    roughness: 0.3,
                    iridescence: 0.9,
                });
            case 'lizard':
                return new ScaleMaterial({
                    baseColor: new THREE.Color(0x8d6e63),
                    edgeColor: new THREE.Color(0x5d4037),
                    pattern: 'jagged',
                    scaleSize: 0.5,
                    roughness: 0.5,
                    iridescence: 0.2,
                });
            case 'fantasy':
                return new ScaleMaterial({
                    baseColor: new THREE.Color(0x6a1b9a),
                    edgeColor: new THREE.Color(0x4a148c),
                    iridescentColor: new THREE.Color(0x00e5ff),
                    pattern: 'hexagonal',
                    scaleSize: 0.7,
                    roughness: 0.1,
                    metalness: 0.4,
                    iridescence: 1.0,
                    enableBioluminescence: true,
                    bioluminescentColor: new THREE.Color(0x00e5ff),
                    bioluminescenceIntensity: 1.5,
                });
            default:
                return new ScaleMaterial();
        }
    }
}
//# sourceMappingURL=ScaleMaterial.js.map