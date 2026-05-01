/**
 * ColumnGenerator - Procedural column generation
 * FIX: All elements are Mesh objects with proper MeshStandardMaterial
 * Added: capital/base details with proper materials
 */
import { Group, Mesh, CylinderGeometry, BoxGeometry, TorusGeometry, MeshStandardMaterial, Color } from 'three';
import { BaseObjectGenerator, BaseGeneratorConfig } from '../utils/BaseObjectGenerator';

export interface ColumnParams extends BaseGeneratorConfig {
  height: number;
  bottomRadius: number;
  topRadius: number;
  columnOrder: 'doric' | 'ionic' | 'corinthian' | 'tuscan' | 'composite' | 'modern';
  hasBase: boolean;
  hasCapital: boolean;
  shaftFluting: boolean;
  numFlutes: number;
  material: string;
  style: 'classical' | 'modern' | 'industrial';
}

const DEFAULT_PARAMS: ColumnParams = {
  height: 3.0,
  bottomRadius: 0.3,
  topRadius: 0.25,
  columnOrder: 'doric',
  hasBase: true,
  hasCapital: true,
  shaftFluting: true,
  numFlutes: 20,
  material: 'marble',
  style: 'classical',
};

export class ColumnGenerator extends BaseObjectGenerator<ColumnParams> {
  constructor(seed?: number) {
    super(seed);
  }

  getDefaultConfig(): ColumnParams {
    return { ...DEFAULT_PARAMS };
  }

  generate(params: Partial<ColumnParams> = {}): Group {
    const finalParams = this.validateAndMerge(params);
    const group = new Group();
    const { height, bottomRadius, topRadius, columnOrder, hasBase, hasCapital, shaftFluting, numFlutes, material } = finalParams;

    const columnMat = this.getColumnMaterial(material);

    const shaftHeight = height - (hasBase ? 0.3 : 0) - (hasCapital ? 0.4 : 0);

    // Base
    if (hasBase) {
      // Bottom plinth
      const plinthGeo = new CylinderGeometry(bottomRadius * 1.4, bottomRadius * 1.5, 0.1, 16);
      const plinth = new Mesh(plinthGeo, columnMat);
      plinth.position.set(0, 0.05, 0);
      plinth.castShadow = true;
      plinth.receiveShadow = true;
      plinth.name = 'plinth';
      group.add(plinth);

      // Lower torus
      const lowerTorusGeo = new TorusGeometry(bottomRadius * 1.2, 0.04, 8, 24);
      const lowerTorus = new Mesh(lowerTorusGeo, columnMat);
      lowerTorus.position.set(0, 0.15, 0);
      lowerTorus.rotation.x = Math.PI / 2;
      lowerTorus.name = 'lowerTorus';
      group.add(lowerTorus);

      // Upper base cylinder
      const upperBaseGeo = new CylinderGeometry(bottomRadius * 1.15, bottomRadius * 1.25, 0.12, 16);
      const upperBase = new Mesh(upperBaseGeo, columnMat);
      upperBase.position.set(0, 0.21, 0);
      upperBase.castShadow = true;
      upperBase.name = 'upperBase';
      group.add(upperBase);
    }

    // Shaft
    const shaftY = (hasBase ? 0.3 : 0) + shaftHeight / 2;
    const shaftGeom = new CylinderGeometry(topRadius, bottomRadius, shaftHeight, shaftFluting ? numFlutes : 16);
    const shaft = new Mesh(shaftGeom, columnMat);
    shaft.position.set(0, shaftY, 0);
    shaft.castShadow = true;
    shaft.receiveShadow = true;
    shaft.name = 'shaft';
    group.add(shaft);

    // Necking ring
    const neckGeo = new TorusGeometry(topRadius * 1.05, 0.02, 8, 24);
    const neck = new Mesh(neckGeo, columnMat);
    neck.position.set(0, shaftY + shaftHeight / 2, 0);
    neck.rotation.x = Math.PI / 2;
    neck.name = 'neckRing';
    group.add(neck);

    // Capital
    if (hasCapital) {
      const capitalY = (hasBase ? 0.3 : 0) + shaftHeight;

      if (columnOrder === 'doric') {
        // Echinus (curved cushion)
        const echinusGeo = new CylinderGeometry(topRadius * 1.4, topRadius * 1.05, 0.15, 16);
        const echinus = new Mesh(echinusGeo, columnMat);
        echinus.position.set(0, capitalY + 0.075, 0);
        echinus.castShadow = true;
        echinus.name = 'echinus';
        group.add(echinus);

        // Abacus (square block)
        const abacusGeo = new BoxGeometry(topRadius * 2.8, 0.1, topRadius * 2.8);
        const abacus = new Mesh(abacusGeo, columnMat);
        abacus.position.set(0, capitalY + 0.2, 0);
        abacus.castShadow = true;
        abacus.name = 'abacus';
        group.add(abacus);
      } else if (columnOrder === 'ionic') {
        // Volutes (scroll-like)
        const voluteGeo = new TorusGeometry(topRadius * 0.7, 0.05, 8, 24, Math.PI * 1.5);
        for (const side of [-1, 1]) {
          const volute = new Mesh(voluteGeo, columnMat);
          volute.position.set(side * topRadius * 0.8, capitalY + 0.25, 0);
          volute.rotation.y = side * Math.PI / 2;
          volute.castShadow = true;
          volute.name = `volute_${side === -1 ? 'left' : 'right'}`;
          group.add(volute);
        }

        // Egg-and-dart band
        const bandGeo = new CylinderGeometry(topRadius * 1.15, topRadius * 1.1, 0.08, 16);
        const band = new Mesh(bandGeo, columnMat);
        band.position.set(0, capitalY + 0.15, 0);
        band.name = 'capitalBand';
        group.add(band);

        // Abacus
        const abacusGeo = new BoxGeometry(topRadius * 2.6, 0.08, topRadius * 1.5);
        const abacus = new Mesh(abacusGeo, columnMat);
        abacus.position.set(0, capitalY + 0.35, 0);
        abacus.castShadow = true;
        abacus.name = 'abacus';
        group.add(abacus);
      } else if (columnOrder === 'corinthian') {
        // Bell-shaped basket
        const basketGeo = new CylinderGeometry(topRadius * 1.3, topRadius * 0.95, 0.3, 16);
        const basket = new Mesh(basketGeo, columnMat);
        basket.position.set(0, capitalY + 0.15, 0);
        basket.castShadow = true;
        basket.name = 'basket';
        group.add(basket);

        // Acanthus leaves (simplified as small cones)
        const leafMat = columnMat;
        for (let i = 0; i < 8; i++) {
          const angle = (i / 8) * Math.PI * 2;
          const leafGeo = new CylinderGeometry(0.01, 0.04, 0.12, 4);
          const leaf = new Mesh(leafGeo, leafMat);
          leaf.position.set(
            Math.cos(angle) * topRadius * 1.1,
            capitalY + 0.12,
            Math.sin(angle) * topRadius * 1.1
          );
          leaf.rotation.z = Math.cos(angle) * 0.3;
          leaf.rotation.x = Math.sin(angle) * 0.3;
          leaf.name = `acanthus_${i}`;
          group.add(leaf);
        }

        // Abacus
        const abacusGeo = new BoxGeometry(topRadius * 2.6, 0.08, topRadius * 2.6);
        const abacus = new Mesh(abacusGeo, columnMat);
        abacus.position.set(0, capitalY + 0.35, 0);
        abacus.castShadow = true;
        abacus.name = 'abacus';
        group.add(abacus);
      } else if (columnOrder === 'tuscan') {
        // Simple capital
        const capGeo = new CylinderGeometry(topRadius * 1.15, topRadius * 1.05, 0.12, 16);
        const cap = new Mesh(capGeo, columnMat);
        cap.position.set(0, capitalY + 0.06, 0);
        cap.castShadow = true;
        cap.name = 'capital';
        group.add(cap);

        const abacusGeo = new BoxGeometry(topRadius * 2.2, 0.08, topRadius * 2.2);
        const abacus = new Mesh(abacusGeo, columnMat);
        abacus.position.set(0, capitalY + 0.16, 0);
        abacus.castShadow = true;
        abacus.name = 'abacus';
        group.add(abacus);
      } else {
        // Modern / composite - simple capital
        const capGeo = new CylinderGeometry(topRadius * 1.2, topRadius, 0.15, 16);
        const cap = new Mesh(capGeo, columnMat);
        cap.position.set(0, capitalY + 0.075, 0);
        cap.castShadow = true;
        cap.name = 'capital';
        group.add(cap);
      }
    }

    return group;
  }

  private getColumnMaterial(material: string): MeshStandardMaterial {
    const configs: Record<string, { color: number; roughness: number; metalness: number }> = {
      marble: { color: 0xf0ead6, roughness: 0.3, metalness: 0.05 },
      concrete: { color: 0x999999, roughness: 0.9, metalness: 0.0 },
      stone: { color: 0xaaa088, roughness: 0.85, metalness: 0.0 },
      wood: { color: 0x8b6914, roughness: 0.65, metalness: 0.0 },
      steel: { color: 0xaaaaaa, roughness: 0.3, metalness: 0.8 },
      brass: { color: 0xb5a642, roughness: 0.25, metalness: 0.9 },
    };
    const config = configs[material] || configs.marble;
    return new MeshStandardMaterial({
      color: new Color(config.color),
      roughness: config.roughness,
      metalness: config.metalness,
    });
  }

  getStylePresets(): Record<string, Partial<ColumnParams>> {
    return {
      doric: { columnOrder: 'doric', shaftFluting: true, numFlutes: 20 },
      ionic: { columnOrder: 'ionic', shaftFluting: true, numFlutes: 24 },
      corinthian: { columnOrder: 'corinthian', shaftFluting: true, numFlutes: 24 },
      tuscan: { columnOrder: 'tuscan', shaftFluting: false, hasBase: true },
      modern: { columnOrder: 'modern', shaftFluting: false, hasBase: false, hasCapital: false, material: 'concrete' },
    };
  }
}
