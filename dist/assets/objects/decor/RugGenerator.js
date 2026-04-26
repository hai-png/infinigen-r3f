/**
 * RugGenerator - Procedural rug/carpet generation
 */
import { Group, Mesh, PlaneGeometry, BoxGeometry, MeshStandardMaterial } from 'three';
import { BaseObjectGenerator } from '../utils/BaseObjectGenerator';
export class RugGenerator extends BaseObjectGenerator {
    constructor() {
        super(...arguments);
        this.defaultParams = {
            style: 'modern', shape: 'rectangular', width: 2.0, length: 3.0,
            pileHeight: 0.02, hasFringe: false, seed: undefined
        };
    }
    generate(params = {}) {
        const finalParams = { ...this.defaultParams, ...params };
        const group = new Group();
        this.createRug(group, finalParams);
        return group;
    }
    createRug(group, params) {
        const geom = new PlaneGeometry(params.width, params.length, 32, 32);
        const positions = geom.attributes.position.array;
        // Add pile texture
        for (let i = 0; i < positions.length; i += 3) {
            positions[i + 2] = (Math.random() - 0.5) * params.pileHeight;
        }
        geom.computeVertexNormals();
        const mat = this.getMaterial(params.style);
        const rug = new Mesh(geom, mat);
        rug.rotation.x = -Math.PI / 2;
        group.add(rug);
        if (params.hasFringe)
            this.addFringe(group, params);
    }
    addFringe(group, params) {
        const fringeGeom = new BoxGeometry(params.width, 0.05, 0.01);
        const fringeMat = new MeshStandardMaterial({ color: 0x8b7355, roughness: 0.9 });
        const fringe1 = new Mesh(fringeGeom, fringeMat);
        fringe1.position.set(0, params.length / 2 + 0.025, 0);
        group.add(fringe1);
        const fringe2 = new Mesh(fringeGeom, fringeMat);
        fringe2.position.set(0, -params.length / 2 - 0.025, 0);
        group.add(fringe2);
    }
    getMaterial(style) {
        const configs = {
            persian: { color: 0x8b0000, roughness: 0.9 },
            modern: { color: 0x4a4a4a, roughness: 0.8 },
            shag: { color: 0xf5f5dc, roughness: 1.0 },
            oriental: { color: 0x1e3a5f, roughness: 0.9 },
            geometric: { color: 0x2f4f4f, roughness: 0.8 },
            traditional: { color: 0x5c4033, roughness: 0.9 }
        };
        return new MeshStandardMaterial(configs[style]);
    }
    getVariations() {
        const styles = ['persian', 'modern', 'shag', 'oriental', 'geometric', 'traditional'];
        const shapes = ['rectangular', 'round', 'oval', 'runner'];
        return styles.map(s => ({
            style: s, shape: shapes[Math.floor(Math.random() * 4)],
            width: 1.5 + Math.random() * 2, length: 2 + Math.random() * 3,
            pileHeight: 0.01 + Math.random() * 0.05, hasFringe: Math.random() > 0.5, seed: Math.floor(Math.random() * 10000)
        }));
    }
}
//# sourceMappingURL=RugGenerator.js.map