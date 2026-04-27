/**
 * RoofGenerator - Procedural roof generation
 */
import { Group, Mesh, BoxGeometry, CylinderGeometry } from 'three';
import { BaseObjectGenerator, BaseGeneratorConfig } from '../utils/BaseObjectGenerator';

export interface RoofParams extends BaseGeneratorConfig {
  width: number;
  depth: number;
  roofType: 'gable' | 'hip' | 'mansard' | 'gambrel' | 'flat' | 'shed';
  pitch: number;
  overhang: number;
  hasDormers: boolean;
  dormerCount: number;
  hasGutters: boolean;
  material: string;
}

const DEFAULT_PARAMS: RoofParams = {
  width: 8.0,
  depth: 10.0,
  roofType: 'gable',
  pitch: 30,
  overhang: 0.3,
  hasDormers: false,
  dormerCount: 2,
  hasGutters: true,
  material: 'shingle',
};

export class RoofGenerator extends BaseObjectGenerator<RoofParams> {
  constructor(seed?: number) {
    super(seed);
  }

  getDefaultConfig(): RoofParams {
    return { ...DEFAULT_PARAMS };
  }

  generate(params: Partial<RoofParams> = {}): Group {
    const finalParams = this.validateAndMerge(params);
    const group = new Group();
    const { width, depth, roofType, pitch, overhang, hasDormers, hasGutters } = finalParams;

    const pitchRad = (pitch * Math.PI) / 180;
    const roofHeight = (width / 2 + overhang) * Math.tan(pitchRad);

    if (roofType === 'gable') {
      // Gable roof - two sloping planes
      const rafterLength = Math.sqrt(Math.pow(width / 2 + overhang, 2) + Math.pow(roofHeight, 2));
      
      const leftPlane = new Mesh(new BoxGeometry(rafterLength, 0.1, depth + overhang * 2));
      leftPlane.position.set(-width / 4, roofHeight / 2, 0);
      leftPlane.rotation.z = -pitchRad;
      leftPlane.castShadow = true;
      group.add(leftPlane);

      const rightPlane = new Mesh(new BoxGeometry(rafterLength, 0.1, depth + overhang * 2));
      rightPlane.position.set(width / 4, roofHeight / 2, 0);
      rightPlane.rotation.z = pitchRad;
      rightPlane.castShadow = true;
      group.add(rightPlane);
    } else if (roofType === 'hip') {
      // Hip roof - four sloping planes
      const rafterLength = Math.sqrt(Math.pow(width / 2 + overhang, 2) + Math.pow(roofHeight, 2));
      
      const frontPlane = new Mesh(new BoxGeometry(width + overhang * 2, 0.1, rafterLength));
      frontPlane.position.set(0, roofHeight / 2, -depth / 4);
      frontPlane.rotation.x = pitchRad;
      frontPlane.castShadow = true;
      group.add(frontPlane);

      const backPlane = new Mesh(new BoxGeometry(width + overhang * 2, 0.1, rafterLength));
      backPlane.position.set(0, roofHeight / 2, depth / 4);
      backPlane.rotation.x = -pitchRad;
      backPlane.castShadow = true;
      group.add(backPlane);
    } else if (roofType === 'flat') {
      const roofGeom = new BoxGeometry(width + overhang * 2, 0.2, depth + overhang * 2);
      const roof = new Mesh(roofGeom);
      roof.position.set(0, roofHeight, 0);
      roof.castShadow = true;
      group.add(roof);
    }

    // Add gutters
    if (hasGutters) {
      const gutterGeom = new CylinderGeometry(0.05, 0.05, depth + overhang * 2, 8);
      const leftGutter = new Mesh(gutterGeom);
      leftGutter.rotation.z = Math.PI / 2;
      leftGutter.position.set(-width / 2 - overhang / 2, roofHeight - 0.1, 0);
      group.add(leftGutter);

      const rightGutter = new Mesh(gutterGeom);
      rightGutter.rotation.z = Math.PI / 2;
      rightGutter.position.set(width / 2 + overhang / 2, roofHeight - 0.1, 0);
      group.add(rightGutter);
    }

    return group;
  }

  getStylePresets(): Record<string, Partial<RoofParams>> {
    return {
      gable_traditional: { roofType: 'gable', pitch: 30, hasGutters: true },
      hip_modern: { roofType: 'hip', pitch: 20, overhang: 0.5 },
      mansard: { roofType: 'mansard', pitch: 45 },
      gambrel: { roofType: 'gambrel', pitch: 35 },
      flat: { roofType: 'flat', pitch: 5 },
    };
  }
}
