/**
 * FernGenerator - Procedural fern species for outdoor scenes
 */
import { Group, BufferGeometry, Material, Color, Vector3, Matrix4 } from 'three';
import { BaseObjectGenerator } from '../../objects/BaseObjectGenerator';
import { Noise3D } from '../../../math/noise';

export interface FernParameters {
  species: 'boston' | 'maidenhair' | 'birdsnest' | 'staghorn' | 'mixed';
  frondLength: number;
  frondCount: number;
  curliness: number;
  color: Color;
  density: number;
  windIntensity: number;
  lodDistance: [number, number, number, number];
}

const DEFAULT_FERN_PARAMS: FernParameters = {
  species: 'mixed',
  frondLength: 0.4,
  frondCount: 12,
  curliness: 0.5,
  color: new Color(0x2d5a1e),
  density: 50,
  windIntensity: 0.6,
  lodDistance: [0, 8, 20, 40],
};

export class FernGenerator extends BaseObjectGenerator<FernParameters> {
  protected readonly defaultParams = DEFAULT_FERN_PARAMS;
  protected readonly paramName = 'FernGenerator';
  private noise = new Noise3D();

  generate(params: Partial<FernParameters> = {}): Group {
    const finalParams = this.validateParameters(params);
    const group = new Group();
    
    // Generate multiple fern plants
    const numPlants = Math.floor(finalParams.density * this.area * 0.01);
    
    for (let i = 0; i < numPlants; i++) {
      const fern = this.createFern(finalParams);
      const x = (Math.random() - 0.5) * this.bounds.x;
      const z = (Math.random() - 0.5) * this.bounds.z;
      fern.position.set(x, 0, z);
      fern.rotation.y = Math.random() * Math.PI * 2;
      group.add(fern);
    }
    
    return group;
  }

  private createFern(params: FernParameters): Group {
    const fern = new Group();
    const species = params.species === 'mixed' 
      ? ['boston', 'maidenhair', 'birdsnest', 'staghorn'][Math.floor(Math.random() * 4)]
      : params.species;
    
    // Create central stem
    const stemHeight = params.frondLength * 0.3;
    const stemGeom = new THREE.CylinderGeometry(0.005, 0.008, stemHeight, 6);
    const stemMat = new THREE.MeshStandardMaterial({ color: new Color(0x1a3d12) });
    const stem = new THREE.Mesh(stemGeom, stemMat);
    stem.position.y = stemHeight / 2;
    fern.add(stem);
    
    // Create fronds
    const numFronds = params.frondCount;
    for (let i = 0; i < numFronds; i++) {
      const frond = this.createFrond(params, species, i / numFronds);
      const angle = (i / numFronds) * Math.PI * 2;
      const radius = 0.02 + Math.random() * 0.03;
      frond.position.set(Math.cos(angle) * radius, stemHeight * 0.7, Math.sin(angle) * radius);
      frond.rotation.y = -angle;
      frond.rotation.x = -0.5 - Math.random() * 0.3;
      fern.add(frond);
    }
    
    return fern;
  }

  private createFrond(params: FernParameters, species: string, t: number): Group {
    const frond = new Group();
    const length = params.frondLength * (0.7 + Math.random() * 0.3);
    const segments = 8;
    
    // Create rachis (central stem of frond)
    const points: Vector3[] = [];
    for (let i = 0; i <= segments; i++) {
      const ft = i / segments;
      const curl = params.curliness * Math.sin(ft * Math.PI) * 0.2;
      points.push(new Vector3(curl, ft * length, 0));
    }
    
    const curve = new THREE.CatmullRomCurve3(points);
    const tubeGeom = new THREE.TubeGeometry(curve, segments, 0.003, 4, false);
    const mat = new THREE.MeshStandardMaterial({ color: params.color });
    const rachis = new THREE.Mesh(tubeGeom, mat);
    frond.add(rachis);
    
    // Create pinnae (leaflets)
    const pinnaePerSide = 6;
    for (let i = 1; i < pinnaePerSide; i++) {
      const ft = i / pinnaePerSide;
      const pos = curve.getPoint(ft);
      const tangent = curve.getTangent(ft);
      
      // Left pinna
      const leftPinna = this.createPinna(params, length * 0.3 * (1 - ft * 0.5));
      leftPinna.position.copy(pos);
      leftPinna.rotation.z = Math.PI / 3;
      frond.add(leftPinna);
      
      // Right pinna
      const rightPinna = this.createPinna(params, length * 0.3 * (1 - ft * 0.5));
      rightPinna.position.copy(pos);
      rightPinna.rotation.z = -Math.PI / 3;
      rightPinna.scale.x = -1;
      frond.add(rightPinna);
    }
    
    return frond;
  }

  private createPinna(params: FernParameters, length: number): THREE.Mesh {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.quadraticCurveTo(length * 0.3, length * 0.5, 0, length);
    shape.quadraticCurveTo(-length * 0.3, length * 0.5, 0, 0);
    
    const geom = new THREE.ShapeGeometry(shape);
    const mat = new THREE.MeshStandardMaterial({ 
      color: params.color, 
      side: THREE.DoubleSide 
    });
    return new THREE.Mesh(geom, mat);
  }

  protected validateParameters(params: Partial<FernParameters>): FernParameters {
    return {
      ...DEFAULT_FERN_PARAMS,
      ...params,
      color: params.color?.clone() || DEFAULT_FERN_PARAMS.color,
    };
  }

  getRandomParameters(): FernParameters {
    const speciesList = ['boston', 'maidenhair', 'birdsnest', 'staghorn'];
    return {
      species: speciesList[Math.floor(Math.random() * speciesList.length)] as any,
      frondLength: 0.2 + Math.random() * 0.5,
      frondCount: 8 + Math.floor(Math.random() * 12),
      curliness: Math.random() * 0.8,
      color: new Color().setHSL(0.25 + Math.random() * 0.1, 0.6, 0.25 + Math.random() * 0.15),
      density: 30 + Math.random() * 80,
      windIntensity: 0.4 + Math.random() * 0.5,
      lodDistance: [0, 6, 15, 30],
    };
  }
}
