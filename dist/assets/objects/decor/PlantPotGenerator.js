/**
 * PlantPotGenerator - Procedural plant pot generation
 */
import { Group, Mesh, CylinderGeometry, BoxGeometry, MeshStandardMaterial } from 'three';
import { BaseObjectGenerator } from '../BaseObjectGenerator';
export class PlantPotGenerator extends BaseObjectGenerator {
    constructor() {
        super(...arguments);
        this.defaultParams = {
            style: 'terracotta',
            shape: 'cylindrical',
            size: 'medium',
            hasDrainage: true,
            hasSaucer: true,
            seed: undefined
        };
    }
    generate(params = {}) {
        const finalParams = { ...this.defaultParams, ...params };
        const group = new Group();
        this.createPot(group, finalParams);
        if (finalParams.hasSaucer)
            this.createSaucer(group, finalParams);
        return group;
    }
    createPot(group, params) {
        const sizes = { small: 0.1, medium: 0.2, large: 0.35 };
        const size = sizes[params.size];
        const mat = this.getMaterial(params.style);
        let geom;
        if (params.shape === 'tapered') {
            geom = new CylinderGeometry(size * 0.7, size, size * 0.8, 16);
        }
        else if (params.shape === 'square') {
            geom = new BoxGeometry(size * 1.5, size * 0.8, size * 1.5);
        }
        else {
            geom = new CylinderGeometry(size, size, size * 0.8, 16);
        }
        const pot = new Mesh(geom, mat);
        pot.position.y = size * 0.4;
        group.add(pot);
    }
    createSaucer(group, params) {
        const sizes = { small: 0.12, medium: 0.22, large: 0.38 };
        const size = sizes[params.size];
        const saucerGeom = new CylinderGeometry(size * 1.1, size, 0.02, 16);
        const saucerMat = this.getMaterial(params.style);
        const saucer = new Mesh(saucerGeom, saucerMat);
        saucer.position.y = 0.01;
        group.add(saucer);
    }
    getMaterial(style) {
        const configs = {
            terracotta: { color: 0xc15a3e, roughness: 0.8 },
            ceramic: { color: 0xffffff, roughness: 0.3 },
            plastic: { color: 0x2d5016, roughness: 0.5 },
            hanging: { color: 0x8b7355, roughness: 0.6 },
            self_watering: { color: 0x4a4a4a, roughness: 0.4 },
            decorative: { color: 0xd4af37, roughness: 0.3 }
        };
        return new MeshStandardMaterial(configs[style]);
    }
    getVariations() {
        const styles = ['terracotta', 'ceramic', 'plastic', 'hanging', 'self_watering', 'decorative'];
        const shapes = ['cylindrical', 'tapered', 'square', 'rectangular', 'spherical'];
        const sizes = ['small', 'medium', 'large'];
        return styles.flatMap(s => shapes.map(shape => ({
            style: s, shape, size: sizes[Math.floor(Math.random() * 3)],
            hasDrainage: Math.random() > 0.2, hasSaucer: Math.random() > 0.3, seed: Math.floor(Math.random() * 10000)
        })));
    }
}
//# sourceMappingURL=PlantPotGenerator.js.map