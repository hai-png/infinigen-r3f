/**
 * Material Blending System - Multi-material mixing, gradient blends, mask-based blending
 */
import { CanvasTexture } from 'three';
import { SeededRandom } from '../../../core/util/MathUtils';
import { Noise3D } from '../../../core/util/math/noise';
export class MaterialBlender {
    blend(params, seed) {
        const rng = new SeededRandom(seed);
        const blendMap = this.generateBlendMap(params, rng);
        // In a full implementation, we would create a shader material that blends the two materials
        // For now, we return the blend map which can be used in custom shaders
        return {
            blendedMaterial: params.material1,
            blendMap,
        };
    }
    generateBlendMap(params, rng) {
        const size = 512;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx)
            return new CanvasTexture(canvas);
        switch (params.blendType) {
            case 'linear':
                this.generateLinearBlend(ctx, size, params);
                break;
            case 'gradient':
                this.generateGradientBlend(ctx, size, params);
                break;
            case 'noise':
                this.generateNoiseBlend(ctx, size, params, rng);
                break;
            case 'mask':
                this.generateMaskBlend(ctx, size, params);
                break;
        }
        return new CanvasTexture(canvas);
    }
    generateLinearBlend(ctx, size, params) {
        const gradient = ctx.createLinearGradient(0, 0, size, 0);
        gradient.addColorStop(0, '#000000');
        gradient.addColorStop(params.blendFactor, '#808080');
        gradient.addColorStop(1, '#ffffff');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, size, size);
    }
    generateGradientBlend(ctx, size, params) {
        let gradient;
        if (params.gradientDirection === 'vertical') {
            gradient = ctx.createLinearGradient(0, 0, 0, size);
        }
        else if (params.gradientDirection === 'radial') {
            gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        }
        else {
            gradient = ctx.createLinearGradient(0, 0, size, 0);
        }
        gradient.addColorStop(0, '#000000');
        gradient.addColorStop(1, '#ffffff');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, size, size);
    }
    generateNoiseBlend(ctx, size, params, rng) {
        const noise = new Noise3D(rng.seed);
        for (let y = 0; y < size; y += 4) {
            for (let x = 0; x < size; x += 4) {
                const n = noise.perlin(x / 50 * params.noiseScale, y / 50 * params.noiseScale, 0);
                const value = Math.floor((n + 1) / 2 * 255);
                ctx.fillStyle = `rgb(${value},${value},${value})`;
                ctx.fillRect(x, y, 4, 4);
            }
        }
    }
    generateMaskBlend(ctx, size, params) {
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, size, size);
        // Draw circular mask
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size * params.blendFactor * 0.4, 0, Math.PI * 2);
        ctx.fill();
    }
    getDefaultParams(material1, material2) {
        return {
            material1,
            material2,
            blendFactor: 0.5,
            blendType: 'noise',
            noiseScale: 1.0,
            gradientDirection: 'horizontal',
        };
    }
}
//# sourceMappingURL=MaterialBlender.js.map