/**
 * BeamGenerator - Procedural beam generation
 */
import { Group, Mesh, BoxGeometry } from 'three';
import { BaseObjectGenerator } from '../utils/BaseObjectGenerator';
const DEFAULT_PARAMS = {
    length: 4.0,
    width: 0.2,
    height: 0.3,
    beamType: 'i_beam',
    material: 'steel',
    hasEndCaps: false,
    endCapStyle: 'flat',
    style: 'industrial',
};
export class BeamGenerator extends BaseObjectGenerator {
    constructor(seed) {
        super('Beam', seed);
    }
    getDefaultParams() {
        return { ...DEFAULT_PARAMS };
    }
    generate(params = {}) {
        const finalParams = this.validateAndMerge(params);
        const group = new Group();
        const { length, width, height, beamType, hasEndCaps, endCapStyle } = finalParams;
        if (beamType === 'i_beam') {
            // I-beam: top flange, web, bottom flange
            const flangeThickness = height * 0.15;
            const webThickness = width * 0.3;
            const topFlange = new Mesh(new BoxGeometry(length, flangeThickness, width));
            topFlange.position.set(0, height / 2 - flangeThickness / 2, 0);
            topFlange.castShadow = true;
            group.add(topFlange);
            const bottomFlange = new Mesh(new BoxGeometry(length, flangeThickness, width));
            bottomFlange.position.set(0, -height / 2 + flangeThickness / 2, 0);
            bottomFlange.castShadow = true;
            group.add(bottomFlange);
            const web = new Mesh(new BoxGeometry(length, height - flangeThickness * 2, webThickness));
            web.position.set(0, 0, 0);
            web.castShadow = true;
            group.add(web);
        }
        else if (beamType === 'box_beam') {
            const geom = new BoxGeometry(length, height, width);
            const beam = new Mesh(geom);
            beam.castShadow = true;
            group.add(beam);
        }
        else if (beamType === 'wood_beam') {
            const geom = new BoxGeometry(length, height, width);
            const beam = new Mesh(geom);
            beam.castShadow = true;
            group.add(beam);
        }
        if (hasEndCaps) {
            const capSize = width * 1.3;
            const leftCap = new Mesh(new BoxGeometry(0.05, capSize, capSize));
            leftCap.position.set(-length / 2 - 0.025, 0, 0);
            group.add(leftCap);
            const rightCap = new Mesh(new BoxGeometry(0.05, capSize, capSize));
            rightCap.position.set(length / 2 + 0.025, 0, 0);
            group.add(rightCap);
        }
        return group;
    }
    getStylePresets() {
        return {
            industrial: { beamType: 'i_beam', material: 'steel', hasEndCaps: false },
            rustic: { beamType: 'wood_beam', material: 'reclaimed_wood', hasEndCaps: true, endCapStyle: 'bracket' },
            modern: { beamType: 'box_beam', material: 'steel', hasEndCaps: false },
            traditional: { beamType: 'wood_beam', material: 'oak', hasEndCaps: true, endCapStyle: 'ornate' },
        };
    }
}
//# sourceMappingURL=BeamGenerator.js.map