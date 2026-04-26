/**
 * BalconyGenerator - Procedural balcony generation
 */
import { Group, Mesh, BoxGeometry, CylinderGeometry } from 'three';
import { BaseObjectGenerator } from '../utils/BaseObjectGenerator';

export interface BalconyParams {
  width: number;
  depth: number;
  railingHeight: number;
  balconyType: 'cantilever' | 'supported' | 'juliet' | 'wrap_around';
  supportType: 'bracket' | 'column' | 'cable';
  railingStyle: 'glass' | 'metal' | 'wood' | 'wrought_iron';
  postSpacing: number;
  floorMaterial: string;
  railingMaterial: string;
}

const DEFAULT_PARAMS: BalconyParams = {
  width: 3.0,
  depth: 1.5,
  railingHeight: 1.0,
  balconyType: 'cantilever',
  supportType: 'bracket',
  railingStyle: 'metal',
  postSpacing: 0.15,
  floorMaterial: 'wood',
  railingMaterial: 'steel',
};

export class BalconyGenerator extends BaseObjectGenerator<BalconyParams> {
  constructor(seed?: number) {
    super('Balcony', seed);
  }

  getDefaultParams(): BalconyParams {
    return { ...DEFAULT_PARAMS };
  }

  generate(params: Partial<BalconyParams> = {}): Group {
    const finalParams = this.validateAndMerge(params);
    const group = new Group();
    const { width, depth, railingHeight, balconyType, supportType, railingStyle, postSpacing } = finalParams;

    // Floor platform
    const floorGeom = new BoxGeometry(width, 0.1, depth);
    const floor = new Mesh(floorGeom);
    floor.position.set(0, 0.05, 0);
    floor.castShadow = true;
    floor.receiveShadow = true;
    group.add(floor);

    // Supports
    if (balconyType === 'supported' && supportType === 'column') {
      const columnGeom = new CylinderGeometry(0.08, 0.08, 0.05, 16);
      const leftColumn = new Mesh(columnGeom);
      leftColumn.position.set(-width / 2 + 0.1, 0.025, -depth / 2 + 0.1);
      group.add(leftColumn);

      const rightColumn = new Mesh(columnGeom);
      rightColumn.position.set(width / 2 - 0.1, 0.025, -depth / 2 + 0.1);
      group.add(rightColumn);
    } else if (supportType === 'bracket') {
      const bracketGeom = new BoxGeometry(0.1, 0.15, depth);
      const leftBracket = new Mesh(bracketGeom);
      leftBracket.position.set(-width / 2 + 0.1, -0.075, 0);
      group.add(leftBracket);

      const rightBracket = new Mesh(bracketGeom);
      rightBracket.position.set(width / 2 - 0.1, -0.075, 0);
      group.add(rightBracket);
    }

    // Railing posts
    const numPosts = Math.floor(width / postSpacing) + 1;
    for (let i = 0; i < numPosts; i++) {
      const x = -width / 2 + i * postSpacing;
      const postGeom = new CylinderGeometry(0.03, 0.03, railingHeight, 8);
      const post = new Mesh(postGeom);
      post.position.set(x, 0.05 + railingHeight / 2, depth / 2);
      group.add(post);
    }

    // Top rail
    const railGeom = new CylinderGeometry(0.04, 0.04, width, 16);
    const topRail = new Mesh(railGeom);
    topRail.rotation.z = Math.PI / 2;
    topRail.position.set(0, 0.05 + railingHeight, depth / 2);
    group.add(topRail);

    return group;
  }

  getStylePresets(): Record<string, Partial<BalconyParams>> {
    return {
      modern: { balconyType: 'cantilever', railingStyle: 'glass', floorMaterial: 'concrete' },
      traditional: { balconyType: 'supported', railingStyle: 'wrought_iron', supportType: 'column' },
      rustic: { balconyType: 'supported', railingStyle: 'wood', supportType: 'bracket' },
      juliet: { balconyType: 'juliet', depth: 0.3, railingStyle: 'wrought_iron' },
    };
  }
}
