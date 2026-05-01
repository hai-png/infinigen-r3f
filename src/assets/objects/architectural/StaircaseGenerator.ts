/**
 * StaircaseGenerator - Procedural staircase generation
 * FIX: All elements are Mesh objects with proper MeshStandardMaterial
 * Added: railing with balusters
 */
import * as THREE from 'three';
import { Group, Mesh, BoxGeometry, CylinderGeometry, ExtrudeGeometry, MeshStandardMaterial } from 'three';
import { BaseObjectGenerator, BaseGeneratorConfig } from '../utils/BaseObjectGenerator';

export interface StaircaseParams extends BaseGeneratorConfig {
  totalHeight: number;
  totalRun: number;
  width: number;
  numSteps: number;
  stairType: 'straight' | 'L' | 'U' | 'spiral' | 'curved';
  hasLanding: boolean;
  landingPosition?: number;
  hasStringers: boolean;
  stringerType: 'closed' | 'open' | 'mono';
  hasRisers: boolean;
  treadThickness: number;
  riserThickness: number;
  style: 'modern' | 'traditional' | 'industrial' | 'rustic' | 'minimalist';
  treadMaterial: string;
  riserMaterial: string;
  stringerMaterial: string;
  hasRailing: boolean;
  railingHeight: number;
}

const DEFAULT_PARAMS: StaircaseParams = {
  totalHeight: 3.0,
  totalRun: 4.0,
  width: 1.2,
  numSteps: 14,
  stairType: 'straight',
  hasLanding: false,
  hasStringers: true,
  stringerType: 'closed',
  hasRisers: true,
  treadThickness: 0.04,
  riserThickness: 0.02,
  style: 'modern',
  treadMaterial: 'wood',
  riserMaterial: 'wood',
  stringerMaterial: 'wood',
  hasRailing: true,
  railingHeight: 0.9,
};

export class StaircaseGenerator extends BaseObjectGenerator<StaircaseParams> {
  constructor(seed?: number) {
    super(seed);
  }

  getDefaultConfig(): StaircaseParams {
    return { ...DEFAULT_PARAMS };
  }

  generate(params: Partial<StaircaseParams> = {}): Group {
    const finalParams = this.validateAndMerge(params);
    const group = new Group();

    const {
      totalHeight, totalRun, width, numSteps, stairType,
      hasRisers, treadThickness, riserThickness,
      hasStringers, stringerType, hasRailing, railingHeight,
    } = finalParams;

    const rise = totalHeight / numSteps;
    const run = totalRun / numSteps;
    const treadMat = this.getMaterial(finalParams.treadMaterial);
    const riserMat = this.getMaterial(finalParams.riserMaterial);
    const stringerMat = this.getMaterial(finalParams.stringerMaterial);

    switch (stairType) {
      case 'straight':
        this.generateStraightStairs(group, numSteps, rise, run, width, treadThickness, riserThickness, hasRisers, hasStringers, stringerType, treadMat, riserMat, stringerMat);
        break;
      case 'L':
        this.generateLStairs(group, numSteps, rise, run, width, treadThickness, riserThickness, hasRisers, treadMat, riserMat);
        break;
      case 'U':
        this.generateUStairs(group, numSteps, rise, run, width, treadThickness, riserThickness, hasRisers, treadMat, riserMat);
        break;
      case 'spiral':
        this.generateSpiralStairs(group, numSteps, rise, width, treadThickness, treadMat);
        break;
      case 'curved':
        this.generateCurvedStairs(group, numSteps, rise, run, width, treadThickness, treadMat);
        break;
    }

    // Add railing
    if (hasRailing) {
      this.addRailing(group, stairType, totalRun, width, totalHeight, railingHeight, numSteps, rise, run);
    }

    return group;
  }

  private getMaterial(materialType: string): MeshStandardMaterial {
    const configs: Record<string, { color: number; roughness: number; metalness: number }> = {
      wood: { color: 0x8b6914, roughness: 0.65, metalness: 0.0 },
      oak: { color: 0x8b6914, roughness: 0.6, metalness: 0.0 },
      steel: { color: 0x888888, roughness: 0.3, metalness: 0.8 },
      metal: { color: 0x666666, roughness: 0.4, metalness: 0.7 },
      glass: { color: 0x88ccff, roughness: 0.1, metalness: 0.1 },
      concrete: { color: 0x999999, roughness: 0.9, metalness: 0.0 },
      reclaimed_wood: { color: 0x6b4423, roughness: 0.85, metalness: 0.0 },
    };
    const config = configs[materialType] || configs.wood;
    return new MeshStandardMaterial({
      color: config.color,
      roughness: config.roughness,
      metalness: config.metalness,
      transparent: materialType === 'glass',
      opacity: materialType === 'glass' ? 0.3 : 1.0,
    });
  }

  private generateStraightStairs(
    group: Group, numSteps: number, rise: number, run: number, width: number,
    treadThickness: number, riserThickness: number, hasRisers: boolean,
    hasStringers: boolean, stringerType: string,
    treadMat: MeshStandardMaterial, riserMat: MeshStandardMaterial, stringerMat: MeshStandardMaterial
  ): void {
    for (let i = 0; i < numSteps; i++) {
      const y = i * rise;
      const x = i * run;

      // Tread
      const treadGeom = new BoxGeometry(run + 0.02, treadThickness, width);
      const tread = new Mesh(treadGeom, treadMat);
      tread.position.set(x + run / 2, y + treadThickness / 2, 0);
      tread.castShadow = true;
      tread.receiveShadow = true;
      tread.name = `tread_${i}`;
      group.add(tread);

      // Riser
      if (hasRisers && i < numSteps - 1) {
        const riserGeom = new BoxGeometry(riserThickness, rise, width);
        const riser = new Mesh(riserGeom, riserMat);
        riser.position.set(x + run / 2, y + treadThickness + rise / 2, 0);
        riser.castShadow = true;
        riser.name = `riser_${i}`;
        group.add(riser);
      }
    }

    // Stringers
    if (hasStringers) {
      const totalRise = numSteps * rise;
      const totalRunLen = numSteps * run;
      const stringerLength = Math.sqrt(totalRise * totalRise + totalRunLen * totalRunLen);
      const angle = Math.atan2(totalRise, totalRunLen);

      if (stringerType === 'closed') {
        for (const zSide of [-1, 1]) {
          const stringerGeom = new BoxGeometry(totalRunLen, 0.03, width + 0.1);
          const stringer = new Mesh(stringerGeom, stringerMat);
          stringer.position.set(totalRunLen / 2, totalRise / 2, zSide * (width / 2 + 0.05));
          stringer.rotation.z = -angle;
          stringer.name = `stringer_${zSide === -1 ? 'left' : 'right'}`;
          group.add(stringer);
        }
      } else if (stringerType === 'mono') {
        const stringerGeom = new BoxGeometry(totalRunLen, 0.15, 0.1);
        const stringer = new Mesh(stringerGeom, stringerMat);
        stringer.position.set(totalRunLen / 2, totalRise / 2, 0);
        stringer.rotation.z = -angle;
        stringer.name = 'mono_stringer';
        group.add(stringer);
      }
    }
  }

  private generateLStairs(
    group: Group, numSteps: number, rise: number, run: number, width: number,
    treadThickness: number, riserThickness: number, hasRisers: boolean,
    treadMat: MeshStandardMaterial, riserMat: MeshStandardMaterial
  ): void {
    const firstFlightSteps = Math.floor(numSteps / 2);
    const landingSize = width;

    // First flight
    for (let i = 0; i < firstFlightSteps; i++) {
      const y = i * rise;
      const x = i * run;
      const tread = new Mesh(new BoxGeometry(run + 0.02, treadThickness, width), treadMat);
      tread.position.set(x + run / 2, y + treadThickness / 2, 0);
      tread.castShadow = true;
      group.add(tread);
    }

    // Landing
    const landingY = firstFlightSteps * rise;
    const landingX = firstFlightSteps * run;
    const landing = new Mesh(new BoxGeometry(landingSize, treadThickness, landingSize), treadMat);
    landing.position.set(landingX + landingSize / 2, landingY + treadThickness / 2, 0);
    landing.castShadow = true;
    landing.name = 'landing';
    group.add(landing);

    // Second flight
    const secondFlightSteps = numSteps - firstFlightSteps;
    for (let i = 0; i < secondFlightSteps; i++) {
      const y = landingY + (i + 1) * rise;
      const tread = new Mesh(new BoxGeometry(run + 0.02, treadThickness, width), treadMat);
      tread.position.set(landingX + landingSize / 2, y + treadThickness / 2, landingSize / 2 - width / 2 + i * run);
      tread.rotation.y = -Math.PI / 2;
      tread.castShadow = true;
      group.add(tread);
    }
  }

  private generateUStairs(
    group: Group, numSteps: number, rise: number, run: number, width: number,
    treadThickness: number, riserThickness: number, hasRisers: boolean,
    treadMat: MeshStandardMaterial, riserMat: MeshStandardMaterial
  ): void {
    const firstFlightSteps = Math.floor(numSteps / 2);
    const landingWidth = width * 2;

    // First flight
    for (let i = 0; i < firstFlightSteps; i++) {
      const tread = new Mesh(new BoxGeometry(run + 0.02, treadThickness, width), treadMat);
      tread.position.set(i * run + run / 2, i * rise + treadThickness / 2, -width / 2);
      tread.castShadow = true;
      group.add(tread);
    }

    // Landing
    const landingY = firstFlightSteps * rise;
    const landing = new Mesh(new BoxGeometry(landingWidth, treadThickness, width), treadMat);
    landing.position.set(firstFlightSteps * run + landingWidth / 2, landingY + treadThickness / 2, 0);
    landing.castShadow = true;
    landing.name = 'landing';
    group.add(landing);

    // Second flight
    const secondFlightSteps = numSteps - firstFlightSteps;
    for (let i = 0; i < secondFlightSteps; i++) {
      const tread = new Mesh(new BoxGeometry(run + 0.02, treadThickness, width), treadMat);
      tread.position.set(firstFlightSteps * run + landingWidth - i * run - run / 2, landingY + (i + 1) * rise + treadThickness / 2, width / 2);
      tread.castShadow = true;
      group.add(tread);
    }
  }

  private generateSpiralStairs(
    group: Group, numSteps: number, rise: number, diameter: number,
    treadThickness: number, treadMat: MeshStandardMaterial
  ): void {
    const radius = diameter / 2;
    const totalAngle = Math.PI * 1.5;
    const angleStep = totalAngle / numSteps;

    // Central pole
    const poleMat = this.getMaterial('steel');
    const poleGeom = new CylinderGeometry(0.05, 0.05, numSteps * rise, 16);
    const pole = new Mesh(poleGeom, poleMat);
    pole.position.set(0, numSteps * rise / 2, 0);
    pole.name = 'centralPole';
    group.add(pole);

    // Treads
    for (let i = 0; i < numSteps; i++) {
      const angle = i * angleStep;
      const y = i * rise;

      const shape = new THREE.Shape();
      shape.moveTo(Math.cos(angle) * 0.1, Math.sin(angle) * 0.1);
      shape.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
      shape.lineTo(Math.cos(angle + angleStep * 0.8) * radius, Math.sin(angle + angleStep * 0.8) * radius);
      shape.lineTo(Math.cos(angle + angleStep * 0.8) * 0.1, Math.sin(angle + angleStep * 0.8) * 0.1);
      shape.closePath();

      const extrudeSettings = { depth: treadThickness, bevelEnabled: false };
      const geom = new ExtrudeGeometry(shape, extrudeSettings);
      const tread = new Mesh(geom, treadMat);
      tread.position.set(0, y, 0);
      tread.rotation.x = -Math.PI / 2;
      tread.castShadow = true;
      tread.name = `tread_${i}`;
      group.add(tread);
    }
  }

  private generateCurvedStairs(
    group: Group, numSteps: number, rise: number, run: number, width: number,
    treadThickness: number, treadMat: MeshStandardMaterial
  ): void {
    const totalAngle = Math.PI / 2;
    const angleStep = totalAngle / numSteps;
    const radius = (run * numSteps) / totalAngle;

    for (let i = 0; i < numSteps; i++) {
      const angle = i * angleStep;
      const y = i * rise;
      const innerRadius = radius - width;

      const shape = new THREE.Shape();
      shape.moveTo(Math.cos(angle) * innerRadius, Math.sin(angle) * innerRadius);
      shape.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
      shape.lineTo(Math.cos(angle + angleStep) * radius, Math.sin(angle + angleStep) * radius);
      shape.lineTo(Math.cos(angle + angleStep) * innerRadius, Math.sin(angle + angleStep) * innerRadius);
      shape.closePath();

      const extrudeSettings = { depth: treadThickness, bevelEnabled: false };
      const geom = new ExtrudeGeometry(shape, extrudeSettings);
      const tread = new Mesh(geom, treadMat);
      tread.position.set(0, y, 0);
      tread.rotation.x = -Math.PI / 2;
      tread.castShadow = true;
      group.add(tread);
    }
  }

  private addRailing(
    group: Group, stairType: string, totalRun: number, width: number,
    totalHeight: number, railingHeight: number, numSteps: number,
    rise: number, run: number
  ): void {
    const railMat = this.getMaterial('steel');
    const balusterMat = this.getMaterial('steel');

    if (stairType === 'straight') {
      // Balusters at each step
      for (let i = 0; i <= numSteps; i++) {
        const y = i * rise;
        const x = i * run;
        const balusterGeo = new CylinderGeometry(0.015, 0.015, railingHeight, 8);
        const baluster = new Mesh(balusterGeo, balusterMat);
        baluster.position.set(x, y + railingHeight / 2, -width / 2);
        group.add(baluster);
      }

      // Top handrail
      const railLength = Math.sqrt(totalRun * totalRun + totalHeight * totalHeight);
      const railAngle = Math.atan2(totalHeight, totalRun);
      const railGeo = new CylinderGeometry(0.025, 0.025, railLength, 8);
      const rail = new Mesh(railGeo, railMat);
      rail.position.set(totalRun / 2, totalHeight / 2 + railingHeight, -width / 2);
      rail.rotation.z = Math.PI / 2 - railAngle;
      rail.name = 'handrail';
      group.add(rail);

      // Other side
      for (let i = 0; i <= numSteps; i++) {
        const balusterGeo = new CylinderGeometry(0.015, 0.015, railingHeight, 8);
        const baluster = new Mesh(balusterGeo, balusterMat);
        baluster.position.set(i * run, i * rise + railingHeight / 2, width / 2);
        group.add(baluster);
      }
      const rail2 = new Mesh(new CylinderGeometry(0.025, 0.025, railLength, 8), railMat);
      rail2.position.set(totalRun / 2, totalHeight / 2 + railingHeight, width / 2);
      rail2.rotation.z = Math.PI / 2 - railAngle;
      group.add(rail2);
    }
  }

  getStylePresets(): Record<string, Partial<StaircaseParams>> {
    return {
      modern: { style: 'modern', stringerType: 'mono', hasRisers: false, treadMaterial: 'glass', stringerMaterial: 'steel' },
      traditional: { style: 'traditional', stringerType: 'closed', hasRisers: true, treadMaterial: 'oak', riserMaterial: 'oak', stringerMaterial: 'oak' },
      industrial: { style: 'industrial', stringerType: 'open', hasRisers: false, treadMaterial: 'metal', stringerMaterial: 'steel' },
      rustic: { style: 'rustic', stringerType: 'closed', hasRisers: true, treadMaterial: 'reclaimed_wood', stringerMaterial: 'reclaimed_wood' },
      minimalist: { style: 'minimalist', stringerType: 'mono', hasRisers: false, treadThickness: 0.03, treadMaterial: 'concrete' },
    };
  }
}
