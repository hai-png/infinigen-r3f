import * as THREE from 'three';
/**
 * Procedural Metal Material Generator
 * Creates realistic metal materials with surface imperfections
 */
export class MetalMaterialGenerator {
    constructor() {
        this.defaultConfigs = {
            steel: {
                baseColor: new THREE.Color(0x888888),
                roughness: 0.4,
                metalness: 1.0,
                clearcoat: 0.3,
                metalType: 'steel'
            },
            aluminum: {
                baseColor: new THREE.Color(0xcccccc),
                roughness: 0.5,
                metalness: 1.0,
                clearcoat: 0.1,
                metalType: 'aluminum'
            },
            copper: {
                baseColor: new THREE.Color(0xb87333),
                roughness: 0.3,
                metalness: 1.0,
                clearcoat: 0.2,
                metalType: 'copper'
            },
            brass: {
                baseColor: new THREE.Color(0xffd700),
                roughness: 0.35,
                metalness: 1.0,
                clearcoat: 0.25,
                metalType: 'brass'
            },
            gold: {
                baseColor: new THREE.Color(0xffe55c),
                roughness: 0.2,
                metalness: 1.0,
                clearcoat: 0.4,
                metalType: 'gold'
            },
            iron: {
                baseColor: new THREE.Color(0x666666),
                roughness: 0.6,
                metalness: 0.9,
                clearcoat: 0.0,
                metalType: 'iron'
            },
            chrome: {
                baseColor: new THREE.Color(0xe8e8e8),
                roughness: 0.1,
                metalness: 1.0,
                clearcoat: 0.8,
                clearcoatRoughness: 0.05,
                metalType: 'chrome'
            }
        };
    }
    /**
     * Generate metal material with custom or preset configuration
     */
    generate(config = {}) {
        const metalType = config.metalType || 'steel';
        const preset = this.defaultConfigs[metalType] || {};
        const finalConfig = {
            baseColor: new THREE.Color().copy(preset.baseColor || new THREE.Color(0x888888)),
            roughness: preset.roughness ?? 0.4,
            metalness: preset.metalness ?? 1.0,
            normalScale: config.normalScale ?? 1.0,
            clearcoat: preset.clearcoat ?? 0.0,
            clearcoatRoughness: preset.clearcoatRoughness ?? 0.5,
            hasScratches: config.hasScratches ?? false,
            hasRust: config.hasRust ?? false,
            metalType
        };
        const material = new THREE.MeshStandardMaterial({
            color: finalConfig.baseColor,
            roughness: finalConfig.roughness,
            metalness: finalConfig.metalness,
            clearcoat: finalConfig.clearcoat,
            clearcoatRoughness: finalConfig.clearcoatRoughness,
        });
        // Add surface imperfections
        if (finalConfig.hasScratches) {
            this.addScratches(material, finalConfig);
        }
        if (finalConfig.hasRust) {
            this.addRust(material, finalConfig);
        }
        return material;
    }
    /**
     * Add procedural scratch pattern to material
     */
    addScratches(material, config) {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        if (!ctx)
            return;
        // Fill with base roughness
        ctx.fillStyle = '#808080';
        ctx.fillRect(0, 0, 512, 512);
        // Draw scratches
        ctx.strokeStyle = '#404040';
        ctx.lineWidth = 1;
        const scratchCount = 30 + Math.random() * 20;
        for (let i = 0; i < scratchCount; i++) {
            const x = Math.random() * 512;
            const y = Math.random() * 512;
            const length = 20 + Math.random() * 100;
            const angle = Math.random() * Math.PI;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
            ctx.globalAlpha = 0.3 + Math.random() * 0.4;
            ctx.stroke();
        }
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(3, 3);
        // Apply to roughness map for scratch visibility
        material.roughnessMap = texture;
        material.roughness = Math.max(0.1, config.roughness - 0.1);
    }
    /**
     * Add rust effect to material
     */
    addRust(material, config) {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        if (!ctx)
            return;
        // Create rust pattern
        const rustColor = new THREE.Color(0x8b4513);
        const baseColor = config.baseColor;
        for (let y = 0; y < 512; y += 2) {
            for (let x = 0; x < 512; x += 2) {
                const noise = Math.random();
                const rustIntensity = noise > 0.7 ? (noise - 0.7) / 0.3 : 0;
                const r = Math.floor(baseColor.r * (1 - rustIntensity) + rustColor.r * rustIntensity);
                const g = Math.floor(baseColor.g * (1 - rustIntensity) + rustColor.g * rustIntensity);
                const b = Math.floor(baseColor.b * (1 - rustIntensity) + rustColor.b * rustIntensity);
                ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
                ctx.fillRect(x, y, 2, 2);
            }
        }
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(2, 2);
        // Apply as color modulation
        material.color = baseColor.clone().lerp(rustColor, 0.3);
        material.roughnessMap = texture;
        material.roughness = Math.min(1.0, config.roughness + 0.3);
        material.metalness = Math.max(0.0, config.metalness - 0.4);
    }
    /**
     * Generate brushed metal variant
     */
    generateBrushed(baseConfig = {}) {
        const config = { ...baseConfig };
        // Create anisotropic effect via texture
        const material = this.generate(config);
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            // Draw horizontal brush lines
            ctx.fillStyle = '#808080';
            ctx.fillRect(0, 0, 512, 512);
            ctx.strokeStyle = '#606060';
            ctx.lineWidth = 1;
            for (let y = 0; y < 512; y += 2) {
                ctx.globalAlpha = 0.2 + Math.random() * 0.2;
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(512, y);
                ctx.stroke();
            }
            const texture = new THREE.CanvasTexture(canvas);
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.set(1, 4);
            material.roughnessMap = texture;
        }
        return material;
    }
    /**
     * Generate worn/aged metal variant
     */
    generateWorn(baseConfig = {}) {
        const config = { ...baseConfig };
        // Increase roughness and add wear patterns
        config.roughness = Math.min(1.0, (config.roughness || 0.4) + 0.3);
        config.hasScratches = true;
        return this.generate(config);
    }
}
//# sourceMappingURL=MetalMaterial.js.map