/**
 * ChimneyGenerator - Procedural chimney generation
 */
import { Group, Mesh, BoxGeometry, CylinderGeometry } from 'three';
import { BaseObjectGenerator } from '../utils/BaseObjectGenerator';
const DEFAULT_PARAMS = {
    height: 2.5,
    width: 0.8,
    depth: 0.6,
    chimneyType: 'brick',
    hasCap: true,
    capStyle: 'flat',
    flueCount: 1,
    hasDamper: false,
    material: 'brick',
    style: 'traditional',
};
export class ChimneyGenerator extends BaseObjectGenerator {
    constructor(seed) {
        super('Chimney', seed);
    }
    getDefaultParams() {
        return { ...DEFAULT_PARAMS };
    }
    generate(params = {}) {
        const finalParams = this.validateAndMerge(params);
        const group = new Group();
        const { height, width, depth, chimneyType, hasCap, capStyle, flueCount } = finalParams;
        // Main chimney body
        const bodyGeom = new BoxGeometry(width, height, depth);
        const body = new Mesh(bodyGeom);
        body.position.set(0, height / 2, 0);
        body.castShadow = true;
        body.receiveShadow = true;
        group.add(body);
        // Chimney cap
        if (hasCap) {
            const capY = height;
            if (capStyle === 'flat') {
                const capGeom = new BoxGeometry(width + 0.1, 0.1, depth + 0.1);
                const cap = new Mesh(capGeom);
                cap.position.set(0, capY + 0.05, 0);
                group.add(cap);
            }
            else if (capStyle === 'conical') {
                const capGeom = new CylinderGeometry(0.1, width / 2 + 0.1, 0.4, 16);
                const cap = new Mesh(capGeom);
                cap.position.set(0, capY + 0.2, 0);
                group.add(cap);
            }
        }
        // Flues
        for (let i = 0; i < flueCount; i++) {
            const flueX = flueCount === 1 ? 0 : (i - (flueCount - 1) / 2) * 0.3;
            const flueGeom = new CylinderGeometry(0.1, 0.1, 0.5, 8);
            const flue = new Mesh(flueGeom);
            flue.position.set(flueX, height + 0.25, 0);
            group.add(flue);
        }
        return group;
    }
    getStylePresets() {
        return {
            traditional: { chimneyType: 'brick', hasCap: true, capStyle: 'flat', flueCount: 1 },
            modern: { chimneyType: 'modern', hasCap: false, material: 'concrete' },
            rustic: { chimneyType: 'stone', hasCap: true, capStyle: 'decorative' },
            industrial: { chimneyType: 'metal', material: 'steel', hasCap: true, capStyle: 'conical' },
        };
    }
}
//# sourceMappingURL=ChimneyGenerator.js.map