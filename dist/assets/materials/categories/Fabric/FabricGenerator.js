/**
 * Fabric Material Generator
 * Generates procedural fabric materials including cotton, linen, wool, velvet, denim
 */
import { Color, CanvasTexture } from 'three';
import { BaseMaterialGenerator } from '../../BaseMaterialGenerator';
import { FixedSeed } from '../../../../core/util/math/utils';
import { Noise3D } from '../../../../core/util/math/noise';
export class FabricGenerator extends BaseMaterialGenerator {
    constructor() {
        super();
    }
    getDefaultParams() {
        return { ...FabricGenerator.DEFAULT_PARAMS };
    }
    generate(params = {}, seed) {
        const finalParams = this.mergeParams(FabricGenerator.DEFAULT_PARAMS, params);
        const rng = seed !== undefined ? new FixedSeed(seed) : this.rng;
        const material = this.createBaseMaterial();
        material.metalness = 0.0;
        // Generate weave pattern
        const weaveTexture = this.generateWeavePattern(finalParams, rng);
        material.map = weaveTexture;
        // Apply base color
        this.applyBaseColor(material, finalParams.color, rng);
        // Add patterns
        if (finalParams.patternType !== 'none') {
            this.applyPattern(material, finalParams, rng);
        }
        // Generate roughness based on fabric type
        this.generateRoughnessMap(material, finalParams, rng);
        // Add fuzziness for velvet/wool
        if (finalParams.fuzziness > 0 && ['velvet', 'wool'].includes(finalParams.type)) {
            this.applyFuzziness(material, finalParams, rng);
        }
        // Add wear
        if (finalParams.wearLevel > 0) {
            this.applyWear(material, finalParams, rng);
        }
        // Add stains
        if (finalParams.stainIntensity > 0) {
            this.applyStains(material, finalParams, rng);
        }
        // Generate normal map for weave detail
        material.normalMap = this.generateNormalMap(finalParams, rng);
        return {
            material,
            maps: {
                map: material.map,
                roughnessMap: material.roughnessMap || null,
                normalMap: material.normalMap,
            },
            params: finalParams,
        };
    }
    generateWeavePattern(params, rng) {
        const size = 512;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx)
            return new CanvasTexture(canvas);
        const threadCount = Math.floor(20 * params.weaveScale);
        const threadSpacing = size / threadCount;
        // Fill background
        ctx.fillStyle = `#${params.color.getHexString()}`;
        ctx.fillRect(0, 0, size, size);
        // Draw weave based on type
        switch (params.weaveType) {
            case 'plain':
                this.drawPlainWeave(ctx, size, threadSpacing, params.color, rng);
                break;
            case 'twill':
                this.drawTwillWeave(ctx, size, threadSpacing, params.color, rng);
                break;
            case 'satin':
                this.drawSatinWeave(ctx, size, threadSpacing, params.color, rng);
                break;
            case 'knit':
                this.drawKnitWeave(ctx, size, threadSpacing, params.color, rng);
                break;
        }
        return new CanvasTexture(canvas);
    }
    drawPlainWeave(ctx, size, spacing, color, rng) {
        for (let y = 0; y < size; y += spacing) {
            const isOdd = Math.floor(y / spacing) % 2 === 1;
            for (let x = 0; x < size; x += spacing) {
                if ((Math.floor(x / spacing) + Math.floor(y / spacing)) % 2 === 0) {
                    ctx.fillStyle = color.clone().multiplyScalar(1.1).getStyle();
                }
                else {
                    ctx.fillStyle = color.clone().multiplyScalar(0.9).getStyle();
                }
                ctx.fillRect(x, y, spacing, spacing);
            }
        }
    }
    drawTwillWeave(ctx, size, spacing, color, rng) {
        for (let y = 0; y < size; y += spacing) {
            for (let x = 0; x < size; x += spacing) {
                const offset = Math.floor(y / spacing);
                if ((Math.floor(x / spacing) + offset) % 4 < 2) {
                    ctx.fillStyle = color.clone().multiplyScalar(1.05).getStyle();
                }
                else {
                    ctx.fillStyle = color.clone().multiplyScalar(0.95).getStyle();
                }
                ctx.fillRect(x, y, spacing, spacing);
            }
        }
    }
    drawSatinWeave(ctx, size, spacing, color, rng) {
        ctx.fillStyle = color.clone().multiplyScalar(1.15).getStyle();
        ctx.fillRect(0, 0, size, size);
        for (let i = 0; i < size; i += spacing * 2) {
            ctx.fillStyle = color.clone().multiplyScalar(0.9).getStyle();
            ctx.fillRect(i, 0, spacing / 2, size);
        }
    }
    drawKnitWeave(ctx, size, spacing, color, rng) {
        for (let row = 0; row < size; row += spacing) {
            for (let col = 0; col < size; col += spacing / 2) {
                const x = col + (row % (spacing * 2) === 0 ? 0 : spacing / 4);
                ctx.beginPath();
                ctx.arc(x, row, spacing / 3, 0, Math.PI * 2);
                ctx.fillStyle = color.clone().multiplyScalar(1.0 + (Math.random() - 0.5) * 0.1).getStyle();
                ctx.fill();
            }
        }
    }
    applyBaseColor(material, color, rng) {
        // Already applied in weave generation
    }
    applyPattern(material, params, rng) {
        const size = 1024;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx)
            return;
        // Copy existing texture
        if (material.map?.image) {
            ctx.drawImage(material.map.image, 0, 0, size, size);
        }
        const patternColor = params.color.clone().multiplyScalar(0.7);
        switch (params.patternType) {
            case 'striped':
                this.drawStripes(ctx, size, patternColor, params.patternScale, rng);
                break;
            case 'checkered':
                this.drawCheckers(ctx, size, patternColor, params.patternScale, rng);
                break;
            case 'floral':
                this.drawFloral(ctx, size, patternColor, params.patternScale, rng);
                break;
            case 'paisley':
                this.drawPaisley(ctx, size, patternColor, params.patternScale, rng);
                break;
        }
        material.map = new CanvasTexture(canvas);
    }
    drawStripes(ctx, size, color, scale, rng) {
        const stripeWidth = 50 / scale;
        ctx.fillStyle = color.getStyle();
        for (let i = 0; i < size; i += stripeWidth * 2) {
            ctx.fillRect(i, 0, stripeWidth, size);
        }
    }
    drawCheckers(ctx, size, color, scale, rng) {
        const checkerSize = 60 / scale;
        ctx.fillStyle = color.getStyle();
        for (let row = 0; row < size; row += checkerSize) {
            for (let col = 0; col < size; col += checkerSize) {
                if ((Math.floor(row / checkerSize) + Math.floor(col / checkerSize)) % 2 === 0) {
                    ctx.fillRect(col, row, checkerSize, checkerSize);
                }
            }
        }
    }
    drawFloral(ctx, size, color, scale, rng) {
        const flowers = Math.floor(10 * scale);
        for (let i = 0; i < flowers; i++) {
            const x = rng.nextFloat() * size;
            const y = rng.nextFloat() * size;
            const radius = 20 + rng.nextFloat() * 30;
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fillStyle = color.getStyle();
            ctx.fill();
        }
    }
    drawPaisley(ctx, size, color, scale, rng) {
        // Simplified paisley pattern
        const shapes = Math.floor(8 * scale);
        for (let i = 0; i < shapes; i++) {
            const x = rng.nextFloat() * size;
            const y = rng.nextFloat() * size;
            ctx.beginPath();
            ctx.ellipse(x, y, 30, 50, Math.PI / 4, 0, Math.PI * 2);
            ctx.fillStyle = color.getStyle();
            ctx.fill();
        }
    }
    generateRoughnessMap(material, params, rng) {
        const size = 512;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx)
            return;
        const baseValue = Math.floor(params.roughness * 255);
        ctx.fillStyle = `rgb(${baseValue}, ${baseValue}, ${baseValue})`;
        ctx.fillRect(0, 0, size, size);
        // Add variation
        const noise = new Noise3D(rng.seed);
        for (let y = 0; y < size; y += 4) {
            for (let x = 0; x < size; x += 4) {
                const n = noise.perlin(x / 50, y / 50, 0) * 40;
                const value = Math.max(100, Math.min(255, baseValue + n));
                ctx.fillStyle = `rgb(${value}, ${value}, ${value})`;
                ctx.fillRect(x, y, 4, 4);
            }
        }
        material.roughnessMap = new CanvasTexture(canvas);
    }
    applyFuzziness(material, params, rng) {
        // Simulated via normal map perturbation
    }
    applyWear(material, params, rng) {
        material.roughness = Math.min(1.0, material.roughness + params.wearLevel * 0.2);
    }
    applyStains(material, params, rng) {
        // Stain application would blend additional textures
    }
    generateNormalMap(params, rng) {
        const size = 512;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx)
            return new CanvasTexture(canvas);
        ctx.fillStyle = '#8080ff';
        ctx.fillRect(0, 0, size, size);
        const noise = new Noise3D(rng.seed);
        for (let y = 0; y < size; y += 2) {
            for (let x = 0; x < size; x += 2) {
                const n = noise.perlin(x / 30, y / 30, 0) * 15;
                const r = 128 + n;
                const g = 128 + n;
                ctx.fillStyle = `rgb(${r}, ${g}, 255)`;
                ctx.fillRect(x, y, 2, 2);
            }
        }
        return new CanvasTexture(canvas);
    }
    getVariations(count) {
        const variations = [];
        const types = ['cotton', 'linen', 'wool', 'velvet', 'denim', 'silk', 'canvas'];
        const weaves = ['plain', 'twill', 'satin', 'knit'];
        const patterns = ['none', 'striped', 'checkered', 'floral', 'paisley'];
        for (let i = 0; i < count; i++) {
            variations.push({
                type: types[this.rng.nextInt(0, types.length - 1)],
                color: new Color().setHSL(this.rng.nextFloat(), 0.5, 0.4 + this.rng.nextFloat() * 0.3),
                weaveType: weaves[this.rng.nextInt(0, weaves.length - 1)],
                weaveScale: 0.5 + this.rng.nextFloat() * 1.5,
                roughness: 0.5 + this.rng.nextFloat() * 0.4,
                fuzziness: this.rng.nextFloat() * 0.5,
                patternType: patterns[this.rng.nextInt(0, patterns.length - 1)],
                patternScale: 0.5 + this.rng.nextFloat() * 1.5,
                wearLevel: this.rng.nextFloat() * 0.4,
                stainIntensity: this.rng.nextFloat() * 0.3,
            });
        }
        return variations;
    }
}
FabricGenerator.DEFAULT_PARAMS = {
    type: 'cotton',
    color: new Color(0x888888),
    weaveType: 'plain',
    weaveScale: 1.0,
    roughness: 0.7,
    fuzziness: 0.2,
    patternType: 'none',
    patternScale: 1.0,
    wearLevel: 0.0,
    stainIntensity: 0.0,
};
//# sourceMappingURL=FabricGenerator.js.map