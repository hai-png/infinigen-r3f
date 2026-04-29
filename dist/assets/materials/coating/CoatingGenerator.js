/**
 * Coating Generator - Varnish, lacquer, paint, powder coating
 */
import { Color } from 'three';
import { BaseMaterialGenerator } from '../BaseMaterialGenerator';
export class CoatingGenerator extends BaseMaterialGenerator {
    constructor() { super(); }
    getDefaultParams() { return { ...CoatingGenerator.DEFAULT_PARAMS }; }
    generate(params = {}, seed) {
        const finalParams = this.mergeParams(CoatingGenerator.DEFAULT_PARAMS, params);
        const material = this.createBaseMaterial();
        material.color = finalParams.color;
        material.roughness = 1 - finalParams.glossiness;
        material.clearcoat = finalParams.clearcoat;
        material.clearcoatRoughness = (1 - finalParams.glossiness) * 0.5;
        if (finalParams.type === 'powder') {
            material.roughness = 0.4;
            material.metalness = 0.0;
        }
        else if (finalParams.type === 'anodized') {
            material.metalness = 0.5;
        }
        return { material: material, maps: { map: null, roughnessMap: null, normalMap: null }, params: finalParams };
    }
    getVariations(count) {
        const variations = [];
        const types = ['varnish', 'lacquer', 'paint', 'powder'];
        for (let i = 0; i < count; i++) {
            variations.push({
                type: types[this.rng.nextInt(0, types.length - 1)],
                color: new Color().setHSL(this.rng.nextFloat(), 0.5, 0.5),
                glossiness: 0.3 + this.rng.nextFloat() * 0.6,
                thickness: 0.005 + this.rng.nextFloat() * 0.02,
                clearcoat: 0.3 + this.rng.nextFloat() * 0.6,
            });
        }
        return variations;
    }
}
CoatingGenerator.DEFAULT_PARAMS = {
    type: 'varnish',
    color: new Color(0xffffff),
    glossiness: 0.7,
    thickness: 0.01,
    clearcoat: 0.5,
};
//# sourceMappingURL=CoatingGenerator.js.map