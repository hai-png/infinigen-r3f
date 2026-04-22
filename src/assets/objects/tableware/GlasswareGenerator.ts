/**
 * GlasswareGenerator - Procedural glassware generation (glasses, bottles)
 */

import { Group, Mesh, CylinderGeometry, SphereGeometry, TorusGeometry, Material } from 'three';
import { BaseObjectGenerator } from '../BaseObjectGenerator';
import { FixedSeed } from '../../../math/utils';

export interface GlasswareParams {
  type: 'wine' | 'beer' | 'water' | 'champagne' | 'whiskey' | 'cocktail' | 'bottle_wine' | 'bottle_beer' | 'bottle_spirit';
  style: 'elegant' | 'casual' | 'modern' | 'vintage';
  size: 'small' | 'medium' | 'large';
  material?: string;
  seed?: number;
}

export class GlasswareGenerator extends BaseObjectGenerator<GlasswareParams> {
  protected readonly defaultParams: GlasswareParams = {
    type: 'wine',
    style: 'elegant',
    size: 'medium',
    seed: undefined
  };

  generate(params: Partial<GlasswareParams> = {}): Group {
    const finalParams = { ...this.defaultParams, ...params };
    const seed = finalParams.seed ?? Math.floor(Math.random() * 1000000);
    
    using ctx = new FixedSeed(seed);
    
    const group = new Group();
    const mat = this.getMaterial(finalParams.material || 'clear_glass');
    
    let mesh: Mesh;
    
    if (finalParams.type.startsWith('bottle_')) {
      mesh = this.createBottle(finalParams);
    } else {
      mesh = this.createGlass(finalParams);
    }
    
    if (mesh) {
      group.add(mesh);
      const collision = this.createCollisionMesh(group);
      if (collision) {
        collision.name = 'collision';
        collision.userData.isCollision = true;
        group.add(collision);
      }
    }
    
    return group;
  }

  private createGlass(params: GlasswareParams): Mesh {
    const group = new Group();
    const mat = this.getMaterial(params.material || 'clear_glass');
    
    // Dimensions based on type and size
    const height = params.size === 'small' ? 0.08 : params.size === 'large' ? 0.15 : 0.12;
    const bowlHeight = height * 0.6;
    const stemHeight = height * 0.25;
    const baseHeight = height * 0.15;
    
    // Bowl
    const bowlTopRadius = params.type === 'champagne' ? 0.03 : params.type === 'cocktail' ? 0.06 : 0.04;
    const bowlBottomRadius = params.type === 'wine' ? 0.035 : 0.025;
    const bowlGeom = new CylinderGeometry(bowlBottomRadius, bowlTopRadius, bowlHeight, 16);
    const bowl = new Mesh(bowlGeom, mat);
    bowl.position.y = stemHeight + baseHeight + bowlHeight / 2;
    group.add(bowl);
    
    // Stem
    if (params.type !== 'beer' && params.type !== 'water') {
      const stemRadius = 0.005;
      const stemGeom = new CylinderGeometry(stemRadius, stemRadius, stemHeight, 8);
      const stem = new Mesh(stemGeom, mat);
      stem.position.y = baseHeight + stemHeight / 2;
      group.add(stem);
    }
    
    // Base
    const baseRadius = params.type === 'cocktail' ? 0.04 : 0.035;
    const baseGeom = new CylinderGeometry(baseRadius, baseRadius * 0.9, baseHeight, 16);
    const base = new Mesh(baseGeom, mat);
    base.position.y = baseHeight / 2;
    group.add(base);
    
    return this.mergeGroupToMesh(group, mat);
  }

  private createBottle(params: GlasswareParams): Mesh {
    const group = new Group();
    const mat = this.getMaterial(params.material || 'green_glass');
    
    const isWine = params.type === 'bottle_wine';
    const isBeer = params.type === 'bottle_beer';
    
    // Body
    const bodyHeight = isWine ? 0.25 : isBeer ? 0.2 : 0.22;
    const bodyRadius = isWine ? 0.04 : isBeer ? 0.035 : 0.038;
    const bodyGeom = new CylinderGeometry(bodyRadius * 0.95, bodyRadius, bodyHeight, 16);
    const body = new Mesh(bodyGeom, mat);
    body.position.y = bodyHeight / 2;
    group.add(body);
    
    // Shoulder
    const shoulderHeight = 0.04;
    const shoulderGeom = new CylinderGeometry(bodyRadius * 0.4, bodyRadius * 0.95, shoulderHeight, 16);
    const shoulder = new Mesh(shoulderGeom, mat);
    shoulder.position.y = bodyHeight + shoulderHeight / 2;
    group.add(shoulder);
    
    // Neck
    const neckHeight = isWine ? 0.06 : 0.05;
    const neckRadius = bodyRadius * 0.35;
    const neckGeom = new CylinderGeometry(neckRadius, neckRadius * 1.1, neckHeight, 12);
    const neck = new Mesh(neckGeom, mat);
    neck.position.y = bodyHeight + shoulderHeight + neckHeight / 2;
    group.add(neck);
    
    // Lip
    const lipGeom = new TorusGeometry(neckRadius * 1.1, 0.003, 8, 16);
    const lip = new Mesh(lipGeom, mat);
    lip.rotation.x = Math.PI / 2;
    lip.position.y = bodyHeight + shoulderHeight + neckHeight;
    group.add(lip);
    
    return this.mergeGroupToMesh(group, mat);
  }

  private mergeGroupToMesh(group: Group, mat: Material): Mesh {
    const bbox = new THREE.Box3().setFromObject(group);
    const size = new THREE.Vector3();
    bbox.getSize(size);
    const geom = new THREE.BoxGeometry(size.x, size.y, size.z);
    return new Mesh(geom, mat);
  }

  getVariations(): GlasswareParams[] {
    const types: GlasswareParams['type'][] = ['wine', 'beer', 'water', 'champagne', 'whiskey', 'cocktail', 'bottle_wine', 'bottle_beer'];
    const styles: GlasswareParams['style'][] = ['elegant', 'casual', 'modern', 'vintage'];
    const sizes: GlasswareParams['size'][] = ['small', 'medium', 'large'];
    
    return types.map((type, i) => ({
      type,
      style: styles[i % 4],
      size: sizes[i % 3],
      seed: i * 1000
    }));
  }
}

import * as THREE from 'three';
