/**
 * Wood Material Generator - Hardwood, softwood, plywood, reclaimed
 */
import { Color, CanvasTexture } from 'three';
import { BaseMaterialGenerator } from '../../BaseMaterialGenerator';
import { SeededRandom } from "../../../../core/util/MathUtils";
import { Noise3D } from '../../../../core/util/math/noise';
export class WoodGenerator extends BaseMaterialGenerator {
    constructor() { super(); }
    getDefaultParams() { return { ...WoodGenerator.DEFAULT_PARAMS }; }
    generate(params = {}, seed) {
        const finalParams = this.mergeParams(WoodGenerator.DEFAULT_PARAMS, params);
        const rng = seed !== undefined ? new SeededRandom(seed) : this.rng;
        const material = this.createBaseMaterial();
        material.color = finalParams.color;
        material.roughness = finalParams.roughness;
        material.metalness = 0.0;
        material.map = this.generateGrainTexture(finalParams, rng);
        material.normalMap = this.generateNormalMap(finalParams, rng);
        if (finalParams.finishType === 'gloss')
            material.roughness = 0.2;
        else if (finalParams.finishType === 'matte')
            material.roughness = 0.6;
        return { material, maps: { map: material.map, roughnessMap: null, normalMap: material.normalMap }, params: finalParams };
    }
    generateGrainTexture(params, rng) {
        const size = 1024;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx)
            return new CanvasTexture(canvas);
        ctx.fillStyle = `#${params.color.getHexString()}`;
        ctx.fillRect(0, 0, size, size);
        const noise = new Noise3D(rng.seed);
        // Draw grain lines
        for (let y = 0; y < size; y += 2) {
            const offset = noise.perlin(0, y / 50 * params.grainScale, 0) * 20 * params.grainIntensity;
            for (let x = 0; x < size; x += 2) {
                const grainX = x + offset;
                const n = noise.perlin(grainX / 100, y / 100, 0) * params.grainIntensity * 40;
                const r = Math.max(0, Math.min(255, params.color.r * 255 + n));
                const g = Math.max(0, Math.min(255, params.color.g * 255 + n * 0.8));
                const b = Math.max(0, Math.min(255, params.color.b * 255 + n * 0.6));
                ctx.fillStyle = `rgb(${r},${g},${b})`;
                ctx.fillRect(x, y, 2, 2);
            }
        }
        // Add knots
        if (params.knotDensity > 0) {
            const numKnots = Math.floor(params.knotDensity * 10);
            for (let i = 0; i < numKnots; i++) {
                const kx = rng.nextFloat() * size;
                const ky = rng.nextFloat() * size;
                const kr = 10 + rng.nextFloat() * 30;
                const gradient = ctx.createRadialGradient(kx, ky, 0, kx, ky, kr);
                gradient.addColorStop(0, '#3d2817');
                gradient.addColorStop(1, `#${params.color.getHexString()}`);
                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.arc(kx, ky, kr, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        return new CanvasTexture(canvas);
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
        for (let y = 0; y < size; y += 4) {
            const offset = noise.perlin(0, y / 50, 0) * 10;
            for (let x = 0; x < size; x += 4) {
                const n = noise.perlin((x + offset) / 80, y / 80, 0) * 15;
                ctx.fillStyle = `rgb(${128 + n}, ${128 + n}, 255)`;
                ctx.fillRect(x, y, 4, 4);
            }
        }
        return new CanvasTexture(canvas);
    }
    getVariations(count) {
        const variations = [];
        const types = ['oak', 'pine', 'walnut', 'mahogany', 'plywood', 'reclaimed'];
        for (let i = 0; i < count; i++) {
            variations.push({
                type: types[this.rng.nextInt(0, types.length - 1)],
                color: new Color().setHSL(0.05 + this.rng.nextFloat() * 0.1, 0.4 + this.rng.nextFloat() * 0.3, 0.3 + this.rng.nextFloat() * 0.4),
                grainIntensity: 0.4 + this.rng.nextFloat() * 0.5,
                grainScale: 0.5 + this.rng.nextFloat() * 1.5,
                roughness: 0.3 + this.rng.nextFloat() * 0.4,
                knotDensity: this.rng.nextFloat() * 0.5,
                finishType: ['matte', 'satin', 'gloss'][this.rng.nextInt(0, 2)],
            });
        }
        return variations;
    }
}
WoodGenerator.DEFAULT_PARAMS = {
    type: 'oak',
    color: new Color(0x8b6f47),
    grainIntensity: 0.6,
    grainScale: 1.0,
    roughness: 0.5,
    knotDensity: 0.3,
    finishType: 'satin',
};
//# sourceMappingURL=WoodGenerator.js.map