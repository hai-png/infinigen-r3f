import * as THREE from 'three';
import { NoiseUtils } from '../../utils/NoiseUtils';
/**
 * Realistic skin material with subsurface scattering
 */
export class SkinMaterial {
    constructor(config) {
        this.config = {
            baseColor: new THREE.Color(0xffdbac),
            subsurfaceColor: new THREE.Color(0xff6b5b),
            subsurfaceRadius: new THREE.Vector3(0.7, 0.4, 0.3),
            subsurfaceAmount: 0.5,
            roughness: 0.4,
            specular: 0.5,
            normalStrength: 0.2,
            enableFreckles: false,
            freckleDensity: 0.3,
            freckleColor: new THREE.Color(0x8b6f47),
            enableWrinkles: false,
            wrinkleDepth: 0.1,
            skinType: 'human',
            ...config,
        };
        this.material = this.createMaterial();
    }
    createMaterial() {
        const material = new THREE.MeshPhysicalMaterial({
            color: this.config.baseColor,
            roughness: this.config.roughness,
            metalness: 0.0,
            specularIntensity: this.config.specular,
            clearcoat: 0.3,
            clearcoatRoughness: 0.4,
            thickness: 1.0,
            attenuationColor: this.config.subsurfaceColor,
            attenuationDistance: 0.5 / this.config.subsurfaceAmount,
            side: THREE.DoubleSide,
        });
        // Generate subsurface scattering texture
        if (this.config.subsurfaceAmount > 0) {
            this.generateSubsurfaceMap(material);
        }
        // Generate skin detail texture
        this.generateSkinDetailMap(material);
        return material;
    }
    generateSubsurfaceMap(material) {
        const size = 512;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        // Create noise-based subsurface variation
        const imageData = ctx.createImageData(size, size);
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const index = (y * size + x) * 4;
                const noise = NoiseUtils.perlin2D(x * 0.02, y * 0.02);
                const value = Math.floor(128 + noise * 64);
                // Subsurface varies slightly across skin
                imageData.data[index] = value;
                imageData.data[index + 1] = value;
                imageData.data[index + 2] = value;
                imageData.data[index + 3] = 255;
            }
        }
        ctx.putImageData(imageData, 0, 0);
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        // Use thickness map to control subsurface scattering
        material.thicknessMap = texture;
    }
    generateSkinDetailMap(material) {
        const size = 1024;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const imageData = ctx.createImageData(size, size);
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const index = (y * size + x) * 4;
                // Pore detail using high-frequency noise
                const poreNoise = NoiseUtils.perlin2D(x * 0.1, y * 0.1);
                const fineNoise = NoiseUtils.perlin2D(x * 0.3, y * 0.3) * 0.5;
                let detail = poreNoise * 0.7 + fineNoise * 0.3;
                // Add freckles if enabled
                if (this.config.enableFreckles) {
                    const freckleNoise = NoiseUtils.perlin2D(x * 0.05, y * 0.05);
                    if (freckleNoise > 1 - this.config.freckleDensity * 2) {
                        detail -= 0.3; // Darker spots
                    }
                }
                // Add wrinkles if enabled
                if (this.config.enableWrinkles) {
                    const wrinkleFreq = 0.01;
                    const wrinkle1 = Math.sin(x * wrinkleFreq + y * wrinkleFreq * 0.5);
                    const wrinkle2 = Math.cos(x * wrinkleFreq * 0.8 - y * wrinkleFreq);
                    const wrinklePattern = (wrinkle1 + wrinkle2) * 0.5;
                    if (wrinklePattern > 0.7) {
                        detail -= this.config.wrinkleDepth;
                    }
                }
                const value = Math.floor(128 + detail * 128);
                imageData.data[index] = value;
                imageData.data[index + 1] = value;
                imageData.data[index + 2] = value;
                imageData.data[index + 3] = 255;
            }
        }
        ctx.putImageData(imageData, 0, 0);
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        material.normalScale = new THREE.Vector2(this.config.normalStrength, this.config.normalStrength);
    }
    /**
     * Get the Three.js material instance
     */
    getMaterial() {
        return this.material;
    }
    /**
     * Update skin configuration dynamically
     */
    updateConfig(config) {
        this.config = { ...this.config, ...config };
        // Update material properties
        this.material.color.set(this.config.baseColor);
        this.material.roughness = this.config.roughness;
        this.material.specularIntensity = this.config.specular;
        this.material.attenuationColor.set(this.config.subsurfaceColor);
        this.material.attenuationDistance = 0.5 / this.config.subsurfaceAmount;
        // Regenerate textures if needed
        if (config.subsurfaceAmount !== undefined || config.enableFreckles !== undefined) {
            this.generateSubsurfaceMap(this.material);
        }
        if (config.normalStrength !== undefined || config.enableWrinkles !== undefined) {
            this.generateSkinDetailMap(this.material);
        }
    }
    /**
     * Create preset skin types
     */
    static createPreset(preset) {
        switch (preset) {
            case 'fair':
                return new SkinMaterial({
                    baseColor: new THREE.Color(0xffdbac),
                    subsurfaceColor: new THREE.Color(0xff6b5b),
                    roughness: 0.35,
                    enableFreckles: true,
                    freckleDensity: 0.4,
                });
            case 'medium':
                return new SkinMaterial({
                    baseColor: new THREE.Color(0xd4a574),
                    subsurfaceColor: new THREE.Color(0xff5544),
                    roughness: 0.4,
                });
            case 'dark':
                return new SkinMaterial({
                    baseColor: new THREE.Color(0x8d5524),
                    subsurfaceColor: new THREE.Color(0xcc4433),
                    roughness: 0.45,
                    specular: 0.4,
                });
            case 'alien':
                return new SkinMaterial({
                    baseColor: new THREE.Color(0x7cb342),
                    subsurfaceColor: new THREE.Color(0x4caf50),
                    roughness: 0.3,
                    specular: 0.6,
                    skinType: 'alien',
                });
            case 'zombie':
                return new SkinMaterial({
                    baseColor: new THREE.Color(0x6b7f5c),
                    subsurfaceColor: new THREE.Color(0x4a5d3f),
                    roughness: 0.6,
                    specular: 0.3,
                    enableWrinkles: true,
                    wrinkleDepth: 0.2,
                });
            default:
                return new SkinMaterial();
        }
    }
}
//# sourceMappingURL=SkinMaterial.js.map