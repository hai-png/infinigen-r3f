/**
 * CeilingGenerator - Procedural ceiling generation
 */
import { Group, Mesh, BoxGeometry } from 'three';
import { BaseObjectGenerator } from '../utils/BaseObjectGenerator';
const DEFAULT_PARAMS = {
    width: 5.0,
    depth: 5.0,
    height: 3.0,
    thickness: 0.15,
    ceilingType: 'flat',
    beamCount: 4,
    beamDepth: 0.2,
    cofferSize: 0.6,
    material: 'drywall',
    hasMolding: false,
    moldingWidth: 0.1,
};
export class CeilingGenerator extends BaseObjectGenerator {
    constructor(seed) {
        super(seed);
    }
    getDefaultConfig() {
        return { ...DEFAULT_PARAMS };
    }
    generate(params = {}) {
        const finalParams = this.validateAndMerge(params);
        const group = new Group();
        const { width, depth, height, thickness, ceilingType, beamCount, beamDepth, hasMolding, moldingWidth } = finalParams;
        // Main ceiling plane
        const mainGeom = new BoxGeometry(width, thickness, depth);
        const ceiling = new Mesh(mainGeom);
        ceiling.position.set(0, height - thickness / 2, 0);
        ceiling.receiveShadow = true;
        group.add(ceiling);
        // Add beams if beamed ceiling
        if (ceilingType === 'beamed') {
            for (let i = 0; i < beamCount; i++) {
                const x = -width / 2 + (i + 0.5) * (width / beamCount);
                const beamGeom = new BoxGeometry(0.15, beamDepth, depth);
                const beam = new Mesh(beamGeom);
                beam.position.set(x, height - thickness - beamDepth / 2, 0);
                beam.castShadow = true;
                group.add(beam);
            }
        }
        // Add molding
        if (hasMolding) {
            const perimeter = 2 * (width + depth);
            const moldingGeom = new BoxGeometry(perimeter, 0.08, moldingWidth);
            const molding = new Mesh(moldingGeom);
            molding.position.set(0, height - thickness - 0.04, 0);
            group.add(molding);
        }
        return group;
    }
    getStylePresets() {
        return {
            flat: { ceilingType: 'flat', hasMolding: false },
            coffered: { ceilingType: 'coffered', cofferSize: 0.8 },
            tray: { ceilingType: 'tray', beamDepth: 0.15 },
            vaulted: { ceilingType: 'vaulted' },
            beamed: { ceilingType: 'beamed', beamCount: 5, material: 'wood' },
        };
    }
}
//# sourceMappingURL=CeilingGenerator.js.map