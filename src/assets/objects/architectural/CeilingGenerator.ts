/**
 * CeilingGenerator - Procedural ceiling generation
 * FIX: All ceiling elements are Mesh objects with proper MeshStandardMaterial
 */
import { Group, Mesh, BoxGeometry, MeshStandardMaterial, Color } from 'three';
import { BaseObjectGenerator, BaseGeneratorConfig } from '../utils/BaseObjectGenerator';

export interface CeilingParams extends BaseGeneratorConfig {
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
    super(seed);
  }

  getDefaultConfig(): CeilingParams {
    return { ...DEFAULT_PARAMS };
  }

  generate(params: Partial<CeilingParams> = {}): Group {
    const finalParams = this.validateAndMerge(params);
    const group = new Group();
    const { width, depth, height, thickness, ceilingType, beamCount, beamDepth, hasMolding, moldingWidth, material } = finalParams;

    const ceilingMat = this.getCeilingMaterial(material);

    // Main ceiling plane
    const mainGeom = new BoxGeometry(width, thickness, depth);
    const ceiling = new Mesh(mainGeom, ceilingMat);
    ceiling.position.set(0, height - thickness / 2, 0);
    ceiling.receiveShadow = true;
    ceiling.name = 'ceiling';
    group.add(ceiling);

    // Beamed ceiling
    if (ceilingType === 'beamed') {
      const beamMat = this.getCeilingMaterial('wood');
      for (let i = 0; i < beamCount; i++) {
        const x = -width / 2 + (i + 0.5) * (width / beamCount);
        const beamGeom = new BoxGeometry(0.15, beamDepth, depth);
        const beam = new Mesh(beamGeom, beamMat);
        beam.position.set(x, height - thickness - beamDepth / 2, 0);
        beam.castShadow = true;
        beam.name = `beam_${i}`;
        group.add(beam);
      }
    }

    // Coffered ceiling - recessed panels
    if (ceilingType === 'coffered') {
      const beamMat = this.getCeilingMaterial('wood');
      const cofferMat = this.getCeilingMaterial('drywall');
      const coffersPerSide = Math.floor(width / finalParams.cofferSize);

      // Grid beams
      for (let i = 0; i <= coffersPerSide; i++) {
        const x = -width / 2 + i * (width / coffersPerSide);
        const beamGeom = new BoxGeometry(0.08, beamDepth * 0.5, depth);
        const beam = new Mesh(beamGeom, beamMat);
        beam.position.set(x, height - thickness - beamDepth * 0.25, 0);
        beam.castShadow = true;
        group.add(beam);
      }
      for (let i = 0; i <= coffersPerSide; i++) {
        const z = -depth / 2 + i * (depth / coffersPerSide);
        const beamGeom = new BoxGeometry(width, beamDepth * 0.5, 0.08);
        const beam = new Mesh(beamGeom, beamMat);
        beam.position.set(0, height - thickness - beamDepth * 0.25, z);
        beam.castShadow = true;
        group.add(beam);
      }
    }

    // Tray ceiling - recessed center
    if (ceilingType === 'tray') {
      const trayInset = 0.3;
      const trayDepth = 0.15;
      const trayMat = this.getCeilingMaterial(material);
      // Recessed center panel
      const trayGeom = new BoxGeometry(width - trayInset * 2, thickness, depth - trayInset * 2);
      const tray = new Mesh(trayGeom, trayMat);
      tray.position.set(0, height - thickness - trayDepth, 0);
      tray.name = 'tray_center';
      group.add(tray);
      // Side lips
      const lipMat = this.getCeilingMaterial('wood');
      const frontLip = new Mesh(new BoxGeometry(width - trayInset * 2, trayDepth, 0.08), lipMat);
      frontLip.position.set(0, height - thickness - trayDepth / 2, -depth / 2 + trayInset);
      group.add(frontLip);
      const backLip = new Mesh(new BoxGeometry(width - trayInset * 2, trayDepth, 0.08), lipMat);
      backLip.position.set(0, height - thickness - trayDepth / 2, depth / 2 - trayInset);
      group.add(backLip);
      const leftLip = new Mesh(new BoxGeometry(0.08, trayDepth, depth - trayInset * 2), lipMat);
      leftLip.position.set(-width / 2 + trayInset, height - thickness - trayDepth / 2, 0);
      group.add(leftLip);
      const rightLip = new Mesh(new BoxGeometry(0.08, trayDepth, depth - trayInset * 2), lipMat);
      rightLip.position.set(width / 2 - trayInset, height - thickness - trayDepth / 2, 0);
      group.add(rightLip);
    }

    // Molding
    if (hasMolding) {
      const moldMat = this.getCeilingMaterial('wood');
      // Perimeter molding pieces
      const frontMold = new Mesh(new BoxGeometry(width, 0.08, moldingWidth), moldMat);
      frontMold.position.set(0, height - thickness - 0.04, -depth / 2 + moldingWidth / 2);
      frontMold.name = 'molding_front';
      group.add(frontMold);

      const backMold = new Mesh(new BoxGeometry(width, 0.08, moldingWidth), moldMat);
      backMold.position.set(0, height - thickness - 0.04, depth / 2 - moldingWidth / 2);
      backMold.name = 'molding_back';
      group.add(backMold);

      const leftMold = new Mesh(new BoxGeometry(moldingWidth, 0.08, depth), moldMat);
      leftMold.position.set(-width / 2 + moldingWidth / 2, height - thickness - 0.04, 0);
      leftMold.name = 'molding_left';
      group.add(leftMold);

      const rightMold = new Mesh(new BoxGeometry(moldingWidth, 0.08, depth), moldMat);
      rightMold.position.set(width / 2 - moldingWidth / 2, height - thickness - 0.04, 0);
      rightMold.name = 'molding_right';
      group.add(rightMold);
    }

    return group;
  }

  private getCeilingMaterial(material: string): MeshStandardMaterial {
    const configs: Record<string, { color: number; roughness: number; metalness: number }> = {
      drywall: { color: 0xeeeeee, roughness: 0.8, metalness: 0.0 },
      wood: { color: 0x8b6914, roughness: 0.65, metalness: 0.0 },
      plaster: { color: 0xf5f0e8, roughness: 0.7, metalness: 0.0 },
      concrete: { color: 0x999999, roughness: 0.9, metalness: 0.0 },
      metal: { color: 0xaaaaaa, roughness: 0.3, metalness: 0.8 },
    };
    const config = configs[material] || configs.drywall;
    return new MeshStandardMaterial({
      color: new Color(config.color),
      roughness: config.roughness,
      metalness: config.metalness,
    });
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
