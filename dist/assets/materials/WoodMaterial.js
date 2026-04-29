import * as THREE from 'three';
/**
 * Procedural Wood Material Generator
 * Creates realistic wood materials with grain patterns using shader-based techniques
 */
export class WoodMaterialGenerator {
    constructor() {
        this.defaultConfigs = {
            oak: {
                baseColor: new THREE.Color(0xd4a574),
                grainColor: new THREE.Color(0x8b6f47),
                grainScale: 2.0,
                grainIntensity: 0.6,
                roughness: 0.7,
                woodType: 'oak'
            },
            pine: {
                baseColor: new THREE.Color(0xf5deb3),
                grainColor: new THREE.Color(0xc4a574),
                grainScale: 1.5,
                grainIntensity: 0.4,
                roughness: 0.8,
                woodType: 'pine'
            },
            walnut: {
                baseColor: new THREE.Color(0x5c4033),
                grainColor: new THREE.Color(0x3e2723),
                grainScale: 2.5,
                grainIntensity: 0.7,
                roughness: 0.6,
                woodType: 'walnut'
            },
            mahogany: {
                baseColor: new THREE.Color(0xc04000),
                grainColor: new THREE.Color(0x8b0000),
                grainScale: 2.2,
                grainIntensity: 0.65,
                roughness: 0.5,
                woodType: 'mahogany'
            },
            cherry: {
                baseColor: new THREE.Color(0xb87333),
                grainColor: new THREE.Color(0x8b4513),
                grainScale: 1.8,
                grainIntensity: 0.55,
                roughness: 0.65,
                woodType: 'cherry'
            }
        };
    }
    /**
     * Generate wood material with custom or preset configuration
     */
    generate(config = {}) {
        const woodType = config.woodType || 'oak';
        const preset = this.defaultConfigs[woodType] || {};
        const finalConfig = {
            baseColor: new THREE.Color().copy(preset.baseColor || new THREE.Color(0xd4a574)),
            grainColor: new THREE.Color().copy(preset.grainColor || new THREE.Color(0x8b6f47)),
            grainScale: preset.grainScale || 2.0,
            grainIntensity: preset.grainIntensity || 0.6,
            roughness: preset.roughness || 0.7,
            metalness: config.metalness || 0.0,
            normalScale: config.normalScale || 1.0,
            woodType
        };
        // Create custom shader material for wood grain
        const material = new THREE.MeshStandardMaterial({
            color: finalConfig.baseColor,
            roughness: finalConfig.roughness,
            metalness: finalConfig.metalness,
        });
        // Add grain pattern via custom shader modification
        this.applyGrainPattern(material, finalConfig);
        return material;
    }
    /**
     * Apply procedural grain pattern to material
     */
    applyGrainPattern(material, config) {
        // Note: In a full implementation, we would use custom shaders
        // For now, we'll create a canvas-based texture for the grain
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        if (!ctx)
            return;
        // Fill base color
        ctx.fillStyle = `#${config.baseColor.getHexString()}`;
        ctx.fillRect(0, 0, 512, 512);
        // Draw grain lines
        const grainColor = `#${config.grainColor.getHexString()}`;
        ctx.strokeStyle = grainColor;
        ctx.lineWidth = 2;
        for (let y = 0; y < 512; y += 4) {
            ctx.beginPath();
            // Create wavy grain pattern
            const offset = Math.sin(y * 0.05) * config.grainScale * 10;
            for (let x = 0; x < 512; x += 2) {
                const wave = Math.sin((x + y) * 0.02) * config.grainScale;
                const noise = (Math.random() - 0.5) * config.grainIntensity * 20;
                if (x === 0) {
                    ctx.moveTo(x, y + offset + wave + noise);
                }
                else {
                    ctx.lineTo(x, y + offset + wave + noise);
                }
            }
            ctx.globalAlpha = config.grainIntensity * 0.5;
            ctx.stroke();
        }
        // Add some darker grain streaks
        for (let i = 0; i < 20; i++) {
            const y = Math.random() * 512;
            const height = 5 + Math.random() * 15;
            const gradient = ctx.createLinearGradient(0, y, 512, y + height);
            gradient.addColorStop(0, 'transparent');
            gradient.addColorStop(0.5, grainColor);
            gradient.addColorStop(1, 'transparent');
            ctx.fillStyle = gradient;
            ctx.globalAlpha = config.grainIntensity * 0.3;
            ctx.fillRect(0, y, 512, height);
        }
        // Create texture from canvas
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(2, 2);
        // Apply as bump map for grain depth
        material.bumpMap = texture;
        material.bumpScale = 0.02;
        // Also use for roughness variation
        material.roughnessMap = texture;
    }
    /**
     * Generate aged/weathered wood variant
     */
    generateWeathered(baseConfig = {}) {
        const config = { ...baseConfig };
        // Desaturate and lighten for weathering effect
        if (config.baseColor) {
            config.baseColor = config.baseColor.clone().offsetHSL(0, -0.2, 0.1);
        }
        // Increase roughness
        config.roughness = Math.min(1.0, (config.roughness || 0.7) + 0.2);
        // Reduce grain intensity
        config.grainIntensity = (config.grainIntensity || 0.6) * 0.6;
        const material = this.generate(config);
        // Add gray tint for weathering
        material.color = material.color?.clone().lerp(new THREE.Color(0x888888), 0.2);
        return material;
    }
    /**
     * Generate polished/treated wood variant
     */
    generatePolished(baseConfig = {}) {
        const config = { ...baseConfig };
        // Deepen colors
        if (config.baseColor) {
            config.baseColor = config.baseColor.clone().offsetHSL(0, 0.1, -0.1);
        }
        // Reduce roughness for shine
        config.roughness = Math.max(0.2, (config.roughness || 0.7) - 0.4);
        // Enhance grain
        config.grainIntensity = (config.grainIntensity || 0.6) * 1.3;
        return this.generate(config);
    }
}
//# sourceMappingURL=WoodMaterial.js.map