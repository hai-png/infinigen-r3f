/**
 * Plastic Material Generator - Matte, glossy, textured plastic
 */
import { Color, CanvasTexture } from 'three';
import { BaseMaterialGenerator } from '../../BaseMaterialGenerator';
import { SeededRandom } from "../../../../core/util/MathUtils";
import { Noise3D } from '../../../../core/util/math/noise';
export class PlasticGenerator extends BaseMaterialGenerator {
    constructor() { super(); }
    getDefaultParams() { return { ...PlasticGenerator.DEFAULT_PARAMS }; }
    generate(params = {}, seed) {
        const finalParams = this.mergeParams(PlasticGenerator.DEFAULT_PARAMS, params);
        const rng = seed !== undefined ? new SeededRandom(seed) : this.rng;
        const material = this.createBaseMaterial();
        material.color = finalParams.color;
        material.roughness = finalParams.roughness;
        material.metalness = finalParams.metalness;
        material.transmission = finalParams.transmission;
        if (finalParams.type === 'glossy')
            material.roughness = 0.1;
        else if (finalParams.type === 'matte')
            material.roughness = 0.6;
        else if (finalParams.type === 'textured') {
            material.map = this.generateTexture(finalParams, rng);
            material.normalMap = this.generateNormalMap(finalParams, rng);
        }
        return { material, maps: { map: material.map || null, roughnessMap: null, normalMap: material.normalMap || null }, params: finalParams };
    }
    generateTexture(params, rng) {
        const size = 512;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx)
            return new CanvasTexture(canvas);
        ctx.fillStyle = `#${params.color.getHexString()}`;
        ctx.fillRect(0, 0, size, size);
        const noise = new Noise3D(rng.seed);
        for (let y = 0; y < size; y += 4) {
            for (let x = 0; x < size; x += 4) {
                const n = noise.perlin(x / 50, y / 50, 0) * 20;
                const r = Math.max(0, Math.min(255, params.color.r * 255 + n));
                const g = Math.max(0, Math.min(255, params.color.g * 255 + n));
                const b = Math.max(0, Math.min(255, params.color.b * 255 + n));
                ctx.fillStyle = `rgb(${r},${g},${b})`;
                ctx.fillRect(x, y, 4, 4);
            }
        }
        return new CanvasTexture(canvas);
    }
    generateNormalMap(params, rng) {
        const size = 256;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx)
            return new CanvasTexture(canvas);
        ctx.fillStyle = '#8080ff';
        ctx.fillRect(0, 0, size, size);
        return new CanvasTexture(canvas);
    }
    getVariations(count) {
        const variations = [];
        const types = ['matte', 'glossy', 'textured', 'translucent'];
        for (let i = 0; i < count; i++) {
            variations.push({
                type: types[this.rng.nextInt(0, types.length - 1)],
                color: new Color().setHSL(this.rng.nextFloat(), 0.6, 0.5),
                roughness: 0.2 + this.rng.nextFloat() * 0.5,
                metalness: this.rng.nextFloat() * 0.3,
                transmission: this.rng.nextFloat() * 0.3,
                textureScale: 0.5 + this.rng.nextFloat() * 1.5,
            });
        }
        return variations;
    }
}
PlasticGenerator.DEFAULT_PARAMS = {
    type: 'matte',
    color: new Color(0xffffff),
    roughness: 0.5,
    metalness: 0.0,
    transmission: 0.0,
    textureScale: 1.0,
};
//# sourceMappingURL=PlasticGenerator.js.map