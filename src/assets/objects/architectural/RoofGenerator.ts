/**
 * RoofGenerator - Procedural roof generation
 * FIX: All roof elements are Mesh objects with proper MeshStandardMaterial
 * Added: gable, hip, flat, mansard, gambrel, shed types
 */
import { Group, Mesh, BoxGeometry, CylinderGeometry, MeshStandardMaterial, Color } from 'three';
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
    const { width, depth, roofType, pitch, overhang, hasDormers, hasGutters, material } = finalParams;

    const pitchRad = (pitch * Math.PI) / 180;
    const roofHeight = (width / 2 + overhang) * Math.tan(pitchRad);
    const roofMat = this.getRoofMaterial(material);

    if (roofType === 'gable') {
      // Two sloping planes
      const rafterLength = Math.sqrt(Math.pow(width / 2 + overhang, 2) + Math.pow(roofHeight, 2));

      const leftPlane = new Mesh(new BoxGeometry(rafterLength, 0.1, depth + overhang * 2), roofMat);
      leftPlane.position.set(-width / 4, roofHeight / 2, 0);
      leftPlane.rotation.z = -pitchRad;
      leftPlane.castShadow = true;
      leftPlane.receiveShadow = true;
      leftPlane.name = 'leftPlane';
      group.add(leftPlane);

      const rightPlane = new Mesh(new BoxGeometry(rafterLength, 0.1, depth + overhang * 2), roofMat);
      rightPlane.position.set(width / 4, roofHeight / 2, 0);
      rightPlane.rotation.z = pitchRad;
      rightPlane.castShadow = true;
      rightPlane.receiveShadow = true;
      rightPlane.name = 'rightPlane';
      group.add(rightPlane);

      // Ridge board
      const ridgeMat = this.getRoofMaterial('wood');
      const ridge = new Mesh(new BoxGeometry(0.1, 0.1, depth + overhang * 2), ridgeMat);
      ridge.position.set(0, roofHeight, 0);
      ridge.name = 'ridge';
      group.add(ridge);

      // Gable end triangles (front and back)
      const gableMat = this.getRoofMaterial('stucco');
      for (const zSide of [-1, 1]) {
        const gableGeo = new BoxGeometry(width, roofHeight, 0.15);
        const gable = new Mesh(gableGeo, gableMat);
        gable.position.set(0, roofHeight / 2, zSide * (depth / 2 + overhang));
        gable.name = `gable_${zSide === -1 ? 'front' : 'back'}`;
        group.add(gable);
      }
    } else if (roofType === 'hip') {
      // Four sloping planes
      const rafterLength = Math.sqrt(Math.pow(width / 2 + overhang, 2) + Math.pow(roofHeight, 2));

      // Left and right slopes
      const leftPlane = new Mesh(new BoxGeometry(rafterLength, 0.1, depth + overhang * 2), roofMat);
      leftPlane.position.set(-width / 4, roofHeight / 2, 0);
      leftPlane.rotation.z = -pitchRad;
      leftPlane.castShadow = true;
      group.add(leftPlane);

      const rightPlane = new Mesh(new BoxGeometry(rafterLength, 0.1, depth + overhang * 2), roofMat);
      rightPlane.position.set(width / 4, roofHeight / 2, 0);
      rightPlane.rotation.z = pitchRad;
      rightPlane.castShadow = true;
      group.add(rightPlane);

      // Front and back hip slopes
      const hipRafterLen = Math.sqrt(Math.pow(depth / 2 + overhang, 2) + Math.pow(roofHeight, 2));
      const frontPlane = new Mesh(new BoxGeometry(width + overhang * 2, 0.1, hipRafterLen), roofMat);
      frontPlane.position.set(0, roofHeight / 2, -depth / 4);
      frontPlane.rotation.x = pitchRad;
      frontPlane.castShadow = true;
      group.add(frontPlane);

      const backPlane = new Mesh(new BoxGeometry(width + overhang * 2, 0.1, hipRafterLen), roofMat);
      backPlane.position.set(0, roofHeight / 2, depth / 4);
      backPlane.rotation.x = -pitchRad;
      backPlane.castShadow = true;
      group.add(backPlane);
    } else if (roofType === 'flat') {
      const roofGeom = new BoxGeometry(width + overhang * 2, 0.2, depth + overhang * 2);
      const roof = new Mesh(roofGeom, roofMat);
      roof.position.set(0, 0.1, 0);
      roof.castShadow = true;
      roof.receiveShadow = true;
      roof.name = 'flatRoof';
      group.add(roof);

      // Parapet
      const parapetMat = this.getRoofMaterial('concrete');
      for (const zSide of [-1, 1]) {
        const parapet = new Mesh(new BoxGeometry(width + overhang * 2, 0.4, 0.15), parapetMat);
        parapet.position.set(0, 0.3, zSide * (depth / 2 + overhang));
        parapet.name = `parapet_${zSide === -1 ? 'front' : 'back'}`;
        group.add(parapet);
      }
      for (const xSide of [-1, 1]) {
        const parapet = new Mesh(new BoxGeometry(0.15, 0.4, depth + overhang * 2), parapetMat);
        parapet.position.set(xSide * (width / 2 + overhang), 0.3, 0);
        parapet.name = `parapet_${xSide === -1 ? 'left' : 'right'}`;
        group.add(parapet);
      }
    } else if (roofType === 'shed') {
      // Single-slope roof
      const rafterLength = Math.sqrt(Math.pow(width + overhang * 2, 2) + Math.pow(roofHeight, 2));
      const shedAngle = Math.atan2(roofHeight, width);
      const plane = new Mesh(new BoxGeometry(rafterLength, 0.1, depth + overhang * 2), roofMat);
      plane.position.set(0, roofHeight / 2, 0);
      plane.rotation.z = shedAngle;
      plane.castShadow = true;
      plane.name = 'shedPlane';
      group.add(plane);
    } else if (roofType === 'mansard') {
      // Double-pitched: steep lower, shallow upper
      const lowerPitch = (pitch * 1.5) * Math.PI / 180;
      const upperPitch = (pitch * 0.5) * Math.PI / 180;
      const lowerHeight = (width / 2) * Math.tan(lowerPitch) * 0.6;
      const upperHeight = (width / 4) * Math.tan(upperPitch);

      // Lower steep slopes
      for (const side of [-1, 1]) {
        const lowerLen = Math.sqrt(Math.pow(width / 2, 2) + Math.pow(lowerHeight, 2));
        const lowerPlane = new Mesh(new BoxGeometry(lowerLen, 0.1, depth + overhang * 2), roofMat);
        lowerPlane.position.set(side * width / 4, lowerHeight / 2, 0);
        lowerPlane.rotation.z = side * -lowerPitch;
        lowerPlane.castShadow = true;
        group.add(lowerPlane);
      }

      // Upper shallow slopes
      for (const side of [-1, 1]) {
        const upperLen = Math.sqrt(Math.pow(width / 4, 2) + Math.pow(upperHeight, 2));
        const upperPlane = new Mesh(new BoxGeometry(upperLen, 0.1, depth), roofMat);
        upperPlane.position.set(side * width / 8, lowerHeight + upperHeight / 2, 0);
        upperPlane.rotation.z = side * -upperPitch;
        upperPlane.castShadow = true;
        group.add(upperPlane);
      }
    } else if (roofType === 'gambrel') {
      // Barn-style: two different pitches on each side
      const upperPitchRad = (pitch * 0.6) * Math.PI / 180;
      const lowerPitchRad = (pitch * 1.4) * Math.PI / 180;
      const upperH = (width / 4) * Math.tan(upperPitchRad);
      const lowerH = (width / 2) * Math.tan(lowerPitchRad) * 0.4;

      for (const side of [-1, 1]) {
        const lowerLen = Math.sqrt(Math.pow(width / 2, 2) + Math.pow(lowerH, 2));
        const lowerPlane = new Mesh(new BoxGeometry(lowerLen, 0.1, depth + overhang * 2), roofMat);
        lowerPlane.position.set(side * width / 4, lowerH / 2, 0);
        lowerPlane.rotation.z = side * -lowerPitchRad;
        lowerPlane.castShadow = true;
        group.add(lowerPlane);

        const upperLen = Math.sqrt(Math.pow(width / 4, 2) + Math.pow(upperH, 2));
        const upperPlane = new Mesh(new BoxGeometry(upperLen, 0.1, depth), roofMat);
        upperPlane.position.set(side * width / 8, lowerH + upperH / 2, 0);
        upperPlane.rotation.z = side * -upperPitchRad;
        upperPlane.castShadow = true;
        group.add(upperPlane);
      }
    }

    // Gutters
    if (hasGutters) {
      const gutterMat = new MeshStandardMaterial({ color: 0x666666, roughness: 0.4, metalness: 0.7 });
      for (const side of [-1, 1]) {
        const gutterGeo = new CylinderGeometry(0.05, 0.05, depth + overhang * 2, 8);
        const gutter = new Mesh(gutterGeo, gutterMat);
        gutter.rotation.z = Math.PI / 2;
        gutter.position.set(side * (width / 2 + overhang / 2), -0.05, 0);
        gutter.name = `gutter_${side === -1 ? 'left' : 'right'}`;
        group.add(gutter);
      }
    }

    return group;
  }

  private getRoofMaterial(material: string): MeshStandardMaterial {
    const configs: Record<string, { color: number; roughness: number; metalness: number }> = {
      shingle: { color: 0x555555, roughness: 0.9, metalness: 0.0 },
      tile: { color: 0xb5553a, roughness: 0.8, metalness: 0.0 },
      metal: { color: 0x888888, roughness: 0.3, metalness: 0.7 },
      wood: { color: 0x8b6914, roughness: 0.7, metalness: 0.0 },
      thatch: { color: 0xbdb76b, roughness: 0.95, metalness: 0.0 },
      concrete: { color: 0x999999, roughness: 0.9, metalness: 0.0 },
      stucco: { color: 0xe8dcc8, roughness: 0.85, metalness: 0.0 },
    };
    const config = configs[material] || configs.shingle;
    return new MeshStandardMaterial({
      color: new Color(config.color),
      roughness: config.roughness,
      metalness: config.metalness,
    });
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
