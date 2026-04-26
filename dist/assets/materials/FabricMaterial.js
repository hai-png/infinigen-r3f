import * as THREE from 'three';
/**
 * Procedural Fabric Material Generator
 * Creates realistic fabric materials with weave patterns and textures
 */
export class FabricMaterialGenerator {
    constructor() {
        this.defaultConfigs = {
            cotton: {
                baseColor: new THREE.Color(0xf5f5dc),
                roughness: 0.7,
                metalness: 0.0,
                fabricType: 'cotton'
            },
            silk: {
                baseColor: new THREE.Color(0xffd700),
                roughness: 0.3,
                metalness: 0.1,
                fabricType: 'silk'
            },
            denim: {
                baseColor: new THREE.Color(0x4682b4),
                roughness: 0.6,
                metalness: 0.0,
                fabricType: 'denim'
            },
            velvet: {
                baseColor: new THREE.Color(0x800020),
                roughness: 0.9,
                metalness: 0.0,
                fabricType: 'velvet'
            },
            leather: {
                baseColor: new THREE.Color(0x8b4513),
                roughness: 0.5,
                metalness: 0.0,
                fabricType: 'leather'
            },
            wool: {
                baseColor: new THREE.Color(0xa0a0a0),
                roughness: 0.8,
                metalness: 0.0,
                fabricType: 'wool'
            },
            linen: {
                baseColor: new THREE.Color(0xe8dcc4),
                roughness: 0.75,
                metalness: 0.0,
                fabricType: 'linen'
            }
        };
    }
    /**
     * Generate fabric material with custom or preset configuration
     */
    generate(config = {}) {
        const fabricType = config.fabricType || 'cotton';
        const preset = this.defaultConfigs[fabricType] || {};
        const finalConfig = {
            baseColor: new THREE.Color().copy(preset.baseColor || new THREE.Color(0xf5f5dc)),
            patternColor: config.patternColor || new THREE.Color(0xffffff),
            roughness: preset.roughness ?? 0.7,
            metalness: preset.metalness ?? 0.0,
            normalScale: config.normalScale ?? 1.0,
            hasPattern: config.hasPattern ?? false,
            patternType: config.patternType || 'none',
            fabricType
        };
        const material = new THREE.MeshStandardMaterial({
            color: finalConfig.baseColor,
            roughness: finalConfig.roughness,
            metalness: finalConfig.metalness,
        });
        // Add weave pattern texture
        this.applyWeavePattern(material, finalConfig);
        // Add optional pattern overlay
        if (finalConfig.hasPattern && finalConfig.patternType) {
            this.applyPattern(material, finalConfig);
        }
        return material;
    }
    /**
     * Apply procedural weave pattern to material
     */
    applyWeavePattern(material, config) {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        if (!ctx)
            return;
        // Fill base color
        ctx.fillStyle = `#${config.baseColor.getHexString()}`;
        ctx.fillRect(0, 0, 256, 256);
        // Create weave pattern based on fabric type
        const threadSpacing = this.getThreadSpacing(config.fabricType);
        const threadWidth = this.getThreadWidth(config.fabricType);
        ctx.strokeStyle = this.adjustColor(config.baseColor, -0.1).getHexString();
        ctx.lineWidth = threadWidth;
        // Horizontal threads
        for (let y = 0; y < 256; y += threadSpacing) {
            ctx.globalAlpha = 0.3;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(256, y);
            ctx.stroke();
        }
        // Vertical threads
        for (let x = 0; x < 256; x += threadSpacing) {
            ctx.globalAlpha = 0.25;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, 256);
            ctx.stroke();
        }
        // Add noise for texture variation
        this.addNoise(ctx, 256, 256, 0.05);
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(4, 4);
        // Apply as bump map for weave depth
        material.bumpMap = texture;
        material.bumpScale = 0.01;
        // Apply as roughness variation
        material.roughnessMap = texture;
    }
    /**
     * Apply decorative pattern overlay
     */
    applyPattern(material, config) {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        if (!ctx)
            return;
        ctx.clearRect(0, 0, 256, 256);
        switch (config.patternType) {
            case 'stripes':
                this.drawStripes(ctx, config);
                break;
            case 'checks':
                this.drawChecks(ctx, config);
                break;
            case 'dots':
                this.drawDots(ctx, config);
                break;
        }
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(2, 2);
        texture.colorSpace = THREE.SRGBColorSpace;
        // Blend with base color
        material.color = config.baseColor.clone();
    }
    /**
     * Draw stripe pattern
     */
    drawStripes(ctx, config) {
        const stripeWidth = 20;
        ctx.fillStyle = `#${config.patternColor.getHexString()}`;
        for (let x = 0; x < 256; x += stripeWidth * 2) {
            ctx.fillRect(x, 0, stripeWidth, 256);
        }
    }
    /**
     * Draw checkered pattern
     */
    drawChecks(ctx, config) {
        const checkSize = 32;
        ctx.fillStyle = `#${config.patternColor.getHexString()}`;
        for (let y = 0; y < 256; y += checkSize) {
            for (let x = 0; x < 256; x += checkSize) {
                if (((x / checkSize) + (y / checkSize)) % 2 === 0) {
                    ctx.fillRect(x, y, checkSize, checkSize);
                }
            }
        }
    }
    /**
     * Draw polka dot pattern
     */
    drawDots(ctx, config) {
        const dotRadius = 8;
        const spacing = 32;
        ctx.fillStyle = `#${config.patternColor.getHexString()}`;
        for (let y = 0; y < 256; y += spacing) {
            for (let x = 0; x < 256; x += spacing) {
                ctx.beginPath();
                ctx.arc(x + spacing / 2, y + spacing / 2, dotRadius, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }
    /**
     * Add noise to canvas context
     */
    addNoise(ctx, width, height, intensity) {
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
            const noise = (Math.random() - 0.5) * intensity * 255;
            data[i] = Math.max(0, Math.min(255, data[i] + noise));
            data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
            data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
        }
        ctx.putImageData(imageData, 0, 0);
    }
    /**
     * Get thread spacing based on fabric type
     */
    getThreadSpacing(fabricType) {
        const spacing = {
            cotton: 8,
            silk: 4,
            denim: 6,
            velvet: 3,
            leather: 20,
            wool: 10,
            linen: 7
        };
        return spacing[fabricType] || 8;
    }
    /**
     * Get thread width based on fabric type
     */
    getThreadWidth(fabricType) {
        const widths = {
            cotton: 2,
            silk: 1,
            denim: 2,
            velvet: 1,
            leather: 3,
            wool: 3,
            linen: 2
        };
        return widths[fabricType] || 2;
    }
    /**
     * Adjust color brightness
     */
    adjustColor(color, amount) {
        const hsl = { h: 0, s: 0, l: 0 };
        color.getHSL(hsl);
        hsl.l = Math.max(0, Math.min(1, hsl.l + amount));
        return new THREE.Color().setHSL(hsl.h, hsl.s, hsl.l);
    }
    /**
     * Generate worn/faded fabric variant
     */
    generateWorn(baseConfig = {}) {
        const config = { ...baseConfig };
        // Fade colors
        if (config.baseColor) {
            config.baseColor = config.baseColor.clone().offsetHSL(0, -0.1, 0.15);
        }
        // Increase roughness
        config.roughness = Math.min(1.0, (config.roughness || 0.7) + 0.15);
        return this.generate(config);
    }
    /**
     * Generate quilted/padded fabric variant
     */
    generateQuilted(baseConfig = {}) {
        const config = { ...baseConfig };
        const material = this.generate(config);
        // Create quilted pattern
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.fillStyle = '#808080';
            ctx.fillRect(0, 0, 128, 128);
            // Draw diamond pattern
            ctx.strokeStyle = '#404040';
            ctx.lineWidth = 2;
            for (let i = -128; i < 256; i += 32) {
                ctx.beginPath();
                ctx.moveTo(i, 0);
                ctx.lineTo(i + 64, 128);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(i + 128, 0);
                ctx.lineTo(i, 128);
                ctx.stroke();
            }
            const texture = new THREE.CanvasTexture(canvas);
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.set(4, 4);
            material.bumpMap = texture;
            material.bumpScale = 0.03;
        }
        return material;
    }
}
//# sourceMappingURL=FabricMaterial.js.map