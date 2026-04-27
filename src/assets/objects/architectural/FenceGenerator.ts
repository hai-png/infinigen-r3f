/**
 * FenceGenerator - Procedural fence generation
 */
import { Group, Mesh, BoxGeometry, CylinderGeometry } from 'three';
import { BaseObjectGenerator, BaseGeneratorConfig } from '../utils/BaseObjectGenerator';

export interface FenceParams extends BaseGeneratorConfig {
  length: number;
  height: number;
  fenceType: 'picket' | 'privacy' | 'chain_link' | 'wrought_iron' | 'ranch';
  postSpacing: number;
  postWidth: number;
  picketWidth: number;
  picketSpacing: number;
  hasGate: boolean;
  gateWidth: number;
  material: string;
  style: 'traditional' | 'modern' | 'rustic' | 'farmhouse';
}

const DEFAULT_PARAMS: FenceParams = {
  length: 10.0,
  height: 1.8,
  fenceType: 'picket',
  postSpacing: 2.5,
  postWidth: 0.1,
  picketWidth: 0.1,
  picketSpacing: 0.08,
  hasGate: false,
  gateWidth: 1.2,
  material: 'wood',
  style: 'traditional',
};

export class FenceGenerator extends BaseObjectGenerator<FenceParams> {
  constructor(seed?: number) {
    super(seed);
  }

  getDefaultConfig(): FenceParams {
    return { ...DEFAULT_PARAMS };
  }

  generate(params: Partial<FenceParams> = {}): Group {
    const finalParams = this.validateAndMerge(params);
    const group = new Group();
    const { length, height, fenceType, postSpacing, postWidth, picketWidth, picketSpacing, hasGate, gateWidth } = finalParams;

    const numPosts = Math.floor(length / postSpacing) + 1;
    const actualLength = (numPosts - 1) * postSpacing;
    const gateStart = hasGate ? actualLength / 2 - gateWidth / 2 : actualLength;
    const gateEnd = hasGate ? actualLength / 2 + gateWidth / 2 : 0;

    // Posts
    for (let i = 0; i < numPosts; i++) {
      const x = -actualLength / 2 + i * postSpacing;
      
      // Skip posts at gate location
      if (hasGate && x > gateStart - postWidth && x < gateEnd + postWidth) continue;

      const postGeom = new BoxGeometry(postWidth, height, postWidth);
      const post = new Mesh(postGeom);
      post.position.set(x, height / 2, 0);
      post.castShadow = true;
      group.add(post);
    }

    // Rails or panels based on fence type
    if (fenceType === 'picket') {
      // Horizontal rails
      const railGeom = new BoxGeometry(actualLength, 0.05, 0.08);
      const topRail = new Mesh(railGeom);
      topRail.position.set(0, height - 0.1, 0);
      group.add(topRail);

      const bottomRail = new Mesh(railGeom);
      bottomRail.position.set(0, 0.15, 0);
      group.add(bottomRail);

      // Pickets
      const numPickets = Math.floor(actualLength / (picketWidth + picketSpacing));
      for (let i = 0; i < numPickets; i++) {
        const x = -actualLength / 2 + (i + 0.5) * (picketWidth + picketSpacing);
        
        // Skip pickets at gate
        if (hasGate && x > gateStart - picketWidth && x < gateEnd + picketWidth) continue;

        const picketGeom = new BoxGeometry(picketWidth, height - 0.2, 0.05);
        const picket = new Mesh(picketGeom);
        picket.position.set(x, height / 2 - 0.1, 0);
        picket.castShadow = true;
        group.add(picket);
      }
    } else if (fenceType === 'privacy') {
      const panelGeom = new BoxGeometry(postSpacing - 0.05, height - 0.1, 0.08);
      for (let i = 0; i < numPosts - 1; i++) {
        const x = -actualLength / 2 + (i + 0.5) * postSpacing;
        if (hasGate && x > gateStart - postSpacing / 2 && x < gateEnd + postSpacing / 2) continue;
        
        const panel = new Mesh(panelGeom);
        panel.position.set(x, height / 2 - 0.05, 0);
        panel.castShadow = true;
        group.add(panel);
      }
    }

    // Gate
    if (hasGate) {
      const gateGeom = new BoxGeometry(gateWidth, height - 0.1, 0.08);
      const gate = new Mesh(gateGeom);
      gate.position.set(0, height / 2 - 0.05, 0);
      gate.castShadow = true;
      group.add(gate);
    }

    return group;
  }

  getStylePresets(): Record<string, Partial<FenceParams>> {
    return {
      traditional: { fenceType: 'picket', material: 'wood', picketSpacing: 0.08 },
      modern: { fenceType: 'privacy', material: 'composite', height: 2.0 },
      rustic: { fenceType: 'ranch', material: 'wood', postSpacing: 3.0 },
      farmhouse: { fenceType: 'picket', material: 'white_painted_wood' },
    };
  }
}
