/**
 * CeilingGenerator - Procedural ceiling generation
 */
import { Group, Mesh, BoxGeometry } from 'three';
import { BaseObjectGenerator } from '../utils/BaseObjectGenerator';

export interface CeilingParams {
  width: number;
  depth: number;
  height: number;
  thickness: number;
  ceilingType: 'flat' | 'coffered' | 'tray' | 'vaulted' | 'beamed';
  beamCount: number;
  beamDepth: number;
  cofferSize: number;
  material: string;
  hasMolding: boolean;
  moldingWidth: number;
}

const DEFAULT_PARAMS: CeilingParams = {
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

export class CeilingGenerator extends BaseObjectGenerator<CeilingParams> {
  constructor(seed?: number) {
    super('Ceiling', seed);
  }

  getDefaultParams(): CeilingParams {
    return { ...DEFAULT_PARAMS };
  }

  generate(params: Partial<CeilingParams> = {}): Group {
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

  getStylePresets(): Record<string, Partial<CeilingParams>> {
    return {
      flat: { ceilingType: 'flat', hasMolding: false },
      coffered: { ceilingType: 'coffered', cofferSize: 0.8 },
      tray: { ceilingType: 'tray', beamDepth: 0.15 },
      vaulted: { ceilingType: 'vaulted' },
      beamed: { ceilingType: 'beamed', beamCount: 5, material: 'wood' },
    };
  }
}
