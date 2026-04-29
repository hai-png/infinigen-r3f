/**
 * TrinketGenerator - Procedural small decorative objects
 */
import { Group, Mesh, SphereGeometry, TorusGeometry, IcosahedronGeometry, MeshStandardMaterial } from 'three';
import { BaseObjectGenerator } from '../utils/BaseObjectGenerator';
export class TrinketGenerator extends BaseObjectGenerator {
    constructor() {
        super(...arguments);
        this.defaultParams = {
            type: 'figurine', materialType: 'ceramic', size: 'small', seed: undefined
        };
    }
    getDefaultConfig() {
        return { ...this.defaultParams };
    }
    generate(params = {}) {
        const finalParams = { ...this.defaultParams, ...params };
        const group = new Group();
        this.createTrinket(group, finalParams);
        return group;
    }
    createTrinket(group, params) {
        const sizes = { tiny: 0.03, small: 0.06, medium: 0.1 };
        const size = sizes[params.size];
        const mat = this.getMaterial(params.materialType);
        let geom;
        switch (params.type) {
            case 'figurine':
                geom = new IcosahedronGeometry(size, 0);
                break;
            case 'vase_mini':
                geom = new SphereGeometry(size, 16, 16);
                break;
            case 'crystal':
                geom = new IcosahedronGeometry(size * 0.8, 1);
                break;
            case 'coin':
                geom = new SphereGeometry(size * 0.5, 16, 16);
                break;
            case 'jewelry':
                geom = new TorusGeometry(size * 0.4, size * 0.1, 8, 16);
                break;
            case 'ornament':
                geom = new SphereGeometry(size, 16, 16);
                break;
        }
        const trinket = new Mesh(geom, mat);
        group.add(trinket);
    }
    getMaterial(type) {
        const configs = {
            ceramic: { color: 0xf5f5dc, roughness: 0.4 },
            metal: { color: 0xffd700, roughness: 0.2, metalness: 0.9 },
            glass: { color: 0xe0ffff, roughness: 0.1, transparent: true, opacity: 0.7 },
            stone: { color: 0x808080, roughness: 0.7 },
            wood: { color: 0x8b4513, roughness: 0.6 }
        };
        return new MeshStandardMaterial(configs[type]);
    }
    getVariations(count = 4, baseConfig) {
        const variations = [];
        const types = ['figurine', 'vase_mini', 'crystal', 'coin', 'jewelry', 'ornament'];
        const materials = ['ceramic', 'metal', 'glass', 'stone', 'wood'];
        const sizes = ['tiny', 'small', 'medium'];
        const configs = [];
        for (let i = 0; i < count; i++) {
            configs.push({
                type: types[Math.floor(Math.random() * types.length)],
                materialType: materials[Math.floor(Math.random() * materials.length)],
                size: sizes[Math.floor(Math.random() * sizes.length)],
                seed: Math.floor(Math.random() * 10000)
            });
        }
        for (let i = 0; i < count && i < configs.length; i++) {
            const config = baseConfig ? { ...configs[i], ...baseConfig } : configs[i];
            variations.push(this.generate(config));
        }
        return variations;
    }
}
//# sourceMappingURL=TrinketGenerator.js.map